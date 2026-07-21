import { ref } from "vue";
import { repository } from "@/shared/api/repository";
import type { Conversation, ConversationMessage } from "@/shared/types/domain";
import type { AdminMessageAISuspensionDto } from "@/shared/api/generated/models";
import {
  suspensionError,
  type SuspensionError,
} from "@/features/conversation-ai-suspension/model/suspension-error";

interface AdminConversationConsoleOptions {
  projectId(): string | undefined;
  endUserId(): string | undefined;
  updateRoute?(conversationId: string): unknown | Promise<unknown>;
  beforeLoadMessages?(conversationId: string): unknown | Promise<unknown>;
}

function orderedMessages(items: ConversationMessage[]): ConversationMessage[] {
  return [...items].sort(
    (left, right) =>
      left.createdAt.localeCompare(right.createdAt) ||
      left.id.localeCompare(right.id),
  );
}

const messageStatusRank: Record<ConversationMessage["status"], number> = {
  PENDING: 0,
  WRITING: 1,
  COMPLETED: 2,
  FAILED: 2,
  CANCELLED: 2,
};

function newerMessage(
  current: ConversationMessage,
  incoming: ConversationMessage,
): ConversationMessage {
  const currentVersion = current.updatedAt ?? current.createdAt;
  const incomingVersion = incoming.updatedAt ?? incoming.createdAt;
  if (incomingVersion > currentVersion) return incoming;
  if (incomingVersion < currentVersion) return current;
  return messageStatusRank[incoming.status] >= messageStatusRank[current.status]
    ? incoming
    : current;
}

function mergeMessages(
  current: ConversationMessage[],
  incoming: ConversationMessage[],
): ConversationMessage[] {
  const merged = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    const existing = merged.get(message.id);
    merged.set(
      message.id,
      existing ? newerMessage(existing, message) : message,
    );
  }
  return orderedMessages([...merged.values()]);
}

type OnlineSession = Awaited<ReturnType<typeof repository.getSessions>>[number];

