import {
  supportLeadActivity,
  supportLeadAdmission,
  supportLeadCapacityRisks,
  supportLeadCaseRisks,
  supportLeadInvestigation,
  supportLeadTargetList,
  supportLeadSummary,
  supportOperationalAlertCommandAcknowledge,
  supportOperationalAlertCommandResolve,
  supportOperationalAlertCommandChangeOwner,
  supportOperationalAlertDetail,
  supportOperationalAlertList,
} from "@/shared/api/generated/retenive-backend";
import type {
  SupportActivityResponseDto,
  SupportLeadAdmissionResponseDto,
  SupportLeadCapacityRisksResponseDto,
  SupportLeadInvestigationResponseDto,
  SupportLeadCaseRisksResponseDto,
  SupportLeadSummaryResponseDto,
  SupportOperationalAlertDetailResponseDto,
  SupportOperationalAlertCommandReceiptDto,
  SupportOperationalAlertListResponseDto,
} from "@/shared/api/generated/models";
import { normalizeApiError } from "@/shared/api/http/api-error";
import { isMockMode } from "@/shared/config/data-mode";

export interface SupportLeadSummary {
  computedAt: string;
  freshnessState: "BUILDING" | "READY" | "STALE" | "DEGRADED";
  actionableBacklog: {
    unassignedCount: number;
    oldestUnassignedAgeMs: number | null;
  };
  sla: {
    atRiskCount: number;
    breachedCount: number;
    oldestDueAgeMs: number | null;
  };
  workforce: {
    availability: Record<"AVAILABLE" | "BUSY" | "AWAY" | "DRAINING" | "OFFLINE", number>;
    capacityGapUnits: number;
    currentWorkloadUnits: number;
    maximumCapacityUnits: number;
  };
  delivery: {
    pendingCount: number;
    outcomeUnknownCount: number;
    state: "AVAILABLE";
  };
  projectionHealth: {
    deadLetterCount: number;
    retryCount: number;
    state: "AVAILABLE";
  };
}

export interface SupportLeadReadiness {
  readinessState: "NOT_PROVISIONED" | "BUILDING" | "READY" | "STALE" | "DEGRADED";
  evaluatedAt: string;
  computedAt: string | null;
  projectionGeneration: number | null;
  checkpoint: string | null;
  sourceHighWater: string | null;
  capabilities: {
    summary: "AVAILABLE" | "UNAVAILABLE";
    caseRisks: "AVAILABLE" | "UNAVAILABLE";
    capacityRisks: "AVAILABLE" | "UNAVAILABLE";
    investigation: "AVAILABLE" | "OWNER_FALLBACK" | "UNAVAILABLE";
    activity: "AVAILABLE" | "UNAVAILABLE";
    realtime: "AVAILABLE" | "UNAVAILABLE";
  };
}

export interface SupportLeadCapacityRisk {
  riskId: string;
  riskVersion: number;
  lastDecisionId: string;
  observedAt: string;
  requiredCapacityUnits: number;
  teamId: string | null;
  queue: { id: string; code: string; name: string } | null;
  exclusionCounts: Record<string, number>;
}

export interface SupportLeadCapacityRiskPage {
  computedAt: string;
  freshnessState: "BUILDING" | "READY" | "STALE" | "DEGRADED";
  state: "AVAILABLE" | "UNAVAILABLE";
  items: SupportLeadCapacityRisk[];
  nextCursor: string | null;
}

export interface SupportLeadSafeFact {
  id: string;
  sequence: string;
  occurredAt: string;
  kind: string;
  eventCode: string;
  actorType: string;
  actorCmsUserId: string | null;
  actorSystemCode: string | null;
  caseId: string | null;
  conversationId: string | null;
  assignmentId: string | null;
  messageId: string | null;
  operatorCmsUserId: string | null;
  targetTeamId: string | null;
  ownerVersion: number | null;
  eligibilityOverride: { bypassAvailability?: boolean; bypassCapacity?: boolean } | null;
  reasonCode: string | null;
  commandOutcome: string | null;
  deliveryState: string | null;
  deliveryId: string | null;
  schemaVersion: number;
}

