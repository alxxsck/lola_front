import { ref } from "vue";
import type { CmsRealtimeState } from "@/shared/realtime/cms-realtime-contract";

interface SupportWorkspaceRealtimePort {
  activateProject(projectId: string): Promise<void>;
  watchConversation(conversationId: string): Promise<boolean>;
  unwatchConversation(conversationId?: string): void;
  subscribe(
    eventNames: string[],
    handler: (value: unknown) => void | Promise<void>,
  ): () => void;
  reconcile(handler: () => void | Promise<void>): () => void;
  onState(handler: (state: CmsRealtimeState) => void): () => void;
  setConversationTyping(isTyping: boolean): Promise<boolean>;
  revokeConversationWatch(conversationId: string, generation: string): boolean;
}

interface SupportWorkspaceCollaborationPort {
  select(
    projectId: string | undefined,
    conversationId: string | undefined,
    currentMessageOrdinal?: number,
  ): Promise<void>;
  reconcile(): Promise<void>;
  setDraftActive(active: boolean, currentMessageOrdinal: number): void;
  applyTypingHint(value: {
    projectId: string;
    conversationId: string;
    generation: string;
    watchGeneration: string;
    isTyping: boolean;
    expiresAt: string;
    actor: {
      cmsUserId: string;
      displayName: string;
      generation: string;
      expiresAt: string;
    };
  }): void;
  applyViewers(
    projectId: string,
    conversationId: string,
    generation: string,
    viewers: Array<{
      cmsUserId: string;
      displayName: string;
      generation: string;
      expiresAt: string;
    }>,
  ): void;
  revoke(projectId: string, conversationId: string): void;
  reset(): void;
}

interface SupportWorkspaceLiveOptions {
  reconcile(cause: SupportWorkspaceRecoveryCause): Promise<void>;
  collaboration?: SupportWorkspaceCollaborationPort;
  currentMessageOrdinal?: () => number;
  hasDraft?: () => boolean;
  onAccessRevoked?(): void | Promise<void>;
  recordTelemetry?(
    payload: Record<string, string | number | boolean>,
  ): void;
}

export type SupportWorkspaceRecoveryCause = "HINT" | "GAP" | "RECONNECT";

interface ScopedConversationEvent {
  projectId: string;
  conversationId: string;
  eventSequence?: bigint;
}

function scopedConversationEvent(
  value: unknown,
): ScopedConversationEvent | null {
  if (!value || typeof value !== "object") return null;
  const event = value as Record<string, unknown>;
  if (
    typeof event.projectId !== "string" ||
    typeof event.conversationId !== "string"
  )
    return null;
  let eventSequence: bigint | undefined;
  if (
    typeof event.eventSequence === "string" &&
    /^[1-9][0-9]*$/.test(event.eventSequence)
  ) {
    eventSequence = BigInt(event.eventSequence);
  }
  return {
    projectId: event.projectId,
    conversationId: event.conversationId,
    ...(eventSequence !== undefined ? { eventSequence } : {}),
  };
}

function collaborationScope(value: unknown): {
  projectId: string;
  conversationId: string;
  event: Record<string, unknown>;
} | null {
  if (!value || typeof value !== "object") return null;
  const event = value as Record<string, unknown>;
  if (
    typeof event.projectId !== "string" ||
    typeof event.conversationId !== "string"
  ) return null;
  return { projectId: event.projectId, conversationId: event.conversationId, event };
}

function viewer(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (
    typeof item.cmsUserId !== "string" ||
    typeof item.displayName !== "string" ||
    typeof item.generation !== "string" ||
    typeof item.expiresAt !== "string"
  ) return null;
  return {
    cmsUserId: item.cmsUserId,
    displayName: item.displayName,
    generation: item.generation,
    expiresAt: item.expiresAt,
  };
}

/**
 * Treats socket events as invalidation hints: the visible history is always
 * reconciled through the authoritative Support workspace REST projection.
 */
