import { ref } from "vue";
import type {
  SupportWorkspaceAdmissionResponseDto,
  SupportWorkspaceRolloutResponseDto,
  UpdateSupportWorkspaceRolloutDto,
} from "@/shared/api/generated/models";
import { ApiError, normalizeApiError } from "@/shared/api/http/api-error";
import type {
  SupportWorkspaceRolloutCommand,
  SupportWorkspaceRolloutSource,
} from "@/features/support-workspace/api/support-workspace-rollout-source";
import {
  forgetRetainedSupportWorkspaceRolloutAttempt,
  readRetainedSupportWorkspaceRolloutAttempt,
  retainSupportWorkspaceRolloutAttempt,
  supportWorkspaceRolloutAttemptScope,
} from "./support-workspace-rollout-attempts";

export type SupportWorkspaceRolloutPreset =
  | "ENABLE_PILOT"
  | "ROLLBACK_SHELL"
  | "EMERGENCY_HARD_OFF"
  | "CLEAR_HARD_OFF";
export type SupportWorkspaceRolloutRecovery =
  | "UNKNOWN_OUTCOME"
  | "RETRYABLE_FAILURE";

export interface SupportWorkspaceRolloutContext {
  actorId(): string | undefined;
  projectId(): string | undefined;
  effectivePermissionCodes(): readonly string[];
  canManage(): boolean;
  canReadAdmission(): boolean;
  refreshAdmission?(): Promise<SupportWorkspaceAdmissionResponseDto | null>;
  onForbidden?(): void | Promise<void>;
  onUnauthorized?(): void | Promise<void>;
  onMfaRequired?(): void | Promise<void>;
  createIdempotencyKey?(): string;
  recordTelemetry?(
    name:
      | "support_workspace_rollout_read"
      | "support_workspace_rollout_command"
      | "support_workspace_rollout_recovery",
    payload: Record<string, string | number | boolean>,
  ): void;
}

const actionEtagPattern = /^"swr1\.[A-Za-z0-9_-]{43}"$/;
const reasonPattern = /^[\p{L}\p{N}][\p{L}\p{N} .,;:()/_-]{2,499}$/u;

function validRoot(
  value: SupportWorkspaceRolloutResponseDto,
): value is SupportWorkspaceRolloutResponseDto {
  return (
    typeof value.enabled === "boolean" &&
    typeof value.shellEnabled === "boolean" &&
    typeof value.hardOff === "boolean" &&
    Number.isSafeInteger(value.version) &&
    value.version > 0 &&
    actionEtagPattern.test(value.actionEtag)
  );
}

function safeReason(value: string): string | null {
  const reason = value.trim();
  return reasonPattern.test(reason) ? reason : null;
}

function bodyForPreset(
  root: SupportWorkspaceRolloutResponseDto,
  preset: SupportWorkspaceRolloutPreset,
  reason: string,
): UpdateSupportWorkspaceRolloutDto | null {
  if (preset === "ENABLE_PILOT" && (!root.enabled || root.hardOff)) return null;
  const body = {
    enabled: root.enabled,
    shellEnabled:
      preset === "ENABLE_PILOT"
        ? true
        : false,
    hardOff:
      preset === "EMERGENCY_HARD_OFF"
        ? true
        : preset === "CLEAR_HARD_OFF"
          ? false
          : root.hardOff,
    reason,
  };
  if (
    body.enabled === root.enabled &&
    body.shellEnabled === root.shellEnabled &&
    body.hardOff === root.hardOff
  )
    return null;
  return body;
}

