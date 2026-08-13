import {
  caseIntelligenceActivateRelease,
  caseIntelligenceCorrectDecision,
  caseIntelligenceCurrent,
  caseIntelligenceEvaluation,
  caseIntelligenceEvaluationDataset,
  caseIntelligenceEvaluationDatasets,
  caseIntelligenceEvaluationsHistory,
  caseIntelligenceExplainCase,
  caseIntelligenceGetRelease,
  caseIntelligenceListDecisions,
  caseIntelligenceLookupCommand,
  caseIntelligenceObservability,
  caseIntelligenceRollbackRelease,
  caseIntelligenceRunEvaluation,
} from '@/shared/api/generated/retenive-backend';
import type {
  CaseIntelligenceCorrectionResponseDto,
  CaseIntelligenceCurrentResponseDto,
  CaseIntelligenceCorrectedOutputsDto,
  CaseIntelligenceDecisionLogItemDto,
  CaseIntelligenceEvaluationHistoryItemResponseDto,
  CaseIntelligenceEvaluationReportResponseDto,
  CaseIntelligenceEvaluationSideResponseDto,
  CaseIntelligenceLabelledDatasetResponseDto,
  CaseIntelligenceLabelledDatasetSummaryResponseDto,
  CaseIntelligenceObservabilityResponseDto,
  CaseIntelligenceReleaseRevisionResponseDto,
} from '@/shared/api/generated/models';
import { ApiError, normalizeApiError } from '@/shared/api/http/api-error';
import { noAuthRetryRequestOptions } from '@/shared/api/http/axios-instance';
import { isMockMode } from '@/shared/config/data-mode';
import type {
  ActivateCaseIntelligenceReleaseCommand,
  CaseIntelligenceCommandOutcome,
  CaseIntelligenceCorrection,
  CaseIntelligenceDatasetDetail,
  CaseIntelligenceDatasetDistributionItem,
  CaseIntelligenceDatasetSummary,
  CaseIntelligenceDecision,
  CaseIntelligenceEvaluationHistoryItem,
  CaseIntelligenceEvaluationReport,
  CaseIntelligenceEvaluationSide,
  CaseIntelligenceObservability,
  CaseIntelligenceOperationsCurrent,
  CaseIntelligencePage,
  CaseIntelligenceRelease,
  CorrectCaseIntelligenceDecisionCommand,
  RollbackCaseIntelligenceReleaseCommand,
  RunCaseIntelligenceEvaluationCommand,
} from '../model/support-case-intelligence-operations-domain';

