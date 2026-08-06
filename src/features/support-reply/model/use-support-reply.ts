import { computed, ref } from "vue";
import type { ReteniveRepository } from "@/shared/api/repository/contracts";
import type { AdminMessageResult } from "@/shared/types/domain";
import type { SupportWorkspaceSelection } from "@/features/support-workspace/api/support-workspace-source";

export type SupportReplySource = Pick<ReteniveRepository, "sendAdminMessage">;

export interface SupportReplyContext {
  projectId(): string | undefined;
  selection(): SupportWorkspaceSelection | null;
  reconcile(): Promise<void>;
}

function idempotencyKey(): string {
  return globalThis.crypto.randomUUID();
}

/** Owns a reply draft and binds sending to one authoritative selection. */
export function createSupportReplyController(
  context: SupportReplyContext,
  source: SupportReplySource,
) {
  const draft = ref("");
  const sending = ref(false);
  const error = ref("");
  const deliveryStatus = ref<AdminMessageResult["deliveryStatus"]>();
  const drafts = new Map<string, string>();
  let activeConversationId: string | undefined;
  const canReply = computed(() => {
    const selection = context.selection();
    return Boolean(selection?.capabilities.reply && selection.conversation);
  });

  function reset(): void {
    draft.value = "";
    sending.value = false;
    error.value = "";
    deliveryStatus.value = undefined;
    activeConversationId = undefined;
    drafts.clear();
  }

  function syncSelection(): void {
    const nextConversationId = context.selection()?.conversation?.id;
    if (nextConversationId === activeConversationId) return;
    if (!activeConversationId && nextConversationId && draft.value) {
      activeConversationId = nextConversationId;
      error.value = "";
      deliveryStatus.value = undefined;
      return;
    }
    if (activeConversationId) drafts.set(activeConversationId, draft.value);
    activeConversationId = nextConversationId;
    draft.value = nextConversationId ? (drafts.get(nextConversationId) ?? "") : "";
    error.value = "";
    deliveryStatus.value = undefined;
  }

  async function send(): Promise<void> {
    syncSelection();
    const projectId = context.projectId();
    const selection = context.selection();
    const conversation = selection?.conversation;
    const text = draft.value.trim();
    error.value = "";
    deliveryStatus.value = undefined;
    if (!selection?.capabilities.reply || !conversation) {
      error.value = "У вас нет права отвечать в этом диалоге";
      return;
    }
    if (!projectId || !text || sending.value) return;

    sending.value = true;
    try {
      const result = await source.sendAdminMessage(projectId, selection.endUser.id, {
        conversationId: conversation.id,
        idempotencyKey: idempotencyKey(),
        text,
      });
      const current = context.selection();
      if (
        context.projectId() !== projectId ||
        current?.conversation?.id !== conversation.id ||
        current.endUser.id !== selection.endUser.id
      )
        return;
      if (draft.value.trim() === text) draft.value = "";
      drafts.delete(conversation.id);
      deliveryStatus.value = result.deliveryStatus;
      await context.reconcile();
    } catch {
      const current = context.selection();
      if (
        context.projectId() !== projectId ||
        current?.conversation?.id !== conversation.id ||
        current.endUser.id !== selection.endUser.id
      )
        return;
      error.value = "Не удалось отправить сообщение. Черновик сохранён.";
    } finally {
      sending.value = false;
    }
  }

  return {
    draft,
    sending,
    error,
    deliveryStatus,
    canReply,
    syncSelection,
    send,
    reset,
  };
}
