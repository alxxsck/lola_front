import { io, type Socket } from 'socket.io-client';
import { isMockMode } from '@/shared/config/data-mode';
import { getAccessToken } from '@/shared/api/http/auth-session';
import { refreshAccessToken } from '@/shared/api/http/axios-instance';
import type { CmsRealtimeCallbacks, CmsRealtimeState } from './cms-realtime-contract';

type RealtimeHandler = (value: unknown) => void | Promise<void>;
type Unsubscribe = () => void;
type TypingCommandOutcome = 'ACCEPTED' | 'RETRY' | 'REWATCH' | 'TERMINAL';
type InternalNoteWatchOutcome = 'ACCEPTED' | 'RETRY' | 'REWATCH' | 'DEGRADED' | 'TERMINAL';

function apiOrigin(): string {
  return (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000').replace(
    /\/api\/v1\/?$/,
    '',
  );
}

async function freshAccessToken(): Promise<string> {
  let token = getAccessToken();
  if (token) return token;
  await refreshAccessToken();
  token = getAccessToken();
  if (!token) throw new Error('Не удалось обновить сеанс центра управления');
  return token;
}

export class CmsRealtimeClient {
  private socket: Socket | null = null;
  private projectId: string | null = null;
  private state: CmsRealtimeState = 'DISCONNECTED';
  private readonly subscriptions = new Map<string, Set<RealtimeHandler>>();
  private readonly stateHandlers = new Set<(state: CmsRealtimeState) => void>();
  private readonly reconciliationHandlers = new Set<() => void | Promise<void>>();
  private readonly internalNoteWatchTerminationHandlers = new Set<
    (caseId: string) => void | Promise<void>
  >();
  private readonly registeredSocketEvents = new Set<string>();
  private legacyUnsubscribers: Unsubscribe[] = [];
  private reconciliation: Promise<void> | null = null;
  private reconciliationRequested = false;
  private watchedConversationId: string | null = null;
  private watchGeneration: string | null = null;
  private watchRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private watchRenewTimer: ReturnType<typeof setTimeout> | null = null;
  private typingRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private typingRequested = false;
  private typingActive = false;
  private typingCommandGeneration = 0;
  private typingCommandQueue: Promise<void> = Promise.resolve();
  private watchedInternalNoteCaseId: string | null = null;
  private internalNoteWatchRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private internalNoteWatchRenewTimer: ReturnType<typeof setTimeout> | null = null;

  subscribe(eventNames: string[], handler: RealtimeHandler): Unsubscribe {
    for (const eventName of new Set(eventNames)) {
      const handlers = this.subscriptions.get(eventName) ?? new Set<RealtimeHandler>();
      handlers.add(handler);
      this.subscriptions.set(eventName, handlers);
      this.bindSocketEvent(eventName);
    }
    return () => {
      for (const eventName of eventNames) {
        const handlers = this.subscriptions.get(eventName);
        handlers?.delete(handler);
        if (!handlers?.size) this.subscriptions.delete(eventName);
      }
    };
  }

  onState(handler: (state: CmsRealtimeState) => void): Unsubscribe {
    this.stateHandlers.add(handler);
    handler(this.state);
    return () => this.stateHandlers.delete(handler);
  }

  reconcile(handler: () => void | Promise<void>): Unsubscribe {
    this.reconciliationHandlers.add(handler);
    return () => this.reconciliationHandlers.delete(handler);
  }

  onSupportInternalNoteWatchTerminated(
    handler: (caseId: string) => void | Promise<void>,
  ): Unsubscribe {
    this.internalNoteWatchTerminationHandlers.add(handler);
    return () => this.internalNoteWatchTerminationHandlers.delete(handler);
  }

