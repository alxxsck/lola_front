import { ref } from "vue";
import type { ConversationMessage } from "@/shared/types/domain";
import { ApiError } from "@/shared/api/http/api-error";
import { mergeConversationMessageDelivery } from "@/features/conversation-delivery/model/conversation-delivery-receipt";
import type {
  SupportConversationReadState,
  SupportWorkspaceSelection,
  SupportWorkspaceSource,
} from "@/features/support-workspace/api/support-workspace-source";

export type SupportConversationSource = Pick<
  SupportWorkspaceSource,
  "readSelection"
> &
  Partial<Pick<SupportWorkspaceSource, "markConversationRead">>;

export interface SupportConversationContext {
  projectId(): string | undefined;
  conversationId(): string | undefined;
  caseId?(): string | undefined;
  onForbidden?(): void | Promise<void>;
  onReadStateChange?(
    conversationId: string,
    state: SupportConversationReadState,
  ): void | Promise<void>;
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
  const newerMessageCursor = ref<string | null>(null);
  const firstUnreadOrdinal = ref<number | null>(null);
  const readState = ref<SupportConversationReadState | null>(null);
  const loading = ref(false);
  const loadingOlder = ref(false);
  const loadingNewer = ref(false);
  const error = ref("");
  const readError = ref("");
  let selectionGeneration = 0;
  let olderRequestGeneration = 0;
  let newerRequestGeneration = 0;
  let reconcileRequestGeneration = 0;
  let desiredReadOrdinal = 0;
  let readAck: Promise<void> | null = null;

  function reset(): void {
    selectionGeneration += 1;
    olderRequestGeneration += 1;
    newerRequestGeneration += 1;
    reconcileRequestGeneration += 1;
    messages.value = [];
    selection.value = null;
    nextMessageCursor.value = null;
    newerMessageCursor.value = null;
    firstUnreadOrdinal.value = null;
    readState.value = null;
    loading.value = false;
    loadingOlder.value = false;
    loadingNewer.value = false;
    error.value = "";
    readError.value = "";
    desiredReadOrdinal = 0;
    readAck = null;
  }

  function purgeOperationsContext(options: {
    sla: boolean;
    routing: boolean;
  }): void {
    if (!options.sla && !options.routing) return;
    selectionGeneration += 1;
    olderRequestGeneration += 1;
    newerRequestGeneration += 1;
    reconcileRequestGeneration += 1;
    readAck = null;
    loading.value = false;
    loadingOlder.value = false;
    loadingNewer.value = false;
    const projection = selection.value;
    if (!projection) return;
    selection.value = {
      ...projection,
      ...(options.sla ? { sla: null } : {}),
      ...(options.routing ? { routing: { state: "REDACTED" } } : {}),
    };
  }

  function isCurrent(
    projectId: string,
    target: { conversationId?: string; caseId?: string },
    requestGeneration: number,
  ): boolean {
    return (
      requestGeneration === selectionGeneration &&
      context.projectId() === projectId &&
      context.conversationId() === target.conversationId &&
      context.caseId?.() === target.caseId
    );
  }

  function selectedTarget(): { conversationId?: string; caseId?: string } {
    return {
      ...(context.conversationId()
        ? { conversationId: context.conversationId() }
        : {}),
      ...(context.caseId?.() ? { caseId: context.caseId?.() } : {}),
    };
  }

  async function purgeConcealedSelection(): Promise<void> {
    reset();
    await context.onForbidden?.();
  }

  function commitReadState(
    state: SupportConversationReadState,
    requestGeneration: number,
  ): void {
    const current = readState.value;
    if (current && state.lastReadOrdinal < current.lastReadOrdinal) return;
    if (requestGeneration !== selectionGeneration) return;
    readState.value = state;
    desiredReadOrdinal = Math.max(desiredReadOrdinal, state.lastReadOrdinal);
    const projection = selection.value;
    if (projection?.conversation?.id === state.conversationId) {
      selection.value = {
        ...projection,
        conversation: { ...projection.conversation, readState: state },
      };
    }
    void context.onReadStateChange?.(state.conversationId, state);
  }

  function commitProjectionReadState(
    projection: SupportWorkspaceSelection,
    requestGeneration: number,
  ): void {
    const state = projection.conversation?.readState ?? null;
    if (!state) {
      readState.value = null;
      desiredReadOrdinal = 0;
      return;
    }
    const current = readState.value;
    if (
      current?.conversationId === state.conversationId &&
      current.lastReadOrdinal > state.lastReadOrdinal &&
      selection.value?.conversation?.id === current.conversationId
    ) {
      selection.value = {
        ...selection.value,
        conversation: { ...selection.value.conversation, readState: current },
      };
      return;
    }
    commitReadState(state, requestGeneration);
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
    for (const message of incoming) {
      const currentMessage = byId.get(message.id);
      byId.set(
        message.id,
        currentMessage
          ? mergeConversationMessageDelivery(currentMessage, message)
          : message,
      );
    }
    return authoritativeOrder([...byId.values()]);
  }

