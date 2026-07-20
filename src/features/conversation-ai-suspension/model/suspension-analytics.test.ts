import { describe, expect, it, vi } from 'vitest'
import { reportSuspensionEvent } from './suspension-analytics'

describe('безопасная статистика приостановок AI', () => {
  it('передаёт только разрешённые поля без комментария и текста сообщения', () => {
    const listener = vi.fn()
    window.addEventListener('lola:analytics', listener)

    reportSuspensionEvent('conversation_ai_suspension_started', {
      duration_bucket: '1h',
      reason: 'OPERATOR_TAKEOVER',
      source: 'conversation_banner',
      note: 'секрет' as never,
      message_text: 'личные данные' as never,
    })

    expect(listener).toHaveBeenCalledOnce()
    expect((listener.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
      name: 'conversation_ai_suspension_started',
      payload: { duration_bucket: '1h', reason: 'OPERATOR_TAKEOVER', source: 'conversation_banner' },
    })
    window.removeEventListener('lola:analytics', listener)
  })
})