  async activateProject(projectId: string): Promise<void> {
    if (this.projectId === projectId && (this.socket || isMockMode)) return;
    this.disconnectSocket();
    this.watchedConversationId = null;
    this.watchGeneration = null;
    this.watchedInternalNoteCaseId = null;
    this.projectId = projectId;
    if (isMockMode) {
      this.setState('CONNECTED');
      await this.runReconciliation();
      return;
    }

    this.setState('CONNECTING');
    try {
      const socket = io(`${apiOrigin()}/cms`, {
        path: '/socket.io/cms',
        transports: ['websocket'],
        auth: async (callback) => {
          try {
            const token = await freshAccessToken();
            if (this.projectId === projectId) callback({ token, projectId });
          } catch {
            this.setState('DEGRADED');
          }
        },
        reconnection: true,
        reconnectionAttempts: 8,
        reconnectionDelay: 500,
        reconnectionDelayMax: 10_000,
        randomizationFactor: 0.35,
      });
      this.socket = socket;
      socket.on('connect', () => {
        this.setState('CONNECTING');
        void Promise.all([
          this.synchronizeConversationWatch(socket),
          this.synchronizeInternalNoteWatch(socket),
        ]);
      });
      socket.on('disconnect', (reason) => {
        this.typingActive = false;
        this.typingCommandGeneration += 1;
        this.clearTypingRefresh();
        this.setState('DEGRADED');
        if (reason === 'io server disconnect') socket.connect();
      });
      socket.on('connect_error', () => this.setState('DEGRADED'));
      for (const eventName of this.subscriptions.keys()) this.bindSocketEvent(eventName);
    } catch {
      this.setState('DEGRADED');
    }
  }

  deactivateProject(): void {
    this.unwatchConversation();
    this.unwatchSupportInternalNotes();
    this.disconnectSocket();
    this.projectId = null;
    this.setState('DISCONNECTED');
  }

  /** Совместимость на время перевода существующих возможностей на общий канал. */
  async connect(projectId: string, callbacks: CmsRealtimeCallbacks): Promise<void> {
    this.releaseLegacyCallbacks();
    for (const [eventName, handle] of Object.entries(callbacks.subscriptions)) {
      this.legacyUnsubscribers.push(
        this.subscribe([eventName], async (value) => {
          const eventId = await handle(value);
          if (eventId) await this.acknowledge(eventId, callbacks);
        }),
      );
    }
    this.legacyUnsubscribers.push(this.onState(callbacks.onStateChange));
    this.legacyUnsubscribers.push(this.reconcile(callbacks.onConnect));
    await this.activateProject(projectId);
  }

  disconnect(): void {
    this.releaseLegacyCallbacks();
    this.deactivateProject();
  }

  releaseLegacyCallbacks(): void {
    this.legacyUnsubscribers.forEach((unsubscribe) => unsubscribe());
    this.legacyUnsubscribers = [];
  }

  async watchConversation(conversationId: string): Promise<boolean> {
    const previous = this.watchedConversationId;
    const previousGeneration = this.watchGeneration;
    if (previous && previous !== conversationId && previousGeneration && this.socket?.connected) {
      void this.socket.timeout(5_000).emitWithAck('conversation.unwatch.v1', {
        conversationId: previous,
        generation: previousGeneration,
      });
    }
    this.clearTypingRefresh();
    this.typingRequested = false;
    this.typingActive = false;
    this.typingCommandGeneration += 1;
    this.clearWatchRenew();
    this.watchGeneration = null;
    this.watchedConversationId = conversationId;
    if (isMockMode) {
      this.watchGeneration = '1';
      return true;
    }
    return this.synchronizeConversationWatch(this.socket);
  }

  unwatchConversation(conversationId = this.watchedConversationId): void {
    if (!conversationId || this.watchedConversationId !== conversationId) return;
    const generation = this.watchGeneration;
    if (this.socket?.connected && generation) {
      if (this.typingActive || this.typingRequested) {
        void this.socket.timeout(5_000).emitWithAck('conversation.typing.v1', {
          conversationId,
          generation,
          isTyping: false,
        });
      }
      void this.socket.timeout(5_000).emitWithAck('conversation.unwatch.v1', {
        conversationId,
        generation,
      });
    }
    this.watchedConversationId = null;
    this.watchGeneration = null;
    this.typingRequested = false;
    this.typingActive = false;
    this.typingCommandGeneration += 1;
    this.clearTypingRefresh();
    this.clearWatchRenew();
    this.clearWatchRetry();
    if (this.socket?.connected) this.setState('CONNECTED');
  }

