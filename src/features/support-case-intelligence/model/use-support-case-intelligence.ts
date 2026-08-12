import { computed, ref, shallowRef, watch } from "vue";
import type {
  CaseIntelligenceAuthoringIssueDto,
  CaseIntelligenceBudgetPolicyDto,
  CaseIntelligenceCalibrationResponseDto,
  CaseIntelligenceCurrentResponseDtoAllowedActionsItem,
  CaseIntelligenceCurrentResponseDto,
  CaseIntelligenceDetectionPolicyDto,
  CaseIntelligenceDryRunResponseDto,
  CaseIntelligenceModelProfileCatalogResponseDto,
  CaseIntelligencePreviewMessageDto,
} from "@/shared/api/generated/models";
import {
  CaseIntelligenceAuthoringIssueDtoCode,
  CaseIntelligenceAuthoringIssueDtoSeverity,
} from "@/shared/api/generated/models";
import { normalizeApiError } from "@/shared/api/http/api-error";
import type { SupportCaseIntelligenceSource } from "../api/support-case-intelligence-source";
import { supportCaseIntelligenceSource } from "../api/support-case-intelligence-source";
import {
  clonePolicy,
  createDefaultBudgetPolicy,
  createDefaultDetectionPolicy,
  mergePolicyIssues,
  policyHasErrors,
  prepareDetectionPolicyForAuthoring,
  presentServerAuthoringIssues,
  type PolicyIssue,
  validateBudgetPolicy,
  validateDetectionPolicy,
} from "./support-case-intelligence-policy";

export type CaseIntelligenceAuthority = {
  actorId: string;
  projectId: string;
  permissions: readonly string[];
};

type PendingAttempt =
  | {
      operation: "SAVE_DETECTION";
      key: string;
      expectedVersion: number;
      definition: CaseIntelligenceDetectionPolicyDto;
    }
  | {
      operation: "DISCARD_DETECTION";
      key: string;
      expectedVersion: number;
      reason: string;
    }
  | {
      operation: "PUBLISH_DETECTION";
      key: string;
      revisionId: string;
      expectedVersion: number;
      reason: string;
    }
  | {
      operation: "SAVE_BUDGET";
      key: string;
      expectedVersion: number;
      definition: CaseIntelligenceBudgetPolicyDto;
    }
  | {
      operation: "PUBLISH_BUDGET";
      key: string;
      revisionId: string;
      expectedVersion: number;
      reason: string;
    };

export type SupportCaseIntelligenceContext = {
  authority: () => CaseIntelligenceAuthority | null;
  source?: SupportCaseIntelligenceSource;
  createIdempotencyKey?: () => string;
  onForbidden?: () => void;
  onAuthenticationRequired?: () => void;
};

const retainedAttempts = new Map<string, PendingAttempt>();
const retainedStoragePrefix = "support-case-intelligence-command-v1:";

function permission(
  authority: CaseIntelligenceAuthority | null,
  code: string,
): boolean {
  return authority?.permissions.includes(code) === true;
}

function scopeKey(authority: CaseIntelligenceAuthority): string {
  return `${authority.actorId}:${authority.projectId}`;
}

function readRetained(scope: CaseIntelligenceAuthority): PendingAttempt | null {
  const key = scopeKey(scope);
  const memory = retainedAttempts.get(key);
  if (memory) return clonePolicy(memory);
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(`${retainedStoragePrefix}${key}`);
    if (!raw) return null;
    const value = JSON.parse(raw) as PendingAttempt;
    if (
      !value ||
      typeof value !== "object" ||
      typeof value.key !== "string" ||
      typeof value.operation !== "string"
    )
      return null;
    retainedAttempts.set(key, value);
    return clonePolicy(value);
  } catch {
    return null;
  }
}

function writeRetained(
  scope: CaseIntelligenceAuthority,
  attempt: PendingAttempt | null,
) {
  const key = scopeKey(scope);
  if (attempt) retainedAttempts.set(key, clonePolicy(attempt));
  else retainedAttempts.delete(key);
  if (typeof window === "undefined") return;
  try {
    const storageKey = `${retainedStoragePrefix}${key}`;
    if (attempt)
      window.sessionStorage.setItem(storageKey, JSON.stringify(attempt));
    else window.sessionStorage.removeItem(storageKey);
  } catch {
    // In-memory recovery remains authoritative for this tab lifecycle.
  }
}

