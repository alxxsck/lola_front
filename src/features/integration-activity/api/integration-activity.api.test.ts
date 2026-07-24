import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  integrationActivityContent,
  integrationActivityGet,
  integrationActivityList,
} from "@/shared/api/generated/lola-backend";
import { apiIntegrationActivityRepository } from "./integration-activity.api";

vi.mock("@/shared/api/generated/lola-backend", () => ({
  integrationActivityList: vi.fn(),
  integrationActivityGet: vi.fn(),
  integrationActivityContent: vi.fn(),
}));

describe("integration activity API repository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("maps a safe cursor page and serializes repeated filters", async () => {
    vi.mocked(integrationActivityList).mockResolvedValue({
      items: [
        {
          id: "activity-1",
          provider: "TELEGRAM",
          activityType: "PERSONAL_MESSAGE",
          status: "OUTCOME_UNKNOWN",
          state: "OUTCOME_UNKNOWN",
          endUser: { id: "user-1", externalId: "customer_42" },
          origin: { kind: "AI", id: "conversation-1" },
          attemptCount: 2,
          errorCode: "TELEGRAM_OUTCOME_UNKNOWN",
          contentState: "AVAILABLE",
          createdAt: "2026-07-24T11:25:10.000Z",
          updatedAt: "2026-07-24T11:25:16.000Z",
          finishedAt: "2026-07-24T11:25:16.000Z",
        },
      ],
      pageInfo: { hasMore: true, nextCursor: "opaque-next" },
    });

    await expect(
      apiIntegrationActivityRepository.list("project-1", {
        provider: ["TELEGRAM"],
        activityType: ["PERSONAL_MESSAGE"],
        status: ["OUTCOME_UNKNOWN"],
        externalUserId: "customer_42",
        limit: 25,
      }),
    ).resolves.toEqual({
      items: [
        {
          id: "activity-1",
          provider: "TELEGRAM",
          activityType: "PERSONAL_MESSAGE",
          status: "OUTCOME_UNKNOWN",
          state: "OUTCOME_UNKNOWN",
          endUser: { id: "user-1", externalId: "customer_42" },
          origin: { kind: "AI", id: "conversation-1" },
          attemptCount: 2,
          errorCode: "TELEGRAM_OUTCOME_UNKNOWN",
          contentState: "AVAILABLE",
          createdAt: "2026-07-24T11:25:10.000Z",
          updatedAt: "2026-07-24T11:25:16.000Z",
          finishedAt: "2026-07-24T11:25:16.000Z",
        },
      ],
      nextCursor: "opaque-next",
    });
    expect(integrationActivityList).toHaveBeenCalledWith(
      "project-1",
      {
        provider: ["TELEGRAM"],
        activityType: ["PERSONAL_MESSAGE"],
        status: ["OUTCOME_UNKNOWN"],
        externalUserId: "customer_42",
        limit: 25,
      },
      { paramsSerializer: { indexes: null } },
    );
    expect(integrationActivityContent).not.toHaveBeenCalled();
  });

  it("loads message content only through the explicit content operation", async () => {
    vi.mocked(integrationActivityGet).mockResolvedValue({
      id: "activity-1",
      provider: "TELEGRAM",
      activityType: "PERSONAL_MESSAGE",
      status: "SUCCEEDED",
      state: "SENT",
      endUser: { id: "user-1", externalId: "customer_42" },
      origin: { kind: "CMS_USER", id: "cms-1" },
      attemptCount: 1,
      errorCode: null,
      contentState: "AVAILABLE",
      createdAt: "2026-07-24T11:25:10.000Z",
      updatedAt: "2026-07-24T11:25:16.000Z",
      finishedAt: "2026-07-24T11:25:16.000Z",
      sourceResourceKind: "TELEGRAM_PERSONAL_MESSAGE",
      sourceResourceId: "message-1",
      requestId: null,
      correlationId: null,
      conversationId: null,
      scenarioRunId: null,
      attempts: [],
      milestones: [],
    });
    vi.mocked(integrationActivityContent).mockResolvedValue({
      state: "AVAILABLE",
      kind: "TEXT",
      text: "Ваш заказ готов",
      attachment: null,
      redactedAt: null,
    });

    await apiIntegrationActivityRepository.get("project-1", "activity-1");
    expect(integrationActivityContent).not.toHaveBeenCalled();
    await expect(
      apiIntegrationActivityRepository.content("project-1", "activity-1"),
    ).resolves.toMatchObject({ text: "Ваш заказ готов" });
  });
});
