import { ref } from "vue";
import { repository } from "@/shared/api/repository";
import type { Conversation } from "@/shared/types/domain";

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
  const messagesLoading = ref(false);
  const conversationError = ref("");
  const onlineSession = ref<
    Awaited<ReturnType<typeof repository.getSessions>>[number] | null
  >(null);
  const replyText = ref("");
  const sendingReply = ref(false);
  let conversationRequestSequence = 0;
  let messageRequestSequence = 0;

  function reset(): void {
    conversationRequestSequence += 1;
    messageRequestSequence += 1;
    conversations.value = [];
    selectedConversation.value = null;
    messages.value = [];
    onlineSession.value = null;
    conversationError.value = "";
    replyText.value = "";
    conversationsLoading.value = false;
    messagesLoading.value = false;
    sendingReply.value = false;
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
        options.endUserId() !== endUserId
      )
        return;
      conversations.value = page.items;
      onlineSession.value =
        sessions.find(
          (session) =>
            session.userId === endUserId && session.status === "ONLINE",
        ) ?? null;
      const conversation =
        page.items.find((item) => item.id === preferredConversationId) ??
        page.items[0] ??
        null;
      selectedConversation.value = conversation;
      if (conversation) await loadMessages(conversation, false);
    } catch {
      if (request === conversationRequestSequence)
        conversationError.value = "Не удалось загрузить диалоги";
    } finally {
      if (request === conversationRequestSequence)
        conversationsLoading.value = false;
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
        selectedConversation.value?.id === conversation.id
      )
        messages.value = [...page.items].reverse();
    } catch {
      if (request === messageRequestSequence)
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
    try {
      await repository.sendAdminMessage(projectId, endUserId, {
        text,
        conversationPolicy: "reuse_active",
        interactionSessionId: onlineSession.value.id,
      });
      replyText.value = "";
      await loadMessages(conversation, false);
    } catch {
      conversationError.value = "Не удалось отправить сообщение";
    } finally {
      sendingReply.value = false;
    }
  }

  return {
    conversations,
    selectedConversation,
    messages,
    conversationsLoading,
    messagesLoading,
    conversationError,
    onlineSession,
    replyText,
    sendingReply,
    reset,
    loadConversations,
    loadMessages,
    sendReply,
  };
}
