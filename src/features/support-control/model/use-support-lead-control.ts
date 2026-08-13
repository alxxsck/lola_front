import { ref } from 'vue';
import { ApiError } from '@/shared/api/http/api-error';
import type {
  SupportLeadActivityPage,
  SupportLeadCapacityRiskPage,
  SupportLeadDrilldownSource,
  SupportLeadInvestigation,
  SupportLeadReadiness,
} from '@/features/support-control/api/support-lead-source';

export interface SupportLeadControlContext {
  projectId(): string | undefined;
  canRead(): boolean;
  canReadActivity(): boolean;
  onForbidden?(): void | Promise<void>;
  onActivityForbidden?(): void | Promise<void>;
}

/**
 * Owns Lead projection readiness and bounded drill-downs. All protected projections are
 * scoped to the current Project and selected Case and are purged before an
 * authority callback is invoked.
 */
export function createSupportLeadControlController(
  context: SupportLeadControlContext,
  source: SupportLeadDrilldownSource,
) {
  const readiness = ref<SupportLeadReadiness | null>(null);
  const capacity = ref<SupportLeadCapacityRiskPage | null>(null);
  const investigation = ref<SupportLeadInvestigation | null>(null);
  const activity = ref<SupportLeadActivityPage | null>(null);
  const selectedCaseId = ref<string | null>(null);
  const loadingReadiness = ref(false);
  const loadingCapacity = ref(false);
  const loadingInvestigation = ref(false);
  const loadingActivity = ref(false);
  const error = ref('');
  const investigationError = ref('');
  const activityError = ref('');
  let projectGeneration = 0;
  let selectionGeneration = 0;
  let activityAuthorityGeneration = 0;
  let investigationPaginationGeneration = 0;
  let activityPaginationGeneration = 0;
  let projectAbort: AbortController | null = null;
  let selectionAbort: AbortController | null = null;
  let investigationPaginationAbort: AbortController | null = null;
  let activityPaginationAbort: AbortController | null = null;

  function resetSelection(): void {
    selectionGeneration += 1;
    selectionAbort?.abort();
    selectionAbort = null;
    investigationPaginationGeneration += 1;
    investigationPaginationAbort?.abort();
    investigationPaginationAbort = null;
    activityPaginationGeneration += 1;
    activityPaginationAbort?.abort();
    activityPaginationAbort = null;
    selectedCaseId.value = null;
    investigation.value = null;
    activity.value = null;
    loadingInvestigation.value = false;
    loadingActivity.value = false;
    investigationError.value = '';
    activityError.value = '';
    activityAuthorityGeneration += 1;
  }

  function resetActivity(): void {
    activityAuthorityGeneration += 1;
    activityPaginationGeneration += 1;
    activityPaginationAbort?.abort();
    activityPaginationAbort = null;
    activity.value = null;
    loadingActivity.value = false;
    activityError.value = '';
  }

  function reset(): void {
    projectGeneration += 1;
    projectAbort?.abort();
    projectAbort = null;
    readiness.value = null;
    capacity.value = null;
    loadingReadiness.value = false;
    loadingCapacity.value = false;
    error.value = '';
    resetSelection();
  }

  function currentProject(projectId: string, generation: number): boolean {
    return (
      generation === projectGeneration && context.canRead() && context.projectId() === projectId
    );
  }

  async function load(): Promise<void> {
    const projectId = context.projectId();
    const caseToRestore = selectedCaseId.value;
    resetSelection();
    projectAbort?.abort();
    const generation = ++projectGeneration;
    const abort = new AbortController();
    projectAbort = abort;
    error.value = '';
    if (!projectId || !context.canRead()) return;
    loadingReadiness.value = true;
    try {
      const nextReadiness = await source.readReadiness(projectId, abort.signal);
      if (!currentProject(projectId, generation)) return;
      readiness.value = nextReadiness;
      loadingReadiness.value = false;
      if (
        !['READY', 'STALE'].includes(nextReadiness.readinessState) ||
        nextReadiness.capabilities.capacityRisks !== 'AVAILABLE'
      ) {
        capacity.value = null;
        if (caseToRestore && nextReadiness.capabilities.investigation !== 'UNAVAILABLE')
          await selectCase(caseToRestore);
        return;
      }
      loadingCapacity.value = true;
      const nextCapacity = await source.readCapacityRisks(projectId, undefined, abort.signal);
      if (!currentProject(projectId, generation)) return;
      capacity.value = nextCapacity;
      if (caseToRestore && nextReadiness.capabilities.investigation !== 'UNAVAILABLE')
        await selectCase(caseToRestore);
    } catch (cause) {
      if (!currentProject(projectId, generation)) return;
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) {
        reset();
        await context.onForbidden?.();
        return;
      }
      readiness.value = null;
      capacity.value = null;
      resetSelection();
      error.value = 'Панель руководителя временно недоступна. Повторите загрузку.';
    } finally {
      if (generation === projectGeneration) {
        loadingReadiness.value = false;
        loadingCapacity.value = false;
        projectAbort = null;
      }
    }
  }

  async function selectCase(caseId: string): Promise<void> {
    const projectId = context.projectId();
    selectionAbort?.abort();
    investigationPaginationGeneration += 1;
    investigationPaginationAbort?.abort();
    investigationPaginationAbort = null;
    activityPaginationGeneration += 1;
    activityPaginationAbort?.abort();
    activityPaginationAbort = null;
    const generation = ++selectionGeneration;
    const activityGeneration = activityAuthorityGeneration;
    const abort = new AbortController();
    selectionAbort = abort;
    selectedCaseId.value = caseId;
    investigation.value = null;
    activity.value = null;
    investigationError.value = '';
    activityError.value = '';
    const investigationCapability = readiness.value?.capabilities.investigation;
    if (
      !projectId ||
      !context.canRead() ||
      !investigationCapability ||
      investigationCapability === 'UNAVAILABLE'
    )
      return;
    loadingInvestigation.value = true;
    loadingActivity.value = context.canReadActivity();
    const sameScope = () =>
      generation === selectionGeneration &&
      context.projectId() === projectId &&
      context.canRead() &&
      selectedCaseId.value === caseId;
    const investigationRequest = source.readInvestigation(
      projectId,
      caseId,
      undefined,
      abort.signal,
    );
    const activityRequest =
      context.canReadActivity() && readiness.value?.capabilities.activity === 'AVAILABLE'
        ? source.readActivity(projectId, caseId, undefined, abort.signal)
        : Promise.resolve(null);
    const [investigationResult, activityResult] = await Promise.allSettled([
      investigationRequest,
      activityRequest,
    ]);
    if (!sameScope()) return;
    if (investigationResult.status === 'rejected') {
      const cause = investigationResult.reason;
      if (!sameScope()) return;
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) {
        resetSelection();
        await context.onForbidden?.();
        return;
      }
      investigationError.value = 'Не удалось собрать историю причин по обращению.';
    } else {
      investigation.value = investigationResult.value;
    }
    if (activityGeneration !== activityAuthorityGeneration || !context.canReadActivity()) {
      activity.value = null;
    } else if (activityResult.status === 'rejected') {
      const cause = activityResult.reason;
      activity.value = null;
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404))
        await context.onActivityForbidden?.();
      else activityError.value = 'Не удалось загрузить защищённые действия.';
    } else activity.value = activityResult.value;
    if (generation === selectionGeneration) {
      loadingInvestigation.value = false;
      loadingActivity.value = false;
      selectionAbort = null;
    }
  }

  async function loadMoreCapacity(): Promise<void> {
    const projectId = context.projectId();
    const cursor = capacity.value?.nextCursor;
    if (!projectId || !cursor || loadingCapacity.value || !context.canRead()) return;
    projectAbort?.abort();
    const generation = ++projectGeneration;
    const abort = new AbortController();
    projectAbort = abort;
    loadingCapacity.value = true;
    try {
      const page = await source.readCapacityRisks(projectId, { cursor, limit: 50 }, abort.signal);
      if (!currentProject(projectId, generation) || !capacity.value) return;
      const ids = new Set(capacity.value.items.map((item) => item.riskId));
      capacity.value = {
        ...page,
        items: [...capacity.value.items, ...page.items.filter((item) => !ids.has(item.riskId))],
      };
    } catch (cause) {
      if (!currentProject(projectId, generation)) return;
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) {
        reset();
        await context.onForbidden?.();
        return;
      }
      error.value = 'Не удалось загрузить следующую страницу рисков нагрузки.';
    } finally {
      if (generation === projectGeneration) {
        loadingCapacity.value = false;
        projectAbort = null;
      }
    }
  }

  async function loadMoreInvestigation(): Promise<void> {
    const projectId = context.projectId();
    const caseId = selectedCaseId.value;
    const current = investigation.value;
    if (!projectId || !caseId || !current?.nextCursor || loadingInvestigation.value) return;
    investigationPaginationAbort?.abort();
    const selection = selectionGeneration;
    const generation = ++investigationPaginationGeneration;
    const abort = new AbortController();
    investigationPaginationAbort = abort;
    loadingInvestigation.value = true;
    try {
      const page = await source.readInvestigation(
        projectId,
        caseId,
        {
          cursor: current.nextCursor,
          limit: 100,
          ...(current.effectiveWindow ?? {}),
        },
        abort.signal,
      );
      if (
        selection !== selectionGeneration ||
        generation !== investigationPaginationGeneration ||
        context.projectId() !== projectId ||
        selectedCaseId.value !== caseId ||
        !investigation.value
      )
        return;
      const ids = new Set(investigation.value.facts.map((fact) => fact.id));
      investigation.value = {
        ...page,
        facts: [...investigation.value.facts, ...page.facts.filter((fact) => !ids.has(fact.id))],
      };
    } catch (cause) {
      if (
        selection !== selectionGeneration ||
        generation !== investigationPaginationGeneration ||
        selectedCaseId.value !== caseId
      )
        return;
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) {
        resetSelection();
        await context.onForbidden?.();
        return;
      }
      investigationError.value = 'Не удалось загрузить более ранние причины.';
    } finally {
      if (selection === selectionGeneration && generation === investigationPaginationGeneration) {
        loadingInvestigation.value = false;
        investigationPaginationAbort = null;
      }
    }
  }

  async function loadMoreActivity(): Promise<void> {
    const projectId = context.projectId();
    const caseId = selectedCaseId.value;
    const current = activity.value;
    if (!projectId || !caseId || !current?.nextCursor || loadingActivity.value) return;
    activityPaginationAbort?.abort();
    const selection = selectionGeneration;
    const authority = activityAuthorityGeneration;
    const generation = ++activityPaginationGeneration;
    const abort = new AbortController();
    activityPaginationAbort = abort;
    loadingActivity.value = true;
    try {
      const page = await source.readActivity(
        projectId,
        caseId,
        {
          cursor: current.nextCursor,
          limit: 100,
          ...(current.effectiveWindow ?? {}),
        },
        abort.signal,
      );
      if (
        selection !== selectionGeneration ||
        authority !== activityAuthorityGeneration ||
        generation !== activityPaginationGeneration ||
        context.projectId() !== projectId ||
        selectedCaseId.value !== caseId ||
        !activity.value
      )
        return;
      const ids = new Set(activity.value.facts.map((fact) => fact.id));
      activity.value = {
        ...page,
        facts: [...activity.value.facts, ...page.facts.filter((fact) => !ids.has(fact.id))],
      };
    } catch (cause) {
      if (
        selection !== selectionGeneration ||
        authority !== activityAuthorityGeneration ||
        generation !== activityPaginationGeneration ||
        selectedCaseId.value !== caseId
      )
        return;
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) {
        activity.value = null;
        await context.onActivityForbidden?.();
      } else activityError.value = 'Не удалось загрузить следующую страницу действий.';
    } finally {
      if (
        selection === selectionGeneration &&
        authority === activityAuthorityGeneration &&
        generation === activityPaginationGeneration
      ) {
        loadingActivity.value = false;
        activityPaginationAbort = null;
      }
    }
  }

  return {
    readiness,
    capacity,
    investigation,
    activity,
    selectedCaseId,
    loadingReadiness,
    loadingCapacity,
    loadingInvestigation,
    loadingActivity,
    error,
    investigationError,
    activityError,
    load,
    selectCase,
    loadMoreCapacity,
    loadMoreInvestigation,
    loadMoreActivity,
    resetSelection,
    resetActivity,
    reset,
  };
}
