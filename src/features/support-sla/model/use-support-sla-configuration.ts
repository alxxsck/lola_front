import { computed, ref } from "vue";
import type {
  ReplaceSupportSlaConfigurationDraftDto,
  SupportSlaConfigurationSettingsResponseDto,
} from "@/shared/api/generated/models";
import { ApiError, normalizeApiError } from "@/shared/api/http/api-error";
import type { SupportSlaConfigurationSource } from "../api/support-sla-configuration-source";
import {
  createEmptySupportSlaConfigurationForm,
  createSupportSlaConfigurationForm,
  serializeSupportSlaConfiguration,
  type SupportSlaConfigurationForm,
  type SupportSlaFormIssue,
} from "./support-sla-configuration-form";

export interface SupportSlaConfigurationContext {
  actorId(): string | undefined;
  projectId(): string | undefined;
  canRead(): boolean;
  canManage(): boolean;
  onForbidden?(): void | Promise<void>;
  createIdempotencyKey?(): string;
}

type SupportSlaCommandKind = "SAVE" | "DISCARD" | "PUBLISH";

interface PendingSupportSlaCommand {
  kind: SupportSlaCommandKind;
  projectId: string;
  actionEtag: string;
  idempotencyKey: string;
  configuration?: ReplaceSupportSlaConfigurationDraftDto;
}

export type SupportSlaRecovery = "UNKNOWN_OUTCOME" | "RETRYABLE_FAILURE";

function publishedConfiguration(
  snapshot: SupportSlaConfigurationSettingsResponseDto,
): ReplaceSupportSlaConfigurationDraftDto | null {
  const calendar = snapshot.publishedConfiguration?.calendarRevision.calendar;
  const policy = snapshot.publishedConfiguration?.policyRevision.policy;
  return calendar && policy ? { calendar, policy } : null;
}

function editableConfiguration(
  snapshot: SupportSlaConfigurationSettingsResponseDto,
  canManage: boolean,
): ReplaceSupportSlaConfigurationDraftDto | null {
  return (
    (canManage ? snapshot.draft?.configuration : null) ??
    publishedConfiguration(snapshot)
  );
}

function formFingerprint(form: SupportSlaConfigurationForm): string {
  return JSON.stringify(form);
}