  async setConversationTyping(isTyping: boolean): Promise<boolean> {
    if (isMockMode) {
      this.typingRequested = Boolean(this.watchedConversationId) && isTyping;
      this.typingActive = this.typingRequested;
      return Boolean(this.watchedConversationId);
    }
    const socket = this.socket;
    const conversationId = this.watchedConversationId;
    const generation = this.watchGeneration;
    const changed = this.typingRequested !== isTyping;
    this.typingRequested = isTyping;
    if (changed) this.clearTypingRefresh();
    if (!socket?.connected || !conversationId || !generation) return false;
    return this.queueTypingConvergence(socket, conversationId, generation);
  }

  async watchSupportInternalNotes(caseId: string): Promise<boolean> {
    const previous = this.watchedInternalNoteCaseId;
    if (previous && previous !== caseId && this.socket?.connected) {
      void this.socket
        .timeout(5_000)
        .emitWithAck('support.internal_note.unwatch.v1', { caseId: previous });
    }
    this.clearInternalNoteWatchRetry();
    this.clearInternalNoteWatchRenew();
    this.watchedInternalNoteCaseId = caseId;
    if (isMockMode) return true;
    return this.synchronizeInternalNoteWatch(this.socket);
  }

  unwatchSupportInternalNotes(caseId = this.watchedInternalNoteCaseId): void {
    if (!caseId || caseId !== this.watchedInternalNoteCaseId) return;
    if (this.socket?.connected) {
      void this.socket.timeout(5_000).emitWithAck('support.internal_note.unwatch.v1', { caseId });
    }
    this.watchedInternalNoteCaseId = null;
    this.clearInternalNoteWatchRetry();
    this.clearInternalNoteWatchRenew();
  }

  private queueTypingConvergence(
    socket: Socket,
    conversationId: string,
    generation: string,
  ): Promise<boolean> {
    const commandGeneration = this.typingCommandGeneration;
    const command = this.typingCommandQueue.then(async () => {
      if (
        commandGeneration !== this.typingCommandGeneration ||
        socket !== this.socket ||
        !socket.connected ||
        conversationId !== this.watchedConversationId ||
        generation !== this.watchGeneration
      )
        return false;
      const desired = this.typingRequested;
      if (this.typingActive === desired) {
        if (desired) this.scheduleTypingRefresh(socket, conversationId, generation);
        return true;
      }
      const outcome = await this.emitTyping(socket, conversationId, generation, desired);
      if (
        commandGeneration !== this.typingCommandGeneration ||
        socket !== this.socket ||
        conversationId !== this.watchedConversationId ||
        generation !== this.watchGeneration
      )
        return false;
      if (outcome !== 'ACCEPTED') {
        this.handleTypingFailure(outcome, socket, conversationId, generation);
        return false;
      }
      this.typingActive = desired;
      if (this.typingRequested !== desired)
        this.scheduleTypingRetry(socket, conversationId, generation, 0);
      else if (desired) this.scheduleTypingRefresh(socket, conversationId, generation);
      else this.clearTypingRefresh();
      return this.typingRequested === desired;
    });
    this.typingCommandQueue = command.then(
      () => undefined,
      () => undefined,
    );
    return command;
  }

  private bindSocketEvent(eventName: string): void {
    if (!this.socket || this.registeredSocketEvents.has(eventName)) return;
    this.registeredSocketEvents.add(eventName);
    this.socket.on(eventName, (value: unknown) => {
      for (const handler of this.subscriptions.get(eventName) ?? []) {
        void Promise.resolve(handler(value)).catch(() => this.runReconciliation());
      }
    });
  }

