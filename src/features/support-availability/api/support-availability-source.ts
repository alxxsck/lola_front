import {
  supportOperatorAvailabilityHeartbeatOwn,
  supportOperatorAvailabilityRead,
  supportOperatorAvailabilitySetOwn,
} from "@/shared/api/generated/retenive-backend";
import type { SupportOperatorAvailabilityResponseDto } from "@/shared/api/generated/models";
import { ApiError, normalizeApiError } from "@/shared/api/http/api-error";
import { isMockMode } from "@/shared/config/data-mode";

export const SUPPORT_AVAILABILITY_STATES = [
  "AVAILABLE",
  "BUSY",
  "AWAY",
  "DRAINING",
  "OFFLINE",
] as const;

export type SupportAvailabilityState = (typeof SUPPORT_AVAILABILITY_STATES)[number];

export const SUPPORT_AVAILABILITY_REASON_CODES = [
  "SHIFT_START",
  "RETURNED",
  "FOCUS",
  "BREAK",
  "MEETING",
  "TRAINING",
  "WRAP_UP",
  "SHIFT_END",
  "LEAD_INTERVENTION",
] as const;

export type SupportAvailabilityReasonCode =
  (typeof SUPPORT_AVAILABILITY_REASON_CODES)[number];

export const SUPPORT_AVAILABILITY_SELF_REASONS: Record<
  SupportAvailabilityState,
  readonly SupportAvailabilityReasonCode[]
> = {
  AVAILABLE: ["SHIFT_START", "RETURNED"],
  BUSY: ["FOCUS"],
  AWAY: ["BREAK", "MEETING", "TRAINING"],
  DRAINING: ["WRAP_UP"],
  OFFLINE: ["SHIFT_END"],
};

export interface SupportAvailabilitySnapshot {
  operatorId: string;
  projectId: string;
  declaredState: SupportAvailabilityState;
  effectiveState: SupportAvailabilityState;
  acceptsNewWork: boolean;
  effectiveUntil: string | null;
  leaseRenewedAt: string | null;
  leaseUntil: string | null;
  reasonCode: SupportAvailabilityReasonCode | "LEASE_EXPIRED" | null;
  source: "SELF" | "LEAD_OVERRIDE" | "LEASE_EXPIRY" | null;
  transitionedAt: string | null;
  version: number;
}

export interface SetOwnAvailabilityCommand {
  state: SupportAvailabilityState;
  reasonCode: SupportAvailabilityReasonCode;
  reasonNote?: string;
  hardDurationSeconds?: number;
  expectedVersion: number;
  idempotencyKey: string;
}

export interface SupportAvailabilitySource {
  read(
    projectId: string,
    operatorId: string,
    signal?: AbortSignal,
  ): Promise<SupportAvailabilitySnapshot>;
  setOwn(
    projectId: string,
    operatorId: string,
    command: SetOwnAvailabilityCommand,
    signal?: AbortSignal,
  ): Promise<SupportAvailabilitySnapshot>;
  renewOwn(
    projectId: string,
    operatorId: string,
    expectedVersion: number,
    signal?: AbortSignal,
  ): Promise<SupportAvailabilitySnapshot>;
}

function mapAvailability(
  response: SupportOperatorAvailabilityResponseDto,
): SupportAvailabilitySnapshot {
  return {
    operatorId: response.operatorId,
    projectId: response.projectId,
    declaredState: response.declaredState,
    effectiveState: response.effectiveState,
    acceptsNewWork: response.acceptsNewWork,
    effectiveUntil: response.effectiveUntil,
    leaseRenewedAt: response.leaseRenewedAt,
    leaseUntil: response.leaseUntil,
    reasonCode: response.reasonCode,
    source: response.source,
    transitionedAt: response.transitionedAt,
    version: response.version,
  };
}

const apiSource: SupportAvailabilitySource = {
  async read(projectId, operatorId, signal) {
    try {
      return mapAvailability(
        await supportOperatorAvailabilityRead(projectId, operatorId, { signal }),
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async setOwn(projectId, _operatorId, command, signal) {
    try {
      return mapAvailability(
        await supportOperatorAvailabilitySetOwn(
          projectId,
          {
            state: command.state,
            reasonCode: command.reasonCode,
            ...(command.reasonNote ? { reasonNote: command.reasonNote } : {}),
            ...(command.hardDurationSeconds
              ? { hardDurationSeconds: command.hardDurationSeconds }
              : {}),
          },
          {
            signal,
            headers: {
              "If-Match": `"${command.expectedVersion}"`,
              "Idempotency-Key": command.idempotencyKey,
            },
          },
        ),
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async renewOwn(projectId, _operatorId, expectedVersion, signal) {
    try {
      return mapAvailability(
        await supportOperatorAvailabilityHeartbeatOwn(
          projectId,
          {},
          {
            signal,
            headers: { "If-Match": `"${expectedVersion}"` },
          },
        ),
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
};

const mockSnapshots = new Map<string, SupportAvailabilitySnapshot>();

function mockKey(projectId: string, operatorId: string): string {
  return `${projectId}:${operatorId}`;
}

function mockSnapshot(
  projectId: string,
  operatorId: string,
): SupportAvailabilitySnapshot {
  const key = mockKey(projectId, operatorId);
  const existing = mockSnapshots.get(key);
  if (existing) return existing;
  const now = new Date().toISOString();
  const created: SupportAvailabilitySnapshot = {
    operatorId,
    projectId,
    declaredState: "AVAILABLE",
    effectiveState: "AVAILABLE",
    acceptsNewWork: true,
    effectiveUntil: null,
    leaseRenewedAt: now,
    leaseUntil: null,
    reasonCode: "SHIFT_START",
    source: "SELF",
    transitionedAt: now,
    version: 1,
  };
  mockSnapshots.set(key, created);
  return created;
}

const mockSource: SupportAvailabilitySource = {
  async read(projectId, operatorId, signal) {
    if (signal?.aborted) throw signal.reason;
    return mockSnapshot(projectId, operatorId);
  },
  async setOwn(projectId, operatorId, command, signal) {
    if (signal?.aborted) throw signal.reason;
    const current = mockSnapshot(projectId, operatorId);
    if (current.version !== command.expectedVersion)
      throw new ApiError(409, "Availability version is stale");
    const now = new Date().toISOString();
    const next: SupportAvailabilitySnapshot = {
      ...current,
      declaredState: command.state,
      effectiveState: command.state,
      acceptsNewWork: command.state === "AVAILABLE",
      reasonCode: command.reasonCode,
      source: "SELF",
      transitionedAt: now,
      leaseRenewedAt: now,
      version: current.version + 1,
    };
    mockSnapshots.set(mockKey(projectId, operatorId), next);
    return next;
  },
  async renewOwn(projectId, operatorId, expectedVersion, signal) {
    if (signal?.aborted) throw signal.reason;
    const current = mockSnapshot(projectId, operatorId);
    if (current.version !== expectedVersion)
      throw new ApiError(409, "Availability version is stale");
    if (current.effectiveState === "OFFLINE")
      throw new ApiError(409, "Availability lease cannot be renewed");
    const renewedAt = new Date();
    const next: SupportAvailabilitySnapshot = {
      ...current,
      leaseRenewedAt: renewedAt.toISOString(),
      leaseUntil: new Date(renewedAt.getTime() + 120_000).toISOString(),
    };
    mockSnapshots.set(mockKey(projectId, operatorId), next);
    return next;
  },
};

export const supportAvailabilitySource: SupportAvailabilitySource = isMockMode
  ? mockSource
  : apiSource;
