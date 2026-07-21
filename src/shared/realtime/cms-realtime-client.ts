import { io, type Socket } from 'socket.io-client'
import { isMockMode } from '@/shared/config/data-mode'
import { getAccessToken, getRefreshToken } from '@/shared/api/http/auth-session'
import { refreshAccessToken } from '@/shared/api/http/axios-instance'
import type {
  CmsRealtimeCallbacks,
  CmsRealtimeState,
} from './cms-realtime-contract'

type RealtimeHandler = (value: unknown) => void | Promise<void>
type Unsubscribe = () => void

function apiOrigin(): string {
  return (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000').replace(
    /\/api\/v1\/?$/,
    '',
  )
}

async function freshAccessToken(): Promise<string> {
  let token = getAccessToken()
  if (token) return token
  const refreshToken = getRefreshToken()
  if (!refreshToken) throw new Error('Сеанс центра управления недоступен')
  await refreshAccessToken(refreshToken)
  token = getAccessToken()
  if (!token) throw new Error('Не удалось обновить сеанс центра управления')
  return token
}

export class CmsRealtimeClient {
  private socket: Socket | null = null
  private projectId: string | null = null
  private state: CmsRealtimeState = 'DISCONNECTED'
  private readonly subscriptions = new Map<string, Set<RealtimeHandler>>()
  private readonly stateHandlers = new Set<(state: CmsRealtimeState) => void>()
  private readonly reconciliationHandlers = new Set<
    () => void | Promise<void>
  >()
  private readonly registeredSocketEvents = new Set<string>()
  private legacyUnsubscribers: Unsubscribe[] = []
  private reconciliation: Promise<void> | null = null
  private reconciliationRequested = false
  private watchedConversationId: string | null = null
  private watchRetryTimer: ReturnType<typeof setTimeout> | null = null

  subscribe(eventNames: string[], handler: RealtimeHandler): Unsubscribe {
    for (const eventName of new Set(eventNames)) {
      const handlers =
        this.subscriptions.get(eventName) ?? new Set<RealtimeHandler>()
      handlers.add(handler)
      this.subscriptions.set(eventName, handlers)
      this.bindSocketEvent(eventName)
    }
    return () => {
      for (const eventName of eventNames) {
        const handlers = this.subscriptions.get(eventName)
        handlers?.delete(handler)
        if (!handlers?.size) this.subscriptions.delete(eventName)
      }
    }
  }

  onState(handler: (state: CmsRealtimeState) => void): Unsubscribe {
    this.stateHandlers.add(handler)
    handler(this.state)
    return () => this.stateHandlers.delete(handler)
  }

  reconcile(handler: () => void | Promise<void>): Unsubscribe {
    this.reconciliationHandlers.add(handler)
    return () => this.reconciliationHandlers.delete(handler)
  }

  async activateProject(projectId: string): Promise<void> {
    if (this.projectId === projectId && (this.socket || isMockMode)) return
    this.disconnectSocket()
    this.watchedConversationId = null
    this.projectId = projectId
    if (isMockMode) {
      this.setState('CONNECTED')
      await this.runReconciliation()
      return
    }

    this.setState('CONNECTING')
    try {
      const socket = io(`${apiOrigin()}/cms`, {
        path: '/socket.io/cms',
        transports: ['websocket'],
        auth: async (callback) => {
          try {
            const token = await freshAccessToken()
            if (this.projectId === projectId) callback({ token, projectId })
          } catch {
            this.setState('DEGRADED')
          }
        },
        reconnection: true,
        reconnectionAttempts: 8,
        reconnectionDelay: 500,
        reconnectionDelayMax: 10_000,
        randomizationFactor: 0.35,
      })
      this.socket = socket
      socket.on('connect', () => {
        this.setState('CONNECTING')
        void this.synchronizeConversationWatch(socket)
      })
      socket.on('disconnect', (reason) => {
        this.setState('DEGRADED')
        if (reason === 'io server disconnect') socket.connect()
      })
      socket.on('connect_error', () => this.setState('DEGRADED'))
      for (const eventName of this.subscriptions.keys())
        this.bindSocketEvent(eventName)
    } catch {
      this.setState('DEGRADED')
    }
  }

  deactivateProject(): void {
    this.unwatchConversation()
    this.disconnectSocket()
    this.projectId = null
    this.setState('DISCONNECTED')
  }

  /** Совместимость на время перевода существующих возможностей на общий канал. */
  async connect(
    projectId: string,
    callbacks: CmsRealtimeCallbacks,
  ): Promise<void> {
    this.releaseLegacyCallbacks()
    for (const [eventName, handle] of Object.entries(callbacks.subscriptions)) {
      this.legacyUnsubscribers.push(
        this.subscribe([eventName], async (value) => {
          const eventId = await handle(value)
          if (eventId) await this.acknowledge(eventId, callbacks)
        }),
      )
    }
    this.legacyUnsubscribers.push(this.onState(callbacks.onStateChange))
    this.legacyUnsubscribers.push(this.reconcile(callbacks.onConnect))
    await this.activateProject(projectId)
  }

