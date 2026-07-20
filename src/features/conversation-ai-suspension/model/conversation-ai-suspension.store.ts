import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { ExtendConversationAISuspensionDto, ResumeConversationAIDto, StartConversationAISuspensionDto } from '@/shared/api/generated/models'
import { repository } from '@/shared/api/repository'
import { cmsRealtimeClient } from '@/shared/realtime/cms-realtime-client'
import type { CmsRealtimeState } from '@/shared/realtime/cms-realtime-contract'
import type { Conversation, ConversationAISuspensionDetail, ConversationAISuspensionSummary } from '@/shared/types/domain'
import { applySuspensionState, parseSuspensionRealtimeEvent } from './suspension-reducer'
import { compareSuspensionVersions, createServerClock, isConversationAISuspended } from './suspension-state'
import { suspensionError, type SuspensionError } from './suspension-error'
import { reportSuspensionEvent, suspensionDurationBucket } from './suspension-analytics'

export interface ConversationAISuspensionEntry {
  summary: ConversationAISuspensionSummary
  detail?: ConversationAISuspensionDetail
  endUserId: string
  loading: boolean
  mutating: 'START' | 'EXTEND' | 'RESUME' | null
  error: SuspensionError | null
  locallyExpired: boolean
  cancellationRequested: boolean
  serverOffsetMs: number
}

const REALTIME_EVENTS = [
  'conversation.ai_suspension.started.v1',
  'conversation.ai_suspension.extended.v1',
  'conversation.ai_suspension.resumed.v1',
]

