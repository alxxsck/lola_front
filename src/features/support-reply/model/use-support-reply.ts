import { computed, ref } from "vue";
import type { ReteniveRepository } from "@/shared/api/repository/contracts";
import type { AdminMessageResult } from "@/shared/types/domain";
import { ApiError } from "@/shared/api/http/api-error";
import type { SupportWorkspaceSelection } from "@/features/support-workspace/api/support-workspace-source";

export type SupportReplySource = Pick<
  ReteniveRepository,
  "sendAdminMessage" | "lookupAdminMessageOutcome"
>;

export interface SupportReplyContext {
  projectId(): string | undefined;
  actorId(): string | undefined;
  selection(): SupportWorkspaceSelection | null;
  reconcile(): Promise<void>;
}

interface SupportReplyDelivery {
  replyTranslationDraftId?: string;
  sendWithoutTranslationReason?: string;
}

export type SupportReplyOutcomeState =
  | "IDLE"
  | "SENDING"
  | "CHECKING_OUTCOME"
  | "RETRYABLE"
  | "BLOCKED";

interface PendingReplyAttempt extends SupportReplyDelivery {
  version: 1;
  projectId: string;
  actorId: string;
  conversationId: string;
  endUserId: string;
  endUserCaseId?: string;
  text: string;
  key: string;
  state: "CHECKING_OUTCOME" | "RETRYABLE" | "BLOCKED";
}

const STORAGE_PREFIX = "retenive:support-reply-attempt:";

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

function attemptIdentity(
  scope: string,
  text: string,
  delivery: SupportReplyDelivery,
  endUserCaseId?: string,
): string {
  return `${scope}\u001f${text}\u001f${endUserCaseId ?? ""}\u001f${delivery.replyTranslationDraftId ?? ""}\u001f${delivery.sendWithoutTranslationReason ?? ""}`;
}

