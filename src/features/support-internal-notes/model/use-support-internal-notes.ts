import { computed, ref } from "vue";
import { ApiError } from "@/shared/api/http/api-error";
import type {
  SupportInternalNote,
  SupportInternalNoteRevision,
  SupportInternalNotesSource,
} from "@/features/support-internal-notes/api/support-internal-notes-source";

export interface SupportInternalNotesContext {
  projectId(): string | undefined;
  caseId(): string | undefined;
  canRead(): boolean;
  canReadHistory(): boolean;
  canWrite?(): boolean;
  canRedact?(): boolean;
  onForbidden?(): void | Promise<void>;
}

interface Scope {
  projectId: string;
  caseId: string;
}

/** Owns one selected Case's private notes; no data survives a scope or authority change. */
export function createSupportInternalNotesController(
  context: SupportInternalNotesContext,
  source: SupportInternalNotesSource,
) {
  const notes = ref<SupportInternalNote[]>([]);
  const nextCursor = ref<string | null>(null);
  const loading = ref(false);
  const loadingMore = ref(false);
  const error = ref("");
  const historyNoteId = ref<string | null>(null);
  const history = ref<SupportInternalNoteRevision[]>([]);
  const historyNextCursor = ref<string | null>(null);
  const historyLoading = ref(false);
  const historyLoadingMore = ref(false);
  const historyError = ref("");
  const creating = ref(false);
  const correctingNoteId = ref<string | null>(null);
  const tombstoningNoteId = ref<string | null>(null);
  const mutationError = ref("");
  let notesGeneration = 0;
  let historyGeneration = 0;
  let notesAbort: AbortController | null = null;
  let historyAbort: AbortController | null = null;
  const attempts = new Map<string, string>();

  const selectedHistoryNote = computed(() =>
    historyNoteId.value
      ? notes.value.find((note) => note.id === historyNoteId.value) ?? null
      : null,
  );

  function currentScope(): Scope | null {
    const projectId = context.projectId();
    const caseId = context.caseId();
    return projectId && caseId ? { projectId, caseId } : null;
  }

  function canWrite(): boolean {
    return Boolean(context.canRead() && context.canWrite?.());
  }

  function canRedact(): boolean {
    return Boolean(context.canRead() && context.canRedact?.());
  }

  function commandKey(identity: string): string {
    const existing = attempts.get(identity);
    if (existing) return existing;
    const next = globalThis.crypto.randomUUID();
    attempts.set(identity, next);
    return next;
  }

  function isCurrentMutation(scope: Scope, generation: number): boolean {
    return (
      generation === notesGeneration &&
      context.canRead() &&
      context.projectId() === scope.projectId &&
      context.caseId() === scope.caseId
    );
  }

  function upsert(note: SupportInternalNote): void {
    const index = notes.value.findIndex((item) => item.id === note.id);
    if (index < 0) {
      notes.value = [note, ...notes.value];
      return;
    }
    notes.value = notes.value.map((item) => (item.id === note.id ? note : item));
  }

  async function handleMutationError(
    cause: unknown,
    scope: Scope,
    generation: number,
    fallback: string,
  ): Promise<void> {
    if (!isCurrentMutation(scope, generation)) return;
    if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) {
      await forbidden();
      return;
    }
    mutationError.value =
      cause instanceof ApiError && (cause.status === 409 || cause.status === 410)
        ? "Заметка изменилась на сервере. Обновите список и повторите действие."
        : fallback;
  }

  function isCurrentNotes(scope: Scope, requestGeneration: number): boolean {
    return (
      requestGeneration === notesGeneration &&
      context.canRead() &&
      context.projectId() === scope.projectId &&
      context.caseId() === scope.caseId
    );
  }

  function isCurrentHistory(scope: Scope, requestGeneration: number): boolean {
    return (
      requestGeneration === historyGeneration &&
      context.canReadHistory() &&
      context.projectId() === scope.projectId &&
      context.caseId() === scope.caseId
    );
  }

  function reset(): void {
    notesGeneration += 1;
    historyGeneration += 1;
    notesAbort?.abort();
    historyAbort?.abort();
    notesAbort = null;
    historyAbort = null;
    notes.value = [];
    nextCursor.value = null;
    loading.value = false;
    loadingMore.value = false;
    error.value = "";
    historyNoteId.value = null;
    history.value = [];
    historyNextCursor.value = null;
    historyLoading.value = false;
    historyLoadingMore.value = false;
    historyError.value = "";
    creating.value = false;
    correctingNoteId.value = null;
    tombstoningNoteId.value = null;
    mutationError.value = "";
    attempts.clear();
  }

  async function forbidden(): Promise<void> {
    reset();
    await context.onForbidden?.();
  }

  async function load(
    cursor?: string,
    options: { retainNotesUntilResponse?: boolean } = {},
  ): Promise<void> {
    const scope = currentScope();
    if (!scope || !context.canRead()) {
      reset();
      return;
    }
    notesAbort?.abort();
    const requestGeneration = ++notesGeneration;
    const abort = new AbortController();
    notesAbort = abort;
    if (cursor) loadingMore.value = true;
    else {
      closeHistory();
      if (!options.retainNotesUntilResponse) {
        notes.value = [];
        nextCursor.value = null;
      }
      error.value = "";
      loading.value = true;
    }
    try {
      const page = await source.list(
        scope.projectId,
        scope.caseId,
        { ...(cursor ? { cursor } : {}) },
        abort.signal,
      );
      if (!isCurrentNotes(scope, requestGeneration)) return;
      const byId = new Map(
        (cursor ? notes.value : []).map((note) => [note.id, note]),
      );
      page.items.forEach((note) => byId.set(note.id, note));
      notes.value = [...byId.values()];
      nextCursor.value = page.nextCursor;
    } catch (cause) {
      if (!isCurrentNotes(scope, requestGeneration)) return;
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) {
        await forbidden();
        return;
      }
      error.value = "Не удалось загрузить внутренние заметки.";
    } finally {
      if (requestGeneration === notesGeneration) {
        loading.value = false;
        loadingMore.value = false;
        notesAbort = null;
      }
    }
  }

  async function openHistory(noteId: string): Promise<void> {
    if (!context.canReadHistory() || !notes.value.some((note) => note.id === noteId))
      return;
    closeHistory();
    historyNoteId.value = noteId;
    await loadHistory();
  }

  function closeHistory(): void {
    historyGeneration += 1;
    historyAbort?.abort();
    historyAbort = null;
    historyNoteId.value = null;
    history.value = [];
    historyNextCursor.value = null;
    historyError.value = "";
    historyLoading.value = false;
    historyLoadingMore.value = false;
  }

  async function loadHistory(cursor?: string): Promise<void> {
    const scope = currentScope();
    const noteId = historyNoteId.value;
    if (
      !scope ||
      !noteId ||
      !context.canReadHistory() ||
      !notes.value.some((note) => note.id === noteId)
    ) {
      closeHistory();
      return;
    }
    historyAbort?.abort();
    const requestGeneration = ++historyGeneration;
    const abort = new AbortController();
    historyAbort = abort;
    if (cursor) historyLoadingMore.value = true;
    else historyLoading.value = true;
    historyError.value = "";
    try {
      const page = await source.revisions(
        scope.projectId,
        scope.caseId,
        noteId,
        { ...(cursor ? { cursor } : {}) },
        abort.signal,
      );
      if (
        !isCurrentHistory(scope, requestGeneration) ||
        historyNoteId.value !== noteId
      )
        return;
      const byId = new Map(history.value.map((revision) => [revision.id, revision]));
      page.items.forEach((revision) => byId.set(revision.id, revision));
      history.value = [...byId.values()];
      historyNextCursor.value = page.nextCursor;
    } catch (cause) {
      if (
        !isCurrentHistory(scope, requestGeneration) ||
        historyNoteId.value !== noteId
      )
        return;
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) {
        await forbidden();
        return;
      }
      historyError.value = "Не удалось загрузить историю заметки.";
    } finally {
      if (requestGeneration === historyGeneration) {
        historyLoading.value = false;
        historyLoadingMore.value = false;
        historyAbort = null;
      }
    }
  }

  /** Revalidates an open panel without briefly blanking the note list. */
  async function reconcile(): Promise<void> {
    await load(undefined, { retainNotesUntilResponse: true });
  }

  async function create(
    body: string,
    conversationId?: string,
  ): Promise<boolean> {
    const scope = currentScope();
    const normalizedBody = body.trim();
    if (!scope || !canWrite() || !normalizedBody || creating.value) return false;
    const generation = notesGeneration;
    const identity = `${scope.projectId}\u001f${scope.caseId}\u001fCREATE\u001f${normalizedBody}\u001f${conversationId ?? ""}`;
    creating.value = true;
    mutationError.value = "";
    try {
      const note = await source.create(scope.projectId, scope.caseId, {
        body: normalizedBody,
        ...(conversationId ? { conversationId } : {}),
        idempotencyKey: commandKey(identity),
      });
      if (!isCurrentMutation(scope, generation)) return false;
      attempts.delete(identity);
      upsert(note);
      return true;
    } catch (cause) {
      await handleMutationError(
        cause,
        scope,
        generation,
        "Не удалось создать внутреннюю заметку. Текст сохранён.",
      );
      return false;
    } finally {
      if (isCurrentMutation(scope, generation)) creating.value = false;
    }
  }

  async function correct(
    noteId: string,
    body: string,
    reasonCode: string,
  ): Promise<boolean> {
    const scope = currentScope();
    const note = notes.value.find((item) => item.id === noteId);
    const normalizedBody = body.trim();
    const normalizedReason = reasonCode.trim().toUpperCase();
    if (
      !scope ||
      !note ||
      note.lifecycle !== "ACTIVE" ||
      !canWrite() ||
      !normalizedBody ||
      !normalizedReason ||
      correctingNoteId.value
    )
      return false;
    const generation = notesGeneration;
    const identity = `${scope.projectId}\u001f${scope.caseId}\u001fCORRECT\u001f${note.id}\u001f${note.actionEtag}\u001f${normalizedBody}\u001f${normalizedReason}`;
    correctingNoteId.value = note.id;
    mutationError.value = "";
    try {
      const updated = await source.correct(scope.projectId, scope.caseId, note.id, {
        body: normalizedBody,
        reasonCode: normalizedReason,
        actionEtag: note.actionEtag,
        idempotencyKey: commandKey(identity),
      });
      if (!isCurrentMutation(scope, generation)) return false;
      attempts.delete(identity);
      upsert(updated);
      if (historyNoteId.value === note.id) void loadHistory();
      return true;
    } catch (cause) {
      await handleMutationError(
        cause,
        scope,
        generation,
        "Не удалось исправить внутреннюю заметку. Текст сохранён.",
      );
      return false;
    } finally {
      if (isCurrentMutation(scope, generation)) correctingNoteId.value = null;
    }
  }

  async function tombstone(
    noteId: string,
    reasonCode: string,
  ): Promise<boolean> {
    const scope = currentScope();
    const note = notes.value.find((item) => item.id === noteId);
    const normalizedReason = reasonCode.trim().toUpperCase();
    if (
      !scope ||
      !note ||
      note.lifecycle !== "ACTIVE" ||
      !canRedact() ||
      !normalizedReason ||
      tombstoningNoteId.value
    )
      return false;
    const generation = notesGeneration;
    const identity = `${scope.projectId}\u001f${scope.caseId}\u001fTOMBSTONE\u001f${note.id}\u001f${note.actionEtag}\u001f${normalizedReason}`;
    tombstoningNoteId.value = note.id;
    mutationError.value = "";
    try {
      const updated = await source.tombstone(
        scope.projectId,
        scope.caseId,
        note.id,
        {
          reasonCode: normalizedReason,
          actionEtag: note.actionEtag,
          idempotencyKey: commandKey(identity),
        },
      );
      if (!isCurrentMutation(scope, generation)) return false;
      attempts.delete(identity);
      upsert(updated);
      if (historyNoteId.value === note.id) closeHistory();
      return true;
    } catch (cause) {
      await handleMutationError(
        cause,
        scope,
        generation,
        "Не удалось удалить внутреннюю заметку. Причина сохранена.",
      );
      return false;
    } finally {
      if (isCurrentMutation(scope, generation)) tombstoningNoteId.value = null;
    }
  }

  return {
    notes,
    nextCursor,
    loading,
    loadingMore,
    error,
    historyNoteId,
    selectedHistoryNote,
    history,
    historyNextCursor,
    historyLoading,
    historyLoadingMore,
    historyError,
    creating,
    correctingNoteId,
    tombstoningNoteId,
    mutationError,
    load,
    reconcile,
    openHistory,
    closeHistory,
    loadHistory,
    create,
    correct,
    tombstone,
    reset,
  };
}