  private disconnectSocket(): void {
    this.clearWatchRetry();
    this.clearWatchRenew();
    this.clearTypingRefresh();
    this.clearInternalNoteWatchRetry();
    this.clearInternalNoteWatchRenew();
    this.watchGeneration = null;
    this.typingRequested = false;
    this.typingActive = false;
    this.typingCommandGeneration += 1;
    this.socket?.disconnect();
    this.socket = null;
    this.registeredSocketEvents.clear();
  }

  private async synchronizeInternalNoteWatch(socket: Socket | null): Promise<boolean> {
    if (!socket?.connected) return false;
    const caseId = this.watchedInternalNoteCaseId;
    if (!caseId) return true;
    this.clearInternalNoteWatchRetry();
    try {
      const response: unknown = await socket
        .timeout(5_000)
        .emitWithAck('support.internal_note.watch.v1', { caseId });
      const outcome = this.internalNoteWatchOutcome(response, caseId, false);
      const accepted = outcome === 'ACCEPTED';
      if (!accepted || socket !== this.socket || caseId !== this.watchedInternalNoteCaseId) {
        if (accepted && socket === this.socket && socket.connected) {
          void socket.timeout(5_000).emitWithAck('support.internal_note.unwatch.v1', { caseId });
        }
        if (
          outcome === 'RETRY' &&
          socket === this.socket &&
          caseId === this.watchedInternalNoteCaseId
        )
          this.scheduleInternalNoteWatchRetry(socket, caseId);
        if (
          outcome === 'TERMINAL' &&
          socket === this.socket &&
          caseId === this.watchedInternalNoteCaseId
        )
          await this.terminateInternalNoteWatch(caseId);
        if (
          outcome === 'DEGRADED' &&
          socket === this.socket &&
          caseId === this.watchedInternalNoteCaseId
        )
          await this.degradeInternalNoteWatch(caseId);
        return false;
      }
      this.scheduleInternalNoteWatchRenew(socket, caseId);
      await this.runReconciliation();
      return true;
    } catch {
      if (socket === this.socket && caseId === this.watchedInternalNoteCaseId)
        this.scheduleInternalNoteWatchRetry(socket, caseId);
      return false;
    }
  }

  private scheduleInternalNoteWatchRetry(socket: Socket, caseId: string): void {
    this.clearInternalNoteWatchRetry();
    this.internalNoteWatchRetryTimer = setTimeout(() => {
      this.internalNoteWatchRetryTimer = null;
      if (socket === this.socket && socket.connected && caseId === this.watchedInternalNoteCaseId)
        void this.synchronizeInternalNoteWatch(socket);
    }, 2_000);
  }

  private clearInternalNoteWatchRetry(): void {
    if (this.internalNoteWatchRetryTimer) clearTimeout(this.internalNoteWatchRetryTimer);
    this.internalNoteWatchRetryTimer = null;
  }

  private scheduleInternalNoteWatchRenew(socket: Socket, caseId: string): void {
    this.clearInternalNoteWatchRenew();
    this.internalNoteWatchRenewTimer = setTimeout(async () => {
      this.internalNoteWatchRenewTimer = null;
      if (socket !== this.socket || !socket.connected || caseId !== this.watchedInternalNoteCaseId)
        return;
      try {
        const response: unknown = await socket
          .timeout(5_000)
          .emitWithAck('support.internal_note.renew.v1', { caseId });
        if (
          socket !== this.socket ||
          !socket.connected ||
          caseId !== this.watchedInternalNoteCaseId
        )
          return;
        const outcome = this.internalNoteWatchOutcome(response, caseId, true);
        if (outcome === 'ACCEPTED') {
          this.scheduleInternalNoteWatchRenew(socket, caseId);
          return;
        }
        if (outcome === 'RETRY') {
          this.scheduleInternalNoteWatchRetry(socket, caseId);
          return;
        }
        if (outcome === 'REWATCH') {
          void this.synchronizeInternalNoteWatch(socket);
          return;
        }
        if (outcome === 'DEGRADED') {
          await this.degradeInternalNoteWatch(caseId);
          return;
        }
        await this.terminateInternalNoteWatch(caseId);
      } catch {
        if (socket === this.socket && caseId === this.watchedInternalNoteCaseId)
          this.scheduleInternalNoteWatchRetry(socket, caseId);
      }
    }, 40_000);
  }

