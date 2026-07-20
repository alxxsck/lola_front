import { describe, expect, it } from 'vitest'
import { applySuspensionState, parseSuspensionRealtimeEvent } from './suspension-reducer'

const current = {
  summary: {
    mode: 'SUSPENDED' as const,
    lifecycle: 'ACTIVE' as const,
    version: '90071992547409930',
    suspendedUntil: '2026-07-20T14:00:00.000Z',
    serverTime: '2026-07-20T13:00:00.000Z',
  },
}

describe('сведение состояний приостановки AI', () => {
  it('игнорирует запоздалое событие и повтор текущей версии', () => {
    expect(applySuspensionState(current, { ...current.summary, version: '90071992547409929' })).toBe(current)
    expect(applySuspensionState(current, { ...current.summary })).toBe(current)
  })

  it('принимает более новую версию из другого окна', () => {
    expect(applySuspensionState(current, {
      ...current.summary,
      version: '90071992547409931',
      suspendedUntil: '2026-07-20T15:00:00.000Z',
    }).summary.suspendedUntil).toBe('2026-07-20T15:00:00.000Z')
  })

  it('проверяет форму события и не принимает комментарий через общий канал', () => {
    const event = parseSuspensionRealtimeEvent({
      eventId: 'event-1',
      eventName: 'conversation.ai_suspension.started.v1',
      projectId: 'project-1',
      sequence: '7',
      occurredAt: '2026-07-20T13:00:00.000Z',
      actorAdminId: 'admin-1',
      endUserId: 'user-1',
      conversationId: 'conversation-1',
      state: current.summary,
      note: 'секретный комментарий',
    })

    expect(event).toMatchObject({ eventId: 'event-1', conversationId: 'conversation-1' })
    expect(event && 'note' in event).toBe(false)
    expect(parseSuspensionRealtimeEvent({ ...event, sequence: 'не число' })).toBeNull()
  })
})