function detectionVersion(
  snapshot: CaseIntelligenceCurrentResponseDto | null,
): number {
  return Math.max(
    snapshot?.detection?.draft?.version ?? 0,
    snapshot?.detection?.published?.version ?? 0,
  );
}

function budgetVersion(
  snapshot: CaseIntelligenceCurrentResponseDto | null,
): number {
  return Math.max(
    snapshot?.budget?.draft?.version ?? 0,
    snapshot?.budget?.published?.version ?? 0,
  );
}

function budgetDefinition(
  snapshot: CaseIntelligenceCurrentResponseDto,
): CaseIntelligenceBudgetPolicyDto {
  const revision = snapshot.budget?.draft ?? snapshot.budget?.published;
  if (!revision) return createDefaultBudgetPolicy();
  return {
    dailyTokenSoftCap: revision.dailyTokenSoftCap,
    dailyTokenHardCap: revision.dailyTokenHardCap,
    dailyCostMicroUsdSoftCap: revision.dailyCostMicroUsdSoftCap,
    dailyCostMicroUsdHardCap: revision.dailyCostMicroUsdHardCap,
    maxRunCostMicroUsd: revision.maxRunCostMicroUsd,
    costMicroUsdPerMillionTokens: revision.costMicroUsdPerMillionTokens,
    maxConcurrentRuns: revision.maxConcurrentRuns,
    routeMaxEstimatedTokens: revision.routeMaxEstimatedTokens,
  };
}

function authoringIssuesFromDetails(details: unknown): PolicyIssue[] {
  if (
    !details ||
    typeof details !== "object" ||
    !("issues" in details) ||
    !Array.isArray(details.issues)
  )
    return [];
  const codes = new Set<string>(
    Object.values(CaseIntelligenceAuthoringIssueDtoCode),
  );
  const severities = new Set<string>(
    Object.values(CaseIntelligenceAuthoringIssueDtoSeverity),
  );
  const issues = details.issues.filter(
    (candidate): candidate is CaseIntelligenceAuthoringIssueDto => {
      if (!candidate || typeof candidate !== "object") return false;
      const value = candidate as Record<string, unknown>;
      return (
        typeof value.code === "string" &&
        codes.has(value.code) &&
        typeof value.message === "string" &&
        typeof value.path === "string" &&
        Array.isArray(value.relatedPaths) &&
        value.relatedPaths.every((path) => typeof path === "string") &&
        typeof value.severity === "string" &&
        severities.has(value.severity)
      );
    },
  );
  return presentServerAuthoringIssues(issues);
}

