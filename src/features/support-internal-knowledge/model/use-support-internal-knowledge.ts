import { computed, ref, shallowRef } from "vue";
import type { SupportKnowledgeCitationDraftResponseDto, SupportKnowledgeSearchItemResponseDto } from "@/shared/api/generated/models";
import { ApiError } from "@/shared/api/http/api-error";
import type {
  SupportInternalKnowledgeSource,
  SupportKnowledgeFreshness,
  SupportKnowledgeScope,
  SupportKnowledgeTextDocument,
} from "../api/support-internal-knowledge-source";

export interface SupportInternalKnowledgeContext {
  scope(): SupportKnowledgeScope | null;
  allowed(): boolean;
  canInsert(): boolean;
  onInsert(text: string): void;
  onForbidden(): void | Promise<void>;
}

function message(cause: unknown): string {
  if (cause instanceof ApiError && cause.status === 429) return "Слишком много запросов. Попробуйте через несколько секунд.";
  if (cause instanceof ApiError && cause.status === 503) return "Внутренняя база временно недоступна. Черновик ответа не изменён.";
  return "Не удалось загрузить внутреннюю базу знаний.";
}

function sameScope(left: SupportKnowledgeScope | null, right: SupportKnowledgeScope): boolean {
  return Boolean(left && left.projectId === right.projectId && left.caseId === right.caseId && left.conversationId === right.conversationId);
}