export const useConversationAISuspensionStore = defineStore('conversation-ai-suspension', () => {
  const projectId = ref<string | null>(null)
  const entries = ref(new Map<string, ConversationAISuspensionEntry>())
  const realtimeState = ref<CmsRealtimeState>('DISCONNECTED')
  const changeRevision = ref(0)
  const seenEventIds = new Set<string>()
  const expiryTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const cancellationReconcileTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const requestSequences = new Map<string, number>()
  let lastSequence = 0n
  let generation = 0
  let hiddenAt: number | null = null
  let unsubscribers: Array<() => void> = []

  function getEntry(conversationId: string): ConversationAISuspensionEntry | undefined {
    return entries.value.get(conversationId)
  }

  function replaceEntry(conversationId: string, entry: ConversationAISuspensionEntry): void {
    entries.value = new Map(entries.value).set(conversationId, entry)
  }

  function clearExpiryTimer(conversationId: string): void {
    const timer = expiryTimers.get(conversationId)
    if (timer) clearTimeout(timer)
    expiryTimers.delete(conversationId)
  }

  function clearCancellationReconcileTimer(conversationId: string): void {
    const timer = cancellationReconcileTimers.get(conversationId)
    if (timer) clearTimeout(timer)
    cancellationReconcileTimers.delete(conversationId)
  }

  function scheduleCancellationReconcile(conversationId: string, endUserId: string): void {
    clearCancellationReconcileTimer(conversationId)
    cancellationReconcileTimers.set(conversationId, setTimeout(() => {
      void loadDetail(endUserId, conversationId).finally(() => {
        cancellationReconcileTimers.delete(conversationId)
        const entry = getEntry(conversationId)
        if (entry) replaceEntry(conversationId, { ...entry, cancellationRequested: false })
      })
    }, 10_000))
  }

  function scheduleExpiry(conversationId: string): void {
    clearExpiryTimer(conversationId)
    const entry = getEntry(conversationId)
    if (!entry || !entry.summary.suspendedUntil) return
    let clock
    try {
      clock = createServerClock(entry.summary.serverTime)
    } catch {
      replaceEntry(conversationId, { ...entry, error: { kind: 'UNKNOWN', message: 'Не удалось проверить состояние AI. Обновите данные.' } })
      return
    }
    if (!isConversationAISuspended(entry.summary, clock.now())) {
      if (entry.summary.lifecycle === 'ACTIVE') expireAndReconcile(conversationId)
      return
    }
    const delay = Math.max(0, Date.parse(entry.summary.suspendedUntil) - clock.now())
    expiryTimers.set(conversationId, setTimeout(() => expireAndReconcile(conversationId), Math.min(delay, 2_147_000_000)))
  }

  function expireAndReconcile(conversationId: string): void {
    clearExpiryTimer(conversationId)
    const entry = getEntry(conversationId)
    if (!entry || entry.locallyExpired) return
    replaceEntry(conversationId, { ...entry, locallyExpired: true })
    changeRevision.value += 1
    if (projectId.value) void loadDetail(entry.endUserId, conversationId)
  }

  function applyState(
    conversationId: string,
    endUserId: string,
    incoming: ConversationAISuspensionSummary | ConversationAISuspensionDetail,
  ): boolean {
    const current = getEntry(conversationId)
    let reduced
    let clock
    try {
      validateIncomingState(incoming)
      reduced = applySuspensionState(current, incoming)
      clock = createServerClock(reduced.summary.serverTime)
    } catch {
      clearExpiryTimer(conversationId)
      const fallbackSummary = current?.summary ?? {
        mode: incoming.mode,
        lifecycle: incoming.lifecycle,
        version: incoming.version,
        suspendedUntil: incoming.suspendedUntil,
        serverTime: incoming.serverTime,
      }
      replaceEntry(conversationId, {
        summary: fallbackSummary,
        ...(current?.detail ? { detail: current.detail } : {}),
        endUserId,
        loading: current?.loading ?? false,
        mutating: current?.mutating ?? null,
        error: {
          kind: 'UNKNOWN',
          message: 'Сервер вернул некорректное состояние AI. Обновите данные.',
        },
        locallyExpired: true,
        cancellationRequested: current?.cancellationRequested ?? false,
        serverOffsetMs: current?.serverOffsetMs ?? 0,
      })
      changeRevision.value += 1
      return false
    }
    if (current && reduced.summary === current.summary && reduced.detail === current.detail) return true
    const next: ConversationAISuspensionEntry = {
      summary: reduced.summary,
      ...(reduced.detail ? { detail: reduced.detail } : {}),
      endUserId,
      loading: current?.loading ?? false,
      mutating: current?.mutating ?? null,
      error: null,
      locallyExpired: false,
      cancellationRequested: current?.cancellationRequested ?? false,
      serverOffsetMs: clock.offsetMs,
    }
    replaceEntry(conversationId, next)
    scheduleExpiry(conversationId)
    changeRevision.value += 1
    return true
  }

  function validateIncomingState(
    incoming: ConversationAISuspensionSummary | ConversationAISuspensionDetail,
  ): void {
    compareSuspensionVersions(incoming.version, incoming.version)
    createServerClock(incoming.serverTime)
    if (incoming.suspendedUntil !== null && !Number.isFinite(Date.parse(incoming.suspendedUntil))) {
      throw new Error('Некорректный срок приостановки AI')
    }
  }

  function ingestConversations(conversations: Conversation[]): void {
    for (const conversation of conversations) applyState(conversation.id, conversation.userId, conversation.aiSuspension)
  }

  function applyConfirmedState(
    endUserId: string,
    conversationId: string,
    state: ConversationAISuspensionDetail,
    cancellationStatus?: 'NOT_REQUIRED' | 'REQUESTED',
  ): boolean {
    const applied = applyState(conversationId, endUserId, state)
    const entry = getEntry(conversationId)
    if (entry) {
      const cancellationRequested = cancellationStatus === 'REQUESTED'
      replaceEntry(conversationId, { ...entry, cancellationRequested })
      if (cancellationRequested) scheduleCancellationReconcile(conversationId, endUserId)
      else clearCancellationReconcileTimer(conversationId)
    }
    return applied
  }

  async function loadDetail(endUserId: string, conversationId: string): Promise<boolean> {
    const activeProjectId = projectId.value
    if (!activeProjectId) return false
    const activeGeneration = generation
    const request = (requestSequences.get(conversationId) ?? 0) + 1
    requestSequences.set(conversationId, request)
    const current = getEntry(conversationId)
    if (current) replaceEntry(conversationId, { ...current, loading: true, error: null })
    try {
      const detail = await repository.getConversationAISuspension(activeProjectId, endUserId, conversationId)
      if (
        generation !== activeGeneration ||
        projectId.value !== activeProjectId ||
        requestSequences.get(conversationId) !== request
      ) return false
      const stateApplied = applyState(conversationId, endUserId, detail)
      const appliedEntry = getEntry(conversationId)
      if (appliedEntry) replaceEntry(conversationId, { ...appliedEntry, loading: false })
      return stateApplied
    } catch (cause) {
      if (generation === activeGeneration && requestSequences.get(conversationId) === request) {
        const entry = getEntry(conversationId)
        if (entry) replaceEntry(conversationId, { ...entry, loading: false, error: suspensionError(cause) })
      }
      return false
    }
  }

  async function mutate(
    conversationId: string,
    endUserId: string,
    kind: ConversationAISuspensionEntry['mutating'],
    action: () => ReturnType<typeof repository.startConversationAISuspension>,
  ): Promise<boolean> {
    const current = getEntry(conversationId)
    if (!current || current.mutating) return false
    const activeGeneration = generation
    const activeProjectId = projectId.value
    replaceEntry(conversationId, { ...current, mutating: kind, error: null })
    try {
      const result = await action()
      if (generation !== activeGeneration || projectId.value !== activeProjectId) return false
      const stateApplied = applyState(conversationId, endUserId, result.state)
      const applied = getEntry(conversationId)
      if (applied) replaceEntry(conversationId, {
        ...applied,
        mutating: null,
        cancellationRequested: result.inFlightCancellation?.status === 'REQUESTED',
      })
      if (result.inFlightCancellation?.status === 'REQUESTED') {
        scheduleCancellationReconcile(conversationId, endUserId)
      } else {
        clearCancellationReconcileTimer(conversationId)
      }
      return stateApplied
    } catch (cause) {
      if (generation !== activeGeneration || projectId.value !== activeProjectId) return false
      const error = suspensionError(cause)
      const entry = getEntry(conversationId)
      if (entry) replaceEntry(conversationId, { ...entry, mutating: null, error })
      if (['VERSION_CONFLICT', 'ALREADY_ACTIVE', 'NOT_ACTIVE', 'CONVERSATION_CLOSED'].includes(error.kind)) {
        await loadDetail(endUserId, conversationId)
        if (generation !== activeGeneration || projectId.value !== activeProjectId) return false
        const refreshed = getEntry(conversationId)
        if (refreshed) replaceEntry(conversationId, { ...refreshed, error })
      }
      reportSuspensionEvent('conversation_ai_suspension_command_failed', { command: kind?.toLowerCase(), error_kind: error.kind })
      return false
    }
  }

  async function start(endUserId: string, conversationId: string, command: StartConversationAISuspensionDto, idempotencyKey: string): Promise<boolean> {
    const activeProjectId = projectId.value
    if (!activeProjectId) return Promise.resolve(false)
    const succeeded = await mutate(conversationId, endUserId, 'START', () => repository.startConversationAISuspension(activeProjectId, endUserId, conversationId, command, idempotencyKey))
    if (succeeded) reportSuspensionEvent('conversation_ai_suspension_started', { duration_bucket: suspensionDurationBucket(command.durationSeconds), reason: command.reason, source: 'conversation_banner' })
    return succeeded
  }

  async function extend(endUserId: string, conversationId: string, command: ExtendConversationAISuspensionDto, idempotencyKey: string): Promise<boolean> {
    const activeProjectId = projectId.value
    if (!activeProjectId) return Promise.resolve(false)
    const succeeded = await mutate(conversationId, endUserId, 'EXTEND', () => repository.extendConversationAISuspension(activeProjectId, endUserId, conversationId, command, idempotencyKey))
    if (succeeded) reportSuspensionEvent('conversation_ai_suspension_extended', { duration_bucket: suspensionDurationBucket(command.additionalSeconds) })
    return succeeded
  }

  async function resume(endUserId: string, conversationId: string, command: ResumeConversationAIDto, idempotencyKey: string): Promise<boolean> {
    const activeProjectId = projectId.value
    if (!activeProjectId) return Promise.resolve(false)
    const current = getEntry(conversationId)
    const remainingSeconds = current?.summary.suspendedUntil ? Math.max(0, Math.ceil((Date.parse(current.summary.suspendedUntil) - Date.now() - current.serverOffsetMs) / 1_000)) : 0
    const succeeded = await mutate(conversationId, endUserId, 'RESUME', () => repository.resumeConversationAI(activeProjectId, endUserId, conversationId, command, idempotencyKey))
    if (succeeded) reportSuspensionEvent('conversation_ai_suspension_resumed', { remaining_bucket: suspensionDurationBucket(remainingSeconds) })
    return succeeded
  }

  function applyRealtimeEvent(value: unknown): void {
    const event = parseSuspensionRealtimeEvent(value)
    if (!event || event.projectId !== projectId.value || seenEventIds.has(event.eventId)) return
    seenEventIds.add(event.eventId)
    if (seenEventIds.size > 1_000) seenEventIds.delete(seenEventIds.values().next().value!)
    const sequence = BigInt(event.sequence)
    const hasGap = lastSequence > 0n && sequence > lastSequence + 1n
    if (sequence > lastSequence) lastSequence = sequence
    const existing = getEntry(event.conversationId)
    applyState(event.conversationId, event.endUserId, event.state)
    if ((existing?.detail || hasGap) && projectId.value) void loadDetail(event.endUserId, event.conversationId)
  }

  async function reconcileDetails(): Promise<void> {
    await Promise.all([...entries.value.entries()].filter(([, entry]) => entry.detail).map(([conversationId, entry]) => loadDetail(entry.endUserId, conversationId)))
  }

  function handleVisibilityChange(): void {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now()
      return
    }
    const hiddenForMs = hiddenAt === null ? 0 : Date.now() - hiddenAt
    hiddenAt = null
    if (hiddenForMs >= 30_000) void reconcileDetails()
  }

  function bindVisibilityReconciliation(): void {
    if (typeof document === 'undefined') return
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    document.addEventListener('visibilitychange', handleVisibilityChange)
  }

  function reset(): void {
    generation += 1
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
    hiddenAt = null
    unsubscribers.forEach((unsubscribe) => unsubscribe())
    unsubscribers = []
    expiryTimers.forEach((timer) => clearTimeout(timer))
    expiryTimers.clear()
    cancellationReconcileTimers.forEach((timer) => clearTimeout(timer))
    cancellationReconcileTimers.clear()
    requestSequences.clear()
    entries.value = new Map()
    seenEventIds.clear()
    lastSequence = 0n
    changeRevision.value += 1
  }

  async function activateProject(nextProjectId: string): Promise<void> {
    if (projectId.value === nextProjectId && unsubscribers.length) return
    reset()
    projectId.value = nextProjectId
    unsubscribers = [
      cmsRealtimeClient.subscribe(REALTIME_EVENTS, applyRealtimeEvent),
      cmsRealtimeClient.onState((state) => { realtimeState.value = state }),
      cmsRealtimeClient.reconcile(reconcileDetails),
    ]
    bindVisibilityReconciliation()
    await cmsRealtimeClient.activateProject(nextProjectId)
  }

  function deactivate(): void {
    reset()
    projectId.value = null
    realtimeState.value = 'DISCONNECTED'
  }

  return {
    projectId,
    entries,
    realtimeState,
    changeRevision,
    getEntry,
    ingestConversations,
    applyConfirmedState,
    loadDetail,
    start,
    extend,
    resume,
    applyRealtimeEvent,
    reconcileDetails,
    activateProject,
    deactivate,
  }
})
