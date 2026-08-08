import { computed, ref } from "vue";
import type {
  ClassifyEndUserCaseDto,
  EndUserCaseCommandErrorDetailsResponseDto,
  EndUserCaseCommandResponseDto,
  EndUserCaseDetailResponseDto,
  EndUserCaseEscalationCommandResponseDto,
  RequestEndUserCaseEscalationDto,
  UpdateEndUserCaseWorkflowDto,
} from "@/shared/api/generated/models";
import type {
  EndUserCaseDetailBundle,
  EndUserCasesRepository,
} from "@/features/end-user-cases/api/end-user-cases-repository";
import { normalizeApiError } from "@/shared/api/http/api-error";

export type SupportCaseDeskSource = Pick<
  EndUserCasesRepository,
  "detail" | "workflow" | "classify" | "requestEscalation"
>;

export interface SupportCaseDeskContext {
  projectId(): string;
  caseId(): string;
  canRead(): boolean;
  onProjectionChanged?(): Promise<void> | void;
  onForbidden?(): Promise<void> | void;
}

export type SupportCaseStatus = UpdateEndUserCaseWorkflowDto["status"];
export type SupportCasePriority = NonNullable<
  ClassifyEndUserCaseDto["priority"]
>;
export type SupportCaseClassificationInput = Omit<
  ClassifyEndUserCaseDto,
  "expectedVersion" | "idempotencyKey"
>;

type AllowedAction = EndUserCaseDetailResponseDto["allowedActions"][number];
type CaseCommandReceipt =
  | EndUserCaseCommandResponseDto
  | EndUserCaseEscalationCommandResponseDto;
export type SupportCaseReconciliationReason =
  | "ACCEPTED"
  | "CONFLICT"
  | "UNKNOWN";

const STATUS_ACTIONS: Partial<Record<SupportCaseStatus, AllowedAction>> = {
  OPEN: "SET_STATUS_OPEN",
  IN_PROGRESS: "SET_STATUS_IN_PROGRESS",
  WAITING_END_USER: "SET_STATUS_WAITING_END_USER",
  WAITING_SYSTEM: "SET_STATUS_WAITING_SYSTEM",
  RESOLVED: "SET_STATUS_RESOLVED",
  UNRESOLVED: "SET_STATUS_UNRESOLVED",
  CANCELLED: "SET_STATUS_CANCELLED",
};

const PRIORITY_WEIGHT: Record<SupportCasePriority, number> = {
  LOW: 0,
  NORMAL: 1,
  HIGH: 2,
  URGENT: 3,
  CRITICAL: 4,
};

const cleanReason = (reason: string): string => {
  const value = reason.trim();
  if (!value) throw new Error("Укажите причину изменения");
  return value;
};

const uuid = (): string => crypto.randomUUID();

interface CaseScope {
  projectId: string;
  caseId: string;
}

const scopeKey = (value: CaseScope): string =>
  `${value.projectId}\u0000${value.caseId}`;

function errorDetails(
  value: unknown,
): EndUserCaseCommandErrorDetailsResponseDto | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    record.currentVersion !== undefined &&
    (!Number.isSafeInteger(record.currentVersion) ||
      Number(record.currentVersion) < 1)
  )
    return null;
  if (record.currentCase !== undefined) {
    if (!record.currentCase || typeof record.currentCase !== "object")
      return null;
    const current = record.currentCase as Record<string, unknown>;
    if (
      typeof current.id !== "string" ||
      !Number.isSafeInteger(current.version) ||
      typeof current.status !== "string"
    )
      return null;
  }
  return value as EndUserCaseCommandErrorDetailsResponseDto;
}