  private internalNoteWatchOutcome(
    response: unknown,
    caseId: string,
    renewing: boolean,
  ): InternalNoteWatchOutcome {
    if (
      response &&
      typeof response === 'object' &&
      'ok' in response &&
      response.ok === true &&
      'caseId' in response &&
      response.caseId === caseId
    )
      return 'ACCEPTED';
    const error =
      response &&
      typeof response === 'object' &&
      'error' in response &&
      typeof response.error === 'string'
        ? response.error
        : null;
    if (error === 'BUSY' || error === 'RATE_LIMITED') return 'RETRY';
    if (renewing && error === 'WATCH_NOT_FOUND') return 'REWATCH';
    if (
      error === 'UNAUTHORIZED' ||
      error === 'CASE_NOT_FOUND_OR_FORBIDDEN' ||
      error === 'WATCH_IDENTITY_INVALID' ||
      error === 'CASE_NOT_FOUND'
    )
      return 'TERMINAL';
    return 'DEGRADED';
  }

  private async degradeInternalNoteWatch(caseId: string): Promise<void> {
    if (caseId !== this.watchedInternalNoteCaseId) return;
    this.watchedInternalNoteCaseId = null;
    this.clearInternalNoteWatchRetry();
    this.clearInternalNoteWatchRenew();
    await this.runReconciliation();
  }

  private async terminateInternalNoteWatch(caseId: string): Promise<void> {
    if (caseId !== this.watchedInternalNoteCaseId) return;
    this.watchedInternalNoteCaseId = null;
    this.clearInternalNoteWatchRetry();
    this.clearInternalNoteWatchRenew();
    await Promise.allSettled([
      ...[...this.internalNoteWatchTerminationHandlers].map((handler) =>
        Promise.resolve(handler(caseId)),
      ),
      this.runReconciliation(),
    ]);
  }

  private clearInternalNoteWatchRenew(): void {
    if (this.internalNoteWatchRenewTimer) clearTimeout(this.internalNoteWatchRenewTimer);
    this.internalNoteWatchRenewTimer = null;
  }

  private async synchronizeConversationWatch(socket: Socket | null): Promise<boolean> {
    if (!socket?.connected) return false;
    this.clearWatchRetry();
    this.setState('CONNECTING');
    const watchedConversationId = this.watchedConversationId;
    const joined = await this.emitConversationWatch(socket, watchedConversationId);
    if (!joined || socket !== this.socket || watchedConversationId !== this.watchedConversationId)
      return false;
    await this.runReconciliation();
    if (socket !== this.socket || watchedConversationId !== this.watchedConversationId)
      return false;
    this.setState('CONNECTED');
    return true;
  }

  private async emitConversationWatch(
    socket: Socket,
    conversationId: string | null,
  ): Promise<boolean> {
    if (!conversationId) return true;
    try {
      const response: unknown = await socket
        .timeout(5_000)
        .emitWithAck('conversation.watch.v1', { conversationId });
      const acceptedGeneration =
        !response ||
        typeof response !== 'object' ||
        !('ok' in response) ||
        response.ok !== true ||
        !('generation' in response) ||
        typeof response.generation !== 'string' ||
        !/^[1-9][0-9]{0,18}$/.test(response.generation)
          ? null
          : response.generation;
      if (!acceptedGeneration) {
        const error =
          response &&
          typeof response === 'object' &&
          'error' in response &&
          typeof response.error === 'string'
            ? response.error
            : null;
        this.setState('DEGRADED');
        if (
          (error === 'RATE_LIMITED' || error === 'COLLABORATION_UNAVAILABLE') &&
          socket === this.socket &&
          conversationId === this.watchedConversationId
        )
          this.scheduleWatchRetry(socket, conversationId);
        return false;
      }
      if (socket !== this.socket || conversationId !== this.watchedConversationId) {
        if (socket === this.socket && socket.connected) {
          void socket.timeout(5_000).emitWithAck('conversation.unwatch.v1', {
            conversationId,
            generation: acceptedGeneration,
          });
        }
        return false;
      }
      this.watchGeneration = acceptedGeneration;
      this.scheduleWatchRenew(socket, conversationId, acceptedGeneration);
      await this.restoreRequestedTyping(socket, conversationId, acceptedGeneration);
      return true;
    } catch {
      if (socket === this.socket && conversationId === this.watchedConversationId) {
        this.setState('DEGRADED');
        this.scheduleWatchRetry(socket, conversationId);
      }
      return false;
    }
  }

