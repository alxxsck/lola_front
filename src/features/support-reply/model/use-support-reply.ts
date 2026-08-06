import { computed, ref } from "vue";
import type { ReteniveRepository } from "@/shared/api/repository/contracts";
import type { AdminMessageResult } from "@/shared/types/domain";
import type { SupportWorkspaceSelection } from "@/features/support-workspace/api/support-workspace-source";

export type SupportReplySource = Pick<ReteniveRepository, "sendAdminMessage">;

export interface SupportReplyContext {
  projectId(): string | undefined;
  actorId(): string | undefined;
  selection(): SupportWorkspaceSelection | null;
  reconcile(): Promise<void>;
}

function idempotencyKey(): string {
  return globalThis.crypto.randomUUID();
}

function draftKey(
  projectId: string | undefined,
  actorId: string | undefined,
  conversationId: string | undefined,
): string | undefined {
  if (!projectId || !actorId || !conversationId) return undefined;
  return `${projectId}\u001f${actorId}\u001f${conversationId}\u001fPUBLIC_REPLY`;
}

function attemptKey(draftScope: string, text: string): string {
  return `${draftScope}\u001f${text.length}\u001f${text}`;
}

function httpStatus(error: unknown): number | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof error.response === "object" &&
    error.response !== null &&
    "status" in error.response &&
    typeof error.response.status === "number"
  )
    return error.response.status;
  return undefined;
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
  const attempts = new Map<string, string>();
  let activeDraftKey: string | undefined;
  const canReply = computed(() => {
    const selection = context.selection();
    return Boolean(
      context.projectId() &&
        context.actorId() &&
        selection?.capabilities.reply &&
        selection.conversation,
    );
  });

  function reset(): void {
    draft.value = "";
    sending.value = false;
    error.value = "";
    deliveryStatus.value = undefined;
    activeDraftKey = undefined;
    drafts.clear();
    attempts.clear();
  }

  function syncSelection(): void {
    const nextDraftKey = draftKey(
      context.projectId(),
      context.actorId(),
      context.selection()?.conversation?.id,
    );
    if (nextDraftKey === activeDraftKey) return;
    if (!activeDraftKey && nextDraftKey && draft.value) {
      activeDraftKey = nextDraftKey;
      error.value = "";
      deliveryStatus.value = undefined;
      return;
    }
    if (activeDraftKey) drafts.set(activeDraftKey, draft.value);
    activeDraftKey = nextDraftKey;
    draft.value = nextDraftKey ? (drafts.get(nextDraftKey) ?? "") : "";
    error.value = "";
    deliveryStatus.value = undefined;
  }

  async function send(): Promise<void> {
    syncSelection();
    const projectId = context.projectId();
    const actorId = context.actorId();
    const selection = context.selection();
    const conversation = selection?.conversation;
    const text = draft.value.trim();
    error.value = "";
    deliveryStatus.value = undefined;
    if (!selection?.capabilities.reply || !conversation) {
      error.value = "У вас нет права отвечать в этом диалоге";
      return;
    }
    const scope = draftKey(projectId, actorId, conversation?.id);
    if (!projectId || !actorId || !scope || !text || sending.value) return;

    const identity = attemptKey(scope, text);
    const key = attempts.get(identity) ?? idempotencyKey();
    attempts.set(identity, key);
    let accepted = false;
    sending.value = true;
    try {
      const result = await source.sendAdminMessage(projectId, selection.endUser.id, {
        conversationId: conversation.id,
        idempotencyKey: key,
        text,
      });
      const current = context.selection();
      if (
        context.projectId() !== projectId ||
        context.actorId() !== actorId ||
        current?.conversation?.id !== conversation.id ||
        current.endUser.id !== selection.endUser.id
      )
        return;
      if (draft.value.trim() === text) draft.value = "";
      drafts.delete(scope);
      attempts.delete(identity);
      deliveryStatus.value = result.deliveryStatus;
      accepted = true;
      await context.reconcile();
    } catch (caught) {
      if (accepted) {
        error.value = "Сообщение принято. Не удалось обновить историю диалога.";
        return;
      }
      const current = context.selection();
      if (
        context.projectId() !== projectId ||
        context.actorId() !== actorId ||
        current?.conversation?.id !== conversation.id ||
        current.endUser.id !== selection.endUser.id
      )
        return;
      const status = httpStatus(caught);
      if (status === 409) {
        try {
          await context.reconcile();
        } catch {
          // The conflict is still the primary operator-facing outcome.
        }
        error.value = "Состояние диалога изменилось. Черновик сохранён.";
      } else if (status === 403) {
        try {
          await context.reconcile();
        } catch {
          // Permission changes may make the refreshed projection unavailable.
        }
        error.value = "Право на ответ изменилось. Черновик сохранён.";
      } else {
        error.value = "Не удалось отправить сообщение. Черновик сохранён.";
      }
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
