import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/http/api-error";
import { supportQualityOpenDispute, supportQualityTaskClaim } from "@/shared/api/generated/retenive-backend";
import { supportQualityApiSource } from "./support-quality-source";

vi.mock("@/shared/api/generated/retenive-backend", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/api/generated/retenive-backend")>()),
  supportQualityTaskClaim: vi.fn(),
  supportQualityOpenDispute: vi.fn(),
}));

describe("supportQualityApiSource", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retains stable idempotency and OCC headers for exact task replay", async () => {
    const task = {
      id: "task-1",
      projectId: "project-1",
      caseId: "case-1",
      conversationId: "conversation-1",
      operatorCmsUserId: "operator-1",
      assignedReviewerCmsUserId: null,
      scorecardRevisionId: "scorecard-r1",
      scorecardId: "scorecard-1",
      scorecardRevisionNumber: 1,
      defaultEvidenceMessageId: "message-1",
      defaultScores: [{ itemCode: "EMPATHY", applicable: true }],
      samplingPolicyRevisionId: "policy-r1",
      populationReceiptId: "population-1",
      selectionReasonCode: "RANDOM_SAMPLE",
      state: "READY" as const,
      version: 4,
    };
    vi.mocked(supportQualityTaskClaim)
      .mockRejectedValueOnce(new ApiError(503, "Ответ неизвестен"))
      .mockResolvedValueOnce(task)
      .mockResolvedValueOnce(task);
    await expect(supportQualityApiSource.claimTask("project-1", task)).rejects.toBeInstanceOf(ApiError);
    await supportQualityApiSource.claimTask("project-1", task);
    await supportQualityApiSource.claimTask("project-1", task);

    const first = vi.mocked(supportQualityTaskClaim).mock.calls[0]![2]!;
    const second = vi.mocked(supportQualityTaskClaim).mock.calls[1]![2]!;
    expect(first.headers).toMatchObject({ "If-Match": '"4"' });
    expect(first.headers?.["Idempotency-Key"]).toBe(second.headers?.["Idempotency-Key"]);
    const third = vi.mocked(supportQualityTaskClaim).mock.calls[2]![2]!;
    expect(third.headers?.["Idempotency-Key"]).not.toBe(second.headers?.["Idempotency-Key"]);
  });

  it("sends review OCC on dispute admission", async () => {
    vi.mocked(supportQualityOpenDispute).mockResolvedValue({
      id: "dispute-1",
      reviewId: "review-1",
      openedByCmsUserId: "operator-1",
      reason: "Проверить критерий",
      state: "OPEN",
      version: 1,
      resolutionNote: null,
    });
    await supportQualityApiSource.dispute(
      "project-1",
      "review-1",
      7,
      "Проверить критерий",
    );
    expect(vi.mocked(supportQualityOpenDispute).mock.calls[0]![3]?.headers).toMatchObject({
      "If-Match": '"7"',
    });
  });
});
