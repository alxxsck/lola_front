import { supportLeadSummary } from "@/shared/api/generated/retenive-backend";
import type { SupportLeadSummaryResponseDto } from "@/shared/api/generated/models";
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

export interface SupportLeadSource {
  readSummary(projectId: string, signal?: AbortSignal): Promise<SupportLeadSummary>;
}

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

const apiSource: SupportLeadSource = {
  async readSummary(projectId, signal) {
    try {
      return mapSummary(await supportLeadSummary(projectId, { signal }));
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
};

export const supportLeadSource: SupportLeadSource = isMockMode
  ? mockSource
  : apiSource;