export interface SupportLeadInvestigation {
  caseId: string;
  computedAt: string;
  freshnessState: "BUILDING" | "READY" | "STALE" | "DEGRADED";
  effectiveWindow: { from: string; to: string } | null;
  evidenceSource: "PROJECTION_WITH_OWNER" | "OWNER_FALLBACK";
  pinned: Record<string, string | null>;
  timelineSources: Record<string, string>;
  actionTokens: {
    caseVersion: number;
    caseReadToken: string;
    assignmentEtag: string | null;
  };
  routingFactsState: "AVAILABLE" | "NOT_EVALUATED";
  routing: {
    assignmentState: string;
    reasonCode: string;
    reservation: {
      expiresAt: string;
      capacityWeightUnits: number;
    } | null;
    decision: {
      id: string;
      outcome: string;
      mode: string;
      candidateCount: number;
      evaluatedAt: string;
      queue: { id: string; code: string; name: string } | null;
      exclusionCounts: Record<string, number>;
    } | null;
    fallback: { state: string; candidateAttempt: number; availableAt: string } | null;
  } | null;
  facts: SupportLeadSafeFact[];
  nextCursor: string | null;
}

export interface SupportLeadActivityPage {
  computedAt: string;
  freshnessState: "BUILDING" | "READY" | "STALE" | "DEGRADED";
  effectiveWindow: { from: string; to: string } | null;
  facts: SupportLeadSafeFact[];
  nextCursor: string | null;
}

export const SUPPORT_LEAD_RISK_TYPES = [
  "UNASSIGNED_AGED",
  "SLA_AT_RISK",
  "SLA_BREACHED",
  "DELIVERY_OUTCOME_UNKNOWN",
] as const;

export type SupportLeadRiskType = (typeof SUPPORT_LEAD_RISK_TYPES)[number];

export interface SupportLeadCaseRisk {
  caseId: string;
  caseVersion: number;
  assignmentVersion: number | null;
  deliveryVersion: number | null;
  detectedAt: string;
  dueAt: string | null;
  riskSortAt: string;
  riskType: SupportLeadRiskType;
  slaClockVersion: number | null;
}

export interface SupportLeadCaseRiskPage {
  computedAt: string;
  freshnessState: "BUILDING" | "READY" | "STALE" | "DEGRADED";
  riskType: SupportLeadRiskType;
  items: SupportLeadCaseRisk[];
  nextCursor: string | null;
}

export interface SupportOperationalAlert {
  id: string;
  /** Monotonic server version used as the next command's If-Match value. */
  version: number;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  state: "NEW" | "ACKNOWLEDGED" | "RESOLVED";
  sourceKind: string;
  firstObservedAt: string;
  lastObservedAt: string;
  occurrenceCount: number;
  hasOwner: boolean;
  ownerCmsUserId?: string | null;
}

export interface SupportLeadTarget {
  id: string;
  displayName: string;
  teamIds: string[];
}

export interface SupportOperationalAlertPage {
  computedAt: string;
  materializationState: "READY" | "DEGRADED";
  items: SupportOperationalAlert[];
  nextCursor: string | null;
}

export interface SupportOperationalAlertDetail {
  alert: SupportOperationalAlert;
  computedAt: string;
  materializationState: "READY" | "DEGRADED";
  effectiveWindow: { from: string; to: string };
  generation: number;
  policyRevisionId: string;
  nextCursor: string | null;
  timeline: Array<{
    id: string;
    eventKind: "SOURCE_OBSERVED" | "OWNER_CHANGED" | "ACKNOWLEDGED" | "RESOLVED" | "REOPENED";
    occurredAt: string;
    actorType: "CMS_USER" | "SYSTEM" | "BREAK_GLASS";
    beforeVersion: number | null;
    afterVersion: number;
    generation: number;
    policyRevisionId: string;
    reasonCode: string | null;
  }>;
}