/** Owns one Project-scoped rollout root and at most one exact OCC attempt. */
export function createSupportWorkspaceRolloutController(
  context: SupportWorkspaceRolloutContext,
  source: SupportWorkspaceRolloutSource,
) {
  const rollout = ref<SupportWorkspaceRolloutResponseDto | null>(null);
  const admission = ref<SupportWorkspaceAdmissionResponseDto | null>(null);
  const loading = ref(false);
  const mutating = ref(false);
  const error = ref("");
  const success = ref("");
  const recovery = ref<SupportWorkspaceRolloutRecovery | null>(null);
  const conflict = ref(false);
  const quarantined = ref(false);
  const draftReason = ref("");
  let generation = 0;
  let readAbort: AbortController | null = null;
  let mutationAbort: AbortController | null = null;
  let pendingCommand: SupportWorkspaceRolloutCommand | null = null;
  let mutationAttemptScope: string | null = null;
  let terminalAccessFailure = false;

  function scopeKey(): string | null {
    const actorId = context.actorId();
    const projectId = context.projectId();
    if (!actorId || !projectId || !context.canManage()) return null;
    return [
      actorId,
      projectId,
      [...context.effectivePermissionCodes()].sort().join(","),
    ].join("\u0000");
  }

  function current(scope: string, requestGeneration: number): boolean {
    return requestGeneration === generation && scopeKey() === scope;
  }

  function attemptScope(): string | null {
    return supportWorkspaceRolloutAttemptScope(
      context.actorId(),
      context.projectId(),
    );
  }

  function restoreRetainedAttempt(): void {
    const scope = attemptScope();
    const retained = scope
      ? readRetainedSupportWorkspaceRolloutAttempt(scope)
      : null;
    if (!retained) return;
    pendingCommand = retained.command;
    if (retained.state === "QUARANTINED") {
      quarantined.value = true;
      recovery.value = null;
      error.value =
        "Сохранённая команда требует ручной проверки. Новая команда заблокирована.";
      return;
    }
    recovery.value =
      retained.state === "RETRYABLE_FAILURE"
        ? "RETRYABLE_FAILURE"
        : "UNKNOWN_OUTCOME";
    error.value =
      retained.state === "IN_FLIGHT"
        ? "Предыдущая команда была прервана локально. Разрешён только её точный повтор."
        : retained.state === "RETRYABLE_FAILURE"
          ? "Сохранена исходная попытка для повтора. Новая команда не будет создана."
          : "Результат предыдущей команды неизвестен. Разрешён только её точный повтор.";
  }

  function purge(): void {
    rollout.value = null;
    admission.value = null;
    loading.value = false;
    mutating.value = false;
    recovery.value = null;
    conflict.value = false;
    quarantined.value = false;
    pendingCommand = null;
  }

  function reset(): void {
    if (mutationAttemptScope && pendingCommand) {
      retainSupportWorkspaceRolloutAttempt(
        mutationAttemptScope,
        pendingCommand,
        "UNKNOWN_OUTCOME",
      );
    }
    generation += 1;
    readAbort?.abort();
    mutationAbort?.abort();
    readAbort = null;
    mutationAbort = null;
    mutationAttemptScope = null;
    purge();
    error.value = "";
    success.value = "";
    draftReason.value = "";
  }

  async function refreshAdmission(scope: string, requestGeneration: number) {
    if (!context.canReadAdmission() || !context.refreshAdmission) {
      admission.value = null;
      return;
    }
    const value = await context.refreshAdmission();
    if (current(scope, requestGeneration)) admission.value = value;
  }

  async function handleAccessError(cause: ApiError): Promise<boolean> {
    if (cause.status === 403 || cause.status === 404) {
      terminalAccessFailure = true;
      purge();
      error.value = "Управление запуском недоступно для текущего проекта или роли.";
      await context.onForbidden?.();
      return true;
    }
    if (cause.status === 401) {
      terminalAccessFailure = true;
      purge();
      error.value = "Сессия завершена. Войдите снова перед новой командой.";
      await context.onUnauthorized?.();
      return true;
    }
    if (
      cause.status === 428 ||
      cause.code === "MFA_REQUIRED" ||
      cause.code === "MFA_ENROLLMENT_REQUIRED"
    ) {
      terminalAccessFailure = true;
      purge();
      error.value = "Нужна свежая аутентификация. Команда не будет повторена автоматически.";
      await context.onMfaRequired?.();
      return true;
    }
    return false;
  }

  async function readRoot(
    scope: string,
    requestGeneration: number,
    signal?: AbortSignal,
  ): Promise<boolean> {
    const projectId = context.projectId();
    if (!projectId) return false;
    try {
      const value = await source.read(projectId, signal);
      if (!current(scope, requestGeneration)) return false;
      if (!validRoot(value)) {
        purge();
        error.value = "Сервер вернул неподтверждённое состояние запуска.";
        return false;
      }
      rollout.value = value;
      return true;
    } catch (cause) {
      if (!current(scope, requestGeneration)) return false;
      const apiError = normalizeApiError(cause);
      if (apiError.name === "AbortError") return false;
      if (await handleAccessError(apiError)) return false;
      error.value = "Не удалось загрузить подтверждённое состояние запуска. Повторите чтение.";
      return false;
    }
  }

  async function load(): Promise<void> {
    if (mutating.value || recovery.value || quarantined.value) return;
    const startedAt = performance.now();
    readAbort?.abort();
    const scope = scopeKey();
    if (!scope) {
      reset();
      return;
    }
    const requestGeneration = ++generation;
    const abort = new AbortController();
    readAbort = abort;
    loading.value = true;
    error.value = "";
    success.value = "";
    conflict.value = false;
    terminalAccessFailure = false;
    try {
      if (await readRoot(scope, requestGeneration, abort.signal))
        await refreshAdmission(scope, requestGeneration);
    } finally {
      if (current(scope, requestGeneration)) {
        loading.value = false;
        readAbort = null;
        context.recordTelemetry?.("support_workspace_rollout_read", {
          outcome: rollout.value ? "loaded" : "failed",
          duration_ms: Math.round(performance.now() - startedAt),
        });
      }
    }
    if (current(scope, requestGeneration)) restoreRetainedAttempt();
  }

  function validReceipt(
    value: SupportWorkspaceRolloutResponseDto,
    command: SupportWorkspaceRolloutCommand,
  ): boolean {
    return (
      validRoot(value) &&
      value.enabled === command.body.enabled &&
      value.shellEnabled === command.body.shellEnabled &&
      value.hardOff === command.body.hardOff
    );
  }

  async function reconcileAfterReceipt(
    scope: string,
    requestGeneration: number,
    command: SupportWorkspaceRolloutCommand,
    receipt: SupportWorkspaceRolloutResponseDto,
  ): Promise<void> {
    if (!validReceipt(receipt, command)) {
      const retainedScope = attemptScope();
      if (retainedScope)
        retainSupportWorkspaceRolloutAttempt(
          retainedScope,
          command,
          "QUARANTINED",
        );
      quarantined.value = true;
      recovery.value = null;
      error.value = "Сервер не подтвердил точный результат команды.";
      return;
    }
    terminalAccessFailure = false;
    if (!(await readRoot(scope, requestGeneration, mutationAbort?.signal))) {
      const retainedScope = attemptScope();
      if (terminalAccessFailure) {
        if (retainedScope)
          forgetRetainedSupportWorkspaceRolloutAttempt(retainedScope);
        pendingCommand = null;
        return;
      }
      if (retainedScope)
        retainSupportWorkspaceRolloutAttempt(
          retainedScope,
          command,
          "RETRYABLE_FAILURE",
        );
      pendingCommand = command;
      recovery.value = "RETRYABLE_FAILURE";
      error.value =
        "Команда принята, но состояние на сервере не перечитано. Разрешены только повтор той же попытки или сверка.";
      return;
    }
    const authoritative = rollout.value;
    if (
      !authoritative ||
      authoritative.version < receipt.version ||
      (authoritative.version === receipt.version &&
        (authoritative.enabled !== receipt.enabled ||
          authoritative.shellEnabled !== receipt.shellEnabled ||
          authoritative.hardOff !== receipt.hardOff))
    ) {
      pendingCommand = command;
      recovery.value = "RETRYABLE_FAILURE";
      const retainedScope = attemptScope();
      if (retainedScope)
        retainSupportWorkspaceRolloutAttempt(
          retainedScope,
          command,
          "RETRYABLE_FAILURE",
        );
      error.value =
        "Команда принята, но сервер ещё не подтвердил изменение. Повтор использует ту же попытку.";
      return;
    }
    await refreshAdmission(scope, requestGeneration);
    if (!current(scope, requestGeneration)) return;
    pendingCommand = null;
    const retainedScope = attemptScope();
    if (retainedScope)
      forgetRetainedSupportWorkspaceRolloutAttempt(retainedScope);
    recovery.value = null;
    conflict.value = false;
    quarantined.value = false;
    success.value = "Изменение подтверждено и перечитано с сервера.";
  }

  async function handleMutationError(
    cause: unknown,
    scope: string,
    requestGeneration: number,
    command: SupportWorkspaceRolloutCommand,
    retainedScope: string,
  ): Promise<void> {
    const value = normalizeApiError(cause);
    if (
      value.status === 401 ||
      value.status === 403 ||
      value.status === 404 ||
      value.status === 428 ||
      value.code === "MFA_REQUIRED" ||
      value.code === "MFA_ENROLLMENT_REQUIRED"
    ) {
      forgetRetainedSupportWorkspaceRolloutAttempt(retainedScope);
    }
    if (!current(scope, requestGeneration)) return;
    if (await handleAccessError(value)) return;
    if (
      value.code === "SUPPORT_WORKSPACE_VERSION_CONFLICT" ||
      (value.status === 409 && !value.code)
    ) {
      pendingCommand = null;
      forgetRetainedSupportWorkspaceRolloutAttempt(retainedScope);
      recovery.value = null;
      conflict.value = true;
      error.value = "Настройки запуска уже изменились. Состояние обновлено; подтвердите новую команду отдельно.";
      await readRoot(scope, requestGeneration, mutationAbort?.signal);
      return;
    }
    if (
      value.code === "SUPPORT_WORKSPACE_IDEMPOTENCY_KEY_REUSED" ||
      value.code === "SUPPORT_WORKSPACE_REPLAY_OUTCOME_UNAVAILABLE"
    ) {
      retainSupportWorkspaceRolloutAttempt(
        retainedScope,
        command,
        "QUARANTINED",
      );
      pendingCommand = command;
      recovery.value = null;
      quarantined.value = true;
      error.value = "Результат команды требует ручной проверки. Успех не подтверждён.";
      await readRoot(scope, requestGeneration, mutationAbort?.signal);
      return;
    }
    if (value.status === 0) {
      pendingCommand = command;
      recovery.value = "UNKNOWN_OUTCOME";
      retainSupportWorkspaceRolloutAttempt(
        retainedScope,
        command,
        "UNKNOWN_OUTCOME",
      );
      error.value = "Результат команды неизвестен. Разрешён только точный повтор этой попытки.";
      return;
    }
    if (value.status === 503) {
      pendingCommand = command;
      recovery.value = "RETRYABLE_FAILURE";
      retainSupportWorkspaceRolloutAttempt(
        retainedScope,
        command,
        "RETRYABLE_FAILURE",
      );
      error.value = "Аудит или сервис временно недоступен. Повтор использует ту же попытку.";
      return;
    }
    pendingCommand = null;
    forgetRetainedSupportWorkspaceRolloutAttempt(retainedScope);
    recovery.value = null;
    error.value = "Команда отклонена. Проверьте причину и текущее состояние запуска.";
  }

  async function run(command: SupportWorkspaceRolloutCommand): Promise<void> {
    if (mutating.value) return;
    const scope = scopeKey();
    const projectId = context.projectId();
    const retainedScope = attemptScope();
    if (!scope || !projectId || !retainedScope) return;
    const requestGeneration = ++generation;
    mutationAbort?.abort();
    const abort = new AbortController();
    mutationAbort = abort;
    mutationAttemptScope = retainedScope;
    retainSupportWorkspaceRolloutAttempt(retainedScope, command, "IN_FLIGHT");
    mutating.value = true;
    error.value = "";
    success.value = "";
    try {
      const receipt = await source.update(projectId, command, abort.signal);
      if (!current(scope, requestGeneration)) return;
      await reconcileAfterReceipt(scope, requestGeneration, command, receipt);
    } catch (cause) {
      await handleMutationError(
        cause,
        scope,
        requestGeneration,
        command,
        retainedScope,
      );
    } finally {
      if (mutationAbort === abort) {
        mutating.value = false;
        mutationAbort = null;
        mutationAttemptScope = null;
      }
    }
  }

  async function submit(
    preset: SupportWorkspaceRolloutPreset,
    reasonInput: string,
  ): Promise<void> {
    if (mutating.value) {
      context.recordTelemetry?.("support_workspace_rollout_command", {
        operation: preset,
        outcome: "suppressed",
        duration_ms: 0,
        duplicate_prevented: true,
      });
      return;
    }
    if (recovery.value || quarantined.value) return;
    const currentRoot = rollout.value;
    const reason = safeReason(reasonInput);
    draftReason.value = reasonInput;
    if (!currentRoot || !reason) {
      error.value = "Укажите причину: 3–500 разрешённых символов, начиная с буквы или цифры.";
      return;
    }
    const body = bodyForPreset(currentRoot, preset, reason);
    if (!body) {
      error.value =
        preset === "ENABLE_PILOT" && (!currentRoot.enabled || currentRoot.hardOff)
          ? currentRoot.hardOff
            ? "Сначала снимите аварийное отключение отдельным безопасным действием."
            : "Глобальный запуск выключен: пробный запуск нельзя включить на этом экране."
          : "Это действие не меняет текущее состояние запуска.";
      return;
    }
    conflict.value = false;
    const command: SupportWorkspaceRolloutCommand = {
      actionEtag: currentRoot.actionEtag,
      idempotencyKey:
        context.createIdempotencyKey?.() ?? globalThis.crypto.randomUUID(),
      body,
    };
    pendingCommand = command;
    const startedAt = performance.now();
    await run(command);
    context.recordTelemetry?.("support_workspace_rollout_command", {
      operation: preset,
      outcome: success.value
        ? "confirmed"
        : recovery.value ?? (conflict.value ? "conflict" : "failed"),
      duration_ms: Math.round(performance.now() - startedAt),
      duplicate_prevented: false,
    });
  }

  async function retryPending(): Promise<void> {
    if (!pendingCommand || mutating.value) return;
    const startedAt = performance.now();
    await run(pendingCommand);
    context.recordTelemetry?.("support_workspace_rollout_recovery", {
      operation: "EXACT_REPLAY",
      outcome: success.value ? "confirmed" : recovery.value ?? "failed",
      duration_ms: Math.round(performance.now() - startedAt),
      recovered: Boolean(success.value),
    });
  }

  return {
    rollout,
    admission,
    loading,
    mutating,
    error,
    success,
    recovery,
    conflict,
    quarantined,
    draftReason,
    load,
    submit,
    retryPending,
    reset,
  };
}
