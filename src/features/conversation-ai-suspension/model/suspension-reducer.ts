import type { ConversationAISuspensionDetail, ConversationAISuspensionSummary } from '@/shared/types/domain'
import { compareSuspensionVersions } from './suspension-state'

export interface SuspensionStateValue {
  summary: ConversationAISuspensionSummary
  detail?: ConversationAISuspensionDetail
}

export interface SuspensionRealtimeEvent {
  eventId: string
  eventName:
    | 'conversation.ai_suspension.started.v1'
    | 'conversation.ai_suspension.extended.v1'
    | 'conversation.ai_suspension.resumed.v1'
  projectId: string
  sequence: string
  occurredAt: string
  actorAdminId: string
  endUserId: string
  conversationId: string
  state: ConversationAISuspensionSummary
}

export function applySuspensionState(
  current: SuspensionStateValue | undefined,
  incoming: ConversationAISuspensionSummary | ConversationAISuspensionDetail,
): SuspensionStateValue {
  const incomingDetail = 'startedAt' in incoming ? incoming : undefined
  if (current) {
    const comparison = compareSuspensionVersions(incoming.version, current.summary.version)
    if (comparison < 0 || (comparison === 0 && (!incomingDetail || current.detail))) return current
  }
  return {
    summary: {
      mode: incoming.mode,
      lifecycle: incoming.lifecycle,
      version: incoming.version,
      suspendedUntil: incoming.suspendedUntil,
      serverTime: incoming.serverTime,
    },
    ...(incomingDetail ? { detail: incomingDetail } : {}),
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

export function parseSuspensionRealtimeEvent(value: unknown): SuspensionRealtimeEvent | null {
  const envelope = record(value)
  const state = record(envelope?.state)
  if (!envelope || !state) return null
  const eventNames = [
    'conversation.ai_suspension.started.v1',
    'conversation.ai_suspension.extended.v1',
    'conversation.ai_suspension.resumed.v1',
  ] as const
  if (!eventNames.includes(envelope.eventName as typeof eventNames[number])) return null
  if (![envelope.eventId, envelope.projectId, envelope.occurredAt, envelope.actorAdminId, envelope.endUserId, envelope.conversationId].every(text)) return null
  if (!text(envelope.sequence) || !/^\d+$/.test(envelope.sequence)) return null
  if (!text(state.version) || !/^\d+$/.test(state.version)) return null
  if (state.mode !== 'AUTOMATIC' && state.mode !== 'SUSPENDED') return null
  if (!['NONE', 'ACTIVE', 'EXPIRED', 'RESUMED'].includes(String(state.lifecycle))) return null
  if (!text(state.serverTime) || !Number.isFinite(Date.parse(state.serverTime))) return null
  if (state.suspendedUntil !== null && (!text(state.suspendedUntil) || !Number.isFinite(Date.parse(state.suspendedUntil)))) return null

  return {
    eventId: envelope.eventId as string,
    eventName: envelope.eventName as SuspensionRealtimeEvent['eventName'],
    projectId: envelope.projectId as string,
    sequence: envelope.sequence,
    occurredAt: envelope.occurredAt as string,
    actorAdminId: envelope.actorAdminId as string,
    endUserId: envelope.endUserId as string,
    conversationId: envelope.conversationId as string,
    state: {
      mode: state.mode,
      lifecycle: state.lifecycle as ConversationAISuspensionSummary['lifecycle'],
      version: state.version,
      suspendedUntil: state.suspendedUntil as string | null,
      serverTime: state.serverTime,
    },
  }
}
