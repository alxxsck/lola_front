import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockRepository } from './mock-repository'

describe('демонстрационное хранилище', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
  })

  it('повторяет составную отправку целиком без второго сообщения', async () => {
    const request = {
      text: 'Здравствуйте',
      conversationId: 'conv_1',
      interactionSessionId: 'sess_1',
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
      aiSuspension: { durationSeconds: 3_600, reason: 'OPERATOR_TAKEOVER' as const },
    }

    const firstPromise = mockRepository.sendAdminMessage('prj_lola_demo', 'usr_1', request)
    await vi.runAllTimersAsync()
    const first = await firstPromise
    const replayPromise = mockRepository.sendAdminMessage('prj_lola_demo', 'usr_1', request)
    await vi.runAllTimersAsync()
    const replay = await replayPromise
    const messagesPromise = mockRepository.getMessages('prj_lola_demo', 'usr_1', 'conv_1')
    await vi.runAllTimersAsync()
    const messages = await messagesPromise

    expect(replay).toMatchObject({
      duplicate: true,
      messageId: first.messageId,
      aiSuspension: { replayed: true },
    })
    expect(messages.items.filter((item) => item.id === first.messageId)).toHaveLength(1)
    vi.useRealTimers()
  })
})
