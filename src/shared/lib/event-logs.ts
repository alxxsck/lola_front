import type { EventLogFilters } from '@/shared/api/repository/contracts'
import type { EventLog } from '@/shared/types/domain'

export interface EventLogFilterInput {
  eventCode: string
  externalUserId: string
  source: string
  status: string
  receivedFrom: string
  receivedTo: string
  occurredFrom: string
  occurredTo: string
  limit: number
}

function toIso(value: string): string | undefined {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

export function buildEventLogFilters(input: EventLogFilterInput): EventLogFilters {
  return {
    limit: input.limit,
    ...(input.eventCode ? { eventCode: input.eventCode } : {}),
    ...(input.externalUserId.trim() ? { externalUserId: input.externalUserId.trim() } : {}),
    ...(input.source ? { source: input.source as EventLog['source'] } : {}),
    ...(input.status ? { status: input.status as EventLog['status'] } : {}),
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
