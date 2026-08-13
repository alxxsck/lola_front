export type CaseIntelligenceOperationsSection =
  'evaluation' | 'observability' | 'decisions' | 'versions';

export type CaseIntelligenceGateName = 'security' | 'quality' | 'calibration' | 'cost' | 'capacity';

export type CaseIntelligenceGates = Record<CaseIntelligenceGateName, boolean>;

export interface CaseIntelligenceOperationsCurrent {
  allowedActions: string[];
  runtime: {
    status: string;
    version: number;
    currentReleaseRevisionId: string | null;
    updatedAt: string | null;
  } | null;
  release: CaseIntelligenceRelease | null;
  minimumSafetyRevisionId: string | null;
  safetyState: string;
  safetyAuthority: string;
  safetyAssistantReleaseGate: string;
  safetyProjectOverrideAllowed: boolean;
  reconciledSafetyRevisionId: string | null;
  releaseSafetyRevisionId: string | null;
  detection: {
    publishedRevisionId: string | null;
    publishedVersion: number | null;
    compilerRevisionId: string | null;
    modelProfileRevisionId: string | null;
  };
  escalation: {
    publishedRevisionId: string | null;
    publishedVersion: number | null;
    compilerRevisionId: string | null;
    routingOverlayRevisionId: string | null;
  };
}

export interface CaseIntelligenceRelease {
  id: string;
  version: number;
  status: string;
  detectionPolicyRevisionId: string;
  escalationPolicyRevisionId: string;
  safetyPolicyRevisionId: string;
  modelProfileRevisionId: string;
  calibratorRevisionId: string;
  datasetRevisionId: string;
  routingOverlayRevisionId: string;
  compilerRevisionId: string;
  previousReleaseRevisionId: string | null;
  admissionReceiptId: string;
  createdAt: string;
  activatedAt: string | null;
}

export interface CaseIntelligenceDatasetSummary {
  id: string;
  version: number;
  status: string;
  name: string;
  description: string;
  sampleCount: number;
  createdAt: string;
}

export interface CaseIntelligenceDatasetDistributionItem {
  code: string;
  count: number;
}

export interface CaseIntelligenceDatasetDetail extends CaseIntelligenceDatasetSummary {
  locales: CaseIntelligenceDatasetDistributionItem[];
  channels: CaseIntelligenceDatasetDistributionItem[];
  classes: CaseIntelligenceDatasetDistributionItem[];
  risks: CaseIntelligenceDatasetDistributionItem[];
  suiteRoles: CaseIntelligenceDatasetDistributionItem[];
}

export interface CaseIntelligenceEvaluationHistoryItem {
  id: string;
  version: number;
  status: 'PENDING' | 'PROCESSING' | 'PASSED' | 'FAILED' | 'OUTCOME_UNKNOWN';
  gates: CaseIntelligenceGates;
  datasetRevisionId: string;
  detectionPolicyRevisionId: string;
  escalationPolicyRevisionId: string;
  safetyPolicyRevisionId: string;
  modelProfileRevisionId: string;
  calibratorRevisionId: string;
  calibrationDatasetId: string;
  routingOverlayRevisionId: string;
  compilerRevisionId: string;
  publishedReleaseRevisionId: string | null;
  candidateFingerprint: string;
  createdAt: string;
}

export interface CaseIntelligenceMetricBucket {
  code: string;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  truePositive: number;
  falsePositive: number;
  falseNegative: number;
}

export interface CaseIntelligenceEvaluationSide {
  accuracy: number;
  macroPrecision: number;
  macroRecall: number;
  macroF1: number;
  conversationClassMacroF1: number;
  criticalRecall: number | null;
  corrections: number;
  crossTopicContamination: number;
  attachReopenAccuracy: number | null;
  handoffPrecision: number | null;
  handoffRecall: number | null;
  classes: CaseIntelligenceMetricBucket[];
}

export interface CaseIntelligenceCalibrationCell {
  key: string;
  locale: string;
  channel: string;
  caseDecision: string;
  modelId: string;
  coverage: string;
  samples: number;
  threshold: number;
  interval: { low: number; high: number } | null;
}

export interface CaseIntelligenceSafetyCell {
  key: string;
  riskClass: string;
  locale: string;
  channel: string;
  suiteRole: string;
  sampleCount: number;
  criticalRecall: number | null;
  falseNegatives: number;
  passed: boolean;
}

export interface CaseIntelligenceObservation {
  id: string;
  locale: string;
  channel: string;
  suiteRole: string;
  riskClass: string;
  topicCode: string | null;
  expectedCaseDecision: string;
  candidateCaseDecision: string;
  publishedCaseDecision: string;
  expectedHandoff: string;
  candidateHandoff: string;
  publishedHandoff: string;
  expectedSafety: string;
  candidateSafety: string | null;
  publishedSafety: string | null;
  corrected: boolean;
  reviewed: boolean;
}

