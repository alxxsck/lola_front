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
  reconcile(): Promise<void>;
}

interface ScopedConversationEvent {
  projectId: string;
  conversationId: string;
}

function scopedConversationEvent(value: unknown): ScopedConversationEvent | null {
  if (!value || typeof value !== "object") return null;
  const event = value as Record<string, unknown>;
  return typeof event.projectId === "string" &&
    typeof event.conversationId === "string"
    ? { projectId: event.projectId, conversationId: event.conversationId }
    : null;
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
  let reconcileTimer: ReturnType<typeof setTimeout> | undefined;

  function scheduleReconcile(): void {
    const requestGeneration = generation;
    const requestProjectId = projectId;
    const requestConversationId = conversationId;
    if (!requestProjectId || !requestConversationId || reconcileTimer) return;
    reconcileTimer = setTimeout(() => {
      reconcileTimer = undefined;
      if (
        requestGeneration !== generation ||
        requestProjectId !== projectId ||
        requestConversationId !== conversationId
      )
        return;
      void options.reconcile();
    }, 120);
  }

  const unsubscribeEvents = client.subscribe(
    [
      "conversation.message.upserted.v1",
      "conversation.message.translation.upserted.v1",
    ],
    (value) => {
      const event = scopedConversationEvent(value);
      if (
        !event ||
        event.projectId !== projectId ||
        event.conversationId !== conversationId
      )
        return;
      scheduleReconcile();
    },
  );
  const unsubscribeReconcile = client.reconcile(scheduleReconcile);
  const unsubscribeState = client.onState((nextState) => {
    state.value = nextState;
  });

  async function setSelection(
    nextProjectId: string | undefined,
    nextConversationId: string | undefined,
  ): Promise<void> {
    const previousConversationId = conversationId;
    const requestGeneration = ++generation;
    projectId = nextProjectId;
    conversationId = nextConversationId;
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