  async function load(): Promise<void> {
    const projectId = context.projectId();
    const target = selectedTarget();
    const requestGeneration = ++selectionGeneration;
    olderRequestGeneration += 1;
    newerRequestGeneration += 1;
    reconcileRequestGeneration += 1;
    messages.value = [];
    selection.value = null;
    nextMessageCursor.value = null;
    newerMessageCursor.value = null;
    loadingOlder.value = false;
    loadingNewer.value = false;
    firstUnreadOrdinal.value = null;
    readState.value = null;
    desiredReadOrdinal = 0;
    readAck = null;
    readError.value = "";
    error.value = "";
    if (!projectId || (!target.conversationId && !target.caseId)) {
      loading.value = false;
      return;
    }

    loading.value = true;
    try {
      const projection = await source.readSelection(projectId, target);
      if (!isCurrent(projectId, target, requestGeneration)) return;
      const conversationId = projection.conversation?.id;
      if (!conversationId) {
        if (projection.messages.items.length)
          throw new Error(
            "Support workspace returned messages without a conversation",
          );
        selection.value = projection;
        messages.value = [];
        nextMessageCursor.value = null;
        newerMessageCursor.value = null;
        firstUnreadOrdinal.value = null;
        return;
      }
      const ordered = mergeMessages(
        [],
        projection.messages.items,
        conversationId,
      );
      if (!ordered) {
        error.value = "История сообщений требует обновления";
        return;
      }
      selection.value = projection;
      messages.value = ordered;
      nextMessageCursor.value = projection.messages.nextCursor;
      newerMessageCursor.value = projection.messages.newerCursor;
      firstUnreadOrdinal.value = projection.messages.anchorOrdinal;
      commitProjectionReadState(projection, requestGeneration);
    } catch (cause) {
      if (!isCurrent(projectId, target, requestGeneration)) return;
      if (
        cause instanceof ApiError &&
        (cause.status === 403 || cause.status === 404)
      ) {
        await purgeConcealedSelection();
        return;
      }
      error.value = "Не удалось загрузить сообщения выбранного диалога";
    } finally {
      if (requestGeneration === selectionGeneration) loading.value = false;
    }
  }

  async function loadOlder(): Promise<void> {
    const projectId = context.projectId();
    const target = selectedTarget();
    const cursor = nextMessageCursor.value;
    if (
      !projectId ||
      (!target.conversationId && !target.caseId) ||
      !cursor ||
      loadingOlder.value
    )
      return;
    const requestGeneration = selectionGeneration;
    const requestId = ++olderRequestGeneration;
    loadingOlder.value = true;
    error.value = "";
    try {
      const projection = await source.readSelection(projectId, target, {
        messageCursor: cursor,
        messageLimit: 50,
      });
      if (
        requestId !== olderRequestGeneration ||
        !isCurrent(projectId, target, requestGeneration)
      )
        return;
      const conversationId = projection.conversation?.id;
      if (!conversationId) return;
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
      commitProjectionReadState(projection, requestGeneration);
    } catch (cause) {
      if (
        requestId !== olderRequestGeneration ||
        !isCurrent(projectId, target, requestGeneration)
      )
        return;
      if (
        cause instanceof ApiError &&
        (cause.status === 403 || cause.status === 404)
      ) {
        await purgeConcealedSelection();
        return;
      }
      error.value = "Не удалось загрузить более ранние сообщения";
    } finally {
      if (requestId === olderRequestGeneration) loadingOlder.value = false;
    }
  }

  async function loadNewer(): Promise<void> {
    const projectId = context.projectId();
    const target = selectedTarget();
    const cursor = newerMessageCursor.value;
    if (
      !projectId ||
      (!target.conversationId && !target.caseId) ||
      !cursor ||
      loadingNewer.value
    )
      return;
    const requestGeneration = selectionGeneration;
    const requestId = ++newerRequestGeneration;
    loadingNewer.value = true;
    error.value = "";
    try {
      const projection = await source.readSelection(projectId, target, {
        messageNewerCursor: cursor,
        messageLimit: 50,
      });
      if (
        requestId !== newerRequestGeneration ||
        !isCurrent(projectId, target, requestGeneration)
      )
        return;
      const conversationId = projection.conversation?.id;
      if (!conversationId) return;
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
      newerMessageCursor.value = projection.messages.newerCursor;
      commitProjectionReadState(projection, requestGeneration);
    } catch (cause) {
      if (
        requestId !== newerRequestGeneration ||
        !isCurrent(projectId, target, requestGeneration)
      )
        return;
      if (
        cause instanceof ApiError &&
        (cause.status === 403 || cause.status === 404)
      ) {
        await purgeConcealedSelection();
        return;
      }
      error.value = "Не удалось загрузить следующие сообщения";
    } finally {
      if (requestId === newerRequestGeneration) loadingNewer.value = false;
    }
  }