export interface SupportLeadSummarySource {
  readSummary(projectId: string, signal?: AbortSignal): Promise<SupportLeadSummary>;
}

export interface SupportLeadRisksSource {
  readCaseRisks(
    projectId: string,
    riskType: SupportLeadRiskType,
    request?: { cursor?: string; limit?: number },
    signal?: AbortSignal,
  ): Promise<SupportLeadCaseRiskPage>;
}

export interface SupportOperationalAlertsSource {
  readAlerts(
    projectId: string,
    request?: { cursor?: string; limit?: number; from?: string; to?: string },
    signal?: AbortSignal,
  ): Promise<SupportOperationalAlertPage>;
  readAlertDetail(
    projectId: string,
    alertId: string,
    request?: { cursor?: string; limit?: number; from?: string; to?: string },
    signal?: AbortSignal,
  ): Promise<SupportOperationalAlertDetail>;
  readAlertOwnerTargets?(
    projectId: string,
    signal?: AbortSignal,
  ): Promise<SupportLeadTarget[]>;
  acknowledge(
    projectId: string,
    alertId: string,
    input: {
      reasonCode: "INVESTIGATING" | "OWNERSHIP_ACCEPTED" | "ESCALATED";
      expectedVersion: number;
      idempotencyKey: string;
    },
  ): Promise<SupportOperationalAlertCommandReceipt>;
  resolve(
    projectId: string,
    alertId: string,
    input: {
      reasonCode:
        | "RISK_CLEARED"
        | "MITIGATED"
        | "FALSE_POSITIVE"
        | "DUPLICATE"
        | "EXTERNAL_INCIDENT_HANDOFF";
      expectedVersion: number;
      idempotencyKey: string;
    },
  ): Promise<SupportOperationalAlertCommandReceipt>;
  changeOwner?(
    projectId: string,
    alertId: string,
    input: {
      ownerCmsUserId: string | null;
      reasonCode: "LEAD_ASSIGNMENT" | "LOAD_BALANCE" | "SHIFT_HANDOFF" | "SKILL_MATCH" | "OWNER_UNAVAILABLE";
      expectedVersion: number;
      idempotencyKey: string;
    },
  ): Promise<SupportOperationalAlertCommandReceipt>;
}

export interface SupportOperationalAlertCommandReceipt {
  alertId: string;
  state: "NEW" | "ACKNOWLEDGED" | "RESOLVED";
  version: number;
  occurredAt: string;
  replayed: boolean;
  ownerCmsUserId: string | null;
}

export type SupportLeadSource =
  & SupportLeadSummarySource
  & SupportLeadRisksSource
  & SupportOperationalAlertsSource;

export interface SupportLeadDrilldownSource {
  readReadiness(projectId: string, signal?: AbortSignal): Promise<SupportLeadReadiness>;
  readCapacityRisks(
    projectId: string,
    request?: { cursor?: string; limit?: number },
    signal?: AbortSignal,
  ): Promise<SupportLeadCapacityRiskPage>;
  readInvestigation(
    projectId: string,
    caseId: string,
    request?: { cursor?: string; limit?: number; from?: string; to?: string },
    signal?: AbortSignal,
  ): Promise<SupportLeadInvestigation>;
  readActivity(
    projectId: string,
    caseId: string,
    request?: { cursor?: string; limit?: number; from?: string; to?: string },
    signal?: AbortSignal,
  ): Promise<SupportLeadActivityPage>;
}

function mapReadiness(response: SupportLeadAdmissionResponseDto): SupportLeadReadiness {
  return {
    readinessState: response.readinessState,
    evaluatedAt: response.evaluatedAt,
    computedAt: response.computedAt,
    projectionGeneration: response.projectionGeneration,
    checkpoint: response.checkpoint,
    sourceHighWater: response.sourceHighWater,
    capabilities: response.capabilities,
  };
}

