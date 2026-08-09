import { ref } from "vue";
import type {
  SupportExternalCommandStatusResponseDto,
  SupportExternalInboxListFreshness,
  SupportExternalItemListFreshness,
  SupportExternalItemListProvider,
  SupportExternalProjectItemResponseDto,
  SupportExternalTimelineMessageResponseDto,
} from "@/shared/api/generated/models";
import { normalizeApiError } from "@/shared/api/http/api-error";
import type { SupportExternalWorkSource } from "../api/support-external-work-source";

export type SupportExternalInboxMode = "ATTENTION" | "LINKED";
export type SupportExternalInboxAge = "ALL" | "24H" | "7D";
type CommandAttempt = {
  kind: "RETRY" | "REFRESH_EVIDENCE";
  caseId: string;
  commandId: string;
  remoteItemId: string;
  expectedVersion: number;
  idempotencyKey: string;
};

interface RetainedCommandAttempt {
  attempt: CommandAttempt;
  state: "UNKNOWN_OUTCOME" | "RETRYABLE_FAILURE";
}

const retainedCommandAttempts = new Map<string, RetainedCommandAttempt>();

export interface SupportExternalInboxContext {
  actorId(): string | undefined;
  projectId(): string | undefined;
  canReadInbox(): boolean;
  canReadLinked(): boolean;
  canRetry(): boolean;
  canResolveUnknown(): boolean;
  createIdempotencyKey?(): string;
  now?(): Date;
  onForbidden?(): void | Promise<void>;
}