export interface SupportCaseIntelligenceOperationsSource {
  readCurrent(projectId: string, signal?: AbortSignal): Promise<CaseIntelligenceOperationsCurrent>;
  listDatasets(
    projectId: string,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<CaseIntelligencePage<CaseIntelligenceDatasetSummary>>;
  readDataset(
    projectId: string,
    id: string,
    signal?: AbortSignal,
  ): Promise<CaseIntelligenceDatasetDetail>;
  listEvaluations(
    projectId: string,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<CaseIntelligencePage<CaseIntelligenceEvaluationHistoryItem>>;
  readEvaluation(
    projectId: string,
    id: string,
    signal?: AbortSignal,
  ): Promise<CaseIntelligenceEvaluationReport>;
  runEvaluation(
    projectId: string,
    command: RunCaseIntelligenceEvaluationCommand,
    signal?: AbortSignal,
  ): Promise<CaseIntelligenceEvaluationReport>;
  readObservability(
    projectId: string,
    from: string,
    to: string,
    signal?: AbortSignal,
  ): Promise<CaseIntelligenceObservability>;
  listDecisions(
    projectId: string,
    cursor?: string,
    caseId?: string,
    signal?: AbortSignal,
  ): Promise<CaseIntelligencePage<CaseIntelligenceDecision>>;
  explainCase(
    projectId: string,
    caseId: string,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<CaseIntelligencePage<CaseIntelligenceDecision>>;
  correctDecision(
    projectId: string,
    command: CorrectCaseIntelligenceDecisionCommand,
    signal?: AbortSignal,
  ): Promise<CaseIntelligenceCorrection>;
  readRelease(
    projectId: string,
    id: string,
    signal?: AbortSignal,
  ): Promise<CaseIntelligenceRelease>;
  activateRelease(
    projectId: string,
    command: ActivateCaseIntelligenceReleaseCommand,
    signal?: AbortSignal,
  ): Promise<CaseIntelligenceRelease>;
  rollbackRelease(
    projectId: string,
    command: RollbackCaseIntelligenceReleaseCommand,
    signal?: AbortSignal,
  ): Promise<CaseIntelligenceRelease>;
  lookupCommand(
    projectId: string,
    key: string,
    signal?: AbortSignal,
  ): Promise<CaseIntelligenceCommandOutcome>;
}

const readOptions = (signal?: AbortSignal) => (signal ? { signal } : undefined);
const commandOptions = (signal?: AbortSignal) => ({
  ...noAuthRetryRequestOptions(),
  ...(signal ? { signal } : {}),
});

function release(dto: CaseIntelligenceReleaseRevisionResponseDto): CaseIntelligenceRelease {
  return {
    id: dto.id,
    version: dto.version,
    status: dto.status,
    detectionPolicyRevisionId: dto.detectionPolicyRevisionId,
    escalationPolicyRevisionId: dto.escalationPolicyRevisionId,
    safetyPolicyRevisionId: dto.safetyPolicyRevisionId,
    modelProfileRevisionId: dto.modelProfileRevisionId,
    calibratorRevisionId: dto.calibratorRevisionId,
    datasetRevisionId: dto.datasetRevisionId,
    routingOverlayRevisionId: dto.routingOverlayRevisionId,
    compilerRevisionId: dto.compilerRevisionId,
    previousReleaseRevisionId: dto.previousReleaseRevisionId ?? null,
    admissionReceiptId: dto.admissionReceiptId,
    createdAt: dto.createdAt,
    activatedAt: dto.activatedAt ?? null,
  };
}

function current(dto: CaseIntelligenceCurrentResponseDto): CaseIntelligenceOperationsCurrent {
  const detection = dto.detection?.published;
  const escalation = dto.escalation?.published;
  return {
    allowedActions: [...dto.allowedActions],
    runtime: dto.runtime
      ? {
          status: dto.runtime.status,
          version: dto.runtime.version,
          currentReleaseRevisionId: dto.runtime.currentReleaseRevisionId,
          updatedAt: dto.runtime.updatedAt ?? null,
        }
      : null,
    release: dto.release ? release(dto.release) : null,
    minimumSafetyRevisionId: dto.minimumSafetyRevisionId ?? null,
    safetyState: dto.safety.state,
    safetyAuthority: dto.safety.authority,
    safetyAssistantReleaseGate: dto.safety.assistantReleaseGate,
    safetyProjectOverrideAllowed: dto.safety.projectOverrideAllowed,
    reconciledSafetyRevisionId: dto.safety.reconciledSafetyRevisionId ?? null,
    releaseSafetyRevisionId: dto.safety.releaseSafetyRevisionId ?? null,
    detection: {
      publishedRevisionId: detection?.id ?? null,
      publishedVersion: detection?.version ?? null,
      compilerRevisionId: detection?.compilerRevisionId ?? null,
      modelProfileRevisionId: detection?.definition.modelProfileRevisionId ?? null,
    },
    escalation: {
      publishedRevisionId: escalation?.id ?? null,
      publishedVersion: escalation?.version ?? null,
      compilerRevisionId: escalation?.compilerRevisionId ?? null,
      routingOverlayRevisionId: escalation?.definition.routingPolicyRevisionId ?? null,
    },
  };
}

function datasetSummary(
  dto: CaseIntelligenceLabelledDatasetSummaryResponseDto,
): CaseIntelligenceDatasetSummary {
  return {
    id: dto.id,
    version: dto.version,
    status: dto.status,
    name: dto.name,
    description: dto.description,
    sampleCount: dto.sampleCount,
    createdAt: dto.createdAt,
  };
}

function distribution(values: string[]): CaseIntelligenceDatasetDistributionItem[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].map(([code, count]) => ({ code, count }));
}

function datasetDetail(
  dto: CaseIntelligenceLabelledDatasetResponseDto,
): CaseIntelligenceDatasetDetail {
  return {
    ...datasetSummary(dto),
    locales: distribution(dto.examples.map((item) => item.locale)),
    channels: distribution(dto.examples.map((item) => item.channel)),
    classes: distribution(dto.examples.map((item) => item.expectedConversationClass)),
    risks: distribution(dto.examples.map((item) => item.riskClass)),
    suiteRoles: distribution(dto.examples.map((item) => item.suiteRole)),
  };
}

function gates(dto: {
  security: boolean;
  quality: boolean;
  calibration: boolean;
  cost: boolean;
  capacity: boolean;
}) {
  return {
    security: dto.security,
    quality: dto.quality,
    calibration: dto.calibration,
    cost: dto.cost,
    capacity: dto.capacity,
  };
}

function history(
  dto: CaseIntelligenceEvaluationHistoryItemResponseDto,
): CaseIntelligenceEvaluationHistoryItem {
  return {
    id: dto.id,
    version: dto.version,
    status: dto.status,
    gates: gates(dto.gates),
    datasetRevisionId: dto.datasetRevisionId,
    detectionPolicyRevisionId: dto.detectionPolicyRevisionId,
    escalationPolicyRevisionId: dto.escalationPolicyRevisionId,
    safetyPolicyRevisionId: dto.safetyPolicyRevisionId,
    modelProfileRevisionId: dto.modelProfileRevisionId,
    calibratorRevisionId: dto.calibratorRevisionId,
    calibrationDatasetId: dto.calibrationDatasetId,
    routingOverlayRevisionId: dto.routingOverlayRevisionId,
    compilerRevisionId: dto.compilerRevisionId,
    publishedReleaseRevisionId: dto.publishedReleaseRevisionId ?? null,
    candidateFingerprint: dto.candidateFingerprint,
    createdAt: dto.createdAt,
  };
}

function side(dto: CaseIntelligenceEvaluationSideResponseDto): CaseIntelligenceEvaluationSide {
  return {
    accuracy: dto.accuracy,
    macroPrecision: dto.macroPrecision,
    macroRecall: dto.macroRecall,
    macroF1: dto.macroF1,
    conversationClassMacroF1: dto.conversationClassMacroF1,
    criticalRecall: dto.criticalRecall ?? null,
    corrections: dto.corrections,
    crossTopicContamination: dto.crossTopicContamination,
    attachReopenAccuracy: dto.attachReopen.accuracy ?? null,
    handoffPrecision: dto.handoff.precision ?? null,
    handoffRecall: dto.handoff.recall ?? null,
    classes: dto.classes.map((item) => ({
      code: item.code,
      precision: item.precision ?? null,
      recall: item.recall ?? null,
      f1: item.f1 ?? null,
      truePositive: item.truePositive,
      falsePositive: item.falsePositive,
      falseNegative: item.falseNegative,
    })),
  };
}

function report(
  dto: CaseIntelligenceEvaluationReportResponseDto,
): CaseIntelligenceEvaluationReport {
  const body = dto.report ?? null;
  return {
    id: dto.id,
    version: dto.version,
    status: dto.status,
    gates: {
      security: dto.securityGatePassed,
      quality: dto.qualityGatePassed,
      calibration: dto.calibrationGatePassed,
      cost: dto.costGatePassed,
      capacity: dto.capacityGatePassed,
    },
    datasetRevisionId: dto.datasetRevisionId,
    detectionPolicyRevisionId: '',
    escalationPolicyRevisionId: '',
    safetyPolicyRevisionId: '',
    modelProfileRevisionId: '',
    calibratorRevisionId: '',
    calibrationDatasetId: dto.datasetRevisionId,
    routingOverlayRevisionId: '',
    compilerRevisionId: '',
    publishedReleaseRevisionId: dto.publishedReleaseRevisionId ?? null,
    candidateFingerprint: dto.candidateFingerprint,
    createdAt: dto.createdAt,
    pending: dto.status === 'PENDING' || dto.status === 'PROCESSING',
    failureCode: dto.lastErrorCode ?? body?.failure?.code ?? null,
    sampleCount: body?.sampleCount ?? 0,
    reviewedSampleCount: body?.reviewedSampleCount ?? 0,
    candidate: body ? side(body.candidate) : null,
    published: body ? side(body.published) : null,
    coverage: body
      ? {
          dataset: body.coverage.datasetCoveragePassed,
          semantic: body.coverage.semanticCoveragePassed,
          safety: body.coverage.safetyCoveragePassed,
          fallback: body.coverage.fallbackQualityPassed,
          routing: body.coverage.escalationRoutingGatePassed,
          executionMode: body.coverage.executionMode,
        }
      : null,
    calibration: (body?.calibration ?? []).map((item) => ({
      key: `${item.modelId}:${item.locale}:${item.channel}:${item.caseDecision}`,
      locale: item.locale,
      channel: item.channel,
      caseDecision: item.caseDecision,
      modelId: item.modelId,
      coverage: item.coverage,
      samples: item.samples,
      threshold: item.autoApplyThreshold,
      interval: item.confidenceInterval
        ? { low: item.confidenceInterval.lower, high: item.confidenceInterval.upper }
        : null,
    })),
    safety: (body?.strata ?? [])
      .filter((item) => item.riskClass !== 'NONE')
      .map((item) => ({
        key: item.key,
        riskClass: item.riskClass,
        locale: item.locale,
        channel: item.channel,
        suiteRole: item.suiteRole,
        sampleCount: item.sampleCount,
        criticalRecall: item.criticalRecall ?? null,
        falseNegatives: item.safetyFalseNegatives,
        passed: item.safetyFalseNegatives === 0,
      })),
    observations: (body?.observations ?? []).map((item) => ({
      id: item.id,
      locale: item.locale,
      channel: item.channel,
      suiteRole: item.suiteRole,
      riskClass: item.riskClass,
      topicCode: item.topicCode ?? null,
      expectedCaseDecision: item.expectedCaseDecision,
      candidateCaseDecision: item.candidateCaseDecision,
      publishedCaseDecision: item.publishedCaseDecision,
      expectedHandoff: item.expectedHandoff,
      candidateHandoff: item.candidateHandoff,
      publishedHandoff: item.publishedHandoff,
      expectedSafety: item.expectedSafety,
      candidateSafety: item.candidateSafety ?? null,
      publishedSafety: item.publishedSafety ?? null,
      corrected: item.corrected,
      reviewed: item.reviewed,
    })),
    confusion: (body?.confusion ?? []).map((item) => ({
      expected: item.expected,
      actual: item.actual,
      count: item.count,
    })),
    cost: body
      ? {
          inputTokens: body.cost.inputTokens,
          outputTokens: body.cost.outputTokens,
          cachedInputTokens: body.cost.cachedInputTokens,
          cacheWriteInputTokens: body.cost.cacheWriteInputTokens,
          billedMicroUsd: body.cost.billedMicroUsd ?? null,
          perThousandSignalsMicroUsd: body.cost.costPerThousandSignalsMicroUsd ?? null,
          perAcceptedCaseMicroUsd: body.cost.costPerAcceptedCaseMicroUsd ?? null,
        }
      : null,
    latency: body ? { totalMs: body.latency.totalMs, averageMs: body.latency.averageMs } : null,
    queueImpact: body ? { ...body.queueImpact } : null,
  };
}

function correction(dto: CaseIntelligenceCorrectionResponseDto): CaseIntelligenceCorrection {
  return {
    id: dto.id,
    reasonCode: dto.reasonCode,
    notes: dto.notes ?? null,
    createdAt: dto.createdAt,
    createdByCmsUserId: dto.createdByCmsUserId ?? null,
    outputs: dto.correctedOutputs ? { ...dto.correctedOutputs } : null,
  };
}

function decision(dto: CaseIntelligenceDecisionLogItemDto): CaseIntelligenceDecision {
  return {
    id: dto.id,
    caseId: dto.caseId ?? null,
    conversationId: dto.conversationId ?? null,
    signalId: dto.signalId,
    decidedAt: dto.decidedAt,
    conversationClass: dto.conversationClass ?? null,
    caseDecision: dto.caseDecision,
    reviewDisposition: dto.reviewDisposition ?? null,
    handoffAction: dto.handoffAction ?? null,
    safetyDecision: dto.safetyDecision ?? null,
    detectionState: dto.detectionState,
    escalationState: dto.escalationState,
    safetyState: dto.safetyState,
    assistantReleaseGate: dto.assistantReleaseGate,
    confidence: dto.confidence ?? null,
    reasonCodes: [...dto.reasonCodes],
    matchedRuleCodes: [...dto.matchedRuleCodes],
    evidenceRefs: dto.evidenceRefs.map((item) => ({ id: item.id, kind: item.kind })),
    releaseRevisionId: dto.releaseRevisionId ?? null,
    detectionPolicyRevisionId: dto.detectionPolicyRevisionId ?? null,
    escalationPolicyRevisionId: dto.escalationPolicyRevisionId ?? null,
    safetyPolicyRevisionId: dto.safetyPolicyRevisionId ?? null,
    modelProfileRevisionId: dto.modelProfileRevisionId ?? null,
    calibratorRevisionId: dto.calibratorRevisionId ?? null,
    datasetRevisionId: dto.datasetRevisionId ?? null,
    routingOverlayRevisionId: dto.routingOverlayRevisionId ?? null,
    compilerRevisionId: dto.compilerRevisionId ?? null,
    legacyUnpinned: dto.legacyUnpinned,
    corrections: dto.corrections.map(correction),
  };
}

function observability(
  dto: CaseIntelligenceObservabilityResponseDto,
): CaseIntelligenceObservability {
  return {
    from: dto.from,
    to: dto.to,
    completeThrough: dto.completeThrough,
    timezone: dto.timezone,
    definitionsRevision: dto.definitionsRevision,
    mixedRevisions: dto.authority.mixedRevisions,
    truncated: dto.authority.truncated,
    releaseRevisionIds: [...dto.authority.releaseRevisionIds],
    suppressionRules: [...dto.authority.suppressionRules],
    funnel: dto.funnel.map((item) => ({
      code: item.code,
      numerator: item.numerator,
      denominator: item.denominator ?? null,
      rate: item.rate ?? null,
    })),
    cost: {
      inputTokens: dto.cost.inputTokens,
      outputTokens: dto.cost.outputTokens,
      cachedInputTokens: dto.cost.cachedInputTokens,
      cacheWriteInputTokens: dto.cost.cacheWriteInputTokens,
      billedMicroUsd: dto.cost.billedMicroUsd ?? null,
      perThousandSignalsMicroUsd: dto.cost.costPerThousandSignalsMicroUsd ?? null,
      perCaseMicroUsd: dto.cost.costPerCaseMicroUsd ?? null,
      perEscalationMicroUsd: dto.cost.costPerEscalationMicroUsd ?? null,
      perResolutionMicroUsd: dto.cost.costPerResolutionMicroUsd ?? null,
      completeness: dto.cost.completeness,
    },
  };
}

function wrap<T>(operation: () => Promise<T>): Promise<T> {
  return operation().catch((cause) => {
    throw normalizeApiError(cause);
  });
}

export const apiSupportCaseIntelligenceOperationsSource: SupportCaseIntelligenceOperationsSource = {
  readCurrent: (projectId, signal) =>
    wrap(async () => current(await caseIntelligenceCurrent(projectId, readOptions(signal)))),
  listDatasets: (projectId, cursor, signal) =>
    wrap(async () => {
      const dto = await caseIntelligenceEvaluationDatasets(
        projectId,
        { limit: 30, ...(cursor ? { cursor } : {}) },
        readOptions(signal),
      );
      return { items: dto.items.map(datasetSummary), nextCursor: dto.nextCursor ?? null };
    }),
  readDataset: (projectId, id, signal) =>
    wrap(async () =>
      datasetDetail(await caseIntelligenceEvaluationDataset(projectId, id, readOptions(signal))),
    ),
  listEvaluations: (projectId, cursor, signal) =>
    wrap(async () => {
      const dto = await caseIntelligenceEvaluationsHistory(
        projectId,
        { limit: 30, ...(cursor ? { cursor } : {}) },
        readOptions(signal),
      );
      return { items: dto.items.map(history), nextCursor: dto.nextCursor ?? null };
    }),
  readEvaluation: (projectId, id, signal) =>
    wrap(async () => report(await caseIntelligenceEvaluation(projectId, id, readOptions(signal)))),
  runEvaluation: (projectId, body, signal) =>
    wrap(async () =>
      report(await caseIntelligenceRunEvaluation(projectId, body, commandOptions(signal))),
    ),
  readObservability: (projectId, from, to, signal) =>
    wrap(async () =>
      observability(
        await caseIntelligenceObservability(projectId, { from, to }, readOptions(signal)),
      ),
    ),
  listDecisions: (projectId, cursor, caseId, signal) =>
    wrap(async () => {
      const dto = await caseIntelligenceListDecisions(
        projectId,
        { limit: 40, ...(cursor ? { cursor } : {}), ...(caseId ? { caseId } : {}) },
        readOptions(signal),
      );
      return { items: dto.items.map(decision), nextCursor: dto.nextCursor ?? null };
    }),
  explainCase: (projectId, caseId, cursor, signal) =>
    wrap(async () => {
      const dto = await caseIntelligenceExplainCase(
        projectId,
        caseId,
        { limit: 40, ...(cursor ? { cursor } : {}) },
        readOptions(signal),
      );
      return { items: dto.items.map(decision), nextCursor: dto.nextCursor ?? null };
    }),
  correctDecision: (projectId, body, signal) =>
    wrap(async () =>
      correction(
        await caseIntelligenceCorrectDecision(
          projectId,
          body.decisionId,
          {
            correctedOutputs: body.correctedOutputs as CaseIntelligenceCorrectedOutputsDto,
            reasonCode: body.reasonCode,
            ...(body.notes ? { notes: body.notes } : {}),
            idempotencyKey: body.idempotencyKey,
          },
          commandOptions(signal),
        ),
      ),
    ),
  readRelease: (projectId, id, signal) =>
    wrap(async () => release(await caseIntelligenceGetRelease(projectId, id, readOptions(signal)))),
  activateRelease: (projectId, body, signal) =>
    wrap(async () =>
      release(await caseIntelligenceActivateRelease(projectId, body, commandOptions(signal))),
    ),
  rollbackRelease: (projectId, body, signal) =>
    wrap(async () =>
      release(await caseIntelligenceRollbackRelease(projectId, body, commandOptions(signal))),
    ),
  lookupCommand: (projectId, key, signal) =>
    wrap(async () => {
      const value = await caseIntelligenceLookupCommand(projectId, key, readOptions(signal));
      return {
        operation: value.operation,
        resultKind: value.resultKind,
        pending: 'state' in value.result && value.result.state === 'PENDING',
      };
    }),
};

const now = new Date();
const iso = (days = 0) => new Date(now.getTime() - days * 86_400_000).toISOString();
const mockRelease: CaseIntelligenceRelease = {
  id: 'release-12',
  version: 12,
  status: 'LIVE',
  detectionPolicyRevisionId: 'detection-8',
  escalationPolicyRevisionId: 'escalation-5',
  safetyPolicyRevisionId: 'safety-4',
  modelProfileRevisionId: 'model-balanced-v3',
  calibratorRevisionId: 'calibrator-7',
  datasetRevisionId: 'runtime-dataset-9',
  routingOverlayRevisionId: 'routing-6',
  compilerRevisionId: 'compiler-5',
  previousReleaseRevisionId: 'release-11',
  admissionReceiptId: 'receipt-release-12',
  createdAt: iso(5),
  activatedAt: iso(5),
};
const mockDataset: CaseIntelligenceDatasetDetail = {
  id: 'dataset-review-18',
  version: 18,
  status: 'PUBLISHED',
  name: 'Проверка поддержки — август',
  description: 'Проверенные обращения по основным темам и критическим рискам.',
  sampleCount: 486,
  createdAt: iso(2),
  locales: [
    { code: 'ru-RU', count: 312 },
    { code: 'en-US', count: 174 },
  ],
  channels: [
    { code: 'TEXT', count: 418 },
    { code: 'VOICE', count: 68 },
  ],
  classes: [
    { code: 'ISSUE', count: 214 },
    { code: 'REQUEST', count: 162 },
    { code: 'QUESTION', count: 110 },
  ],
  risks: [
    { code: 'NONE', count: 438 },
    { code: 'RESPONSIBLE_GAMING', count: 48 },
  ],
  suiteRoles: [
    { code: 'QUALITY', count: 344 },
    { code: 'SAFETY', count: 96 },
    { code: 'CALIBRATION', count: 46 },
  ],
};
const mockSide = (delta = 0): CaseIntelligenceEvaluationSide => ({
  accuracy: 0.91 + delta,
  macroPrecision: 0.89 + delta,
  macroRecall: 0.87 + delta,
  macroF1: 0.88 + delta,
  conversationClassMacroF1: 0.9 + delta,
  criticalRecall: 1,
  corrections: delta > 0 ? 21 : 29,
  crossTopicContamination: delta > 0 ? 3 : 8,
  attachReopenAccuracy: 0.93 + delta,
  handoffPrecision: 0.96,
  handoffRecall: 0.94 + delta,
  classes: ['NO_CASE', 'CREATE', 'ATTACH', 'REOPEN', 'DEFER'].map((code, index) => ({
    code,
    precision: 0.86 + index * 0.02 + delta,
    recall: 0.84 + index * 0.02 + delta,
    f1: 0.85 + index * 0.02 + delta,
    truePositive: 70 + index * 5,
    falsePositive: 4,
    falseNegative: 5,
  })),
});
const mockReport: CaseIntelligenceEvaluationReport = {
  id: 'evaluation-42',
  version: 42,
  status: 'PASSED',
  gates: { security: true, quality: true, calibration: true, cost: true, capacity: true },
  datasetRevisionId: mockDataset.id,
  detectionPolicyRevisionId: 'detection-9',
  escalationPolicyRevisionId: 'escalation-6',
  safetyPolicyRevisionId: 'safety-4',
  modelProfileRevisionId: 'model-balanced-v3',
  calibratorRevisionId: 'calibrator-7',
  calibrationDatasetId: mockDataset.id,
  routingOverlayRevisionId: 'routing-6',
  compilerRevisionId: 'compiler-5',
  publishedReleaseRevisionId: mockRelease.id,
  candidateFingerprint: 'a'.repeat(64),
  createdAt: iso(1),
  pending: false,
  failureCode: null,
  sampleCount: 486,
  reviewedSampleCount: 486,
  candidate: mockSide(0.03),
  published: mockSide(),
  coverage: {
    dataset: true,
    semantic: true,
    safety: true,
    fallback: true,
    routing: true,
    executionMode: 'DETERMINISTIC',
  },
  calibration: [
    {
      key: 'ru-text-create',
      locale: 'ru-RU',
      channel: 'TEXT',
      caseDecision: 'CREATE',
      modelId: 'balanced-v3',
      coverage: 'FULL',
      samples: 142,
      threshold: 0.86,
      interval: { low: 0.83, high: 0.9 },
    },
    {
      key: 'en-text-create',
      locale: 'en-US',
      channel: 'TEXT',
      caseDecision: 'CREATE',
      modelId: 'balanced-v3',
      coverage: 'FULL',
      samples: 88,
      threshold: 0.84,
      interval: { low: 0.8, high: 0.89 },
    },
  ],
  safety: [
    {
      key: 'rg-ru-text',
      riskClass: 'RESPONSIBLE_GAMING',
      locale: 'ru-RU',
      channel: 'TEXT',
      suiteRole: 'SAFETY',
      sampleCount: 32,
      criticalRecall: 1,
      falseNegatives: 0,
      passed: true,
    },
    {
      key: 'rg-en-voice',
      riskClass: 'RESPONSIBLE_GAMING',
      locale: 'en-US',
      channel: 'VOICE',
      suiteRole: 'SAFETY',
      sampleCount: 16,
      criticalRecall: 1,
      falseNegatives: 0,
      passed: true,
    },
  ],
  observations: [
    {
      id: 'obs-1',
      locale: 'ru-RU',
      channel: 'TEXT',
      suiteRole: 'QUALITY',
      riskClass: 'NONE',
      topicCode: 'PAYMENT',
      expectedCaseDecision: 'CREATE',
      candidateCaseDecision: 'CREATE',
      publishedCaseDecision: 'DEFER',
      expectedHandoff: 'NONE',
      candidateHandoff: 'NONE',
      publishedHandoff: 'OFFER',
      expectedSafety: 'CLEAR',
      candidateSafety: 'CLEAR',
      publishedSafety: 'CLEAR',
      corrected: true,
      reviewed: true,
    },
  ],
  confusion: [{ expected: 'CREATE', actual: 'DEFER', count: 7 }],
  cost: {
    inputTokens: 145_200,
    outputTokens: 18_400,
    cachedInputTokens: 89_300,
    cacheWriteInputTokens: 11_200,
    billedMicroUsd: '4820000',
    perThousandSignalsMicroUsd: '9918',
    perAcceptedCaseMicroUsd: '28400',
  },
  latency: { totalMs: 91_440, averageMs: 188 },
  queueImpact: {
    publishedCaseCount: 182,
    candidateCaseCount: 174,
    candidateCaseDelta: -8,
    publishedHandoffCount: 41,
    candidateHandoffCount: 36,
    candidateHandoffDelta: -5,
  },
};
const mockDecisions: CaseIntelligenceDecision[] = [
  {
    id: 'decision-1048',
    caseId: 'case-1001',
    conversationId: 'conversation-1001',
    signalId: 'signal-2048',
    decidedAt: iso(0),
    conversationClass: 'ISSUE',
    caseDecision: 'CREATE',
    reviewDisposition: 'AUTO_APPLY',
    handoffAction: 'NONE',
    safetyDecision: 'CLEAR',
    detectionState: 'DETECTED',
    escalationState: 'IDLE',
    safetyState: 'CLEAR',
    assistantReleaseGate: 'OPEN',
    confidence: '0.9340',
    reasonCodes: ['EXACT_RULE_MATCH'],
    matchedRuleCodes: ['PAYMENT_DUPLICATE'],
    evidenceRefs: [{ id: 'message-22', kind: 'MESSAGE' }],
    releaseRevisionId: mockRelease.id,
    detectionPolicyRevisionId: 'detection-8',
    escalationPolicyRevisionId: 'escalation-5',
    safetyPolicyRevisionId: 'safety-4',
    modelProfileRevisionId: 'model-balanced-v3',
    calibratorRevisionId: 'calibrator-7',
    datasetRevisionId: 'runtime-dataset-9',
    routingOverlayRevisionId: 'routing-6',
    compilerRevisionId: 'compiler-5',
    legacyUnpinned: false,
    corrections: [],
  },
  {
    id: 'decision-1047',
    caseId: 'case-1002',
    conversationId: 'conversation-1002',
    signalId: 'signal-2047',
    decidedAt: iso(1),
    conversationClass: 'QUESTION',
    caseDecision: 'ATTACH',
    reviewDisposition: 'REVIEW',
    handoffAction: 'OFFER',
    safetyDecision: 'CLEAR',
    detectionState: 'DETECTED',
    escalationState: 'OFFERED',
    safetyState: 'CLEAR',
    assistantReleaseGate: 'OPEN',
    confidence: '0.7810',
    reasonCodes: ['SEMANTIC_MATCH'],
    matchedRuleCodes: [],
    evidenceRefs: [{ id: 'signal-2047', kind: 'SIGNAL' }],
    releaseRevisionId: mockRelease.id,
    detectionPolicyRevisionId: 'detection-8',
    escalationPolicyRevisionId: 'escalation-5',
    safetyPolicyRevisionId: 'safety-4',
    modelProfileRevisionId: 'model-balanced-v3',
    calibratorRevisionId: 'calibrator-7',
    datasetRevisionId: 'runtime-dataset-9',
    routingOverlayRevisionId: 'routing-6',
    compilerRevisionId: 'compiler-5',
    legacyUnpinned: false,
    corrections: [],
  },
];

const mockSource: SupportCaseIntelligenceOperationsSource = {
  async readCurrent() {
    return {
      allowedActions: ['ACTIVATE', 'ROLLBACK', 'CORRECT_DECISION'],
      runtime: {
        status: 'LIVE',
        version: 12,
        currentReleaseRevisionId: mockRelease.id,
        updatedAt: iso(),
      },
      release: { ...mockRelease },
      minimumSafetyRevisionId: 'safety-4',
      safetyState: 'READY',
      safetyAuthority: 'PLATFORM',
      safetyAssistantReleaseGate: 'OPEN',
      safetyProjectOverrideAllowed: false,
      reconciledSafetyRevisionId: 'safety-4',
      releaseSafetyRevisionId: 'safety-4',
      detection: {
        publishedRevisionId: 'detection-9',
        publishedVersion: 9,
        compilerRevisionId: 'compiler-5',
        modelProfileRevisionId: 'model-balanced-v3',
      },
      escalation: {
        publishedRevisionId: 'escalation-6',
        publishedVersion: 6,
        compilerRevisionId: 'compiler-5',
        routingOverlayRevisionId: 'routing-6',
      },
    };
  },
  async listDatasets() {
    return { items: [{ ...mockDataset }], nextCursor: null };
  },
  async readDataset(_projectId, id) {
    if (id !== mockDataset.id) throw new ApiError(404, 'Набор не найден');
    return structuredClone(mockDataset);
  },
  async listEvaluations() {
    return { items: [{ ...mockReport }], nextCursor: null };
  },
  async readEvaluation(_projectId, id) {
    if (id !== mockReport.id) throw new ApiError(404, 'Проверка не найдена');
    return structuredClone(mockReport);
  },
  async runEvaluation(_projectId, command) {
    return {
      ...structuredClone(mockReport),
      id: `evaluation-${command.idempotencyKey.slice(-6)}`,
      createdAt: new Date().toISOString(),
    };
  },
  async readObservability(_projectId, from, to) {
    return {
      from,
      to,
      completeThrough: iso(),
      timezone: 'UTC',
      definitionsRevision: 'case-intelligence-observability-v1',
      mixedRevisions: false,
      truncated: false,
      releaseRevisionIds: [mockRelease.id],
      suppressionRules: ['NO_SIGNAL', 'SAFETY_BLOCK', 'DUPLICATE', 'INVALID_INPUT'],
      funnel: [
        ['ELIGIBLE_SIGNALS', 12480, null, null],
        ['DETECTED', 9380, 12480, 0.7516],
        ['DEFERRED', 720, 9380, 0.0768],
        ['CASE_CREATED', 3010, 9380, 0.3209],
        ['CASE_ATTACHED', 1870, 9380, 0.1994],
        ['CASE_REOPENED', 390, 9380, 0.0416],
        ['HANDOFF_OFFERED', 1420, 5270, 0.2694],
        ['HANDOFF_ACCEPTED', 1160, 1420, 0.8169],
      ].map(([code, numerator, denominator, rate]) => ({
        code: String(code),
        numerator: Number(numerator),
        denominator: denominator === null ? null : Number(denominator),
        rate: rate === null ? null : Number(rate),
      })),
      cost: {
        inputTokens: 4_880_200,
        outputTokens: 612_900,
        cachedInputTokens: 3_170_000,
        cacheWriteInputTokens: 284_000,
        billedMicroUsd: '128400000',
        perThousandSignalsMicroUsd: '10288',
        perCaseMicroUsd: '42658',
        perEscalationMicroUsd: '90422',
        perResolutionMicroUsd: '51200',
        completeness: 'COMPLETE',
      },
    };
  },
  async listDecisions(_projectId, _cursor, caseId) {
    return {
      items: mockDecisions
        .filter((item) => !caseId || item.caseId === caseId)
        .map((item) => structuredClone(item)),
      nextCursor: null,
    };
  },
  async explainCase(_projectId, caseId) {
    return {
      items: mockDecisions
        .filter((item) => item.caseId === caseId)
        .map((item) => structuredClone(item)),
      nextCursor: null,
    };
  },
  async correctDecision(_projectId, command) {
    const item = mockDecisions.find((entry) => entry.id === command.decisionId);
    if (!item) throw new ApiError(404, 'Решение не найдено');
    const value: CaseIntelligenceCorrection = {
      id: `correction-${Date.now()}`,
      reasonCode: command.reasonCode,
      notes: command.notes ?? null,
      createdAt: new Date().toISOString(),
      createdByCmsUserId: 'mock-user',
      outputs: { ...command.correctedOutputs },
    };
    item.corrections.push(value);
    return structuredClone(value);
  },
  async readRelease(_projectId, id) {
    if (id === mockRelease.id) return { ...mockRelease };
    return {
      ...mockRelease,
      id,
      version: Math.max(1, mockRelease.version - 1),
      status: 'SUPERSEDED',
      previousReleaseRevisionId: null,
      activatedAt: iso(12),
      createdAt: iso(12),
    };
  },
  async activateRelease(_projectId, command) {
    Object.assign(mockRelease, {
      ...command,
      id: `release-${command.expectedVersion + 1}`,
      version: command.expectedVersion + 1,
      status: 'LIVE',
      previousReleaseRevisionId: mockRelease.id,
      admissionReceiptId: `receipt-${Date.now()}`,
      createdAt: new Date().toISOString(),
      activatedAt: new Date().toISOString(),
    });
    return { ...mockRelease };
  },
  async rollbackRelease(_projectId, command) {
    return {
      ...mockRelease,
      id: `release-${command.expectedVersion + 1}`,
      version: command.expectedVersion + 1,
      previousReleaseRevisionId: mockRelease.id,
      createdAt: new Date().toISOString(),
      activatedAt: new Date().toISOString(),
    };
  },
  async lookupCommand() {
    throw new ApiError(404, 'Команда не найдена', undefined, undefined, 'NOT_FOUND');
  },
};

export const supportCaseIntelligenceOperationsSource = isMockMode
  ? mockSource
  : apiSupportCaseIntelligenceOperationsSource;
