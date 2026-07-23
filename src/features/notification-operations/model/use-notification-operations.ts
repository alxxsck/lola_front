import { computed, ref } from "vue";
import type {
  NotificationOperationsApi,
  NotificationOperationsCommandOptions,
} from "../api/notification-operations.api";
import {
  canQuarantineNotificationIntegration,
  canReplayNotificationDelivery,
  safeNotificationOperationsError,
  type NotificationOperationsDelivery,
  type NotificationOperationsFilters,
  type NotificationOperationsHealth,
  type NotificationOperationsIntegration,
  type NotificationOperationsPermissions,
  type NotificationOperationsQuarantineReason,
  type NotificationOperationsSafeError,
} from "./notification-operations";

export interface NotificationOperationsContext {
  authorityKey: string;
  permissions: NotificationOperationsPermissions;
}

interface MutationIntent {
  idempotencyKey: string;
  generation: number;
  run: (options: NotificationOperationsCommandOptions) => Promise<boolean>;
}

const EMPTY_FILTERS: NotificationOperationsFilters = {
  projectId: "",
  channel: "",
  status: "",
  integrationKind: "",
  integrationStatus: "",
};

const EMPTY_CONTEXT: NotificationOperationsContext = {
  authorityKey: "",
  permissions: { read: false, operate: false },
};

