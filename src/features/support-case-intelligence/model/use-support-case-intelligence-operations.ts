import { computed, ref, shallowRef } from 'vue';
import { normalizeApiError } from '@/shared/api/http/api-error';
import type { SupportCaseIntelligenceOperationsSource } from '../api/support-case-intelligence-operations-source';
import { supportCaseIntelligenceOperationsSource } from '../api/support-case-intelligence-operations-source';
import type {
  ActivateCaseIntelligenceReleaseCommand,
  CaseIntelligenceDatasetDetail,
  CaseIntelligenceDatasetSummary,
  CaseIntelligenceDecision,
  CaseIntelligenceEvaluationHistoryItem,
  CaseIntelligenceEvaluationReport,
  CaseIntelligenceObservability,
  CaseIntelligenceOperationsCurrent,
  CaseIntelligenceOperationsSection,
  CaseIntelligencePendingCommand,
  CaseIntelligenceRelease,
  CorrectCaseIntelligenceDecisionCommand,
  RollbackCaseIntelligenceReleaseCommand,
  RunCaseIntelligenceEvaluationCommand,
} from './support-case-intelligence-operations-domain';

export interface CaseIntelligenceOperationsAuthority {
  actorId: string;
  projectId: string;
  permissions: readonly string[];
}

export interface SupportCaseIntelligenceOperationsContext {
  authority: () => CaseIntelligenceOperationsAuthority | null;
  source?: SupportCaseIntelligenceOperationsSource;
  createIdempotencyKey?: () => string;
  onForbidden?: () => void | Promise<void>;
  onAuthenticationRequired?: () => void | Promise<void>;
}

const storagePrefix = 'support-case-intelligence-operations-command-v1:';
const retained = new Map<string, CaseIntelligencePendingCommand>();

function scopeKey(scope: CaseIntelligenceOperationsAuthority) {
  return `${scope.actorId}:${scope.projectId}`;
}

function readRetained(scope: CaseIntelligenceOperationsAuthority) {
  const key = scopeKey(scope);
  if (retained.has(key)) return structuredClone(retained.get(key)!);
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(`${storagePrefix}${key}`);
    if (!raw) return null;
    const value = JSON.parse(raw) as CaseIntelligencePendingCommand;
    if (!value?.operation || !value.body?.idempotencyKey) return null;
    retained.set(key, value);
    return structuredClone(value);
  } catch {
    return null;
  }
}

function writeRetained(
  scope: CaseIntelligenceOperationsAuthority,
  value: CaseIntelligencePendingCommand | null,
) {
  const key = scopeKey(scope);
  if (value) retained.set(key, structuredClone(value));
  else retained.delete(key);
  if (typeof window === 'undefined') return;
  try {
    const storageKey = `${storagePrefix}${key}`;
    if (value) window.sessionStorage.setItem(storageKey, JSON.stringify(value));
    else window.sessionStorage.removeItem(storageKey);
  } catch {
    // Session storage is best-effort; the in-memory receipt stays authoritative.
  }
}

function has(scope: CaseIntelligenceOperationsAuthority | null, permission: string) {
  return scope?.permissions.includes(permission) === true;
}

function canRetainAttempt(
  scope: CaseIntelligenceOperationsAuthority,
  attempt: CaseIntelligencePendingCommand,
) {
  return attempt.operation === 'CORRECT_DECISION'
    ? has(scope, 'project.case_intelligence.labels.review')
    : has(scope, 'project.case_intelligence.release.manage');
}

function isTerminalAccess(status: number, code?: string) {
  return (
    status === 401 ||
    status === 403 ||
    status === 404 ||
    status === 428 ||
    code === 'MFA_REQUIRED' ||
    code === 'MFA_ENROLLMENT_REQUIRED' ||
    code === 'REAUTHENTICATION_REQUIRED'
  );
}

function isUnknown(status: number) {
  return status === 0 || status === 408 || status === 429 || status >= 500;
}