export function createSupportWorkspaceLiveController(
  options: SupportWorkspaceLiveOptions,
  client: SupportWorkspaceRealtimePort,
) {
  const state = ref<CmsRealtimeState>("DISCONNECTED");
  let projectId: string | undefined;
  let conversationId: string | undefined;
  let generation = 0;
  let lastDeliveryEventSequence: bigint | undefined;
  let reconcileTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingRecoveryCause: SupportWorkspaceRecoveryCause = "HINT";
  let draftActive = false;
  let typingActive = false;
  let typingIdleTimer: ReturnType<typeof setTimeout> | undefined;
  let typingActivityRevision = 0;

  function scheduleReconcile(
    cause: SupportWorkspaceRecoveryCause = "HINT",
  ): void {
    const requestGeneration = generation;
    const requestProjectId = projectId;
    const requestConversationId = conversationId;
    if (!requestProjectId || !requestConversationId) return;
    if (cause === "GAP" || cause === "RECONNECT") pendingRecoveryCause = cause;
    if (reconcileTimer) return;
    reconcileTimer = setTimeout(() => {
      reconcileTimer = undefined;
      if (
        requestGeneration !== generation ||
        requestProjectId !== projectId ||
        requestConversationId !== conversationId
      )
        return;
      const recoveryCause = pendingRecoveryCause;
      pendingRecoveryCause = "HINT";
      const startedAt = performance.now();
      void Promise.allSettled([
        options.reconcile(recoveryCause),
        options.collaboration?.reconcile() ?? Promise.resolve(),
      ]).then((results) => {
        const failed = results.filter(
          (result) => result.status === "rejected",
        ).length;
        options.recordTelemetry?.({
          operation: "realtime_reconcile",
          outcome: failed ? "failed" : "recovered",
          duration_ms: Math.round(performance.now() - startedAt),
          recovered: recoveryCause !== "HINT" && failed === 0,
          mismatch_count: recoveryCause === "GAP" ? 1 : 0,
        });
      });
    }, 120);
  }

  const unsubscribeEvents = client.subscribe(
    [
      "conversation.message.upserted.v1",
      "conversation.message.translation.upserted.v1",
      "conversation.message.delivery.upserted.v1",
      "conversation.message.delivery.revoked.v1",
    ],
    (value) => {
      const event = scopedConversationEvent(value);
      if (
        !event ||
        event.projectId !== projectId ||
        event.conversationId !== conversationId
      )
        return;
      let recoveryCause: SupportWorkspaceRecoveryCause = "HINT";
      if (event.eventSequence !== undefined) {
        if (
          lastDeliveryEventSequence !== undefined &&
          event.eventSequence > lastDeliveryEventSequence + 1n
        ) {
          recoveryCause = "GAP";
        }
        if (
          lastDeliveryEventSequence === undefined ||
          event.eventSequence > lastDeliveryEventSequence
        ) {
          lastDeliveryEventSequence = event.eventSequence;
        }
      }
      scheduleReconcile(recoveryCause);
    },
  );
  const unsubscribeCollaboration = client.subscribe(
    [
      "conversation.viewers.snapshot.v1",
      "conversation.typing.hint.v1",
      "conversation.watch.revoked.v1",
    ],
    (value) => {
      const scoped = collaborationScope(value);
      if (
        !scoped ||
        scoped.projectId !== projectId ||
        scoped.conversationId !== conversationId
      ) return;
      if (
        "reason" in scoped.event &&
        typeof scoped.event.generation === "string" &&
        client.revokeConversationWatch(
          scoped.conversationId,
          scoped.event.generation,
        )
      ) {
        draftActive = false;
        typingActive = false;
        typingActivityRevision += 1;
        if (typingIdleTimer) clearTimeout(typingIdleTimer);
        typingIdleTimer = undefined;
        options.collaboration?.revoke(scoped.projectId, scoped.conversationId);
        void options.onAccessRevoked?.();
        return;
      }
      if (
        Array.isArray(scoped.event.viewers) &&
        typeof scoped.event.generation === "string" &&
        /^(?:0|[1-9][0-9]{0,18})$/.test(scoped.event.generation)
      ) {
        const viewers = scoped.event.viewers.map(viewer);
        if (viewers.every(Boolean))
          options.collaboration?.applyViewers(
            scoped.projectId,
            scoped.conversationId,
            scoped.event.generation,
            viewers.filter((item) => item !== null),
          );
        return;
      }
      const actor = viewer(scoped.event.actor);
      if (
        actor &&
        typeof scoped.event.generation === "string" &&
        typeof scoped.event.watchGeneration === "string" &&
        typeof scoped.event.isTyping === "boolean" &&
        typeof scoped.event.expiresAt === "string"
      ) {
        options.collaboration?.applyTypingHint({
          projectId: scoped.projectId,
          conversationId: scoped.conversationId,
          generation: scoped.event.generation,
          watchGeneration: scoped.event.watchGeneration,
          isTyping: scoped.event.isTyping,
          expiresAt: scoped.event.expiresAt,
          actor,
        });
      }
    },
  );
  const unsubscribeReconcile = client.reconcile(() =>
    scheduleReconcile("RECONNECT"),
  );
  const unsubscribeState = client.onState((nextState) => {
    state.value = nextState;
  });

  async function setSelection(
    nextProjectId: string | undefined,
    nextConversationId: string | undefined,
  ): Promise<void> {
    const previousConversationId = conversationId;
    const requestGeneration = ++generation;
    if (reconcileTimer) clearTimeout(reconcileTimer);
    reconcileTimer = undefined;
    projectId = nextProjectId;
    conversationId = nextConversationId;
    lastDeliveryEventSequence = undefined;
    pendingRecoveryCause = "HINT";
    draftActive = false;
    typingActive = false;
    typingActivityRevision += 1;
    if (typingIdleTimer) clearTimeout(typingIdleTimer);
    typingIdleTimer = undefined;
    options.collaboration?.reset();
    if (
      previousConversationId &&
      previousConversationId !== nextConversationId
    ) {
      client.unwatchConversation(previousConversationId);
    }
    if (!nextProjectId || !nextConversationId) return;
    await client.activateProject(nextProjectId);
    if (
      requestGeneration !== generation ||
      projectId !== nextProjectId ||
      conversationId !== nextConversationId
    )
      return;
    const watching = await client.watchConversation(nextConversationId);
    if (!watching) return;
    await options.collaboration?.select(
      nextProjectId,
      nextConversationId,
      options.currentMessageOrdinal?.(),
    );
    if (draftActive || options.hasDraft?.()) {
      draftActive = true;
      options.collaboration?.setDraftActive(
        true,
        options.currentMessageOrdinal?.() ?? 0,
      );
      await options.collaboration?.reconcile();
      options.recordTelemetry?.({
        operation: "draft_recovery",
        outcome: "restored",
        duration_ms: 0,
        recovered: true,
      });
    }
  }

  async function setDraftActive(active: boolean): Promise<void> {
    if (!projectId || !conversationId) return;
    if (draftActive === active) return;
    draftActive = active;
    options.collaboration?.setDraftActive(
      active,
      options.currentMessageOrdinal?.() ?? 0,
    );
    if (active) await options.collaboration?.reconcile();
    options.recordTelemetry?.({
      operation: "draft_state",
      outcome: active ? "active" : "cleared",
      duration_ms: 0,
      recovered: false,
    });
  }

  async function recordTypingActivity(active: boolean): Promise<void> {
    const activityRevision = ++typingActivityRevision;
    if (typingIdleTimer) clearTimeout(typingIdleTimer);
    typingIdleTimer = undefined;
    if (!projectId || !conversationId) return;
    if (!active) {
      if (!typingActive) return;
      typingActive = false;
      await client.setConversationTyping(false);
      return;
    }
    const requestGeneration = generation;
    typingIdleTimer = setTimeout(() => {
      typingIdleTimer = undefined;
      if (
        activityRevision !== typingActivityRevision ||
        requestGeneration !== generation ||
        !projectId ||
        !conversationId ||
        !typingActive
      ) return;
      typingActive = false;
      void client.setConversationTyping(false);
    }, 4_000);
    if (!typingActive) {
      typingActive = true;
      await client.setConversationTyping(true);
    }
  }

  function dispose(): void {
    generation += 1;
    if (reconcileTimer) clearTimeout(reconcileTimer);
    reconcileTimer = undefined;
    if (typingIdleTimer) clearTimeout(typingIdleTimer);
    typingIdleTimer = undefined;
    if (conversationId) client.unwatchConversation(conversationId);
    projectId = undefined;
    conversationId = undefined;
    draftActive = false;
    typingActive = false;
    typingActivityRevision += 1;
    unsubscribeEvents();
    unsubscribeCollaboration();
    unsubscribeReconcile();
    unsubscribeState();
    options.collaboration?.reset();
  }

  return { state, setSelection, setDraftActive, recordTypingActivity, dispose };
}