/** Owns one bounded external-work list, selection and exact recovery command. */
export function createSupportExternalInboxController(
  context: SupportExternalInboxContext,
  source: SupportExternalWorkSource,
) {
  const mode = ref<SupportExternalInboxMode>(
    context.canReadInbox() ? "ATTENTION" : "LINKED",
  );
  const provider = ref<"ALL" | SupportExternalItemListProvider>("ALL");
  const freshness = ref<"ALL" | SupportExternalItemListFreshness>("ALL");
  const status = ref("");
  const age = ref<SupportExternalInboxAge>("ALL");
  const items = ref<SupportExternalProjectItemResponseDto[]>([]);
  const detail = ref<SupportExternalProjectItemResponseDto | null>(null);
  const timeline = ref<SupportExternalTimelineMessageResponseDto[]>([]);
  const commands = ref<SupportExternalCommandStatusResponseDto[]>([]);
  const timelineNextCursor = ref<string | null>(null);
  const commandNextCursor = ref<string | null>(null);
  const selectedItemId = ref<string | null>(null);
  const nextCursor = ref<string | null>(null);
  const pageIndex = ref(0);
  const loading = ref(false);
  const loadingDetail = ref(false);
  const mutating = ref(false);
  const error = ref("");
  const success = ref("");
  const recovery = ref<"UNKNOWN_OUTCOME" | "RETRYABLE_FAILURE" | null>(null);
  let generation = 0;
  let selectionGeneration = 0;
  let listAbort: AbortController | null = null;
  let detailAbort: AbortController | null = null;
  let mutationAbort: AbortController | null = null;
  let pendingAttempt: CommandAttempt | null = null;
  let pendingAttemptScope: string | null = null;
  let cursorHistory: Array<string | null> = [null];

  function scopeKey(): string | null {
    const actorId = context.actorId();
    const projectId = context.projectId();
    return actorId && projectId ? `${actorId}\u0000${projectId}` : null;
  }

  function current(scope: string, requestGeneration: number): boolean {
    return generation === requestGeneration && scopeKey() === scope;
  }

  function resetSelection(): void {
    selectionGeneration += 1;
    detailAbort?.abort();
    detailAbort = null;
    selectedItemId.value = null;
    detail.value = null;
    timeline.value = [];
    commands.value = [];
    timelineNextCursor.value = null;
    commandNextCursor.value = null;
    loadingDetail.value = false;
  }

  function closeDetail(): void {
    resetSelection();
  }

  function reset(): void {
    if (pendingAttemptScope && pendingAttempt && (mutating.value || recovery.value))
      retainedCommandAttempts.set(pendingAttemptScope, {
        attempt: pendingAttempt,
        state: recovery.value ?? "UNKNOWN_OUTCOME",
      });
    generation += 1;
    listAbort?.abort();
    mutationAbort?.abort();
    listAbort = null;
    mutationAbort = null;
    items.value = [];
    nextCursor.value = null;
    pageIndex.value = 0;
    cursorHistory = [null];
    loading.value = false;
    mutating.value = false;
    error.value = "";
    success.value = "";
    recovery.value = null;
    pendingAttempt = null;
    pendingAttemptScope = null;
    resetSelection();
  }

  function updatedAfter(): string | undefined {
    if (age.value === "ALL") return undefined;
    const time = new Date((context.now?.() ?? new Date()).getTime());
    time.setUTCHours(time.getUTCHours() - (age.value === "24H" ? 24 : 24 * 7));
    return time.toISOString();
  }

  async function handleAccessFailure(cause: unknown): Promise<boolean> {
    const value = normalizeApiError(cause);
    if (
      value.status !== 401 &&
      value.status !== 403 &&
      value.status !== 404 &&
      value.status !== 428 &&
      value.code !== "MFA_REQUIRED" &&
      value.code !== "MFA_ENROLLMENT_REQUIRED"
    )
      return false;
    if (pendingAttemptScope) retainedCommandAttempts.delete(pendingAttemptScope);
    pendingAttempt = null;
    pendingAttemptScope = null;
    reset();
    error.value = "Очередь внешних задач недоступна для текущего проекта или роли.";
    await context.onForbidden?.();
    return true;
  }

  async function loadPage(cursor: string | null, targetPage: number): Promise<void> {
    listAbort?.abort();
    const scope = scopeKey();
    const projectId = context.projectId();
    if (!scope || !projectId) {
      reset();
      return;
    }
    if (mode.value === "ATTENTION" && !context.canReadInbox())
      mode.value = "LINKED";
    if (mode.value === "LINKED" && !context.canReadLinked())
      mode.value = "ATTENTION";
    if (
      (mode.value === "ATTENTION" && !context.canReadInbox()) ||
      (mode.value === "LINKED" && !context.canReadLinked())
    ) {
      reset();
      return;
    }
    resetSelection();
    const requestGeneration = ++generation;
    const abort = new AbortController();
    listAbort = abort;
    loading.value = true;
    error.value = "";
    success.value = "";
    try {
      const page =
        mode.value === "ATTENTION"
          ? await source.listInbox(
              projectId,
              {
                limit: 50,
                ...(cursor ? { cursor } : {}),
                ...(freshness.value !== "ALL"
                  ? {
                      freshness:
                        freshness.value as SupportExternalInboxListFreshness,
                    }
                  : {}),
              },
              abort.signal,
            )
          : await source.listItems(
              projectId,
              {
                limit: 50,
                ...(cursor ? { cursor } : {}),
                linked: "LINKED",
                ...(provider.value !== "ALL" ? { provider: provider.value } : {}),
                ...(freshness.value !== "ALL"
                  ? { freshness: freshness.value }
                  : {}),
                ...(status.value.trim() ? { status: status.value.trim() } : {}),
                ...(updatedAfter() ? { updatedAfter: updatedAfter() } : {}),
              },
              abort.signal,
            );
      if (!current(scope, requestGeneration)) return;
      items.value = page.items;
      nextCursor.value = page.nextCursor;
      pageIndex.value = targetPage;
      const retained = retainedCommandAttempts.get(scope);
      if (retained) {
        pendingAttempt = retained.attempt;
        pendingAttemptScope = scope;
        recovery.value = retained.state;
        error.value = "Команда восстановления не подтверждена. Разрешён только точный повтор.";
      }
    } catch (cause) {
      if (!current(scope, requestGeneration)) return;
      if (normalizeApiError(cause).name === "AbortError") return;
      if (await handleAccessFailure(cause)) return;
      items.value = [];
      error.value = "Не удалось загрузить очередь внешних задач.";
    } finally {
      if (current(scope, requestGeneration)) {
        loading.value = false;
        listAbort = null;
      }
    }
  }

  async function load(): Promise<void> {
    nextCursor.value = null;
    pageIndex.value = 0;
    cursorHistory = [null];
    await loadPage(null, 0);
  }

  async function loadMore(): Promise<void> {
    if (!nextCursor.value || loading.value) return;
    const cursor = nextCursor.value;
    const targetPage = pageIndex.value + 1;
    cursorHistory[targetPage] = cursor;
    cursorHistory.length = targetPage + 1;
    await loadPage(cursor, targetPage);
  }

  async function loadPrevious(): Promise<void> {
    if (pageIndex.value < 1 || loading.value) return;
    const targetPage = pageIndex.value - 1;
    await loadPage(cursorHistory[targetPage] ?? null, targetPage);
  }

  async function setMode(next: SupportExternalInboxMode): Promise<void> {
    mode.value = next;
    await load();
  }

  async function selectItem(itemId: string): Promise<void> {
    detailAbort?.abort();
    const projectId = context.projectId();
    const scope = scopeKey();
    if (!projectId || !scope) return;
    const requestGeneration = ++selectionGeneration;
    const abort = new AbortController();
    detailAbort = abort;
    selectedItemId.value = itemId;
    detail.value = null;
    timeline.value = [];
    commands.value = [];
    loadingDetail.value = true;
    error.value = "";
    const sameSelection = () =>
      requestGeneration === selectionGeneration &&
      scopeKey() === scope &&
      selectedItemId.value === itemId;
    try {
      const item =
        mode.value === "ATTENTION"
          ? await source.readInboxItem(projectId, itemId, abort.signal)
          : await source.readItem(projectId, itemId, abort.signal);
      if (!sameSelection()) return;
      detail.value = item;
      const timelineRequest =
        mode.value === "ATTENTION"
          ? source.readInboxTimeline(projectId, itemId, { limit: 100 }, abort.signal)
          : item.link
            ? source.readLinkedTimeline(
                projectId,
                item.link.caseId,
                item.link.linkId,
                { limit: 100 },
                abort.signal,
              )
            : Promise.resolve({ items: [], nextCursor: null });
      const commandRequest =
        mode.value === "LINKED" && item.link && context.canReadLinked()
          ? source.listCaseCommands(
              projectId,
              item.link.caseId,
              { limit: 50 },
              abort.signal,
            )
          : Promise.resolve({ items: [], nextCursor: null });
      const [timelinePage, commandPage] = await Promise.all([
        timelineRequest,
        commandRequest,
      ]);
      if (!sameSelection()) return;
      timeline.value = timelinePage.items;
      commands.value = commandPage.items;
      timelineNextCursor.value = timelinePage.nextCursor;
      commandNextCursor.value = commandPage.nextCursor;
    } catch (cause) {
      if (!sameSelection()) return;
      if (normalizeApiError(cause).name === "AbortError") return;
      if (await handleAccessFailure(cause)) return;
      detail.value = null;
      timeline.value = [];
      commands.value = [];
      error.value = "Не удалось загрузить подробности и историю внешней задачи.";
    } finally {
      if (sameSelection()) {
        loadingDetail.value = false;
        detailAbort = null;
      }
    }
  }

  async function loadMoreTimeline(): Promise<void> {
    const item = detail.value;
    const cursor = timelineNextCursor.value;
    const projectId = context.projectId();
    const scope = scopeKey();
    if (!item || !cursor || !projectId || !scope || loadingDetail.value) return;
    const requestGeneration = selectionGeneration;
    const abort = new AbortController();
    detailAbort = abort;
    loadingDetail.value = true;
    try {
      const page =
        mode.value === "ATTENTION"
          ? await source.readInboxTimeline(
              projectId,
              item.itemId,
              { limit: 100, cursor },
              abort.signal,
            )
          : item.link
            ? await source.readLinkedTimeline(
                projectId,
                item.link.caseId,
                item.link.linkId,
                { limit: 100, cursor },
                abort.signal,
              )
            : { items: [], nextCursor: null };
      if (
        requestGeneration !== selectionGeneration ||
        scopeKey() !== scope ||
        selectedItemId.value !== item.itemId
      )
        return;
      timeline.value = [...timeline.value, ...page.items];
      timelineNextCursor.value = page.nextCursor;
    } catch (cause) {
      if (
        requestGeneration !== selectionGeneration ||
        scopeKey() !== scope ||
        selectedItemId.value !== item.itemId
      )
        return;
      if (normalizeApiError(cause).name === "AbortError") return;
      if (await handleAccessFailure(cause)) return;
      error.value = "Следующая страница истории пока недоступна.";
    } finally {
      if (detailAbort === abort) {
        detailAbort = null;
        loadingDetail.value = false;
      }
    }
  }

  async function loadMoreCommands(): Promise<void> {
    const item = detail.value;
    const cursor = commandNextCursor.value;
    const projectId = context.projectId();
    const scope = scopeKey();
    if (!item?.link || !cursor || !projectId || !scope || loadingDetail.value) return;
    const requestGeneration = selectionGeneration;
    const abort = new AbortController();
    detailAbort = abort;
    loadingDetail.value = true;
    try {
      const page = await source.listCaseCommands(
        projectId,
        item.link.caseId,
        { limit: 50, cursor },
        abort.signal,
      );
      if (
        requestGeneration !== selectionGeneration ||
        scopeKey() !== scope ||
        selectedItemId.value !== item.itemId
      )
        return;
      commands.value = [...commands.value, ...page.items];
      commandNextCursor.value = page.nextCursor;
    } catch (cause) {
      if (
        requestGeneration !== selectionGeneration ||
        scopeKey() !== scope ||
        selectedItemId.value !== item.itemId
      )
        return;
      if (normalizeApiError(cause).name === "AbortError") return;
      if (await handleAccessFailure(cause)) return;
      error.value = "Следующая страница команд пока недоступна.";
    } finally {
      if (detailAbort === abort) {
        detailAbort = null;
        loadingDetail.value = false;
      }
    }
  }

  async function runCommand(attempt: CommandAttempt): Promise<void> {
    if (mutating.value) return;
    const projectId = context.projectId();
    const scope = scopeKey();
    const allowed =
      attempt.kind === "RETRY"
        ? context.canRetry()
        : context.canResolveUnknown();
    if (!projectId || !scope || !allowed) return;
    const abort = new AbortController();
    mutationAbort = abort;
    pendingAttempt = attempt;
    pendingAttemptScope = scope;
    retainedCommandAttempts.set(scope, {
      attempt,
      state: "UNKNOWN_OUTCOME",
    });
    mutating.value = true;
    error.value = "";
    success.value = "";
    try {
      if (attempt.kind === "RETRY")
        await source.retryCommand(
          projectId,
          attempt.caseId,
          attempt.commandId,
          attempt.expectedVersion,
          attempt.idempotencyKey,
          abort.signal,
        );
      else
        await source.refreshCommandEvidence(
          projectId,
          attempt.caseId,
          attempt.commandId,
          { remoteItemId: attempt.remoteItemId },
          attempt.expectedVersion,
          attempt.idempotencyKey,
          abort.signal,
        );
      if (scopeKey() !== scope) return;
      retainedCommandAttempts.delete(scope);
      pendingAttempt = null;
      pendingAttemptScope = null;
      recovery.value = null;
      const selected = selectedItemId.value;
      if (selected) await selectItem(selected);
      success.value = "Команда восстановления подтверждена сервером.";
    } catch (cause) {
      const value = normalizeApiError(cause);
      const terminal =
        value.status === 401 ||
        value.status === 403 ||
        value.status === 404 ||
        value.status === 428 ||
        value.code === "MFA_REQUIRED" ||
        value.code === "MFA_ENROLLMENT_REQUIRED";
      if (terminal) retainedCommandAttempts.delete(scope);
      if (scopeKey() !== scope) return;
      if (await handleAccessFailure(value)) return;
      if (value.status === 0) {
        retainedCommandAttempts.set(scope, {
          attempt,
          state: "UNKNOWN_OUTCOME",
        });
        recovery.value = "UNKNOWN_OUTCOME";
        error.value = "Результат команды восстановления неизвестен. Разрешён только точный повтор.";
      } else if (value.status === 429 || value.status === 503) {
        retainedCommandAttempts.set(scope, {
          attempt,
          state: "RETRYABLE_FAILURE",
        });
        recovery.value = "RETRYABLE_FAILURE";
        error.value = "Внешняя система временно недоступна. Исходная команда восстановления сохранена.";
      } else {
        retainedCommandAttempts.delete(scope);
        pendingAttempt = null;
        pendingAttemptScope = null;
        recovery.value = null;
        error.value = "Команда восстановления отклонена; состояние на сервере перечитано.";
        const selected = selectedItemId.value;
        if (selected) await selectItem(selected);
      }
    } finally {
      if (mutationAbort === abort) {
        mutationAbort = null;
        mutating.value = false;
      }
    }
  }

  function command(commandId: string) {
    return commands.value.find((item) => item.commandId === commandId) ?? null;
  }

  async function retryCommand(commandId: string): Promise<void> {
    const item = detail.value;
    const target = command(commandId);
    if (
      !item?.link ||
      !target?.allowedActions.includes("RETRY") ||
      !context.canRetry() ||
      recovery.value
    )
      return;
    await runCommand({
      kind: "RETRY",
      caseId: item.link.caseId,
      commandId,
      remoteItemId: item.remoteItemId,
      expectedVersion: target.version,
      idempotencyKey:
        context.createIdempotencyKey?.() ?? crypto.randomUUID(),
    });
  }

  async function refreshCommandEvidence(commandId: string): Promise<void> {
    const item = detail.value;
    const target = command(commandId);
    if (
      !item?.link ||
      !target?.allowedActions.includes("REFRESH_EVIDENCE") ||
      !context.canResolveUnknown() ||
      recovery.value
    )
      return;
    await runCommand({
      kind: "REFRESH_EVIDENCE",
      caseId: item.link.caseId,
      commandId,
      remoteItemId: item.remoteItemId,
      expectedVersion: target.version,
      idempotencyKey:
        context.createIdempotencyKey?.() ?? crypto.randomUUID(),
    });
  }

  async function retryPending(): Promise<void> {
    if (!pendingAttempt || mutating.value) return;
    await runCommand(pendingAttempt);
  }

  return {
    mode,
    provider,
    freshness,
    status,
    age,
    items,
    detail,
    timeline,
    commands,
    timelineNextCursor,
    commandNextCursor,
    selectedItemId,
    nextCursor,
    pageIndex,
    loading,
    loadingDetail,
    mutating,
    error,
    success,
    recovery,
    load,
    loadMore,
    loadPrevious,
    reset,
    closeDetail,
    setMode,
    selectItem,
    loadMoreTimeline,
    loadMoreCommands,
    retryCommand,
    refreshCommandEvidence,
    retryPending,
  };
}