export function createNotificationOperationsController(options: {
  api: NotificationOperationsApi;
  idempotencyKey?: () => string;
}) {
  const health = ref<NotificationOperationsHealth | null>(null);
  const deliveries = ref<NotificationOperationsDelivery[]>([]);
  const integrations = ref<NotificationOperationsIntegration[]>([]);
  const filters = ref<NotificationOperationsFilters>({ ...EMPTY_FILTERS });
  const nextDeliveryCursor = ref<string | null>(null);
  const nextIntegrationCursor = ref<string | null>(null);
  const healthLoading = ref(false);
  const deliveriesLoading = ref(false);
  const integrationsLoading = ref(false);
  const mutating = ref(false);
  const error = ref<NotificationOperationsSafeError | null>(null);
  const notice = ref("");
  const retryAvailable = computed(() =>
    Boolean(mutationIntent && error.value?.kind === "AMBIGUOUS"),
  );
  const controllers = new Set<AbortController>();
  let context = EMPTY_CONTEXT;
  let generation = 0;
  let disposed = false;
  let mutationIntent: MutationIntent | null = null;
  let healthRequestSequence = 0;
  let deliveryRequestSequence = 0;
  let integrationRequestSequence = 0;

  function readable(snapshot = context): boolean {
    return (
      !disposed && Boolean(snapshot.authorityKey) && snapshot.permissions.read
    );
  }

  function current(
    snapshot: NotificationOperationsContext,
    operationGeneration: number,
  ): boolean {
    return (
      readable(snapshot) &&
      readable() &&
      operationGeneration === generation &&
      snapshot.authorityKey === context.authorityKey &&
      snapshot.permissions.read === context.permissions.read &&
      snapshot.permissions.operate === context.permissions.operate
    );
  }

  function currentRequest(
    snapshot: NotificationOperationsContext,
    operationGeneration: number,
    requestSequence: number,
    latestRequestSequence: number,
  ): boolean {
    return (
      requestSequence === latestRequestSequence &&
      current(snapshot, operationGeneration)
    );
  }

  function requestController(): AbortController {
    const controller = new AbortController();
    controllers.add(controller);
    controller.signal.addEventListener(
      "abort",
      () => controllers.delete(controller),
      { once: true },
    );
    return controller;
  }

  function finishController(controller: AbortController): void {
    controllers.delete(controller);
  }

  function cancelRequests(): void {
    for (const controller of controllers) controller.abort();
    controllers.clear();
  }

  function resetState(): void {
    health.value = null;
    deliveries.value = [];
    integrations.value = [];
    filters.value = { ...EMPTY_FILTERS };
    nextDeliveryCursor.value = null;
    nextIntegrationCursor.value = null;
    healthLoading.value = false;
    deliveriesLoading.value = false;
    integrationsLoading.value = false;
    mutating.value = false;
    error.value = null;
    notice.value = "";
    mutationIntent = null;
  }

  function scrub(forbidden?: NotificationOperationsSafeError): void {
    generation += 1;
    cancelRequests();
    resetState();
    if (forbidden) error.value = forbidden;
  }

  function setContext(next: NotificationOperationsContext): void {
    const same =
      next.authorityKey === context.authorityKey &&
      next.permissions.read === context.permissions.read &&
      next.permissions.operate === context.permissions.operate;
    if (same) return;
    scrub();
    context = {
      authorityKey: next.authorityKey,
      permissions: { ...next.permissions },
    };
  }

  function handleReadError(
    cause: unknown,
    snapshot: NotificationOperationsContext,
    operationGeneration: number,
  ): void {
    if (!current(snapshot, operationGeneration)) return;
    const safeError = safeNotificationOperationsError(cause);
    if (safeError.kind === "FORBIDDEN") scrub(safeError);
    else error.value = safeError;
  }

  async function loadHealth(): Promise<boolean> {
    const snapshot = context;
    const operationGeneration = generation;
    if (!readable(snapshot)) return false;
    const requestSequence = ++healthRequestSequence;
    const controller = requestController();
    healthLoading.value = true;
    try {
      const value = await options.api.health({ signal: controller.signal });
      if (
        !currentRequest(
          snapshot,
          operationGeneration,
          requestSequence,
          healthRequestSequence,
        )
      )
        return false;
      health.value = value;
      return true;
    } catch (cause) {
      if (
        currentRequest(
          snapshot,
          operationGeneration,
          requestSequence,
          healthRequestSequence,
        )
      )
        handleReadError(cause, snapshot, operationGeneration);
      return false;
    } finally {
      finishController(controller);
      if (
        currentRequest(
          snapshot,
          operationGeneration,
          requestSequence,
          healthRequestSequence,
        )
      )
        healthLoading.value = false;
    }
  }

  async function loadDeliveries(append = false): Promise<boolean> {
    const snapshot = context;
    const operationGeneration = generation;
    if (!readable(snapshot) || (append && !nextDeliveryCursor.value))
      return false;
    const requestSequence = ++deliveryRequestSequence;
    const requestFilters = { ...filters.value };
    const requestCursor = append ? nextDeliveryCursor.value : null;
    const controller = requestController();
    deliveriesLoading.value = true;
    try {
      const page = await options.api.deliveries(requestFilters, requestCursor, {
        signal: controller.signal,
      });
      if (
        !currentRequest(
          snapshot,
          operationGeneration,
          requestSequence,
          deliveryRequestSequence,
        )
      )
        return false;
      deliveries.value = append
        ? mergeBy(deliveries.value, page.items, (item) => item.id)
        : page.items;
      nextDeliveryCursor.value = page.nextCursor;
      return true;
    } catch (cause) {
      if (
        currentRequest(
          snapshot,
          operationGeneration,
          requestSequence,
          deliveryRequestSequence,
        )
      )
        handleReadError(cause, snapshot, operationGeneration);
      return false;
    } finally {
      finishController(controller);
      if (
        currentRequest(
          snapshot,
          operationGeneration,
          requestSequence,
          deliveryRequestSequence,
        )
      )
        deliveriesLoading.value = false;
    }
  }

  async function loadIntegrations(append = false): Promise<boolean> {
    const snapshot = context;
    const operationGeneration = generation;
    if (!readable(snapshot) || (append && !nextIntegrationCursor.value))
      return false;
    const requestSequence = ++integrationRequestSequence;
    const requestFilters = { ...filters.value };
    const requestCursor = append ? nextIntegrationCursor.value : null;
    const controller = requestController();
    integrationsLoading.value = true;
    try {
      const page = await options.api.integrations(
        requestFilters,
        requestCursor,
        { signal: controller.signal },
      );
      if (
        !currentRequest(
          snapshot,
          operationGeneration,
          requestSequence,
          integrationRequestSequence,
        )
      )
        return false;
      integrations.value = append
        ? mergeBy(
            integrations.value,
            page.items,
            (item) => `${item.kind}:${item.integrationId}`,
          )
        : page.items;
      nextIntegrationCursor.value = page.nextCursor;
      return true;
    } catch (cause) {
      if (
        currentRequest(
          snapshot,
          operationGeneration,
          requestSequence,
          integrationRequestSequence,
        )
      )
        handleReadError(cause, snapshot, operationGeneration);
      return false;
    } finally {
      finishController(controller);
      if (
        currentRequest(
          snapshot,
          operationGeneration,
          requestSequence,
          integrationRequestSequence,
        )
      )
        integrationsLoading.value = false;
    }
  }

  async function refresh(): Promise<boolean> {
    if (!readable()) return false;
    error.value = null;
    notice.value = "";
    const results = await Promise.all([
      loadHealth(),
      loadDeliveries(),
      loadIntegrations(),
    ]);
    return results.some(Boolean);
  }

  async function setFilters(
    next: NotificationOperationsFilters,
  ): Promise<void> {
    if (mutating.value) return;
    generation += 1;
    cancelRequests();
    filters.value = {
      projectId: next.projectId.trim(),
      channel: next.channel,
      status: next.status,
      integrationKind: next.integrationKind,
      integrationStatus: next.integrationStatus.trim(),
    };
    deliveries.value = [];
    integrations.value = [];
    nextDeliveryCursor.value = null;
    nextIntegrationCursor.value = null;
    healthLoading.value = false;
    deliveriesLoading.value = false;
    integrationsLoading.value = false;
    error.value = null;
    notice.value = "";
    mutationIntent = null;
    await Promise.all([loadDeliveries(), loadIntegrations()]);
  }

  async function executeMutation(intent: MutationIntent): Promise<boolean> {
    if (
      mutating.value ||
      !readable() ||
      !context.permissions.operate ||
      intent.generation !== generation
    )
      return false;
    mutating.value = true;
    error.value = null;
    notice.value = "";
    const controller = requestController();
    try {
      const succeeded = await intent.run({
        signal: controller.signal,
        idempotencyKey: intent.idempotencyKey,
      });
      if (intent.generation !== generation) return false;
      if (succeeded && mutationIntent === intent) mutationIntent = null;
      return succeeded;
    } catch (cause) {
      if (intent.generation !== generation) return false;
      const safeError = safeNotificationOperationsError(cause);
      if (safeError.kind === "FORBIDDEN") {
        scrub(safeError);
        return false;
      }
      error.value = safeError;
      if (safeError.kind === "AMBIGUOUS") mutationIntent = intent;
      else {
        if (mutationIntent === intent) mutationIntent = null;
        if (
          safeError.kind === "CONFLICT" ||
          safeError.kind === "INVALID_STATE" ||
          safeError.kind === "NOT_FOUND"
        )
          await Promise.all([loadDeliveries(), loadIntegrations()]);
      }
      return false;
    } finally {
      finishController(controller);
      if (intent.generation === generation) mutating.value = false;
    }
  }

  function intent(run: MutationIntent["run"]): MutationIntent {
    return {
      run,
      generation,
      idempotencyKey: options.idempotencyKey?.() ?? crypto.randomUUID(),
    };
  }

  async function replayDelivery(deliveryId: string): Promise<boolean> {
    if (
      typeof deliveryId !== "string" ||
      !readable() ||
      !context.permissions.operate
    )
      return false;
    const currentDelivery = deliveries.value.find(
      (item) => item.id === deliveryId,
    );
    if (
      !currentDelivery ||
      !Number.isSafeInteger(currentDelivery.operationsVersion) ||
      currentDelivery.operationsVersion < 0 ||
      !canReplayNotificationDelivery(currentDelivery, context.permissions)
    )
      return false;
    const delivery = { ...currentDelivery };
    const command = intent(async (commandOptions) => {
      await options.api.replay(delivery, commandOptions);
      if (command.generation !== generation) return false;
      deliveries.value = deliveries.value.filter(
        (item) => item.id !== delivery.id,
      );
      notice.value =
        "Доставка возвращена в очередь без создания второй business delivery.";
      void loadHealth();
      return true;
    });
    mutationIntent = command;
    return executeMutation(command);
  }

  async function quarantineIntegration(
    integrationId: string,
    reason: NotificationOperationsQuarantineReason,
    confirmation: string,
  ): Promise<boolean> {
    if (
      typeof integrationId !== "string" ||
      !readable() ||
      !context.permissions.operate
    )
      return false;
    const matches = integrations.value.filter(
      (item) => item.integrationId === integrationId,
    );
    if (matches.length !== 1) return false;
    const currentIntegration = matches[0]!;
    if (
      !Number.isSafeInteger(currentIntegration.version) ||
      currentIntegration.version < 0 ||
      !currentIntegration.maskedIdentity ||
      !canQuarantineNotificationIntegration(
        currentIntegration,
        context.permissions,
      ) ||
      confirmation !== currentIntegration.maskedIdentity
    )
      return false;
    const integration = { ...currentIntegration };
    const command = intent(async (commandOptions) => {
      const updated = await options.api.quarantine(
        integration,
        { reason, confirmation },
        commandOptions,
      );
      if (command.generation !== generation) return false;
      integrations.value = integrations.value.map((item) =>
        item.integrationId === integration.integrationId &&
        item.kind === integration.kind
          ? updated
          : item,
      );
      notice.value = `Интеграция помещена в карантин. Подавлено ожидающих отправок: ${updated.suppressedQueuedCount}.`;
      void Promise.all([loadHealth(), loadDeliveries()]);
      return true;
    });
    mutationIntent = command;
    return executeMutation(command);
  }

  function retryLastMutation(): Promise<boolean> {
    if (!mutationIntent || !retryAvailable.value) return Promise.resolve(false);
    return executeMutation(mutationIntent);
  }

  function loadMoreDeliveries(): Promise<boolean> {
    return loadDeliveries(true);
  }

  function loadMoreIntegrations(): Promise<boolean> {
    return loadIntegrations(true);
  }

  function clearNotice(): void {
    notice.value = "";
  }

  function dispose(): void {
    disposed = true;
    scrub();
    context = EMPTY_CONTEXT;
  }

  return {
    health,
    deliveries,
    integrations,
    filters,
    nextDeliveryCursor,
    nextIntegrationCursor,
    healthLoading,
    deliveriesLoading,
    integrationsLoading,
    mutating,
    error,
    notice,
    retryAvailable,
    setContext,
    refresh,
    loadHealth,
    setFilters,
    loadDeliveries,
    loadIntegrations,
    loadMoreDeliveries,
    loadMoreIntegrations,
    replayDelivery,
    quarantineIntegration,
    retryLastMutation,
    clearNotice,
    dispose,
  };
}

function mergeBy<T>(
  current: T[],
  incoming: T[],
  key: (item: T) => string,
): T[] {
  const values = new Map(current.map((item) => [key(item), item]));
  for (const item of incoming) values.set(key(item), item);
  return [...values.values()];
}
