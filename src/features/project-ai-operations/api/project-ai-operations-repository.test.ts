import { beforeEach, describe, expect, it, vi } from "vitest";

const generated = vi.hoisted(() => ({
  list: vi.fn(),
  summary: vi.fn(),
  detail: vi.fn(),
  subjects: vi.fn(),
  accessHistory: vi.fn(),
}));

vi.mock("@/shared/api/generated/retenive-backend", () => ({
  aiOperationsList: generated.list,
  aiOperationsSummary: generated.summary,
  aiOperationsDetail: generated.detail,
  aiOperationsSubjects: generated.subjects,
  aiOperationsAccessHistory: generated.accessHistory,
}));

import { projectAIOperationsRepository } from "./project-ai-operations-repository";

describe("projectAIOperationsRepository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("delegates every read to the generated Project-scoped API", async () => {
    generated.list.mockResolvedValue({
      items: [],
      pageInfo: { hasMore: false },
    });
    generated.summary.mockResolvedValue({ operations: 0 });
    generated.detail.mockResolvedValue({ operationId: "operation-1" });
    generated.subjects.mockResolvedValue({
      availability: "EXACT",
      items: [],
      pageInfo: { hasMore: false },
    });
    generated.accessHistory.mockResolvedValue({
      items: [],
      pageInfo: { hasMore: false },
    });

    await projectAIOperationsRepository.list("project-1", {
      responsibleCmsUserId: "admin-1",
      limit: 30,
    });
    await projectAIOperationsRepository.summary("project-1", {
      occurredFrom: "2026-07-01T00:00:00.000Z",
      occurredTo: "2026-08-01T00:00:00.000Z",
    });
    await projectAIOperationsRepository.detail("project-1", "operation-1", {
      limit: 50,
      usageLimit: 50,
    });
    await projectAIOperationsRepository.subjects("project-1", "operation-1", {
      role: "DATA_CONTRIBUTOR",
      limit: 50,
    });
    await projectAIOperationsRepository.accessHistory(
      "project-1",
      "operation-1",
      { limit: 50 },
    );

    expect(generated.list).toHaveBeenCalledWith("project-1", {
      responsibleCmsUserId: "admin-1",
      limit: 30,
    });
    expect(generated.summary).toHaveBeenCalledWith("project-1", {
      occurredFrom: "2026-07-01T00:00:00.000Z",
      occurredTo: "2026-08-01T00:00:00.000Z",
    });
    expect(generated.detail).toHaveBeenCalledWith("project-1", "operation-1", {
      limit: 50,
      usageLimit: 50,
    });
    expect(generated.subjects).toHaveBeenCalledWith(
      "project-1",
      "operation-1",
      { role: "DATA_CONTRIBUTOR", limit: 50 },
    );
    expect(generated.accessHistory).toHaveBeenCalledWith(
      "project-1",
      "operation-1",
      { limit: 50 },
    );
  });
});
