import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api/http/api-error';
import type { SupportCaseIntelligenceOperationsSource } from '../api/support-case-intelligence-operations-source';
import type {
  CaseIntelligenceDecision,
  CaseIntelligenceEvaluationReport,
  CaseIntelligenceOperationsCurrent,
} from './support-case-intelligence-operations-domain';
import {
  type CaseIntelligenceOperationsAuthority,
  useSupportCaseIntelligenceOperations,
} from './use-support-case-intelligence-operations';

const release = {
  id: 'release-2',
  version: 2,
  status: 'LIVE',
  detectionPolicyRevisionId: 'detection-2',
  escalationPolicyRevisionId: 'escalation-2',
  safetyPolicyRevisionId: 'safety-2',
  modelProfileRevisionId: 'model-2',
  calibratorRevisionId: 'calibrator-2',
  datasetRevisionId: 'runtime-dataset-2',
  routingOverlayRevisionId: 'routing-2',
  compilerRevisionId: 'compiler-2',
  previousReleaseRevisionId: 'release-1',
  admissionReceiptId: 'receipt-2',
  createdAt: '2026-08-10T00:00:00.000Z',
  activatedAt: '2026-08-10T00:00:00.000Z',
};
const current: CaseIntelligenceOperationsCurrent = {
  allowedActions: ['ACTIVATE', 'ROLLBACK', 'CORRECT_DECISION'],
  runtime: {
    status: 'LIVE',
    version: 2,
    currentReleaseRevisionId: release.id,
    updatedAt: release.activatedAt,
  },
  release,
  minimumSafetyRevisionId: 'safety-2',
  safetyState: 'READY',
  safetyAuthority: 'PLATFORM',
  safetyAssistantReleaseGate: 'OPEN',
  safetyProjectOverrideAllowed: false,
  reconciledSafetyRevisionId: 'safety-2',
  releaseSafetyRevisionId: 'safety-2',
  detection: {
    publishedRevisionId: 'detection-3',
    publishedVersion: 3,
    compilerRevisionId: 'compiler-2',
    modelProfileRevisionId: 'model-2',
  },
  escalation: {
    publishedRevisionId: 'escalation-3',
    publishedVersion: 3,
    compilerRevisionId: 'compiler-2',
    routingOverlayRevisionId: 'routing-2',
  },
};
const evaluation: CaseIntelligenceEvaluationReport = {
  id: 'evaluation-3',
  version: 3,
  status: 'PASSED',
  gates: { security: true, quality: true, calibration: true, cost: true, capacity: true },
  datasetRevisionId: 'labels-3',
  detectionPolicyRevisionId: 'detection-3',
  escalationPolicyRevisionId: 'escalation-3',
  safetyPolicyRevisionId: 'safety-2',
  modelProfileRevisionId: 'model-2',
  calibratorRevisionId: 'calibrator-2',
  calibrationDatasetId: 'labels-3',
  routingOverlayRevisionId: 'routing-2',
  compilerRevisionId: 'compiler-2',
  publishedReleaseRevisionId: release.id,
  candidateFingerprint: 'a'.repeat(64),
  createdAt: '2026-08-11T00:00:00.000Z',
  pending: false,
  failureCode: null,
  sampleCount: 100,
  reviewedSampleCount: 100,
  candidate: null,
  published: null,
  coverage: null,
  calibration: [],
  safety: [],
  observations: [],
  confusion: [],
  cost: null,
  latency: null,
  queueImpact: null,
};
const decision: CaseIntelligenceDecision = {
  id: 'decision-1',
  caseId: 'case-1',
  conversationId: 'conversation-1',
  signalId: 'signal-1',
  decidedAt: '2026-08-11T00:00:00.000Z',
  conversationClass: 'ISSUE',
  caseDecision: 'CREATE',
  reviewDisposition: 'REVIEW',
  handoffAction: 'NONE',
  safetyDecision: 'CLEAR',
  detectionState: 'DETECTED',
  escalationState: 'IDLE',
  safetyState: 'CLEAR',
  assistantReleaseGate: 'OPEN',
  confidence: '0.9',
  reasonCodes: ['RULE_MATCH'],
  matchedRuleCodes: ['PAYMENT'],
  evidenceRefs: [],
  releaseRevisionId: release.id,
  detectionPolicyRevisionId: 'detection-2',
  escalationPolicyRevisionId: 'escalation-2',
  safetyPolicyRevisionId: 'safety-2',
  modelProfileRevisionId: 'model-2',
  calibratorRevisionId: 'calibrator-2',
  datasetRevisionId: 'runtime-dataset-2',
  routingOverlayRevisionId: 'routing-2',
  compilerRevisionId: 'compiler-2',
  legacyUnpinned: false,
  corrections: [],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function fakeSource(): SupportCaseIntelligenceOperationsSource {
  return {
    readCurrent: vi.fn(async () => structuredClone(current)),
    listDatasets: vi.fn(async () => ({
      items: [
        {
          id: 'labels-3',
          version: 3,
          status: 'PUBLISHED',
          name: 'Набор',
          description: 'Проверенные примеры',
          sampleCount: 100,
          createdAt: '2026-08-10T00:00:00.000Z',
        },
      ],
      nextCursor: null,
    })),
    readDataset: vi.fn(async () => ({
      id: 'labels-3',
      version: 3,
      status: 'PUBLISHED',
      name: 'Набор',
      description: 'Проверенные примеры',
      sampleCount: 100,
      createdAt: '2026-08-10T00:00:00.000Z',
      locales: [],
      channels: [],
      classes: [],
      risks: [],
      suiteRoles: [],
    })),
    listEvaluations: vi.fn(async () => ({
      items: [structuredClone(evaluation)],
      nextCursor: null,
    })),
    readEvaluation: vi.fn(async () => structuredClone(evaluation)),
    runEvaluation: vi.fn(async () => structuredClone(evaluation)),
    readObservability: vi.fn(),
    listDecisions: vi.fn(async () => ({ items: [structuredClone(decision)], nextCursor: null })),
    explainCase: vi.fn(async () => ({ items: [structuredClone(decision)], nextCursor: null })),
    correctDecision: vi.fn(async () => ({
      id: 'correction-1',
      reasonCode: 'REVIEW',
      notes: null,
      createdAt: '2026-08-11T00:00:00.000Z',
      createdByCmsUserId: 'actor-1',
      outputs: null,
    })),
    readRelease: vi.fn(async (_projectId, id) => ({ ...release, id, status: 'SUPERSEDED' })),
    activateRelease: vi.fn(async (_projectId, body) => ({
      ...release,
      id: 'release-3',
      version: body.expectedVersion + 1,
    })),
    rollbackRelease: vi.fn(async (_projectId, body) => ({
      ...release,
      id: 'release-3',
      version: body.expectedVersion + 1,
    })),
    lookupCommand: vi.fn(async () => ({
      operation: 'RUN_CASE_INTELLIGENCE_EVALUATION',
      resultKind: 'EVALUATION_REPORT',
      pending: false,
    })),
  };
}

const fullPermissions = [
  'project.case_intelligence.read',
  'project.case_intelligence.release.manage',
  'project.case_intelligence.cost.read',
  'project.case_intelligence.decisions.read',
  'project.case_intelligence.labels.review',
];

describe('useSupportCaseIntelligenceOperations', () => {
  beforeEach(() => window.sessionStorage.clear());

  it('loads only the authority-owned evaluation surface and keeps server cursors', async () => {
    const source = fakeSource();
    let scope: CaseIntelligenceOperationsAuthority | null = {
      actorId: 'actor-1',
      projectId: 'project-1',
      permissions: fullPermissions,
    };
    const controller = useSupportCaseIntelligenceOperations({ authority: () => scope, source });
    await controller.load('evaluation');
    expect(controller.datasets.value).toHaveLength(1);
    expect(controller.evaluations.value[0]?.id).toBe('evaluation-3');
    expect(controller.current.value).toMatchObject({
      safetyState: 'READY',
      safetyAuthority: 'PLATFORM',
      safetyProjectOverrideAllowed: false,
    });
    expect(source.readObservability).not.toHaveBeenCalled();
    scope = null;
    controller.reset({ forgetRetained: true });
    expect(controller.datasets.value).toEqual([]);
  });

  it('consumes opaque cursors without replacing server-ordered history', async () => {
    const source = fakeSource();
    vi.mocked(source.listEvaluations)
      .mockResolvedValueOnce({ items: [structuredClone(evaluation)], nextCursor: 'opaque-next' })
      .mockResolvedValueOnce({
        items: [{ ...evaluation, id: 'evaluation-2', version: 2 }],
        nextCursor: null,
      });
    const controller = useSupportCaseIntelligenceOperations({
      authority: () => ({
        actorId: 'actor-1',
        projectId: 'project-1',
        permissions: fullPermissions,
      }),
      source,
    });
    await controller.load('evaluation');
    await controller.loadMore('evaluations');
    expect(source.listEvaluations).toHaveBeenLastCalledWith('project-1', 'opaque-next');
    expect(controller.evaluations.value.map((item) => item.id)).toEqual([
      'evaluation-3',
      'evaluation-2',
    ]);
    expect(controller.evaluationCursor.value).toBeNull();
  });

  it('walks the immutable release chain until the server history ends', async () => {
    const source = fakeSource();
    vi.mocked(source.readRelease)
      .mockResolvedValueOnce({
        ...release,
        id: 'release-1',
        version: 1,
        previousReleaseRevisionId: 'release-0',
        status: 'SUPERSEDED',
      })
      .mockResolvedValueOnce({
        ...release,
        id: 'release-0',
        version: 0,
        previousReleaseRevisionId: null,
        status: 'SUPERSEDED',
      });
    const controller = useSupportCaseIntelligenceOperations({
      authority: () => ({
        actorId: 'actor-1',
        projectId: 'project-1',
        permissions: fullPermissions,
      }),
      source,
    });
    await controller.load('versions');
    expect(controller.releases.value.map((item) => item.id)).toEqual([
      'release-2',
      'release-1',
      'release-0',
    ]);
  });

  it('discards a late old-project read before it can publish protected state', async () => {
    const first = deferred<CaseIntelligenceOperationsCurrent>();
    const source = fakeSource();
    vi.mocked(source.readCurrent)
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce(structuredClone(current));
    let scope = { actorId: 'actor-1', projectId: 'project-a', permissions: fullPermissions };
    const controller = useSupportCaseIntelligenceOperations({ authority: () => scope, source });
    const oldLoad = controller.load('evaluation');
    scope = { ...scope, projectId: 'project-b' };
    await controller.load('versions');
    first.resolve({ ...current, release: { ...release, id: 'old-project-release' } });
    await oldLoad;
    expect(controller.current.value?.release?.id).toBe(release.id);
  });

  it('keeps an unknown exact command and blocks a fresh evaluation until lookup', async () => {
    const source = fakeSource();
    vi.mocked(source.runEvaluation).mockRejectedValueOnce(new ApiError(503, 'Сервис недоступен'));
    const controller = useSupportCaseIntelligenceOperations({
      authority: () => ({
        actorId: 'actor-1',
        projectId: 'project-1',
        permissions: fullPermissions,
      }),
      source,
      createIdempotencyKey: () => 'case-intelligence-command-123',
    });
    await controller.load('evaluation');
    await controller.runEvaluation('labels-3');
    expect(controller.pending.value?.body.idempotencyKey).toBe('case-intelligence-command-123');
    await controller.runEvaluation('labels-3');
    expect(source.runEvaluation).toHaveBeenCalledTimes(1);
    vi.mocked(source.lookupCommand).mockResolvedValueOnce({
      operation: 'RUN_CASE_INTELLIGENCE_EVALUATION',
      resultKind: 'EVALUATION_REPORT',
      pending: true,
    });
    await controller.reconcilePending();
    expect(controller.pending.value).not.toBeNull();
    await controller.reconcilePending();
    expect(source.lookupCommand).toHaveBeenCalledWith('project-1', 'case-intelligence-command-123');
    expect(controller.pending.value).toBeNull();
  });

  it('activates only a PASSED report with every admission gate', async () => {
    const source = fakeSource();
    const controller = useSupportCaseIntelligenceOperations({
      authority: () => ({
        actorId: 'actor-1',
        projectId: 'project-1',
        permissions: fullPermissions,
      }),
      source,
      createIdempotencyKey: () => 'activate-release-123',
    });
    await controller.load('evaluation');
    await controller.selectEvaluation('evaluation-3');
    await controller.activateSelected();
    expect(source.activateRelease).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({
        expectedVersion: 2,
        detectionPolicyRevisionId: 'detection-3',
        idempotencyKey: 'activate-release-123',
      }),
      expect.any(AbortSignal),
    );
    controller.evaluation.value = {
      ...evaluation,
      gates: { ...evaluation.gates, security: false },
    };
    await controller.activateSelected();
    expect(source.activateRelease).toHaveBeenCalledTimes(1);
  });

  it('rereads authoritative state after a version conflict and requires fresh confirmation', async () => {
    const source = fakeSource();
    vi.mocked(source.runEvaluation).mockRejectedValueOnce(new ApiError(409, 'Версия изменилась'));
    vi.mocked(source.readCurrent)
      .mockResolvedValueOnce(structuredClone(current))
      .mockResolvedValueOnce({
        ...structuredClone(current),
        runtime: { ...current.runtime!, version: 3 },
      });
    const controller = useSupportCaseIntelligenceOperations({
      authority: () => ({
        actorId: 'actor-1',
        projectId: 'project-1',
        permissions: fullPermissions,
      }),
      source,
    });
    await controller.load('evaluation');
    expect(await controller.runEvaluation('labels-3')).toBe(false);
    expect(controller.pending.value).toBeNull();
    expect(controller.current.value?.runtime?.version).toBe(3);
    expect(controller.error.value).toContain('подтвердите действие ещё раз');
  });

  it('purges the decision log synchronously when read authority disappears', async () => {
    const source = fakeSource();
    let permissions = [...fullPermissions];
    const controller = useSupportCaseIntelligenceOperations({
      authority: () => ({ actorId: 'actor-1', projectId: 'project-1', permissions }),
      source,
    });
    await controller.load('decisions');
    expect(controller.decisions.value).toHaveLength(1);
    permissions = permissions.filter(
      (permission) => permission !== 'project.case_intelligence.read',
    );
    await controller.load('decisions');
    expect(controller.decisions.value).toEqual([]);
  });
});
