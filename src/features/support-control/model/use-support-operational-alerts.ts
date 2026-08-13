import { ref } from 'vue';
import { ApiError } from '@/shared/api/http/api-error';
import type {
  SupportOperationalAlertsSource,
  SupportOperationalAlertDetail,
  SupportOperationalAlertPage,
  SupportLeadTarget,
} from '@/features/support-control/api/support-lead-source';

export interface SupportOperationalAlertsContext {
  projectId(): string | undefined;
  canRead(): boolean;
  canManage?(): boolean;
  onForbidden?(): void | Promise<void>;
}

/** Keeps alert list and one detail timeline isolated from the lead summary cache. */
export function createSupportOperationalAlertsController(
  context: SupportOperationalAlertsContext,
  source: SupportOperationalAlertsSource,
) {
  const page = ref<SupportOperationalAlertPage | null>(null);
  const loading = ref(false);
  const error = ref('');
  const detail = ref<SupportOperationalAlertDetail | null>(null);
  const detailLoading = ref(false);
  const detailError = ref('');
  const detailAlertId = ref<string | null>(null);
  const ownerTargets = ref<SupportLeadTarget[]>([]);
  const ownerTargetsLoading = ref(false);
  const mutating = ref<'ACKNOWLEDGE' | 'RESOLVE' | 'OWNER' | null>(null);
  const mutationError = ref('');
  const mutationNotice = ref('');
  const appliedReceiptVersion = ref<number | null>(null);
  let generation = 0;
  let detailGeneration = 0;
  let ownerTargetsGeneration = 0;
  let listAbort: AbortController | null = null;
  let detailAbort: AbortController | null = null;
  const attempts = new Map<string, string>();

  function reset(): void {
    generation += 1;
    detailGeneration += 1;
    ownerTargetsGeneration += 1;
    listAbort?.abort();
    detailAbort?.abort();
    listAbort = null;
    detailAbort = null;
    page.value = null;
    loading.value = false;
    error.value = '';
    detail.value = null;
    detailLoading.value = false;
    detailError.value = '';
    detailAlertId.value = null;
    ownerTargets.value = [];
    ownerTargetsLoading.value = false;
    mutating.value = null;
    mutationError.value = '';
    mutationNotice.value = '';
    appliedReceiptVersion.value = null;
    attempts.clear();
  }

  function isCurrent(projectId: string, requestGeneration: number): boolean {
    return (
      requestGeneration === generation && context.canRead() && context.projectId() === projectId
    );
  }

  function isCurrentDetail(projectId: string, requestGeneration: number): boolean {
    return (
      requestGeneration === detailGeneration &&
      context.canRead() &&
      context.projectId() === projectId
    );
  }

  async function load(cursor?: string, options: { retainDetail?: boolean } = {}): Promise<void> {
    const projectId = context.projectId();
    const append = Boolean(cursor);
    if (!append && !options.retainDetail) closeDetail();
    listAbort?.abort();
    const requestGeneration = ++generation;
    const abort = new AbortController();
    listAbort = abort;
    error.value = '';
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
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) {
        reset();
        await context.onForbidden?.();
        return;
      }
      error.value = 'Не удалось загрузить операционные сигналы';
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
    detailError.value = '';
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
        cursor ? { cursor, ...(detail.value?.effectiveWindow ?? {}) } : undefined,
        abort.signal,
      );
      if (!isCurrentDetail(projectId, requestGeneration)) return;
      if (!append || !detail.value) {
        detail.value = result;
        if (
          appliedReceiptVersion.value !== null &&
          result.alert.version >= appliedReceiptVersion.value
        )
          appliedReceiptVersion.value = null;
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
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) {
        reset();
        await context.onForbidden?.();
        return;
      }
      detailError.value = 'Не удалось загрузить историю сигнала';
    } finally {
      if (requestGeneration === detailGeneration) {
        detailLoading.value = false;
        detailAbort = null;
      }
    }
  }

  function openDetail(alertId: string): Promise<void> {
    const request = loadDetail(alertId);
    if (canManage()) void loadOwnerTargets();
    return request;
  }

  async function loadOwnerTargets(): Promise<void> {
    const projectId = context.projectId();
    const requestGeneration = detailGeneration;
    const targetGeneration = ++ownerTargetsGeneration;
    if (!projectId || !canManage() || !source.readAlertOwnerTargets) return;
    ownerTargetsLoading.value = true;
    try {
      const result = await source.readAlertOwnerTargets(projectId);
      if (
        !isCurrentDetail(projectId, requestGeneration) ||
        targetGeneration !== ownerTargetsGeneration ||
        !canManage()
      )
        return;
      ownerTargets.value = result;
    } catch (cause) {
      if (
        !isCurrentDetail(projectId, requestGeneration) ||
        targetGeneration !== ownerTargetsGeneration
      )
        return;
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) {
        ownerTargets.value = [];
        await context.onForbidden?.();
      }
    } finally {
      if (requestGeneration === detailGeneration && targetGeneration === ownerTargetsGeneration)
        ownerTargetsLoading.value = false;
    }
  }

  function resetManagement(): void {
    ownerTargetsGeneration += 1;
    ownerTargets.value = [];
    ownerTargetsLoading.value = false;
    mutating.value = null;
    mutationError.value = '';
    mutationNotice.value = '';
    appliedReceiptVersion.value = null;
    attempts.clear();
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
    detailError.value = '';
    detailAlertId.value = null;
    mutating.value = null;
    mutationError.value = '';
    mutationNotice.value = '';
    appliedReceiptVersion.value = null;
  }

  function canManage(): boolean {
    return Boolean(context.canRead() && context.canManage?.());
  }

  function commandKey(identity: string): string {
    const existing = attempts.get(identity);
    if (existing) return existing;
    const next = globalThis.crypto.randomUUID();
    attempts.set(identity, next);
    return next;
  }

  async function command(kind: 'ACKNOWLEDGE' | 'RESOLVE', reasonCode: string): Promise<boolean> {
    const projectId = context.projectId();
    const current = detail.value;
    const alertId = detailAlertId.value;
    if (
      !projectId ||
      !current ||
      !alertId ||
      current.alert.id !== alertId ||
      !canManage() ||
      appliedReceiptVersion.value !== null ||
      mutating.value
    )
      return false;
    const detailRequestGeneration = detailGeneration;
    const identity = `${projectId}\u001f${alertId}\u001f${kind}\u001f${current.alert.version}\u001f${reasonCode}`;
    const input = {
      expectedVersion: current.alert.version,
      idempotencyKey: commandKey(identity),
      reasonCode,
    };
    mutating.value = kind;
    mutationError.value = '';
    try {
      const receipt =
        kind === 'ACKNOWLEDGE'
          ? await source.acknowledge(
              projectId,
              alertId,
              input as Parameters<SupportOperationalAlertsSource['acknowledge']>[2],
            )
          : await source.resolve(
              projectId,
              alertId,
              input as Parameters<SupportOperationalAlertsSource['resolve']>[2],
            );
      const expectedState = kind === 'ACKNOWLEDGE' ? 'ACKNOWLEDGED' : 'RESOLVED';
      if (
        receipt.alertId !== alertId ||
        receipt.state !== expectedState ||
        receipt.version <= current.alert.version
      )
        throw new ApiError(0, 'Сервер вернул некорректное подтверждение команды');
      appliedReceiptVersion.value = receipt.version;
      if (
        detailRequestGeneration !== detailGeneration ||
        context.projectId() !== projectId ||
        detailAlertId.value !== alertId ||
        !canManage()
      )
        return false;
      attempts.delete(identity);
      await Promise.all([load(undefined, { retainDetail: true }), loadDetail(alertId)]);
      if (error.value || detailError.value)
        mutationNotice.value = 'Команда применена, но свежий снимок пока не загрузился.';
      return true;
    } catch (cause) {
      if (
        detailRequestGeneration !== detailGeneration ||
        context.projectId() !== projectId ||
        detailAlertId.value !== alertId
      )
        return false;
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) {
        reset();
        await context.onForbidden?.();
        return false;
      }
      mutationError.value =
        cause instanceof ApiError && cause.status === 409
          ? 'Сигнал уже изменился на сервере. Обновите его перед следующим действием.'
          : 'Не удалось выполнить действие с сигналом. Ничего не считается подтверждённым.';
      if (cause instanceof ApiError && cause.status === 409)
        await Promise.all([load(undefined, { retainDetail: true }), loadDetail(alertId)]);
      return false;
    } finally {
      if (
        context.projectId() === projectId &&
        detailAlertId.value === alertId &&
        mutating.value === kind
      )
        mutating.value = null;
    }
  }

  function acknowledge(
    reasonCode: 'INVESTIGATING' | 'OWNERSHIP_ACCEPTED' | 'ESCALATED',
  ): Promise<boolean> {
    return command('ACKNOWLEDGE', reasonCode);
  }

  function resolve(
    reasonCode:
      'RISK_CLEARED' | 'MITIGATED' | 'FALSE_POSITIVE' | 'DUPLICATE' | 'EXTERNAL_INCIDENT_HANDOFF',
  ): Promise<boolean> {
    return command('RESOLVE', reasonCode);
  }

  async function changeOwner(
    ownerCmsUserId: string | null,
    reasonCode:
      'LEAD_ASSIGNMENT' | 'LOAD_BALANCE' | 'SHIFT_HANDOFF' | 'SKILL_MATCH' | 'OWNER_UNAVAILABLE',
  ): Promise<boolean> {
    const projectId = context.projectId();
    const current = detail.value;
    const alertId = detailAlertId.value;
    if (
      !projectId ||
      !current ||
      !alertId ||
      !canManage() ||
      mutating.value ||
      appliedReceiptVersion.value !== null ||
      !source.changeOwner
    )
      return false;
    const requestGeneration = detailGeneration;
    const identity = `${projectId}\u001f${alertId}\u001fOWNER\u001f${current.alert.version}\u001f${ownerCmsUserId ?? 'none'}\u001f${reasonCode}`;
    mutating.value = 'OWNER';
    mutationError.value = '';
    mutationNotice.value = '';
    try {
      const receipt = await source.changeOwner(projectId, alertId, {
        ownerCmsUserId,
        reasonCode,
        expectedVersion: current.alert.version,
        idempotencyKey: commandKey(identity),
      });
      if (
        receipt.alertId !== alertId ||
        receipt.ownerCmsUserId !== ownerCmsUserId ||
        receipt.version <= current.alert.version
      )
        throw new ApiError(0, 'Сервер вернул некорректное подтверждение смены владельца');
      appliedReceiptVersion.value = receipt.version;
      if (!isCurrentDetail(projectId, requestGeneration) || !canManage()) return false;
      attempts.delete(identity);
      await Promise.all([load(undefined, { retainDetail: true }), loadDetail(alertId)]);
      if (error.value || detailError.value)
        mutationNotice.value = 'Владелец изменён, но свежий снимок пока не загрузился.';
      return true;
    } catch (cause) {
      if (!isCurrentDetail(projectId, requestGeneration)) return false;
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) {
        reset();
        await context.onForbidden?.();
        return false;
      }
      mutationError.value =
        cause instanceof ApiError && cause.status === 409
          ? 'Владелец сигнала уже изменился. Данные обновлены — выберите владельца заново.'
          : 'Не удалось изменить владельца сигнала.';
      if (cause instanceof ApiError && cause.status === 409) await loadDetail(alertId);
      return false;
    } finally {
      if (
        context.projectId() === projectId &&
        detailAlertId.value === alertId &&
        mutating.value === 'OWNER'
      )
        mutating.value = null;
    }
  }

  return {
    page,
    loading,
    error,
    detail,
    detailLoading,
    detailError,
    mutating,
    mutationError,
    mutationNotice,
    appliedReceiptVersion,
    ownerTargets,
    ownerTargetsLoading,
    load,
    loadMore,
    openDetail,
    loadMoreDetail,
    closeDetail,
    resetManagement,
    acknowledge,
    resolve,
    changeOwner,
    reset,
  };
}
