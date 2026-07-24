import { describe, expect, it } from "vitest";
import { parseEndUserAiUsageReport } from "./end-user-ai-usage.api";

const summary = {
  records: 4,
  totalTokens: 10_000,
  inputTokens: 8_000,
  outputTokens: 2_000,
  inputCharacters: 0,
  providerBilledUnits: "0.000000000000",
  durationSeconds: "0.000000000000",
  providerReportedCost: "0.120000000000",
  estimatedFallbackCost: "0.030000000000",
  effectiveCost: "0.150000000000",
};

const response = {
  projectId: "project-1",
  endUserId: "user-1",
  window: "7d",
  range: {
    from: "2026-07-18T22:00:00.000Z",
    to: "2026-07-24T18:00:00.000Z",
    timezone: "Europe/Madrid",
  },
  totals: {
    ...summary,
    providerReportedCostRecords: 2,
    estimatedRecords: 1,
    providerUnitOnlyRecords: 0,
    unpricedRecords: 0,
  },
  categories: [{ ...summary, category: "CHAT", currency: "usd" }],
  breakdown: [],
  items: [],
  nextCursor: null,
};

describe("End User AI consumption response validation", () => {
  it("keeps server window metadata and normalizes decimal values", () => {
    expect(
      parseEndUserAiUsageReport(response, "project-1", "user-1"),
    ).toMatchObject({
      window: "7d",
      range: { timezone: "Europe/Madrid" },
      totals: {
        providerReportedCost: 0.12,
        estimatedFallbackCost: 0.03,
        effectiveCost: 0.15,
      },
      categories: [{ category: "CHAT", totalTokens: 10_000 }],
    });
  });

  it("rejects cross-user responses and unknown UI categories", () => {
    expect(
      parseEndUserAiUsageReport(response, "project-1", "another-user"),
    ).toBeUndefined();
    expect(
      parseEndUserAiUsageReport(
        {
          ...response,
          categories: [{ ...summary, category: "FUTURE", currency: "usd" }],
        },
        "project-1",
        "user-1",
      ),
    ).toBeUndefined();
  });
});
