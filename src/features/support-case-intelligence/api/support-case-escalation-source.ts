import {
  caseIntelligenceCompileEscalation,
  caseIntelligenceCurrent,
  caseIntelligenceDiscardEscalationDraft,
  caseIntelligenceDryRunEscalation,
  caseIntelligenceLookupCommand,
  caseIntelligenceProjectSafetyPolicy,
  caseIntelligencePublishEscalation,
  caseIntelligenceSaveEscalationDraft,
} from "@/shared/api/generated/retenive-backend";
import type {
  CaseIntelligenceCurrentResponseDto,
  CaseIntelligenceEscalationDryRunResponseDto,
  CaseIntelligenceEscalationPolicyDto,
  CaseIntelligenceEscalationRevisionResponseDto,
  CaseIntelligenceEscalationSimulationStepDto,
  CaseIntelligenceProjectSafetyPolicyResponseDto,
} from "@/shared/api/generated/models";
import { ApiError, normalizeApiError } from "@/shared/api/http/api-error";
import { noAuthRetryRequestOptions } from "@/shared/api/http/axios-instance";
import { isMockMode } from "@/shared/config/data-mode";
import {
  cloneEscalation,
  createDefaultEscalationPolicy,
  simulationStepReferenceIssue,
  simulationStepSafetyIssue,
} from "../model/support-case-escalation-policy";
import type {
  EscalationPolicy,
  EscalationRevision,
  EscalationSafetyPolicy,
  EscalationSimulationResult,
  EscalationSimulationState,
  EscalationSimulationStep,
  EscalationWorkspaceSnapshot,
} from "../model/support-case-escalation-domain";