export function createSupportInternalKnowledgeController(context: SupportInternalKnowledgeContext, source: SupportInternalKnowledgeSource) {
  const query = ref("");
  const items = shallowRef<SupportKnowledgeSearchItemResponseDto[]>([]);
  const nextCursor = ref<string | null>(null);
  const freshness = shallowRef<SupportKnowledgeFreshness | null>(null);
  const selected = shallowRef<SupportKnowledgeTextDocument | null>(null);
  const activeCitation = shallowRef<SupportKnowledgeCitationDraftResponseDto | null>(null);
  const loading = ref(false);
  const openingId = ref<string | null>(null);
  const inserting = ref(false);
  const preparing = ref(false);
  const downloadingId = ref<string | null>(null);
  const error = ref("");
  const recoveryRequired = ref(false);
  let generation = 0;
  let openGeneration = 0;
  let insertToken: symbol | null = null;
  let prepareToken: symbol | null = null;
  let abort: AbortController | null = null;

  const canSearch = computed(() => context.allowed() && query.value.trim().length > 0 && !loading.value);
  const canInsert = computed(
    () =>
      context.allowed() &&
      context.canInsert() &&
      !activeCitation.value &&
      !recoveryRequired.value,
  );

  function purge(options: { keepQuery?: boolean } = {}): void {
    generation += 1;
    openGeneration += 1;
    abort?.abort();
    abort = null;
    items.value = [];
    nextCursor.value = null;
    freshness.value = null;
    selected.value = null;
    activeCitation.value = null;
    loading.value = false;
    openingId.value = null;
    inserting.value = false;
    preparing.value = false;
    insertToken = null;
    prepareToken = null;
    downloadingId.value = null;
    error.value = "";
    recoveryRequired.value = false;
    if (!options.keepQuery) query.value = "";
  }

  async function forbidden(): Promise<void> {
    purge({ keepQuery: true });
    await context.onForbidden();
  }

  async function search(cursor?: string): Promise<void> {
    const scope = context.scope();
    const q = query.value.trim();
    if (!scope || !context.allowed() || !q) return;
    abort?.abort();
    const requestAbort = new AbortController();
    abort = requestAbort;
    const requestGeneration = ++generation;
    loading.value = true;
    error.value = "";
    try {
      const page = await source.search(scope, q, cursor, requestAbort.signal);
      if (requestGeneration !== generation || !sameScope(context.scope(), scope) || !context.allowed()) return;
      items.value = cursor ? [...items.value, ...page.items] : page.items;
      nextCursor.value = page.nextCursor ?? null;
      freshness.value = page.freshness;
    } catch (cause) {
      if (
        requestGeneration !== generation ||
        requestAbort.signal.aborted ||
        !sameScope(context.scope(), scope)
      )
        return;
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) return forbidden();
      if (cause instanceof ApiError && cause.status === 409 && cursor) {
        nextCursor.value = null;
        return search();
      }
      error.value = message(cause);
    } finally {
      if (requestGeneration === generation) loading.value = false;
    }
  }

  async function open(item: SupportKnowledgeSearchItemResponseDto): Promise<void> {
    const scope = context.scope();
    if (!scope || !context.allowed() || !item.allowedActions.includes("OPEN")) return;
    const requestGeneration = generation;
    const requestOpenGeneration = ++openGeneration;
    openingId.value = item.documentId;
    error.value = "";
    try {
      const document = await source.open(scope, item);
      if (
        requestGeneration !== generation ||
        requestOpenGeneration !== openGeneration ||
        !sameScope(context.scope(), scope) ||
        !context.allowed()
      )
        return;
      if (document.documentId !== item.documentId || document.revisionId !== item.revisionId) throw new Error("Knowledge source changed identity");
      selected.value = document;
    } catch (cause) {
      if (
        requestGeneration !== generation ||
        requestOpenGeneration !== openGeneration ||
        !sameScope(context.scope(), scope)
      )
        return;
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) return forbidden();
      if (cause instanceof ApiError && cause.status === 409) {
        selected.value = null;
        error.value = "Материал обновился. Выполните поиск ещё раз.";
        return search();
      }
      error.value = message(cause);
    } finally {
      if (
        requestGeneration === generation &&
        requestOpenGeneration === openGeneration
      )
        openingId.value = null;
    }
  }

  async function insert(item: SupportKnowledgeSearchItemResponseDto, mode: "QUOTE" | "LINK", selectedText?: string): Promise<void> {
    const scope = context.scope();
    if (!scope || !canInsert.value || inserting.value) return;
    const action = mode === "QUOTE" ? "INSERT_QUOTE" : "INSERT_LINK";
    if (!item.allowedActions.includes(action) || (mode === "QUOTE" && !selectedText?.trim())) return;
    const requestGeneration = generation;
    const requestToken = Symbol("knowledge-insert");
    insertToken = requestToken;
    inserting.value = true;
    error.value = "";
    try {
      const draft = await source.createCitation(scope, item, mode, selectedText?.trim());
      if (
        requestGeneration !== generation ||
        insertToken !== requestToken ||
        !sameScope(context.scope(), scope) ||
        !context.allowed() ||
        !context.canInsert()
      )
        return;
      if (draft.documentId !== item.documentId || draft.revisionId !== item.revisionId || draft.state !== "READY" || !draft.text) throw new Error("Knowledge citation draft is not ready");
      activeCitation.value = draft;
      recoveryRequired.value = false;
      context.onInsert(draft.text);
    } catch (cause) {
      if (
        requestGeneration !== generation ||
        insertToken !== requestToken ||
        !sameScope(context.scope(), scope)
      )
        return;
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) return forbidden();
      error.value = "Не удалось вставить материал. Черновик ответа не изменён.";
    } finally {
      if (requestGeneration === generation && insertToken === requestToken) {
        insertToken = null;
        inserting.value = false;
      }
    }
  }

  async function prepareForSend(text: string): Promise<string | undefined> {
    const scope = context.scope();
    const draft = activeCitation.value;
    if (
      !scope ||
      !draft ||
      !context.allowed() ||
      !context.canInsert() ||
      recoveryRequired.value ||
      preparing.value
    )
      return undefined;
    if (draft.state === "READY" && draft.text === text) return draft.id;
    const requestGeneration = generation;
    const requestToken = Symbol("knowledge-prepare");
    prepareToken = requestToken;
    preparing.value = true;
    try {
      const updated = await source.updateCitation(scope, draft, text);
      if (
        requestGeneration !== generation ||
        prepareToken !== requestToken ||
        !sameScope(context.scope(), scope) ||
        !context.allowed() ||
        !context.canInsert()
      )
        return undefined;
      if (
        updated.id !== draft.id ||
        updated.documentId !== draft.documentId ||
        updated.revisionId !== draft.revisionId ||
        updated.mode !== draft.mode ||
        updated.state !== "READY" ||
        updated.text !== text
      )
        throw new Error("Knowledge citation edit did not converge");
      activeCitation.value = updated;
      return updated.id;
    } catch (cause) {
      if (
        requestGeneration !== generation ||
        prepareToken !== requestToken ||
        !sameScope(context.scope(), scope)
      )
        return undefined;
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) await forbidden();
      else {
        activeCitation.value = null;
        recoveryRequired.value = true;
        error.value = "Источник изменился или больше недоступен. Текст сохранён — выберите материал заново.";
      }
      return undefined;
    } finally {
      if (
        requestGeneration === generation &&
        prepareToken === requestToken
      ) {
        prepareToken = null;
        preparing.value = false;
      }
    }
  }

  async function download(item: SupportKnowledgeSearchItemResponseDto): Promise<void> {
    const scope = context.scope();
    if (!scope || !context.allowed() || !item.allowedActions.includes("DOWNLOAD")) return;
    const requestGeneration = generation;
    const pendingWindow = globalThis.open?.("about:blank", "_blank");
    if (pendingWindow) pendingWindow.opener = null;
    downloadingId.value = item.documentId;
    try {
      const result = await source.download(scope, item);
      if (
        requestGeneration !== generation ||
        !sameScope(context.scope(), scope) ||
        !context.allowed()
      ) {
        pendingWindow?.close();
        return;
      }
      if (
        result.documentId !== item.documentId ||
        result.revisionId !== item.revisionId
      )
        throw new Error("Knowledge download changed identity");
      const url = new URL(result.url);
      if (url.protocol !== "https:") throw new Error("Unsafe Knowledge download URL");
      if (!pendingWindow) throw new Error("Knowledge download popup was blocked");
      pendingWindow.location.replace(url.toString());
    } catch (cause) {
      pendingWindow?.close();
      if (
        requestGeneration !== generation ||
        !sameScope(context.scope(), scope)
      )
        return;
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) return forbidden();
      error.value = "Не удалось получить безопасную ссылку на файл.";
    } finally {
      if (requestGeneration === generation) downloadingId.value = null;
    }
  }

  function accepted(): void {
    insertToken = null;
    prepareToken = null;
    inserting.value = false;
    preparing.value = false;
    activeCitation.value = null;
    recoveryRequired.value = false;
  }

  function requireRecovery(): void {
    generation += 1;
    openGeneration += 1;
    abort?.abort();
    abort = null;
    insertToken = null;
    prepareToken = null;
    inserting.value = false;
    preparing.value = false;
    selected.value = null;
    items.value = [];
    nextCursor.value = null;
    freshness.value = null;
    recoveryRequired.value = true;
    error.value =
      "Источник изменился или больше недоступен. Удалите его вместе с производным текстом и выберите материал заново.";
  }

  function setQuery(value: string): void {
    query.value = value.slice(0, 240);
  }

  function closeDocument(): void {
    selected.value = null;
  }

  return { query, items, nextCursor, freshness, selected, activeCitation, loading, openingId, inserting, preparing, downloadingId, error, recoveryRequired, canSearch, canInsert, setQuery, closeDocument, search, open, insert, download, prepareForSend, accepted, requireRecovery, purge };
}
