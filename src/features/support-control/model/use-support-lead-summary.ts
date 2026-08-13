import { ref } from 'vue';
import { ApiError } from '@/shared/api/http/api-error';
import type {
  SupportLeadSummarySource,
  SupportLeadSummary,
} from '@/features/support-control/api/support-lead-source';

export interface SupportLeadSummaryContext {
  projectId(): string | undefined;
  canRead(): boolean;
  onForbidden?(): void | Promise<void>;
}

/** Owns one authoritative lead-summary projection for the current project. */
export function createSupportLeadSummaryController(
  context: SupportLeadSummaryContext,
  source: SupportLeadSummarySource,
) {
  const summary = ref<SupportLeadSummary | null>(null);
  const loading = ref(false);
  const error = ref('');
  let generation = 0;
  let requestAbort: AbortController | null = null;

  function reset(): void {
    generation += 1;
    requestAbort?.abort();
    requestAbort = null;
    summary.value = null;
    loading.value = false;
    error.value = '';
  }

  async function load(): Promise<void> {
    const projectId = context.projectId();
    requestAbort?.abort();
    const requestGeneration = ++generation;
    const abort = new AbortController();
    requestAbort = abort;
    error.value = '';
    if (!projectId || !context.canRead()) {
      loading.value = false;
      requestAbort = null;
      return;
    }

    loading.value = true;
    try {
      const result = await source.readSummary(projectId, abort.signal);
      if (
        requestGeneration !== generation ||
        context.projectId() !== projectId ||
        !context.canRead()
      )
        return;
      summary.value = result;
    } catch (cause) {
      if (
        requestGeneration !== generation ||
        context.projectId() !== projectId ||
        !context.canRead()
      )
        return;
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) {
        reset();
        await context.onForbidden?.();
        return;
      }
      error.value = 'Не удалось загрузить операционный обзор';
    } finally {
      if (requestGeneration === generation) {
        loading.value = false;
        requestAbort = null;
      }
    }
  }

  return { summary, loading, error, load, reset };
}
