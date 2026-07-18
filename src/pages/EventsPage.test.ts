import { flushPromises, shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { parseEventSchema } from '@/features/event-schema/model/event-schema'
import EventsPage from './EventsPage.vue'

const mocks = vi.hoisted(() => ({
  getEvents: vi.fn(),
  saveEvent: vi.fn(),
  getContract: vi.fn(),
  toast: vi.fn(),
  confirm: vi.fn(),
  guardDirty: null as { value: boolean } | null,
}))

vi.mock('@/features/auth/auth.store', () => ({
  useAuthStore: () => ({ project: { id: 'project-1' }, user: { role: 'OWNER' } }),
}))

vi.mock('@/shared/api/repository', () => ({
  repository: {
    mode: 'api',
    getEvents: mocks.getEvents,
    saveEvent: mocks.saveEvent,
    deleteEvent: vi.fn(),
  },
}))

vi.mock('@/shared/api/repository/scenario-authoring', () => ({
  scenarioAuthoringRepository: { getContract: mocks.getContract },
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require: (options: unknown) => mocks.confirm(options) }) }))
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: mocks.toast }) }))
vi.mock('@/shared/lib/use-unsaved-changes-guard', () => ({
  useUnsavedChangesGuard: (dirty: { value: boolean }) => {
    mocks.guardDirty = dirty
    return { confirmDiscard: () => true }
  },
}))

const existingEvent = {
  id: 'event-1',
  name: 'Успешный депозит',
  code: 'deposit.succeeded',
  description: 'Деньги зачислены',
  version: 2,
  enabled: true,
  clientIngestible: false,
  countsAsActivity: true,
  payloadSchema: { type: 'object', properties: { amount: { type: 'integer' } } },
}

function mountPage() {
  return shallowMount(EventsPage, {
    global: {
      stubs: {
        Dialog: {
          props: ['visible'],
          template: '<div v-if="visible"><slot /><slot name="footer" /></div>',
        },
        Message: { template: '<div><slot /></div>' },
      },
    },
  })
}

describe('EventsPage event editor journey', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getEvents.mockResolvedValue([existingEvent])
    mocks.getContract.mockResolvedValue({ revision: 'catalog-1', events: [] })
    mocks.saveEvent.mockResolvedValue(existingEvent)
  })

  it('guides creation through four business steps instead of one technical form', async () => {
    const wrapper = mountPage()
    await flushPromises()

    await wrapper.find('button-stub[label="Новое событие"]').trigger('click')

    expect(wrapper.findAll('.event-steps button strong').map((label) => label.text())).toEqual([
      'Смысл',
      'Данные',
      'Пример',
      'Изменения',
    ])
    expect(wrapper.find('button-stub[label="Далее"]').exists()).toBe(true)
    expect(wrapper.find('button-stub[label="Создать событие"]').exists()).toBe(false)
  })

  it('publishes an edited successor only after confirmation and keeps activity semantics', async () => {
    const wrapper = mountPage()
    await flushPromises()

    await wrapper.find('button-stub[aria-label="Изменить Успешный депозит"]').trigger('click')
    await wrapper.findAll('.event-steps button')[3]!.trigger('click')
    wrapper.getComponent({ name: 'EventPayloadStudio' }).vm.$emit('update:modelValue', parseEventSchema({
      type: 'object',
      properties: { amount: { type: 'integer', minimum: 1 } },
    }))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('button-stub[label="Создать новую версию"]').exists()).toBe(true)
    await wrapper.get('#event-form').trigger('submit')
    await flushPromises()

    expect(mocks.saveEvent).not.toHaveBeenCalled()
    const confirmation = mocks.confirm.mock.calls[0]?.[0] as { header: string; accept: () => void }
    expect(confirmation.header).toBe('Опубликовать новую версию события?')
    confirmation.accept()
    await flushPromises()

    expect(mocks.saveEvent).toHaveBeenCalledWith('project-1', expect.objectContaining({
      countsAsActivity: true,
      payloadSchema: { type: 'object', properties: { amount: { type: 'integer', minimum: 1 } } },
    }))
  })

  it('asks before leaving unapplied technical JSON changes', async () => {
    const wrapper = mountPage()
    await flushPromises()

    await wrapper.find('button-stub[aria-label="Изменить Успешный депозит"]').trigger('click')
    await wrapper.findAll('.event-steps button')[1]!.trigger('click')
    wrapper.getComponent({ name: 'EventPayloadStudio' }).vm.$emit('technical-draft-change', true)
    await wrapper.vm.$nextTick()
    expect(mocks.guardDirty?.value).toBe(true)
    await wrapper.findAll('.event-steps button')[2]!.trigger('click')

    expect(wrapper.find('.event-steps button.active strong').text()).toBe('Данные')
    const confirmation = mocks.confirm.mock.calls[0]?.[0] as { header: string; accept: () => void }
    expect(confirmation.header).toBe('Отменить изменения JSON?')
    confirmation.accept()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.event-steps button.active strong').text()).toBe('Пример')
  })

  it('allows editing the current revision when older revisions share its immutable code', async () => {
    mocks.getEvents.mockResolvedValue([
      existingEvent,
      { ...existingEvent, id: 'event-older', version: 1 },
    ])
    const wrapper = mountPage()
    await flushPromises()

    await wrapper.findAll('button-stub[aria-label="Изменить Успешный депозит"]')[0]!.trigger('click')
    await wrapper.findAll('.event-steps button')[3]!.trigger('click')
    await wrapper.get('#event-form').trigger('submit')
    await flushPromises()

    expect(mocks.saveEvent).toHaveBeenCalledWith('project-1', expect.objectContaining({ code: 'deposit.succeeded' }))
  })

  it('keeps the user on the meaning step until required business fields are complete', async () => {
    const wrapper = mountPage()
    await flushPromises()

    await wrapper.find('button-stub[label="Новое событие"]').trigger('click')
    await wrapper.find('button-stub[label="Далее"]').trigger('click')

    expect(wrapper.find('#event-name-error').text()).toContain('понятное название')
    expect(wrapper.find('.event-steps button.active strong').text()).toBe('Смысл')
    expect(mocks.saveEvent).not.toHaveBeenCalled()
  })

  it('shows loading and empty list states', async () => {
    mocks.getEvents.mockReturnValue(new Promise(() => {}))
    const loadingWrapper = mountPage()

    expect(loadingWrapper.findAll('.events-list .event-card')).toHaveLength(4)
    loadingWrapper.unmount()

    mocks.getEvents.mockResolvedValue([])
    const emptyWrapper = mountPage()
    await flushPromises()

    expect(emptyWrapper.get('.empty').text()).toContain('Каталог событий пока пуст')
  })

  it('shows an empty search result', async () => {
    const wrapper = mountPage()
    await flushPromises()

    wrapper.getComponent({ name: 'InputText' }).vm.$emit('update:modelValue', 'несуществующее событие')
    await wrapper.vm.$nextTick()

    expect(wrapper.get('.empty').text()).toContain('События не найдены')
  })

  it('shows a load error and retries successfully', async () => {
    mocks.getEvents.mockReset()
      .mockRejectedValueOnce(new Error('Сбой каталога'))
      .mockResolvedValue([])
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.text()).toContain('Сбой каталога')

    await wrapper.findAll('button-stub[label="Повторить"]')[0]!.trigger('click')
    await flushPromises()

    expect(mocks.getEvents).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).not.toContain('Сбой каталога')
  })

})
