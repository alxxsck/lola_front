import { beforeEach, describe, expect, it, vi } from "vitest";

const generated = vi.hoisted(() => ({
  list: vi.fn(),
  detail: vi.fn(),
  cancel: vi.fn(),
}));

vi.mock("@/shared/api/generated/retenive-backend", () => ({
  projectAIAnalysisList: generated.list,
  projectAIAnalysisDetail: generated.detail,
  projectAIAnalysisCancel: generated.cancel,
}));

import { projectAIAnalysesRepository } from "./project-ai-analyses-repository";

describe("projectAIAnalysesRepository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses only generated Project-scoped list, detail and cancel calls", async () => {
    generated.list.mockResolvedValue({ items: [], nextCursor: null });
    generated.detail.mockResolvedValue({ analysis: { analysisId: "a-1" } });
    generated.cancel.mockResolvedValue({
      analysisId: "a-1",
      status: "CANCELLED",
    });

    await projectAIAnalysesRepository.list("project-1", {
      status: "SCHEDULED",
      eventCode: "deposit.completed",
      limit: 30,
    });
    await projectAIAnalysesRepository.detail("project-1", "a-1");
    await projectAIAnalysesRepository.cancel({
      projectId: "project-1",
      analysisId: "a-1",
      version: 7,
      idempotencyKey: "cancel-attempt-1",
    });

    expect(generated.list).toHaveBeenCalledWith("project-1", {
      status: "SCHEDULED",
      eventCode: "deposit.completed",
      limit: 30,
    });
    expect(generated.detail).toHaveBeenCalledWith("project-1", "a-1");
    expect(generated.cancel).toHaveBeenCalledWith("project-1", "a-1", {
      headers: {
        "Idempotency-Key": "cancel-attempt-1",
        "If-Match": '"7"',
      },
    });
  });
});
