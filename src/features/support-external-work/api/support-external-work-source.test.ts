import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  supportExternalConnectionList,
  supportExternalConnectionTest,
  supportExternalCommandRefreshEvidence,
  supportExternalCommandRetry,
  supportExternalMappingPublish,
} from "@/shared/api/generated/retenive-backend";
import { apiSupportExternalWorkSource } from "./support-external-work-source";

vi.mock("@/shared/api/generated/retenive-backend", () => ({
  supportExternalConnectionList: vi.fn(),
  supportExternalConnectionTest: vi.fn(),
  supportExternalCommandRefreshEvidence: vi.fn(),
  supportExternalCommandRetry: vi.fn(),
  supportExternalMappingPublish: vi.fn(),
}));

describe("Support External Work source", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads connection authority through the generated operation and caller signal", async () => {
    const signal = new AbortController().signal;
    vi.mocked(supportExternalConnectionList).mockResolvedValue({
      items: [],
      nextCursor: null,
    });

    await apiSupportExternalWorkSource.listConnections("project-1", undefined, signal);

    expect(supportExternalConnectionList).toHaveBeenCalledWith(
      "project-1",
      { limit: 50 },
      { signal },
    );
  });

  it("does not auth-replay an audited connection test and preserves its exact key", async () => {
    vi.mocked(supportExternalConnectionTest).mockResolvedValue({} as never);

    await apiSupportExternalWorkSource.testConnection(
      "project-1",
      "connection-1",
      "stable-command-key",
    );

    expect(supportExternalConnectionTest).toHaveBeenCalledWith(
      "project-1",
      "connection-1",
      {},
      expect.objectContaining({
        _noAuthRetry: true,
        headers: { "Idempotency-Key": "stable-command-key" },
      }),
    );
  });

  it("publishes a mapping with quoted numeric OCC and a stable key", async () => {
    vi.mocked(supportExternalMappingPublish).mockResolvedValue({} as never);

    await apiSupportExternalWorkSource.publishMapping(
      "project-1",
      "mapping-1",
      7,
      "stable-publish-key",
    );

    expect(supportExternalMappingPublish).toHaveBeenCalledWith(
      "project-1",
      "mapping-1",
      {},
      expect.objectContaining({
        _noAuthRetry: true,
        headers: {
          "Idempotency-Key": "stable-publish-key",
          "If-Match": '"7"',
        },
      }),
    );
  });

  it("keeps quoted command OCC and idempotency headers for retry and evidence", async () => {
    vi.mocked(supportExternalCommandRetry).mockResolvedValue({} as never);
    vi.mocked(supportExternalCommandRefreshEvidence).mockResolvedValue({} as never);

    await apiSupportExternalWorkSource.retryCommand(
      "project-1",
      "case-1",
      "command-1",
      11,
      "stable-retry-key",
    );
    await apiSupportExternalWorkSource.refreshCommandEvidence(
      "project-1",
      "case-1",
      "command-1",
      { remoteItemId: "remote-1" },
      12,
      "stable-evidence-key",
    );

    expect(supportExternalCommandRetry).toHaveBeenCalledWith(
      "project-1",
      "case-1",
      "command-1",
      expect.objectContaining({
        _noAuthRetry: true,
        headers: {
          "Idempotency-Key": "stable-retry-key",
          "If-Match": '"11"',
        },
      }),
    );
    expect(supportExternalCommandRefreshEvidence).toHaveBeenCalledWith(
      "project-1",
      "case-1",
      "command-1",
      { remoteItemId: "remote-1" },
      expect.objectContaining({
        _noAuthRetry: true,
        headers: {
          "Idempotency-Key": "stable-evidence-key",
          "If-Match": '"12"',
        },
      }),
    );
  });
});
