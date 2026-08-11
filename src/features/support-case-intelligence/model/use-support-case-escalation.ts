import { computed, ref, shallowRef, watch } from "vue";
import { normalizeApiError } from "@/shared/api/http/api-error";
import type { SupportCaseEscalationSource } from "../api/support-case-escalation-source";
import { supportCaseEscalationSource } from "../api/support-case-escalation-source";
import type { CaseIntelligenceAuthority } from "./use-support-case-intelligence";
import {
  cloneEscalation,
  createDefaultEscalationPolicy,
  simulationStepSafetyIssue,
  simulationStepReferenceIssue,
  validateEscalationPolicy,
} from "./support-case-escalation-policy";
import type {
  EscalationPolicy,
  EscalationSafetyPolicy,
  EscalationSimulationResult,
  EscalationSimulationStep,
  EscalationWorkspaceSnapshot,
} from "./support-case-escalation-domain";

type PendingEscalationAttempt =
  | {
      operation: "SAVE";
      key: string;
      expectedVersion: number;
      definition: EscalationPolicy;
    }
  | {
      operation: "DISCARD";
      key: string;
      expectedVersion: number;
      reason: string;
    }
  | {
      operation: "PUBLISH";
      key: string;
      expectedVersion: number;
      revisionId: string;
      reason: string;
    };

export type SupportCaseEscalationContext = {
  authority: () => CaseIntelligenceAuthority | null;
  source?: SupportCaseEscalationSource;
  createIdempotencyKey?: () => string;
  onForbidden?: () => void;
  onAuthenticationRequired?: () => void;
};

const retained = new Map<string, PendingEscalationAttempt>();
const storagePrefix = "support-case-escalation-command-v1:";
const scopeKey = (scope: CaseIntelligenceAuthority) =>
  `${scope.actorId}:${scope.projectId}`;
const hasPermission = (scope: CaseIntelligenceAuthority | null, code: string) =>
  scope?.permissions.includes(code) === true;

function readRetained(
  scope: CaseIntelligenceAuthority,
): PendingEscalationAttempt | null {
  const memory = retained.get(scopeKey(scope));
  if (memory) return cloneEscalation(memory);
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(`${storagePrefix}${scopeKey(scope)}`);
    if (!raw) return null;
    const value = JSON.parse(raw) as PendingEscalationAttempt;
    if (!value?.operation || !value.key) return null;
    retained.set(scopeKey(scope), value);
    return cloneEscalation(value);
  } catch {
    return null;
  }
}

function writeRetained(
  scope: CaseIntelligenceAuthority,
  attempt: PendingEscalationAttempt | null,
) {
  const key = scopeKey(scope);
  if (attempt) retained.set(key, cloneEscalation(attempt));
  else retained.delete(key);
  if (typeof window === "undefined") return;
  try {
    const storageKey = `${storagePrefix}${key}`;
    if (attempt) sessionStorage.setItem(storageKey, JSON.stringify(attempt));
    else sessionStorage.removeItem(storageKey);
  } catch {
    /* in-memory recovery remains available */
  }
}

function version(snapshot: EscalationWorkspaceSnapshot | null) {
  return Math.max(
    snapshot?.escalation?.draft?.version ?? 0,
    snapshot?.escalation?.published?.version ?? 0,
  );
}

