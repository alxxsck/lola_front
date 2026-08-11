import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  supportCaseNotificationPolicyDisable,
  supportCaseNotificationPolicyListAvailableTeams,
  supportCaseNotificationPolicyPreview,
  supportCaseNotificationPolicyPublish,
  supportCaseNotificationPolicyReadCommandResult,
  supportCaseNotificationPolicyReadCurrent,
  supportCaseNotificationPolicyReadMetrics,
  supportCaseNotificationPolicyRestore,
  supportCaseNotificationPolicySaveDraft,
} from "@/shared/api/generated/retenive-backend";
import { apiSupportCaseNotificationPolicySource } from "./support-case-notification-policy-source";

vi.mock("@/shared/api/generated/retenive-backend", () => ({
  supportCaseNotificationPolicyReadCurrent: vi.fn(),
  supportCaseNotificationPolicyReadMetrics: vi.fn(),
  supportCaseNotificationPolicyListAvailableTeams: vi.fn(),
  supportCaseNotificationPolicyPreview: vi.fn(),
  supportCaseNotificationPolicySaveDraft: vi.fn(),
  supportCaseNotificationPolicyPublish: vi.fn(),
  supportCaseNotificationPolicyDisable: vi.fn(),
  supportCaseNotificationPolicyRestore: vi.fn(),
  supportCaseNotificationPolicyReadCommandResult: vi.fn(),
}));

describe("support case notification policy source", () => {
  beforeEach(() => vi.clearAllMocks());

  it("paginates opaque team cursors without requiring team-management APIs", async () => {
    vi.mocked(supportCaseNotificationPolicyListAvailableTeams)
      .mockResolvedValueOnce({
        items: [{ id: "team-1", code: "ONE", name: "Первая" }],
        nextCursor: "cursor-2",
      })
      .mockResolvedValueOnce({
        items: [{ id: "team-2", code: "TWO", name: "Вторая" }],
        nextCursor: null,
      });

    await expect(
      apiSupportCaseNotificationPolicySource.listTeams("project-1"),
    ).resolves.toHaveLength(2);
    expect(
      supportCaseNotificationPolicyListAvailableTeams,
    ).toHaveBeenNthCalledWith(1, "project-1", { limit: 100 }, undefined);
    expect(
      supportCaseNotificationPolicyListAvailableTeams,
    ).toHaveBeenNthCalledWith(
      2,
      "project-1",
      { limit: 100, cursor: "cursor-2" },
      undefined,
    );
  });

  it("uses stable idempotency headers and disables auth replay for every command", async () => {
    const policy = { version: 1 } as never;
    const receipt = { receiptId: crypto.randomUUID(), replayed: false, policy };
    vi.mocked(supportCaseNotificationPolicySaveDraft).mockResolvedValue(
      receipt,
    );
    vi.mocked(supportCaseNotificationPolicyPublish).mockResolvedValue(receipt);
    vi.mocked(supportCaseNotificationPolicyDisable).mockResolvedValue(receipt);
    vi.mocked(supportCaseNotificationPolicyRestore).mockResolvedValue(receipt);
    const save = {
      mode: "IMMEDIATE",
      occurrences: ["CREATED"],
      conversationClasses: ["PRODUCT_PROBLEM"],
      topicCodes: [],
      minimumPriority: "NORMAL",
      recipientRule: "ALL_ELIGIBLE_SUBSCRIBERS",
      teamIds: [],
      channels: ["BROWSER_PUSH"],
      effectiveFrom: null,
      effectiveUntil: null,
      digestWindowMinutes: null,
      digestMaxItems: null,
      reason: "Проверка",
      expectedVersion: 0,
    } as const;

    await apiSupportCaseNotificationPolicySource.saveDraft(
      "project-1",
      save as never,
      "stable-key",
    );
    await apiSupportCaseNotificationPolicySource.publish(
      "project-1",
      { revisionId: "revision-1", expectedVersion: 1 },
      "stable-key",
    );
    await apiSupportCaseNotificationPolicySource.disable(
      "project-1",
      { expectedVersion: 1, reason: "Проверка" },
      "stable-key",
    );
    await apiSupportCaseNotificationPolicySource.restore(
      "project-1",
      { revisionId: "revision-1", expectedVersion: 1, reason: "Проверка" },
      "stable-key",
    );

    for (const call of [
      supportCaseNotificationPolicySaveDraft,
      supportCaseNotificationPolicyPublish,
      supportCaseNotificationPolicyDisable,
      supportCaseNotificationPolicyRestore,
    ]) {
      expect(vi.mocked(call).mock.calls[0]?.[2]).toEqual(
        expect.objectContaining({
          _noAuthRetry: true,
          headers: { "Idempotency-Key": "stable-key" },
        }),
      );
    }
  });

  it("keeps preview and receipt lookup read-only and scoped to the policy API", async () => {
    vi.mocked(supportCaseNotificationPolicyReadCurrent).mockResolvedValue({
      version: 0,
    } as never);
    vi.mocked(supportCaseNotificationPolicyReadMetrics).mockResolvedValue({
      deliveries: 0,
    } as never);
    vi.mocked(supportCaseNotificationPolicyPreview).mockResolvedValue({
      examples: [],
    } as never);
    vi.mocked(supportCaseNotificationPolicyReadCommandResult).mockResolvedValue(
      { found: false, operation: "SAVE_DRAFT" },
    );
    const input = {
      mode: "OFF",
      occurrences: ["CREATED"],
      conversationClasses: ["PRODUCT_PROBLEM"],
      topicCodes: [],
      minimumPriority: "NORMAL",
      recipientRule: "ALL_ELIGIBLE_SUBSCRIBERS",
      teamIds: [],
      channels: ["BROWSER_PUSH"],
      reason: "Проверка",
    } as const;
    await apiSupportCaseNotificationPolicySource.read("project-1");
    await apiSupportCaseNotificationPolicySource.readMetrics("project-1");
    await apiSupportCaseNotificationPolicySource.preview(
      "project-1",
      input as never,
    );
    await apiSupportCaseNotificationPolicySource.lookup(
      "project-1",
      "SAVE_DRAFT",
      "stable-key",
    );
    expect(supportCaseNotificationPolicyReadCommandResult).toHaveBeenCalledWith(
      "project-1",
      { operation: "SAVE_DRAFT", idempotencyKey: "stable-key" },
      undefined,
    );
  });
});
