import { ref } from 'vue';
import { ApiError } from '@/shared/api/http/api-error';
import type {
  SupportSearchFreshness,
  SupportSearchPage,
  SupportSearchRequest,
  SupportSearchResult,
  SupportSearchSource,
} from '@/features/support-search/api/support-search-source';

export type SupportSearchFailure = 'NONE' | 'VALIDATION' | 'FORBIDDEN' | 'CONFLICT' | 'ERROR';

export interface SupportSearchContext {
  projectId(): string | undefined;
  request(): SupportSearchRequest;
  canSearch?(): boolean;
  onForbidden?(): void | Promise<void>;
}

export function createSupportSearchController(
  context: SupportSearchContext,
  source: SupportSearchSource,
) {
  const items = ref<SupportSearchResult[]>([]);
  const nextCursor = ref<string | null>(null);
  const freshness = ref<SupportSearchFreshness | null>(null);
  const loading = ref(false);
  const error = ref('');
  const failure = ref<SupportSearchFailure>('NONE');
  let generation = 0;

  function reset(): void {
    generation += 1;
    items.value = [];
    nextCursor.value = null;
    freshness.value = null;
    loading.value = false;
    error.value = '';
    failure.value = 'NONE';
  }

  function current(projectId: string, requestGeneration: number): boolean {
    return (
      requestGeneration === generation &&
      context.projectId() === projectId &&
      context.canSearch?.() !== false
    );
  }

  function fail(cause: unknown): SupportSearchFailure {
    if (!(cause instanceof ApiError)) return 'ERROR';
    if (cause.status === 400 || cause.status === 422) return 'VALIDATION';
    if (cause.status === 403 || cause.status === 404) return 'FORBIDDEN';
    if (cause.status === 409) return 'CONFLICT';
    return 'ERROR';
  }

  async function execute(cursor?: string): Promise<void> {
    const projectId = context.projectId();
    if (!projectId || context.canSearch?.() === false) {
      reset();
      return;
    }
    const requestGeneration = ++generation;
    const request: SupportSearchRequest = {
      ...context.request(),
      ...(cursor ? { cursor } : {}),
      limit: 30,
    };
    loading.value = true;
    error.value = '';
    failure.value = 'NONE';
    try {
      const page: SupportSearchPage = await source.search(projectId, request);
      if (!current(projectId, requestGeneration)) return;
      if (cursor) {
        const known = new Set(items.value.map((item) => `${item.kind}:${item.id}`));
        items.value = [
          ...items.value,
          ...page.items.filter((item) => !known.has(`${item.kind}:${item.id}`)),
        ];
      } else items.value = page.items;
      nextCursor.value = page.nextCursor;
      freshness.value = page.freshness;
    } catch (cause) {
      if (!current(projectId, requestGeneration)) return;
      const state = fail(cause);
      failure.value = state;
      error.value =
        state === 'VALIDATION'
          ? 'Проверьте поисковый запрос и выбранные фильтры'
          : state === 'CONFLICT'
            ? 'Индекс обновился — повторите поиск'
            : state === 'FORBIDDEN'
              ? 'Поиск больше недоступен'
              : 'Не удалось выполнить поиск';
      if (!cursor || state === 'FORBIDDEN') {
        items.value = [];
        nextCursor.value = null;
        freshness.value = null;
      }
      if (state === 'FORBIDDEN') await context.onForbidden?.();
    } finally {
      if (requestGeneration === generation) loading.value = false;
    }
  }

  function search(): Promise<void> {
    return execute();
  }

  function loadMore(): Promise<void> {
    const cursor = nextCursor.value;
    if (!cursor || loading.value) return Promise.resolve();
    return execute(cursor);
  }

  return {
    items,
    nextCursor,
    freshness,
    loading,
    error,
    failure,
    search,
    loadMore,
    reset,
  };
}
