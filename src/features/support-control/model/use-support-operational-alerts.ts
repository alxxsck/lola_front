import { ref } from "vue";
import { ApiError } from "@/shared/api/http/api-error";
import type {
  SupportOperationalAlertsSource,
  SupportOperationalAlertDetail,
  SupportOperationalAlertPage,
} from "@/features/support-control/api/support-lead-source";

export interface SupportOperationalAlertsContext {
  projectId(): string | undefined;
  canRead(): boolean;
  onForbidden?(): void | Promise<void>;
}

/** Keeps alert list and one detail timeline isolated from the lead summary cache. */
export function createSupportOperationalAlertsController(
  context: SupportOperationalAlertsContext,
  source: SupportOperationalAlertsSource,
) {
  const page = ref<SupportOperationalAlertPage | null>(null);
  const loading = ref(false);
  const error = ref("");
  const detail = ref<SupportOperationalAlertDetail | null>(null);
  const detailLoading = ref(false);
  const detailError = ref("");
  const detailAlertId = ref<string | null>(null);
  let generation = 0;
  let detailGeneration = 0;
  let listAbort: AbortController | null = null;
  let detailAbort: AbortController | null = null;

  function reset(): void {
    generation += 1;
    detailGeneration += 1;
    listAbort?.abort();
    detailAbort?.abort();
    listAbort = null;
    detailAbort = null;
    page.value = null;
    loading.value = false;
    error.value = "";
    detail.value = null;
    detailLoading.value = false;
    detailError.value = "";
    detailAlertId.value = null;
  }

  function isCurrent(projectId: string, requestGeneration: number): boolean {
    return (
      requestGeneration === generation &&
      context.canRead() &&
      context.projectId() === projectId
    );
  }

  function isCurrentDetail(projectId: string, requestGeneration: number): boolean {
    return (
      requestGeneration === detailGeneration &&
      context.canRead() &&
      context.projectId() === projectId
    );
  }

  async function load(cursor?: string): Promise<void> {
    const projectId = context.projectId();
    const append = Boolean(cursor);
    if (!append) closeDetail();
    listAbort?.abort();
    const requestGeneration = ++generation;
    const abort = new AbortController();
    listAbort = abort;
    error.value = "";
    if (!projectId || !context.canRead()) {
      loading.value = false;
      listAbort = null;
      return;
    }

    loading.value = true;
    try {
      const result = await source.readAlerts(
        projectId,
        cursor ? { cursor } : undefined,
        abort.signal,
      );
      if (!isCurrent(projectId, requestGeneration)) return;
      if (!append || !page.value) {
        page.value = result;
        return;
      }
      const existing = new Set(page.value.items.map((item) => item.id));
      page.value = {
        ...result,
        items: [...page.value.items, ...result.items.filter((item) => !existing.has(item.id))],
      };
    } catch (cause) {
      if (!isCurrent(projectId, requestGeneration)) return;
      if (cause instanceof ApiError && cause.status === 403) {
        reset();
        await context.onForbidden?.();
        return;
      }
      error.value = "Не удалось загрузить operational alerts";
    } finally {
      if (requestGeneration === generation) {
        loading.value = false;
        listAbort = null;
      }
    }
  }

  function loadMore(): Promise<void> {
    const cursor = page.value?.nextCursor;
    if (!cursor || loading.value) return Promise.resolve();
    return load(cursor);
  }

  async function loadDetail(alertId: string, cursor?: string): Promise<void> {
    const projectId = context.projectId();
    const append = Boolean(cursor);
    detailAbort?.abort();
    const requestGeneration = ++detailGeneration;
    const abort = new AbortController();
    detailAbort = abort;
    if (!append) detail.value = null;
    detailAlertId.value = alertId;
    detailError.value = "";
    if (!projectId || !context.canRead()) {
      detailLoading.value = false;
      detailAbort = null;
      return;
    }

    detailLoading.value = true;
    try {
      const result = await source.readAlertDetail(
        projectId,
        alertId,
        cursor ? { cursor } : undefined,
        abort.signal,
      );
      if (!isCurrentDetail(projectId, requestGeneration)) return;
      if (!append || !detail.value) {
        detail.value = result;
        return;
      }
      const existing = new Set(detail.value.timeline.map((item) => item.id));
      detail.value = {
        ...result,
        timeline: [
          ...detail.value.timeline,
          ...result.timeline.filter((item) => !existing.has(item.id)),
        ],
      };
    } catch (cause) {
      if (!isCurrentDetail(projectId, requestGeneration)) return;
      if (cause instanceof ApiError && cause.status === 403) {
        reset();
        await context.onForbidden?.();
        return;
      }
      detailError.value = "Не удалось загрузить историю alert";
    } finally {
      if (requestGeneration === detailGeneration) {
        detailLoading.value = false;
        detailAbort = null;
      }
    }
  }

  function openDetail(alertId: string): Promise<void> {
    return loadDetail(alertId);
  }

  function loadMoreDetail(): Promise<void> {
    const alertId = detailAlertId.value;
    const cursor = detail.value?.nextCursor;
    if (!alertId || !cursor || detailLoading.value) return Promise.resolve();
    return loadDetail(alertId, cursor);
  }

  function closeDetail(): void {
    detailGeneration += 1;
    detailAbort?.abort();
    detailAbort = null;
    detail.value = null;
    detailLoading.value = false;
    detailError.value = "";
    detailAlertId.value = null;
  }

  return {
    page,
    loading,
    error,
    detail,
    detailLoading,
    detailError,
    load,
    loadMore,
    openDetail,
    loadMoreDetail,
    closeDetail,
    reset,
  };
}
