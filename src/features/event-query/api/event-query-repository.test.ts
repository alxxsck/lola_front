import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  caseVerificationEstimate,
  caseVerificationGet,
  caseVerificationStart,
  eventQueryPolicyGet,
  eventQueryPolicyPreview,
  eventQueryPolicyPublish,
  eventQueryPolicySaveDraft,
  eventQueryPolicyUsage,
  eventQueryPolicyValidate,
} from "@/shared/api/generated/lola-backend";
import { eventQueryRepository } from "./event-query-repository";

vi.mock("@/shared/api/generated/lola-backend", () => ({
  caseVerificationEstimate: vi.fn(),
  caseVerificationGet: vi.fn(),
  caseVerificationStart: vi.fn(),
  eventQueryPolicyGet: vi.fn(),
  eventQueryPolicyPreview: vi.fn(),
  eventQueryPolicyPublish: vi.fn(),
  eventQueryPolicySaveDraft: vi.fn(),
  eventQueryPolicyUsage: vi.fn(),
  eventQueryPolicyValidate: vi.fn(),
}));

const document = { enabled: true, items: [] };

describe("event query repository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("delegates policy lifecycle to generated operations without reshaping diagnostics", async () => {
    vi.mocked(eventQueryPolicyGet).mockResolvedValue({});
    vi.mocked(eventQueryPolicySaveDraft).mockResolvedValue({
      document,
      version: 2,
      updatedAt: "2026-07-28T12:00:00.000Z",
    });
    vi.mocked(eventQueryPolicyValidate).mockResolvedValue({
      valid: false,
      errors: [
        { code: "FIELD_NOT_SAFE", location: "items[0]", message: "Unsafe" },
      ],
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
    await eventQueryRepository.saveDraft("project-1", {
      expectedVersion: 1,
      document,
    });
    const validation = await eventQueryRepository.validate("project-1", {
      document,
    });
    await eventQueryRepository.publish("project-1", {
      expectedDraftVersion: 2,
    });

    expect(eventQueryPolicyGet).toHaveBeenCalledWith("project-1");
    expect(eventQueryPolicySaveDraft).toHaveBeenCalledWith("project-1", {
      expectedVersion: 1,
      document,
    });
    expect(validation.errors[0]?.location).toBe("items[0]");
    expect(eventQueryPolicyPublish).toHaveBeenCalledWith("project-1", {
      expectedDraftVersion: 2,
    });
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
