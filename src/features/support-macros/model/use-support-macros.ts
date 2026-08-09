import { computed, ref } from "vue";
import { ApiError } from "@/shared/api/http/api-error";
import type {
  SupportMacroCatalogRequest,
  SupportMacroDraftTarget,
  SupportMacroSource,
} from "@/features/support-macros/api/support-macros-source";
import type {
  SupportMacroReplyDraftResponseDto,
  SupportMacroResponseDto,
  SupportMacroCatalogFreshnessDto,
} from "@/shared/api/generated/models";

export interface SupportMacroContext {
  projectId(): string | undefined;
  actorId(): string | undefined;
  canRead(): boolean;
  canUse(): boolean;
  target(): Omit<SupportMacroDraftTarget, "projectId" | "macroId" | "expectedMacroRevisionId"> | null;
  catalogContext?(): Partial<Pick<SupportMacroCatalogRequest, "locale" | "teamId" | "topicCode">>;
  onForbidden?(): void | Promise<void>;
}

interface ActiveMacroDraft {
  scopeKey: string;
  target: SupportMacroDraftTarget;
  receipt: SupportMacroReplyDraftResponseDto;
  sourceText: string;
}

function targetScope(target: SupportMacroDraftTarget): string {
  return [
    target.projectId,
    target.kind,
    target.endUserId ?? "",
    target.conversationId ?? "",
    target.caseId ?? "",
  ].join("\u001f");
}

function receiptMatchesTarget(
  receipt: SupportMacroReplyDraftResponseDto,
  target: SupportMacroDraftTarget,
): boolean {
  return Boolean(
    receipt.state === "READY" &&
      receipt.targetKind === target.kind &&
      receipt.macroId === target.macroId &&
      receipt.macroRevisionId === target.expectedMacroRevisionId &&
      (target.kind !== "PUBLIC_REPLY" ||
        receipt.conversationId === target.conversationId) &&
      (!target.caseId || receipt.endUserCaseId === target.caseId) &&
      receipt.text,
  );
}

function errorCopy(cause: unknown): string {
  if (!(cause instanceof ApiError)) return "Не удалось загрузить macros. Повторите попытку.";
  if (cause.status === 409)
    return "Каталог или macro изменился. Список обновлён — выберите актуальную версию.";
  if (cause.status === 503)
    return "Macros временно недоступны для этого проекта.";
  return "Не удалось загрузить macros. Повторите попытку.";
}

