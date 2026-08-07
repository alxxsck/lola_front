import { computed, ref } from "vue";
import { ApiError } from "@/shared/api/http/api-error";
import { SUPPORT_AVAILABILITY_SELF_REASONS } from "@/features/support-availability/api/support-availability-source";
import type {
  SetOwnAvailabilityCommand,
  SupportAvailabilitySnapshot,
  SupportAvailabilitySource,
  SupportAvailabilityReasonCode,
  SupportAvailabilityState,
} from "@/features/support-availability/api/support-availability-source";

export interface SupportAvailabilityContext {
  projectId(): string | undefined;
  operatorId(): string | undefined;
  canRead(): boolean;
  canManage(): boolean;
  onForbidden?(): void | Promise<void>;
  createIdempotencyKey?(): string;
}

export interface ChangeOwnAvailabilityInput {
  state: SupportAvailabilityState;
  reasonCode: SupportAvailabilityReasonCode;
  reasonNote?: string;
  hardDurationSeconds?: number;
}

const SUPPORT_AVAILABILITY_HEARTBEAT_INTERVAL_MS = 45_000;

/** Owns the authoritative self-availability snapshot and one idempotent intent. */
export function createSupportAvailabilityController(
  context: SupportAvailabilityContext,
  source: SupportAvailabilitySource,
) {
  const availability = ref<SupportAvailabilitySnapshot | null>(null);
  const loading = ref(false);
  const changing = ref(false);
  const error = ref("");
  const unknownOutcome = ref(false);
  const needsReconcile = ref(false);
  const draft = ref<ChangeOwnAvailabilityInput | null>(null);
  const conflictVersion = ref<number | null>(null);
  const canRetryAfterReconcile = computed(
    () =>
      needsReconcile.value &&
      availability.value !== null &&
      conflictVersion.value !== null &&
      availability.value.version !== conflictVersion.value,
  );
  let readGeneration = 0;
  let mutationGeneration = 0;
  let readAbort: AbortController | null = null;
  let mutationAbort: AbortController | null = null;
  let heartbeatAbort: AbortController | null = null;
  let heartbeatGeneration = 0;
  let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeatEnabled = false;
  let heartbeatRunning = false;
  let pendingCommand: SetOwnAvailabilityCommand | null = null;

  function clearHeartbeatTimer(): void {
    if (heartbeatTimer !== null) clearTimeout(heartbeatTimer);
    heartbeatTimer = null;
  }

  function canHeartbeat(): boolean {
    return (
      context.canManage() &&
      availability.value !== null &&
      availability.value.effectiveState !== "OFFLINE"
    );
  }

  function scheduleHeartbeat(): void {
    clearHeartbeatTimer();
    if (!heartbeatEnabled || !canHeartbeat()) return;
    heartbeatTimer = setTimeout(() => {
      void renewOwnLease();
    }, SUPPORT_AVAILABILITY_HEARTBEAT_INTERVAL_MS);
  }

  function stopHeartbeat(): void {
    heartbeatEnabled = false;
    heartbeatGeneration += 1;
    heartbeatAbort?.abort();
    heartbeatAbort = null;
    heartbeatRunning = false;
    clearHeartbeatTimer();
  }

  function reset(): void {
    readGeneration += 1;
    mutationGeneration += 1;
    readAbort?.abort();
    mutationAbort?.abort();
    stopHeartbeat();
    readAbort = null;
    mutationAbort = null;
    availability.value = null;
    loading.value = false;
    changing.value = false;
    error.value = "";
    unknownOutcome.value = false;
    needsReconcile.value = false;
    draft.value = null;
    conflictVersion.value = null;
    pendingCommand = null;
  }

  function isCurrentRead(
    projectId: string,
    operatorId: string,
    requestGeneration: number,
  ): boolean {
    return (
      requestGeneration === readGeneration &&
      context.canRead() &&
      context.projectId() === projectId &&
      context.operatorId() === operatorId
    );
  }

  function isCurrentMutation(
    projectId: string,
    operatorId: string,
    requestGeneration: number,
  ): boolean {
    return (
      requestGeneration === mutationGeneration &&
      context.canManage() &&
      context.projectId() === projectId &&
      context.operatorId() === operatorId
    );
  }

  function isExpectedTarget(
    result: SupportAvailabilitySnapshot,
    projectId: string,
    operatorId: string,
  ): boolean {
    return result.projectId === projectId && result.operatorId === operatorId;
  }

  function isAccessLost(cause: unknown): boolean {
    return (
      cause instanceof ApiError &&
      (cause.status === 403 || cause.status === 404)
    );
  }

  async function load(): Promise<void> {
    const projectId = context.projectId();
    const operatorId = context.operatorId();
    readAbort?.abort();
    const requestGeneration = ++readGeneration;
    const abort = new AbortController();
    readAbort = abort;
    error.value = "";
    if (!projectId || !operatorId || !context.canRead()) {
      loading.value = false;
      readAbort = null;
      return;
    }

    loading.value = true;
    try {
      const result = await source.read(projectId, operatorId, abort.signal);
      if (!isCurrentRead(projectId, operatorId, requestGeneration)) return;
      if (!isExpectedTarget(result, projectId, operatorId)) {
        error.value = "Статус доступности вернул данные другого сотрудника";
        return;
      }
      availability.value = result;
      scheduleHeartbeat();
    } catch (cause) {
      if (!isCurrentRead(projectId, operatorId, requestGeneration)) return;
      if (isAccessLost(cause)) {
        reset();
        await context.onForbidden?.();
        return;
      }
      error.value = "Не удалось загрузить статус доступности";
    } finally {
      if (requestGeneration === readGeneration) {
        loading.value = false;
        readAbort = null;
      }
    }
  }

  function createCommand(
    input: ChangeOwnAvailabilityInput,
  ): SetOwnAvailabilityCommand | null {
    const snapshot = availability.value;
    if (!snapshot) return null;
    return {
      state: input.state,
      reasonCode: input.reasonCode,
      ...(input.reasonNote?.trim()
        ? { reasonNote: input.reasonNote.trim() }
        : {}),
      ...(input.hardDurationSeconds
        ? { hardDurationSeconds: input.hardDurationSeconds }
        : {}),
      expectedVersion: snapshot.version,
      idempotencyKey:
        context.createIdempotencyKey?.() ?? globalThis.crypto.randomUUID(),
    };
  }

  function isValidSelfTransition(input: ChangeOwnAvailabilityInput): boolean {
    if (
      !SUPPORT_AVAILABILITY_SELF_REASONS[input.state].includes(input.reasonCode)
    )
      return false;
    if (input.state !== "AWAY") return input.hardDurationSeconds === undefined;
    const duration = input.hardDurationSeconds;
    return (
      Number.isInteger(duration) &&
      duration !== undefined &&
      duration >= 60 &&
      duration <= 28_800
    );
  }

  async function submit(command: SetOwnAvailabilityCommand): Promise<void> {
    const projectId = context.projectId();
    const operatorId = context.operatorId();
    if (!projectId || !operatorId || !context.canManage()) return;
    mutationAbort?.abort();
    const requestGeneration = ++mutationGeneration;
    const abort = new AbortController();
    mutationAbort = abort;
    changing.value = true;
    error.value = "";
    try {
      const result = await source.setOwn(
        projectId,
        operatorId,
        command,
        abort.signal,
      );
      if (!isCurrentMutation(projectId, operatorId, requestGeneration)) return;
      if (!isExpectedTarget(result, projectId, operatorId)) {
        error.value = "Статус доступности вернул данные другого сотрудника";
        return;
      }
      availability.value = result;
      scheduleHeartbeat();
      pendingCommand = null;
      unknownOutcome.value = false;
      needsReconcile.value = false;
      draft.value = null;
      conflictVersion.value = null;
    } catch (cause) {
      if (!isCurrentMutation(projectId, operatorId, requestGeneration)) return;
      if (isAccessLost(cause)) {
        reset();
        await context.onForbidden?.();
        return;
      }
      if (cause instanceof ApiError && cause.status === 409) {
        pendingCommand = null;
        unknownOutcome.value = false;
        needsReconcile.value = true;
        conflictVersion.value = availability.value?.version ?? null;
        error.value =
          "Статус уже изменён в другом окне. Обновите данные и повторите сохранение.";
        return;
      }
      if (
        cause instanceof ApiError &&
        (cause.status === 400 || cause.status === 422)
      ) {
        pendingCommand = null;
        unknownOutcome.value = false;
        needsReconcile.value = false;
        conflictVersion.value = null;
        error.value =
          "Проверьте статус, причину и длительность перед повторной отправкой.";
        return;
      }
      pendingCommand = command;
      unknownOutcome.value = true;
      error.value =
        "Не удалось подтвердить изменение статуса. Попробуйте сохранить ещё раз — дублирования не будет.";
    } finally {
      if (requestGeneration === mutationGeneration) {
        changing.value = false;
        mutationAbort = null;
      }
    }
  }

  async function change(input: ChangeOwnAvailabilityInput): Promise<void> {
    if (changing.value || unknownOutcome.value || !context.canManage()) return;
    draft.value = {
      state: input.state,
      reasonCode: input.reasonCode,
      ...(input.reasonNote?.trim()
        ? { reasonNote: input.reasonNote.trim() }
        : {}),
      ...(input.hardDurationSeconds
        ? { hardDurationSeconds: input.hardDurationSeconds }
        : {}),
    };
    needsReconcile.value = false;
    conflictVersion.value = null;
    if (!isValidSelfTransition(draft.value)) {
      error.value =
        "Проверьте статус, причину и длительность перед повторной отправкой.";
      return;
    }
    const command = createCommand(draft.value);
    if (command) await submit(command);
  }

  async function retryUnknownOutcome(): Promise<void> {
    if (!pendingCommand || changing.value || !unknownOutcome.value) return;
    await submit(pendingCommand);
  }

  async function retryAfterReconcile(): Promise<void> {
    if (
      !draft.value ||
      changing.value ||
      unknownOutcome.value ||
      !canRetryAfterReconcile.value
    )
      return;
    const command = createCommand(draft.value);
    if (!command) return;
    needsReconcile.value = false;
    await submit(command);
  }

  async function renewOwnLease(): Promise<void> {
    clearHeartbeatTimer();
    const snapshot = availability.value;
    const projectId = context.projectId();
    const operatorId = context.operatorId();
    if (
      heartbeatRunning ||
      !heartbeatEnabled ||
      !snapshot ||
      !projectId ||
      !operatorId ||
      !canHeartbeat()
    )
      return;

    heartbeatRunning = true;
    const requestGeneration = ++heartbeatGeneration;
    const abort = new AbortController();
    heartbeatAbort = abort;
    try {
      const result = await source.renewOwn(
        projectId,
        operatorId,
        snapshot.version,
        abort.signal,
      );
      if (
        requestGeneration !== heartbeatGeneration ||
        context.projectId() !== projectId ||
        context.operatorId() !== operatorId ||
        !context.canManage()
      )
        return;
      if (!isExpectedTarget(result, projectId, operatorId)) {
        error.value = "Статус доступности вернул данные другого сотрудника";
        return;
      }
      availability.value = result;
      if (error.value === "Не удалось продлить статус доступности") error.value = "";
    } catch (cause) {
      if (requestGeneration !== heartbeatGeneration) return;
      if (isAccessLost(cause)) {
        reset();
        await context.onForbidden?.();
        return;
      }
      if (cause instanceof ApiError && cause.status === 409) {
        await load();
        return;
      }
      error.value = "Не удалось продлить статус доступности";
    } finally {
      if (requestGeneration === heartbeatGeneration) {
        heartbeatRunning = false;
        heartbeatAbort = null;
        scheduleHeartbeat();
      }
    }
  }

  function startHeartbeat(): void {
    heartbeatEnabled = true;
    clearHeartbeatTimer();
    if (canHeartbeat()) void renewOwnLease();
  }

  return {
    availability,
    loading,
    changing,
    error,
    unknownOutcome,
    needsReconcile,
    draft,
    canRetryAfterReconcile,
    load,
    change,
    retryUnknownOutcome,
    retryAfterReconcile,
    renewOwnLease,
    startHeartbeat,
    stopHeartbeat,
    reset,
  };
}