function sameConfiguration(
  left: ReplaceSupportSlaConfigurationDraftDto | undefined,
  right: ReplaceSupportSlaConfigurationDraftDto | undefined,
): boolean {
  if (!left || !right) return false;
  const canonical = (value: ReplaceSupportSlaConfigurationDraftDto) =>
    serializeSupportSlaConfiguration(
      createSupportSlaConfigurationForm(value),
    ).configuration;
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function conflictMessage(code: string | undefined): string {
  if (code === "SLA_DRAFT_NOT_FOUND")
    return "Черновик уже удалён. Локальные изменения сохранены — сравните их с состоянием сервера.";
  if (code === "SLA_CONFIGURATION_DUPLICATE")
    return "Такая конфигурация уже существует. Состояние перечитано с сервера.";
  if (code === "SLA_CONFIGURATION_NOT_PUBLISHED")
    return "Опубликованной конфигурации больше нет. Локальные изменения сохранены.";
  if (code === "IDEMPOTENCY_KEY_REUSED")
    return "Сервер отклонил повтор с другим содержимым. Новая команда не отправлена.";
  return "SLA-конфигурация изменилась на сервере. Локальная форма сохранена для сравнения.";
}

function validationMessage(code: string | undefined): string {
  const messages: Record<string, string> = {
    SLA_CALENDAR_TIME_ZONE_INVALID: "Сервер не принял часовой пояс календаря.",
    SLA_CALENDAR_COVERAGE_INSUFFICIENT:
      "Рабочий календарь не покрывает минимально допустимый период.",
    SLA_CALENDAR_INTERVAL_OVERLAP: "Рабочие интервалы пересекаются.",
    SLA_POLICY_FALLBACK_REQUIRED: "Добавьте обязательное правило для остальных обращений.",
    SLA_POLICY_FALLBACK_NOT_LAST:
      "Правило для остальных обращений должно быть последним.",
    SLA_POLICY_TARGET_INVALID: "Проверьте сроки реакции и решения.",
  };
  return messages[code ?? ""] ?? "Сервер не принял SLA-конфигурацию. Проверьте поля формы.";
}

/** Owns one Project-scoped SLA Configuration and one exact in-flight mutation. */
export function createSupportSlaConfigurationController(
  context: SupportSlaConfigurationContext,
  source: SupportSlaConfigurationSource,
) {
  const snapshot = ref<SupportSlaConfigurationSettingsResponseDto | null>(null);
  const form = ref<SupportSlaConfigurationForm>(
    createEmptySupportSlaConfigurationForm(),
  );
  const validationIssues = ref<SupportSlaFormIssue[]>([]);
  const loading = ref(false);
  const mutating = ref(false);
  const error = ref("");
  const success = ref("");
  const conflict = ref(false);
  const recovery = ref<SupportSlaRecovery | null>(null);
  let baselineFingerprint = formFingerprint(form.value);
  let generation = 0;
  let readAbort: AbortController | null = null;
  let mutationAbort: AbortController | null = null;
  let pendingCommand: PendingSupportSlaCommand | null = null;

  const dirty = computed(
    () => formFingerprint(form.value) !== baselineFingerprint,
  );
  const hasSavedDraft = computed(() => Boolean(snapshot.value?.draft));
  const canPublish = computed(
    () =>
      context.canManage() &&
      hasSavedDraft.value &&
      !dirty.value &&
      !mutating.value &&
      !recovery.value,
  );

  function scopeKey(): string | null {
    const actorId = context.actorId();
    const projectId = context.projectId();
    if (!actorId || !projectId || !context.canRead()) return null;
    return `${actorId}\u0000${projectId}\u0000${context.canManage() ? "manage" : "read"}`;
  }

  function current(scope: string, requestGeneration: number): boolean {
    return scopeKey() === scope && generation === requestGeneration;
  }

  function hydrateForm(
    value: SupportSlaConfigurationSettingsResponseDto,
  ): void {
    const configuration = editableConfiguration(value, context.canManage());
    form.value = configuration
      ? createSupportSlaConfigurationForm(configuration)
      : createEmptySupportSlaConfigurationForm();
    baselineFingerprint = formFingerprint(form.value);
    validationIssues.value = [];
  }

  function purge(): void {
    snapshot.value = null;
    form.value = createEmptySupportSlaConfigurationForm();
    baselineFingerprint = formFingerprint(form.value);
    validationIssues.value = [];
    loading.value = false;
    mutating.value = false;
    conflict.value = false;
    recovery.value = null;
    pendingCommand = null;
  }

  function reset(): void {
    generation += 1;
    readAbort?.abort();
    mutationAbort?.abort();
    readAbort = null;
    mutationAbort = null;
    purge();
    error.value = "";
    success.value = "";
  }

  async function handleAccessError(cause: ApiError): Promise<boolean> {
    if (cause.status !== 403 && cause.status !== 404) return false;
    purge();
    error.value =
      "Настройка SLA недоступна для текущего проекта или роли.";
    await context.onForbidden?.();
    return true;
  }

  async function readSnapshot(
    scope: string,
    requestGeneration: number,
    options: { preserveForm?: boolean; signal?: AbortSignal } = {},
  ): Promise<SupportSlaConfigurationSettingsResponseDto | null> {
    const projectId = context.projectId();
    if (!projectId) return null;
    try {
      const value = await source.read(projectId, options.signal);
      if (!current(scope, requestGeneration)) return null;
      snapshot.value = value;
      if (!options.preserveForm) hydrateForm(value);
      return value;
    } catch (cause) {
      if (!current(scope, requestGeneration)) return null;
      const apiError = normalizeApiError(cause);
      if (options.signal?.aborted) return null;
      if (await handleAccessError(apiError)) return null;
      error.value = "Не удалось загрузить SLA-конфигурацию. Повторите чтение.";
      return null;
    }
  }

  async function load(): Promise<void> {
    if (mutating.value) return;
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
    try {
      await readSnapshot(scope, requestGeneration, { signal: abort.signal });
    } finally {
      if (current(scope, requestGeneration)) {
        loading.value = false;
        readAbort = null;
      }
    }
  }

  function beginDraft(): void {
    if (!context.canManage() || mutating.value) return;
    const configuration = snapshot.value
      ? publishedConfiguration(snapshot.value)
      : null;
    form.value = configuration
      ? createSupportSlaConfigurationForm(configuration)
      : createEmptySupportSlaConfigurationForm();
    baselineFingerprint = formFingerprint(form.value);
    validationIssues.value = [];
    error.value = "";
    success.value = "";
  }

  function resetLocal(): void {
    const value = snapshot.value;
    if (!value) return;
    hydrateForm(value);
    error.value = "";
    success.value = "Локальные изменения отменены.";
    conflict.value = false;
  }

  function createCommand(
    kind: SupportSlaCommandKind,
    configuration?: ReplaceSupportSlaConfigurationDraftDto,
  ): PendingSupportSlaCommand | null {
    const projectId = context.projectId();
    const actionEtag = snapshot.value?.actionEtag;
    if (!projectId || !actionEtag || !context.canManage()) return null;
    return {
      kind,
      projectId,
      actionEtag,
      idempotencyKey:
        context.createIdempotencyKey?.() ?? globalThis.crypto.randomUUID(),
      ...(configuration ? { configuration } : {}),
    };
  }

  async function reconcileAfterCommand(
    scope: string,
    requestGeneration: number,
    command: PendingSupportSlaCommand,
    successMessage: string,
  ): Promise<boolean> {
    const value = await readSnapshot(scope, requestGeneration, {
      signal: mutationAbort?.signal,
    });
    if (!value) {
      pendingCommand = command;
      recovery.value = "UNKNOWN_OUTCOME";
      error.value =
        "Команда принята, но итоговое состояние не удалось перечитать. Доступен только точный повтор.";
      return false;
    }
    pendingCommand = null;
    recovery.value = null;
    success.value = successMessage;
    return true;
  }

  async function reconcileUnknownSave(
    scope: string,
    requestGeneration: number,
    command: PendingSupportSlaCommand,
  ): Promise<boolean> {
    const value = await readSnapshot(scope, requestGeneration, {
      preserveForm: true,
      signal: mutationAbort?.signal,
    });
    if (
      value &&
      sameConfiguration(value.draft?.configuration, command.configuration)
    ) {
      hydrateForm(value);
      pendingCommand = null;
      recovery.value = null;
      success.value = "Сохранение черновика подтверждено сверкой с сервером.";
      error.value = "";
      return true;
    }
    return false;
  }

  async function handleMutationError(
    cause: unknown,
    scope: string,
    requestGeneration: number,
    command: PendingSupportSlaCommand,
  ): Promise<void> {
    const apiError = normalizeApiError(cause);
    if (mutationAbort?.signal.aborted) return;
    if (await handleAccessError(apiError)) return;
    if (apiError.status === 409) {
      conflict.value = true;
      error.value = conflictMessage(apiError.code);
      await readSnapshot(scope, requestGeneration, {
        preserveForm: true,
        signal: mutationAbort?.signal,
      });
      return;
    }
    if (apiError.status === 400) {
      error.value = validationMessage(apiError.code);
      return;
    }
    if (
      command.kind === "SAVE" &&
      (await reconcileUnknownSave(scope, requestGeneration, command))
    )
      return;
    pendingCommand = command;
    recovery.value = apiError.status === 0 ? "UNKNOWN_OUTCOME" : "RETRYABLE_FAILURE";
    error.value =
      apiError.status === 0
        ? "Результат команды неизвестен. Новая команда заблокирована; можно повторить только исходную попытку."
        : "Команда временно не выполнена. Сохранена исходная попытка для точного повтора.";
  }

  async function execute(
    command: PendingSupportSlaCommand,
    isRetry = false,
  ): Promise<void> {
    const scope = scopeKey();
    if (!scope || mutating.value) return;
    const requestGeneration = generation;
    const abort = new AbortController();
    mutationAbort = abort;
    mutating.value = true;
    error.value = "";
    success.value = "";
    conflict.value = false;
    if (!isRetry) pendingCommand = command;
    try {
      if (command.kind === "SAVE") {
        await source.replaceDraft(
          command.projectId,
          command.configuration!,
          command.actionEtag,
          command.idempotencyKey,
          abort.signal,
        );
        await reconcileAfterCommand(
          scope,
          requestGeneration,
          command,
          "Черновик сохранён и перечитан с сервера.",
        );
      } else if (command.kind === "DISCARD") {
        await source.discardDraft(
          command.projectId,
          command.actionEtag,
          command.idempotencyKey,
          abort.signal,
        );
        await reconcileAfterCommand(
          scope,
          requestGeneration,
          command,
          "Черновик удалён.",
        );
      } else {
        await source.publish(
          command.projectId,
          command.actionEtag,
          command.idempotencyKey,
          abort.signal,
        );
        await reconcileAfterCommand(
          scope,
          requestGeneration,
          command,
          "SLA-конфигурация опубликована. Состояние расчёта не изменено.",
        );
      }
    } catch (cause) {
      if (current(scope, requestGeneration))
        await handleMutationError(cause, scope, requestGeneration, command);
    } finally {
      if (current(scope, requestGeneration)) {
        mutating.value = false;
        mutationAbort = null;
      }
    }
  }

  async function saveDraft(): Promise<void> {
    if (recovery.value || !context.canManage()) return;
    const serialized = serializeSupportSlaConfiguration(form.value);
    validationIssues.value = serialized.issues;
    if (!serialized.configuration) {
      error.value = "Проверьте календарь и правила перед сохранением.";
      return;
    }
    const command = createCommand("SAVE", serialized.configuration);
    if (command) await execute(command);
  }

  async function discardDraft(): Promise<void> {
    if (recovery.value || !snapshot.value?.draft || dirty.value) return;
    const command = createCommand("DISCARD");
    if (command) await execute(command);
  }

  async function publish(): Promise<void> {
    if (!canPublish.value) return;
    const command = createCommand("PUBLISH");
    if (command) await execute(command);
  }

  async function retryPending(): Promise<void> {
    if (!pendingCommand || !recovery.value) return;
    await execute(pendingCommand, true);
  }

  return {
    snapshot,
    form,
    validationIssues,
    loading,
    mutating,
    error,
    success,
    conflict,
    recovery,
    dirty,
    hasSavedDraft,
    canPublish,
    load,
    beginDraft,
    resetLocal,
    saveDraft,
    discardDraft,
    publish,
    retryPending,
    reset,
  };
}
