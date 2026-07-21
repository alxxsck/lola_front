import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/shared/api/http/api-error'
import type { Conversation } from '@/shared/types/domain'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  start: vi.fn(),
  extend: vi.fn(),
  resume: vi.fn(),
  subscribe: vi.fn(() => vi.fn()),
  onState: vi.fn(() => vi.fn()),
  reconcile: vi.fn(() => vi.fn()),
  activateProject: vi.fn(),
}))

vi.mock('@/shared/api/repository', () => ({
  repository: {
    getConversationAISuspension: mocks.get,
    startConversationAISuspension: mocks.start,
    extendConversationAISuspension: mocks.extend,
    resumeConversationAI: mocks.resume,
  },
}))
vi.mock('@/shared/realtime/cms-realtime-client', () => ({
  cmsRealtimeClient: {
    subscribe: mocks.subscribe,
    onState: mocks.onState,
    reconcile: mocks.reconcile,
    activateProject: mocks.activateProject,
  },
}))

import { useConversationAISuspensionStore } from './conversation-ai-suspension.store'

const automatic = {
  mode: 'AUTOMATIC' as const,
  lifecycle: 'NONE' as const,
  version: '0',
  suspendedUntil: null,
  serverTime: '2026-07-20T13:00:00.000Z',
}

const conversation = (id: string): Conversation => ({
  id,
  userId: 'user-1',
  title: id,
  status: 'ACTIVE',
  lastMessageAt: '2026-07-20T13:00:00.000Z',
  messageCount: 1,
  isCurrent: true,
  currentInteractionSessionCount: 1,
  aiSuspension: automatic,
})

