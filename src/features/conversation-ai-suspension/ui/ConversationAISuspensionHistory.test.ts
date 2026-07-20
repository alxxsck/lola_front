import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import ConversationAISuspensionHistory from './ConversationAISuspensionHistory.vue'

const mocks = vi.hoisted(() => ({ history: vi.fn() }))
vi.mock('@/shared/api/repository', () => ({ repository: { getConversationAISuspensionHistory: mocks.history } }))

describe('история приостановки AI', () => {
  it('показывает русские названия действий и не дублирует записи страниц', async () => {
    const item = {
      id: 'history-1', type: 'STARTED', version: '1', acceptedAt: '2026-07-20T13:00:00.000Z',
      actor: { id: 'admin-1', displayName: 'Алексей' }, correlationId: 'request-1',
      reason: 'OPERATOR_TAKEOVER', note: 'Проверка', newSuspendedUntil: '2026-07-20T14:00:00.000Z',
    }
    mocks.history.mockResolvedValue({ items: [item, item], nextCursor: null })
    const wrapper = mount(ConversationAISuspensionHistory, {
      props: { visible: true, projectId: 'project-1', endUserId: 'user-1', conversationId: 'conversation-1' },
      global: {
        stubs: {
          Dialog: { props: ['visible'], template: '<div v-if="visible"><slot /></div>' },
          Button: { props: ['label'], template: '<button>{{ label }}</button>' },
          Message: { template: '<div><slot /></div>' },
        },
      },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('AI приостановлен')
    expect(wrapper.text()).toContain('Алексей')
    expect(wrapper.text().match(/AI приостановлен/g)).toHaveLength(1)
  })
})