function mapFact(fact: SupportActivityResponseDto["data"]["facts"][number]): SupportLeadSafeFact {
  return {
    id: fact.activityId,
    sequence: fact.activitySequence,
    occurredAt: fact.occurredAt,
    kind: fact.factKind,
    eventCode: fact.eventCode,
    actorType: fact.actor.type,
    actorCmsUserId: fact.actor.cmsUserId,
    actorSystemCode: fact.actor.systemCode,
    caseId: fact.caseId,
    conversationId: fact.conversationId,
    assignmentId: fact.assignmentId,
    messageId: fact.messageId,
    operatorCmsUserId: fact.operatorCmsUserId,
    targetTeamId: fact.targetTeamId,
    ownerVersion: fact.ownerVersion,
    eligibilityOverride: fact.eligibilityOverride,
    reasonCode: fact.reasonCode,
    commandOutcome: fact.commandOutcome,
    deliveryState: fact.deliveryState,
    deliveryId: fact.deliveryId,
    schemaVersion: fact.schemaVersion,
  };
}

function mapCapacityRisks(response: SupportLeadCapacityRisksResponseDto): SupportLeadCapacityRiskPage {
  return {
    computedAt: response.computedAt,
    freshnessState: response.freshnessState,
    state: response.data.state,
    items: response.data.items.map((item) => ({
      riskId: item.riskId,
      riskVersion: item.riskVersion,
      lastDecisionId: item.lastDecisionId,
      observedAt: item.observedAt,
      requiredCapacityUnits: item.requiredCapacityUnits,
      teamId: item.teamId,
      queue: item.queue,
      exclusionCounts: { ...item.eligibilityExclusionCounts },
    })),
    nextCursor: response.nextCursor,
  };
}

function mapInvestigation(response: SupportLeadInvestigationResponseDto): SupportLeadInvestigation {
  return {
    caseId: response.caseId,
    computedAt: response.computedAt,
    freshnessState: response.freshnessState,
    effectiveWindow: response.effectiveWindow,
    evidenceSource: response.data.evidenceSource,
    pinned: { ...response.data.pinned },
    timelineSources: { ...response.data.timelineSources },
    actionTokens: {
      caseVersion: response.data.actionTokens.caseVersion,
      caseReadToken: response.data.actionTokens.caseReadToken,
      assignmentEtag: response.data.actionTokens.assignmentEtag,
    },
    routingFactsState: response.data.routingFactsState,
    routing: response.data.routing
      ? {
          assignmentState: response.data.routing.assignmentState,
          reasonCode: response.data.routing.reasonCode,
          reservation: response.data.routing.reservation
            ? {
                expiresAt: response.data.routing.reservation.expiresAt,
                capacityWeightUnits: response.data.routing.reservation.capacityWeightUnits,
              }
            : null,
          decision: response.data.routing.decision
            ? {
                id: response.data.routing.decision.id,
                outcome: response.data.routing.decision.outcome,
                mode: response.data.routing.decision.mode,
                candidateCount: response.data.routing.decision.candidateCount,
                evaluatedAt: response.data.routing.decision.evaluatedAt,
                queue: response.data.routing.decision.queue,
                exclusionCounts: { ...response.data.routing.decision.exclusionCounts },
              }
            : null,
          fallback: response.data.routing.fallback,
        }
      : null,
    facts: response.data.facts.map(mapFact),
    nextCursor: response.nextCursor,
  };
}

function mapActivity(response: SupportActivityResponseDto): SupportLeadActivityPage {
  return {
    computedAt: response.computedAt,
    freshnessState: response.freshnessState,
    effectiveWindow: response.effectiveWindow,
    facts: response.data.facts.map(mapFact),
    nextCursor: response.nextCursor,
  };
}

function mapSummary(response: SupportLeadSummaryResponseDto): SupportLeadSummary {
  return {
    computedAt: response.computedAt,
    freshnessState: response.freshnessState,
    actionableBacklog: response.data.actionableBacklog,
    sla: response.data.sla,
    workforce: response.data.workforce,
    delivery: response.data.delivery,
    projectionHealth: response.data.projectionHealth,
  };
}

