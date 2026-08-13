import { computed, ref, shallowRef, watch, type Ref } from 'vue';
import type {
  ProfileProjectionResponseDto,
  SupportActivityResponseDto as GeneratedSupportActivityResponseDto,
  SupportInspectorEventPageResponseDto,
  SupportInspectorEventsListParams,
  SupportLeadActivityParams,
} from '@/shared/api/generated/models';
import { ApiError } from '@/shared/api/http/api-error';

export type SupportInspectorTab =
  'CASE' | 'USER' | 'KNOWLEDGE' | 'INTEGRATIONS' | 'DATA' | 'EVENTS' | 'ACTIVITY';

export type SupportActivitySnapshot = Pick<
  GeneratedSupportActivityResponseDto,
  | 'capabilities'
  | 'checkpoint'
  | 'computedAt'
  | 'data'
  | 'effectiveWindow'
  | 'freshnessState'
  | 'kind'
  | 'nextCursor'
  | 'projectionGeneration'
  | 'sourceHighWater'
>;

export interface SupportInspectorTabItem {
  id: SupportInspectorTab;
  label: string;
  icon: string;
}

export interface SupportInspectorPermissions {
  profile: boolean;
  events: boolean;
  activity: boolean;
  knowledge?: boolean;
  externalWork?: boolean;
}

export interface SupportInspectorContext {
  projectId(): string | undefined;
  endUserId(): string | undefined;
  caseId(): string | undefined;
  operatorId(): string | undefined;
  permissions(): SupportInspectorPermissions;
  onForbidden?(tab: SupportInspectorTab): void | Promise<void>;
}

export interface SupportInspectorSource {
  readProfile(
    projectId: string,
    endUserId: string,
    signal?: AbortSignal,
  ): Promise<ProfileProjectionResponseDto>;
  readEvents(
    projectId: string,
    caseId: string,
    params: SupportInspectorEventsListParams,
    signal?: AbortSignal,
  ): Promise<SupportInspectorEventPageResponseDto>;
  readActivity(
    projectId: string,
    params: SupportLeadActivityParams,
    signal?: AbortSignal,
  ): Promise<SupportActivitySnapshot>;
}

export interface SupportInspectorResource<T> {
  data: Ref<T | null>;
  loading: Ref<boolean>;
  error: Ref<string>;
  loaded: Ref<boolean>;
}

interface ResourceController<T> extends SupportInspectorResource<T> {
  generation: number;
  abort: AbortController | null;
}

const TAB_STORAGE_PREFIX = 'retenive:support-inspector-tab:';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1_000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1_000;

const tabCatalog: readonly SupportInspectorTabItem[] = [
  { id: 'CASE', label: 'Обращение', icon: 'pi pi-briefcase' },
  { id: 'USER', label: 'Пользователь', icon: 'pi pi-user' },
  { id: 'KNOWLEDGE', label: 'Материалы', icon: 'pi pi-book' },
  { id: 'INTEGRATIONS', label: 'Интеграции', icon: 'pi pi-link' },
  { id: 'DATA', label: 'Профиль', icon: 'pi pi-id-card' },
  { id: 'EVENTS', label: 'События', icon: 'pi pi-bolt' },
  { id: 'ACTIVITY', label: 'Активность', icon: 'pi pi-history' },
];

function resource<T>(): ResourceController<T> {
  return {
    data: shallowRef<T | null>(null),
    loading: ref(false),
    error: ref(''),
    loaded: ref(false),
    generation: 0,
    abort: null,
  };
}

function resetResource<T>(state: ResourceController<T>): void {
  state.generation += 1;
  state.abort?.abort();
  state.abort = null;
  state.data.value = null;
  state.loading.value = false;
  state.error.value = '';
  state.loaded.value = false;
}

function storageKey(operatorId: string | undefined): string | null {
  return operatorId ? `${TAB_STORAGE_PREFIX}${operatorId}` : null;
}

function readStoredTab(operatorId: string | undefined): SupportInspectorTab | null {
  const key = storageKey(operatorId);
  if (!key) return null;
  try {
    const value = globalThis.sessionStorage?.getItem(key);
    return tabCatalog.some((tab) => tab.id === value) ? (value as SupportInspectorTab) : null;
  } catch {
    return null;
  }
}

