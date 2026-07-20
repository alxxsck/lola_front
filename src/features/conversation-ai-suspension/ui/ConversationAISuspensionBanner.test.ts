import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import ConversationAISuspensionBanner from './ConversationAISuspensionBanner.vue'

const entry = {
  summary: {
    mode: 'SUSPENDED' as const,
    lifecycle: 'ACTIVE' as const,
    version: '4',
    suspendedUntil: '2026-07-20T14:00:00.000Z',
    serverTime: '2026-07-20T13:00:00.000Z',
  },
  detail: {
    mode: 'SUSPENDED' as const,
    lifecycle: 'ACTIVE' as const,
    version: '4',
    suspendedUntil: '2026-07-20T14:00:00.000Z',
    serverTime: '2026-07-20T13:00:00.000Z',
    startedAt: '2026-07-20T13:00:00.000Z',
    startedBy: { id: 'admin-1', displayName: 'Алексей' },
    reason: 'OPERATOR_TAKEOVER' as const,
    note: 'Проверить возврат',
    resumedAt: null,
    resumedBy: null,
  },
  endUserId: 'user-1',
  loading: false,
  mutating: null,
  error: null,
  locallyExpired: false,
  cancellationRequested: true,
  serverOffsetMs: 0,
}

describe('панель приостановки AI', () => {
  it('показывает точный срок, причину, автора и действия владельцу', () => {
    vi.setSystemTime('2026-07-20T13:18:00.000Z')
    const wrapper = mount(ConversationAISuspensionBanner, {
      props: { entry, canManage: true, conversationOpen: true },
      global: { stubs: { Button: { props: ['label'], template: '<button>{{ label }}</button>' } } },
    })

    expect(wrapper.text()).toContain('AI приостановлен в этом диалоге')
    expect(wrapper.text()).toContain('осталось 42 мин')
    expect(wrapper.text()).toContain('Причина: оператор отвечает пользователю')
    expect(wrapper.text()).toContain('включил Алексей')
    expect(wrapper.text()).toContain('Проверить возврат')
    expect(wrapper.text()).toContain('Завершаем уже начатый ответ AI')
    expect(wrapper.text()).toContain('Продлить')
    expect(wrapper.text()).toContain('Возобновить AI')
  })

  it('скрывает управляющие действия и внутренние сведения для роли только для чтения', () => {
    vi.setSystemTime('2026-07-20T13:18:00.000Z')
    const wrapper = mount(ConversationAISuspensionBanner, {
      props: { entry: { ...entry, detail: { ...entry.detail, note: null, startedBy: null } }, canManage: false, conversationOpen: true },
      global: { stubs: { Button: { props: ['label'], template: '<button>{{ label }}</button>' } } },
    })

    expect(wrapper.text()).toContain('Управлять могут владелец и администратор')
    expect(wrapper.text()).not.toContain('Продлить')
    expect(wrapper.text()).not.toContain('Возобновить AI')
  })

  it('не заставляет помощник экрана объявлять каждую секунду обратного отсчёта', async () => {
    vi.useFakeTimers()
    vi.setSystemTime('2026-07-20T13:59:30.000Z')
    const wrapper = mount(ConversationAISuspensionBanner, {
      props: { entry, canManage: true, conversationOpen: true },
      global: { stubs: { Button: { props: ['label'], template: '<button>{{ label }}</button>' } } },
    })
    const initialAnnouncement = wrapper.get('[aria-live="polite"]').text()

    vi.advanceTimersByTime(1_000)
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('осталось 29 сек.')
    expect(wrapper.get('[aria-live="polite"]').text()).toBe(initialAnnouncement)
    vi.useRealTimers()
  })
})