function mapCaseRisks(
  response: SupportLeadCaseRisksResponseDto,
): SupportLeadCaseRiskPage {
  return {
    computedAt: response.computedAt,
    freshnessState: response.freshnessState,
    riskType: response.riskType,
    items: response.data.items.map((item) => ({
      caseId: item.caseId,
      caseVersion: item.caseVersion,
      assignmentVersion: item.assignmentVersion,
      deliveryVersion: item.deliveryVersion,
      detectedAt: item.detectedAt,
      dueAt: item.dueAt,
      riskSortAt: item.riskSortAt,
      riskType: item.riskType,
      slaClockVersion: item.slaClockVersion,
    })),
    nextCursor: response.nextCursor,
  };
}

function mapAlert(item: SupportOperationalAlertListResponseDto["items"][number]): SupportOperationalAlert {
  return {
    id: item.id,
    version: item.version,
    severity: item.currentSeverity,
    state: item.state,
    sourceKind: item.sourceKind,
    firstObservedAt: item.firstObservedAt,
    lastObservedAt: item.lastObservedAt,
    occurrenceCount: item.occurrenceCount,
    hasOwner: item.ownerCmsUserId !== null,
    ownerCmsUserId: item.ownerCmsUserId,
  };
}

function mapAlertCommandReceipt(
  response: SupportOperationalAlertCommandReceiptDto,
): SupportOperationalAlertCommandReceipt {
  return {
    alertId: response.alertId,
    state: response.state,
    version: response.version,
    occurredAt: response.occurredAt,
    replayed: response.replayed,
    ownerCmsUserId: response.ownerCmsUserId,
  };
}

function mapAlerts(
  response: SupportOperationalAlertListResponseDto,
): SupportOperationalAlertPage {
  return {
    computedAt: response.materialization.computedAt,
    materializationState: response.materialization.state,
    items: response.items.map(mapAlert),
    nextCursor: response.nextCursor,
  };
}

function mapAlertDetail(
  response: SupportOperationalAlertDetailResponseDto,
): SupportOperationalAlertDetail {
  return {
    alert: mapAlert({
      ...response.alert,
    }),
    computedAt: response.materialization.computedAt,
    materializationState: response.materialization.state,
    effectiveWindow: response.effectiveWindow,
    generation: response.generation.generation,
    policyRevisionId: response.generation.policyRevisionId,
    nextCursor: response.timeline.nextCursor,
    timeline: response.timeline.items.map((item) => ({
      id: item.id,
      eventKind: item.eventKind,
      occurredAt: item.occurredAt,
      actorType: item.actor.type,
      beforeVersion: item.beforeVersion,
      afterVersion: item.afterVersion,
      generation: item.generation,
      policyRevisionId: item.policyRevisionId,
      reasonCode: item.reasonCode,
    })),
  };
}

