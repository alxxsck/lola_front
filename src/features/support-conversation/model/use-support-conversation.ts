import { ref } from "vue";
import type { ConversationMessage } from "@/shared/types/domain";
import { ApiError } from "@/shared/api/http/api-error";
import type {
  SupportWorkspaceSelection,
  SupportWorkspaceSource,
} from "@/features/support-workspace/api/support-workspace-source";

export type SupportConversationSource = Pick<
  SupportWorkspaceSource,
  "readSelection"
>;

export interface SupportConversationContext {
  projectId(): string | undefined;
  conversationId(): string | undefined;
  onForbidden?(): void | Promise<void>;
}

function authoritativeOrder(
  items: readonly ConversationMessage[],
): ConversationMessage[] | null {
  const ordered = [...items].sort((left, right) => {
    const leftOrdinal = left.ordinal;
    const rightOrdinal = right.ordinal;
    if (
      leftOrdinal === undefined ||
      rightOrdinal === undefined ||
      !Number.isSafeInteger(leftOrdinal) ||
      !Number.isSafeInteger(rightOrdinal)
    )
      return 0;
    return leftOrdinal - rightOrdinal;
  });
  let previousOrdinal: number | undefined;
  for (const message of ordered) {
    if (!Number.isSafeInteger(message.ordinal)) return null;
    if (
      previousOrdinal !== undefined &&
      message.ordinal !== previousOrdinal + 1
    )
      return null;
    previousOrdinal = message.ordinal;
  }
  return ordered;
}

/**
 * Owns a selected conversation's history. A response is committed only if the
 * same project and selection are still active when it returns.
 */
export function createSupportConversationController(
  context: SupportConversationContext,
  source: SupportConversationSource,
) {
  const messages = ref<ConversationMessage[]>([]);
  const selection = ref<SupportWorkspaceSelection | null>(null);
  const nextMessageCursor = ref<string | null>(null);
  const loading = ref(false);
  const loadingOlder = ref(false);
  const error = ref("");
  let generation = 0;

  function reset(): void {
    generation += 1;
    messages.value = [];
    selection.value = null;
    nextMessageCursor.value = null;
    loading.value = false;
    loadingOlder.value = false;
    error.value = "";
  }

  function isCurrent(
    projectId: string,
    conversationId: string,
    requestGeneration: number,
  ): boolean {
    return (
      requestGeneration === generation &&
      context.projectId() === projectId &&
      context.conversationId() === conversationId
    );
  }

  async function purgeConcealedSelection(): Promise<void> {
    reset();
    await context.onForbidden?.();
  }

  function mergeMessages(
    current: readonly ConversationMessage[],
    incoming: readonly ConversationMessage[],
    conversationId: string,
  ): ConversationMessage[] | null {
    if (
      [...current, ...incoming].some(
        (message) => message.conversationId !== conversationId,
      )
    )
      return null;
    const byId = new Map(current.map((message) => [message.id, message]));
    for (const message of incoming) byId.set(message.id, message);
    return authoritativeOrder([...byId.values()]);
  }

  async function load(): Promise<void> {
    const projectId = context.projectId();
    const conversationId = context.conversationId();
    const requestGeneration = ++generation;
    messages.value = [];
    selection.value = null;
    nextMessageCursor.value = null;
    error.value = "";
    if (!projectId || !conversationId) {
      loading.value = false;
      return;
    }

    loading.value = true;
    try {
      const projection = await source.readSelection(projectId, conversationId);
      if (!isCurrent(projectId, conversationId, requestGeneration)) return;
      const ordered = mergeMessages([], projection.messages.items, conversationId);
      if (!ordered) {
        error.value = "История сообщений требует обновления";
        return;
      }
      selection.value = projection;
      messages.value = ordered;
      nextMessageCursor.value = projection.messages.nextCursor;
    } catch (cause) {
      if (!isCurrent(projectId, conversationId, requestGeneration)) return;
      if (
        cause instanceof ApiError &&
        (cause.status === 403 || cause.status === 404)
      ) {
        await purgeConcealedSelection();
        return;
      }
      error.value = "Не удалось загрузить сообщения выбранного диалога";
    } finally {
      if (requestGeneration === generation) loading.value = false;
    }
  }

  async function loadOlder(): Promise<void> {
    const projectId = context.projectId();
    const conversationId = context.conversationId();
    const cursor = nextMessageCursor.value;
    if (!projectId || !conversationId || !cursor || loadingOlder.value) return;
    const requestGeneration = ++generation;
    loadingOlder.value = true;
    error.value = "";
    try {
      const projection = await source.readSelection(projectId, conversationId, {
        messageCursor: cursor,
        messageLimit: 50,
      });
      if (!isCurrent(projectId, conversationId, requestGeneration)) return;
      const merged = mergeMessages(
        messages.value,
        projection.messages.items,
        conversationId,
      );
      if (!merged) {
        error.value = "История сообщений требует обновления";
        return;
      }
      selection.value = projection;
      messages.value = merged;
      nextMessageCursor.value = projection.messages.nextCursor;
    } catch (cause) {
      if (!isCurrent(projectId, conversationId, requestGeneration)) return;
      if (
        cause instanceof ApiError &&
        (cause.status === 403 || cause.status === 404)
      ) {
        await purgeConcealedSelection();
        return;
      }
      error.value = "Не удалось загрузить более ранние сообщения";
    } finally {
      if (requestGeneration === generation) loadingOlder.value = false;
    }
  }

  async function reconcile(): Promise<void> {
    const projectId = context.projectId();
    const conversationId = context.conversationId();
    if (!projectId || !conversationId) return;
    const requestGeneration = ++generation;
    try {
      const projection = await source.readSelection(projectId, conversationId, {
        messageLimit: 50,
      });
      if (!isCurrent(projectId, conversationId, requestGeneration)) return;
      const merged = mergeMessages(
        messages.value,
        projection.messages.items,
        conversationId,
      );
      if (!merged) {
        error.value = "История сообщений требует обновления";
        return;
      }
      selection.value = projection;
      messages.value = merged;
      nextMessageCursor.value = projection.messages.nextCursor;
    } catch (cause) {
      if (!isCurrent(projectId, conversationId, requestGeneration)) return;
      if (
        cause instanceof ApiError &&
        (cause.status === 403 || cause.status === 404)
      ) {
        await purgeConcealedSelection();
        return;
      }
      error.value = "Не удалось синхронизировать выбранный диалог";
    }
  }

  return {
    messages,
    selection,
    nextMessageCursor,
    loading,
    loadingOlder,
    error,
    load,
    loadOlder,
    reconcile,
    reset,
  };
}