export function createSupportCaseDeskController(
  source: SupportCaseDeskSource,
  context: SupportCaseDeskContext,
) {
  const detail = ref<EndUserCaseDetailBundle | null>(null);
  const loading = ref(false);
  const mutating = ref(false);
  const error = ref<string | null>(null);
  const conflict = ref<EndUserCaseCommandErrorDetailsResponseDto | null>(null);
  const reconciling = ref(false);
  const reconciliationReason = ref<SupportCaseReconciliationReason | null>(null);
  const acceptedScopeKey = ref("");
  let generation = 0;
  const pendingKeys = new Map<string, string>();
  let activeMutation:
    | { token: symbol; generation: number; scopeKey: string }
    | null = null;
  let pendingReconciliation:
    | {
        fingerprint: string;
        minimumVersion: number;
        replay?: (key: string) => Promise<CaseCommandReceipt>;
        scope: CaseScope;
      }
    | null = null;

  const exactCase = computed(
    () => detail.value?.case as EndUserCaseDetailResponseDto | undefined,
  );

  function scope(): CaseScope {
    const projectId = context.projectId();
    const caseId = context.caseId();
    if (!context.canRead() || !projectId || !caseId)
      throw new Error("Кейс недоступен в текущем проекте");
    return { projectId, caseId };
  }

  function currentScopeMatches(value: CaseScope): boolean {
    return (
      context.canRead() &&
      context.projectId() === value.projectId &&
      context.caseId() === value.caseId
    );
  }

  function scopedCase(current: CaseScope): EndUserCaseDetailResponseDto {
    const value = exactCase.value;
    if (
      !value ||
      value.id !== current.caseId ||
      acceptedScopeKey.value !== scopeKey(current) ||
      reconciling.value
    )
      throw new Error("Актуальное состояние кейса ещё не загружено");
    return value;
  }

  function allowed(
    current: EndUserCaseDetailResponseDto,
    action: AllowedAction,
  ): boolean {
    return current.allowedActions.includes(action);
  }

  function commandKey(fingerprint: string): string {
    const existing = pendingKeys.get(fingerprint);
    if (existing) return existing;
    const value = uuid();
    pendingKeys.set(fingerprint, value);
    return value;
  }

  async function load(): Promise<void> {
    if (mutating.value) return;
    if (pendingReconciliation) return retryReconcile();
    const current = scope();
    const requestGeneration = ++generation;
    loading.value = true;
    error.value = null;
    try {
      const value = await source.detail(current.projectId, current.caseId);
      if (value.case.id !== current.caseId)
        throw new Error("Сервер вернул состояние другого кейса");
      if (
        requestGeneration === generation &&
        currentScopeMatches(current)
      ) {
        detail.value = value;
        acceptedScopeKey.value = scopeKey(current);
        reconciling.value = false;
        reconciliationReason.value = null;
      }
    } catch (cause) {
      const value = normalizeApiError(cause);
      if (requestGeneration === generation) {
        error.value = value.message;
        if (value.status === 403 || value.status === 404) {
          detail.value = null;
          acceptedScopeKey.value = "";
          reconciling.value = false;
          reconciliationReason.value = null;
          pendingKeys.clear();
          pendingReconciliation = null;
          await context.onForbidden?.();
        }
      }
      throw value;
    } finally {
      if (requestGeneration === generation) loading.value = false;
    }
  }

  function ownsMutation(owner: NonNullable<typeof activeMutation>): boolean {
    return (
      activeMutation?.token === owner.token &&
      generation === owner.generation &&
      currentScopeMatches({
        projectId: owner.scopeKey.split("\u0000")[0]!,
        caseId: owner.scopeKey.split("\u0000")[1]!,
      })
    );
  }

  function disableStaleAuthority(reason: SupportCaseReconciliationReason): void {
    if (!detail.value) return;
    detail.value = {
      ...detail.value,
      case: { ...detail.value.case, allowedActions: [] },
    };
    reconciling.value = true;
    reconciliationReason.value = reason;
  }

  function applyConflictReceipt(
    details: EndUserCaseCommandErrorDetailsResponseDto | null,
    current: CaseScope,
  ): void {
    const receipt = details?.currentCase;
    if (!detail.value || !receipt || receipt.id !== current.caseId) {
      disableStaleAuthority("CONFLICT");
      return;
    }
    const patch = Object.fromEntries(
      Object.entries({
        status: receipt.status,
        version: receipt.version,
        groupCode: receipt.groupCode,
        type: receipt.type,
        impact: receipt.impact,
        urgency: receipt.urgency,
        priority: receipt.priority,
        resolvedAt: receipt.resolvedAt,
        closedAt: receipt.closedAt,
      }).filter(([, item]) => item !== undefined),
    );
    detail.value = {
      ...detail.value,
      case: {
        ...detail.value.case,
        ...patch,
        allowedActions: [],
        ...(details.availableStatuses
          ? { availableStatuses: details.availableStatuses }
          : {}),
        ...(details.priorityPolicy
          ? { priorityPolicy: details.priorityPolicy }
          : {}),
      } as EndUserCaseDetailResponseDto,
    };
    reconciling.value = true;
    reconciliationReason.value = "CONFLICT";
  }

  function receiptVersion(receipt: CaseCommandReceipt, current: CaseScope): number {
    if ("caseVersion" in receipt) {
      if (
        receipt.escalation?.caseId === current.caseId &&
        Number.isSafeInteger(receipt.caseVersion) &&
        receipt.caseVersion >= 1
      )
        return receipt.caseVersion;
    } else if (
      receipt.id === current.caseId &&
      Number.isSafeInteger(receipt.version) &&
      receipt.version >= 1
    ) {
      return receipt.version;
    }
    throw new Error("Сервер вернул некорректное подтверждение команды");
  }

  async function exactReconcile(
    current: CaseScope,
    owner: NonNullable<typeof activeMutation>,
    minimumVersion: number,
  ): Promise<void> {
    const value = await source.detail(current.projectId, current.caseId);
    if (value.case.id !== current.caseId)
      throw new Error("Сервер вернул состояние другого кейса");
    if (value.case.version < minimumVersion)
      throw new Error("Актуальная версия кейса ещё не доступна");
    if (!ownsMutation(owner)) return;
    await context.onProjectionChanged?.();
    if (!ownsMutation(owner)) return;
    detail.value = value;
    acceptedScopeKey.value = scopeKey(current);
    reconciling.value = false;
    reconciliationReason.value = null;
  }

  async function execute(
    fingerprint: string,
    current: CaseScope,
    operation: (key: string) => Promise<CaseCommandReceipt>,
  ): Promise<void> {
    if (mutating.value) throw new Error("Изменение уже выполняется");
    const mutationGeneration = ++generation;
    loading.value = false;
    const owner = {
      token: Symbol("support-case-mutation"),
      generation: mutationGeneration,
      scopeKey: scopeKey(current),
    };
    activeMutation = owner;
    mutating.value = true;
    error.value = null;
    conflict.value = null;
    let operationAccepted = false;
    try {
      const receipt = await operation(commandKey(fingerprint));
      operationAccepted = true;
      const minimumVersion = receiptVersion(receipt, current);
      if (!ownsMutation(owner)) {
        pendingKeys.delete(fingerprint);
        return;
      }
      pendingReconciliation = { fingerprint, minimumVersion, scope: current };
      disableStaleAuthority("ACCEPTED");
      await exactReconcile(current, owner, minimumVersion);
      if (!ownsMutation(owner)) return;
      pendingKeys.delete(fingerprint);
      pendingReconciliation = null;
    } catch (cause) {
      const value = normalizeApiError(cause);
      if (!ownsMutation(owner)) throw value;
      error.value = operationAccepted
        ? "Изменение принято. Обновите состояние кейса перед следующей командой."
        : value.message;
      if (value.status === 403 || value.status === 404) {
        detail.value = null;
        acceptedScopeKey.value = "";
        reconciling.value = false;
        reconciliationReason.value = null;
        pendingKeys.delete(fingerprint);
        pendingReconciliation = null;
        await context.onForbidden?.();
      } else if (operationAccepted) {
        if (!pendingReconciliation) {
          pendingReconciliation = {
            fingerprint,
            minimumVersion: exactCase.value?.version ?? 1,
            replay: operation,
            scope: current,
          };
          disableStaleAuthority("UNKNOWN");
        } else {
          disableStaleAuthority("ACCEPTED");
        }
      } else if (value.status === 0 || value.status >= 500) {
        pendingReconciliation = {
          fingerprint,
          minimumVersion: scopedCase(current).version,
          replay: operation,
          scope: current,
        };
        disableStaleAuthority("UNKNOWN");
      }
      if (value.status === 409) {
        conflict.value = errorDetails(value.details);
        pendingKeys.delete(fingerprint);
        pendingReconciliation = null;
        applyConflictReceipt(conflict.value, current);
        try {
          await exactReconcile(
            current,
            owner,
            Math.max(
              conflict.value?.currentVersion ?? 1,
              conflict.value?.currentCase?.version ?? 1,
              exactCase.value?.version ?? 1,
            ),
          );
        } catch {
          // The typed receipt remains visible and commands stay fail-closed.
        }
      }
      throw value;
    } finally {
      if (activeMutation?.token === owner.token) {
        activeMutation = null;
        mutating.value = false;
      }
    }
  }

  async function retryReconcile(): Promise<void> {
    const current = scope();
    if (mutating.value) return;
    const pending = pendingReconciliation;
    if (pending && scopeKey(pending.scope) !== scopeKey(current)) return;
    const owner = {
      token: Symbol("support-case-reconcile"),
      generation,
      scopeKey: scopeKey(current),
    };
    activeMutation = owner;
    mutating.value = true;
    error.value = null;
    try {
      let minimumVersion =
        pending?.minimumVersion ?? exactCase.value?.version ?? 1;
      if (pending?.replay) {
        const receipt = await pending.replay(commandKey(pending.fingerprint));
        minimumVersion = receiptVersion(receipt, current);
        if (!ownsMutation(owner)) return;
        pending.minimumVersion = minimumVersion;
        delete pending.replay;
        disableStaleAuthority("ACCEPTED");
      }
      await exactReconcile(
        current,
        owner,
        minimumVersion,
      );
      if (!ownsMutation(owner)) return;
      if (pending) pendingKeys.delete(pending.fingerprint);
      pendingReconciliation = null;
    } catch (cause) {
      const value = normalizeApiError(cause);
      if (ownsMutation(owner)) {
        error.value = value.message;
        const replayConflict =
          value.status === 409 ? errorDetails(value.details) : null;
        if (replayConflict) {
          conflict.value = replayConflict;
          if (pending) pendingKeys.delete(pending.fingerprint);
          pendingReconciliation = null;
          applyConflictReceipt(replayConflict, current);
          try {
            await exactReconcile(
              current,
              owner,
              Math.max(
                replayConflict.currentVersion ?? 1,
                replayConflict.currentCase?.version ?? 1,
                exactCase.value?.version ?? 1,
              ),
            );
          } catch {
            // Typed conflict remains visible and authority stays fail-closed.
          }
        } else if (value.status === 400 && pending?.replay) {
          pendingKeys.delete(pending.fingerprint);
          pendingReconciliation = null;
          disableStaleAuthority("UNKNOWN");
          try {
            await exactReconcile(
              current,
              owner,
              exactCase.value?.version ?? 1,
            );
          } catch {
            // The rejected intent is retired, but authority remains fail-closed.
          }
        } else {
          disableStaleAuthority(reconciliationReason.value ?? "UNKNOWN");
        }
        if (value.status === 403 || value.status === 404) {
          detail.value = null;
          acceptedScopeKey.value = "";
          reconciling.value = false;
          reconciliationReason.value = null;
          pendingKeys.clear();
          pendingReconciliation = null;
          await context.onForbidden?.();
        }
      }
      throw value;
    } finally {
      if (activeMutation?.token === owner.token) {
        activeMutation = null;
        mutating.value = false;
      }
    }
  }

  async function transition(
    status: SupportCaseStatus,
    reason: string,
  ): Promise<void> {
    const currentScope = scope();
    const current = scopedCase(currentScope);
    const action = STATUS_ACTIONS[status];
    if (
      !current.availableStatuses.includes(status) ||
      !action ||
      !allowed(current, action)
    ) {
      throw new Error("Это изменение статуса недоступно по правилам сервера");
    }
    const clean = cleanReason(reason);
    const fingerprint = `workflow:${current.id}:${current.version}:${status}:${clean}`;
    await execute(fingerprint, currentScope, (idempotencyKey) =>
      source.workflow(currentScope.projectId, currentScope.caseId, {
        expectedVersion: current.version,
        idempotencyKey,
        reason: clean,
        status,
      }),
    );
  }

  function assertPriorityAllowed(
    current: EndUserCaseDetailResponseDto,
    priority: SupportCasePriority,
  ): void {
    if (priority === current.priority) return;
    const target = PRIORITY_WEIGHT[priority];
    const present = PRIORITY_WEIGHT[current.priority];
    if (target > present && !allowed(current, "RAISE_PRIORITY"))
      throw new Error("Повышение приоритета недоступно по правилам сервера");
    if (
      target < present &&
      !allowed(current, "LOWER_PRIORITY_TO_FLOOR") &&
      !allowed(current, "OVERRIDE_PRIORITY_FLOOR")
    )
      throw new Error("Понижение приоритета недоступно по правилам сервера");
    if (
      target < PRIORITY_WEIGHT[current.priorityPolicy.effectiveFloor] &&
      !allowed(current, "OVERRIDE_PRIORITY_FLOOR")
    )
      throw new Error("Приоритет нельзя опустить ниже серверного порога");
  }

  async function classify(input: SupportCaseClassificationInput): Promise<void> {
    const currentScope = scope();
    const current = scopedCase(currentScope);
    const classificationChanged = Boolean(
      input.groupCode || input.type || input.impact || input.urgency,
    );
    if (classificationChanged && !allowed(current, "CHANGE_CLASSIFICATION"))
      throw new Error("Изменение классификации недоступно по правилам сервера");
    if (input.priority) assertPriorityAllowed(current, input.priority);
    if (!classificationChanged && !input.priority)
      throw new Error("Выберите изменение классификации или приоритета");
    const reason = cleanReason(input.reason);
    const fingerprint = `classification:${current.id}:${current.version}:${JSON.stringify({ ...input, reason })}`;
    await execute(fingerprint, currentScope, (idempotencyKey) =>
      source.classify(currentScope.projectId, currentScope.caseId, {
        ...input,
        reason,
        expectedVersion: current.version,
        idempotencyKey,
      }),
    );
  }

  async function escalate(reasonCode: string, summary: string): Promise<void> {
    const currentScope = scope();
    const current = scopedCase(currentScope);
    if (!allowed(current, "REQUEST_ESCALATION"))
      throw new Error("Эскалация недоступна по правилам сервера");
    const cleanCode = reasonCode.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_]{0,99}$/.test(cleanCode))
      throw new Error("Код причины должен быть в формате PAYMENT_REVIEW");
    const cleanSummary = cleanReason(summary);
    const fingerprint = `escalation:${current.id}:${current.version}:${cleanCode}:${cleanSummary}`;
    await execute(fingerprint, currentScope, (idempotencyKey) =>
      source.requestEscalation(
        currentScope.projectId,
        currentScope.caseId,
        {
          expectedCaseVersion: current.version,
          reasonCode: cleanCode,
          summary: cleanSummary,
        } satisfies RequestEndUserCaseEscalationDto,
        idempotencyKey,
      ),
    );
  }

  function reset(): void {
    const active = activeMutation;
    if (
      active &&
      context.canRead() &&
      active.scopeKey ===
        scopeKey({ projectId: context.projectId(), caseId: context.caseId() })
    ) {
      disableStaleAuthority(reconciliationReason.value ?? "UNKNOWN");
      return;
    }
    generation += 1;
    detail.value = null;
    acceptedScopeKey.value = "";
    loading.value = false;
    mutating.value = false;
    error.value = null;
    conflict.value = null;
    reconciling.value = false;
    reconciliationReason.value = null;
    activeMutation = null;
    pendingReconciliation = null;
    pendingKeys.clear();
  }

  return {
    detail,
    exactCase,
    loading,
    mutating,
    error,
    conflict,
    reconciling,
    reconciliationReason,
    load,
    transition,
    classify,
    escalate,
    retryReconcile,
    reset,
  };
}
