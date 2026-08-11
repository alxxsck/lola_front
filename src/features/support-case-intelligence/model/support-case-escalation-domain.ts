export type EscalationAction = "OFFER" | "ASK_REASON_ONCE" | "ESCALATE";
export type EscalationUrgency = "LOW" | "MEDIUM" | "HIGH" | "IMMEDIATE";
export type TrustedOutcome =
  "NO_ANSWER" | "KNOWLEDGE_INSUFFICIENT" | "TOOL_FAILED" | "UNRESOLVED";

export interface EscalationPhraseRule {
  code: string;
  locales: string[];
  phrases: string[];
}

export interface EscalationAmbiguousRule extends EscalationPhraseRule {
  action: EscalationAction;
}

export interface EscalationScenario {
  code: string;
  action: EscalationAction;
  urgency: EscalationUrgency;
  reasonCode: string;
  dataToCollect: string[];
}

export interface EscalationPolicy {
  explicitHumanRequestRules: EscalationPhraseRule[];
  ambiguousHumanTermRules: EscalationAmbiguousRule[];
  doNotEscalateRules?: EscalationPhraseRule[];
  scenarios: EscalationScenario[];
  trustedOutcomeLimits: Array<{ outcome: TrustedOutcome; limit: number }>;
  clarificationLimit: number;
  failedResolutionLimit: number;
  noMatchLimit: number;
  repeatLimit: number;
  offerCooldownSeconds: number;
  offerResponseTimeoutSeconds: number;
  routingPolicyRevisionId: string;
}

export interface EscalationRevision {
  id: string;
  projectId: string;
  version: number;
  status: "DRAFT" | "PUBLISHED" | "SUPERSEDED";
  definition: EscalationPolicy;
  publishedAt?: string | null;
}

export interface EscalationSafetyState {
  state: string;
  authority: string;
  assistantReleaseGate: string;
  projectOverrideAllowed: boolean;
  minimumSafetyRevisionId?: string | null;
  reconciledSafetyRevisionId?: string | null;
  releaseSafetyRevisionId?: string | null;
}

export interface EscalationWorkspaceSnapshot {
  allowedActions: string[];
  escalation?: {
    draft: EscalationRevision | null;
    published: EscalationRevision | null;
  };
  safety: EscalationSafetyState;
}

export interface EscalationSafetyPolicy {
  revisionId: string;
  authority: string;
  projectOverrideAllowed: boolean;
  locales: string[];
  channels: string[];
  classes: Array<{
    code: string;
    severity: string;
    consequences: string[];
  }>;
}

export type EscalationSimulationStepKind =
  | "EXPLICIT_HUMAN_REQUEST"
  | "AMBIGUOUS_HUMAN_TERM"
  | "SCENARIO"
  | "TRUSTED_OUTCOME"
  | "CLARIFICATION"
  | "NO_MATCH"
  | "REPEAT"
  | "OFFER_ACCEPTED"
  | "OFFER_DECLINED"
  | "OFFER_TIMEOUT"
  | "VERIFIED_RESOLUTION"
  | "NEW_CASE_OR_TOPIC"
  | "CASE_TERMINAL"
  | "ESCALATION_COMMITTED"
  | "POLICY_SWITCH";

export interface EscalationSimulationStep {
  stepId: string;
  attemptId: string;
  outcomeId: string;
  observedAt: string;
  kind: EscalationSimulationStepKind;
  nextDefinition?: EscalationPolicy;
  outcome?: TrustedOutcome;
  ruleCode?: string;
  scenarioCode?: string;
  safetyState: "CLEAR" | "PENDING" | "FAILED" | "SUSPECTED" | "URGENT";
  safetyRiskClass?: string | null;
  routing: {
    currentAssignment: boolean;
    businessState: "OPEN" | "CLOSED" | "RUNTIME_MISMATCH";
    queueState:
      | "WINNER"
      | "NO_ELIGIBLE_OPERATOR"
      | "NO_ACTIVATION"
      | "MISSING"
      | "UNKNOWN";
  };
}

export interface EscalationSimulationState {
  status: string;
  clarificationCount: number;
  failedResolutionCount: number;
  noMatchCount: number;
  repeatCount: number;
  reasonAsked: boolean;
  trustedOutcomeCounts?: Record<string, number>;
}

export interface EscalationSimulationResult {
  executionMode: string;
  sideEffectsCommitted: boolean;
  initialPolicyHash: string;
  finalPolicyHash: string;
  safetyPolicyRevisionId: string;
  steps: Array<{
    index: number;
    stepId: string;
    attemptId: string;
    outcomeId: string;
    observedAt: string;
    kind: EscalationSimulationStepKind;
    action: "NONE" | EscalationAction;
    before: EscalationSimulationState;
    after: EscalationSimulationState;
    disposition: string;
    reasonCode: string;
    ordinaryReasonCode: string;
    policyReasonCode: string | null;
    sourceCode: string | null;
    occurrenceNumber: number;
    offerDeadline: string | null;
    cooldownUntil: string | null;
    urgency: EscalationUrgency | null;
    dataToCollect: string[];
    effects: string[];
    replay: boolean;
    replayOfStep: number | null;
    policyMigration: string;
    policyHash: string;
    routingAdmission: string;
    routingPolicyRevisionId: string;
    safety: {
      state: string;
      riskClass: string | null;
      severity: string | null;
      consequences: string[];
      assistantReleaseGate: string;
      workflowState: string;
      retryScheduled: boolean;
      operationalAlertRequired: boolean;
    };
  }>;
}
