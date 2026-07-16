import { flushPromises, shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import EventLogsPage from './EventLogsPage.vue'

const log = {
  id: 'log-1', eventCode: 'deposit', eventName: 'Deposit', eventDefinitionId: 'event-1', eventVersion: 2,
  userId: 'user-1', userExternalId: 'customer-1', source: 'SERVER' as const, status: 'PROCESSED' as const,
  occurredAt: '2026-07-16T10:00:00.000Z', receivedAt: '2026-07-16T10:00:00.100Z', payload: { amount: 25 }, context: {},
}

function mountWithMessageSlots() {
  return shallowMount(EventLogsPage, { global: { stubs: { Message: { template: '<div class="message-stub"><slot /></div>' } } } })
}

function button(wrapper: ReturnType<typeof shallowMount>, label: string) {
  const value = wrapper.find(`button-stub[label="${label}"]`)
  if (!value.exists()) throw new Error(`Button ${label} not found`)
  return value
}

const mocks = vi.hoisted(() => ({
  role: 'OWNER' as 'OWNER' | 'VIEWER',
  getEvents: vi.fn(),
  getEventLogPage: vi.fn(),
  getEventLog: vi.fn(),
  replace: vi.fn(),
}))

vi.mock('@/features/auth/auth.store', () => ({
  useAuthStore: () => ({ project: { id: 'project-1' }, user: { role: mocks.role } }),
}))

vi.mock('@/shared/api/repository', () => ({
  repository: { getEvents: mocks.getEvents, getEventLogPage: mocks.getEventLogPage, getEventLog: mocks.getEventLog },
}))

vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))
vi.mock('vue-router', async (importOriginal) => ({
  ...await importOriginal<typeof import('vue-router')>(),
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: mocks.replace }),
}))

describe('EventLogsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.role = 'OWNER'
    mocks.getEvents.mockResolvedValue([])
    mocks.getEventLogPage.mockResolvedValue({ items: [], nextCursor: null })
    window.scrollTo = vi.fn()
  })

  it('loads the first snapshot page through the filtered CMS endpoint', async () => {
    shallowMount(EventLogsPage)
    await flushPromises()

    expect(mocks.getEventLogPage).toHaveBeenCalledWith('project-1', { limit: 25 })
    expect(mocks.getEvents).toHaveBeenCalledWith('project-1')
  })

  it('does not request sensitive logs for a viewer', async () => {
    mocks.role = 'VIEWER'
    const wrapper = shallowMount(EventLogsPage)
    await flushPromises()

    expect(mocks.getEventLogPage).not.toHaveBeenCalled()
    expect(wrapper.find('message-stub[severity="warn"]').exists()).toBe(true)
  })

  it('retries a failed refresh from page one and resets cursor history only after success', async () => {
    mocks.getEventLogPage
      .mockResolvedValueOnce({ items: [log], nextCursor: 'cursor-2' })
      .mockResolvedValueOnce({ items: [log], nextCursor: 'cursor-3' })
      .mockRejectedValueOnce(new Error('refresh failed'))
      .mockResolvedValueOnce({ items: [log], nextCursor: 'fresh-cursor' })
    const wrapper = mountWithMessageSlots()
    await flushPromises()

    await button(wrapper, 'Дальше').trigger('click')
    await flushPromises()
    await button(wrapper, 'Обновить').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('refresh failed')
    await button(wrapper, 'Повторить').trigger('click')
    await flushPromises()

    expect(mocks.getEventLogPage.mock.calls.slice(1)).toEqual([
      ['project-1', { limit: 25, cursor: 'cursor-2' }],
      ['project-1', { limit: 25 }],
      ['project-1', { limit: 25 }],
    ])
    expect(wrapper.text()).toContain('Страница 1')
  })

  it('retries the exact failed filter request and commits its URL state after success', async () => {
    mocks.getEventLogPage
      .mockResolvedValueOnce({ items: [], nextCursor: null })
      .mockRejectedValueOnce(new Error('filter failed'))
      .mockResolvedValueOnce({ items: [], nextCursor: null })
    const wrapper = mountWithMessageSlots()
    await flushPromises()

    const userInput = wrapper.findComponent('input-text-stub#user-filter') as unknown as { vm: { $emit: (event: string, value: string) => void } }
    userInput.vm.$emit('update:modelValue', ' customer-42 ')
    await button(wrapper, 'Применить').trigger('click')
    await flushPromises()
    await button(wrapper, 'Повторить').trigger('click')
    await flushPromises()

    expect(mocks.getEventLogPage.mock.calls.slice(1)).toEqual([
      ['project-1', { externalUserId: 'customer-42', limit: 25 }],
      ['project-1', { externalUserId: 'customer-42', limit: 25 }],
    ])
    expect(mocks.replace).toHaveBeenCalledWith({ query: { user: 'customer-42' } })
  })
})