  async function flushReadAck(
    projectId: string,
    conversationId: string,
    target: { conversationId?: string; caseId?: string },
    requestGeneration: number,
  ): Promise<void> {
    const markConversationRead = source.markConversationRead;
    if (!markConversationRead) return;
    while (
      isCurrent(projectId, target, requestGeneration) &&
      desiredReadOrdinal > (readState.value?.lastReadOrdinal ?? 0)
    ) {
      const requestedOrdinal = desiredReadOrdinal;
      try {
        const authoritative = await markConversationRead(
          projectId,
          conversationId,
          requestedOrdinal,
        );
        if (!isCurrent(projectId, target, requestGeneration)) return;
        readError.value = "";
        commitReadState(authoritative, requestGeneration);
      } catch (cause) {
        if (requestGeneration !== selectionGeneration) return;
        desiredReadOrdinal = readState.value?.lastReadOrdinal ?? 0;
        if (
          cause instanceof ApiError &&
          (cause.status === 403 || cause.status === 404)
        ) {
          await purgeConcealedSelection();
          return;
        }
        readError.value = "Не удалось сохранить позицию чтения";
        return;
      }
    }
  }

  function markVisible(ordinal: number): Promise<void> {
    const projectId = context.projectId();
    const target = selectedTarget();
    const conversationId = selection.value?.conversation?.id;
    const highestOrdinal = readState.value?.highestOrdinal ?? 0;
    if (
      !projectId ||
      !conversationId ||
      !Number.isSafeInteger(ordinal) ||
      ordinal < 1 ||
      ordinal > highestOrdinal ||
      !source.markConversationRead
    )
      return Promise.resolve();
    desiredReadOrdinal = Math.max(desiredReadOrdinal, ordinal);
    if (desiredReadOrdinal <= (readState.value?.lastReadOrdinal ?? 0)) {
      return readAck ?? Promise.resolve();
    }
    if (!readAck) {
      const requestGeneration = selectionGeneration;
      const ack = flushReadAck(
        projectId,
        conversationId,
        target,
        requestGeneration,
      ).finally(() => {
        if (readAck === ack) readAck = null;
      });
      readAck = ack;
    }
    return readAck;
  }

  async function reconcile(): Promise<void> {
    const projectId = context.projectId();
    const target = selectedTarget();
    if (!projectId || (!target.conversationId && !target.caseId)) return;
    const requestGeneration = selectionGeneration;
    const requestId = ++reconcileRequestGeneration;
    try {
      const projection = await source.readSelection(projectId, target, {
        messageLimit: 50,
      });
      if (
        requestId !== reconcileRequestGeneration ||
        !isCurrent(projectId, target, requestGeneration)
      )
        return;
      const conversationId = projection.conversation?.id;
      if (!conversationId) {
        if (projection.messages.items.length)
          throw new Error(
            "Support workspace returned messages without a conversation",
          );
        selection.value = projection;
        messages.value = [];
        nextMessageCursor.value = null;
        newerMessageCursor.value = null;
        return;
      }
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
      newerMessageCursor.value = projection.messages.newerCursor;
      commitProjectionReadState(projection, requestGeneration);
    } catch (cause) {
      if (
        requestId !== reconcileRequestGeneration ||
        !isCurrent(projectId, target, requestGeneration)
      )
        return;
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

  function applyDeliveryReceipt(
    messageId: string,
    delivery: NonNullable<ConversationMessage["delivery"]>,
  ): void {
    const index = messages.value.findIndex((message) => message.id === messageId);
    if (index < 0) return;
    const current = messages.value[index]!;
    const merged = mergeConversationMessageDelivery(current, {
      ...current,
      delivery,
    });
    if (merged.delivery === current.delivery) return;
    const next = [...messages.value];
    next[index] = merged;
    messages.value = next;
  }

  return {
    messages,
    selection,
    nextMessageCursor,
    newerMessageCursor,
    firstUnreadOrdinal,
    readState,
    loading,
    loadingOlder,
    loadingNewer,
    error,
    readError,
    load,
    loadOlder,
    loadNewer,
    markVisible,
    applyDeliveryReceipt,
    reconcile,
    purgeOperationsContext,
    reset,
  };
}