export interface CaseIntelligenceEvaluationReport extends CaseIntelligenceEvaluationHistoryItem {
  pending: boolean;
  failureCode: string | null;
  sampleCount: number;
  reviewedSampleCount: number;
  candidate: CaseIntelligenceEvaluationSide | null;
  published: CaseIntelligenceEvaluationSide | null;
  coverage: {
    dataset: boolean;
    semantic: boolean;
    safety: boolean;
    fallback: boolean;
    routing: boolean;
    executionMode: string;
  } | null;
  calibration: CaseIntelligenceCalibrationCell[];
  safety: CaseIntelligenceSafetyCell[];
  observations: CaseIntelligenceObservation[];
  confusion: Array<{ expected: string; actual: string; count: number }>;
  cost: {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    cacheWriteInputTokens: number;
    billedMicroUsd: string | null;
    perThousandSignalsMicroUsd: string | null;
    perAcceptedCaseMicroUsd: string | null;
  } | null;
  latency: { totalMs: number; averageMs: number } | null;
  queueImpact: {
    publishedCaseCount: number;
    candidateCaseCount: number;
    candidateCaseDelta: number;
    publishedHandoffCount: number;
    candidateHandoffCount: number;
    candidateHandoffDelta: number;
  } | null;
}

export interface CaseIntelligenceFunnelItem {
  code: string;
  numerator: number;
  denominator: number | null;
  rate: number | null;
}

export interface CaseIntelligenceObservability {
  from: string;
  to: string;
  completeThrough: string;
  timezone: string;
  definitionsRevision: string;
  mixedRevisions: boolean;
  truncated: boolean;
  releaseRevisionIds: string[];
  suppressionRules: string[];
  funnel: CaseIntelligenceFunnelItem[];
  cost: {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    cacheWriteInputTokens: number;
    billedMicroUsd: string | null;
    perThousandSignalsMicroUsd: string | null;
    perCaseMicroUsd: string | null;
    perEscalationMicroUsd: string | null;
    perResolutionMicroUsd: string | null;
    completeness: string;
  };
}

export interface CaseIntelligenceEvidenceRef {
  id: string;
  kind: string;
}

export interface CaseIntelligenceCorrection {
  id: string;
  reasonCode: string;
  notes: string | null;
  createdAt: string;
  createdByCmsUserId: string | null;
  outputs: CaseIntelligenceCorrectedOutputs | null;
}

export interface CaseIntelligenceCorrectedOutputs {
  conversationClass: string;
  caseDecision: string;
  reviewDisposition: string;
  handoffAction: string;
  safetyDecision: string;
}

export interface CaseIntelligenceDecision {
  id: string;
  caseId: string | null;
  conversationId: string | null;
  signalId: string;
  decidedAt: string;
  conversationClass: string | null;
  caseDecision: string;
  reviewDisposition: string | null;
  handoffAction: string | null;
  safetyDecision: string | null;
  detectionState: string;
  escalationState: string;
  safetyState: string;
  assistantReleaseGate: string;
  confidence: string | null;
  reasonCodes: string[];
  matchedRuleCodes: string[];
  evidenceRefs: CaseIntelligenceEvidenceRef[];
  releaseRevisionId: string | null;
  detectionPolicyRevisionId: string | null;
  escalationPolicyRevisionId: string | null;
  safetyPolicyRevisionId: string | null;
  modelProfileRevisionId: string | null;
  calibratorRevisionId: string | null;
  datasetRevisionId: string | null;
  routingOverlayRevisionId: string | null;
  compilerRevisionId: string | null;
  legacyUnpinned: boolean;
  corrections: CaseIntelligenceCorrection[];
}

export interface CaseIntelligencePage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface CaseIntelligenceCommandOutcome {
  operation: string;
  resultKind: string;
  pending: boolean;
}

export interface RunCaseIntelligenceEvaluationCommand {
  labelledDatasetRevisionId: string;
  datasetRevisionId: string;
  detectionPolicyRevisionId: string;
  escalationPolicyRevisionId: string;
  safetyPolicyRevisionId: string;
  modelProfileRevisionId: string;
  calibratorRevisionId: string;
  routingOverlayRevisionId: string;
  compilerRevisionId: string;
  idempotencyKey: string;
}

export interface ActivateCaseIntelligenceReleaseCommand {
  expectedVersion: number;
  detectionPolicyRevisionId: string;
  escalationPolicyRevisionId: string;
  safetyPolicyRevisionId: string;
  modelProfileRevisionId: string;
  calibratorRevisionId: string;
  datasetRevisionId: string;
  routingOverlayRevisionId: string;
  compilerRevisionId: string;
  idempotencyKey: string;
}

export interface RollbackCaseIntelligenceReleaseCommand {
  releaseRevisionId: string;
  expectedVersion: number;
  reason: string;
  idempotencyKey: string;
}

export interface CorrectCaseIntelligenceDecisionCommand {
  decisionId: string;
  correctedOutputs: CaseIntelligenceCorrectedOutputs;
  reasonCode: string;
  notes?: string;
  idempotencyKey: string;
}

export type CaseIntelligencePendingCommand =
  | { operation: 'RUN_EVALUATION'; body: RunCaseIntelligenceEvaluationCommand }
  | { operation: 'ACTIVATE_RELEASE'; body: ActivateCaseIntelligenceReleaseCommand }
  | { operation: 'ROLLBACK_RELEASE'; body: RollbackCaseIntelligenceReleaseCommand }
  | { operation: 'CORRECT_DECISION'; body: CorrectCaseIntelligenceDecisionCommand };
