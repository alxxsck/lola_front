import { ref } from 'vue';
import { ApiError } from '@/shared/api/http/api-error';
import type {
  CreateSavedSupportViewDto,
  ReplaceSavedSupportViewDraftDto,
  ReplaceSupportDefaultViewDtoSelection,
  SavedSupportViewResponseDto,
  SupportDefaultViewResponseDto,
  SupportViewPresetResponseDto,
} from '@/shared/api/generated/models';
import type {
  SupportSearchFreshness,
  SupportSearchResult,
} from '@/features/support-search/api/support-search-source';
import type {
  SupportViewSelection,
  SupportViewsSource,
} from '@/features/support-views/api/support-views-source';

export interface SupportViewsContext {
  projectId(): string | undefined;
  canSearch(): boolean;
  canReadSaved(): boolean;
  canMutate(): boolean;
  phrase(): string;
  beforeSelection?(): void;
  onSelection(selection: SupportViewSelection | null): void | Promise<void>;
}

export function defaultSelection(
  value: SupportDefaultViewResponseDto,
): SupportViewSelection | null {
  const selection = value.effectiveSelection;
  if (!value.available || !selection) return null;
  return selection.kind === 'SYSTEM'
    ? { kind: 'SYSTEM', code: selection.presetCode }
    : { kind: 'SAVED', id: selection.savedViewId };
}