  disconnect(): void {
    this.releaseLegacyCallbacks()
    this.deactivateProject()
  }

  releaseLegacyCallbacks(): void {
    this.legacyUnsubscribers.forEach((unsubscribe) => unsubscribe())
    this.legacyUnsubscribers = []
  }

  async watchConversation(conversationId: string): Promise<boolean> {
    const previous = this.watchedConversationId
    if (previous && previous !== conversationId && this.socket?.connected) {
      this.socket.emit('conversation.unwatch.v1', { conversationId: previous })
    }
    this.watchedConversationId = conversationId
    return this.synchronizeConversationWatch(this.socket)
  }

  unwatchConversation(conversationId = this.watchedConversationId): void {
    if (!conversationId || this.watchedConversationId !== conversationId) return
    if (this.socket?.connected) {
      this.socket.emit('conversation.unwatch.v1', { conversationId })
    }
    this.watchedConversationId = null
    this.clearWatchRetry()
    if (this.socket?.connected) this.setState('CONNECTED')
  }

  private bindSocketEvent(eventName: string): void {
    if (!this.socket || this.registeredSocketEvents.has(eventName)) return
    this.registeredSocketEvents.add(eventName)
    this.socket.on(eventName, (value: unknown) => {
      for (const handler of this.subscriptions.get(eventName) ?? []) {
        void Promise.resolve(handler(value)).catch(() =>
          this.runReconciliation(),
        )
      }
    })
  }

  private disconnectSocket(): void {
    this.clearWatchRetry()
    this.socket?.disconnect()
    this.socket = null
    this.registeredSocketEvents.clear()
  }

  private async synchronizeConversationWatch(
    socket: Socket | null,
  ): Promise<boolean> {
    if (!socket?.connected) return false
    this.clearWatchRetry()
    this.setState('CONNECTING')
    const watchedConversationId = this.watchedConversationId
    const joined = await this.emitConversationWatch(
      socket,
      watchedConversationId,
    )
    if (
      !joined ||
      socket !== this.socket ||
      watchedConversationId !== this.watchedConversationId
    )
      return false
    await this.runReconciliation()
    if (
      socket !== this.socket ||
      watchedConversationId !== this.watchedConversationId
    )
      return false
    this.setState('CONNECTED')
    return true
  }

  private async emitConversationWatch(
    socket: Socket,
    conversationId: string | null,
  ): Promise<boolean> {
    if (!conversationId) return true
    try {
      const response: unknown = await socket
        .timeout(5_000)
        .emitWithAck('conversation.watch.v1', { conversationId })
      if (
        socket !== this.socket ||
        conversationId !== this.watchedConversationId
      )
        return false
      if (
        !response ||
        typeof response !== 'object' ||
        !('ok' in response) ||
        response.ok !== true
      ) {
        this.setState('DEGRADED')
        return false
      }
      return true
    } catch {
      if (
        socket === this.socket &&
        conversationId === this.watchedConversationId
      ) {
        this.setState('DEGRADED')
        this.scheduleWatchRetry(socket, conversationId)
      }
      return false
    }
  }

  private scheduleWatchRetry(socket: Socket, conversationId: string): void {
    this.clearWatchRetry()
    this.watchRetryTimer = setTimeout(() => {
      this.watchRetryTimer = null
      if (
        socket === this.socket &&
        socket.connected &&
        conversationId === this.watchedConversationId
      ) {
        void this.synchronizeConversationWatch(socket)
      }
    }, 2_000)
  }

  private clearWatchRetry(): void {
    if (this.watchRetryTimer) clearTimeout(this.watchRetryTimer)
    this.watchRetryTimer = null
  }

  private async runReconciliation(): Promise<void> {
    if (!this.reconciliation) {
      this.reconciliation = (async () => {
        do {
          this.reconciliationRequested = false
          await Promise.allSettled(
            [...this.reconciliationHandlers].map((handler) =>
              Promise.resolve(handler()),
            ),
          )
        } while (this.reconciliationRequested)
      })().finally(() => {
        this.reconciliation = null
      })
    } else {
      this.reconciliationRequested = true
    }
    return this.reconciliation
  }

  private async acknowledge(
    eventId: string,
    callbacks: CmsRealtimeCallbacks,
  ): Promise<void> {
    const projectId = this.projectId
    if (!projectId) return
    if (this.socket?.connected) {
      this.socket.emit(callbacks.acknowledgement.socketEvent, { eventId })
      return
    }
    await callbacks.acknowledgement.rest(projectId, eventId)
  }

  private setState(state: CmsRealtimeState): void {
    if (this.state === state) return
    this.state = state
    for (const handler of this.stateHandlers) handler(state)
  }
}

export const cmsRealtimeClient = new CmsRealtimeClient()