export function useSupportCaseIntelligenceOperations(
  context: SupportCaseIntelligenceOperationsContext,
) {
  const source = context.source ?? supportCaseIntelligenceOperationsSource;
  const current = shallowRef<CaseIntelligenceOperationsCurrent | null>(null);
  const datasets = shallowRef<CaseIntelligenceDatasetSummary[]>([]);
  const dataset = shallowRef<CaseIntelligenceDatasetDetail | null>(null);
  const evaluations = shallowRef<CaseIntelligenceEvaluationHistoryItem[]>([]);
  const evaluation = shallowRef<CaseIntelligenceEvaluationReport | null>(null);
  const observability = shallowRef<CaseIntelligenceObservability | null>(null);
  const decisions = shallowRef<CaseIntelligenceDecision[]>([]);
  const decision = shallowRef<CaseIntelligenceDecision | null>(null);
  const releases = shallowRef<CaseIntelligenceRelease[]>([]);
  const loading = ref(false);
  const mutating = ref(false);
  const accessDenied = ref(false);
  const error = ref('');
  const feedback = ref('');
  const datasetCursor = ref<string | null>(null);
  const evaluationCursor = ref<string | null>(null);
  const decisionCursor = ref<string | null>(null);
  const pending = shallowRef<CaseIntelligencePendingCommand | null>(null);
  const loadingMore = ref(false);
  const generation = ref(0);
  let readAbort: AbortController | null = null;
  let mutationAbort: AbortController | null = null;
  let activeScope: CaseIntelligenceOperationsAuthority | null = null;

  const authority = computed(() => context.authority());
  const canRead = computed(
    () => has(authority.value, 'project.case_intelligence.read') && !accessDenied.value,
  );
  const canManageRelease = computed(() =>
    has(authority.value, 'project.case_intelligence.release.manage'),
  );
  const canReadCost = computed(() => has(authority.value, 'project.case_intelligence.cost.read'));
  const canReadDecisions = computed(() =>
    has(authority.value, 'project.case_intelligence.decisions.read'),
  );
  const canReviewLabels = computed(() =>
    has(authority.value, 'project.case_intelligence.labels.review'),
  );
  const canActivate = computed(
    () => canManageRelease.value && current.value?.allowedActions.includes('ACTIVATE') === true,
  );
  const canRollback = computed(
    () => canManageRelease.value && current.value?.allowedActions.includes('ROLLBACK') === true,
  );
  const canCorrect = computed(
    () =>
      canReviewLabels.value && current.value?.allowedActions.includes('CORRECT_DECISION') === true,
  );

  function isCurrent(scope: CaseIntelligenceOperationsAuthority, token: number) {
    const next = context.authority();
    return (
      generation.value === token &&
      next?.actorId === scope.actorId &&
      next.projectId === scope.projectId
    );
  }

  function clearProtected() {
    current.value = null;
    datasets.value = [];
    dataset.value = null;
    evaluations.value = [];
    evaluation.value = null;
    observability.value = null;
    decisions.value = [];
    decision.value = null;
    releases.value = [];
    datasetCursor.value = null;
    evaluationCursor.value = null;
    decisionCursor.value = null;
  }

  function reset(options: { forgetRetained?: boolean } = {}) {
    generation.value += 1;
    readAbort?.abort();
    mutationAbort?.abort();
    readAbort = null;
    mutationAbort = null;
    if (options.forgetRetained && activeScope) writeRetained(activeScope, null);
    activeScope = null;
    pending.value = null;
    loading.value = false;
    loadingMore.value = false;
    mutating.value = false;
    accessDenied.value = false;
    error.value = '';
    feedback.value = '';
    clearProtected();
  }

  async function handleError(
    cause: unknown,
    scope: CaseIntelligenceOperationsAuthority,
    forget = false,
  ) {
    const problem = normalizeApiError(cause);
    if (forget || isTerminalAccess(problem.status, problem.code)) {
      writeRetained(scope, null);
      pending.value = null;
    }
    if (
      problem.status === 401 ||
      problem.status === 428 ||
      problem.code?.includes('MFA') ||
      problem.code === 'REAUTHENTICATION_REQUIRED'
    ) {
      clearProtected();
      await context.onAuthenticationRequired?.();
      return;
    }
    if (problem.status === 403 || problem.status === 404) {
      clearProtected();
      accessDenied.value = true;
      await context.onForbidden?.();
      return;
    }
    error.value =
      problem.status === 409
        ? 'Данные изменились на сервере. Мы перечитали актуальную версию — подтвердите действие ещё раз.'
        : 'Не удалось получить подтверждение сервера. Повторите попытку.';
  }

  async function load(
    section: CaseIntelligenceOperationsSection,
    options: { from?: string; to?: string } = {},
  ) {
    const scope = context.authority();
    if (!scope || !has(scope, 'project.case_intelligence.read')) {
      reset({ forgetRetained: true });
      return;
    }
    const token = ++generation.value;
    activeScope = scope;
    readAbort?.abort();
    readAbort = new AbortController();
    loading.value = true;
    accessDenied.value = false;
    error.value = '';
    try {
      const snapshot = await source.readCurrent(scope.projectId, readAbort.signal);
      if (!isCurrent(scope, token)) return;
      current.value = snapshot;
      const retainedAttempt = readRetained(scope);
      if (retainedAttempt && !canRetainAttempt(scope, retainedAttempt)) writeRetained(scope, null);
      pending.value =
        retainedAttempt && canRetainAttempt(scope, retainedAttempt) ? retainedAttempt : null;
      if (section === 'evaluation' && canManageRelease.value) {
        const [datasetPage, evaluationPage] = await Promise.all([
          source.listDatasets(scope.projectId, undefined, readAbort.signal),
          source.listEvaluations(scope.projectId, undefined, readAbort.signal),
        ]);
        if (!isCurrent(scope, token)) return;
        datasets.value = datasetPage.items;
        datasetCursor.value = datasetPage.nextCursor;
        evaluations.value = evaluationPage.items;
        evaluationCursor.value = evaluationPage.nextCursor;
      } else if (section === 'observability' && canReadCost.value) {
        const to = options.to ?? new Date().toISOString();
        const from = options.from ?? new Date(Date.now() - 30 * 86_400_000).toISOString();
        const value = await source.readObservability(scope.projectId, from, to, readAbort.signal);
        if (!isCurrent(scope, token)) return;
        observability.value = value;
      } else if (section === 'decisions' && canReadDecisions.value) {
        const page = await source.listDecisions(
          scope.projectId,
          undefined,
          undefined,
          readAbort.signal,
        );
        if (!isCurrent(scope, token)) return;
        decisions.value = page.items;
        decisionCursor.value = page.nextCursor;
      } else if (section === 'versions') {
        releases.value = snapshot.release ? [snapshot.release] : [];
        const visited = new Set(releases.value.map((item) => item.id));
        let previousId = snapshot.release?.previousReleaseRevisionId ?? null;
        while (previousId && releases.value.length < 50 && !visited.has(previousId)) {
          const previous = await source.readRelease(scope.projectId, previousId, readAbort.signal);
          if (!isCurrent(scope, token)) return;
          releases.value = [...releases.value, previous];
          visited.add(previous.id);
          previousId = previous.previousReleaseRevisionId;
        }
      }
    } catch (cause) {
      if (
        !isCurrent(scope, token) ||
        (cause instanceof DOMException && cause.name === 'AbortError')
      )
        return;
      await handleError(cause, scope);
    } finally {
      if (isCurrent(scope, token)) loading.value = false;
    }
  }

  async function selectDataset(id: string) {
    const scope = context.authority();
    if (!scope || !canManageRelease.value) return;
    const token = generation.value;
    const value = await source.readDataset(scope.projectId, id).catch(async (cause) => {
      await handleError(cause, scope);
      return null;
    });
    if (value && isCurrent(scope, token)) dataset.value = value;
  }

  async function selectEvaluation(id: string) {
    const scope = context.authority();
    if (!scope || !canManageRelease.value) return;
    const token = generation.value;
    const value = await source.readEvaluation(scope.projectId, id).catch(async (cause) => {
      await handleError(cause, scope);
      return null;
    });
    if (value && isCurrent(scope, token)) {
      const pinned = evaluations.value.find((item) => item.id === id);
      evaluation.value = pinned
        ? {
            ...value,
            detectionPolicyRevisionId: pinned.detectionPolicyRevisionId,
            escalationPolicyRevisionId: pinned.escalationPolicyRevisionId,
            safetyPolicyRevisionId: pinned.safetyPolicyRevisionId,
            modelProfileRevisionId: pinned.modelProfileRevisionId,
            calibratorRevisionId: pinned.calibratorRevisionId,
            calibrationDatasetId: pinned.calibrationDatasetId,
            routingOverlayRevisionId: pinned.routingOverlayRevisionId,
            compilerRevisionId: pinned.compilerRevisionId,
          }
        : value;
    }
  }

  async function selectDecision(id: string | null) {
    decision.value = id ? (decisions.value.find((item) => item.id === id) ?? null) : null;
    if (!id || decision.value) return;
    const scope = context.authority();
    if (!scope || !canReadDecisions.value) return;
    const token = generation.value;
    let cursor = decisionCursor.value;
    let pages = 0;
    while (cursor && pages < 20 && isCurrent(scope, token)) {
      const page = await source.listDecisions(scope.projectId, cursor).catch(async (cause) => {
        await handleError(cause, scope);
        return null;
      });
      if (!page || !isCurrent(scope, token)) return;
      decisions.value = [...decisions.value, ...page.items];
      decisionCursor.value = page.nextCursor;
      decision.value = decisions.value.find((item) => item.id === id) ?? null;
      if (decision.value) return;
      cursor = page.nextCursor;
      pages += 1;
    }
  }

  async function loadMore(kind: 'datasets' | 'evaluations' | 'decisions') {
    const scope = context.authority();
    const cursor =
      kind === 'datasets'
        ? datasetCursor.value
        : kind === 'evaluations'
          ? evaluationCursor.value
          : decisionCursor.value;
    if (!scope || !cursor || loadingMore.value) return;
    if (kind === 'decisions' && !canReadDecisions.value) return;
    if (kind !== 'decisions' && !canManageRelease.value) return;
    const token = generation.value;
    loadingMore.value = true;
    try {
      if (kind === 'datasets') {
        const page = await source.listDatasets(scope.projectId, cursor);
        if (!isCurrent(scope, token)) return;
        datasets.value = [...datasets.value, ...page.items];
        datasetCursor.value = page.nextCursor;
      } else if (kind === 'evaluations') {
        const page = await source.listEvaluations(scope.projectId, cursor);
        if (!isCurrent(scope, token)) return;
        evaluations.value = [...evaluations.value, ...page.items];
        evaluationCursor.value = page.nextCursor;
      } else {
        const page = await source.listDecisions(scope.projectId, cursor);
        if (!isCurrent(scope, token)) return;
        decisions.value = [...decisions.value, ...page.items];
        decisionCursor.value = page.nextCursor;
      }
    } catch (cause) {
      if (isCurrent(scope, token)) await handleError(cause, scope);
    } finally {
      if (isCurrent(scope, token)) loadingMore.value = false;
    }
  }

  async function explainCase(caseId: string) {
    const scope = context.authority();
    if (!scope || !canReadDecisions.value) return [];
    const token = generation.value;
    const page = await source.explainCase(scope.projectId, caseId).catch(async (cause) => {
      await handleError(cause, scope);
      return null;
    });
    return page && isCurrent(scope, token) ? page.items : [];
  }

  async function execute(attempt: CaseIntelligencePendingCommand) {
    const scope = context.authority();
    if (!scope || mutating.value) return false;
    mutationAbort = new AbortController();
    const token = generation.value;
    mutating.value = true;
    error.value = '';
    feedback.value = '';
    pending.value = attempt;
    writeRetained(scope, attempt);
    try {
      if (attempt.operation === 'RUN_EVALUATION') {
        const value = await source.runEvaluation(
          scope.projectId,
          attempt.body,
          mutationAbort.signal,
        );
        evaluation.value = {
          ...value,
          detectionPolicyRevisionId: attempt.body.detectionPolicyRevisionId,
          escalationPolicyRevisionId: attempt.body.escalationPolicyRevisionId,
          safetyPolicyRevisionId: attempt.body.safetyPolicyRevisionId,
          modelProfileRevisionId: attempt.body.modelProfileRevisionId,
          calibratorRevisionId: attempt.body.calibratorRevisionId,
          calibrationDatasetId: attempt.body.labelledDatasetRevisionId,
          routingOverlayRevisionId: attempt.body.routingOverlayRevisionId,
          compilerRevisionId: attempt.body.compilerRevisionId,
        };
      } else if (attempt.operation === 'ACTIVATE_RELEASE')
        current.value = {
          ...current.value!,
          release: await source.activateRelease(
            scope.projectId,
            attempt.body,
            mutationAbort.signal,
          ),
        };
      else if (attempt.operation === 'ROLLBACK_RELEASE')
        current.value = {
          ...current.value!,
          release: await source.rollbackRelease(
            scope.projectId,
            attempt.body,
            mutationAbort.signal,
          ),
        };
      else await source.correctDecision(scope.projectId, attempt.body, mutationAbort.signal);
      if (!isCurrent(scope, token)) return false;
      writeRetained(scope, null);
      pending.value = null;
      feedback.value =
        attempt.operation === 'RUN_EVALUATION'
          ? 'Проверка завершена. Результаты получены с сервера.'
          : attempt.operation === 'CORRECT_DECISION'
            ? 'Исправление сохранено в истории решения.'
            : 'Новая рабочая версия подтверждена сервером.';
      return true;
    } catch (cause) {
      const problem = normalizeApiError(cause);
      if (!isCurrent(scope, token)) {
        if (isTerminalAccess(problem.status, problem.code)) writeRetained(scope, null);
        return false;
      }
      if (problem.status === 409) {
        writeRetained(scope, null);
        pending.value = null;
        try {
          const snapshot = await source.readCurrent(scope.projectId, mutationAbort.signal);
          if (isCurrent(scope, token)) current.value = snapshot;
        } catch {
          // The conflict remains visible even when the authoritative reread is unavailable.
        }
        if (isCurrent(scope, token))
          error.value =
            'Данные изменились на сервере. Перечитайте актуальную версию и подтвердите действие ещё раз.';
      } else if (!isUnknown(problem.status)) await handleError(problem, scope, true);
      else
        error.value =
          'Результат команды пока неизвестен. Новые действия заблокированы; проверьте эту же команду.';
      return false;
    } finally {
      if (isCurrent(scope, token)) mutating.value = false;
    }
  }

  function runEvaluation(datasetId: string) {
    const snapshot = current.value;
    if (!snapshot?.release || !canManageRelease.value || pending.value) return;
    const body: RunCaseIntelligenceEvaluationCommand = {
      labelledDatasetRevisionId: datasetId,
      datasetRevisionId: snapshot.release.datasetRevisionId,
      detectionPolicyRevisionId:
        snapshot.detection.publishedRevisionId ?? snapshot.release.detectionPolicyRevisionId,
      escalationPolicyRevisionId:
        snapshot.escalation.publishedRevisionId ?? snapshot.release.escalationPolicyRevisionId,
      safetyPolicyRevisionId:
        snapshot.minimumSafetyRevisionId ?? snapshot.release.safetyPolicyRevisionId,
      modelProfileRevisionId:
        snapshot.detection.modelProfileRevisionId ?? snapshot.release.modelProfileRevisionId,
      calibratorRevisionId: snapshot.release.calibratorRevisionId,
      routingOverlayRevisionId:
        snapshot.escalation.routingOverlayRevisionId ?? snapshot.release.routingOverlayRevisionId,
      compilerRevisionId:
        snapshot.detection.compilerRevisionId ?? snapshot.release.compilerRevisionId,
      idempotencyKey: context.createIdempotencyKey?.() ?? crypto.randomUUID(),
    };
    return execute({ operation: 'RUN_EVALUATION', body });
  }

  function activateSelected() {
    const snapshot = current.value;
    const value = evaluation.value;
    if (
      !snapshot?.runtime ||
      !value ||
      value.pending ||
      value.status !== 'PASSED' ||
      !Object.values(value.gates).every(Boolean) ||
      !canActivate.value ||
      pending.value
    )
      return;
    const body: ActivateCaseIntelligenceReleaseCommand = {
      expectedVersion: snapshot.runtime.version,
      detectionPolicyRevisionId:
        value.detectionPolicyRevisionId || snapshot.detection.publishedRevisionId!,
      escalationPolicyRevisionId:
        value.escalationPolicyRevisionId || snapshot.escalation.publishedRevisionId!,
      safetyPolicyRevisionId: value.safetyPolicyRevisionId || snapshot.minimumSafetyRevisionId!,
      modelProfileRevisionId:
        value.modelProfileRevisionId || snapshot.detection.modelProfileRevisionId!,
      calibratorRevisionId: value.calibratorRevisionId || snapshot.release!.calibratorRevisionId,
      datasetRevisionId: value.datasetRevisionId,
      routingOverlayRevisionId:
        value.routingOverlayRevisionId || snapshot.escalation.routingOverlayRevisionId!,
      compilerRevisionId: value.compilerRevisionId || snapshot.detection.compilerRevisionId!,
      idempotencyKey: context.createIdempotencyKey?.() ?? crypto.randomUUID(),
    };
    return execute({ operation: 'ACTIVATE_RELEASE', body });
  }

  function rollback(target: CaseIntelligenceRelease, reason: string) {
    const snapshot = current.value;
    if (!snapshot?.runtime || !canRollback.value || pending.value || reason.trim().length < 3)
      return;
    const body: RollbackCaseIntelligenceReleaseCommand = {
      releaseRevisionId: target.id,
      expectedVersion: snapshot.runtime.version,
      reason: reason.trim(),
      idempotencyKey: context.createIdempotencyKey?.() ?? crypto.randomUUID(),
    };
    return execute({ operation: 'ROLLBACK_RELEASE', body });
  }

  function correct(body: Omit<CorrectCaseIntelligenceDecisionCommand, 'idempotencyKey'>) {
    if (!canCorrect.value || pending.value) return;
    return execute({
      operation: 'CORRECT_DECISION',
      body: { ...body, idempotencyKey: context.createIdempotencyKey?.() ?? crypto.randomUUID() },
    });
  }

  async function reconcilePending() {
    const scope = context.authority();
    const attempt = pending.value;
    if (!scope || !attempt) return;
    try {
      const outcome = await source.lookupCommand(scope.projectId, attempt.body.idempotencyKey);
      const expectedKind =
        attempt.operation === 'RUN_EVALUATION'
          ? 'EVALUATION_REPORT'
          : attempt.operation === 'CORRECT_DECISION'
            ? 'CORRECTION'
            : 'RELEASE';
      const expectedOperation =
        attempt.operation === 'RUN_EVALUATION'
          ? 'RUN_CASE_INTELLIGENCE_EVALUATION'
          : attempt.operation;
      if (outcome.pending) {
        error.value =
          'Сервер всё ещё выполняет эту команду. Новые изменения остаются заблокированными.';
        return;
      }
      if (outcome.operation !== expectedOperation || outcome.resultKind !== expectedKind) {
        error.value =
          'Ответ сервера не совпал с сохранённой командой. Изменения заблокированы до ручной сверки.';
        return;
      }
      writeRetained(scope, null);
      pending.value = null;
      feedback.value = 'Сервер подтвердил исход команды. Данные перечитаны.';
      await load('evaluation');
    } catch (cause) {
      const problem = normalizeApiError(cause);
      if (problem.status === 404)
        error.value = 'Сервер ещё не подтвердил исход. Новая команда остаётся заблокированной.';
      else await handleError(problem, scope);
    }
  }

  return {
    current,
    datasets,
    dataset,
    evaluations,
    evaluation,
    observability,
    decisions,
    decision,
    releases,
    loading,
    loadingMore,
    mutating,
    accessDenied,
    error,
    feedback,
    pending,
    datasetCursor,
    evaluationCursor,
    decisionCursor,
    canRead,
    canManageRelease,
    canReadCost,
    canReadDecisions,
    canReviewLabels,
    canActivate,
    canRollback,
    canCorrect,
    load,
    loadMore,
    reset,
    selectDataset,
    selectEvaluation,
    selectDecision,
    explainCase,
    runEvaluation,
    activateSelected,
    rollback,
    correct,
    reconcilePending,
  };
}
