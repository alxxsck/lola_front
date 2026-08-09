import { ref } from "vue";
import { ApiError } from "@/shared/api/http/api-error";
import type {
  SupportLeadCaseRiskPage,
  SupportLeadRiskType,
  SupportLeadRisksSource,
} from "@/features/support-control/api/support-lead-source";

export interface SupportLeadRisksContext {
  projectId(): string | undefined;
  canRead(): boolean;
  onForbidden?(): void | Promise<void>;
}

/** Owns the server-sorted, bounded Case-risk page for one lead view. */
export function createSupportLeadRisksController(
  context: SupportLeadRisksContext,
  source: SupportLeadRisksSource,
  initialRiskType: SupportLeadRiskType = "UNASSIGNED_AGED",
) {
  const riskType = ref<SupportLeadRiskType>(initialRiskType);
  const page = ref<SupportLeadCaseRiskPage | null>(null);
  const loading = ref(false);
  const error = ref("");
  let generation = 0;
  let requestAbort: AbortController | null = null;

  function reset(): void {
    generation += 1;
    requestAbort?.abort();
    requestAbort = null;
    page.value = null;
    loading.value = false;
    error.value = "";
  }

  function isCurrent(projectId: string, requestGeneration: number): boolean {
    return (
      requestGeneration === generation &&
      context.canRead() &&
      context.projectId() === projectId
    );
  }

  async function load(
    nextRiskType = riskType.value,
    cursor?: string,
  ): Promise<void> {
    const projectId = context.projectId();
    const typeChanged = nextRiskType !== riskType.value;
    const append = Boolean(cursor);
    requestAbort?.abort();
    riskType.value = nextRiskType;
    const requestGeneration = ++generation;
    const abort = new AbortController();
    requestAbort = abort;
    if (typeChanged) page.value = null;
    error.value = "";
    if (!projectId || !context.canRead()) {
      loading.value = false;
      requestAbort = null;
      return;
    }

    loading.value = true;
    try {
      const result = await source.readCaseRisks(
        projectId,
        nextRiskType,
        cursor ? { cursor } : undefined,
        abort.signal,
      );
      if (!isCurrent(projectId, requestGeneration) || riskType.value !== nextRiskType)
        return;
      if (!append || !page.value) {
        page.value = result;
        return;
      }
      const existing = new Set(
        page.value.items.map((item) => `${item.caseId}:${item.riskType}`),
      );
      page.value = {
        ...result,
        items: [
          ...page.value.items,
          ...result.items.filter(
            (item) => !existing.has(`${item.caseId}:${item.riskType}`),
          ),
        ],
      };
    } catch (cause) {
      if (!isCurrent(projectId, requestGeneration)) return;
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) {
        reset();
        await context.onForbidden?.();
        return;
      }
      error.value = "Не удалось загрузить риски обращений";
    } finally {
      if (requestGeneration === generation) {
        loading.value = false;
        requestAbort = null;
      }
    }
  }

  function loadMore(): Promise<void> {
    const cursor = page.value?.nextCursor;
    if (!cursor || loading.value) return Promise.resolve();
    return load(riskType.value, cursor);
  }

  return { riskType, page, loading, error, load, loadMore, reset };
}
