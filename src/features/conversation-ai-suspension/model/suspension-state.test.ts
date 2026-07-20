import { describe, expect, it } from 'vitest'
import {
  compareSuspensionVersions,
  createServerClock,
  isConversationAISuspended,
  roundedDurationSeconds,
} from './suspension-state'

describe('состояние приостановки AI', () => {
  it('сравнивает версии без потери точности', () => {
    expect(compareSuspensionVersions('90071992547409930', '90071992547409929')).toBe(1)
    expect(compareSuspensionVersions('00042', '42')).toBe(0)
  })

  it('считает время по часам сервера при расхождении часов клиента', () => {
    const clock = createServerClock('2026-07-20T12:10:00.000Z', Date.parse('2026-07-20T12:00:00.000Z'))

    expect(clock.now(Date.parse('2026-07-20T12:02:00.000Z'))).toBe(Date.parse('2026-07-20T12:12:00.000Z'))
  })

  it('снимает активное отображение точно в момент окончания', () => {
    const summary = {
      mode: 'SUSPENDED' as const,
      lifecycle: 'ACTIVE' as const,
      version: '3',
      suspendedUntil: '2026-07-20T12:30:00.000Z',
      serverTime: '2026-07-20T12:00:00.000Z',
    }

    expect(isConversationAISuspended(summary, Date.parse('2026-07-20T12:29:59.999Z'))).toBe(true)
    expect(isConversationAISuspended(summary, Date.parse('2026-07-20T12:30:00.000Z'))).toBe(false)
    expect(isConversationAISuspended({ ...summary, suspendedUntil: 'не дата' }, Date.now())).toBe(false)
  })

  it('округляет выбранный срок вверх до полной минуты и соблюдает границы', () => {
    expect(roundedDurationSeconds(60_001)).toBe(120)
    expect(roundedDurationSeconds(60_000)).toBe(60)
    expect(() => roundedDurationSeconds(59_999)).toThrow('не меньше одной минуты')
    expect(() => roundedDurationSeconds(604_800_001)).toThrow('не больше семи дней')
  })
})
