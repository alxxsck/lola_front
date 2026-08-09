import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  supportWorkspaceReadRollout,
  supportWorkspaceUpdateRollout,
} from "@/shared/api/generated/retenive-backend";
import {
  apiSupportWorkspaceRolloutSource,
  mockSupportWorkspaceRolloutSource,
  resetMockSupportWorkspaceRolloutCommands,
} from "./support-workspace-rollout-source";
import {
  resetMockSupportWorkspaceRollout,
  writeMockSupportWorkspaceRollout,
} from "./support-workspace-shell-source";

vi.mock("@/shared/api/generated/retenive-backend", () => ({
  supportWorkspaceReadRollout: vi.fn(),
  supportWorkspaceUpdateRollout: vi.fn(),
}));

describe("Support Workspace rollout source", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockSupportWorkspaceRollout();
    resetMockSupportWorkspaceRolloutCommands();
  });

  it("sends the opaque action ETag and stable idempotency key through the generated client", async () => {
    const signal = new AbortController().signal;
    const body = {
      enabled: true,
      shellEnabled: false,
      hardOff: true,
      reason: "Emergency rollback rehearsal",
    };
    vi.mocked(supportWorkspaceUpdateRollout).mockResolvedValue({
      ...body,
      version: 2,
      actionEtag: `"swr1.${"b".repeat(43)}"`,
    });

    await apiSupportWorkspaceRolloutSource.update(
      "project-1",
      {
        actionEtag: `"swr1.${"a".repeat(43)}"`,
        idempotencyKey: "rollout-command-1",
        body,
      },
      signal,
    );

    expect(supportWorkspaceUpdateRollout).toHaveBeenCalledWith(
      "project-1",
      body,
      {
        _noAuthRetry: true,
        signal,
        headers: {
          "If-Match": `"swr1.${"a".repeat(43)}"`,
          "Idempotency-Key": "rollout-command-1",
        },
      },
    );
  });

  it("reads the protected root with the caller signal", async () => {
    const signal = new AbortController().signal;
    vi.mocked(supportWorkspaceReadRollout).mockResolvedValue({
      enabled: true,
      shellEnabled: false,
      hardOff: false,
      version: 1,
      actionEtag: `"swr1.${"a".repeat(43)}"`,
    });

    await apiSupportWorkspaceRolloutSource.read("project-1", signal);

    expect(supportWorkspaceReadRollout).toHaveBeenCalledWith("project-1", {
      signal,
    });
  });

  it("replays an exact mock attempt immutably and rejects key reuse with another intent", async () => {
    writeMockSupportWorkspaceRollout(
      {
        enabled: true,
        shellEnabled: false,
        hardOff: false,
        version: 1,
      },
      "project-1",
    );
    const root = await mockSupportWorkspaceRolloutSource.read("project-1");
    const command = {
      actionEtag: root.actionEtag,
      idempotencyKey: "rollout-command-1",
      body: {
        enabled: true,
        shellEnabled: true,
        hardOff: false,
        reason: "Enable pilot safely",
      },
    };

    const receipt = await mockSupportWorkspaceRolloutSource.update(
      "project-1",
      command,
    );
    expect(
      await mockSupportWorkspaceRolloutSource.update("project-1", command),
    ).toEqual(receipt);
    await expect(
      mockSupportWorkspaceRolloutSource.update("project-1", {
        ...command,
        body: { ...command.body, hardOff: true, shellEnabled: false },
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: "SUPPORT_WORKSPACE_IDEMPOTENCY_KEY_REUSED",
    });
  });

  it("keeps mock idempotency validation aligned with the visible ASCII contract", async () => {
    const root = await mockSupportWorkspaceRolloutSource.read("project-1");
    await expect(
      mockSupportWorkspaceRolloutSource.update("project-1", {
        actionEtag: root.actionEtag,
        idempotencyKey: "short",
        body: {
          enabled: true,
          shellEnabled: false,
          hardOff: true,
          reason: "Emergency rollback rehearsal",
        },
      }),
    ).rejects.toMatchObject({
      status: 400,
      code: "SUPPORT_WORKSPACE_IDEMPOTENCY_KEY_INVALID",
    });
  });
});
