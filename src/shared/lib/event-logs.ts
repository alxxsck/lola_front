import type { EventLogFilters } from '@/shared/api/repository/contracts'
import type { EventLog } from '@/shared/types/domain'

export interface EventLogFilterInput {
  eventCode: string[]
  externalUserId: string
  source: EventLog['source'][]
  status: EventLog['status'][]
  receivedFrom: string
  receivedTo: string
  occurredFrom: string
  occurredTo: string
  limit: number
}

function uniqueValues<T extends string>(values: T[], limit: number): T[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean) as T[])].slice(0, limit)
}

function toIso(value: string): string | undefined {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

export function buildEventLogFilters(input: EventLogFilterInput): EventLogFilters {
  const eventCode = uniqueValues(input.eventCode, 50)
  const source = uniqueValues(input.source, 3)
  const status = uniqueValues(input.status, 3)
  return {
    limit: input.limit,
    ...(eventCode.length ? { eventCode } : {}),
    ...(input.externalUserId.trim() ? { externalUserId: input.externalUserId.trim() } : {}),
    ...(source.length ? { source } : {}),
    ...(status.length ? { status } : {}),
    ...(toIso(input.receivedFrom) ? { receivedFrom: toIso(input.receivedFrom) } : {}),
    ...(toIso(input.receivedTo) ? { receivedTo: toIso(input.receivedTo) } : {}),
    ...(toIso(input.occurredFrom) ? { occurredFrom: toIso(input.occurredFrom) } : {}),
    ...(toIso(input.occurredTo) ? { occurredTo: toIso(input.occurredTo) } : {}),
  }
}

export function eventPayloadHighlights(payload: Record<string, unknown>, limit = 3) {
  return Object.entries(payload).slice(0, limit).map(([key, value]) => ({ key, value: compactValue(value) }))
}

export function compactValue(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  const serialized = JSON.stringify(value)
  return serialized.length > 70 ? `${serialized.slice(0, 67)}…` : serialized
}
