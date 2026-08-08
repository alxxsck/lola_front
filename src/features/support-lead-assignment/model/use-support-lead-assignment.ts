import { computed, ref } from "vue";
import type {
  AssignSupportCaseAssignmentDtoReasonCode,
  ForceAssignSupportCaseAssignmentDtoReasonCode,
  ForceTransferSupportCaseAssignmentDtoReasonCode,
  ReleaseSupportCaseAssignmentDtoReasonCode,
  TransferSupportCaseAssignmentDtoReasonCode,
} from "@/shared/api/generated/models";
import { ApiError } from "@/shared/api/http/api-error";
import {
  SupportLeadAssignmentIntegrityError,
  type SupportLeadAssignmentIntent,
  type SupportLeadAssignmentReceipt,
  type SupportLeadAssignmentSource,
} from "@/features/support-lead-assignment/api/support-lead-assignment-source";

interface LeadTargetDraft {
  teamId: string;
  operatorId: string;
  reasonNote?: string;
}

export type SupportLeadAssignmentDraft =
  | (LeadTargetDraft & {
      kind: "ASSIGN";
      reasonCode: AssignSupportCaseAssignmentDtoReasonCode;
    })
  | (LeadTargetDraft & {
      kind: "TRANSFER";
      reasonCode: TransferSupportCaseAssignmentDtoReasonCode;
    })
  | (LeadTargetDraft & {
      kind: "FORCE_ASSIGN";
      reasonCode: ForceAssignSupportCaseAssignmentDtoReasonCode;
      reasonNote: string;
    })
  | (LeadTargetDraft & {
      kind: "FORCE_TRANSFER";
      reasonCode: ForceTransferSupportCaseAssignmentDtoReasonCode;
      reasonNote: string;
    })
  | {
      kind: "RELEASE";
      reasonCode: ReleaseSupportCaseAssignmentDtoReasonCode;
      reasonNote?: string;
    };

interface CapturedLeadAction {
  projectId: string;
  caseId: string;
  intent: SupportLeadAssignmentIntent;
  idempotencyKey: string;
}

export interface SupportLeadAssignmentContext {
  projectId(): string | undefined;
  canOverride(): boolean;
  canForce(): boolean;
  canReadAudit?(): boolean;
  onForbidden?(): void | Promise<void>;
  onChanged?(caseId: string): void | Promise<void>;
  createIdempotencyKey?(): string;
}

