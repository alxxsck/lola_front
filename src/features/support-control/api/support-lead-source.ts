import {
  supportLeadCaseRisks,
  supportLeadSummary,
  supportOperationalAlertCommandAcknowledge,
  supportOperationalAlertCommandResolve,
  supportOperationalAlertDetail,
  supportOperationalAlertList,
} from "@/shared/api/generated/retenive-backend";
import type {
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
  slaRolloutState: "DISABLED" | "SHADOW";
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
  slaRolloutState: "DISABLED" | "SHADOW";
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
    request?: { cursor?: string; limit?: number },
    signal?: AbortSignal,
  ): Promise<SupportOperationalAlertPage>;
  readAlertDetail(
    projectId: string,
    alertId: string,
    request?: { cursor?: string; limit?: number },
    signal?: AbortSignal,
  ): Promise<SupportOperationalAlertDetail>;
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
}

export interface SupportOperationalAlertCommandReceipt {
  alertId: string;
  state: "NEW" | "ACKNOWLEDGED" | "RESOLVED";
  version: number;
  occurredAt: string;
  replayed: boolean;
}

export type SupportLeadSource =
  & SupportLeadSummarySource
  & SupportLeadRisksSource
  & SupportOperationalAlertsSource;

function mapSummary(response: SupportLeadSummaryResponseDto): SupportLeadSummary {
  return {
    computedAt: response.computedAt,
    freshnessState: response.freshnessState,
    slaRolloutState: response.slaRolloutState,
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
    slaRolloutState: response.slaRolloutState,
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

const apiSource: SupportLeadSource = {
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
          },
          { signal },
        ),
      );
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
};

const mockSource: SupportLeadSource = {
  async readSummary(_, signal) {
    if (signal?.aborted) throw signal.reason;
    return {
      computedAt: new Date().toISOString(),
      freshnessState: "READY",
      slaRolloutState: "SHADOW",
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
      slaRolloutState: "SHADOW",
      riskType,
      items: cases[riskType],
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
    };
  },
  async resolve(_, alertId, input) {
    if (input.expectedVersion < 1) throw new Error("Invalid alert version");
    return {
      alertId,
      state: "RESOLVED",
      version: input.expectedVersion + 1,
      occurredAt: new Date().toISOString(),
      replayed: false,
    };
  },
};

export const supportLeadSource: SupportLeadSource = isMockMode
  ? mockSource
  : apiSource;