export function useAdminConversationConsole(
  options: AdminConversationConsoleOptions,
) {
  const conversations = ref<Conversation[]>([]);
  const selectedConversation = ref<Conversation | null>(null);
  const messages = ref<ConversationMessage[]>([]);
  const conversationsLoading = ref(false);
  const conversationsLoadingMore = ref(false);
  const nextConversationCursor = ref<string | null>(null);
  const messagesLoading = ref(false);
  const messagesLoadingMore = ref(false);
  const nextMessageCursor = ref<string | null>(null);
  const conversationError = ref("");
  const onlineSession = ref<OnlineSession | null>(null);
  const replyText = ref("");
  const sendingReply = ref(false);
  const creatingConversation = ref(false);
  const combinedSuspensionError = ref<SuspensionError | null>(null);
  const newMessageCount = ref(0);
  const drafts = new Map<string, string>();
  let conversationRequestSequence = 0;
  let messageRequestSequence = 0;
  let presenceRequestSequence = 0;
  let conversationPagesLoaded = 0;
  let generation = 0;
  let currentConversationCounts = new Map<string, number>();
  let restCurrentConversationCounts = new Map<string, number>();
  let replyAttempt: {
    conversationId: string;
    text: string;
    key: string;
  } | null = null;
  let newConversationAttempt: { text: string; key: string } | null = null;

  function currentContext(
    projectId: string,
    endUserId: string,
    conversationId?: string,
  ): boolean {
    return (
      options.projectId() === projectId &&
      options.endUserId() === endUserId &&
      (!conversationId || selectedConversation.value?.id === conversationId)
    );
  }

  function reset(): void {
    generation += 1;
    conversationRequestSequence += 1;
    messageRequestSequence += 1;
    presenceRequestSequence += 1;
    conversations.value = [];
    selectedConversation.value = null;
    messages.value = [];
    onlineSession.value = null;
    conversationError.value = "";
    replyText.value = "";
    conversationsLoading.value = false;
    conversationsLoadingMore.value = false;
    nextConversationCursor.value = null;
    messagesLoading.value = false;
    messagesLoadingMore.value = false;
    nextMessageCursor.value = null;
    sendingReply.value = false;
    creatingConversation.value = false;
    combinedSuspensionError.value = null;
    newMessageCount.value = 0;
    conversationPagesLoaded = 0;
    currentConversationCounts = new Map();
    restCurrentConversationCounts = new Map();
    drafts.clear();
    replyAttempt = null;
    newConversationAttempt = null;
  }

  function hasAnyDraft(): boolean {
    return (
      Boolean(replyText.value.trim()) ||
      [...drafts.values()].some((draft) => Boolean(draft.trim()))
    );
  }

  function applyPresence(sessions: OnlineSession[], endUserId: string): void {
    const active = sessions.filter(
      (session) => session.userId === endUserId && session.status === "ONLINE",
    );
    onlineSession.value = active[0] ?? null;
    const counts = new Map<string, number>();
    for (const session of active) {
      if (!session.currentConversationId) continue;
      counts.set(
        session.currentConversationId,
        (counts.get(session.currentConversationId) ?? 0) + 1,
      );
    }
    currentConversationCounts = counts;
  }

  function orderConversations(items: Conversation[]): Conversation[] {
    const byId = new Map<string, Conversation>();
    for (const item of items) {
      const presenceCount = currentConversationCounts.get(item.id) ?? 0;
      const restCount =
        restCurrentConversationCounts.get(item.id) ??
        (item.isCurrent ? item.currentInteractionSessionCount : 0);
      const currentCount = Math.max(restCount, presenceCount);
      byId.set(item.id, {
        ...item,
        isCurrent: currentCount > 0,
        currentInteractionSessionCount: currentCount,
      });
    }
    return [...byId.values()].sort((left, right) => {
      const currentOrder = Number(right.isCurrent) - Number(left.isCurrent);
      if (currentOrder) return currentOrder;
      return (
        (right.updatedAt ?? right.lastMessageAt).localeCompare(
          left.updatedAt ?? left.lastMessageAt,
        ) || right.id.localeCompare(left.id)
      );
    });
  }

  function ingestRestConversations(items: Conversation[]): void {
    for (const item of items) {
      restCurrentConversationCounts.set(
        item.id,
        item.isCurrent ? item.currentInteractionSessionCount : 0,
      );
    }
  }

  async function refreshPresence(): Promise<void> {
    const projectId = options.projectId();
    const endUserId = options.endUserId();
    if (!projectId || !endUserId) return;
    const activeGeneration = generation;
    const request = ++presenceRequestSequence;
    try {
      const [sessions, page] = await Promise.all([
        repository.getSessions(projectId),
        repository.getConversations(projectId, endUserId, { limit: 30 }),
      ]);
      if (
        request !== presenceRequestSequence ||
        activeGeneration !== generation ||
        !currentContext(projectId, endUserId)
      )
        return;
      applyPresence(sessions, endUserId);
      ingestRestConversations(page.items);
      const pageIds = new Set(page.items.map((item) => item.id));
      const currentIds = new Set([
        ...[...restCurrentConversationCounts.entries()]
          .filter(([, count]) => count > 0)
          .map(([id]) => id),
        ...currentConversationCounts.keys(),
      ]);
      const details = await Promise.allSettled(
        [...currentIds]
          .filter((id) => !pageIds.has(id))
          .map((id) => repository.getConversation(projectId, endUserId, id)),
      );
      if (
        request !== presenceRequestSequence ||
        activeGeneration !== generation ||
        !currentContext(projectId, endUserId)
      )
        return;
      const refreshedDetails = details.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      );
      ingestRestConversations(refreshedDetails);
      const byId = new Map(conversations.value.map((item) => [item.id, item]));
      page.items.forEach((item) => byId.set(item.id, item));
      refreshedDetails.forEach((item) => byId.set(item.id, item));
      conversations.value = orderConversations([...byId.values()]);
      if (conversationPagesLoaded <= 1)
        nextConversationCursor.value = page.nextCursor;
    } catch {
      // Presence is last-known-good: a transient poll failure is not proof of offline state.
    }
  }

  async function loadConversations(
    endUserId: string,
    preferredConversationId?: string,
  ): Promise<void> {
    const projectId = options.projectId();
    if (!projectId) return;
    const request = ++conversationRequestSequence;
    conversationsLoading.value = true;
    conversationError.value = "";
    try {
      const [page, sessions] = await Promise.all([
        repository.getConversations(projectId, endUserId, { limit: 30 }),
        repository.getSessions(projectId),
      ]);
      if (
        request !== conversationRequestSequence ||
        !currentContext(projectId, endUserId)
      )
        return;
      conversationPagesLoaded = 1;
      nextConversationCursor.value = page.nextCursor;
      applyPresence(sessions, endUserId);
      const requestedIds = new Set(currentConversationCounts.keys());
      if (preferredConversationId) requestedIds.add(preferredConversationId);
      const pageIds = new Set(page.items.map((item) => item.id));
      const details = await Promise.allSettled(
        [...requestedIds]
          .filter((id) => !pageIds.has(id))
          .map((id) => repository.getConversation(projectId, endUserId, id)),
      );
      if (
        request !== conversationRequestSequence ||
        !currentContext(projectId, endUserId)
      )
        return;
      const restItems = [
        ...page.items,
        ...details.flatMap((result) =>
          result.status === "fulfilled" ? [result.value] : [],
        ),
      ];
      ingestRestConversations(restItems);
      conversations.value = orderConversations(restItems);
      let conversation = preferredConversationId
        ? (conversations.value.find(
            (item) => item.id === preferredConversationId,
          ) ?? null)
        : null;
      conversation ??=
        conversations.value.find((item) => item.isCurrent) ??
        conversations.value.find((item) => item.status === "ACTIVE") ??
        conversations.value[0] ??
        null;
      if (conversation) await loadMessages(conversation, false);
    } catch {
      if (
        request === conversationRequestSequence &&
        currentContext(projectId, endUserId)
      ) {
        conversationError.value = "Не удалось загрузить диалоги";
      }
    } finally {
      if (request === conversationRequestSequence)
        conversationsLoading.value = false;
    }
  }

  async function loadMoreConversations(): Promise<void> {
    const projectId = options.projectId();
    const endUserId = options.endUserId();
    const cursor = nextConversationCursor.value;
    if (!projectId || !endUserId || !cursor || conversationsLoadingMore.value)
      return;
    const request = conversationRequestSequence;
    conversationsLoadingMore.value = true;
    conversationError.value = "";
    try {
      const page = await repository.getConversations(projectId, endUserId, {
        limit: 30,
        cursor,
      });
      if (
        request !== conversationRequestSequence ||
        !currentContext(projectId, endUserId)
      )
        return;
      const byId = new Map(conversations.value.map((item) => [item.id, item]));
      ingestRestConversations(page.items);
      page.items.forEach((item) => byId.set(item.id, item));
      conversations.value = orderConversations([...byId.values()]);
      nextConversationCursor.value = page.nextCursor;
      conversationPagesLoaded += 1;
    } catch {
      if (request === conversationRequestSequence) {
        conversationError.value = "Не удалось загрузить остальные диалоги";
      }
    } finally {
      if (request === conversationRequestSequence)
        conversationsLoadingMore.value = false;
    }
  }

  async function loadMessages(
    conversation: Conversation,
    updateRoute = true,
  ): Promise<void> {
    const projectId = options.projectId();
    const endUserId = options.endUserId();
    if (!projectId || !endUserId) return;
    const previous = selectedConversation.value;
    if (previous) drafts.set(previous.id, replyText.value);
    const request = ++messageRequestSequence;
    selectedConversation.value = conversation;
    messages.value = [];
    nextMessageCursor.value = null;
    replyText.value = drafts.get(conversation.id) ?? "";
    messagesLoading.value = true;
    conversationError.value = "";
    newMessageCount.value = 0;
    try {
      if (updateRoute) await options.updateRoute?.(conversation.id);
      await options.beforeLoadMessages?.(conversation.id);
      if (
        request !== messageRequestSequence ||
        !currentContext(projectId, endUserId, conversation.id)
      )
        return;
      const page = await repository.getMessages(
        projectId,
        endUserId,
        conversation.id,
        { limit: 50 },
      );
      if (
        request === messageRequestSequence &&
        currentContext(projectId, endUserId, conversation.id)
      ) {
        messages.value = mergeMessages(messages.value, page.items);
        nextMessageCursor.value = page.nextCursor;
      }
    } catch {
      if (
        request === messageRequestSequence &&
        currentContext(projectId, endUserId)
      ) {
        conversationError.value = "Не удалось загрузить сообщения";
      }
    } finally {
      if (request === messageRequestSequence) messagesLoading.value = false;
    }
  }

  async function loadOlderMessages(): Promise<number> {
    const projectId = options.projectId();
    const endUserId = options.endUserId();
    const conversation = selectedConversation.value;
    const cursor = nextMessageCursor.value;
    if (
      !projectId ||
      !endUserId ||
      !conversation ||
      !cursor ||
      messagesLoadingMore.value
    )
      return 0;
    const request = messageRequestSequence;
    messagesLoadingMore.value = true;
    conversationError.value = "";
    try {
      const page = await repository.getMessages(
        projectId,
        endUserId,
        conversation.id,
        {
          limit: 50,
          cursor,
        },
      );
      if (
        request !== messageRequestSequence ||
        !currentContext(projectId, endUserId, conversation.id)
      ) {
        return 0;
      }
      const existing = new Set(messages.value.map((item) => item.id));
      const older = orderedMessages(
        page.items.filter((item) => !existing.has(item.id)),
      );
      messages.value = [...older, ...messages.value];
      nextMessageCursor.value = page.nextCursor;
      return older.length;
    } catch {
      if (request === messageRequestSequence)
        conversationError.value = "Не удалось загрузить историю";
      return 0;
    } finally {
      if (request === messageRequestSequence) messagesLoadingMore.value = false;
    }
  }

  function upsertMessage(
    message: ConversationMessage,
    announce = true,
  ): boolean {
    const conversation = selectedConversation.value;
    if (!conversation || message.conversationId !== conversation.id)
      return false;
    const index = messages.value.findIndex((item) => item.id === message.id);
    if (index >= 0) {
      const current = messages.value[index]!;
      const preferred = newerMessage(current, message);
      if (preferred === current) return false;
      messages.value.splice(index, 1, preferred);
    } else {
      messages.value = orderedMessages([...messages.value, message]);
      conversation.messageCount += 1;
      if (announce) newMessageCount.value += 1;
    }
    if (message.createdAt >= conversation.lastMessageAt)
      conversation.lastMessageAt = message.createdAt;
    return true;
  }

  function clearNewMessageCount(): void {
    newMessageCount.value = 0;
  }

  async function reconcileSelected(): Promise<void> {
    const projectId = options.projectId();
    const endUserId = options.endUserId();
    const conversation = selectedConversation.value;
    if (!projectId || !endUserId || !conversation) return;
    const request = messageRequestSequence;
    try {
      const [freshConversation, page, sessions, conversationPage] =
        await Promise.all([
          repository.getConversation(projectId, endUserId, conversation.id),
          repository.getMessages(projectId, endUserId, conversation.id, {
            limit: 50,
          }),
          repository.getSessions(projectId),
          repository.getConversations(projectId, endUserId, { limit: 30 }),
        ]);
      if (
        request !== messageRequestSequence ||
        !currentContext(projectId, endUserId, conversation.id)
      )
        return;
      applyPresence(sessions, endUserId);
      ingestRestConversations([...conversationPage.items, freshConversation]);
      const byId = new Map(conversations.value.map((item) => [item.id, item]));
      conversationPage.items.forEach((item) => byId.set(item.id, item));
      byId.set(freshConversation.id, freshConversation);
      const currentDetails = await Promise.allSettled(
        [...currentConversationCounts.keys()]
          .filter((id) => !byId.has(id))
          .map((id) => repository.getConversation(projectId, endUserId, id)),
      );
      if (
        request !== messageRequestSequence ||
        !currentContext(projectId, endUserId, conversation.id)
      )
        return;
      for (const result of currentDetails) {
        if (result.status === "fulfilled") {
          ingestRestConversations([result.value]);
          byId.set(result.value.id, result.value);
        }
      }
      conversations.value = orderConversations([...byId.values()]);
      if (conversationPagesLoaded <= 1)
        nextConversationCursor.value = conversationPage.nextCursor;
      selectedConversation.value = freshConversation;
      messages.value = mergeMessages(messages.value, page.items);
      if (!messages.value.length || page.nextCursor)
        nextMessageCursor.value = page.nextCursor;
    } catch {
      if (
        request === messageRequestSequence &&
        currentContext(projectId, endUserId, conversation.id)
      ) {
        conversationError.value =
          "Live-обновление недоступно. История будет сверена повторно.";
      }
    }
  }

  async function sendReply(): Promise<void> {
    const projectId = options.projectId();
    const endUserId = options.endUserId();
    const conversation = selectedConversation.value;
    const text = replyText.value.trim();
    const activeGeneration = generation;
    if (
      !projectId ||
      !endUserId ||
      !conversation ||
      !onlineSession.value ||
      !text
    )
      return;
    sendingReply.value = true;
    conversationError.value = "";
    combinedSuspensionError.value = null;
    try {
      const attempt =
        replyAttempt?.conversationId === conversation.id &&
        replyAttempt.text === text
          ? replyAttempt
          : {
              conversationId: conversation.id,
              text,
              key: globalThis.crypto.randomUUID(),
            };
      replyAttempt = attempt;
      await repository.sendAdminMessage(projectId, endUserId, {
        text,
        conversationId: conversation.id,
        interactionSessionId: onlineSession.value.id,
        idempotencyKey: attempt.key,
      });
      if (
        generation !== activeGeneration ||
        !currentContext(projectId, endUserId, conversation.id)
      )
        return;
      if (replyText.value.trim() === text) replyText.value = "";
      drafts.delete(conversation.id);
      replyAttempt = null;
      await reconcileSelected();
    } catch {
      if (
        generation === activeGeneration &&
        currentContext(projectId, endUserId, conversation.id)
      )
        conversationError.value = "Не удалось отправить сообщение";
    } finally {
      if (generation === activeGeneration) sendingReply.value = false;
    }
  }

  async function sendNewConversation(text: string): Promise<string | null> {
    const projectId = options.projectId();
    const endUserId = options.endUserId();
    const session = onlineSession.value;
    const normalized = text.trim();
    const activeGeneration = generation;
    if (
      !projectId ||
      !endUserId ||
      !session ||
      !normalized ||
      creatingConversation.value
    )
      return null;
    creatingConversation.value = true;
    conversationError.value = "";
    let createdThreadId: string | null = null;
    try {
      const attempt =
        newConversationAttempt?.text === normalized
          ? newConversationAttempt
          : { text: normalized, key: globalThis.crypto.randomUUID() };
      newConversationAttempt = attempt;
      const result = await repository.sendAdminMessage(projectId, endUserId, {
        text: normalized,
        conversationPolicy: "create_new",
        interactionSessionId: session.id,
        idempotencyKey: attempt.key,
      });
      if (
        generation !== activeGeneration ||
        !currentContext(projectId, endUserId)
      )
        return null;
      createdThreadId = result.threadId;
      newConversationAttempt = null;
    } catch {
      if (generation === activeGeneration)
        conversationError.value = "Не удалось создать новый диалог";
      return null;
    }
    try {
      const created = await repository.getConversation(
        projectId,
        endUserId,
        createdThreadId,
      );
      if (
        generation !== activeGeneration ||
        !currentContext(projectId, endUserId)
      )
        return createdThreadId;
      ingestRestConversations([created]);
      conversations.value = orderConversations([
        created,
        ...conversations.value,
      ]);
      await loadMessages(created);
    } catch {
      if (generation === activeGeneration) {
        conversationError.value =
          "Диалог создан, но не удалось обновить список. Повторите обновление.";
      }
    } finally {
      if (generation === activeGeneration) creatingConversation.value = false;
    }
    return createdThreadId;
  }

  async function suspendAndSendReply(
    aiSuspension: AdminMessageAISuspensionDto,
    idempotencyKey: string,
  ) {
    const projectId = options.projectId();
    const endUserId = options.endUserId();
    const conversation = selectedConversation.value;
    const text = replyText.value.trim();
    const activeGeneration = generation;
    if (
      sendingReply.value ||
      !projectId ||
      !endUserId ||
      !conversation ||
      !onlineSession.value ||
      !text
    ) {
      return null;
    }
    sendingReply.value = true;
    conversationError.value = "";
    combinedSuspensionError.value = null;
    try {
      const result = await repository.sendAdminMessage(projectId, endUserId, {
        text,
        conversationId: conversation.id,
        interactionSessionId: onlineSession.value.id,
        aiSuspension,
        idempotencyKey,
      });
      if (
        generation !== activeGeneration ||
        !currentContext(projectId, endUserId, conversation.id)
      )
        return null;
      if (replyText.value.trim() === text) replyText.value = "";
      drafts.delete(conversation.id);
      await reconcileSelected();
      if (result.deliveryStatus === "NOT_REDELIVERED") {
        conversationError.value =
          "AI приостановлен и сообщение сохранено, но повторная доставка не подтверждена.";
      }
      return result;
    } catch (cause) {
      if (
        generation !== activeGeneration ||
        !currentContext(projectId, endUserId, conversation.id)
      )
        return null;
      const error = suspensionError(cause);
      combinedSuspensionError.value = error;
      conversationError.value =
        error.kind === "NETWORK"
          ? "Результат операции неизвестен. Проверяем состояние AI перед повтором."
          : error.message;
      return null;
    } finally {
      if (generation === activeGeneration) sendingReply.value = false;
    }
  }

  return {
    conversations,
    selectedConversation,
    messages,
    conversationsLoading,
    conversationsLoadingMore,
    nextConversationCursor,
    messagesLoading,
    messagesLoadingMore,
    nextMessageCursor,
    conversationError,
    onlineSession,
    replyText,
    sendingReply,
    creatingConversation,
    combinedSuspensionError,
    newMessageCount,
    reset,
    hasAnyDraft,
    refreshPresence,
    loadConversations,
    loadMoreConversations,
    loadMessages,
    loadOlderMessages,
    upsertMessage,
    clearNewMessageCount,
    reconcileSelected,
    sendReply,
    sendNewConversation,
    suspendAndSendReply,
  };
}