describe('хранилище приостановок AI по диалогам', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('не смешивает состояния двух диалогов и блокирует повтор одной команды', async () => {
    const store = useConversationAISuspensionStore()
    await store.activateProject('project-1')
    store.ingestConversations([conversation('conversation-1'), conversation('conversation-2')])
    let finish!: (value: unknown) => void
    mocks.start.mockReturnValue(new Promise((resolve) => { finish = resolve }))

    const first = store.start('user-1', 'conversation-1', { durationSeconds: 3600, reason: 'OPERATOR_TAKEOVER' }, 'key-1')
    const duplicate = await store.start('user-1', 'conversation-1', { durationSeconds: 3600, reason: 'OPERATOR_TAKEOVER' }, 'key-2')

    expect(duplicate).toBe(false)
    expect(store.getEntry('conversation-1')?.mutating).toBe('START')
    expect(store.getEntry('conversation-2')?.mutating).toBeNull()
    finish({ state: { ...automatic, mode: 'SUSPENDED', lifecycle: 'ACTIVE', version: '1', suspendedUntil: '2026-07-20T14:00:00.000Z', startedAt: '2026-07-20T13:00:00.000Z', startedBy: null, reason: 'OPERATOR_TAKEOVER', note: null, resumedAt: null, resumedBy: null }, replayed: false })
    await first

    expect(store.getEntry('conversation-1')?.summary.mode).toBe('SUSPENDED')
    expect(store.getEntry('conversation-2')?.summary.mode).toBe('AUTOMATIC')
  })

  it('игнорирует запоздалое событие и принимает более новое', async () => {
    const store = useConversationAISuspensionStore()
    await store.activateProject('project-1')
    store.ingestConversations([{ ...conversation('conversation-1'), aiSuspension: { ...automatic, version: '10' } }])

    store.applyRealtimeEvent({
      eventId: 'old', eventName: 'conversation.ai_suspension.started.v1', projectId: 'project-1', sequence: '4',
      occurredAt: automatic.serverTime, actorAdminId: 'admin-1', endUserId: 'user-1', conversationId: 'conversation-1',
      state: { ...automatic, mode: 'SUSPENDED', lifecycle: 'ACTIVE', version: '9', suspendedUntil: '2026-07-20T14:00:00.000Z' },
    })
    store.applyRealtimeEvent({
      eventId: 'new', eventName: 'conversation.ai_suspension.started.v1', projectId: 'project-1', sequence: '5',
      occurredAt: automatic.serverTime, actorAdminId: 'admin-1', endUserId: 'user-1', conversationId: 'conversation-1',
      state: { ...automatic, mode: 'SUSPENDED', lifecycle: 'ACTIVE', version: '11', suspendedUntil: '2026-07-20T15:00:00.000Z' },
    })

    expect(store.getEntry('conversation-1')?.summary).toMatchObject({ version: '11', suspendedUntil: '2026-07-20T15:00:00.000Z' })
  })

  it('не считает AI приостановленным, если сервер вернул некорректное время', async () => {
    const store = useConversationAISuspensionStore()
    await store.activateProject('project-1')

    expect(() => store.ingestConversations([{
      ...conversation('conversation-1'),
      aiSuspension: {
        ...automatic,
        mode: 'SUSPENDED',
        lifecycle: 'ACTIVE',
        version: '1',
        suspendedUntil: '2026-07-20T14:00:00.000Z',
        serverTime: 'not-a-date',
      },
    }])).not.toThrow()

    expect(store.getEntry('conversation-1')).toMatchObject({
      locallyExpired: true,
      error: { kind: 'UNKNOWN' },
    })
  })

  it('после конфликта сохраняет пояснение, даже если актуальное состояние загрузилось', async () => {
    const store = useConversationAISuspensionStore()
    await store.activateProject('project-1')
    store.ingestConversations([conversation('conversation-1')])
    mocks.start.mockRejectedValue(new ApiError(409, 'conflict', undefined, undefined, 'VERSION_CONFLICT'))
    mocks.get.mockResolvedValue({ ...automatic, version: '2' })

    const result = await store.start(
      'user-1',
      'conversation-1',
      { durationSeconds: 3_600, reason: 'OPERATOR_TAKEOVER' },
      'key-1',
    )

    expect(result).toBe(false)
    expect(store.getEntry('conversation-1')?.error).toMatchObject({
      kind: 'VERSION_CONFLICT',
      message: expect.stringContaining('другой администратор'),
    })
  })

  it('после ограниченной сверки убирает временное сообщение об остановке ответа', async () => {
    vi.useFakeTimers()
    const store = useConversationAISuspensionStore()
    await store.activateProject('project-1')
    store.ingestConversations([conversation('conversation-1')])
    const state = {
      ...automatic,
      mode: 'SUSPENDED' as const,
      lifecycle: 'ACTIVE' as const,
      version: '1',
      suspendedUntil: '2026-07-20T14:00:00.000Z',
      startedAt: '2026-07-20T13:00:00.000Z',
      startedBy: null,
      reason: 'OPERATOR_TAKEOVER' as const,
      note: null,
      resumedAt: null,
      resumedBy: null,
    }
    mocks.start.mockResolvedValue({
      state,
      replayed: false,
      inFlightCancellation: { status: 'REQUESTED' },
    })
    mocks.get.mockResolvedValue(state)

    await store.start(
      'user-1',
      'conversation-1',
      { durationSeconds: 3_600, reason: 'OPERATOR_TAKEOVER' },
      'key-1',
    )
    expect(store.getEntry('conversation-1')?.cancellationRequested).toBe(true)

    await vi.advanceTimersByTimeAsync(10_000)

    expect(mocks.get).toHaveBeenCalledWith('project-1', 'user-1', 'conversation-1')
    expect(store.getEntry('conversation-1')?.cancellationRequested).toBe(false)
    vi.useRealTimers()
  })

  it('не переносит поздний ответ команды в другой проект', async () => {
    const store = useConversationAISuspensionStore()
    await store.activateProject('project-1')
    store.ingestConversations([conversation('conversation-1')])
    let finish!: (value: unknown) => void
    mocks.start.mockReturnValue(new Promise((resolve) => { finish = resolve }))

    const pending = store.start(
      'user-1',
      'conversation-1',
      { durationSeconds: 3_600, reason: 'OPERATOR_TAKEOVER' },
      'key-1',
    )
    store.deactivate()
    await store.activateProject('project-2')
    store.ingestConversations([{ ...conversation('conversation-1'), userId: 'user-2' }])
    finish({
      state: {
        ...automatic,
        mode: 'SUSPENDED',
        lifecycle: 'ACTIVE',
        version: '1',
        suspendedUntil: '2026-07-20T14:00:00.000Z',
      },
      replayed: false,
    })

    await pending

    expect(store.getEntry('conversation-1')).toMatchObject({
      endUserId: 'user-2',
      summary: { mode: 'AUTOMATIC', version: '0' },
    })
  })

  it('не переносит ошибку старого проекта после контрольного чтения', async () => {
    const store = useConversationAISuspensionStore()
    await store.activateProject('project-1')
    store.ingestConversations([conversation('conversation-1')])
    mocks.start.mockRejectedValue(
      new ApiError(409, 'conflict', undefined, undefined, 'VERSION_CONFLICT'),
    )
    let finishRead!: (value: unknown) => void
    mocks.get.mockReturnValue(new Promise((resolve) => { finishRead = resolve }))

    const pending = store.start(
      'user-1',
      'conversation-1',
      { durationSeconds: 3_600, reason: 'OPERATOR_TAKEOVER' },
      'key-1',
    )
    await Promise.resolve()
    store.deactivate()
    await store.activateProject('project-2')
    store.ingestConversations([{ ...conversation('conversation-1'), userId: 'user-2' }])
    finishRead({ ...automatic, version: '2' })
    await pending

    expect(store.getEntry('conversation-1')).toMatchObject({
      endUserId: 'user-2',
      error: null,
      summary: { mode: 'AUTOMATIC', version: '0' },
    })
  })

  it('после долгого сна вкладки перечитывает открытое состояние', async () => {
    vi.useFakeTimers()
    vi.setSystemTime('2026-07-20T13:00:00.000Z')
    const visibility = vi.spyOn(document, 'visibilityState', 'get')
    const store = useConversationAISuspensionStore()
    await store.activateProject('project-1')
    store.ingestConversations([conversation('conversation-1')])
    mocks.get.mockResolvedValue({
      ...automatic,
      startedAt: null,
      startedBy: null,
      reason: null,
      note: null,
      resumedAt: null,
      resumedBy: null,
    })
    await store.loadDetail('user-1', 'conversation-1')
    mocks.get.mockClear()

    visibility.mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    vi.setSystemTime('2026-07-20T13:00:31.000Z')
    visibility.mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await Promise.resolve()

    expect(mocks.get).toHaveBeenCalledWith('project-1', 'user-1', 'conversation-1')
    visibility.mockRestore()
    vi.useRealTimers()
  })
})
