import { computed, onScopeDispose, ref, watch } from "vue";
import type {
  ConversationMessageTranslationItemResponseDto,
  ConversationMessageTranslationsResponseDto,
  ConversationTranslationResponseDto,
  EditReplyTranslationDraftDto,
  ReplyTranslationDraftResponseDto,
  UpdateConversationTranslationPreferenceDto,
} from "@/shared/api/generated/models";
import { conversationTranslationApi } from "../api/conversation-translation.api";

export interface ConversationTranslationContext {
  projectId(): string | undefined;
  endUserId(): string | undefined;
  conversationId(): string | undefined;
  selectedCaseId(): string | undefined;
  sourceText(): string;
  macroReplyDraft?(): {
    id: string;
    sourceHash: string;
    version: number;
  } | null;
  restoreSourceText?(value: string): void;
  reconcileMessages?(): Promise<void>;
}

export interface ConversationTranslationApi {
  getConversation(
    projectId: string,
    endUserId: string,
    conversationId: string,
    selectedCaseId?: string,
  ): Promise<ConversationTranslationResponseDto>;
  updateConversation(
    projectId: string,
    endUserId: string,
    conversationId: string,
    value: UpdateConversationTranslationPreferenceDto,
    selectedCaseId?: string,
  ): Promise<ConversationTranslationResponseDto>;
  translateMessages(
    projectId: string,
    endUserId: string,
    conversationId: string,
    messageIds: string[],
    targetLocale: string,
    idempotencyKey: string,
  ): Promise<ConversationMessageTranslationsResponseDto>;
  getMessageTranslation(
    projectId: string,
    endUserId: string,
    conversationId: string,
    translationId: string,
  ): Promise<ConversationMessageTranslationItemResponseDto>;
  retryMessageTranslation(
    projectId: string,
    endUserId: string,
    conversationId: string,
    translationId: string,
    idempotencyKey: string,
  ): Promise<ConversationMessageTranslationItemResponseDto>;
  createReplyDraft(
    projectId: string,
    endUserId: string,
    conversationId: string,
    sourceText: string,
    sourceLocale: string,
    targetLocale: string,
    endUserCaseId?: string,
    idempotencyKey?: string,
    macroReplyDraft?: {
      id: string;
      sourceHash: string;
      version: number;
    },
  ): Promise<ReplyTranslationDraftResponseDto>;
  getReplyDraft(
    projectId: string,
    endUserId: string,
    conversationId: string,
    draftId: string,
  ): Promise<ReplyTranslationDraftResponseDto>;
  editReplyDraft(
    projectId: string,
    endUserId: string,
    conversationId: string,
    draftId: string,
    value: EditReplyTranslationDraftDto,
  ): Promise<ReplyTranslationDraftResponseDto>;
  retryReplyDraft(
    projectId: string,
    endUserId: string,
    conversationId: string,
    draftId: string,
    idempotencyKey: string,
  ): Promise<ReplyTranslationDraftResponseDto>;
}

const terminalDraftStatuses = new Set([
  "READY",
  "FAILED",
  "EXPIRED",
  "CONSUMED",
]);
const terminalMessageStatuses = new Set(["COMPLETED", "FAILED", "SKIPPED"]);

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function translationApiErrorCode(cause: unknown): string | null {
  const root = objectValue(cause);
  const response = objectValue(root?.response);
  const data = objectValue(response?.data);
  const payload = objectValue(data?.error);
  return typeof payload?.code === "string" ? payload.code : null;
}