  private scheduleWatchRetry(socket: Socket, conversationId: string, delay = 2_000): void {
    this.clearWatchRetry();
    this.watchRetryTimer = setTimeout(() => {
      this.watchRetryTimer = null;
      if (
        socket === this.socket &&
        socket.connected &&
        conversationId === this.watchedConversationId
      ) {
        void this.synchronizeConversationWatch(socket);
      }
    }, delay);
  }

  private clearWatchRetry(): void {
    if (this.watchRetryTimer) clearTimeout(this.watchRetryTimer);
    this.watchRetryTimer = null;
  }

  private scheduleWatchRenew(socket: Socket, conversationId: string, generation: string): void {
    this.clearWatchRenew();
    this.watchRenewTimer = setTimeout(() => {
      this.watchRenewTimer = null;
      void this.renewConversationWatch(socket, conversationId, generation);
    }, 40_000);
  }

  private async renewConversationWatch(
    socket: Socket,
    conversationId: string,
    generation: string,
  ): Promise<void> {
    if (
      socket !== this.socket ||
      !socket.connected ||
      conversationId !== this.watchedConversationId ||
      generation !== this.watchGeneration
    )
      return;
    try {
      const response: unknown = await socket
        .timeout(5_000)
        .emitWithAck('conversation.watch.renew.v1', {
          conversationId,
          generation,
        });
      if (
        !response ||
        typeof response !== 'object' ||
        !('ok' in response) ||
        response.ok !== true ||
        !('generation' in response) ||
        response.generation !== generation
      )
        throw new Error('Watch renewal rejected');
      this.scheduleWatchRenew(socket, conversationId, generation);
    } catch {
      if (
        socket === this.socket &&
        conversationId === this.watchedConversationId &&
        generation === this.watchGeneration
      ) {
        this.watchGeneration = null;
        this.typingActive = false;
        this.typingCommandGeneration += 1;
        this.clearTypingRefresh();
        this.setState('DEGRADED');
        this.scheduleWatchRetry(socket, conversationId);
      }
    }
  }

  private clearWatchRenew(): void {
    if (this.watchRenewTimer) clearTimeout(this.watchRenewTimer);
    this.watchRenewTimer = null;
  }

  private async emitTyping(
    socket: Socket,
    conversationId: string,
    generation: string,
    isTyping: boolean,
  ): Promise<TypingCommandOutcome> {
    try {
      const response: unknown = await socket.timeout(5_000).emitWithAck('conversation.typing.v1', {
        conversationId,
        generation,
        isTyping,
      });
      if (
        response &&
        typeof response === 'object' &&
        'ok' in response &&
        response.ok === true &&
        'generation' in response &&
        response.generation === generation
      )
        return 'ACCEPTED';
      const error =
        response &&
        typeof response === 'object' &&
        'error' in response &&
        typeof response.error === 'string'
          ? response.error
          : null;
      if (
        error === 'RATE_LIMITED' ||
        error === 'TYPING_RATE_LIMITED' ||
        error === 'COLLABORATION_UNAVAILABLE'
      )
        return 'RETRY';
      if (
        error === 'WATCH_NOT_FOUND' ||
        error === 'WATCH_GENERATION_STALE' ||
        error === 'TYPING_GENERATION_STALE' ||
        (response && typeof response === 'object' && 'ok' in response && response.ok === true)
      )
        return 'REWATCH';
      return 'TERMINAL';
    } catch {
      return 'RETRY';
    }
  }

