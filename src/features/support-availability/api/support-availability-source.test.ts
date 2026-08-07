import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupportOperatorAvailabilityResponseDto } from "@/shared/api/generated/models";

const generated = vi.hoisted(() => ({
  heartbeatOwn: vi.fn(),
  read: vi.fn(),
  setOwn: vi.fn(),
}));

vi.mock("@/shared/api/generated/retenive-backend", () => ({
  supportOperatorAvailabilityHeartbeatOwn: generated.heartbeatOwn,
  supportOperatorAvailabilityRead: generated.read,
  supportOperatorAvailabilitySetOwn: generated.setOwn,
}));

vi.mock("@/shared/config/data-mode", () => ({ isMockMode: false }));

import { supportAvailabilitySource } from "./support-availability-source";

const response: SupportOperatorAvailabilityResponseDto = {
  operatorId: "operator-1",
  projectId: "project-1",
  declaredState: "AVAILABLE",
  effectiveState: "AVAILABLE",
  acceptsNewWork: true,
  effectiveUntil: null,
  leaseRenewedAt: "2026-08-06T10:00:00.000Z",
  leaseUntil: null,
  reasonCode: "SHIFT_START",
  source: "SELF",
  transitionedAt: "2026-08-06T10:00:00.000Z",
  version: 7,
};

describe("support availability source", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the generated self-availability calls with the required concurrency headers", async () => {
    generated.read.mockResolvedValue(response);
    generated.setOwn.mockResolvedValue(response);
    generated.heartbeatOwn.mockResolvedValue(response);
    const signal = new AbortController().signal;

    await supportAvailabilitySource.read("project-1", "operator-1", signal);
    await supportAvailabilitySource.setOwn(
      "project-1",
      "operator-1",
      {
        state: "AWAY",
        reasonCode: "BREAK",
        reasonNote: "Перерыв",
        hardDurationSeconds: 900,
        expectedVersion: 7,
        idempotencyKey: "availability-attempt-1",
      },
      signal,
    );
    await supportAvailabilitySource.renewOwn(
      "project-1",
      "operator-1",
      7,
      signal,
    );

    expect(generated.read).toHaveBeenCalledWith("project-1", "operator-1", {
      signal,
    });
    expect(generated.setOwn).toHaveBeenCalledWith(
      "project-1",
      {
        state: "AWAY",
        reasonCode: "BREAK",
        reasonNote: "Перерыв",
        hardDurationSeconds: 900,
      },
      {
        signal,
        headers: {
          "If-Match": '"7"',
          "Idempotency-Key": "availability-attempt-1",
        },
      },
    );
    expect(generated.heartbeatOwn).toHaveBeenCalledWith(
      "project-1",
      {},
      {
        signal,
        headers: { "If-Match": '"7"' },
      },
    );
  });
});
