import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import UserAISuspensionIndicator from './UserAISuspensionIndicator.vue'

describe('признак приостановленных диалогов пользователя', () => {
  it('не добавляет шум при отсутствии приостановок', () => {
    const wrapper = mount(UserAISuspensionIndicator, { props: { summary: { activeConversationCount: 0, nearestSuspendedUntil: null, mostRecentlyStartedConversationId: null, serverTime: '2026-07-20T13:00:00.000Z' } } })
    expect(wrapper.html()).toBe('<!--v-if-->')
  })

  it('показывает количество и понятное название без опоры только на цвет', () => {
    vi.setSystemTime('2026-07-20T13:00:00.000Z')
    const wrapper = mount(UserAISuspensionIndicator, { props: { summary: { activeConversationCount: 5, nearestSuspendedUntil: '2026-07-20T14:00:00.000Z', mostRecentlyStartedConversationId: 'conversation-1', serverTime: '2026-07-20T13:00:00.000Z' } } })
    const indicator = wrapper.get('[aria-label]')
    expect(indicator.attributes('aria-label')).toBe('AI приостановлен в 5 диалогах')
    expect(indicator.text()).toContain('5')
    expect(indicator.attributes('title')).toContain('Ближайшее возобновление')
  })

  it('локально скрывает истёкший признак', async () => {
    vi.useFakeTimers()
    vi.setSystemTime('2026-07-20T13:00:00.000Z')
    const wrapper = mount(UserAISuspensionIndicator, { props: { summary: { activeConversationCount: 1, nearestSuspendedUntil: '2026-07-20T14:00:00.000Z', mostRecentlyStartedConversationId: 'conversation-1', serverTime: '2026-07-20T13:00:00.000Z' } } })
    vi.setSystemTime('2026-07-20T14:00:00.000Z')
    vi.advanceTimersByTime(1_000)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[aria-label]').exists()).toBe(false)
    expect(wrapper.emitted('expired')).toHaveLength(1)
    vi.useRealTimers()
  })

  it('скрывает неподтверждённый признак при некорректном времени сервера', () => {
    expect(() => mount(UserAISuspensionIndicator, {
      props: {
        summary: {
          activeConversationCount: 1,
          nearestSuspendedUntil: '2026-07-20T14:00:00.000Z',
          mostRecentlyStartedConversationId: 'conversation-1',
          serverTime: 'not-a-date',
        },
      },
    })).not.toThrow()

    const wrapper = mount(UserAISuspensionIndicator, {
      props: {
        summary: {
          activeConversationCount: 1,
          nearestSuspendedUntil: '2026-07-20T14:00:00.000Z',
          mostRecentlyStartedConversationId: 'conversation-1',
          serverTime: 'not-a-date',
        },
      },
    })
    expect(wrapper.find('[aria-label]').exists()).toBe(false)
  })
})