  private handleTypingFailure(
    outcome: Exclude<TypingCommandOutcome, 'ACCEPTED'>,
    socket: Socket,
    conversationId: string,
    generation: string,
  ): void {
    if (outcome === 'RETRY') {
      this.scheduleTypingRetry(socket, conversationId, generation);
      return;
    }
    if (outcome === 'REWATCH') {
      this.watchGeneration = null;
      this.typingActive = false;
      this.typingCommandGeneration += 1;
      this.clearTypingRefresh();
      this.clearWatchRenew();
      this.setState('DEGRADED');
      this.scheduleWatchRetry(socket, conversationId, 0);
      return;
    }
    this.revokeConversationWatch(conversationId, generation);
    void this.runReconciliation();
  }

  private scheduleTypingRefresh(socket: Socket, conversationId: string, generation: string): void {
    this.clearTypingRefresh();
    this.typingRefreshTimer = setTimeout(async () => {
      this.typingRefreshTimer = null;
      if (
        !this.typingActive ||
        socket !== this.socket ||
        conversationId !== this.watchedConversationId ||
        generation !== this.watchGeneration
      )
        return;
      const outcome = await this.emitTyping(socket, conversationId, generation, true);
      if (outcome === 'ACCEPTED') this.scheduleTypingRefresh(socket, conversationId, generation);
      else {
        this.typingActive = false;
        this.handleTypingFailure(outcome, socket, conversationId, generation);
      }
    }, 3_000);
  }

  private scheduleTypingRetry(
    socket: Socket,
    conversationId: string,
    generation: string,
    delay = this.typingRequested ? 3_000 : 1_000,
  ): void {
    this.clearTypingRefresh();
    this.typingRefreshTimer = setTimeout(() => {
      this.typingRefreshTimer = null;
      if (
        socket === this.socket &&
        socket.connected &&
        conversationId === this.watchedConversationId &&
        generation === this.watchGeneration
      )
        void this.queueTypingConvergence(socket, conversationId, generation);
    }, delay);
  }

  private clearTypingRefresh(): void {
    if (this.typingRefreshTimer) clearTimeout(this.typingRefreshTimer);
    this.typingRefreshTimer = null;
  }

  private async restoreRequestedTyping(
    socket: Socket,
    conversationId: string,
    generation: string,
  ): Promise<void> {
    if (!this.typingRequested) return;
    await this.queueTypingConvergence(socket, conversationId, generation);
  }

  revokeConversationWatch(conversationId: string, generation: string): boolean {
    if (conversationId !== this.watchedConversationId || generation !== this.watchGeneration)
      return false;
    this.watchedConversationId = null;
    this.watchGeneration = null;
    this.typingRequested = false;
    this.typingActive = false;
    this.typingCommandGeneration += 1;
    this.clearTypingRefresh();
    this.clearWatchRenew();
    this.clearWatchRetry();
    this.setState('DEGRADED');
    return true;
  }

  private async runReconciliation(): Promise<void> {
    if (!this.reconciliation) {
      this.reconciliation = (async () => {
        do {
          this.reconciliationRequested = false;
          await Promise.allSettled(
            [...this.reconciliationHandlers].map((handler) => Promise.resolve(handler())),
          );
        } while (this.reconciliationRequested);
      })().finally(() => {
        this.reconciliation = null;
      });
    } else {
      this.reconciliationRequested = true;
    }
    return this.reconciliation;
  }

  private async acknowledge(eventId: string, callbacks: CmsRealtimeCallbacks): Promise<void> {
    const projectId = this.projectId;
    if (!projectId) return;
    if (this.socket?.connected) {
      this.socket.emit(callbacks.acknowledgement.socketEvent, { eventId });
      return;
    }
    await callbacks.acknowledgement.rest(projectId, eventId);
  }

  private setState(state: CmsRealtimeState): void {
    if (this.state === state) return;
    this.state = state;
    for (const handler of this.stateHandlers) handler(state);
  }
}

export const cmsRealtimeClient = new CmsRealtimeClient();
