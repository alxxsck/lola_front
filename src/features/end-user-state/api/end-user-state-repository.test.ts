import { beforeEach, describe, expect, it, vi } from "vitest";
import { axiosInstance } from "@/shared/api/http/axios-instance";
vi.mock("@/shared/api/http/axios-instance", () => ({
  axiosInstance: { get: vi.fn(), put: vi.fn() },
}));
import { endUserStateRepository } from "./end-user-state-repository";
const definition = {
  key: "cms.tags",
  version: 1,
  owner: "CMS_MANAGED",
  classification: "INTERNAL",
  schema: { type: "array", items: { type: "string" } },
  label: { ru: "Теги", en: "Tags" },
  description: { en: "Internal tags" },
  writable: true,
};
describe("endUserStateRepository", () => {
  beforeEach(() => vi.clearAllMocks());
  it("reads versioned internal attributes and writes with optimistic concurrency plus idempotency", async () => {
    vi.mocked(axiosInstance.get).mockResolvedValue({
      data: {
        projectId: "project-1",
        endUserId: "user-1",
        items: [
          {
            definition,
            current: {
              version: 3,
              definitionVersion: 1,
              state: "ACTIVE",
              value: ["segment:vip"],
              effectiveAt: "2026-08-01T00:00:00.000Z",
              expiresAt: null,
              actor: { type: "CMS_USER", id: "admin-1" },
              reason: "Assign VIP segment",
              updatedAt: "2026-08-01T00:00:00.000Z",
            },
          },
        ],
      },
    });
    vi.mocked(axiosInstance.put).mockResolvedValue({
      data: { eventId: "event-1" },
    });
    const state = await endUserStateRepository.get("project-1", "user-1");
    const input = {
      operation: "SET" as const,
      value: ["segment:vip", "level:gold"],
      expectedVersion: state.items[0]!.current!.version,
      reason: "Promote user to gold level",
    };
    await endUserStateRepository.put(
      "project-1",
      "user-1",
      "cms.tags",
      input,
      "stable-idem",
    );
    expect(axiosInstance.put).toHaveBeenCalledWith(
      "/api/v1/admin/projects/project-1/end-users/user-1/operational-state/cms.tags",
      input,
      { headers: { "Idempotency-Key": "stable-idem" } },
    );
  });

  it("accepts a future-effective current value as scheduled, not active", async () => {
    vi.mocked(axiosInstance.get).mockResolvedValue({
      data: {
        projectId: "project-1",
        endUserId: "user-1",
        items: [
          {
            definition,
            current: {
              version: 4,
              definitionVersion: 1,
              state: "SCHEDULED",
              value: ["segment:future"],
              effectiveAt: "2099-08-01T00:00:00.000Z",
              expiresAt: null,
              actor: { type: "CMS_USER", id: "admin-1" },
              reason: "Schedule future segment",
              updatedAt: "2026-08-01T00:00:00.000Z",
            },
          },
        ],
      },
    });

    const result = await endUserStateRepository.get("project-1", "user-1");

    expect(result.items[0]?.current?.state).toBe("SCHEDULED");
  });
});
