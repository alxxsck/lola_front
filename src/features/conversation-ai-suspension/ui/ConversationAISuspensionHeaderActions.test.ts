import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ConversationAISuspensionHeaderActions from './ConversationAISuspensionHeaderActions.vue'

const entry = {
  summary: {
    mode: 'AUTOMATIC' as const,
    lifecycle: 'NONE' as const,
    version: '4',
    suspendedUntil: null,
    serverTime: '2026-07-20T13:00:00.000Z',
  },
  endUserId: 'user-1',
  loading: false,
  mutating: null,
  error: null,
  locallyExpired: false,
  cancellationRequested: false,
  serverOffsetMs: 0,
}

const global = {
  stubs: {
    Button: {
      props: ['label', 'disabled'],
      emits: ['click'],
      template: '<button :disabled="disabled" @click="$emit(\'click\')">{{ label }}</button>',
    },
    Tag: {
      props: ['value'],
      template: '<span>{{ value }}</span>',
    },
  },
}

describe('действия AI в заголовке диалога', () => {
  it('показывает компактные действия только для автоматического режима', async () => {
    const wrapper = mount(ConversationAISuspensionHeaderActions, {
      props: { entry, canManage: true, conversationOpen: true },
      global,
    })

    expect(wrapper.text()).toContain('AI активен · приостановить')
    expect(wrapper.find('[aria-label="История приостановок AI"]').exists()).toBe(true)
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('start')).toHaveLength(1)
  })

  it('скрывает историю, когда она перенесена в меню диалога', () => {
    const wrapper = mount(ConversationAISuspensionHeaderActions, {
      props: {
        entry,
        canManage: true,
        conversationOpen: true,
        showHistory: false,
      },
      global,
    })

    expect(wrapper.text()).toContain('AI активен · приостановить')
    expect(wrapper.find('[aria-label="История приостановок AI"]').exists()).toBe(false)
  })

  it('заменяет действие статусом, пока AI приостановлен', () => {
    const wrapper = mount(ConversationAISuspensionHeaderActions, {
      props: {
        entry: {
          ...entry,
          summary: {
            ...entry.summary,
            mode: 'SUSPENDED',
            lifecycle: 'ACTIVE',
            suspendedUntil: '2099-07-20T14:00:00.000Z',
          },
        },
        canManage: true,
        conversationOpen: true,
      },
      global,
    })

    expect(wrapper.text()).toBe('AI приостановлен')
  })

  it('сохраняет место управления в заголовке и предлагает retry при ошибке', async () => {
    const wrapper = mount(ConversationAISuspensionHeaderActions, {
      props: {
        entry: {
          ...entry,
          error: { kind: 'UNKNOWN' as const, message: 'Состояние недоступно' },
        },
        canManage: true,
        conversationOpen: true,
      },
      global,
    })

    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    const retry = wrapper.get('[aria-label="Повторить проверку состояния AI"]')
    await retry.trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })
})
