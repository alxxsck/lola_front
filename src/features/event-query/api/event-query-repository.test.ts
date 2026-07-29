import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  caseVerificationEstimate,
  caseVerificationGet,
  caseVerificationStart,
  eventQueryPolicyGet,
  eventQueryPolicyGetItem,
  eventQueryPolicyListItems,
  eventQueryPolicyListRequests,
  eventQueryPolicyPatchItem,
  eventQueryPolicyPatchProject,
  eventQueryPolicyPreview,
  eventQueryPolicyPublish,
  eventQueryPolicyPublishItem,
  eventQueryPolicyUsage,
  eventQueryPolicyValidateItem,
} from "@/shared/api/generated/lola-backend";
import { eventQueryRepository } from "./event-query-repository";

vi.mock("@/shared/api/generated/lola-backend", () => ({
  caseVerificationEstimate: vi.fn(),
  caseVerificationGet: vi.fn(),
  caseVerificationStart: vi.fn(),
  eventQueryPolicyGet: vi.fn(),
  eventQueryPolicyGetItem: vi.fn(),
  eventQueryPolicyListItems: vi.fn(),
  eventQueryPolicyListRequests: vi.fn(),
  eventQueryPolicyPatchItem: vi.fn(),
  eventQueryPolicyPatchProject: vi.fn(),
  eventQueryPolicyPreview: vi.fn(),
  eventQueryPolicyPublish: vi.fn(),
  eventQueryPolicyPublishItem: vi.fn(),
  eventQueryPolicyUsage: vi.fn(),
  eventQueryPolicyValidateItem: vi.fn(),
}));

const document = { enabled: true, items: [] };

describe("event query repository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("delegates policy lifecycle to generated operations without reshaping diagnostics", async () => {
    vi.mocked(eventQueryPolicyGet).mockResolvedValue({
      counts: {},
      diagnostics: [],
      masterEnabled: false,
      version: 0,
    });
    vi.mocked(eventQueryPolicyPublish).mockResolvedValue({
      id: "revision-1",
      version: 1,
      document,
      compilerVersion: "1",
      documentHash: "hash",
      publishedAt: "2026-07-28T12:00:00.000Z",
    });

    await eventQueryRepository.getPolicy("project-1");
    await eventQueryRepository.publish("project-1", {
      expectedVersion: 2,
    });

    expect(eventQueryPolicyGet).toHaveBeenCalledWith("project-1");
    expect(eventQueryPolicyPublish).toHaveBeenCalledWith("project-1", {
      expectedVersion: 2,
    });
  });

  it("delegates project and per-Event operations to generated endpoints", async () => {
    vi.mocked(eventQueryPolicyPatchProject).mockResolvedValue({} as never);
    vi.mocked(eventQueryPolicyListItems).mockResolvedValue({} as never);
    vi.mocked(eventQueryPolicyGetItem).mockResolvedValue({} as never);
    vi.mocked(eventQueryPolicyPatchItem).mockResolvedValue({} as never);
    vi.mocked(eventQueryPolicyValidateItem).mockResolvedValue({} as never);
    vi.mocked(eventQueryPolicyPublishItem).mockResolvedValue({} as never);
    vi.mocked(eventQueryPolicyListRequests).mockResolvedValue({} as never);

    await eventQueryRepository.patchProject("project-1", {
      expectedVersion: 2,
      masterEnabled: true,
    });
    await eventQueryRepository.listItems("project-1", {
      audience: "INTERNAL_AI",
      effective: true,
    });
    await eventQueryRepository.getItem("project-1", "definition-1");
    await eventQueryRepository.patchItem("project-1", "definition-1", {
      expectedVersion: 3,
      enabled: true,
    });
    await eventQueryRepository.validateItem("project-1", "definition-1", {
      patch: {},
    });
    await eventQueryRepository.publishItem("project-1", "definition-1", {
      expectedVersion: 3,
      expectedPolicyVersion: 4,
    });
    await eventQueryRepository.listRequests("project-1", {
      from: "2026-07-01T00:00:00.000Z",
      to: "2026-07-31T00:00:00.000Z",
      endUserId: "user-1",
    });

    expect(eventQueryPolicyListItems).toHaveBeenCalledWith("project-1", {
      audience: "INTERNAL_AI",
      effective: true,
    });
    expect(eventQueryPolicyPatchItem).toHaveBeenCalledWith(
      "project-1",
      "definition-1",
      { expectedVersion: 3, enabled: true },
    );
    expect(eventQueryPolicyPublishItem).toHaveBeenCalledWith(
      "project-1",
      "definition-1",
      { expectedVersion: 3, expectedPolicyVersion: 4 },
    );
  });

  it("keeps trusted case scope in route parameters and sends a fresh idempotency key in the body", async () => {
    const input = {
      idempotencyKey: "00000000-0000-4000-8000-000000000001",
      queries: [
        {
          key: "goal",
          query: {
            eventCodes: ["deposit.completed"],
            mode: "SUMMARY" as const,
            timeRange: { kind: "LAST_24_HOURS" as const },
          },
        },
      ],
      predicate: { operator: "EVENT_EXISTS" as const, queryKey: "goal" },
    };
    vi.mocked(caseVerificationStart).mockResolvedValue({
      id: "run-1",
    } as never);

    await eventQueryRepository.startCaseVerification(
      "project-1",
      "case-1",
      input,
    );

    expect(caseVerificationStart).toHaveBeenCalledWith(
      "project-1",
      "case-1",
      input,
    );
    expect(JSON.stringify(input)).not.toContain("endUserId");
    expect(JSON.stringify(input)).not.toContain("projectId");
  });

  it("uses typed generated operations for preview, usage, estimate and run reads", async () => {
    vi.mocked(eventQueryPolicyPreview).mockResolvedValue({
      status: "OK",
    } as never);
    vi.mocked(eventQueryPolicyUsage).mockResolvedValue({ calls: 0 } as never);
    vi.mocked(caseVerificationEstimate).mockResolvedValue({
      complete: true,
    } as never);
    vi.mocked(caseVerificationGet).mockResolvedValue({ id: "run-1" } as never);

    const preview = {
      endUserId: "user-1",
      query: {
        eventCodes: ["game.started"],
        mode: "LATEST" as const,
        timeRange: { kind: "LAST_7_DAYS" as const },
      },
    };
    await eventQueryRepository.preview("project-1", preview);
    await eventQueryRepository.usage("project-1", {
      from: "2026-07-01T00:00:00.000Z",
      to: "2026-07-31T00:00:00.000Z",
    });
    await eventQueryRepository.estimateCaseVerification("project-1", "case-1", {
      queries: [],
      predicate: {},
    } as never);
    await eventQueryRepository.getCaseVerification(
      "project-1",
      "case-1",
      "run-1",
    );

    expect(eventQueryPolicyPreview).toHaveBeenCalledWith("project-1", preview);
    expect(eventQueryPolicyUsage).toHaveBeenCalledWith("project-1", {
      from: "2026-07-01T00:00:00.000Z",
      to: "2026-07-31T00:00:00.000Z",
    });
    expect(caseVerificationEstimate).toHaveBeenCalledWith(
      "project-1",
      "case-1",
      expect.any(Object),
    );
    expect(caseVerificationGet).toHaveBeenCalledWith(
      "project-1",
      "case-1",
      "run-1",
    );
  });
});