function persistTab(operatorId: string | undefined, tab: SupportInspectorTab): void {
  const key = storageKey(operatorId);
  if (!key) return;
  try {
    globalThis.sessionStorage?.setItem(key, tab);
  } catch {
    // A storage policy must not make the Inspector unusable.
  }
}

function resourceError(cause: unknown, label: string): string {
  if (cause instanceof ApiError && cause.status === 429)
    return 'Слишком много запросов. Подождите немного и повторите.';
  if (cause instanceof ApiError && cause.status === 503)
    return 'Данные ещё готовятся. Повторите загрузку через несколько секунд.';
  return `Не удалось загрузить ${label.toLowerCase()}.`;
}

/**
 * Owns all permission-gated Inspector reads behind one small interface. Each
 * projection keeps an independent lifecycle and is synchronously purged when
 * its subject, Project or authority changes.
 */
export function createSupportInspectorController(
  context: SupportInspectorContext,
  source: SupportInspectorSource,
  options: { now?: () => Date } = {},
) {
  const now = options.now ?? (() => new Date());
  const profile = resource<ProfileProjectionResponseDto>();
  const events = resource<SupportInspectorEventPageResponseDto>();
  const activity = resource<SupportActivitySnapshot>();
  const tabs = computed(() => {
    const permissions = context.permissions();
    const hasCase = Boolean(context.caseId());
    return tabCatalog.filter((tab) => {
      if (tab.id === 'CASE') return hasCase;
      if (tab.id === 'KNOWLEDGE') return hasCase && permissions.knowledge;
      if (tab.id === 'INTEGRATIONS') return hasCase && permissions.externalWork;
      if (tab.id === 'DATA') return permissions.profile;
      if (tab.id === 'EVENTS') return hasCase && permissions.events;
      if (tab.id === 'ACTIVITY') return hasCase && permissions.activity;
      return true;
    });
  });
  const defaultTab = (): SupportInspectorTab => (context.caseId() ? 'CASE' : 'USER');
  const activeTab = ref<SupportInspectorTab>(defaultTab());
  let eventsWindow: { from: string; to: string } | null = null;
  let activityWindow: { from: string; to: string } | null = null;
  let restoredScopeKey: string | null = null;

  function isAllowed(tab: SupportInspectorTab): boolean {
    return tabs.value.some((item) => item.id === tab);
  }

  function ensureSafeTab(): void {
    if (isAllowed(activeTab.value)) return;
    activeTab.value = defaultTab();
    persistTab(context.operatorId(), activeTab.value);
  }

  function restoreStoredTabForScope(): void {
    const projectId = context.projectId();
    const endUserId = context.endUserId();
    const operatorId = context.operatorId();
    if (!projectId || !endUserId || !operatorId) return;
    const scopeKey = [operatorId, projectId, endUserId, context.caseId() ?? ''].join(':');
    if (scopeKey === restoredScopeKey) return;
    restoredScopeKey = scopeKey;
    const stored = readStoredTab(operatorId);
    if (stored && isAllowed(stored)) activeTab.value = stored;
  }

  function currentScope() {
    return {
      projectId: context.projectId(),
      endUserId: context.endUserId(),
      caseId: context.caseId(),
      operatorId: context.operatorId(),
      permissions: context.permissions(),
    };
  }

  restoreStoredTabForScope();

  async function forbidden(tab: SupportInspectorTab): Promise<void> {
    if (tab === 'DATA') resetResource(profile);
    if (tab === 'EVENTS') resetResource(events);
    if (tab === 'ACTIVITY') resetResource(activity);
    await context.onForbidden?.(tab);
  }

  async function loadProfile(force = false): Promise<void> {
    const { projectId, endUserId, operatorId, permissions } = currentScope();
    if (!projectId || !endUserId || !operatorId || !permissions.profile) {
      resetResource(profile);
      return;
    }
    if (!force && profile.loaded.value) return;
    profile.abort?.abort();
    const abort = new AbortController();
    const generation = ++profile.generation;
    profile.abort = abort;
    profile.loading.value = true;
    profile.error.value = '';
    try {
      const result = await source.readProfile(projectId, endUserId, abort.signal);
      if (
        generation !== profile.generation ||
        context.projectId() !== projectId ||
        context.endUserId() !== endUserId ||
        context.operatorId() !== operatorId ||
        !context.permissions().profile
      )
        return;
      if (result.endUserId !== endUserId)
        throw new Error('Inspector profile belongs to another End User');
      profile.data.value = result;
      profile.loaded.value = true;
    } catch (cause) {
      if (generation !== profile.generation || abort.signal.aborted) return;
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) {
        await forbidden('DATA');
        return;
      }
      profile.data.value = null;
      profile.error.value = resourceError(cause, 'данные пользователя');
      profile.loaded.value = true;
    } finally {
      if (generation === profile.generation) {
        profile.loading.value = false;
        profile.abort = null;
      }
    }
  }

  function boundedWindow(durationMs: number): { from: string; to: string } {
    const to = now();
    return {
      from: new Date(to.getTime() - durationMs).toISOString(),
      to: to.toISOString(),
    };
  }

  async function loadEvents(force = false): Promise<void> {
    const { projectId, caseId, operatorId, permissions } = currentScope();
    if (!projectId || !caseId || !operatorId || !permissions.events) {
      resetResource(events);
      return;
    }
    if (!force && events.loaded.value) return;
    events.abort?.abort();
    const abort = new AbortController();
    const generation = ++events.generation;
    events.abort = abort;
    events.loading.value = true;
    events.error.value = '';
    eventsWindow = boundedWindow(THIRTY_DAYS_MS);
    try {
      const result = await source.readEvents(
        projectId,
        caseId,
        { ...eventsWindow, limit: 50 },
        abort.signal,
      );
      if (
        generation !== events.generation ||
        context.projectId() !== projectId ||
        context.caseId() !== caseId ||
        context.operatorId() !== operatorId ||
        !context.permissions().events
      )
        return;
      if (result.caseId !== caseId) throw new Error('Inspector Events belong to another Case');
      events.data.value = result;
      events.loaded.value = true;
    } catch (cause) {
      if (generation !== events.generation || abort.signal.aborted) return;
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) {
        await forbidden('EVENTS');
        return;
      }
      events.data.value = null;
      events.error.value = resourceError(cause, 'события');
      events.loaded.value = true;
    } finally {
      if (generation === events.generation) {
        events.loading.value = false;
        events.abort = null;
      }
    }
  }

  async function loadMoreEvents(): Promise<void> {
    const current = events.data.value;
    const { projectId, caseId, operatorId, permissions } = currentScope();
    if (
      !current?.nextCursor ||
      !eventsWindow ||
      !projectId ||
      !caseId ||
      !operatorId ||
      !permissions.events ||
      events.loading.value
    )
      return;
    const generation = events.generation;
    events.loading.value = true;
    events.error.value = '';
    try {
      const next = await source.readEvents(projectId, caseId, {
        ...eventsWindow,
        limit: 50,
        cursor: current.nextCursor,
      });
      if (
        generation !== events.generation ||
        context.projectId() !== projectId ||
        context.caseId() !== caseId ||
        context.operatorId() !== operatorId ||
        !context.permissions().events
      )
        return;
      if (next.caseId !== caseId || next.snapshotAt !== current.snapshotAt)
        throw new Error('Inspector Events pagination changed snapshot');
      events.data.value = {
        ...next,
        items: [...current.items, ...next.items],
      };
    } catch (cause) {
      if (generation !== events.generation) return;
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) {
        await forbidden('EVENTS');
        return;
      }
      events.error.value = resourceError(cause, 'следующую страницу событий');
    } finally {
      if (generation === events.generation) events.loading.value = false;
    }
  }

  async function loadActivity(force = false): Promise<void> {
    const { projectId, caseId, operatorId, permissions } = currentScope();
    if (!projectId || !caseId || !operatorId || !permissions.activity) {
      resetResource(activity);
      return;
    }
    if (!force && activity.loaded.value) return;
    activity.abort?.abort();
    const abort = new AbortController();
    const generation = ++activity.generation;
    activity.abort = abort;
    activity.loading.value = true;
    activity.error.value = '';
    activityWindow = boundedWindow(SEVEN_DAYS_MS);
    try {
      const result = await source.readActivity(
        projectId,
        { caseId, ...activityWindow, limit: 100 },
        abort.signal,
      );
      if (
        generation !== activity.generation ||
        context.projectId() !== projectId ||
        context.caseId() !== caseId ||
        context.operatorId() !== operatorId ||
        !context.permissions().activity
      )
        return;
      if (result.data.facts.some((fact) => fact.caseId && fact.caseId !== caseId))
        throw new Error('Support Activity contains another Case');
      activity.data.value = result;
      activity.loaded.value = true;
    } catch (cause) {
      if (generation !== activity.generation || abort.signal.aborted) return;
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) {
        await forbidden('ACTIVITY');
        return;
      }
      activity.data.value = null;
      activity.error.value = resourceError(cause, 'активность поддержки');
      activity.loaded.value = true;
    } finally {
      if (generation === activity.generation) {
        activity.loading.value = false;
        activity.abort = null;
      }
    }
  }

  async function loadMoreActivity(): Promise<void> {
    const current = activity.data.value;
    const { projectId, caseId, operatorId, permissions } = currentScope();
    if (
      !current?.nextCursor ||
      !activityWindow ||
      !projectId ||
      !caseId ||
      !operatorId ||
      !permissions.activity ||
      activity.loading.value
    )
      return;
    const generation = activity.generation;
    activity.loading.value = true;
    activity.error.value = '';
    try {
      const next = await source.readActivity(projectId, {
        caseId,
        ...activityWindow,
        limit: 100,
        cursor: current.nextCursor,
      });
      if (
        generation !== activity.generation ||
        context.projectId() !== projectId ||
        context.caseId() !== caseId ||
        context.operatorId() !== operatorId ||
        !context.permissions().activity
      )
        return;
      if (
        next.projectionGeneration !== current.projectionGeneration ||
        next.data.facts.some((fact) => fact.caseId && fact.caseId !== caseId)
      )
        throw new Error('Support Activity pagination changed snapshot');
      activity.data.value = {
        ...next,
        data: { facts: [...current.data.facts, ...next.data.facts] },
      };
    } catch (cause) {
      if (generation !== activity.generation) return;
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) {
        await forbidden('ACTIVITY');
        return;
      }
      activity.error.value = resourceError(cause, 'следующую страницу активности');
    } finally {
      if (generation === activity.generation) activity.loading.value = false;
    }
  }

  async function loadActiveTab(force = false): Promise<void> {
    if (activeTab.value === 'DATA') await loadProfile(force);
    if (activeTab.value === 'EVENTS') await loadEvents(force);
    if (activeTab.value === 'ACTIVITY') await loadActivity(force);
  }

  async function open(tab: SupportInspectorTab): Promise<void> {
    if (!isAllowed(tab)) return;
    activeTab.value = tab;
    persistTab(context.operatorId(), tab);
    await loadActiveTab();
  }

  function reset(): void {
    resetResource(profile);
    resetResource(events);
    resetResource(activity);
    eventsWindow = null;
    activityWindow = null;
  }

  let previous = currentScope();
  watch(
    () =>
      [
        context.projectId(),
        context.endUserId(),
        context.caseId(),
        context.operatorId(),
        context.permissions().profile,
        context.permissions().events,
        context.permissions().activity,
        context.permissions().knowledge,
        context.permissions().externalWork,
      ] as const,
    () => {
      const next = currentScope();
      const subjectChanged =
        next.projectId !== previous.projectId ||
        next.endUserId !== previous.endUserId ||
        next.caseId !== previous.caseId ||
        next.operatorId !== previous.operatorId;
      if (subjectChanged) reset();
      else {
        if (!next.permissions.profile) resetResource(profile);
        if (!next.permissions.events) resetResource(events);
        if (!next.permissions.activity) resetResource(activity);
      }
      previous = next;
      restoreStoredTabForScope();
      ensureSafeTab();
      void loadActiveTab();
    },
    { flush: 'sync' },
  );

  return {
    activeTab,
    tabs,
    profile,
    events,
    activity,
    open,
    loadActiveTab,
    reloadActiveTab: () => loadActiveTab(true),
    loadMoreEvents,
    loadMoreActivity,
    reset,
  };
}