export function createSupportViewsController(
  context: SupportViewsContext,
  source: SupportViewsSource,
) {
  const system = ref<SupportViewPresetResponseDto[]>([]);
  const saved = ref<SavedSupportViewResponseDto[]>([]);
  const defaultView = ref<SupportDefaultViewResponseDto | null>(null);
  const selection = ref<SupportViewSelection | null>(null);
  const items = ref<SupportSearchResult[]>([]);
  const nextCursor = ref<string | null>(null);
  const freshness = ref<SupportSearchFreshness | null>(null);
  const authorityKey = ref<string | null>(null);
  const loading = ref(false);
  const mutating = ref(false);
  const error = ref('');
  const conflict = ref('');
  let generation = 0;

  function reset(): void {
    generation += 1;
    system.value = [];
    saved.value = [];
    defaultView.value = null;
    selection.value = null;
    items.value = [];
    nextCursor.value = null;
    freshness.value = null;
    authorityKey.value = null;
    loading.value = false;
    mutating.value = false;
    error.value = '';
    conflict.value = '';
  }

  function resetResults(): void {
    generation += 1;
    items.value = [];
    nextCursor.value = null;
    freshness.value = null;
    authorityKey.value = null;
    loading.value = false;
    error.value = '';
  }

  const valid = (candidate: SupportViewSelection | null): candidate is SupportViewSelection =>
    candidate?.kind === 'SYSTEM'
      ? system.value.some((item) => item.code === candidate.code && item.permitted)
      : candidate?.kind === 'SAVED'
        ? saved.value.some(
            (item) =>
              item.id === candidate.id && item.permissions.read && item.lifecycle === 'ACTIVE',
          )
        : false;

  const sameSelection = (
    left: SupportViewSelection | null,
    right: SupportViewSelection | null,
  ): boolean =>
    left?.kind === right?.kind &&
    (left?.kind === 'SYSTEM'
      ? left.code === (right?.kind === 'SYSTEM' ? right.code : undefined)
      : left?.kind === 'SAVED'
        ? left.id === (right?.kind === 'SAVED' ? right.id : undefined)
        : true);

  function scrub(candidate: SupportViewSelection): void {
    if (candidate.kind === 'SYSTEM')
      system.value = system.value.filter((item) => item.code !== candidate.code);
    else saved.value = saved.value.filter((item) => item.id !== candidate.id);
  }

  function current(projectId: string, requestGeneration: number): boolean {
    return (
      generation === requestGeneration && context.projectId() === projectId && context.canSearch()
    );
  }

  async function query(cursor?: string, recoveryAttempted = false): Promise<void> {
    const projectId = context.projectId();
    const active = selection.value;
    if (!projectId || !active || !context.canSearch()) return;
    const requestGeneration = ++generation;
    loading.value = true;
    error.value = '';
    try {
      const page = await source.query(projectId, active, context.phrase(), cursor);
      if (!current(projectId, requestGeneration)) return;
      if (cursor && authorityKey.value && page.authorityKey !== authorityKey.value) {
        items.value = [];
        nextCursor.value = null;
        freshness.value = null;
        authorityKey.value = null;
        error.value = 'Представление изменилось — обновите результаты';
        return;
      }
      if (cursor) {
        const known = new Set(items.value.map((item) => `${item.kind}:${item.id}`));
        items.value = [
          ...items.value,
          ...page.items.filter((item) => !known.has(`${item.kind}:${item.id}`)),
        ];
      } else items.value = page.items;
      nextCursor.value = page.nextCursor;
      freshness.value = page.freshness;
      authorityKey.value = page.authorityKey;
    } catch (cause) {
      if (!current(projectId, requestGeneration)) return;
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) {
        scrub(active);
        if (recoveryAttempted) {
          reset();
          await context.onSelection(null);
          error.value = 'Представление больше недоступно';
        } else {
          selection.value = null;
          resetResults();
          await context.onSelection(null);
          await load(null, active);
        }
      } else {
        resetResults();
        error.value =
          cause instanceof ApiError && cause.status === 409
            ? 'Представление обновилось — выберите его снова'
            : 'Не удалось загрузить представление';
      }
    } finally {
      if (generation === requestGeneration) loading.value = false;
    }
  }

  async function load(
    requested: SupportViewSelection | null,
    excluded: SupportViewSelection | null = null,
    custom = false,
  ): Promise<void> {
    const projectId = context.projectId();
    if (!projectId || !context.canSearch()) {
      reset();
      return;
    }
    const requestGeneration = ++generation;
    const includeSaved = context.canReadSaved();
    items.value = [];
    nextCursor.value = null;
    freshness.value = null;
    authorityKey.value = null;
    loading.value = true;
    error.value = '';
    try {
      const catalog = await source.catalog(projectId, includeSaved);
      if (!current(projectId, requestGeneration)) return;
      if (includeSaved && !context.canReadSaved()) return;
      system.value = catalog.system.filter(
        (item) => !sameSelection({ kind: 'SYSTEM', code: item.code }, excluded),
      );
      saved.value = catalog.saved.filter(
        (item) => !sameSelection({ kind: 'SAVED', id: item.id }, excluded),
      );
      defaultView.value = catalog.defaultView;
      if (custom) {
        selection.value = null;
        return;
      }
      const fallback = defaultSelection(catalog.defaultView);
      const permittedSystem = system.value.find(
        (item) => !sameSelection({ kind: 'SYSTEM', code: item.code }, excluded),
      );
      const permittedSaved = saved.value.find(
        (item) => !sameSelection({ kind: 'SAVED', id: item.id }, excluded),
      );
      selection.value =
        valid(requested) && !sameSelection(requested, excluded)
          ? requested
          : valid(fallback) && !sameSelection(fallback, excluded)
            ? fallback
            : permittedSystem
              ? { kind: 'SYSTEM', code: permittedSystem.code }
              : permittedSaved
                ? { kind: 'SAVED', id: permittedSaved.id }
                : null;
      if (!selection.value) {
        items.value = [];
        error.value = 'Нет доступных представлений';
        await context.onSelection(null);
        return;
      }
      if (!requested || !valid(requested)) await context.onSelection(selection.value);
      await query(undefined, Boolean(excluded));
    } catch (cause) {
      if (!current(projectId, requestGeneration)) return;
      reset();
      error.value =
        cause instanceof ApiError && cause.status === 403
          ? 'Представления недоступны'
          : 'Не удалось загрузить представления';
    } finally {
      if (generation === requestGeneration) loading.value = false;
    }
  }

  async function purgeSaved(): Promise<void> {
    generation += 1;
    const wasSaved = selection.value?.kind === 'SAVED';
    saved.value = [];
    if (!wasSaved) return;
    selection.value = null;
    resetResults();
    await context.onSelection(null);
    if (context.canSearch()) await load(null);
  }

  async function select(next: SupportViewSelection): Promise<void> {
    if (!valid(next)) return;
    context.beforeSelection?.();
    selection.value = next;
    items.value = [];
    nextCursor.value = null;
    freshness.value = null;
    authorityKey.value = null;
    await context.onSelection(next);
    await query();
  }

  async function clearSelection(): Promise<void> {
    selection.value = null;
    resetResults();
    await context.onSelection(null);
  }

  const loadCustom = () => load(null, null, true);

  async function mutate(
    action: (projectId: string) => Promise<unknown>,
    requiresManage = true,
  ): Promise<boolean> {
    const projectId = context.projectId();
    if (!projectId || (requiresManage && !context.canMutate())) return false;
    const requestGeneration = ++generation;
    mutating.value = true;
    conflict.value = '';
    try {
      await action(projectId);
      if (!current(projectId, requestGeneration) || (requiresManage && !context.canMutate()))
        return false;
      await load(selection.value);
      return true;
    } catch (cause) {
      if (!current(projectId, requestGeneration)) return false;
      const message =
        cause instanceof ApiError && cause.status === 409
          ? 'Кто-то изменил представление. Данные обновлены — проверьте и повторите действие.'
          : 'Не удалось выполнить действие';
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) {
        reset();
        await context.onSelection(null);
        await load(null);
      } else if (cause instanceof ApiError && cause.status === 409) await load(selection.value);
      conflict.value = message;
      return false;
    } finally {
      if (context.projectId() === projectId) mutating.value = false;
    }
  }

  return {
    system,
    saved,
    defaultView,
    selection,
    items,
    nextCursor,
    freshness,
    authorityKey,
    loading,
    mutating,
    error,
    conflict,
    load,
    loadCustom,
    select,
    clearSelection,
    query,
    loadMore: () =>
      nextCursor.value && !loading.value ? query(nextCursor.value) : Promise.resolve(),
    create: (draft: CreateSavedSupportViewDto, key: string) =>
      mutate((projectId) => source.create(projectId, draft, key)),
    replace: (
      view: SavedSupportViewResponseDto,
      draft: ReplaceSavedSupportViewDraftDto,
      key: string,
    ) => mutate((projectId) => source.replace(projectId, view, draft, key)),
    publish: (view: SavedSupportViewResponseDto, key: string) =>
      mutate((projectId) => source.publish(projectId, view, key)),
    archive: (view: SavedSupportViewResponseDto, key: string) =>
      mutate((projectId) => source.archive(projectId, view, key)),
    setDefault: (choice: ReplaceSupportDefaultViewDtoSelection, key: string) =>
      defaultView.value
        ? mutate(
            (projectId) => source.setDefault(projectId, defaultView.value!, choice, key),
            false,
          )
        : Promise.resolve(false),
    reset,
    resetResults,
    purgeSaved,
  };
}
