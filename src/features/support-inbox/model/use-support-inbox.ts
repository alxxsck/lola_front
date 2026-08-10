import { ref } from "vue";
import { ApiError } from "@/shared/api/http/api-error";
import type {
  SupportInboxItem,
  SupportInboxMode,
  SupportConversationReadState,
  SupportWorkspaceCaseRow,
  SupportWorkspaceConversation,
  SupportWorkspaceSource,
} from "@/features/support-workspace/api/support-workspace-source";

export type SupportInboxSource = Pick<
  SupportWorkspaceSource,
  "readCases" | "readConversations"
>;

export interface SupportInboxContext {
  projectId(): string | undefined;
  mode(): SupportInboxMode;
  onForbidden?(): void | Promise<void>;
}

export type SupportInboxFailure = "NONE" | "FORBIDDEN" | "CONFLICT" | "ERROR";

/**
 * Owns project-scoped inbox loading and prevents a stale request from writing
 * into a newly selected project/workspace.
 */
export function createSupportInboxController(
  context: SupportInboxContext,
  source: SupportInboxSource,
) {
  const items = ref<SupportInboxItem[]>([]);
  const nextCursor = ref<string | null>(null);
  const loading = ref(false);
  const error = ref("");
  const failure = ref<SupportInboxFailure>("NONE");
  let generation = 0;

  function reset(): void {
    generation += 1;
    items.value = [];
    nextCursor.value = null;
    loading.value = false;
    error.value = "";
    failure.value = "NONE";
  }

  function isCurrent(
    projectId: string,
    mode: SupportInboxMode,
    requestGeneration: number,
  ): boolean {
    return (
      requestGeneration === generation &&
      context.projectId() === projectId &&
      context.mode() === mode
    );
  }

  function append(pageItems: readonly SupportInboxItem[]): void {
    const knownIds = new Set(items.value.map((item) => item.id));
    const unseen = pageItems.filter((item) => !knownIds.has(item.id));
    if (unseen.length) items.value = [...items.value, ...unseen];
  }

  function scopedItems(
    mode: SupportInboxMode,
    pageItems: readonly (
      SupportWorkspaceCaseRow | SupportWorkspaceConversation
    )[],
  ): SupportInboxItem[] {
    return pageItems.map((item) =>
      mode === "CASES"
        ? { ...item, kind: "CASE" as const }
        : { ...item, kind: "CONVERSATION" as const },
    ) as SupportInboxItem[];
  }

  function applyConversationReadState(
    conversationId: string,
    readState: SupportConversationReadState,
  ): void {
    if (readState.conversationId !== conversationId) return;
    let changed = false;
    const nextItems = items.value.map((item) => {
      if (item.kind !== "CONVERSATION" || item.id !== conversationId) {
        return item;
      }
      if (readState.lastReadOrdinal < item.readState.lastReadOrdinal) {
        return item;
      }
      changed = true;
      return { ...item, readState };
    });
    if (changed) items.value = nextItems;
  }

  function readPage(
    projectId: string,
    mode: SupportInboxMode,
    request: { cursor?: string; limit: number },
  ) {
    return mode === "CASES"
      ? source.readCases(projectId, request)
      : source.readConversations(projectId, request);
  }

  async function load(): Promise<void> {
    const projectId = context.projectId();
    const mode = context.mode();
    const requestGeneration = ++generation;
    if (!projectId) {
      reset();
      return;
    }
    loading.value = true;
    error.value = "";
    failure.value = "NONE";
    try {
      const page = await readPage(projectId, mode, {
        limit: 30,
      });
      if (!isCurrent(projectId, mode, requestGeneration)) return;
      items.value = scopedItems(mode, page.items);
      nextCursor.value = page.nextCursor;
    } catch (cause) {
      if (!isCurrent(projectId, mode, requestGeneration)) return;
      if (
        cause instanceof ApiError &&
        (cause.status === 403 || cause.status === 404)
      ) {
        items.value = [];
        nextCursor.value = null;
        failure.value = "FORBIDDEN";
        error.value = "Доступ к входящим изменился";
        await context.onForbidden?.();
      } else {
        failure.value =
          cause instanceof ApiError && cause.status === 409
            ? "CONFLICT"
            : "ERROR";
        error.value =
          failure.value === "CONFLICT"
            ? "Список входящих изменился на сервере"
            : `Не удалось загрузить список ${mode === "CASES" ? "обращений" : "диалогов"}`;
      }
    } finally {
      if (requestGeneration === generation) loading.value = false;
    }
  }

  async function loadMore(): Promise<void> {
    const projectId = context.projectId();
    const mode = context.mode();
    const cursor = nextCursor.value;
    if (!projectId || !cursor || loading.value) return;
    const requestGeneration = ++generation;
    loading.value = true;
    error.value = "";
    failure.value = "NONE";
    try {
      const page = await readPage(projectId, mode, {
        cursor,
        limit: 30,
      });
      if (!isCurrent(projectId, mode, requestGeneration)) return;
      append(scopedItems(mode, page.items));
      nextCursor.value = page.nextCursor;
    } catch (cause) {
      if (!isCurrent(projectId, mode, requestGeneration)) return;
      if (
        cause instanceof ApiError &&
        (cause.status === 403 || cause.status === 404)
      ) {
        items.value = [];
        nextCursor.value = null;
        failure.value = "FORBIDDEN";
        error.value = "Доступ к входящим изменился";
        await context.onForbidden?.();
      } else {
        failure.value =
          cause instanceof ApiError && cause.status === 409
            ? "CONFLICT"
            : "ERROR";
        error.value =
          failure.value === "CONFLICT"
            ? "Курсор страницы устарел — обновите список"
            : `Не удалось загрузить следующую страницу ${mode === "CASES" ? "обращений" : "диалогов"}`;
      }
    } finally {
      if (requestGeneration === generation) loading.value = false;
    }
  }

  return {
    items,
    nextCursor,
    loading,
    error,
    failure,
    load,
    loadMore,
    applyConversationReadState,
    reset,
  };
}
