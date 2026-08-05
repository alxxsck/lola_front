import { beforeEach, describe, expect, it, vi } from "vitest";
import * as generated from "@/shared/api/generated/retenive-backend";
import { integrationRecoveryApi } from "./integration-recovery.api";

vi.mock("@/shared/api/generated/retenive-backend", () => ({
  integrationConnectionList: vi.fn(),
  integrationRecoveryOperationsCancelDispatch: vi.fn(),
  integrationRecoveryOperationsDetail: vi.fn(),
  integrationRecoveryOperationsList: vi.fn(),
  integrationRecoveryOperationsPauseDirection: vi.fn(),
  integrationRecoveryOperationsQuarantineIngress: vi.fn(),
  integrationRecoveryOperationsReplayDispatch: vi.fn(),
  integrationRecoveryOperationsReplayIngress: vi.fn(),
  integrationRecoveryOperationsResumeDirection: vi.fn(),
}));

describe("integrationRecoveryApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes idempotency key to replay commands", async () => {
    const input = {
      acknowledgeDuplicateRisk: false,
      expectedOperationsVersion: 2,
      expectedState: "FAILED_PERMANENT" as const,
      reason: "Operator retry",
    };
    await integrationRecoveryApi.replayDispatch(
      "project-1",
      "dispatch-1",
      input,
      "key-12345678",
    );

    expect(
      generated.integrationRecoveryOperationsReplayDispatch,
    ).toHaveBeenCalledWith("project-1", "dispatch-1", input, {
      headers: { "Idempotency-Key": "key-12345678" },
    });
  });

  it("passes OCC state and idempotency key to manual ingress quarantine", async () => {
    const input = {
      expectedOperationsVersion: 5,
      expectedStatus: "RETRY_WAIT" as const,
      reason: "Operator quarantine",
    };

    await integrationRecoveryApi.quarantineIngress(
      "project-1",
      "ingress-1",
      input,
      "quarantine-key",
    );

    expect(
      generated.integrationRecoveryOperationsQuarantineIngress,
    ).toHaveBeenCalledWith("project-1", "ingress-1", input, {
      headers: { "Idempotency-Key": "quarantine-key" },
    });
  });

  it("uses the matching pause and resume endpoints", async () => {
    const input = {
      expectedPaused: false,
      expectedVersion: 4,
      reason: "Maintenance",
    };
    await integrationRecoveryApi.changeDirectionPause(
      "project-1",
      "connection-1",
      "OUTBOUND",
      true,
      input,
      "pause-key",
    );
    await integrationRecoveryApi.changeDirectionPause(
      "project-1",
      "connection-1",
      "OUTBOUND",
      false,
      { ...input, expectedPaused: true },
      "resume-key",
    );

    expect(
      generated.integrationRecoveryOperationsPauseDirection,
    ).toHaveBeenCalledOnce();
    expect(
      generated.integrationRecoveryOperationsResumeDirection,
    ).toHaveBeenCalledOnce();
  });
});