export function useSupportCaseIntelligence(
  context: SupportCaseIntelligenceContext,
) {
  const source = context.source ?? supportCaseIntelligenceSource;
  const snapshot = shallowRef<CaseIntelligenceCurrentResponseDto | null>(null);
  const detection = ref<CaseIntelligenceDetectionPolicyDto>(
    createDefaultDetectionPolicy(),
  );
  const budget = ref<CaseIntelligenceBudgetPolicyDto>(
    createDefaultBudgetPolicy(),
  );
  const loading = ref(false);
  const mutating = ref(false);
  const previewing = ref(false);
  const validating = ref(false);
  const calibrating = ref(false);
  const accessDenied = ref(false);
  const error = ref("");
  const feedback = ref("");
  const pendingAttempt = shallowRef<PendingAttempt | null>(null);
  const dryRunResult = shallowRef<CaseIntelligenceDryRunResponseDto | null>(
    null,
  );
  const modelProfiles =
    shallowRef<CaseIntelligenceModelProfileCatalogResponseDto | null>(null);
  const calibration = shallowRef<CaseIntelligenceCalibrationResponseDto | null>(
    null,
  );
  const serverDetectionIssues = shallowRef<PolicyIssue[]>([]);
  const validatedPolicyHash = ref<string | null>(null);
  const generation = ref(0);
  let readAbort: AbortController | null = null;
  let operationAbort: AbortController | null = null;
  let previewAbort: AbortController | null = null;
  let validationAbort: AbortController | null = null;
  let calibrationAbort: AbortController | null = null;
  let activeScope: CaseIntelligenceAuthority | null = null;

  const authority = computed(() => context.authority());
  const canRead = computed(() =>
    permission(authority.value, "project.case_intelligence.read"),
  );
  const allows = (
    action: CaseIntelligenceCurrentResponseDtoAllowedActionsItem,
  ) => snapshot.value?.allowedActions.includes(action) === true;
  const canPreview = computed(
    () =>
      permission(authority.value, "project.case_intelligence.preview") &&
      allows("PREVIEW"),
  );
  const canManageDetection = computed(
    () =>
      permission(
        authority.value,
        "project.case_intelligence.detection.manage",
      ) && allows("SAVE_DETECTION_DRAFT"),
  );
  const canPublishDetection = computed(
    () =>
      permission(authority.value, "project.case_intelligence.release.manage") &&
      allows("PUBLISH"),
  );
  const canManageBudget = computed(
    () =>
      permission(authority.value, "project.case_intelligence.release.manage") &&
      allows("SAVE_BUDGET_DRAFT"),
  );
  const canPublishBudget = computed(
    () =>
      permission(authority.value, "project.case_intelligence.release.manage") &&
      allows("PUBLISH_BUDGET"),
  );
  const canReadCost = computed(() =>
    permission(authority.value, "project.case_intelligence.cost.read"),
  );
  const assignedModelRevisionId = computed(() => {
    const candidates = [
      modelProfiles.value?.selectedRevisionId,
      snapshot.value?.release?.modelProfileRevisionId,
    ];
    return (
      candidates
        .find(
          (candidate): candidate is string =>
            typeof candidate === "string" && candidate.trim().length > 0,
        )
        ?.trim() ?? ""
    );
  });
  const modelProfileIssues = computed<PolicyIssue[]>(() => {
    if (!modelProfiles.value) return [];
    const selected =
      assignedModelRevisionId.value ===
        detection.value.modelProfileRevisionId ||
      modelProfiles.value.items.some(
        (profile) =>
          profile.revisionId === detection.value.modelProfileRevisionId,
      );
    return selected
      ? []
      : [
          {
            path: "modelProfileRevisionId",
            severity: "ERROR",
            source: "SERVER",
            message:
              "Выберите модель из списка, разрешённого для этого проекта.",
          },
        ];
  });
  const detectionIssues = computed(() =>
    mergePolicyIssues(
      validateDetectionPolicy(detection.value),
      modelProfileIssues.value,
      serverDetectionIssues.value,
    ),
  );
  const budgetIssues = computed(() => validateBudgetPolicy(budget.value));
  const hasDetectionErrors = computed(() =>
    policyHasErrors(detectionIssues.value),
  );
  const hasBudgetErrors = computed(() => policyHasErrors(budgetIssues.value));
  const hasPendingRecovery = computed(() => pendingAttempt.value !== null);

  watch(
    detection,
    () => {
      serverDetectionIssues.value = [];
      validatedPolicyHash.value = null;
      dryRunResult.value = null;
      calibration.value = null;
    },
    { deep: true },
  );

  function current(
    scope: CaseIntelligenceAuthority,
    capturedGeneration: number,
  ): boolean {
    const value = context.authority();
    return (
      generation.value === capturedGeneration &&
      value?.actorId === scope.actorId &&
      value.projectId === scope.projectId
    );
  }

  function canRunAttempt(
    scope: CaseIntelligenceAuthority,
    attempt: PendingAttempt,
  ): boolean {
    const allowed = snapshot.value?.allowedActions ?? [];
    if (!hasAttemptPermission(scope, attempt)) return false;
    switch (attempt.operation) {
      case "SAVE_DETECTION":
      case "DISCARD_DETECTION":
        return allowed.includes("SAVE_DETECTION_DRAFT");
      case "PUBLISH_DETECTION":
        return allowed.includes("PUBLISH");
      case "SAVE_BUDGET":
        return allowed.includes("SAVE_BUDGET_DRAFT");
      case "PUBLISH_BUDGET":
        return allowed.includes("PUBLISH_BUDGET");
    }
  }

  function hasAttemptPermission(
    scope: CaseIntelligenceAuthority,
    attempt: PendingAttempt,
  ): boolean {
    return attempt.operation === "SAVE_DETECTION" ||
      attempt.operation === "DISCARD_DETECTION"
      ? permission(scope, "project.case_intelligence.detection.manage")
      : permission(scope, "project.case_intelligence.release.manage");
  }

  function applySnapshot(
    value: CaseIntelligenceCurrentResponseDto,
    preserveForms = false,
  ) {
    snapshot.value = value;
    if (!preserveForms) {
      detection.value = prepareDetectionPolicyForAuthoring(
        value.detection?.draft?.definition ??
          value.detection?.published?.definition ??
          createDefaultDetectionPolicy(),
      );
      budget.value = clonePolicy(budgetDefinition(value));
    }
  }

  function purge() {
    generation.value += 1;
    readAbort?.abort();
    operationAbort?.abort();
    previewAbort?.abort();
    validationAbort?.abort();
    calibrationAbort?.abort();
    readAbort = null;
    operationAbort = null;
    previewAbort = null;
    validationAbort = null;
    calibrationAbort = null;
    snapshot.value = null;
    detection.value = createDefaultDetectionPolicy();
    budget.value = createDefaultBudgetPolicy();
    dryRunResult.value = null;
    modelProfiles.value = null;
    calibration.value = null;
    serverDetectionIssues.value = [];
    validatedPolicyHash.value = null;
    pendingAttempt.value = null;
    loading.value = false;
    mutating.value = false;
    previewing.value = false;
    validating.value = false;
    calibrating.value = false;
    error.value = "";
    feedback.value = "";
  }

  function handleTerminalAccess(
    cause: unknown,
    captured?: CaseIntelligenceAuthority,
  ): boolean {
    const value = normalizeApiError(cause);
    if ([401, 428].includes(value.status)) {
      if (captured) writeRetained(captured, null);
      purge();
      context.onAuthenticationRequired?.();
      return true;
    }
    if ([403, 404].includes(value.status)) {
      if (captured) writeRetained(captured, null);
      purge();
      accessDenied.value = true;
      context.onForbidden?.();
      return true;
    }
    return false;
  }

  async function load(options: { preserveForms?: boolean } = {}) {
    const scope = context.authority();
    if (!scope || !permission(scope, "project.case_intelligence.read")) {
      purge();
      return;
    }
    activeScope = clonePolicy(scope);
    generation.value += 1;
    const capturedGeneration = generation.value;
    readAbort?.abort();
    readAbort = new AbortController();
    loading.value = true;
    accessDenied.value = false;
    error.value = "";
    const retained = readRetained(scope);
    pendingAttempt.value = retained;
    try {
      const [value, profiles] = await Promise.all([
        source.read(scope.projectId, readAbort.signal),
        source.readModelProfiles(scope.projectId, readAbort.signal),
      ]);
      if (!current(scope, capturedGeneration)) return;
      applySnapshot(value, options.preserveForms === true);
      modelProfiles.value = profiles;
      if (
        !options.preserveForms &&
        !value.detection?.draft &&
        !value.detection?.published &&
        assignedModelRevisionId.value
      )
        detection.value.modelProfileRevisionId = assignedModelRevisionId.value;
      if (pendingAttempt.value && !canRunAttempt(scope, pendingAttempt.value))
        forget(scope);
    } catch (cause) {
      if (
        !current(scope, capturedGeneration) ||
        normalizeApiError(cause).name === "AbortError"
      )
        return;
      if (!handleTerminalAccess(cause, scope))
        error.value = "Не удалось загрузить правила. Попробуйте ещё раз.";
    } finally {
      if (current(scope, capturedGeneration)) loading.value = false;
    }
  }

  function remember(scope: CaseIntelligenceAuthority, attempt: PendingAttempt) {
    writeRetained(scope, attempt);
    pendingAttempt.value = attempt;
  }

  function forget(scope: CaseIntelligenceAuthority) {
    writeRetained(scope, null);
    pendingAttempt.value = null;
  }

  async function execute(attempt: PendingAttempt, label: string) {
    const scope = context.authority();
    if (!scope || mutating.value || !canRunAttempt(scope, attempt))
      return false;
    activeScope = clonePolicy(scope);
    remember(scope, attempt);
    const capturedGeneration = generation.value;
    operationAbort?.abort();
    operationAbort = new AbortController();
    mutating.value = true;
    error.value = "";
    feedback.value = "";
    try {
      switch (attempt.operation) {
        case "SAVE_DETECTION":
          await source.saveDetectionDraft(
            scope.projectId,
            attempt.definition,
            attempt.expectedVersion,
            attempt.key,
            operationAbort.signal,
          );
          break;
        case "DISCARD_DETECTION":
          await source.discardDetectionDraft(
            scope.projectId,
            attempt.expectedVersion,
            attempt.reason,
            attempt.key,
            operationAbort.signal,
          );
          break;
        case "PUBLISH_DETECTION":
          await source.publishDetection(
            scope.projectId,
            attempt.revisionId,
            attempt.expectedVersion,
            attempt.reason,
            attempt.key,
            operationAbort.signal,
          );
          break;
        case "SAVE_BUDGET":
          await source.saveBudgetDraft(
            scope.projectId,
            attempt.definition,
            attempt.expectedVersion,
            attempt.key,
            operationAbort.signal,
          );
          break;
        case "PUBLISH_BUDGET":
          await source.publishBudget(
            scope.projectId,
            attempt.revisionId,
            attempt.expectedVersion,
            attempt.reason,
            attempt.key,
            operationAbort.signal,
          );
          break;
      }
      if (!current(scope, capturedGeneration)) return false;
      const fresh = await source.read(scope.projectId, operationAbort.signal);
      if (!current(scope, capturedGeneration)) return false;
      applySnapshot(fresh);
      forget(scope);
      feedback.value = label;
      return true;
    } catch (cause) {
      const value = normalizeApiError(cause);
      if (!current(scope, capturedGeneration) || value.name === "AbortError")
        return false;
      if (handleTerminalAccess(value, scope)) return false;
      const authoringIssues = authoringIssuesFromDetails(value.details);
      if ([400, 422].includes(value.status) && authoringIssues.length) {
        forget(scope);
        serverDetectionIssues.value = authoringIssues;
        error.value = "Исправьте отмеченные сервером поля.";
        return false;
      }
      if (value.status === 409) {
        forget(scope);
        error.value =
          "Правила уже изменились на сервере. Мы перечитали свежую версию; проверьте изменения и подтвердите действие ещё раз.";
        try {
          const fresh = await source.read(
            scope.projectId,
            operationAbort?.signal,
          );
          if (current(scope, capturedGeneration)) applySnapshot(fresh, true);
        } catch {
          // Keep the operator draft and require an explicit refresh.
        }
        return false;
      }
      if (
        value.status === 0 ||
        value.status === 408 ||
        value.status === 429 ||
        value.status >= 500
      ) {
        error.value =
          "Результат команды пока неизвестен. Не создавайте новую команду — повторите проверку этой попытки.";
        return false;
      }
      forget(scope);
      error.value =
        "Команда не выполнена. Проверьте данные и попробуйте ещё раз.";
      return false;
    } finally {
      if (current(scope, capturedGeneration)) mutating.value = false;
    }
  }

  function key() {
    return context.createIdempotencyKey?.() ?? crypto.randomUUID();
  }

  async function saveDetection() {
    if (
      !canManageDetection.value ||
      hasDetectionErrors.value ||
      pendingAttempt.value
    )
      return false;
    if (canPreview.value && !(await validateDraft())) return false;
    return execute(
      {
        operation: "SAVE_DETECTION",
        key: key(),
        expectedVersion: detectionVersion(snapshot.value),
        definition: clonePolicy(detection.value),
      },
      "Черновик правил сохранён.",
    );
  }

  async function discardDetection(reason: string) {
    const draft = snapshot.value?.detection?.draft;
    if (!canManageDetection.value || !draft || pendingAttempt.value)
      return false;
    return execute(
      {
        operation: "DISCARD_DETECTION",
        key: key(),
        expectedVersion: draft.version,
        reason,
      },
      "Черновик удалён.",
    );
  }

  async function publishDetection(reason: string) {
    const draft = snapshot.value?.detection?.draft;
    if (!canPublishDetection.value || !draft || pendingAttempt.value)
      return false;
    return execute(
      {
        operation: "PUBLISH_DETECTION",
        key: key(),
        revisionId: draft.id,
        expectedVersion: draft.version,
        reason,
      },
      "Правила категорий опубликованы и готовы для следующей общей рабочей версии.",
    );
  }

  async function saveBudget() {
    if (!canManageBudget.value || hasBudgetErrors.value || pendingAttempt.value)
      return false;
    return execute(
      {
        operation: "SAVE_BUDGET",
        key: key(),
        expectedVersion: budgetVersion(snapshot.value),
        definition: clonePolicy(budget.value),
      },
      "Черновик лимитов сохранён.",
    );
  }

  async function publishBudget(reason: string) {
    const draft = snapshot.value?.budget?.draft;
    if (!canPublishBudget.value || !draft || pendingAttempt.value) return false;
    return execute(
      {
        operation: "PUBLISH_BUDGET",
        key: key(),
        revisionId: draft.id,
        expectedVersion: draft.version,
        reason,
      },
      "Лимиты опубликованы.",
    );
  }

  async function validateDraft(): Promise<boolean> {
    const scope = context.authority();
    if (!scope || !canPreview.value || validating.value) return false;
    const localIssues = validateDetectionPolicy(detection.value);
    if (policyHasErrors(localIssues)) return false;
    const capturedGeneration = generation.value;
    validationAbort?.abort();
    validationAbort = new AbortController();
    validating.value = true;
    error.value = "";
    try {
      const result = await source.validateDetection(
        scope.projectId,
        clonePolicy(detection.value),
        validationAbort.signal,
      );
      if (!current(scope, capturedGeneration)) return false;
      serverDetectionIssues.value = presentServerAuthoringIssues(result.issues);
      validatedPolicyHash.value = result.compiledPolicyHash ?? null;
      return result.valid && !policyHasErrors(serverDetectionIssues.value);
    } catch (cause) {
      if (!current(scope, capturedGeneration)) return false;
      const value = normalizeApiError(cause);
      if (!handleTerminalAccess(value, scope)) {
        const issues = authoringIssuesFromDetails(value.details);
        if (issues.length) serverDetectionIssues.value = issues;
        error.value = issues.length
          ? "Исправьте отмеченные сервером поля."
          : "Не удалось проверить правила на сервере.";
      }
      return false;
    } finally {
      if (current(scope, capturedGeneration)) validating.value = false;
    }
  }

  async function preview(messages: CaseIntelligencePreviewMessageDto[]) {
    const scope = context.authority();
    if (
      !scope ||
      !canPreview.value ||
      previewing.value ||
      hasDetectionErrors.value ||
      !messages.some((message) => message.role === "USER")
    )
      return;
    if (!(await validateDraft())) return;
    const capturedGeneration = generation.value;
    previewAbort?.abort();
    previewAbort = new AbortController();
    previewing.value = true;
    error.value = "";
    try {
      const result = await source.dryRun(
        scope.projectId,
        clonePolicy(detection.value),
        clonePolicy(messages),
        previewAbort.signal,
      );
      if (!current(scope, capturedGeneration)) return;
      dryRunResult.value = result;
    } catch (cause) {
      if (!current(scope, capturedGeneration)) return;
      if (!handleTerminalAccess(cause, scope))
        error.value = "Не удалось проверить пример.";
    } finally {
      if (current(scope, capturedGeneration)) previewing.value = false;
    }
  }

  async function loadCalibration() {
    const scope = context.authority();
    if (
      !scope ||
      !canPreview.value ||
      calibrating.value ||
      hasDetectionErrors.value
    )
      return false;
    if (!(await validateDraft())) return false;
    const capturedGeneration = generation.value;
    calibrationAbort?.abort();
    calibrationAbort = new AbortController();
    calibrating.value = true;
    error.value = "";
    try {
      const result = await source.readCalibration(
        scope.projectId,
        clonePolicy(detection.value),
        calibrationAbort.signal,
      );
      if (!current(scope, capturedGeneration)) return false;
      calibration.value = result;
      return true;
    } catch (cause) {
      if (!current(scope, capturedGeneration)) return false;
      if (!handleTerminalAccess(cause, scope))
        error.value = "Не удалось загрузить покрытие модели.";
      return false;
    } finally {
      if (current(scope, capturedGeneration)) calibrating.value = false;
    }
  }

  async function retryPending() {
    const scope = context.authority();
    const attempt = pendingAttempt.value;
    if (!scope || !attempt || mutating.value) return false;
    if (!canRunAttempt(scope, attempt)) {
      forget(scope);
      return false;
    }
    const capturedGeneration = generation.value;
    operationAbort?.abort();
    operationAbort = new AbortController();
    mutating.value = true;
    error.value = "";
    try {
      const result = await source.lookupCommand(
        scope.projectId,
        attempt.key,
        operationAbort.signal,
      );
      if (!current(scope, capturedGeneration)) return false;
      const expectedKind = attempt.operation.includes("BUDGET")
        ? "BUDGET_POLICY"
        : "DETECTION_POLICY";
      if (result.resultKind !== expectedKind) {
        error.value =
          "Сервер вернул подтверждение другой команды. Новые изменения заблокированы до ручной проверки.";
        return false;
      }
      const fresh = await source.read(scope.projectId, operationAbort.signal);
      if (!current(scope, capturedGeneration)) return false;
      applySnapshot(fresh);
      forget(scope);
      feedback.value = "Команда подтверждена сервером.";
      return true;
    } catch (cause) {
      const value = normalizeApiError(cause);
      if (!current(scope, capturedGeneration) || value.name === "AbortError")
        return false;
      if (value.status === 404) {
        // The idempotency lookup has no receipt for this exact command yet.
        // Replaying the retained body, version and key is the only safe write.
      } else if (handleTerminalAccess(value, scope)) {
        return false;
      } else {
        error.value =
          "Подтверждение пока недоступно. Повторите проверку этой же команды позже.";
        return false;
      }
    } finally {
      if (current(scope, capturedGeneration)) mutating.value = false;
    }
    return execute(clonePolicy(attempt), "Команда подтверждена сервером.");
  }

  function reset(
    options: {
      forgetRetained?: boolean;
      nextAuthority?: CaseIntelligenceAuthority | null;
    } = {},
  ) {
    const next = options.nextAuthority;
    const scopeChanged =
      activeScope &&
      (next === null ||
        (next !== undefined &&
          (next.actorId !== activeScope.actorId ||
            next.projectId !== activeScope.projectId)));
    const permissionLost =
      activeScope &&
      next &&
      pendingAttempt.value &&
      !hasAttemptPermission(next, pendingAttempt.value);
    if (
      activeScope &&
      (options.forgetRetained || scopeChanged || permissionLost)
    )
      writeRetained(activeScope, null);
    generation.value += 1;
    readAbort?.abort();
    operationAbort?.abort();
    previewAbort?.abort();
    validationAbort?.abort();
    calibrationAbort?.abort();
    readAbort = null;
    operationAbort = null;
    previewAbort = null;
    validationAbort = null;
    calibrationAbort = null;
    snapshot.value = null;
    dryRunResult.value = null;
    modelProfiles.value = null;
    calibration.value = null;
    serverDetectionIssues.value = [];
    validatedPolicyHash.value = null;
    loading.value = false;
    mutating.value = false;
    previewing.value = false;
    validating.value = false;
    calibrating.value = false;
    error.value = "";
    feedback.value = "";
    pendingAttempt.value = null;
    activeScope = null;
  }

  return {
    snapshot,
    detection,
    budget,
    loading,
    mutating,
    previewing,
    validating,
    calibrating,
    accessDenied,
    error,
    feedback,
    pendingAttempt,
    dryRunResult,
    modelProfiles,
    assignedModelRevisionId,
    calibration,
    serverDetectionIssues,
    validatedPolicyHash,
    detectionIssues,
    budgetIssues,
    hasDetectionErrors,
    hasBudgetErrors,
    hasPendingRecovery,
    canRead,
    canPreview,
    canManageDetection,
    canPublishDetection,
    canManageBudget,
    canPublishBudget,
    canReadCost,
    load,
    reset,
    purge,
    saveDetection,
    discardDetection,
    publishDetection,
    saveBudget,
    publishBudget,
    preview,
    validateDraft,
    loadCalibration,
    retryPending,
  };
}
