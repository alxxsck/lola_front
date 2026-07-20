import { ref } from "vue";
import { repository } from "@/shared/api/repository";
import type { Conversation } from "@/shared/types/domain";
import type { AdminMessageAISuspensionDto } from "@/shared/api/generated/models";
import {
  suspensionError,
  type SuspensionError,
} from "@/features/conversation-ai-suspension/model/suspension-error";

interface AdminConversationConsoleOptions {
  projectId(): string | undefined;
  endUserId(): string | undefined;
  updateRoute(conversationId: string): unknown | Promise<unknown>;
}

export function useAdminConversationConsole(
  options: AdminConversationConsoleOptions,
) {
  const conversations = ref<Conversation[]>([]);
  const selectedConversation = ref<Conversation | null>(null);
  const messages = ref<
    Awaited<ReturnType<typeof repository.getMessages>>["items"]
  >([]);
  const conversationsLoading = ref(false);
  const conversationsLoadingMore = ref(false);
  const nextConversationCursor = ref<string | null>(null);
  const messagesLoading = ref(false);
  const conversationError = ref("");
  const onlineSession = ref<
    Awaited<ReturnType<typeof repository.getSessions>>[number] | null
  >(null);
  const replyText = ref("");
  const sendingReply = ref(false);
  const combinedSuspensionError = ref<SuspensionError | null>(null);
  let conversationRequestSequence = 0;
  let messageRequestSequence = 0;
  let generation = 0;

  function reset(): void {
    generation += 1;
    conversationRequestSequence += 1;
    messageRequestSequence += 1;
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
    sendingReply.value = false;
    combinedSuspensionError.value = null;
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
        options.projectId() !== projectId ||
        options.endUserId() !== endUserId
      )
        return;
      conversations.value = page.items;
      nextConversationCursor.value = page.nextCursor;
      onlineSession.value =
        sessions.find(
          (session) =>
            session.userId === endUserId && session.status === "ONLINE",
        ) ?? null;
      let conversation = page.items.find((item) => item.id === preferredConversationId) ?? null;
      if (!conversation && preferredConversationId) {
        conversation = await repository.getConversation(projectId, endUserId, preferredConversationId);
        if (
          request !== conversationRequestSequence ||
          options.projectId() !== projectId ||
          options.endUserId() !== endUserId
        ) return;
        conversations.value = [conversation, ...conversations.value];
      }
      conversation ??= page.items[0] ?? null;
      selectedConversation.value = conversation;
      if (conversation) await loadMessages(conversation, false);
    } catch {
      if (
        request === conversationRequestSequence &&
        options.projectId() === projectId &&
        options.endUserId() === endUserId
      )
        conversationError.value = "Не удалось загрузить диалоги";
    } finally {
      if (request === conversationRequestSequence)
        conversationsLoading.value = false;
    }
  }

  async function loadMoreConversations(): Promise<void> {
    const projectId = options.projectId();
    const endUserId = options.endUserId();
    const cursor = nextConversationCursor.value;
    if (!projectId || !endUserId || !cursor || conversationsLoadingMore.value) return;
    const request = conversationRequestSequence;
    conversationsLoadingMore.value = true;
    conversationError.value = "";
    try {
      const page = await repository.getConversations(projectId, endUserId, { limit: 30, cursor });
      if (
        request !== conversationRequestSequence ||
        options.projectId() !== projectId ||
        options.endUserId() !== endUserId
      ) return;
      const byId = new Map(conversations.value.map((item) => [item.id, item]));
      page.items.forEach((item) => byId.set(item.id, item));
      conversations.value = [...byId.values()];
      nextConversationCursor.value = page.nextCursor;
    } catch {
      if (request === conversationRequestSequence)
        conversationError.value = "Не удалось загрузить остальные диалоги";
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
    const request = ++messageRequestSequence;
    selectedConversation.value = conversation;
    messagesLoading.value = true;
    conversationError.value = "";
    if (updateRoute) await options.updateRoute(conversation.id);
    try {
      const page = await repository.getMessages(
        projectId,
        endUserId,
        conversation.id,
        { limit: 50 },
      );
      if (
        request === messageRequestSequence &&
        options.projectId() === projectId &&
        options.endUserId() === endUserId &&
        selectedConversation.value?.id === conversation.id
      )
        messages.value = [...page.items].reverse();
    } catch {
      if (
        request === messageRequestSequence &&
        options.projectId() === projectId &&
        options.endUserId() === endUserId
      )
        conversationError.value = "Не удалось загрузить сообщения";
    } finally {
      if (request === messageRequestSequence) messagesLoading.value = false;
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
      await repository.sendAdminMessage(projectId, endUserId, {
        text,
        conversationId: conversation.id,
        interactionSessionId: onlineSession.value.id,
      });
      if (
        generation !== activeGeneration ||
        options.projectId() !== projectId ||
        options.endUserId() !== endUserId ||
        selectedConversation.value?.id !== conversation.id
      ) return;
      replyText.value = "";
      await loadMessages(conversation, false);
    } catch {
      if (generation !== activeGeneration) return;
      conversationError.value = "Не удалось отправить сообщение";
    } finally {
      if (generation === activeGeneration) sendingReply.value = false;
    }
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
    )
      return null;
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
        options.projectId() !== projectId ||
        options.endUserId() !== endUserId ||
        selectedConversation.value?.id !== conversation.id
      ) return null;
      replyText.value = "";
      await loadMessages(conversation, false);
      if (result.deliveryStatus === "NOT_REDELIVERED")
        conversationError.value = "AI приостановлен и сообщение сохранено, но повторная доставка не подтверждена.";
      return result;
    } catch (cause) {
      if (generation !== activeGeneration) return null;
      const error = suspensionError(cause);
      combinedSuspensionError.value = error;
      conversationError.value = error.kind === "NETWORK"
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
    conversationError,
    onlineSession,
    replyText,
    sendingReply,
    combinedSuspensionError,
    reset,
    loadConversations,
    loadMoreConversations,
    loadMessages,
    sendReply,
    suspendAndSendReply,
  };
}