export function translationOperationErrorMessage(
  cause: unknown,
  fallback: string,
): string {
  const code = translationApiErrorCode(cause);
  if (code === "TRANSLATION_DISABLED") {
    return "На сервере выключена обработка переводов. Включите processing workers и повторите попытку.";
  }
  if (
    code === "TRANSLATION_BUDGET_EXCEEDED" ||
    code === "TRANSLATION_GLOBAL_BUDGET_EXCEEDED"
  ) {
    return "Лимит переводов исчерпан. Проверьте бюджет проекта.";
  }
  if (
    code === "TRANSLATION_MODEL_UNAVAILABLE" ||
    code === "TRANSLATION_MODEL_PRICING_UNAVAILABLE" ||
    code === "TRANSLATION_PRICING_NOT_CONFIGURED"
  ) {
    return "Модель перевода или её тариф временно недоступны. Проверьте настройки модели.";
  }
  if (
    code === "TRANSLATION_PROVIDER_TIMEOUT" ||
    code === "TRANSLATION_PROVIDER_UNAVAILABLE"
  ) {
    return "Провайдер перевода временно недоступен. Повторите попытку позже.";
  }
  return fallback;
}

function contextKey(context: ConversationTranslationContext): string | null {
  const projectId = context.projectId();
  const endUserId = context.endUserId();
  const conversationId = context.conversationId();
  return projectId && endUserId && conversationId
    ? `${projectId}:${endUserId}:${conversationId}`
    : null;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

export function createConversationTranslationController(
  context: ConversationTranslationContext,
  api: ConversationTranslationApi = conversationTranslationApi,
) {
  const state = ref<ConversationTranslationResponseDto | null>(null);
  const loading = ref(false);
  const savingPreference = ref(false);
  const translatingMessageIds = ref(new Set<string>());
  const messageTranslations = ref(
    new Map<string, ConversationMessageTranslationItemResponseDto>(),
  );
  const draft = ref<ReplyTranslationDraftResponseDto | null>(null);
  const previewing = ref(false);
  const editingReply = ref(false);
  const previewStale = ref(false);
  const error = ref("");
  let generation = 0;
  let disposed = false;
  const messageAttemptKeys = new Map<string, string>();
  const draftAttemptKeys = new Map<string, string>();
  const retryAttemptKeys = new Map<string, string>();
  let replyEditPromise: Promise<void> | null = null;

  const readyDraft = computed(() => {
    const current = draft.value;
    return current?.status === "READY" &&
      current.sourceText === context.sourceText().trim() &&
      current.targetLocale === targetLocale.value
      ? current
      : null;
  });
  const targetLocale = computed(() => {
    const current = state.value;
    if (!current) return null;
    if (current.preference.endUserLocaleOverride) {
      return current.preference.endUserLocaleOverride;
    }
    return current.language.needsConfirmation ? null : current.language.locale;
  });
  const conversationLocale = computed(
    () =>
      state.value?.language.locale ??
      state.value?.preference.endUserLocaleOverride ??
      null,
  );

  function requiredContext() {
    const projectId = context.projectId();
    const endUserId = context.endUserId();
    const conversationId = context.conversationId();
    if (!projectId || !endUserId || !conversationId) {
      throw new Error("Диалог для перевода не выбран");
    }
    return { projectId, endUserId, conversationId };
  }

  function providerWorkUnavailableMessage(): string | null {
    if (!state.value?.availability.available) {
      return "Перевод временно недоступен. Исходный текст не будет отправлен автоматически.";
    }
    if (state.value.budget.hardExhausted) {
      return "Лимит переводов исчерпан. Исходный текст не будет отправлен автоматически.";
    }
    return null;
  }

  function setOperationError(cause: unknown, fallback: string): void {
    if (
      translationApiErrorCode(cause) === "TRANSLATION_DISABLED" &&
      state.value
    ) {
      state.value = {
        ...state.value,
        availability: {
          available: false,
          reason: "DEPLOYMENT_DISABLED",
        },
      };
    }
    error.value = translationOperationErrorMessage(cause, fallback);
  }

  function draftStorageKey(): string | null {
    const key = contextKey(context);
    return key ? `retenive:reply-translation-draft:${key}` : null;
  }

  function hasStoredReplyDraft(): boolean {
    const key = draftStorageKey();
    if (!key) return false;
    try {
      return Boolean(globalThis.sessionStorage?.getItem(key));
    } catch {
      return false;
    }
  }

  function persistDraftEnvelope(
    value: ReplyTranslationDraftResponseDto | null,
  ): void {
    const key = draftStorageKey();
    if (!key) return;
    try {
      if (
        !value ||
        ["CONSUMED", "EXPIRED"].includes(value.status) ||
        Date.parse(value.expiresAt) <= Date.now()
      ) {
        globalThis.sessionStorage?.removeItem(key);
        return;
      }
      globalThis.sessionStorage?.setItem(
        key,
        JSON.stringify({
          draftId: value.id,
          sourceTextHash: value.sourceTextHash,
          sourceLocale: value.sourceLocale,
          targetLocale: value.targetLocale,
          expiresAt: value.expiresAt,
        }),
      );
    } catch {
      // Same-tab CMS recovery is best-effort and cleared with the auth session.
    }
  }

  function scrubUnsafeDraftEnvelope(): void {
    const storageKey = draftStorageKey();
    if (!storageKey) return;
    try {
      const raw = globalThis.sessionStorage?.getItem(storageKey);
      if (!raw) return;
      const envelope: unknown = JSON.parse(raw);
      if (
        !envelope ||
        typeof envelope !== "object" ||
        Array.isArray(envelope) ||
        Object.hasOwn(envelope, "sourceText")
      ) {
        globalThis.sessionStorage?.removeItem(storageKey);
      }
    } catch {
      globalThis.sessionStorage?.removeItem(storageKey);
    }
  }

  async function recoverReplyDraft(): Promise<void> {
    const storageKey = draftStorageKey();
    if (!storageKey) return;
    try {
      const raw = globalThis.sessionStorage?.getItem(storageKey);
      if (!raw) return;
      const parsedEnvelope: unknown = JSON.parse(raw);
      if (
        !parsedEnvelope ||
        typeof parsedEnvelope !== "object" ||
        Array.isArray(parsedEnvelope)
      ) {
        globalThis.sessionStorage?.removeItem(storageKey);
        return;
      }
      const envelope = parsedEnvelope as {
        draftId?: unknown;
        expiresAt?: unknown;
        sourceText?: unknown;
        sourceTextHash?: unknown;
        sourceLocale?: unknown;
        targetLocale?: unknown;
      };
      const expiresAt =
        typeof envelope.expiresAt === "string"
          ? Date.parse(envelope.expiresAt)
          : Number.NaN;
      if (
        Object.hasOwn(envelope, "sourceText") ||
        typeof envelope.draftId !== "string" ||
        !Number.isFinite(expiresAt) ||
        expiresAt <= Date.now() ||
        typeof envelope.sourceTextHash !== "string" ||
        !envelope.sourceTextHash ||
        typeof envelope.sourceLocale !== "string" ||
        !envelope.sourceLocale ||
        typeof envelope.targetLocale !== "string"
      ) {
        globalThis.sessionStorage?.removeItem(storageKey);
        return;
      }
      const ids = requiredContext();
      const key = contextKey(context);
      const requestGeneration = generation;
      const response = await api.getReplyDraft(
        ids.projectId,
        ids.endUserId,
        ids.conversationId,
        envelope.draftId,
      );
      if (!isCurrent(key, requestGeneration)) return;

      const responseExpiresAt = Date.parse(response.expiresAt);
      const responseSourceText: unknown = response.sourceText;
      if (
        response.id !== envelope.draftId ||
        response.conversationId !== ids.conversationId ||
        response.sourceTextHash !== envelope.sourceTextHash ||
        response.sourceLocale !== envelope.sourceLocale ||
        response.targetLocale !== envelope.targetLocale ||
        response.expiresAt !== envelope.expiresAt ||
        !Number.isFinite(responseExpiresAt) ||
        responseExpiresAt <= Date.now() ||
        typeof responseSourceText !== "string" ||
        !responseSourceText.trim() ||
        responseSourceText.length > 10_000
      ) {
        globalThis.sessionStorage?.removeItem(storageKey);
        return;
      }

      const existingSourceText = context.sourceText().trim();
      if (existingSourceText && existingSourceText !== responseSourceText) {
        globalThis.sessionStorage?.removeItem(storageKey);
        return;
      }
      if (!existingSourceText) {
        if (!context.restoreSourceText) {
          globalThis.sessionStorage?.removeItem(storageKey);
          return;
        }
        context.restoreSourceText(responseSourceText);
      }
      if (context.sourceText().trim() !== responseSourceText) {
        globalThis.sessionStorage?.removeItem(storageKey);
        return;
      }

      draft.value = response;
      persistDraftEnvelope(response);
      if (!terminalDraftStatuses.has(response.status)) {
        void pollDraft(response, key, requestGeneration);
      }
    } catch {
      globalThis.sessionStorage?.removeItem(storageKey);
    }
  }

  function clearReplyDraft(): void {
    draft.value = null;
    previewStale.value = false;
    persistDraftEnvelope(null);
  }

  function isCurrent(key: string | null, requestGeneration: number): boolean {
    return (
      !disposed &&
      generation === requestGeneration &&
      contextKey(context) === key
    );
  }

  function reset(): void {
    generation += 1;
    state.value = null;
    messageTranslations.value = new Map();
    translatingMessageIds.value = new Set();
    draft.value = null;
    previewing.value = false;
    savingPreference.value = false;
    editingReply.value = false;
    replyEditPromise = null;
    previewStale.value = false;
    error.value = "";
    loading.value = false;
  }

  function cancelMessageTranslations(): void {
    generation += 1;
    translatingMessageIds.value = new Set();
  }

  async function load(): Promise<void> {
    reset();
    const key = contextKey(context);
    const requestGeneration = generation;
    if (!key) {
      return;
    }
    scrubUnsafeDraftEnvelope();
    loading.value = true;
    try {
      const ids = requiredContext();
      const response = await api.getConversation(
        ids.projectId,
        ids.endUserId,
        ids.conversationId,
        context.selectedCaseId(),
      );
      if (isCurrent(key, requestGeneration)) {
        state.value = response;
        await recoverReplyDraft();
      }
    } catch {
      if (isCurrent(key, requestGeneration)) {
        error.value = "Не удалось загрузить настройки перевода";
      }
    } finally {
      if (isCurrent(key, requestGeneration)) loading.value = false;
    }
  }

  async function updatePreference(
    patch: Partial<
      Pick<
        UpdateConversationTranslationPreferenceDto,
        "enabled" | "workingLocale" | "endUserLocaleOverride"
      >
    >,
  ): Promise<void> {
    const current = state.value;
    if (!current || savingPreference.value) return;
    const ids = requiredContext();
    const key = contextKey(context);
    const requestGeneration = generation;
    const previousTargetLocale = targetLocale.value;
    savingPreference.value = true;
    error.value = "";
    try {
      const response = await api.updateConversation(
        ids.projectId,
        ids.endUserId,
        ids.conversationId,
        {
          enabled: patch.enabled ?? current.preference.enabled,
          workingLocale:
            patch.workingLocale ?? current.preference.workingLocale,
          endUserLocaleOverride: Object.prototype.hasOwnProperty.call(
            patch,
            "endUserLocaleOverride",
          )
            ? (patch.endUserLocaleOverride ?? null)
            : current.preference.endUserLocaleOverride,
          expectedUpdatedAt: current.preference.updatedAt,
        },
        context.selectedCaseId(),
      );
      if (isCurrent(key, requestGeneration)) {
        state.value = response;
        const nextTargetLocale =
          response.preference.endUserLocaleOverride ??
          (response.language.needsConfirmation
            ? null
            : response.language.locale);
        if (draft.value && nextTargetLocale !== previousTargetLocale) {
          previewStale.value =
            draft.value.sourceText !== context.sourceText().trim() ||
            draft.value.targetLocale !== nextTargetLocale;
        }
      }
    } catch {
      if (isCurrent(key, requestGeneration)) {
        error.value = "Не удалось изменить настройки перевода";
      }
    } finally {
      if (isCurrent(key, requestGeneration)) savingPreference.value = false;
    }
  }

  function upsertMessageTranslation(
    item: ConversationMessageTranslationItemResponseDto,
  ): void {
    const next = new Map(messageTranslations.value);
    next.set(item.messageId, item);
    messageTranslations.value = next;
  }

  async function pollMessageTranslation(
    translationId: string,
    messageId: string,
    key: string | null,
    requestGeneration: number,
  ): Promise<void> {
    for (const delay of [350, 700, 1_400, 2_800, 5_000, 10_000, 15_000]) {
      await wait(delay);
      if (!isCurrent(key, requestGeneration)) return;
      const ids = requiredContext();
      let item: ConversationMessageTranslationItemResponseDto;
      try {
        item = await api.getMessageTranslation(
          ids.projectId,
          ids.endUserId,
          ids.conversationId,
          translationId,
        );
      } catch {
        if (isCurrent(key, requestGeneration)) {
          error.value =
            "Статус перевода временно недоступен. Проверка продолжится.";
        }
        continue;
      }
      if (!isCurrent(key, requestGeneration)) return;
      upsertMessageTranslation(item);
      if (terminalMessageStatuses.has(item.state)) return;
    }
    const next = new Set(translatingMessageIds.value);
    next.delete(messageId);
    translatingMessageIds.value = next;
  }

  async function reconcileMessage(messageId: string): Promise<void> {
    const existing = messageTranslations.value.get(messageId);
    if (!existing?.translationId) {
      await context.reconcileMessages?.();
      return;
    }
    const ids = requiredContext();
    const key = contextKey(context);
    const requestGeneration = generation;
    translatingMessageIds.value = new Set([
      ...translatingMessageIds.value,
      messageId,
    ]);
    error.value = "";
    try {
      const item = await api.getMessageTranslation(
        ids.projectId,
        ids.endUserId,
        ids.conversationId,
        existing.translationId,
      );
      if (!isCurrent(key, requestGeneration)) return;
      upsertMessageTranslation(item);
      if (!terminalMessageStatuses.has(item.state)) {
        await pollMessageTranslation(
          existing.translationId,
          messageId,
          key,
          requestGeneration,
        );
      }
    } catch {
      if (isCurrent(key, requestGeneration)) {
        error.value = "Не удалось сверить статус перевода. Попробуйте ещё раз.";
      }
    } finally {
      if (isCurrent(key, requestGeneration)) {
        const next = new Set(translatingMessageIds.value);
        next.delete(messageId);
        translatingMessageIds.value = next;
      }
    }
  }

  async function translateMessages(messageIds: string[]): Promise<void> {
    const unavailableMessage = providerWorkUnavailableMessage();
    if (unavailableMessage) {
      error.value = unavailableMessage;
      return;
    }
    const locale = state.value?.preference.workingLocale;
    const eligible = [...new Set(messageIds)]
      .filter((messageId) => !translatingMessageIds.value.has(messageId))
      .slice(0, 50);
    if (!locale || eligible.length === 0) return;
    const ids = requiredContext();
    const key = contextKey(context);
    const requestGeneration = generation;
    translatingMessageIds.value = new Set([
      ...translatingMessageIds.value,
      ...eligible,
    ]);
    error.value = "";
    const attemptId = `${ids.conversationId}:${eligible.join(",")}`;
    try {
      const idempotencyKey =
        messageAttemptKeys.get(attemptId) ?? globalThis.crypto.randomUUID();
      messageAttemptKeys.set(attemptId, idempotencyKey);
      const response = await api.translateMessages(
        ids.projectId,
        ids.endUserId,
        ids.conversationId,
        eligible,
        locale,
        idempotencyKey,
      );
      messageAttemptKeys.delete(attemptId);
      if (!isCurrent(key, requestGeneration)) return;
      for (const item of response.items) upsertMessageTranslation(item);
      const pending = response.items.filter(
        (item) =>
          item.translationId && !terminalMessageStatuses.has(item.state),
      );
      if (pending.length) {
        await Promise.all(
          pending.map((item) =>
            pollMessageTranslation(
              item.translationId!,
              item.messageId,
              key,
              requestGeneration,
            ),
          ),
        );
      }
    } catch (cause) {
      if (isCurrent(key, requestGeneration)) {
        setOperationError(cause, "Не удалось перевести сообщения");
        try {
          await context.reconcileMessages?.();
          if (isCurrent(key, requestGeneration)) {
            const next = new Map(messageTranslations.value);
            for (const messageId of eligible) next.delete(messageId);
            messageTranslations.value = next;
          }
        } catch {
          // The next manual action reuses the same idempotency key.
        }
      }
    } finally {
      if (isCurrent(key, requestGeneration)) {
        const next = new Set(translatingMessageIds.value);
        for (const messageId of eligible) next.delete(messageId);
        translatingMessageIds.value = next;
      }
    }
  }

  async function translateMessage(messageId: string): Promise<void> {
    await translateMessages([messageId]);
  }

  async function retryMessage(messageId: string): Promise<void> {
    const unavailableMessage = providerWorkUnavailableMessage();
    if (unavailableMessage) {
      error.value = unavailableMessage;
      return;
    }
    const existing = messageTranslations.value.get(messageId);
    if (!existing?.translationId) return;
    const ids = requiredContext();
    const key = contextKey(context);
    const requestGeneration = generation;
    const idempotencyKey =
      retryAttemptKeys.get(existing.translationId) ??
      globalThis.crypto.randomUUID();
    retryAttemptKeys.set(existing.translationId, idempotencyKey);
    const item = await api.retryMessageTranslation(
      ids.projectId,
      ids.endUserId,
      ids.conversationId,
      existing.translationId,
      idempotencyKey,
    );
    retryAttemptKeys.delete(existing.translationId);
    if (!isCurrent(key, requestGeneration)) return;
    upsertMessageTranslation(item);
    if (!terminalMessageStatuses.has(item.state)) {
      await pollMessageTranslation(
        existing.translationId,
        messageId,
        key,
        requestGeneration,
      );
    }
  }

  function mergeRealtimeTranslation(value: unknown): boolean {
    if (!value || typeof value !== "object") return false;
    const envelope = value as Record<string, unknown>;
    const ids =
      context.projectId() && context.endUserId() && context.conversationId()
        ? requiredContext()
        : null;
    const translation =
      envelope.translation && typeof envelope.translation === "object"
        ? (envelope.translation as Record<string, unknown>)
        : null;
    const states = ["PENDING", "RUNNING", "COMPLETED", "FAILED"] as const;
    if (
      !ids ||
      envelope.contractVersion !== 1 ||
      envelope.projectId !== ids.projectId ||
      envelope.endUserId !== ids.endUserId ||
      envelope.conversationId !== ids.conversationId ||
      typeof envelope.messageId !== "string" ||
      !translation ||
      typeof translation.id !== "string" ||
      translation.sourceMessageId !== envelope.messageId ||
      !states.includes(translation.status as (typeof states)[number]) ||
      typeof translation.targetLocale !== "string" ||
      typeof translation.updatedAt !== "string" ||
      !Number.isFinite(Date.parse(translation.updatedAt)) ||
      (translation.translatedText !== null &&
        typeof translation.translatedText !== "string")
    ) {
      return false;
    }
    const incoming: ConversationMessageTranslationItemResponseDto = {
      messageId: envelope.messageId,
      translationId: translation.id,
      state: translation.status as (typeof states)[number],
      sourceLocale:
        typeof translation.sourceLocale === "string"
          ? translation.sourceLocale
          : null,
      targetLocale: translation.targetLocale,
      translatedText:
        typeof translation.translatedText === "string"
          ? translation.translatedText
          : null,
      errorCode:
        typeof translation.errorCode === "string"
          ? translation.errorCode
          : null,
      warnings: Array.isArray(translation.warnings)
        ? translation.warnings.filter(
            (warning): warning is string => typeof warning === "string",
          )
        : [],
      updatedAt: translation.updatedAt,
    };
    const existing = messageTranslations.value.get(incoming.messageId);
    if (existing?.updatedAt) {
      const statusRank: Record<string, number> = {
        PENDING: 0,
        RUNNING: 1,
        SKIPPED: 2,
        FAILED: 2,
        COMPLETED: 3,
      };
      if (
        Date.parse(existing.updatedAt) > Date.parse(incoming.updatedAt!) ||
        (existing.updatedAt === incoming.updatedAt &&
          (statusRank[existing.state] ?? -1) >=
            (statusRank[incoming.state] ?? -1))
      ) {
        return false;
      }
    }
    upsertMessageTranslation(incoming);
    return true;
  }

  async function pollDraft(
    first: ReplyTranslationDraftResponseDto,
    key: string | null,
    requestGeneration: number,
  ): Promise<ReplyTranslationDraftResponseDto | null> {
    let current = first;
    for (const delay of [
      350, 700, 1_400, 2_800, 5_000, 10_000, 15_000, 25_000,
    ]) {
      if (terminalDraftStatuses.has(current.status)) return current;
      await wait(delay);
      if (!isCurrent(key, requestGeneration)) return null;
      const ids = requiredContext();
      try {
        current = await api.getReplyDraft(
          ids.projectId,
          ids.endUserId,
          ids.conversationId,
          current.id,
        );
      } catch {
        if (isCurrent(key, requestGeneration)) {
          error.value =
            "Статус перевода временно недоступен. Проверка продолжится.";
        }
        continue;
      }
      if (isCurrent(key, requestGeneration)) {
        draft.value = current;
        persistDraftEnvelope(current);
      }
    }
    return current;
  }

  async function reconcileReplyPreview(): Promise<void> {
    const current = draft.value;
    if (!current || previewing.value) return;
    const ids = requiredContext();
    const key = contextKey(context);
    const requestGeneration = generation;
    previewing.value = true;
    error.value = "";
    try {
      const response = await api.getReplyDraft(
        ids.projectId,
        ids.endUserId,
        ids.conversationId,
        current.id,
      );
      if (!isCurrent(key, requestGeneration)) return;
      draft.value = response;
      persistDraftEnvelope(response);
      if (!terminalDraftStatuses.has(response.status)) {
        await pollDraft(response, key, requestGeneration);
      }
    } catch {
      if (isCurrent(key, requestGeneration)) {
        error.value = "Не удалось сверить статус перевода. Попробуйте ещё раз.";
      }
    } finally {
      if (isCurrent(key, requestGeneration)) previewing.value = false;
    }
  }

  async function createReplyPreview(
    options: { poll?: boolean } = {},
  ): Promise<ReplyTranslationDraftResponseDto | null> {
    if (readyDraft.value) {
      previewStale.value = false;
      return readyDraft.value;
    }
    const sourceText = context.sourceText().trim();
    const current = state.value ?? (await load(), state.value);
    const locale = targetLocale.value;
    if (!current || !sourceText || !locale || previewing.value) return null;
    const unavailableMessage = providerWorkUnavailableMessage();
    if (unavailableMessage) {
      error.value = unavailableMessage;
      return null;
    }
    const ids = requiredContext();
    const key = contextKey(context);
    const requestGeneration = generation;
    previewing.value = true;
    previewStale.value = false;
    error.value = "";
    try {
      const macroReplyDraft = context.macroReplyDraft?.() ?? undefined;
      const fingerprint = [
        ids.conversationId,
        sourceText,
        current.preference.workingLocale,
        locale,
        macroReplyDraft?.id ?? "",
        macroReplyDraft?.sourceHash ?? "",
        macroReplyDraft?.version ?? "",
      ].join("\u001f");
      let response = await api.createReplyDraft(
        ids.projectId,
        ids.endUserId,
        ids.conversationId,
        sourceText,
        current.preference.workingLocale,
        locale,
        context.selectedCaseId(),
        (() => {
          const key =
            draftAttemptKeys.get(fingerprint) ?? globalThis.crypto.randomUUID();
          draftAttemptKeys.set(fingerprint, key);
          return key;
        })(),
        ...(macroReplyDraft ? [macroReplyDraft] : []),
      );
      draftAttemptKeys.delete(fingerprint);
      if (!isCurrent(key, requestGeneration)) return null;
      draft.value = response;
      persistDraftEnvelope(response);
      if (
        options.poll !== false &&
        !terminalDraftStatuses.has(response.status)
      ) {
        response =
          (await pollDraft(response, key, requestGeneration)) ?? response;
      }
      return isCurrent(key, requestGeneration) ? response : null;
    } catch (cause) {
      if (isCurrent(key, requestGeneration)) {
        setOperationError(cause, "Не удалось подготовить перевод ответа");
      }
      return null;
    } finally {
      if (isCurrent(key, requestGeneration)) previewing.value = false;
    }
  }

  async function editReplyTranslation(text: string): Promise<void> {
    if (replyEditPromise) return replyEditPromise;
    const current = readyDraft.value;
    if (!current) return;
    const ids = requiredContext();
    const key = contextKey(context);
    const requestGeneration = generation;
    editingReply.value = true;
    const editPromise = (async () => {
      const response = await api.editReplyDraft(
        ids.projectId,
        ids.endUserId,
        ids.conversationId,
        current.id,
        {
          editedTranslatedText: text.trim() || null,
          expectedUpdatedAt: current.updatedAt,
        },
      );
      if (!isCurrent(key, requestGeneration)) return;
      draft.value = response;
      persistDraftEnvelope(response);
    })();
    replyEditPromise = editPromise;
    try {
      await editPromise;
    } finally {
      if (replyEditPromise === editPromise) replyEditPromise = null;
      if (isCurrent(key, requestGeneration)) editingReply.value = false;
    }
  }

  async function flushReplyEdit(): Promise<void> {
    await replyEditPromise;
  }

  async function retryReplyPreview(): Promise<void> {
    const unavailableMessage = providerWorkUnavailableMessage();
    if (unavailableMessage) {
      error.value = unavailableMessage;
      return;
    }
    const current = draft.value;
    if (!current || previewing.value) return;
    const ids = requiredContext();
    const key = contextKey(context);
    const requestGeneration = generation;
    previewing.value = true;
    error.value = "";
    try {
      const idempotencyKey =
        retryAttemptKeys.get(current.id) ?? globalThis.crypto.randomUUID();
      retryAttemptKeys.set(current.id, idempotencyKey);
      const response = await api.retryReplyDraft(
        ids.projectId,
        ids.endUserId,
        ids.conversationId,
        current.id,
        idempotencyKey,
      );
      retryAttemptKeys.delete(current.id);
      if (!isCurrent(key, requestGeneration)) return;
      draft.value = response;
      persistDraftEnvelope(response);
      await pollDraft(response, key, requestGeneration);
    } catch (cause) {
      if (isCurrent(key, requestGeneration)) {
        setOperationError(cause, "Не удалось повторить перевод ответа");
      }
    } finally {
      if (isCurrent(key, requestGeneration)) previewing.value = false;
    }
  }

  watch(
    () => context.sourceText(),
    (next, previous) => {
      if (next === previous || !draft.value) return;
      if (!next.trim()) {
        clearReplyDraft();
        return;
      }
      previewStale.value =
        next.trim() !== draft.value.sourceText ||
        draft.value.targetLocale !== targetLocale.value;
    },
  );
  onScopeDispose(() => {
    disposed = true;
    generation += 1;
  });

  return {
    state,
    loading,
    savingPreference,
    translatingMessageIds,
    messageTranslations,
    draft,
    readyDraft,
    conversationLocale,
    targetLocale,
    previewing,
    editingReply,
    previewStale,
    error,
    reset,
    cancelMessageTranslations,
    load,
    hasStoredReplyDraft,
    recoverReplyDraft,
    clearReplyDraft,
    updatePreference,
    translateMessage,
    translateMessages,
    retryMessage,
    reconcileMessage,
    mergeRealtimeTranslation,
    reconcileReplyPreview,
    createReplyPreview,
    editReplyTranslation,
    flushReplyEdit,
    retryReplyPreview,
  };
}
