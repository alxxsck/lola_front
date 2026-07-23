import { computed, ref } from "vue";
import {
  broadcastActionAvailability,
  safeBroadcastError,
  terminalBroadcastLifecycle,
  TELEGRAM_BROADCAST_AUDIENCE_CAP,
  validBroadcastEndUserExternalId,
  validBroadcastTestLabel,
  validateBroadcastDraft,
  type TelegramBroadcast,
  type TelegramBroadcastDraft,
  type TelegramBroadcastLifecycle,
  type TelegramBroadcastPermissions,
  type TelegramBroadcastPreview,
  type TelegramBroadcastSafeError,
} from "./telegram-broadcast";

export interface TelegramBroadcastPage<T> {
  items: T[];
  nextCursor: string | null;
  total: number;
}

export type TelegramBroadcastDeliveryStatus =
  | "PENDING"
  | "SENDING"
  | "RETRY_WAIT"
  | "SENT"
  | "FAILED_PERMANENT"
  | "OUTCOME_UNKNOWN"
  | "SUPPRESSED_LINK"
  | "SUPPRESSED_CONSENT"
  | "SUPPRESSED_INSTALLATION"
  | "CANCELLED";

export interface TelegramBroadcastDelivery {
  id: string;
  status: TelegramBroadcastDeliveryStatus;
  safeFailureCategory:
    | "AMBIGUOUS_PROVIDER_RESULT"
    | "RECIPIENT_UNAVAILABLE"
    | "PAYLOAD_REJECTED"
    | "RATE_LIMIT_EXHAUSTED"
    | "LINK_NOT_ACTIVE"
    | "CONSENT_REVOKED"
    | "INSTALLATION_UNAVAILABLE"
    | "INTERNAL_FAILURE"
    | "CANCELLED"
    | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface TelegramBroadcastTestSend {
  id: string;
  status:
    | "PENDING"
    | "SENDING"
    | "RETRY_WAIT"
    | "SENT"
    | "FAILED_PERMANENT"
    | "OUTCOME_UNKNOWN"
    | "CANCELLED";
  label: string;
  revisionId: string;
  currentRevision: boolean;
  sentAt: string | null;
}

export interface TelegramBroadcastRequestOptions {
  signal: AbortSignal;
  idempotencyKey: string;
}

export interface TelegramBroadcastsApi {
  list(
    projectId: string,
    query: {
      limit: number;
      cursor?: string;
    },
    options: { signal: AbortSignal },
  ): Promise<TelegramBroadcastPage<TelegramBroadcast>>;
  get(
    projectId: string,
    broadcastId: string,
    options: { signal: AbortSignal },
  ): Promise<TelegramBroadcast>;
  create(
    projectId: string,
    draft: TelegramBroadcastDraft,
    options: TelegramBroadcastRequestOptions,
  ): Promise<TelegramBroadcast>;
  updateDraft(
    projectId: string,
    broadcastId: string,
    input: { expectedVersion: number; draft: TelegramBroadcastDraft },
    options: TelegramBroadcastRequestOptions,
  ): Promise<TelegramBroadcast>;
  preview(
    projectId: string,
    broadcastId: string,
    input: { expectedVersion: number },
    options: TelegramBroadcastRequestOptions,
  ): Promise<TelegramBroadcastPreview>;
  testSend(
    projectId: string,
    broadcastId: string,
    input: {
      endUserExternalId: string;
      expectedVersion: number;
      label: string;
    },
    options: TelegramBroadcastRequestOptions,
  ): Promise<TelegramBroadcastTestSend>;
  approve(
    projectId: string,
    broadcastId: string,
    input: {
      expectedVersion: number;
      expectedContentHash: string;
      expectedRecipientCount: number;
      successfulTestId: string;
    },
    options: TelegramBroadcastRequestOptions,
  ): Promise<TelegramBroadcast>;
  start(
    projectId: string,
    broadcastId: string,
    input: { expectedVersion: number },
    options: TelegramBroadcastRequestOptions,
  ): Promise<TelegramBroadcast>;
  schedule(
    projectId: string,
    broadcastId: string,
    input: { expectedVersion: number; scheduledAt: string },
    options: TelegramBroadcastRequestOptions,
  ): Promise<TelegramBroadcast>;
  pause(
    projectId: string,
    broadcastId: string,
    input: { expectedVersion: number },
    options: TelegramBroadcastRequestOptions,
  ): Promise<TelegramBroadcast>;
  resume(
    projectId: string,
    broadcastId: string,
    input: { expectedVersion: number },
    options: TelegramBroadcastRequestOptions,
  ): Promise<TelegramBroadcast>;
  cancel(
    projectId: string,
    broadcastId: string,
    input: { expectedVersion: number },
    options: TelegramBroadcastRequestOptions,
  ): Promise<TelegramBroadcast>;
  listDeliveries(
    projectId: string,
    broadcastId: string,
    query: { limit: number; cursor?: string },
    options: { signal: AbortSignal },
  ): Promise<TelegramBroadcastPage<TelegramBroadcastDelivery>>;
}

export interface TelegramBroadcastsContext {
  visible: boolean;
  projectId: string;
  permissions: TelegramBroadcastPermissions;
}

interface MutationIntent {
  run: (idempotencyKey: string) => Promise<boolean>;
  idempotencyKey: string;
  valid: () => boolean;
}

const EMPTY_PERMISSIONS: TelegramBroadcastPermissions = {
  read: false,
  draft: false,
  approve: false,
  operate: false,
};

const EMPTY_CONTEXT: TelegramBroadcastsContext = {
  visible: false,
  projectId: "",
  permissions: EMPTY_PERMISSIONS,
};

const ACTIVE_POLLING_LIFECYCLES: readonly TelegramBroadcastLifecycle[] = [
  "SCHEDULED",
  "RUNNING",
  "PAUSED",
];
const ACTIVE_TEST_STATUSES: readonly TelegramBroadcastTestSend["status"][] = [
  "PENDING",
  "SENDING",
  "RETRY_WAIT",
];

export function createTelegramBroadcastsController(options: {
  api: TelegramBroadcastsApi;
  idempotencyKey?: () => string;
  pollDelays?: readonly number[];
}) {
  const items = ref<TelegramBroadcast[]>([]);
  const selected = ref<TelegramBroadcast | null>(null);
  const currentPreview = ref<TelegramBroadcastPreview | null>(null);
  const latestTestSend = ref<TelegramBroadcastTestSend | null>(null);
  const deliveries = ref<TelegramBroadcastDelivery[]>([]);
  const nextListCursor = ref<string | null>(null);
  const nextDeliveryCursor = ref<string | null>(null);
  const listTotal = ref(0);
  const deliveryTotal = ref(0);
  const listLoading = ref(false);
  const detailLoading = ref(false);
  const deliveriesLoading = ref(false);
  const mutating = ref(false);
  const polling = ref(false);
  const error = ref<TelegramBroadcastSafeError | null>(null);
  const transportRetryAvailable = ref(false);
  const actionAvailability = computed(() =>
    broadcastActionAvailability(selected.value, context.permissions),
  );

  let context: TelegramBroadcastsContext = EMPTY_CONTEXT;
  let generation = 0;
  let disposed = false;
  let mutationIntent: MutationIntent | null = null;
  let activeMutation: MutationIntent | null = null;
  let projectionEpoch = 0;
  let detailRequestSequence = 0;
  const foregroundDetailRequests = new Set<number>();
  let pollTimer: number | null = null;
  let pollAttempt = 0;
  const controllers = new Set<AbortController>();
  const pollDelays =
    options.pollDelays && options.pollDelays.length
      ? options.pollDelays
      : ([2_000, 5_000, 10_000] as const);

  function readable(snapshot = context): boolean {
    return (
      !disposed &&
      snapshot.visible &&
      Boolean(snapshot.projectId) &&
      snapshot.permissions.read
    );
  }

  function samePermissions(
    left: TelegramBroadcastPermissions,
    right: TelegramBroadcastPermissions,
  ): boolean {
    return (
      left.read === right.read &&
      left.draft === right.draft &&
      left.approve === right.approve &&
      left.operate === right.operate
    );
  }

  function current(
    snapshot: TelegramBroadcastsContext,
    operationGeneration: number,
  ): boolean {
    return (
      operationGeneration === generation &&
      snapshot.projectId === context.projectId &&
      samePermissions(snapshot.permissions, context.permissions) &&
      readable(snapshot) &&
      readable()
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

  function clearPoll(resetAttempt = true): void {
    if (pollTimer !== null) window.clearTimeout(pollTimer);
    pollTimer = null;
    if (resetAttempt) pollAttempt = 0;
    polling.value = false;
  }

  function cancelWork(): void {
    clearPoll();
    for (const controller of controllers) controller.abort();
    controllers.clear();
    foregroundDetailRequests.clear();
    detailLoading.value = false;
  }

  function resetState(): void {
    items.value = [];
    selected.value = null;
    currentPreview.value = null;
    latestTestSend.value = null;
    deliveries.value = [];
    nextListCursor.value = null;
    nextDeliveryCursor.value = null;
    listTotal.value = 0;
    deliveryTotal.value = 0;
    listLoading.value = false;
    detailLoading.value = false;
    deliveriesLoading.value = false;
    mutating.value = false;
    error.value = null;
    mutationIntent = null;
    activeMutation = null;
    transportRetryAvailable.value = false;
  }

  function scrubProtectedState(forbidden: TelegramBroadcastSafeError): void {
    cancelWork();
    items.value = [];
    selected.value = null;
    currentPreview.value = null;
    latestTestSend.value = null;
    deliveries.value = [];
    nextListCursor.value = null;
    nextDeliveryCursor.value = null;
    listTotal.value = 0;
    deliveryTotal.value = 0;
    mutationIntent = null;
    activeMutation = null;
    mutating.value = false;
    transportRetryAvailable.value = false;
    error.value = forbidden;
  }

  function setContext(next: TelegramBroadcastsContext): void {
    const sameAuthority =
      next.projectId === context.projectId &&
      samePermissions(next.permissions, context.permissions);
    if (sameAuthority) {
      if (next.visible === context.visible) return;
      context = { ...context, visible: next.visible };
      if (next.visible) schedulePoll();
      else clearPoll();
      return;
    }
    generation += 1;
    cancelWork();
    context = {
      visible: next.visible,
      projectId: next.projectId,
      permissions: { ...next.permissions },
    };
    resetState();
  }

  function upsert(value: TelegramBroadcast): void {
    const index = items.value.findIndex((item) => item.id === value.id);
    items.value =
      index < 0
        ? [value, ...items.value]
        : items.value.map((item, itemIndex) =>
            itemIndex === index ? value : item,
          );
    if (selected.value?.id === value.id || selected.value === null)
      selected.value = value;
  }

  function canPoll(value: TelegramBroadcast | null): value is TelegramBroadcast {
    return Boolean(
      value &&
        readable() &&
        (ACTIVE_POLLING_LIFECYCLES.includes(value.status) ||
          (latestTestSend.value &&
            ACTIVE_TEST_STATUSES.includes(latestTestSend.value.status))),
    );
  }

  function schedulePoll(): void {
    if (pollTimer !== null) window.clearTimeout(pollTimer);
    pollTimer = null;
    if (!canPoll(selected.value)) return;
    polling.value = true;
    const delay =
      pollDelays[Math.min(pollAttempt, pollDelays.length - 1)] ?? 10_000;
    pollTimer = window.setTimeout(async () => {
      pollTimer = null;
      const id = selected.value?.id;
      if (!id || !canPoll(selected.value)) {
        polling.value = false;
        return;
      }
      pollAttempt += 1;
      await loadDetail(id, { preserveError: true, fromPoll: true });
      if (canPoll(selected.value)) schedulePoll();
      else polling.value = false;
    }, delay);
  }

  async function loadList(input?: { append?: boolean }): Promise<boolean> {
    const snapshot = context;
    const operationGeneration = generation;
    if (!readable(snapshot)) return false;
    const append = Boolean(input?.append);
    if (append && !nextListCursor.value) return false;
    const controller = requestController();
    listLoading.value = true;
    error.value = null;
    try {
      const page = await options.api.list(
        snapshot.projectId,
        {
          limit: 25,
          ...(append && nextListCursor.value
            ? { cursor: nextListCursor.value }
            : {}),
        },
        { signal: controller.signal },
      );
      if (!current(snapshot, operationGeneration)) return false;
      items.value = append ? [...items.value, ...page.items] : page.items;
      nextListCursor.value = page.nextCursor;
      listTotal.value = page.total;
      return true;
    } catch (cause) {
      if (!current(snapshot, operationGeneration)) return false;
      const safeError = safeBroadcastError(cause);
      if (safeError.kind === "FORBIDDEN") scrubProtectedState(safeError);
      else error.value = safeError;
      return false;
    } finally {
      finishController(controller);
      if (current(snapshot, operationGeneration)) listLoading.value = false;
    }
  }

  async function loadDetail(
    broadcastId: string,
    loadOptions: { preserveError?: boolean; fromPoll?: boolean } = {},
  ): Promise<boolean> {
    const snapshot = context;
    const operationGeneration = generation;
    const operationProjectionEpoch = projectionEpoch;
    const requestSequence = ++detailRequestSequence;
    if (!readable(snapshot)) return false;
    const controller = requestController();
    if (!loadOptions.fromPoll) {
      foregroundDetailRequests.add(requestSequence);
      detailLoading.value = true;
    }
    if (!loadOptions.preserveError) error.value = null;
    try {
      const value = await options.api.get(snapshot.projectId, broadcastId, {
        signal: controller.signal,
      });
      if (
        !current(snapshot, operationGeneration) ||
        operationProjectionEpoch !== projectionEpoch ||
        requestSequence !== detailRequestSequence ||
        (selected.value && selected.value.id !== broadcastId)
      )
        return false;
      upsert(value);
      if (value.latestTest) latestTestSend.value = value.latestTest;
      if (terminalBroadcastLifecycle(value.status)) clearPoll();
      return true;
    } catch (cause) {
      if (
        !current(snapshot, operationGeneration) ||
        operationProjectionEpoch !== projectionEpoch ||
        requestSequence !== detailRequestSequence
      )
        return false;
      const safeError = safeBroadcastError(cause);
      if (safeError.kind === "FORBIDDEN") scrubProtectedState(safeError);
      else if (!loadOptions.preserveError) error.value = safeError;
      return false;
    } finally {
      finishController(controller);
      if (!loadOptions.fromPoll) {
        foregroundDetailRequests.delete(requestSequence);
        detailLoading.value = foregroundDetailRequests.size > 0;
      }
    }
  }

  async function open(broadcastId: string): Promise<boolean> {
    generation += 1;
    cancelWork();
    selected.value = null;
    currentPreview.value = null;
    latestTestSend.value = null;
    deliveries.value = [];
    nextDeliveryCursor.value = null;
    deliveryTotal.value = 0;
    mutationIntent = null;
    activeMutation = null;
    transportRetryAvailable.value = false;
    mutating.value = false;
    error.value = null;
    const loaded = await loadDetail(broadcastId);
    if (loaded) schedulePoll();
    return loaded;
  }

  function close(): void {
    generation += 1;
    cancelWork();
    selected.value = null;
    currentPreview.value = null;
    latestTestSend.value = null;
    deliveries.value = [];
    nextDeliveryCursor.value = null;
    deliveryTotal.value = 0;
    detailLoading.value = false;
    deliveriesLoading.value = false;
    error.value = null;
    mutationIntent = null;
    activeMutation = null;
    transportRetryAvailable.value = false;
    mutating.value = false;
  }

  async function executeIntent(intent: MutationIntent): Promise<boolean> {
    if (mutating.value || !readable()) return false;
    projectionEpoch += 1;
    activeMutation = intent;
    mutating.value = true;
    error.value = null;
    transportRetryAvailable.value = false;
    try {
      const succeeded = await intent.run(intent.idempotencyKey);
      if (!intent.valid()) return false;
      if (succeeded && mutationIntent === intent) mutationIntent = null;
      return succeeded;
    } catch (cause) {
      if (!intent.valid()) return false;
      const safeError = safeBroadcastError(cause);
      if (safeError.kind === "FORBIDDEN") {
        scrubProtectedState(safeError);
        return false;
      }
      error.value = safeError;
      if (safeError.kind === "AMBIGUOUS") {
        mutationIntent = intent;
        transportRetryAvailable.value = true;
      } else if (mutationIntent === intent) mutationIntent = null;
      return false;
    } finally {
      if (activeMutation === intent) {
        activeMutation = null;
        mutating.value = false;
      }
    }
  }

  function createIntent(
    run: (idempotencyKey: string) => Promise<boolean>,
  ): MutationIntent {
    const snapshot = context;
    const operationGeneration = generation;
    return {
      run,
      idempotencyKey: options.idempotencyKey?.() ?? crypto.randomUUID(),
      valid: () => current(snapshot, operationGeneration),
    };
  }

  function mutationCurrent(
    snapshot: TelegramBroadcastsContext,
    operationGeneration: number,
    broadcastId?: string,
  ): boolean {
    return (
      current(snapshot, operationGeneration) &&
      (!broadcastId || selected.value?.id === broadcastId)
    );
  }

  async function create(draft: TelegramBroadcastDraft): Promise<boolean> {
    if (
      !readable() ||
      !context.permissions.draft ||
      Object.keys(validateBroadcastDraft(draft)).length
    )
      return false;
    const snapshot = context;
    const operationGeneration = generation;
    const intent = createIntent(async (idempotencyKey) => {
      const controller = requestController();
      try {
        const value = await options.api.create(snapshot.projectId, draft, {
          idempotencyKey,
          signal: controller.signal,
        });
        if (!current(snapshot, operationGeneration)) return false;
        upsert(value);
        return true;
      } finally {
        finishController(controller);
      }
    });
    mutationIntent = intent;
    return executeIntent(intent);
  }

  async function saveDraft(draft: TelegramBroadcastDraft): Promise<boolean> {
    const value = selected.value;
    if (
      !value ||
      !actionAvailability.value.edit ||
      Object.keys(validateBroadcastDraft(draft)).length
    )
      return false;
    const snapshot = context;
    const operationGeneration = generation;
    const broadcastId = value.id;
    const expectedVersion = value.version;
    const intent = createIntent(async (idempotencyKey) => {
      const controller = requestController();
      try {
        const updated = await options.api.updateDraft(
          snapshot.projectId,
          broadcastId,
          { expectedVersion, draft },
          { idempotencyKey, signal: controller.signal },
        );
        if (!mutationCurrent(snapshot, operationGeneration, broadcastId))
          return false;
        upsert(updated);
        currentPreview.value = null;
        latestTestSend.value = null;
        return true;
      } finally {
        finishController(controller);
      }
    });
    mutationIntent = intent;
    return executeIntent(intent);
  }

  async function generatePreview(): Promise<boolean> {
    const value = selected.value;
    if (!value || !actionAvailability.value.preview) return false;
    const snapshot = context;
    const operationGeneration = generation;
    const broadcastId = value.id;
    const expectedVersion = value.version;
    const intent = createIntent(async (idempotencyKey) => {
      const controller = requestController();
      try {
        const generated = await options.api.preview(
          snapshot.projectId,
          broadcastId,
          { expectedVersion },
          { idempotencyKey, signal: controller.signal },
        );
        if (!mutationCurrent(snapshot, operationGeneration, broadcastId))
          return false;
        currentPreview.value = generated;
        latestTestSend.value = null;
        return true;
      } finally {
        finishController(controller);
      }
    });
    mutationIntent = intent;
    return executeIntent(intent);
  }

  async function testSend(
    endUserExternalId: string,
    label: string,
  ): Promise<boolean> {
    const value = selected.value;
    const generated = currentPreview.value;
    if (
      !value ||
      !generated ||
      !validBroadcastEndUserExternalId(endUserExternalId) ||
      !validBroadcastTestLabel(label) ||
      generated.version !== value.version ||
      generated.revisionId !== value.revision.id ||
      !actionAvailability.value.testSend
    )
      return false;
    const snapshot = context;
    const operationGeneration = generation;
    const broadcastId = value.id;
    const expectedVersion = value.version;
    const intent = createIntent(async (idempotencyKey) => {
      const controller = requestController();
      try {
        const sent = await options.api.testSend(
          snapshot.projectId,
          broadcastId,
          {
            endUserExternalId: endUserExternalId.trim(),
            expectedVersion,
            label: label.trim(),
          },
          { idempotencyKey, signal: controller.signal },
        );
        if (!mutationCurrent(snapshot, operationGeneration, broadcastId))
          return false;
        latestTestSend.value = sent;
        if (ACTIVE_TEST_STATUSES.includes(sent.status)) {
          pollAttempt = 0;
          schedulePoll();
        } else {
          await loadDetail(broadcastId, { preserveError: true });
        }
        return true;
      } finally {
        finishController(controller);
      }
    });
    mutationIntent = intent;
    return executeIntent(intent);
  }

  async function approve(): Promise<boolean> {
    const value = selected.value;
    const generated = currentPreview.value;
    const successfulTest = latestTestSend.value;
    if (
      !value ||
      !generated ||
      !successfulTest ||
      successfulTest.status !== "SENT" ||
      !successfulTest.currentRevision ||
      successfulTest.revisionId !== value.revision.id ||
      generated.version !== value.version ||
      generated.revisionId !== value.revision.id ||
      generated.eligibleRecipientCount > TELEGRAM_BROADCAST_AUDIENCE_CAP ||
      !actionAvailability.value.approve
    )
      return false;
    return recordCommand(
      "approve",
      value,
      (idempotencyKey, signal) =>
        options.api.approve(
          context.projectId,
          value.id,
          {
            expectedVersion: value.version,
            expectedContentHash: generated.contentHash,
            expectedRecipientCount: generated.eligibleRecipientCount,
            successfulTestId: successfulTest.id,
          },
          { idempotencyKey, signal },
        ),
    );
  }

  async function recordCommand(
    permission:
      | "approve"
      | "start"
      | "schedule"
      | "pause"
      | "resume"
      | "cancel",
    value: TelegramBroadcast,
    request: (
      idempotencyKey: string,
      signal: AbortSignal,
    ) => Promise<TelegramBroadcast>,
  ): Promise<boolean> {
    if (!actionAvailability.value[permission]) return false;
    const snapshot = context;
    const operationGeneration = generation;
    const broadcastId = value.id;
    const intent = createIntent(async (idempotencyKey) => {
      const controller = requestController();
      try {
        const updated = await request(idempotencyKey, controller.signal);
        if (!mutationCurrent(snapshot, operationGeneration, broadcastId))
          return false;
        upsert(updated);
        if (updated.status !== "DRAFT") currentPreview.value = null;
        pollAttempt = 0;
        schedulePoll();
        return true;
      } catch (cause) {
        const safeError = safeBroadcastError(cause);
        if (
          safeError.kind === "CONFLICT" &&
          mutationCurrent(snapshot, operationGeneration, broadcastId)
        ) {
          error.value = safeError;
          await loadDetail(broadcastId, { preserveError: true });
        }
        throw cause;
      } finally {
        finishController(controller);
      }
    });
    mutationIntent = intent;
    return executeIntent(intent);
  }

  async function start(): Promise<boolean> {
    const value = selected.value;
    if (!value) return false;
    const projectId = context.projectId;
    return recordCommand("start", value, (idempotencyKey, signal) =>
      options.api.start(
        projectId,
        value.id,
        { expectedVersion: value.version },
        { idempotencyKey, signal },
      ),
    );
  }

  async function schedule(scheduledAt: string): Promise<boolean> {
    const value = selected.value;
    if (!value || !scheduledAt) return false;
    const projectId = context.projectId;
    return recordCommand("schedule", value, (idempotencyKey, signal) =>
      options.api.schedule(
        projectId,
        value.id,
        { expectedVersion: value.version, scheduledAt },
        { idempotencyKey, signal },
      ),
    );
  }

  async function pause(): Promise<boolean> {
    const value = selected.value;
    if (!value) return false;
    const projectId = context.projectId;
    return recordCommand("pause", value, (idempotencyKey, signal) =>
      options.api.pause(
        projectId,
        value.id,
        { expectedVersion: value.version },
        { idempotencyKey, signal },
      ),
    );
  }

  async function resume(): Promise<boolean> {
    const value = selected.value;
    if (!value) return false;
    const projectId = context.projectId;
    return recordCommand("resume", value, (idempotencyKey, signal) =>
      options.api.resume(
        projectId,
        value.id,
        { expectedVersion: value.version },
        { idempotencyKey, signal },
      ),
    );
  }

  async function cancel(): Promise<boolean> {
    const value = selected.value;
    if (!value) return false;
    const projectId = context.projectId;
    return recordCommand("cancel", value, (idempotencyKey, signal) =>
      options.api.cancel(
        projectId,
        value.id,
        { expectedVersion: value.version },
        { idempotencyKey, signal },
      ),
    );
  }

  async function loadDeliveries(append = false): Promise<boolean> {
    const value = selected.value;
    const snapshot = context;
    const operationGeneration = generation;
    if (!value || !readable(snapshot)) return false;
    if (append && !nextDeliveryCursor.value) return false;
    const controller = requestController();
    deliveriesLoading.value = true;
    try {
      const page = await options.api.listDeliveries(
        snapshot.projectId,
        value.id,
        {
          limit: 50,
          ...(append && nextDeliveryCursor.value
            ? { cursor: nextDeliveryCursor.value }
            : {}),
        },
        { signal: controller.signal },
      );
      if (!mutationCurrent(snapshot, operationGeneration, value.id))
        return false;
      deliveries.value = append
        ? [...deliveries.value, ...page.items]
        : page.items;
      nextDeliveryCursor.value = page.nextCursor;
      deliveryTotal.value = page.total;
      return true;
    } catch (cause) {
      if (mutationCurrent(snapshot, operationGeneration, value.id)) {
        const safeError = safeBroadcastError(cause);
        if (safeError.kind === "FORBIDDEN") scrubProtectedState(safeError);
        else error.value = safeError;
      }
      return false;
    } finally {
      finishController(controller);
      if (current(snapshot, operationGeneration))
        deliveriesLoading.value = false;
    }
  }

  async function retryLastMutation(): Promise<boolean> {
    if (!mutationIntent || !transportRetryAvailable.value) return false;
    return executeIntent(mutationIntent);
  }

  async function refresh(): Promise<boolean> {
    const broadcastId = selected.value?.id;
    if (!broadcastId) return false;
    const loaded = await loadDetail(broadcastId);
    if (loaded) schedulePoll();
    return loaded;
  }

  function dispose(): void {
    disposed = true;
    generation += 1;
    cancelWork();
    resetState();
    context = EMPTY_CONTEXT;
  }

  return {
    items,
    selected,
    currentPreview,
    latestTestSend,
    deliveries,
    nextListCursor,
    nextDeliveryCursor,
    listTotal,
    deliveryTotal,
    listLoading,
    detailLoading,
    deliveriesLoading,
    mutating,
    polling,
    error,
    transportRetryAvailable,
    actionAvailability,
    setContext,
    loadList,
    open,
    close,
    create,
    saveDraft,
    generatePreview,
    testSend,
    approve,
    start,
    schedule,
    pause,
    resume,
    cancel,
    loadDeliveries,
    retryLastMutation,
    refresh,
    dispose,
  };
}