export function useSupportCaseEscalation(
  context: SupportCaseEscalationContext,
) {
  const source = context.source ?? supportCaseEscalationSource;
  const snapshot = shallowRef<EscalationWorkspaceSnapshot | null>(null);
  const safety = shallowRef<EscalationSafetyPolicy | null>(null);
  const safetyUnavailable = ref(false);
  const policy = ref<EscalationPolicy>(createDefaultEscalationPolicy());
  const simulationSteps = ref<EscalationSimulationStep[]>([]);
  const simulation = shallowRef<EscalationSimulationResult | null>(null);
  const pendingAttempt = shallowRef<PendingEscalationAttempt | null>(null);
  const loading = ref(false);
  const mutating = ref(false);
  const simulating = ref(false);
  const error = ref("");
  const feedback = ref("");
  const generation = ref(0);
  let readAbort: AbortController | null = null;
  let compileAbort: AbortController | null = null;
  let operationAbort: AbortController | null = null;
  let simulationAbort: AbortController | null = null;
  let activeScope: CaseIntelligenceAuthority | null = null;

  const authority = computed(() => context.authority());
  const issues = computed(() => validateEscalationPolicy(policy.value));
  const canRead = computed(() =>
    hasPermission(authority.value, "project.case_intelligence.read"),
  );
  const canPreview = computed(
    () =>
      hasPermission(authority.value, "project.case_intelligence.preview") &&
      snapshot.value?.allowedActions.includes("PREVIEW") === true,
  );
  const canManage = computed(
    () =>
      hasPermission(
        authority.value,
        "project.case_intelligence.escalation.manage",
      ) &&
      snapshot.value?.allowedActions.includes("SAVE_ESCALATION_DRAFT") === true,
  );
  const canPublish = computed(
    () =>
      hasPermission(
        authority.value,
        "project.case_intelligence.release.manage",
      ) && snapshot.value?.allowedActions.includes("PUBLISH") === true,
  );
  const draft = computed(() => snapshot.value?.escalation?.draft ?? null);
  const published = computed(
    () => snapshot.value?.escalation?.published ?? null,
  );
  const hasUnknownOutcome = computed(() => pendingAttempt.value !== null);

  watch(
    policy,
    () => {
      simulation.value = null;
    },
    { deep: true },
  );

  function current(scope: CaseIntelligenceAuthority, captured: number) {
    const now = context.authority();
    return (
      generation.value === captured &&
      now?.actorId === scope.actorId &&
      now.projectId === scope.projectId
    );
  }

  function canRun(
    scope: CaseIntelligenceAuthority,
    attempt: PendingEscalationAttempt,
  ) {
    if (attempt.operation === "PUBLISH")
      return (
        hasPermission(scope, "project.case_intelligence.release.manage") &&
        snapshot.value?.allowedActions.includes("PUBLISH") === true
      );
    return (
      hasPermission(scope, "project.case_intelligence.escalation.manage") &&
      snapshot.value?.allowedActions.includes("SAVE_ESCALATION_DRAFT") === true
    );
  }

  function applySnapshot(
    value: EscalationWorkspaceSnapshot,
    preservePolicy = false,
  ) {
    snapshot.value = value;
    if (!preservePolicy)
      policy.value = cloneEscalation(
        value.escalation?.draft?.definition ??
          value.escalation?.published?.definition ??
          createDefaultEscalationPolicy(),
      );
  }

  function purge(
    forgetScope?: CaseIntelligenceAuthority | null,
    forgetActive = false,
  ) {
    generation.value += 1;
    readAbort?.abort();
    compileAbort?.abort();
    operationAbort?.abort();
    simulationAbort?.abort();
    if (forgetScope) writeRetained(forgetScope, null);
    if (
      forgetActive &&
      activeScope &&
      (!forgetScope || scopeKey(activeScope) !== scopeKey(forgetScope))
    )
      writeRetained(activeScope, null);
    snapshot.value = null;
    safety.value = null;
    safetyUnavailable.value = false;
    policy.value = createDefaultEscalationPolicy();
    simulationSteps.value = [];
    simulation.value = null;
    pendingAttempt.value = null;
    loading.value = false;
    mutating.value = false;
    simulating.value = false;
    error.value = "";
    feedback.value = "";
    activeScope = null;
  }

  function terminal(cause: unknown, scope: CaseIntelligenceAuthority) {
    const value = normalizeApiError(cause);
    if ([401, 428].includes(value.status)) {
      purge(scope);
      context.onAuthenticationRequired?.();
      return true;
    }
    if ([403, 404].includes(value.status)) {
      purge(scope);
      context.onForbidden?.();
      return true;
    }
    return false;
  }

  async function load(options: { preservePolicy?: boolean } = {}) {
    const scope = context.authority();
    if (!scope || !hasPermission(scope, "project.case_intelligence.read")) {
      purge(scope);
      return;
    }
    generation.value += 1;
    const captured = generation.value;
    activeScope = cloneEscalation(scope);
    readAbort?.abort();
    readAbort = new AbortController();
    loading.value = true;
    safetyUnavailable.value = false;
    error.value = "";
    pendingAttempt.value = readRetained(scope);
    let missingSafety = false;
    try {
      const [value, safetyPolicy] = await Promise.all([
        source.read(scope.projectId, readAbort.signal),
        source.readSafety(scope.projectId, readAbort.signal).catch((cause) => {
          const value = normalizeApiError(cause);
          if (
            value.status === 404 &&
            value.code === "CASE_INTELLIGENCE_SAFETY_NOT_CONFIGURED"
          ) {
            missingSafety = true;
            return null;
          }
          throw value;
        }),
      ]);
      if (!current(scope, captured)) return;
      applySnapshot(value, options.preservePolicy === true);
      safety.value = safetyPolicy;
      safetyUnavailable.value = missingSafety;
      if (pendingAttempt.value && !canRun(scope, pendingAttempt.value)) {
        writeRetained(scope, null);
        pendingAttempt.value = null;
      }
    } catch (cause) {
      if (
        !current(scope, captured) ||
        normalizeApiError(cause).name === "AbortError"
      )
        return;
      if (!terminal(cause, scope))
        error.value = "Не удалось загрузить правила передачи оператору.";
    } finally {
      if (current(scope, captured)) loading.value = false;
    }
  }

  function key() {
    return context.createIdempotencyKey?.() ?? crypto.randomUUID();
  }

  async function execute(attempt: PendingEscalationAttempt, message: string) {
    const scope = context.authority();
    if (!scope || mutating.value || !canRun(scope, attempt)) return false;
    activeScope = cloneEscalation(scope);
    writeRetained(scope, attempt);
    pendingAttempt.value = cloneEscalation(attempt);
    const captured = generation.value;
    operationAbort?.abort();
    operationAbort = new AbortController();
    mutating.value = true;
    error.value = "";
    feedback.value = "";
    try {
      if (attempt.operation === "SAVE")
        await source.saveDraft(
          scope.projectId,
          attempt.definition,
          attempt.expectedVersion,
          attempt.key,
          operationAbort.signal,
        );
      if (attempt.operation === "DISCARD")
        await source.discardDraft(
          scope.projectId,
          attempt.expectedVersion,
          attempt.reason,
          attempt.key,
          operationAbort.signal,
        );
      if (attempt.operation === "PUBLISH")
        await source.publish(
          scope.projectId,
          attempt.revisionId,
          attempt.expectedVersion,
          attempt.reason,
          attempt.key,
          operationAbort.signal,
        );
      if (!current(scope, captured)) return false;
      const fresh = await source.read(scope.projectId, operationAbort.signal);
      if (!current(scope, captured)) return false;
      applySnapshot(fresh);
      writeRetained(scope, null);
      pendingAttempt.value = null;
      feedback.value = message;
      return true;
    } catch (cause) {
      const value = normalizeApiError(cause);
      if (!current(scope, captured) || value.name === "AbortError")
        return false;
      if (terminal(value, scope)) return false;
      if (value.status === 409) {
        writeRetained(scope, null);
        pendingAttempt.value = null;
        error.value =
          "Правила уже изменились. Свежая версия загружена; проверьте черновик и подтвердите действие снова.";
        try {
          const fresh = await source.read(
            scope.projectId,
            operationAbort.signal,
          );
          if (current(scope, captured)) applySnapshot(fresh, true);
        } catch {
          /* preserve local draft */
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
          "Результат команды неизвестен. Не создавайте новую команду — проверьте эту попытку.";
        return false;
      }
      writeRetained(scope, null);
      pendingAttempt.value = null;
      error.value =
        "Команда не выполнена. Проверьте правила и попробуйте ещё раз.";
      return false;
    } finally {
      if (current(scope, captured)) mutating.value = false;
    }
  }

  async function save() {
    const scope = context.authority();
    if (
      !scope ||
      !canManage.value ||
      issues.value.length ||
      pendingAttempt.value
    )
      return false;
    const captured = generation.value;
    compileAbort?.abort();
    compileAbort = new AbortController();
    const definition = cloneEscalation(policy.value);
    try {
      await source.compile(scope.projectId, definition, compileAbort.signal);
      if (!current(scope, captured)) return false;
    } catch (cause) {
      const value = normalizeApiError(cause);
      if (!current(scope, captured) || value.name === "AbortError")
        return false;
      if (!terminal(value, scope))
        error.value = "Сервер не принял правила. Проверьте отмеченные поля.";
      return false;
    }
    return execute(
      {
        operation: "SAVE",
        key: key(),
        expectedVersion: version(snapshot.value),
        definition,
      },
      "Черновик правил передачи сохранён.",
    );
  }

  function discard(reason: string) {
    const value = draft.value;
    if (!value || !canManage.value || pendingAttempt.value)
      return Promise.resolve(false);
    return execute(
      {
        operation: "DISCARD",
        key: key(),
        expectedVersion: value.version,
        reason,
      },
      "Черновик удалён.",
    );
  }

  function publish(reason: string) {
    const value = draft.value;
    if (!value || !canPublish.value || pendingAttempt.value)
      return Promise.resolve(false);
    return execute(
      {
        operation: "PUBLISH",
        key: key(),
        expectedVersion: value.version,
        revisionId: value.id,
        reason,
      },
      "Правила передачи опубликованы и готовы для следующей общей рабочей версии.",
    );
  }

  async function retryPending() {
    const scope = context.authority();
    const attempt = pendingAttempt.value;
    if (!scope || !attempt || !canRun(scope, attempt) || mutating.value)
      return false;
    const captured = generation.value;
    activeScope = cloneEscalation(scope);
    operationAbort?.abort();
    operationAbort = new AbortController();
    mutating.value = true;
    error.value = "";
    feedback.value = "";
    let shouldReplay = false;
    try {
      await source.lookupCommand(
        scope.projectId,
        attempt.key,
        operationAbort.signal,
      );
      if (!current(scope, captured)) return false;
      const fresh = await source.read(scope.projectId, operationAbort.signal);
      if (!current(scope, captured)) return false;
      applySnapshot(fresh);
      writeRetained(scope, null);
      pendingAttempt.value = null;
      feedback.value = "Результат команды подтверждён сервером.";
      return true;
    } catch (cause) {
      const value = normalizeApiError(cause);
      if (!current(scope, captured) || value.name === "AbortError")
        return false;
      if (value.status === 404) {
        shouldReplay = true;
      } else {
        if (terminal(value, scope)) return false;
        error.value =
          "Сервер ещё не подтвердил результат. Повторите проверку позже.";
      }
    } finally {
      if (current(scope, captured)) mutating.value = false;
    }
    if (shouldReplay && current(scope, captured))
      return execute(attempt, "Команда выполнена после точного повтора.");
    return false;
  }

  async function runSimulation() {
    const scope = context.authority();
    if (
      !scope ||
      !canPreview.value ||
      simulating.value ||
      issues.value.length ||
      !simulationSteps.value.length ||
      simulationSteps.value.some(
        (step) =>
          simulationStepReferenceIssue(step, policy.value) ||
          simulationStepSafetyIssue(step),
      )
    )
      return false;
    const captured = generation.value;
    simulationAbort?.abort();
    simulationAbort = new AbortController();
    simulating.value = true;
    error.value = "";
    try {
      const result = await source.dryRun(
        scope.projectId,
        cloneEscalation(policy.value),
        cloneEscalation(simulationSteps.value),
        simulationAbort.signal,
      );
      if (!current(scope, captured)) return false;
      simulation.value = result;
      return true;
    } catch (cause) {
      if (!current(scope, captured)) return false;
      if (!terminal(cause, scope))
        error.value = "Не удалось проверить сценарий.";
      return false;
    } finally {
      if (current(scope, captured)) simulating.value = false;
    }
  }

  return {
    snapshot,
    safety,
    safetyUnavailable,
    policy,
    simulationSteps,
    simulation,
    pendingAttempt,
    loading,
    mutating,
    simulating,
    error,
    feedback,
    issues,
    canRead,
    canPreview,
    canManage,
    canPublish,
    draft,
    published,
    hasUnknownOutcome,
    load,
    save,
    discard,
    publish,
    retryPending,
    runSimulation,
    reset: (options: { forgetRetained?: boolean } = {}) =>
      purge(
        options.forgetRetained ? context.authority() : null,
        options.forgetRetained === true,
      ),
  };
}
