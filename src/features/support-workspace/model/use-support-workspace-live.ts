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
}

interface SupportWorkspaceLiveOptions {
  reconcile(cause: SupportWorkspaceRecoveryCause): Promise<void>;
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
      void options.reconcile(recoveryCause);
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
    await client.watchConversation(nextConversationId);
  }

  function dispose(): void {
    generation += 1;
    if (reconcileTimer) clearTimeout(reconcileTimer);
    reconcileTimer = undefined;
    if (conversationId) client.unwatchConversation(conversationId);
    projectId = undefined;
    conversationId = undefined;
    unsubscribeEvents();
    unsubscribeReconcile();
    unsubscribeState();
  }

  return { state, setSelection, dispose };
}