const apiSource: SupportLeadSource & SupportLeadDrilldownSource = {
  async readReadiness(projectId, signal) {
    try {
      return mapReadiness(await supportLeadAdmission(projectId, { signal }));
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async readSummary(projectId, signal) {
    try {
      return mapSummary(await supportLeadSummary(projectId, { signal }));
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async readCaseRisks(projectId, riskType, request, signal) {
    try {
      return mapCaseRisks(
        await supportLeadCaseRisks(
          projectId,
          {
            riskType,
            limit: request?.limit ?? 25,
            ...(request?.cursor ? { cursor: request.cursor } : {}),
          },
          { signal },
        ),
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async readCapacityRisks(projectId, request, signal) {
    try {
      return mapCapacityRisks(
        await supportLeadCapacityRisks(
          projectId,
          { limit: request?.limit ?? 50, ...(request?.cursor ? { cursor: request.cursor } : {}) },
          { signal },
        ),
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async readInvestigation(projectId, caseId, request, signal) {
    try {
      return mapInvestigation(
        await supportLeadInvestigation(
          projectId,
          caseId,
          {
            limit: request?.limit ?? 100,
            ...(request?.cursor ? { cursor: request.cursor } : {}),
            ...(request?.from ? { from: request.from } : {}),
            ...(request?.to ? { to: request.to } : {}),
          },
          { signal },
        ),
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async readActivity(projectId, caseId, request, signal) {
    const to = request?.to ? new Date(request.to) : new Date();
    const from = request?.from
      ? new Date(request.from)
      : new Date(to.getTime() - 7 * 24 * 60 * 60 * 1_000);
    try {
      return mapActivity(
        await supportLeadActivity(
          projectId,
          {
            caseId,
            from: from.toISOString(),
            to: to.toISOString(),
            limit: request?.limit ?? 100,
            ...(request?.cursor ? { cursor: request.cursor } : {}),
          },
          { signal },
        ),
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async readAlerts(projectId, request, signal) {
    try {
      return mapAlerts(
        await supportOperationalAlertList(
          projectId,
          {
            active: "true",
            limit: request?.limit ?? 25,
            ...(request?.cursor ? { cursor: request.cursor } : {}),
          },
          { signal },
        ),
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async readAlertDetail(projectId, alertId, request, signal) {
    try {
      return mapAlertDetail(
        await supportOperationalAlertDetail(
          projectId,
          alertId,
          {
            limit: request?.limit ?? 100,
            ...(request?.cursor ? { cursor: request.cursor } : {}),
            ...(request?.from ? { from: request.from } : {}),
            ...(request?.to ? { to: request.to } : {}),
          },
          { signal },
        ),
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async readAlertOwnerTargets(projectId, signal) {
    try {
      const response = await supportLeadTargetList(
        projectId,
        { purpose: "ALERT_OWNER" },
        { signal },
      );
      return response.items
        .filter((item) => item.actions.assignAlertOwner)
        .map((item) => ({ id: item.id, displayName: item.displayName, teamIds: item.teamIds }));
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async acknowledge(projectId, alertId, input) {
    try {
      return mapAlertCommandReceipt(
        await supportOperationalAlertCommandAcknowledge(
          projectId,
          alertId,
          { reasonCode: input.reasonCode },
          {
            headers: {
              "Idempotency-Key": input.idempotencyKey,
              "If-Match": `"${input.expectedVersion}"`,
            },
          },
        ),
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async resolve(projectId, alertId, input) {
    try {
      return mapAlertCommandReceipt(
        await supportOperationalAlertCommandResolve(
          projectId,
          alertId,
          { reasonCode: input.reasonCode },
          {
            headers: {
              "Idempotency-Key": input.idempotencyKey,
              "If-Match": `"${input.expectedVersion}"`,
            },
          },
        ),
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async changeOwner(projectId, alertId, input) {
    try {
      return mapAlertCommandReceipt(
        await supportOperationalAlertCommandChangeOwner(
          projectId,
          alertId,
          { ownerCmsUserId: input.ownerCmsUserId, reasonCode: input.reasonCode },
          {
            headers: {
              "Idempotency-Key": input.idempotencyKey,
              "If-Match": `"${input.expectedVersion}"`,
            },
          },
        ),
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
};

const mockSource: SupportLeadSource & SupportLeadDrilldownSource = {
  async readReadiness(_, signal) {
    if (signal?.aborted) throw signal.reason;
    return {
      readinessState: "READY",
      evaluatedAt: new Date().toISOString(),
      computedAt: new Date().toISOString(),
      projectionGeneration: 7,
      checkpoint: "141",
      sourceHighWater: "141",
      capabilities: {
        summary: "AVAILABLE",
        caseRisks: "AVAILABLE",
        capacityRisks: "AVAILABLE",
        investigation: "AVAILABLE",
        activity: "AVAILABLE",
        realtime: "AVAILABLE",
      },
    };
  },
  async readSummary(_, signal) {
    if (signal?.aborted) throw signal.reason;
    return {
      computedAt: new Date().toISOString(),
      freshnessState: "READY",
      actionableBacklog: { unassignedCount: 3, oldestUnassignedAgeMs: 1_080_000 },
      sla: { atRiskCount: 2, breachedCount: 1, oldestDueAgeMs: 420_000 },
      workforce: {
        availability: {
          AVAILABLE: 4,
          BUSY: 2,
          AWAY: 1,
          DRAINING: 0,
          OFFLINE: 3,
        },
        capacityGapUnits: 2,
        currentWorkloadUnits: 16,
        maximumCapacityUnits: 24,
      },
      delivery: { pendingCount: 2, outcomeUnknownCount: 1, state: "AVAILABLE" },
      projectionHealth: { deadLetterCount: 0, retryCount: 1, state: "AVAILABLE" },
    };
  },
  async readCaseRisks(_, riskType, __, signal) {
    if (signal?.aborted) throw signal.reason;
    const now = new Date().toISOString();
    const cases: Record<SupportLeadRiskType, SupportLeadCaseRisk[]> = {
      UNASSIGNED_AGED: [
        {
          caseId: "case-risk-101",
          caseVersion: 4,
          assignmentVersion: null,
          deliveryVersion: null,
          detectedAt: now,
          dueAt: null,
          riskSortAt: now,
          riskType,
          slaClockVersion: null,
        },
      ],
      SLA_AT_RISK: [
        {
          caseId: "case-risk-102",
          caseVersion: 7,
          assignmentVersion: 3,
          deliveryVersion: null,
          detectedAt: now,
          dueAt: now,
          riskSortAt: now,
          riskType,
          slaClockVersion: 2,
        },
      ],
      SLA_BREACHED: [
        {
          caseId: "case-risk-103",
          caseVersion: 2,
          assignmentVersion: null,
          deliveryVersion: null,
          detectedAt: now,
          dueAt: now,
          riskSortAt: now,
          riskType,
          slaClockVersion: 1,
        },
      ],
      DELIVERY_OUTCOME_UNKNOWN: [
        {
          caseId: "case-risk-104",
          caseVersion: 9,
          assignmentVersion: 4,
          deliveryVersion: 5,
          detectedAt: now,
          dueAt: null,
          riskSortAt: now,
          riskType,
          slaClockVersion: null,
        },
      ],
    };
    return {
      computedAt: now,
      freshnessState: "READY",
      riskType,
      items: cases[riskType],
      nextCursor: null,
    };
  },
  async readCapacityRisks(_, __, signal) {
    if (signal?.aborted) throw signal.reason;
    return {
      computedAt: new Date().toISOString(),
      freshnessState: "READY",
      state: "AVAILABLE",
      items: [{
        riskId: "capacity-risk-demo",
        riskVersion: 1,
        lastDecisionId: "routing-decision-demo",
        observedAt: new Date().toISOString(),
        requiredCapacityUnits: 3,
        teamId: "team-payments",
        queue: { id: "queue-payments", code: "PAYMENTS", name: "Платежи" },
        exclusionCounts: { CAPACITY_EXHAUSTED: 2, AVAILABILITY_NOT_ROUTABLE: 1 },
      }],
      nextCursor: null,
    };
  },
  async readInvestigation(_, caseId, __, signal) {
    if (signal?.aborted) throw signal.reason;
    const now = new Date().toISOString();
    return {
      caseId,
      computedAt: now,
      freshnessState: "READY",
      effectiveWindow: { from: now, to: now },
      evidenceSource: "PROJECTION_WITH_OWNER",
      pinned: {},
      timelineSources: {},
      actionTokens: { caseVersion: 4, caseReadToken: "read-token-demo", assignmentEtag: null },
      routingFactsState: "AVAILABLE",
      routing: {
        assignmentState: "RESERVED",
        reasonCode: "ROUTING_OFFER_ACTIVE",
        reservation: { expiresAt: new Date(Date.now() + 90_000).toISOString(), capacityWeightUnits: 1 },
        decision: null,
        fallback: null,
      },
      facts: [{
        id: "fact-demo-1",
        sequence: "140",
        occurredAt: now,
        kind: "ASSIGNMENT",
        eventCode: "SUPPORT_ASSIGNMENT_OFFERED",
        actorType: "SYSTEM",
        actorCmsUserId: null,
        actorSystemCode: "support-routing",
        caseId,
        conversationId: null,
        assignmentId: null,
        messageId: null,
        operatorCmsUserId: null,
        targetTeamId: null,
        ownerVersion: null,
        eligibilityOverride: null,
        reasonCode: null,
        commandOutcome: null,
        deliveryState: null,
        deliveryId: null,
        schemaVersion: 1,
      }],
      nextCursor: null,
    };
  },
  async readActivity(_, caseId, __, signal) {
    if (signal?.aborted) throw signal.reason;
    const investigation = await mockSource.readInvestigation(_, caseId, undefined, signal);
    return {
      computedAt: investigation.computedAt,
      freshnessState: investigation.freshnessState,
      effectiveWindow: investigation.effectiveWindow,
      facts: investigation.facts,
      nextCursor: null,
    };
  },
  async readAlerts(_, __, signal) {
    if (signal?.aborted) throw signal.reason;
    const now = new Date().toISOString();
    return {
      computedAt: now,
      materializationState: "READY",
      items: [
        {
          id: "alert-demo-1",
          version: 1,
          severity: "HIGH",
          state: "NEW",
          sourceKind: "UNASSIGNED_AGED",
          firstObservedAt: now,
          lastObservedAt: now,
          occurrenceCount: 2,
          hasOwner: false,
          ownerCmsUserId: null,
        },
      ],
      nextCursor: null,
    };
  },
  async readAlertDetail(_, alertId, __, signal) {
    if (signal?.aborted) throw signal.reason;
    const now = new Date().toISOString();
    return {
      alert: {
        id: alertId,
        version: 1,
        severity: "HIGH",
        state: "NEW",
        sourceKind: "UNASSIGNED_AGED",
        firstObservedAt: now,
        lastObservedAt: now,
        occurrenceCount: 2,
        hasOwner: false,
        ownerCmsUserId: null,
      },
      computedAt: now,
      materializationState: "READY",
      effectiveWindow: { from: now, to: now },
      generation: 1,
      policyRevisionId: "demo-policy-r1",
      nextCursor: null,
      timeline: [
        {
          id: "alert-event-demo-1",
          eventKind: "SOURCE_OBSERVED",
          occurredAt: now,
          actorType: "SYSTEM",
          beforeVersion: null,
          afterVersion: 1,
          generation: 1,
          policyRevisionId: "demo-policy-r1",
          reasonCode: null,
        },
      ],
    };
  },
  async acknowledge(_, alertId, input) {
    if (input.expectedVersion < 1) throw new Error("Invalid alert version");
    return {
      alertId,
      state: "ACKNOWLEDGED",
      version: input.expectedVersion + 1,
      occurredAt: new Date().toISOString(),
      replayed: false,
      ownerCmsUserId: null,
    };
  },
  async readAlertOwnerTargets(_, signal) {
    if (signal?.aborted) throw signal.reason;
    return [
      { id: "lead-demo", displayName: "Анна · лид поддержки", teamIds: ["team-payments"] },
      { id: "operator-demo", displayName: "Максим · Support", teamIds: ["team-payments"] },
    ];
  },
  async resolve(_, alertId, input) {
    if (input.expectedVersion < 1) throw new Error("Invalid alert version");
    return {
      alertId,
      state: "RESOLVED",
      version: input.expectedVersion + 1,
      occurredAt: new Date().toISOString(),
      replayed: false,
      ownerCmsUserId: null,
    };
  },
  async changeOwner(_, alertId, input) {
    return {
      alertId,
      state: "NEW",
      version: input.expectedVersion + 1,
      occurredAt: new Date().toISOString(),
      replayed: false,
      ownerCmsUserId: input.ownerCmsUserId,
    };
  },
};

export const supportLeadSource: SupportLeadSource & SupportLeadDrilldownSource = isMockMode
  ? mockSource
  : apiSource;