export interface SupportCaseEscalationSource {
  read(
    projectId: string,
    signal?: AbortSignal,
  ): Promise<EscalationWorkspaceSnapshot>;
  readSafety(
    projectId: string,
    signal?: AbortSignal,
  ): Promise<EscalationSafetyPolicy>;
  compile(
    projectId: string,
    definition: EscalationPolicy,
    signal?: AbortSignal,
  ): Promise<void>;
  dryRun(
    projectId: string,
    definition: EscalationPolicy,
    steps: EscalationSimulationStep[],
    signal?: AbortSignal,
  ): Promise<EscalationSimulationResult>;
  saveDraft(
    projectId: string,
    definition: EscalationPolicy,
    expectedVersion: number,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<void>;
  discardDraft(
    projectId: string,
    expectedVersion: number,
    reason: string,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<void>;
  publish(
    projectId: string,
    revisionId: string,
    expectedVersion: number,
    reason: string,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<void>;
  lookupCommand(
    projectId: string,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<void>;
}

const options = (signal?: AbortSignal) => (signal ? { signal } : undefined);
const commandOptions = (signal?: AbortSignal) => ({
  ...noAuthRetryRequestOptions(),
  ...(signal ? { signal } : {}),
});

function toApiPolicy(
  value: EscalationPolicy,
): CaseIntelligenceEscalationPolicyDto {
  return {
    explicitHumanRequestRules: value.explicitHumanRequestRules.map((rule) => ({
      ...rule,
      locales: [...rule.locales],
      phrases: [...rule.phrases],
    })),
    ambiguousHumanTermRules: value.ambiguousHumanTermRules.map((rule) => ({
      ...rule,
      locales: [...rule.locales],
      phrases: [...rule.phrases],
    })),
    doNotEscalateRules: value.doNotEscalateRules?.map((rule) => ({
      ...rule,
      locales: [...rule.locales],
      phrases: [...rule.phrases],
    })),
    scenarios: value.scenarios.map((scenario) => ({
      ...scenario,
      dataToCollect: [...scenario.dataToCollect],
    })),
    trustedOutcomeLimits: value.trustedOutcomeLimits.map((item) => ({
      ...item,
    })),
    clarificationLimit: value.clarificationLimit,
    failedResolutionLimit: value.failedResolutionLimit,
    noMatchLimit: value.noMatchLimit,
    repeatLimit: value.repeatLimit,
    offerCooldownSeconds: value.offerCooldownSeconds,
    offerResponseTimeoutSeconds: value.offerResponseTimeoutSeconds,
    routingPolicyRevisionId: value.routingPolicyRevisionId,
  };
}

function toApiStep(
  value: EscalationSimulationStep,
): CaseIntelligenceEscalationSimulationStepDto {
  return {
    ...value,
    routing: { ...value.routing },
    nextDefinition: value.nextDefinition
      ? toApiPolicy(value.nextDefinition)
      : undefined,
  } as CaseIntelligenceEscalationSimulationStepDto;
}

function toRevision(
  value: CaseIntelligenceEscalationRevisionResponseDto,
): EscalationRevision {
  return {
    id: value.id,
    projectId: value.projectId,
    version: value.version,
    status: value.status,
    definition: cloneEscalation(value.definition),
    publishedAt:
      typeof value.publishedAt === "string" ? value.publishedAt : null,
  };
}

function toSnapshot(
  value: CaseIntelligenceCurrentResponseDto,
): EscalationWorkspaceSnapshot {
  return {
    allowedActions: [...value.allowedActions],
    escalation: value.escalation
      ? {
          draft: value.escalation.draft
            ? toRevision(value.escalation.draft)
            : null,
          published: value.escalation.published
            ? toRevision(value.escalation.published)
            : null,
        }
      : undefined,
    safety: { ...value.safety },
  };
}

function toSafety(
  value: CaseIntelligenceProjectSafetyPolicyResponseDto,
): EscalationSafetyPolicy {
  return {
    revisionId: value.revisionId,
    authority: value.authority,
    projectOverrideAllowed: value.projectOverrideAllowed,
    locales: [...value.locales],
    channels: [...value.channels],
    classes: value.classes.map((item) => ({
      code: item.code,
      severity: item.severity,
      consequences: [...item.consequences],
    })),
  };
}

function toSimulation(
  value: CaseIntelligenceEscalationDryRunResponseDto,
): EscalationSimulationResult {
  return {
    executionMode: value.executionMode,
    sideEffectsCommitted: value.sideEffectsCommitted,
    initialPolicyHash: value.initialPolicyHash,
    finalPolicyHash: value.finalPolicyHash,
    safetyPolicyRevisionId: value.safetyPolicyRevisionId,
    steps: value.steps.map((step) => ({
      ...step,
      before: {
        ...step.before,
        trustedOutcomeCounts: step.before.trustedOutcomeCounts
          ? { ...step.before.trustedOutcomeCounts }
          : undefined,
      },
      after: {
        ...step.after,
        trustedOutcomeCounts: step.after.trustedOutcomeCounts
          ? { ...step.after.trustedOutcomeCounts }
          : undefined,
      },
      dataToCollect: [...step.dataToCollect],
      effects: [...step.effects],
      safety: { ...step.safety, consequences: [...step.safety.consequences] },
    })),
  } as EscalationSimulationResult;
}

export const apiSupportCaseEscalationSource: SupportCaseEscalationSource = {
  async read(projectId, signal) {
    try {
      return toSnapshot(
        await caseIntelligenceCurrent(projectId, options(signal)),
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async readSafety(projectId, signal) {
    try {
      return toSafety(
        await caseIntelligenceProjectSafetyPolicy(projectId, options(signal)),
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async compile(projectId, definition, signal) {
    try {
      await caseIntelligenceCompileEscalation(
        projectId,
        toApiPolicy(definition),
        options(signal),
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async dryRun(projectId, definition, steps, signal) {
    try {
      return toSimulation(
        await caseIntelligenceDryRunEscalation(
          projectId,
          { definition: toApiPolicy(definition), steps: steps.map(toApiStep) },
          options(signal),
        ),
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async saveDraft(
    projectId,
    definition,
    expectedVersion,
    idempotencyKey,
    signal,
  ) {
    try {
      await caseIntelligenceSaveEscalationDraft(
        projectId,
        {
          definition: toApiPolicy(definition),
          expectedVersion,
          idempotencyKey,
        },
        commandOptions(signal),
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async discardDraft(
    projectId,
    expectedVersion,
    reason,
    idempotencyKey,
    signal,
  ) {
    try {
      await caseIntelligenceDiscardEscalationDraft(
        projectId,
        { expectedVersion, reason, idempotencyKey },
        commandOptions(signal),
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async publish(
    projectId,
    revisionId,
    expectedVersion,
    reason,
    idempotencyKey,
    signal,
  ) {
    try {
      await caseIntelligencePublishEscalation(
        projectId,
        { revisionId, expectedVersion, reason, idempotencyKey },
        commandOptions(signal),
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async lookupCommand(projectId, idempotencyKey, signal) {
    try {
      await caseIntelligenceLookupCommand(
        projectId,
        idempotencyKey,
        options(signal),
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
};

const mockStates = new Map<string, EscalationWorkspaceSnapshot>();

function mockRevision(
  projectId: string,
  version: number,
  status: "DRAFT" | "PUBLISHED",
  definition: EscalationPolicy,
): EscalationRevision {
  return {
    id: `escalation-${projectId}-${version}`,
    projectId,
    version,
    status,
    definition: cloneEscalation(definition),
    publishedAt: null,
  };
}

function mockState(projectId: string): EscalationWorkspaceSnapshot {
  const existing = mockStates.get(projectId);
  if (existing) return existing;
  const definition = createDefaultEscalationPolicy();
  definition.explicitHumanRequestRules = [
    {
      code: "HUMAN_REQUEST_RU",
      locales: ["ru-RU"],
      phrases: ["позовите оператора", "хочу поговорить с человеком"],
    },
  ];
  definition.ambiguousHumanTermRules = [
    {
      code: "HUMAN_TERM_RU",
      locales: ["ru-RU"],
      phrases: ["оператор", "поддержка"],
      action: "OFFER",
    },
  ];
  definition.scenarios = [
    {
      code: "PAYMENT_BLOCKED",
      action: "ASK_REASON_ONCE",
      urgency: "HIGH",
      reasonCode: "PAYMENT_BLOCKED",
      dataToCollect: ["PAYMENT_ID"],
    },
  ];
  const state: EscalationWorkspaceSnapshot = {
    allowedActions: ["SAVE_ESCALATION_DRAFT", "PREVIEW", "PUBLISH"],
    escalation: {
      draft: null,
      published: mockRevision(projectId, 1, "PUBLISHED", definition),
    },
    safety: {
      state: "READY",
      authority: "PLATFORM",
      assistantReleaseGate: "ALLOW",
      minimumSafetyRevisionId: "safety-v4",
      reconciledSafetyRevisionId: "safety-v4",
      releaseSafetyRevisionId: "safety-v4",
      projectOverrideAllowed: false,
    },
  };
  mockStates.set(projectId, state);
  return state;
}

function emptyState(): EscalationSimulationState {
  return {
    status: "OPEN",
    clarificationCount: 0,
    failedResolutionCount: 0,
    noMatchCount: 0,
    repeatCount: 0,
    reasonAsked: false,
    trustedOutcomeCounts: {
      NO_ANSWER: 0,
      KNOWLEDGE_INSUFFICIENT: 0,
      TOOL_FAILED: 0,
      UNRESOLVED: 0,
    },
  };
}

const mockSafetyProjection: EscalationSafetyPolicy = {
  revisionId: "safety-v4",
  authority: "PLATFORM",
  projectOverrideAllowed: false,
  locales: ["ru-RU", "en-US", "es-ES"],
  channels: ["TEXT", "VOICE", "TELEGRAM"],
  classes: [
    {
      code: "SELF_HARM_OR_SUICIDE",
      severity: "URGENT",
      consequences: [
        "SAFE_RESPONSE",
        "SAFETY_OCCURRENCE",
        "CASE_ESCALATION",
        "OPERATIONAL_ALERT",
      ],
    },
    {
      code: "CREDIBLE_THREAT_OR_VIOLENCE",
      severity: "URGENT",
      consequences: [
        "SAFE_RESPONSE",
        "SAFETY_OCCURRENCE",
        "CASE_ESCALATION",
        "OPERATIONAL_ALERT",
      ],
    },
    {
      code: "HARM_INVOLVING_MINORS",
      severity: "URGENT",
      consequences: [
        "SAFE_RESPONSE",
        "SAFETY_OCCURRENCE",
        "CASE_ESCALATION",
        "OPERATIONAL_ALERT",
      ],
    },
    {
      code: "RESPONSIBLE_GAMING_CRISIS",
      severity: "HIGH",
      consequences: ["SAFE_RESPONSE", "SAFETY_OCCURRENCE", "CASE_ESCALATION"],
    },
  ],
};

export const mockSupportCaseEscalationSource: SupportCaseEscalationSource = {
  async read(projectId) {
    return cloneEscalation(mockState(projectId));
  },
  async readSafety() {
    return cloneEscalation(mockSafetyProjection);
  },
  async compile(_projectId, definition) {
    void definition;
  },
  async dryRun(_projectId, definition, steps) {
    let state = emptyState();
    let offerDeadline: string | null = null;
    let cooldownUntil: string | null = null;
    let lastObservedAt: Date | null = null;
    type SimulationStepResult = EscalationSimulationResult["steps"][number];
    type ReplayRecord = {
      inputSignature: string;
      result: SimulationStepResult;
    };
    const priorByAttempt = new Map<string, ReplayRecord>();
    const priorByOutcome = new Map<string, ReplayRecord>();
    const output: SimulationStepResult[] = steps.map((step, index) => {
      const stepIssue =
        simulationStepReferenceIssue(step, definition) ||
        simulationStepSafetyIssue(step);
      if (stepIssue)
        throw new ApiError(
          400,
          stepIssue,
          undefined,
          undefined,
          "CASE_INTELLIGENCE_SIMULATION_STEP_SHAPE_INVALID",
        );
      const unreconciledBefore = cloneEscalation(state);
      const safetyClass = step.safetyRiskClass
        ? (mockSafetyProjection.classes.find(
            (item) => item.code === step.safetyRiskClass,
          ) ?? null)
        : null;
      const consequences = safetyClass?.consequences ?? [];
      const retryScheduled =
        step.safetyState === "PENDING" || step.safetyState === "FAILED";
      const operationalAlertRequired =
        step.safetyState === "FAILED" ||
        consequences.includes("OPERATIONAL_ALERT");
      const safetyEffects = consequences.map(
        (consequence) => `SAFETY_${consequence}`,
      );
      if (retryScheduled) safetyEffects.push("SAFETY_RETRY_SCHEDULED");
      if (
        operationalAlertRequired &&
        !safetyEffects.includes("SAFETY_OPERATIONAL_ALERT")
      )
        safetyEffects.push("SAFETY_OPERATIONAL_ALERT");
      const stepSafety = {
        state: step.safetyState,
        riskClass: step.safetyRiskClass ?? null,
        severity: safetyClass?.severity ?? null,
        consequences,
        assistantReleaseGate:
          step.safetyState === "CLEAR" ? "ALLOW" : "SAFE_FALLBACK",
        workflowState:
          step.safetyState === "CLEAR"
            ? "NOT_REQUIRED"
            : step.safetyState === "PENDING"
              ? "ANALYSIS_PENDING"
              : step.safetyState === "FAILED"
                ? "RETRY_SCHEDULED"
                : "CONSEQUENCES_REQUIRED",
        retryScheduled,
        operationalAlertRequired,
      };
      const inputSignature = JSON.stringify({
        outcomeId: step.outcomeId,
        kind: step.kind,
        ruleCode: step.ruleCode ?? null,
        scenarioCode: step.scenarioCode ?? null,
        outcome: step.outcome ?? null,
        nextDefinition: step.nextDefinition ?? null,
        safetyState: step.safetyState,
        safetyRiskClass: step.safetyRiskClass ?? null,
        routing: step.routing,
      });
      const attemptReplay = priorByAttempt.get(step.attemptId);
      const outcomeReplay = priorByOutcome.get(step.outcomeId);
      if (
        attemptReplay &&
        attemptReplay.result.outcomeId === step.outcomeId &&
        attemptReplay.inputSignature === inputSignature
      ) {
        const prior = attemptReplay.result;
        return {
          ...cloneEscalation(prior),
          stepId: step.stepId,
          replay: true,
          replayOfStep: prior.index,
        };
      }
      const conflict = attemptReplay ?? outcomeReplay;
      if (conflict) {
        const reasonCode = attemptReplay
          ? "CASE_INTELLIGENCE_SIMULATION_IDEMPOTENCY_CONFLICT"
          : "CASE_INTELLIGENCE_SIMULATION_OUTCOME_CONFLICT";
        return {
          ...cloneEscalation(conflict.result),
          index,
          stepId: step.stepId,
          attemptId: step.attemptId,
          outcomeId: step.outcomeId,
          observedAt: step.observedAt,
          kind: step.kind,
          before: unreconciledBefore,
          after: cloneEscalation(state),
          action: "NONE",
          reasonCode,
          ordinaryReasonCode: reasonCode,
          effects: [],
          replay: false,
          replayOfStep: conflict.result.index,
          disposition: "CONFLICT",
          policyMigration: "NONE",
          routingAdmission: "NOT_REQUIRED",
          sourceCode: null,
          urgency: null,
          dataToCollect: [],
          safety: stepSafety,
        };
      }
      const observedAt = new Date(step.observedAt);
      const timeBlock =
        lastObservedAt && observedAt < lastObservedAt
          ? "CASE_INTELLIGENCE_SIMULATION_TIME_NOT_MONOTONIC"
          : null;
      if (!timeBlock) lastObservedAt = observedAt;
      if (
        !timeBlock &&
        state.status === "COOLDOWN" &&
        cooldownUntil &&
        observedAt >= new Date(cooldownUntil)
      ) {
        state.status = "OPEN";
        cooldownUntil = null;
      }
      const before = cloneEscalation(state);
      let action: "NONE" | "OFFER" | "ASK_REASON_ONCE" | "ESCALATE" = "NONE";
      let ordinaryReasonCode = "NO_ESCALATION";
      let disposition = "APPLIED";
      let policyMigration = "NONE";
      const ordinaryEffects: string[] = [];
      const frozen = state.status === "ESCALATED" || state.status === "FROZEN";
      const temporalBlock = timeBlock
        ? null
        : state.status === "COOLDOWN" &&
            cooldownUntil &&
            observedAt < new Date(cooldownUntil) &&
            (step.kind === "AMBIGUOUS_HUMAN_TERM" || step.kind === "SCENARIO")
          ? "CASE_INTELLIGENCE_ESCALATION_COOLDOWN"
          : ["OFFER_ACCEPTED", "OFFER_DECLINED", "OFFER_TIMEOUT"].includes(
                step.kind,
              )
            ? state.status !== "OFFERED" || !offerDeadline
              ? "CASE_INTELLIGENCE_ESCALATION_OFFER_NOT_ACTIVE"
              : step.kind === "OFFER_TIMEOUT"
                ? observedAt < new Date(offerDeadline)
                  ? "CASE_INTELLIGENCE_ESCALATION_OFFER_TIMEOUT_NOT_DUE"
                  : null
                : observedAt >= new Date(offerDeadline)
                  ? "CASE_INTELLIGENCE_ESCALATION_OFFER_EXPIRED"
                  : null
            : null;
      if (timeBlock) {
        disposition = "BLOCKED";
        ordinaryReasonCode = timeBlock;
      } else if (temporalBlock) {
        disposition = "BLOCKED";
        ordinaryReasonCode = temporalBlock;
      } else if (step.kind === "POLICY_SWITCH") {
        const pristine =
          state.status === "OPEN" &&
          state.clarificationCount === 0 &&
          state.failedResolutionCount === 0 &&
          state.noMatchCount === 0 &&
          state.repeatCount === 0 &&
          !state.reasonAsked &&
          Object.values(state.trustedOutcomeCounts ?? {}).every(
            (value) => value === 0,
          );
        if (pristine) {
          policyMigration = "APPLIED";
          ordinaryReasonCode = "CASE_INTELLIGENCE_SIMULATION_POLICY_SWITCHED";
          ordinaryEffects.push("POLICY_SWITCH");
        } else {
          policyMigration = "REQUIRED";
          disposition = "BLOCKED";
          ordinaryReasonCode =
            "CASE_INTELLIGENCE_ESCALATION_POLICY_MIGRATION_REQUIRED";
        }
      } else if (!frozen && step.kind === "EXPLICIT_HUMAN_REQUEST") {
        action = "ESCALATE";
        ordinaryReasonCode = "CASE_INTELLIGENCE_EXPLICIT_HUMAN_REQUEST";
      } else if (
        !frozen &&
        (step.kind === "AMBIGUOUS_HUMAN_TERM" || step.kind === "SCENARIO")
      ) {
        action =
          step.kind === "AMBIGUOUS_HUMAN_TERM"
            ? (definition.ambiguousHumanTermRules.find(
                (rule) => rule.code === step.ruleCode,
              )?.action ?? "OFFER")
            : (definition.scenarios.find(
                (scenario) => scenario.code === step.scenarioCode,
              )?.action ?? "OFFER");
        ordinaryReasonCode = `CASE_INTELLIGENCE_${step.kind}`;
        if (action === "ASK_REASON_ONCE") {
          if (state.reasonAsked) action = "NONE";
          else state.reasonAsked = true;
        }
      } else if (!frozen && step.kind === "OFFER_ACCEPTED") {
        if (state.status === "OFFERED") {
          action = "ESCALATE";
          ordinaryReasonCode = "CASE_INTELLIGENCE_OFFER_ACCEPTED";
        } else {
          disposition = "BLOCKED";
          ordinaryReasonCode =
            "CASE_INTELLIGENCE_ESCALATION_TRANSITION_INVALID";
        }
      } else if (
        !frozen &&
        (step.kind === "OFFER_DECLINED" || step.kind === "OFFER_TIMEOUT")
      ) {
        if (state.status === "OFFERED") {
          state.status = "COOLDOWN";
          ordinaryReasonCode =
            step.kind === "OFFER_DECLINED"
              ? "CASE_INTELLIGENCE_OFFER_DECLINED"
              : "CASE_INTELLIGENCE_OFFER_TIMEOUT";
          cooldownUntil = new Date(
            observedAt.getTime() + definition.offerCooldownSeconds * 1_000,
          ).toISOString();
          offerDeadline = null;
        } else {
          disposition = "BLOCKED";
          ordinaryReasonCode =
            "CASE_INTELLIGENCE_ESCALATION_TRANSITION_INVALID";
        }
      } else if (!frozen && step.kind === "TRUSTED_OUTCOME" && step.outcome) {
        state.failedResolutionCount += 1;
        state.trustedOutcomeCounts ??= {};
        state.trustedOutcomeCounts[step.outcome] =
          (state.trustedOutcomeCounts[step.outcome] ?? 0) + 1;
        const outcomeLimit = definition.trustedOutcomeLimits.find(
          (item) => item.outcome === step.outcome,
        )?.limit;
        if (
          (outcomeLimit !== undefined &&
            state.trustedOutcomeCounts[step.outcome] >= outcomeLimit) ||
          state.failedResolutionCount >= definition.failedResolutionLimit
        ) {
          action = "ESCALATE";
          ordinaryReasonCode = `CASE_INTELLIGENCE_${step.outcome}_LIMIT`;
        } else
          ordinaryReasonCode = "CASE_INTELLIGENCE_TRUSTED_OUTCOME_RECORDED";
      } else if (
        !frozen &&
        ["CLARIFICATION", "NO_MATCH", "REPEAT"].includes(step.kind)
      ) {
        const counter =
          step.kind === "CLARIFICATION"
            ? "clarificationCount"
            : step.kind === "NO_MATCH"
              ? "noMatchCount"
              : "repeatCount";
        const limit =
          step.kind === "CLARIFICATION"
            ? definition.clarificationLimit
            : step.kind === "NO_MATCH"
              ? definition.noMatchLimit
              : definition.repeatLimit;
        state[counter] += 1;
        if (limit > 0 && state[counter] >= limit) {
          action = "ESCALATE";
          ordinaryReasonCode = `CASE_INTELLIGENCE_${step.kind}_LIMIT`;
        } else ordinaryReasonCode = `CASE_INTELLIGENCE_${step.kind}_RECORDED`;
      }
      if (
        !frozen &&
        (step.kind === "VERIFIED_RESOLUTION" ||
          step.kind === "NEW_CASE_OR_TOPIC")
      ) {
        state = emptyState();
        offerDeadline = null;
        cooldownUntil = null;
        ordinaryReasonCode = "CASE_INTELLIGENCE_OCCURRENCE_RESET";
      }
      if (!frozen && step.kind === "CASE_TERMINAL") {
        state.status = "FROZEN";
        ordinaryReasonCode = "CASE_INTELLIGENCE_CASE_TERMINAL";
      }
      if (action === "OFFER") {
        state.status = "OFFERED";
        offerDeadline = new Date(
          observedAt.getTime() + definition.offerResponseTimeoutSeconds * 1_000,
        ).toISOString();
      }
      if (action === "ESCALATE") {
        state.status = "ESCALATED";
        offerDeadline = null;
      }
      if (step.kind === "ESCALATION_COMMITTED") {
        state.status = "FROZEN";
        ordinaryReasonCode = "CASE_INTELLIGENCE_ESCALATION_COMMITTED";
      }
      if (before.status !== state.status)
        ordinaryEffects.push(`STATE_${state.status}`);
      const ordinaryAction = action;
      let reasonCode = ordinaryReasonCode;
      if (
        !timeBlock &&
        step.kind !== "POLICY_SWITCH" &&
        consequences.includes("CASE_ESCALATION")
      ) {
        action = "ESCALATE";
        reasonCode = "CASE_INTELLIGENCE_SAFETY_CASE_ESCALATION";
        if (state.status !== "FROZEN" && state.status !== "ESCALATED") {
          state.status = "ESCALATED";
          if (!safetyEffects.includes("STATE_ESCALATED"))
            safetyEffects.push("STATE_ESCALATED");
        }
      }
      const routingAdmission =
        action === "ESCALATE"
          ? step.routing.businessState === "CLOSED"
            ? "OUT_OF_HOURS"
            : step.routing.queueState === "NO_ELIGIBLE_OPERATOR"
              ? "NO_ELIGIBLE_TEAM"
              : step.routing.queueState === "UNKNOWN"
                ? "DELIVERY_DEGRADED"
                : "ROUTABLE"
          : "NOT_REQUIRED";
      const response: SimulationStepResult = {
        index,
        stepId: step.stepId,
        kind: step.kind,
        attemptId: step.attemptId,
        outcomeId: step.outcomeId,
        observedAt: step.observedAt,
        occurrenceNumber: 1,
        before,
        after: cloneEscalation(state),
        action,
        reasonCode,
        ordinaryReasonCode,
        policyReasonCode: null,
        sourceCode: step.ruleCode ?? step.scenarioCode ?? null,
        urgency: ordinaryAction === "ESCALATE" ? "HIGH" : null,
        dataToCollect: [],
        effects: [...ordinaryEffects, ...(timeBlock ? [] : safetyEffects)],
        replay: false,
        replayOfStep: null,
        disposition,
        policyHash: "e".repeat(64),
        policyMigration,
        offerDeadline,
        cooldownUntil,
        routingPolicyRevisionId: definition.routingPolicyRevisionId,
        routingAdmission,
        safety: stepSafety,
      };
      const record = { inputSignature, result: response };
      priorByAttempt.set(step.attemptId, record);
      priorByOutcome.set(step.outcomeId, record);
      return response;
    });
    return {
      executionMode: "NON_DISPATCHING",
      sideEffectsCommitted: false,
      initialPolicyHash: "e".repeat(64),
      finalPolicyHash: "e".repeat(64),
      safetyPolicyRevisionId: "safety-v4",
      steps: output,
    };
  },
  async saveDraft(projectId, definition, expectedVersion) {
    const state = mockState(projectId);
    const latest = Math.max(
      state.escalation?.draft?.version ?? 0,
      state.escalation?.published?.version ?? 0,
    );
    if (expectedVersion !== latest)
      throw new ApiError(
        409,
        "Версия изменилась",
        undefined,
        undefined,
        "VERSION_CONFLICT",
      );
    const revision = mockRevision(projectId, latest + 1, "DRAFT", definition);
    state.escalation = {
      draft: revision,
      published: state.escalation?.published ?? null,
    };
  },
  async discardDraft(projectId, expectedVersion) {
    const state = mockState(projectId);
    const draft = state.escalation?.draft;
    if (!draft || draft.version !== expectedVersion)
      throw new ApiError(
        409,
        "Версия изменилась",
        undefined,
        undefined,
        "VERSION_CONFLICT",
      );
    state.escalation = {
      draft: null,
      published: state.escalation?.published ?? null,
    };
  },
  async publish(projectId, revisionId, expectedVersion) {
    const state = mockState(projectId);
    const draft = state.escalation?.draft;
    if (!draft || draft.id !== revisionId || draft.version !== expectedVersion)
      throw new ApiError(
        409,
        "Версия изменилась",
        undefined,
        undefined,
        "VERSION_CONFLICT",
      );
    const revision: EscalationRevision = {
      ...cloneEscalation(draft),
      status: "PUBLISHED",
      publishedAt: null,
    };
    state.escalation = { draft: null, published: revision };
  },
  async lookupCommand(projectId) {
    const result =
      mockState(projectId).escalation?.draft ??
      mockState(projectId).escalation?.published;
    if (!result) throw new ApiError(404, "Команда не найдена");
    void result;
  },
};

export const supportCaseEscalationSource = isMockMode
  ? mockSupportCaseEscalationSource
  : apiSupportCaseEscalationSource;
