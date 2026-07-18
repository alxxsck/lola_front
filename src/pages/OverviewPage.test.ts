import { flushPromises, shallowMount } from '@vue/test-utils'
import Button from 'primevue/button'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OverviewPage from './OverviewPage.vue'

const mocks = vi.hoisted(() => ({
  getStats: vi.fn(),
  getEventLogPage: vi.fn(),
}))

vi.mock('@/features/auth/auth.store', () => ({
  useAuthStore: () => ({
    project: { id: 'project-1', name: 'Lola', assistantName: 'Lola' },
    user: { name: 'Алексей', role: 'OWNER' },
  }),
}))

vi.mock('@/shared/api/repository', () => ({
  repository: {
    mode: 'api',
    capabilities: { presence: false },
    getStats: mocks.getStats,
    getEventLogPage: mocks.getEventLogPage,
  },
}))

function mountOverview() {
  return shallowMount(OverviewPage, {
    global: {
      stubs: {
        RouterLink: true,
        Message: { template: '<div><slot /></div>' },
      },
    },
  })
}

describe('OverviewPage activity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getStats.mockResolvedValue({ users: 1, online: 0, events: 1, scenarios: 0, conversations: 0, ctaConversion: 0, integrationErrors: 0 })
    mocks.getEventLogPage.mockResolvedValue({ items: [], nextCursor: null })
  })

  it('fills the project feed from the event log endpoint', async () => {
    const wrapper = mountOverview()
    await flushPromises()

    expect(mocks.getEventLogPage).toHaveBeenCalledWith('project-1', { limit: 6 })
    expect(wrapper.get('.section-link').attributes('to')).toBe('/event-logs')
  })

  it('shows the loading and empty activity states', async () => {
    const wrapper = mountOverview()

    expect(wrapper.findAll('.activity-skeleton')).toHaveLength(4)

    await flushPromises()

    expect(wrapper.get('.empty').text()).toContain('Активность появится после первых событий')
  })

  it('shows a load error and retries the dashboard request', async () => {
    mocks.getStats.mockReset()
      .mockRejectedValueOnce(new Error('Сбой обзора'))
      .mockResolvedValue({ users: 1, online: 0, events: 1, scenarios: 0, conversations: 0, ctaConversion: 0, integrationErrors: 0 })
    const wrapper = mountOverview()
    await flushPromises()

    expect(wrapper.text()).toContain('Сбой обзора')

    await wrapper.getComponent(Button).trigger('click')
    await flushPromises()

    expect(mocks.getStats).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).not.toContain('Сбой обзора')
  })
})