export function createSupportLeadAssignmentController(
  source: SupportLeadAssignmentSource,
  context: SupportLeadAssignmentContext,
) {
  const caseId = ref<string | null>(null);
  const snapshot = ref<Awaited<ReturnType<typeof source.readCase>> | null>(null);
  const loading = ref(false);
  const mutating = ref(false);
  const reconciling = ref(false);
  const error = ref("");
  const success = ref("");
  const draft = ref<SupportLeadAssignmentDraft | null>(null);
  const unknownOutcome = ref(false);
  const pendingAction = ref<CapturedLeadAction | null>(null);
  let generation = 0;
  let mutationGeneration = 0;
  let readAbort: AbortController | null = null;
  let mutationAbort: AbortController | null = null;
  const auditFacts = ref<Awaited<ReturnType<typeof source.readAudit>>>([]);
  const auditLoading = ref(false);
  const auditError = ref("");
  let auditAbort: AbortController | null = null;

  const hasAuthority = computed(
    () => Boolean(context.projectId()) && context.canOverride(),
  );

  function scopeIsCurrent(projectId: string, selectedCaseId: string): boolean {
    return (
      context.projectId() === projectId &&
      caseId.value === selectedCaseId &&
      context.canOverride()
    );
  }

  async function load(selectedCaseId = caseId.value): Promise<void> {
    const projectId = context.projectId();
    readAbort?.abort();
    const requestGeneration = ++generation;
    error.value = "";
    if (!projectId || !selectedCaseId || !context.canOverride()) {
      snapshot.value = null;
      loading.value = false;
      return;
    }
    const controller = new AbortController();
    readAbort = controller;
    loading.value = true;
    try {
      const value = await source.readCase(
        projectId,
        selectedCaseId,
        controller.signal,
      );
      if (
        requestGeneration === generation &&
        scopeIsCurrent(projectId, selectedCaseId)
      )
        snapshot.value = value;
    } catch (cause) {
      if (requestGeneration !== generation) return;
      snapshot.value = null;
      if (
        cause instanceof ApiError &&
        (cause.status === 403 || cause.status === 404)
      ) {
        reset();
        await context.onForbidden?.();
        return;
      }
      error.value = "Не удалось загрузить доступные назначения";
    } finally {
      if (requestGeneration === generation) {
        loading.value = false;
        readAbort = null;
      }
    }
  }

  async function open(selectedCaseId: string): Promise<void> {
    if (caseId.value !== selectedCaseId) {
      reset();
      caseId.value = selectedCaseId;
    }
    await Promise.all([load(selectedCaseId), loadAudit(selectedCaseId)]);
  }

  async function loadAudit(selectedCaseId = caseId.value): Promise<void> {
    const projectId = context.projectId();
    auditAbort?.abort();
    auditFacts.value = [];
    auditError.value = "";
    if (
      !projectId ||
      !selectedCaseId ||
      !context.canReadAudit?.() ||
      !context.canOverride()
    )
      return;
    const controller = new AbortController();
    auditAbort = controller;
    auditLoading.value = true;
    try {
      const facts = await source.readAudit(
        projectId,
        selectedCaseId,
        controller.signal,
      );
      if (scopeIsCurrent(projectId, selectedCaseId)) auditFacts.value = facts;
    } catch (cause) {
      if (!scopeIsCurrent(projectId, selectedCaseId)) return;
      if (
        cause instanceof ApiError &&
        (cause.status === 403 || cause.status === 404)
      )
        return;
      auditError.value = "История назначения временно недоступна";
    } finally {
      auditLoading.value = false;
      auditAbort = null;
    }
  }

  function setDraft(value: SupportLeadAssignmentDraft | null): void {
    if (mutating.value || unknownOutcome.value) return;
    draft.value = value;
    error.value = "";
    success.value = "";
  }

  function captureAction(): CapturedLeadAction | null {
    const projectId = context.projectId();
    const value = draft.value;
    const current = snapshot.value;
    if (!projectId || !caseId.value || !value || !current || !context.canOverride())
      return null;
    let intent: SupportLeadAssignmentIntent;
    if (value.kind === "RELEASE") {
      if (!current.actions.release || !current.currentAssignment) return null;
      intent = {
        kind: "RELEASE",
        snapshot: current,
        reasonCode: value.reasonCode,
        ...(value.reasonNote?.trim()
          ? { reasonNote: value.reasonNote.trim() }
          : {}),
      };
    } else {
      const team = current.teams.find((item) => item.id === value.teamId);
      const operator = team?.operators.find(
        (item) => item.id === value.operatorId,
      );
      if (!team || !operator) return null;
      const actionName =
        value.kind === "ASSIGN"
          ? "assign"
          : value.kind === "TRANSFER"
            ? "transfer"
            : value.kind === "FORCE_ASSIGN"
              ? "assignWithOverride"
              : "transferWithOverride";
      if (!current.actions[actionName] || !team.actions[actionName] || !operator.actions[actionName])
        return null;
      if (value.kind === "ASSIGN" || value.kind === "TRANSFER") {
        intent = {
          kind: value.kind,
          snapshot: current,
          teamId: team.id,
          operatorId: operator.id,
          reasonCode: value.reasonCode,
          ...(value.reasonNote?.trim()
            ? { reasonNote: value.reasonNote.trim() }
            : {}),
        } as SupportLeadAssignmentIntent;
      } else {
        if (!context.canForce() || !value.reasonNote.trim()) return null;
        const required = new Set(operator.requiredOverrides);
        const bypassAvailability = required.has("AVAILABILITY");
        const bypassCapacity = required.has("CAPACITY");
        if (
          !bypassAvailability &&
          !bypassCapacity &&
          !required.has("RESERVATION")
        )
          return null;
        intent = {
          kind: value.kind,
          snapshot: current,
          teamId: team.id,
          operatorId: operator.id,
          bypassAvailability,
          bypassCapacity,
          reasonCode: value.reasonCode,
          reasonNote: value.reasonNote.trim(),
        } as SupportLeadAssignmentIntent;
      }
    }
    return {
      projectId,
      caseId: caseId.value,
      intent,
      idempotencyKey:
        context.createIdempotencyKey?.() ?? globalThis.crypto.randomUUID(),
    };
  }

  function actionScopeIsCurrent(action: CapturedLeadAction): boolean {
    return scopeIsCurrent(action.projectId, action.caseId);
  }

  async function applyKnownReceipt(
    action: CapturedLeadAction,
    receipt: SupportLeadAssignmentReceipt,
  ): Promise<void> {
    if (
      receipt.caseId !== action.caseId ||
      !actionScopeIsCurrent(action)
    )
      return;
    pendingAction.value = null;
    unknownOutcome.value = false;
    draft.value = null;
    success.value = "Назначение обновлено";
    try {
      await context.onChanged?.(action.caseId);
      await loadAudit(action.caseId);
    } catch {
      error.value =
        "Назначение выполнено, но рабочее место не обновилось. Обновите данные.";
    }
  }

  async function reconcileUnknownOutcome(
    action = pendingAction.value,
  ): Promise<void> {
    if (!action || reconciling.value || !actionScopeIsCurrent(action)) return;
    const controller = new AbortController();
    reconciling.value = true;
    error.value = "";
    try {
      const receipt = await source.lookupOutcome(
        action.projectId,
        action.caseId,
        action.idempotencyKey,
        controller.signal,
      );
      await applyKnownReceipt(action, receipt);
    } catch (cause) {
      if (!actionScopeIsCurrent(action)) return;
      if (cause instanceof ApiError && cause.status === 404) {
        unknownOutcome.value = true;
        error.value =
          "Сервер пока не нашёл результат команды. Проверьте статус ещё раз.";
        return;
      }
      if (
        cause instanceof ApiError &&
        (cause.status === 403 || cause.status === 404)
      ) {
        reset();
        await context.onForbidden?.();
        return;
      }
      unknownOutcome.value = true;
      error.value = "Не удалось проверить результат. Исходная команда не повторена.";
    } finally {
      reconciling.value = false;
    }
  }

  async function submit(): Promise<void> {
    if (mutating.value || unknownOutcome.value) return;
    const action = captureAction();
    if (!action) {
      error.value = "Выберите доступного оператора и заполните обязательную причину";
      return;
    }
    mutationAbort?.abort();
    const controller = new AbortController();
    mutationAbort = controller;
    const requestGeneration = ++mutationGeneration;
    mutating.value = true;
    error.value = "";
    success.value = "";
    try {
      const receipt = await source.execute(
        action.projectId,
        action.intent,
        action.idempotencyKey,
        controller.signal,
      );
      if (requestGeneration !== mutationGeneration) return;
      await applyKnownReceipt(action, receipt);
    } catch (cause) {
      if (
        requestGeneration !== mutationGeneration ||
        !actionScopeIsCurrent(action)
      )
        return;
      if (cause instanceof SupportLeadAssignmentIntegrityError) {
        await load(action.caseId);
        if (actionScopeIsCurrent(action))
          error.value =
            "Ответ сервера не прошёл проверку. Данные обновлены, повтор заблокирован.";
        return;
      }
      if (cause instanceof ApiError && cause.status === 409) {
        const preservedDraft = draft.value;
        await load(action.caseId);
        if (actionScopeIsCurrent(action)) {
          draft.value = preservedDraft;
          error.value =
            "Назначение уже изменилось. Проверьте обновлённые данные и подтвердите снова.";
        }
        return;
      }
      if (
        cause instanceof ApiError &&
        (cause.status === 403 || cause.status === 404)
      ) {
        reset();
        await context.onForbidden?.();
        return;
      }
      if (
        cause instanceof ApiError &&
        (cause.status === 400 || cause.status === 422)
      ) {
        error.value = "Сервер не принял параметры назначения";
        return;
      }
      pendingAction.value = action;
      unknownOutcome.value = true;
      error.value = "Результат команды неизвестен. Проверяем серверный журнал…";
      await reconcileUnknownOutcome(action);
    } finally {
      if (requestGeneration === mutationGeneration) {
        mutating.value = false;
        mutationAbort = null;
      }
    }
  }

  function reset(): void {
    generation += 1;
    mutationGeneration += 1;
    readAbort?.abort();
    auditAbort?.abort();
    mutationAbort?.abort();
    readAbort = null;
    mutationAbort = null;
    auditAbort = null;
    caseId.value = null;
    snapshot.value = null;
    loading.value = false;
    mutating.value = false;
    reconciling.value = false;
    error.value = "";
    success.value = "";
    draft.value = null;
    unknownOutcome.value = false;
    pendingAction.value = null;
    auditFacts.value = [];
    auditLoading.value = false;
    auditError.value = "";
  }

  return {
    caseId,
    snapshot,
    loading,
    mutating,
    reconciling,
    error,
    success,
    draft,
    unknownOutcome,
    auditFacts,
    auditLoading,
    auditError,
    hasAuthority,
    open,
    load,
    loadAudit,
    setDraft,
    submit,
    reconcileUnknownOutcome,
    reset,
  };
}