function storageKey(scope: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(scope)}`;
}

function persistAttempt(scope: string, attempt: PendingReplyAttempt): void {
  try {
    globalThis.sessionStorage?.setItem(storageKey(scope), JSON.stringify(attempt));
  } catch {
    // In-memory recovery remains available when tab storage is unavailable.
  }
}

function forgetAttempt(scope: string): void {
  try {
    globalThis.sessionStorage?.removeItem(storageKey(scope));
  } catch {
    // The terminal result is still authoritative in memory.
  }
}

function restoreAttempt(scope: string): PendingReplyAttempt | undefined {
  try {
    const raw = globalThis.sessionStorage?.getItem(storageKey(scope));
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (
      !value ||
      typeof value !== "object" ||
      !("version" in value) ||
      value.version !== 1 ||
      !("projectId" in value) ||
      typeof value.projectId !== "string" ||
      !("actorId" in value) ||
      typeof value.actorId !== "string" ||
      !("conversationId" in value) ||
      typeof value.conversationId !== "string" ||
      !("endUserId" in value) ||
      typeof value.endUserId !== "string" ||
      ("endUserCaseId" in value &&
        value.endUserCaseId !== undefined &&
        typeof value.endUserCaseId !== "string") ||
      !("text" in value) ||
      typeof value.text !== "string" ||
      !value.text.trim() ||
      value.text.length > 10_000 ||
      !("key" in value) ||
      typeof value.key !== "string" ||
      value.key.length < 8 ||
      value.key.length > 200 ||
      !("state" in value) ||
      !["CHECKING_OUTCOME", "RETRYABLE", "BLOCKED"].includes(
        String(value.state),
      )
    ) {
      forgetAttempt(scope);
      return undefined;
    }
    const attempt = value as PendingReplyAttempt;
    if (
      draftKey(
        attempt.projectId,
        attempt.actorId,
        attempt.conversationId,
      ) !== scope
    ) {
      forgetAttempt(scope);
      return undefined;
    }
    return attempt;
  } catch {
    forgetAttempt(scope);
    return undefined;
  }
}

function httpStatus(error: unknown): number | undefined {
  if (error instanceof ApiError) return error.status;
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

function isAmbiguousOutcome(error: unknown): boolean {
  const status = httpStatus(error);
  return status === undefined || status === 0 || status >= 500;
}

/** Owns a reply draft and one durable attempt for each authoritative selection. */
export function createSupportReplyController(
  context: SupportReplyContext,
  source: SupportReplySource,
) {
  const draft = ref("");
  const sending = ref(false);
  const error = ref("");
  const deliveryStatus = ref<AdminMessageResult["deliveryStatus"]>();
  const translationRequired = ref(false);
  const outcomeState = ref<SupportReplyOutcomeState>("IDLE");
  const drafts = new Map<string, string>();
  const pendingAttempts = new Map<string, PendingReplyAttempt>();
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
  const canSendWithoutTranslation = computed(() =>
    Boolean(
      canReply.value &&
        context.selection()?.capabilities.replyWithoutTranslation,
    ),
  );

  function reset(): void {
    draft.value = "";
    sending.value = false;
    error.value = "";
    deliveryStatus.value = undefined;
    translationRequired.value = false;
    outcomeState.value = "IDLE";
    activeDraftKey = undefined;
    drafts.clear();
    pendingAttempts.clear();
  }

  function syncSelection(): void {
    const selection = context.selection();
    const nextDraftKey = draftKey(
      context.projectId(),
      context.actorId(),
      selection?.conversation?.id,
    );
    if (nextDraftKey === activeDraftKey) return;
    if (!activeDraftKey && nextDraftKey && draft.value) {
      const restored =
        pendingAttempts.get(nextDraftKey) ?? restoreAttempt(nextDraftKey);
      activeDraftKey = nextDraftKey;
      if (restored) {
        pendingAttempts.set(nextDraftKey, restored);
        draft.value = restored.text;
        outcomeState.value = restored.state;
      }
      error.value = restored ? "Проверяем результат отправки…" : "";
      deliveryStatus.value = undefined;
      return;
    }
    if (activeDraftKey) drafts.set(activeDraftKey, draft.value);
    activeDraftKey = nextDraftKey;
    const restored = nextDraftKey
      ? (pendingAttempts.get(nextDraftKey) ?? restoreAttempt(nextDraftKey))
      : undefined;
    if (nextDraftKey && restored) pendingAttempts.set(nextDraftKey, restored);
    draft.value = restored?.text ?? (nextDraftKey ? drafts.get(nextDraftKey) ?? "" : "");
    outcomeState.value = restored?.state ?? "IDLE";
    error.value = restored
      ? restored.state === "RETRYABLE"
        ? "Отправка не найдена. Черновик сохранён — можно повторить."
        : restored.state === "BLOCKED"
          ? "Отправка заблокирована. Черновик сохранён."
          : "Проверяем результат отправки…"
      : "";
    deliveryStatus.value = undefined;
    translationRequired.value = false;
  }

  function currentScopeMatches(attempt: PendingReplyAttempt): boolean {
    const selection = context.selection();
    return Boolean(
      context.projectId() === attempt.projectId &&
        context.actorId() === attempt.actorId &&
        selection?.conversation?.id === attempt.conversationId &&
        selection.endUser.id === attempt.endUserId,
    );
  }

  async function acceptOutcome(
    scope: string,
    attempt: PendingReplyAttempt,
    result: AdminMessageResult,
  ): Promise<void> {
    if (!currentScopeMatches(attempt)) return;
    if (draft.value.trim() === attempt.text) draft.value = "";
    drafts.delete(scope);
    pendingAttempts.delete(scope);
    forgetAttempt(scope);
    outcomeState.value = "IDLE";
    deliveryStatus.value = result.deliveryStatus;
    translationRequired.value = false;
    error.value = "";
    try {
      await context.reconcile();
    } catch {
      error.value = "Сообщение принято. Не удалось обновить историю диалога.";
    }
  }

  async function checkAttemptOutcome(
    scope: string,
    attempt: PendingReplyAttempt,
  ): Promise<void> {
    if (!currentScopeMatches(attempt)) return;
    outcomeState.value = "CHECKING_OUTCOME";
    attempt.state = "CHECKING_OUTCOME";
    persistAttempt(scope, attempt);
    error.value = "Проверяем результат отправки…";
    try {
      const result = await source.lookupAdminMessageOutcome(
        attempt.projectId,
        attempt.endUserId,
        attempt.key,
      );
      await acceptOutcome(scope, attempt, result);
    } catch (caught) {
      if (!currentScopeMatches(attempt)) return;
      const status = httpStatus(caught);
      if (status === 404) {
        attempt.state = "RETRYABLE";
        outcomeState.value = "RETRYABLE";
        error.value = "Отправка не найдена. Черновик сохранён — можно повторить.";
      } else if (status === 403) {
        attempt.state = "BLOCKED";
        outcomeState.value = "BLOCKED";
        error.value = "Право на ответ изменилось. Черновик сохранён.";
        try {
          await context.reconcile();
        } catch {
          // The selected projection may already be concealed after revoke.
        }
      } else {
        attempt.state = "CHECKING_OUTCOME";
        outcomeState.value = "CHECKING_OUTCOME";
        error.value = "Результат пока неизвестен. Повторите проверку — сообщение не отправляется заново.";
      }
      persistAttempt(scope, attempt);
    }
  }

  async function checkOutcome(): Promise<void> {
    syncSelection();
    const scope = activeDraftKey;
    const attempt = scope
      ? (pendingAttempts.get(scope) ?? restoreAttempt(scope))
      : undefined;
    if (!scope || !attempt || sending.value) return;
    pendingAttempts.set(scope, attempt);
    sending.value = true;
    try {
      await checkAttemptOutcome(scope, attempt);
    } finally {
      sending.value = false;
    }
  }

  function discardBlockedAttempt(): void {
    syncSelection();
    const scope = activeDraftKey;
    const attempt = scope
      ? (pendingAttempts.get(scope) ?? restoreAttempt(scope))
      : undefined;
    if (!scope || !attempt || attempt.state !== "BLOCKED") return;
    pendingAttempts.delete(scope);
    forgetAttempt(scope);
    outcomeState.value = "IDLE";
    deliveryStatus.value = undefined;
    error.value = "";
  }

  async function send(delivery: SupportReplyDelivery = {}): Promise<void> {
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
    const scope = draftKey(projectId, actorId, conversation.id);
    if (!projectId || !actorId || !scope || !text || sending.value) return;
    if (outcomeState.value === "CHECKING_OUTCOME") {
      await checkOutcome();
      return;
    }
    if (outcomeState.value === "BLOCKED") return;

    const replyTranslationDraftId = delivery.replyTranslationDraftId?.trim();
    const sendWithoutTranslationReason =
      delivery.sendWithoutTranslationReason?.trim();
    if (replyTranslationDraftId && sendWithoutTranslationReason) {
      error.value = "Нельзя одновременно отправить перевод и исходный текст.";
      return;
    }
    if (sendWithoutTranslationReason && !canSendWithoutTranslation.value) {
      error.value = "У вас нет права отправить сообщение без перевода.";
      return;
    }

    const normalizedDelivery: SupportReplyDelivery = {
      ...(replyTranslationDraftId ? { replyTranslationDraftId } : {}),
      ...(sendWithoutTranslationReason ? { sendWithoutTranslationReason } : {}),
    };
    const existing = pendingAttempts.get(scope);
    const existingIdentity = existing
      ? attemptIdentity(
          scope,
          existing.text,
          existing,
          existing.endUserCaseId,
        )
      : undefined;
    const replaysOriginalPayload = Boolean(
      outcomeState.value === "RETRYABLE" &&
        existing &&
        attemptIdentity(
          scope,
          text,
          normalizedDelivery,
          existing.endUserCaseId,
        ) === existingIdentity,
    );
    const endUserCaseId = replaysOriginalPayload
      ? existing?.endUserCaseId
      : selection.case?.id;
    const identity = attemptIdentity(
      scope,
      text,
      normalizedDelivery,
      endUserCaseId,
    );
    const attempt: PendingReplyAttempt =
      existing && existingIdentity === identity
        ? existing
        : {
            version: 1,
            projectId,
            actorId,
            conversationId: conversation.id,
            endUserId: selection.endUser.id,
            ...(endUserCaseId ? { endUserCaseId } : {}),
            text,
            key: idempotencyKey(),
            state: "CHECKING_OUTCOME",
            ...normalizedDelivery,
          };
    pendingAttempts.set(scope, attempt);
    persistAttempt(scope, attempt);
    sending.value = true;
    outcomeState.value = "SENDING";
    try {
      const result = await source.sendAdminMessage(projectId, selection.endUser.id, {
        conversationId: attempt.conversationId,
        idempotencyKey: attempt.key,
        text: attempt.text,
        ...(attempt.endUserCaseId
          ? { endUserCaseId: attempt.endUserCaseId }
          : {}),
        ...(attempt.replyTranslationDraftId
          ? { replyTranslationDraftId: attempt.replyTranslationDraftId }
          : {}),
        ...(attempt.sendWithoutTranslationReason
          ? {
              sendWithoutTranslation: {
                reason: attempt.sendWithoutTranslationReason,
              },
            }
          : {}),
      });
      await acceptOutcome(scope, attempt, result);
    } catch (caught) {
      if (!currentScopeMatches(attempt)) return;
      if (isAmbiguousOutcome(caught)) {
        await checkAttemptOutcome(scope, attempt);
      } else if (
        caught instanceof ApiError &&
        (caught.code === "TRANSLATION_PREVIEW_REQUIRED" ||
          caught.code === "TRANSLATION_EXPLICIT_OVERRIDE_REQUIRED")
      ) {
        pendingAttempts.delete(scope);
        forgetAttempt(scope);
        outcomeState.value = "IDLE";
        translationRequired.value = true;
        error.value = "Для отправки нужен подготовленный перевод. Черновик сохранён.";
      } else if (
        httpStatus(caught) === 409 &&
        caught instanceof ApiError &&
        caught.code === "IDEMPOTENCY_KEY_REUSED"
      ) {
        attempt.state = "BLOCKED";
        outcomeState.value = "BLOCKED";
        persistAttempt(scope, attempt);
        error.value = "Ключ отправки уже использован с другим содержимым. Черновик сохранён.";
      } else {
        pendingAttempts.delete(scope);
        forgetAttempt(scope);
        outcomeState.value = "IDLE";
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
            // Permission changes may conceal the refreshed projection.
          }
          error.value = "Право на ответ изменилось. Черновик сохранён.";
        } else {
          error.value = "Не удалось отправить сообщение. Черновик сохранён.";
        }
      }
    } finally {
      sending.value = false;
      if (outcomeState.value === "SENDING") outcomeState.value = "IDLE";
    }
  }

  async function sendTranslatedReply(replyTranslationDraftId: string): Promise<void> {
    if (!replyTranslationDraftId.trim()) return;
    await send({ replyTranslationDraftId });
  }

  async function sendWithoutTranslation(reason: string): Promise<void> {
    if (!reason.trim()) return;
    await send({ sendWithoutTranslationReason: reason });
  }

  return {
    draft,
    sending,
    error,
    deliveryStatus,
    translationRequired,
    outcomeState,
    canReply,
    canSendWithoutTranslation,
    syncSelection,
    checkOutcome,
    discardBlockedAttempt,
    send,
    sendTranslatedReply,
    sendWithoutTranslation,
    reset,
  };
}
