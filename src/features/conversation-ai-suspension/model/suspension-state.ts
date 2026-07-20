import type { ConversationAISuspensionSummary } from '@/shared/types/domain'

export const MIN_SUSPENSION_SECONDS = 60
export const MAX_SUSPENSION_SECONDS = 7 * 24 * 60 * 60

export interface ServerClock {
  readonly offsetMs: number
  now(clientNow?: number): number
}

export function compareSuspensionVersions(left: string, right: string): -1 | 0 | 1 {
  if (!/^\d+$/.test(left) || !/^\d+$/.test(right)) throw new Error('Некорректная версия состояния AI')
  const leftValue = BigInt(left)
  const rightValue = BigInt(right)
  return leftValue === rightValue ? 0 : leftValue > rightValue ? 1 : -1
}

export function createServerClock(serverTime: string, clientNow = Date.now()): ServerClock {
  const parsedServerTime = Date.parse(serverTime)
  if (!Number.isFinite(parsedServerTime)) throw new Error('Сервер вернул некорректное время')
  const offsetMs = parsedServerTime - clientNow
  return {
    offsetMs,
    now: (currentClientTime = Date.now()) => currentClientTime + offsetMs,
  }
}

export function isConversationAISuspended(
  summary: ConversationAISuspensionSummary,
  estimatedServerNow: number,
): boolean {
  if (summary.mode !== 'SUSPENDED' || summary.lifecycle !== 'ACTIVE' || !summary.suspendedUntil) return false
  const deadline = Date.parse(summary.suspendedUntil)
  return Number.isFinite(deadline) && deadline > estimatedServerNow
}

export function roundedDurationSeconds(durationMs: number): number {
  if (durationMs < MIN_SUSPENSION_SECONDS * 1_000) throw new Error('Срок должен быть не меньше одной минуты')
  const seconds = Math.ceil(durationMs / 60_000) * 60
  if (seconds > MAX_SUSPENSION_SECONDS) throw new Error('Срок должен быть не больше семи дней')
  return seconds
}
