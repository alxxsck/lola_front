import { describe, expect, it } from "vitest";
import { mockEventQueryRepository } from "./mock-event-query-repository";

describe("mock event query repository", () => {
  it("exposes only an enabled typed policy and safe result shapes", async () => {
    const policy = await mockEventQueryRepository.getPolicy("project-demo");
    const stableCodes =
      policy.published?.document.items.map((item) => item.stableCode) ?? [];

    expect(policy.published?.document.enabled).toBe(true);
    expect(stableCodes).toContain("registration_completed");

    const preview = await mockEventQueryRepository.preview("project-demo", {
      endUserId: "user-demo",
      query: {
        eventCodes: ["registration_completed"],
        mode: "SUMMARY",
        timeRange: { kind: "LAST_24_HOURS" },
      },
    });

    expect(preview).toMatchObject({
      complete: true,
      status: "COMPLETED",
      truncated: false,
    });
    expect(JSON.stringify(preview)).not.toContain("endUserId");
    expect(JSON.stringify(preview)).not.toContain("payload");
  });

  it("keeps case verification idempotency input out of returned evidence", async () => {
    const run = await mockEventQueryRepository.startCaseVerification(
      "project-demo",
      "case-demo",
      {
        idempotencyKey: "00000000-0000-4000-8000-000000000001",
        queries: [
          {
            key: "goal_event",
            query: {
              eventCodes: ["deposit_failed"],
              mode: "SUMMARY",
              timeRange: { kind: "CURRENT_CASE_WINDOW" },
            },
          },
        ],
        predicate: { operator: "EVENT_EXISTS", queryKey: "goal_event" },
      },
    );

    expect(run.evaluation).toBe("VERIFIED_RESOLVED");
    expect(run.caseChanged).toBe(true);
    expect(JSON.stringify(run)).not.toContain("idempotencyKey");
  });
});