/** Owns the operator Macro catalog and exactly one editable draft for the selected Surface. */
export function createSupportMacroController(
  context: SupportMacroContext,
  source: SupportMacroSource,
) {
  const items = ref<SupportMacroResponseDto[]>([]);
  const nextCursor = ref<string | null>(null);
  const freshness = ref<SupportMacroCatalogFreshnessDto | null>(null);
  const query = ref("");
  const loading = ref(false);
  const loadingMore = ref(false);
  const applyingId = ref<string | null>(null);
  const savingDraft = ref(false);
  const error = ref("");
  const recoveryRequired = ref(false);
  const activeDraft = ref<ActiveMacroDraft | null>(null);
  let generation = 0;
  let abort: AbortController | null = null;
  let applyToken: symbol | null = null;
  const draftCommandKeys = new Map<string, string>();

  const canOpen = computed(() =>
    Boolean(
      context.projectId() && context.actorId() && context.canRead() && context.canUse(),
    ),
  );

  function reset(options: { keepQuery?: boolean } = {}): void {
    generation += 1;
    abort?.abort();
    abort = null;
    items.value = [];
    nextCursor.value = null;
    freshness.value = null;
    loading.value = false;
    loadingMore.value = false;
    applyingId.value = null;
    savingDraft.value = false;
    error.value = "";
    recoveryRequired.value = false;
    activeDraft.value = null;
    applyToken = null;
    draftCommandKeys.clear();
    if (!options.keepQuery) query.value = "";
  }

  async function forbidden(): Promise<void> {
    reset();
    await context.onForbidden?.();
  }

  function requireRecovery(message = "Macro изменился или больше недоступен. Выберите актуальный macro перед отправкой."): void {
    activeDraft.value = null;
    recoveryRequired.value = true;
    error.value = message;
  }

  async function load(cursor?: string): Promise<void> {
    const projectId = context.projectId();
    if (
      !projectId ||
      !context.actorId() ||
      !context.canRead() ||
      !context.canUse()
    ) {
      reset({ keepQuery: true });
      return;
    }
    abort?.abort();
    const requestGeneration = ++generation;
    const requestAbort = new AbortController();
    abort = requestAbort;
    if (cursor) loadingMore.value = true;
    else {
      loading.value = true;
      if (!recoveryRequired.value) error.value = "";
    }
    try {
      const page = await source.catalog(
        projectId,
        {
          ...(query.value.trim() ? { query: query.value.trim() } : {}),
          ...context.catalogContext?.(),
          ...(cursor ? { cursor } : {}),
          limit: 30,
        },
        requestAbort.signal,
      );
      if (requestGeneration !== generation || context.projectId() !== projectId)
        return;
      items.value = cursor ? [...items.value, ...page.items] : page.items;
      nextCursor.value = page.nextCursor;
      freshness.value = page.freshness;
    } catch (cause) {
      if (requestGeneration !== generation) return;
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) {
        await forbidden();
        return;
      }
      if (cause instanceof ApiError && cause.status === 409 && cursor) {
        error.value = errorCopy(cause);
        await load();
        return;
      }
      if (!recoveryRequired.value) error.value = errorCopy(cause);
    } finally {
      if (requestGeneration === generation) {
        loading.value = false;
        loadingMore.value = false;
        abort = null;
      }
    }
  }

  function currentTarget(macro: SupportMacroResponseDto): SupportMacroDraftTarget | null {
    const projectId = context.projectId();
    const target = context.target();
    const revisionId = macro.publishedRevision?.id;
    if (!projectId || !target || !revisionId || macro.lifecycle !== "ACTIVE") return null;
    return {
      ...target,
      projectId,
      macroId: macro.id,
      expectedMacroRevisionId: revisionId,
    };
  }

  async function apply(macro: SupportMacroResponseDto): Promise<string | null> {
    if (!canOpen.value || applyingId.value) return null;
    const target = currentTarget(macro);
    if (!target) {
      error.value = "Macro больше не опубликован. Обновите каталог.";
      return null;
    }
    const requestGeneration = generation;
    const token = Symbol("macro-apply");
    applyToken = token;
    applyingId.value = macro.id;
    error.value = "";
    try {
      const identity = `${targetScope(target)}\u001f${target.macroId}\u001f${target.expectedMacroRevisionId}`;
      const idempotencyKey =
        draftCommandKeys.get(identity) ?? globalThis.crypto.randomUUID();
      draftCommandKeys.set(identity, idempotencyKey);
      const receipt = await source.createDraft(target, idempotencyKey);
      if (
        requestGeneration !== generation ||
        targetScope(target) !== targetScope({ ...target, ...(context.target() ?? {}) })
      )
        return null;
      if (!receiptMatchesTarget(receipt, target))
        throw new Error("Support Macro draft receipt failed integrity validation");
      activeDraft.value = {
        scopeKey: targetScope(target),
        target,
        receipt,
        sourceText: receipt.text!,
      };
      recoveryRequired.value = false;
      draftCommandKeys.delete(identity);
      return receipt.text!;
    } catch (cause) {
      if (requestGeneration !== generation) return null;
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) {
        await forbidden();
        return null;
      }
      error.value = errorCopy(cause);
      if (cause instanceof ApiError && cause.status === 409) void load();
      return null;
    } finally {
      if (applyToken === token) {
        applyToken = null;
        applyingId.value = null;
      }
    }
  }

  async function prepareForSend(text: string): Promise<string | null> {
    const active = activeDraft.value;
    const normalized = text.trim();
    if (!active) return null;
    const current = context.target();
    const projectId = context.projectId();
    const currentScope = current && projectId
      ? targetScope({
          ...current,
          projectId,
          macroId: active.target.macroId,
          expectedMacroRevisionId: active.target.expectedMacroRevisionId,
        })
      : null;
    if (!normalized || !currentScope || active.scopeKey !== currentScope) {
      activeDraft.value = null;
      return null;
    }
    savingDraft.value = true;
    error.value = "";
    try {
      const receipt = await source.editDraft({
        ...active.target,
        draftId: active.receipt.id,
        actionEtag: active.receipt.actionEtag,
        text: normalized,
      });
      if (activeDraft.value !== active) return null;
      if (
        !receiptMatchesTarget(receipt, active.target) ||
        receipt.id !== active.receipt.id ||
        receipt.version <= active.receipt.version
      )
        throw new Error("Support Macro edit receipt failed integrity validation");
      activeDraft.value = { ...active, receipt };
      return receipt.id;
    } catch (cause) {
      if (activeDraft.value !== active) return null;
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) {
        await forbidden();
        return null;
      }
      const message =
        cause instanceof ApiError && cause.status === 409
          ? "Macro draft изменился или истёк. Ваш текст сохранён — примените macro заново."
          : "Не удалось сохранить изменения macro. Ваш текст не потерян.";
      requireRecovery(message);
      return null;
    } finally {
      savingDraft.value = false;
    }
  }

  function detachIfChanged(text: string): void {
    const active = activeDraft.value;
    if (!active || text.trim()) return;
    activeDraft.value = null;
  }

  return {
    items,
    nextCursor,
    freshness,
    query,
    loading,
    loadingMore,
    applyingId,
    savingDraft,
    error,
    recoveryRequired,
    activeDraft,
    canOpen,
    load,
    apply,
    prepareForSend,
    detachIfChanged,
    requireRecovery,
    reset,
  };
}
