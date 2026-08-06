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
  let notesGeneration = 0;
  let historyGeneration = 0;
  let notesAbort: AbortController | null = null;
  let historyAbort: AbortController | null = null;

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
    load,
    reconcile,
    openHistory,
    closeHistory,
    loadHistory,
    reset,
  };
}
