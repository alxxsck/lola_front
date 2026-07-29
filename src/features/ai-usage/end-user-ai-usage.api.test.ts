import { describe, expect, it } from "vitest";
import { buildDemoTextToSpeechPricingContext } from "./ai-usage.api";
import {
  buildEndUserAiUsageDemoReport,
  parseEndUserAiUsageReport,
} from "./end-user-ai-usage.api";

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
  providers: {
    xai: {
      eventQuery: {
        calls: 6,
        resultBytes: 3_300,
        estimatedAddedInputTokens: 1_119,
        linkedUsageIncludedInProviderTotals: true,
        linkedAiUsage: {
          records: 1,
          totalTokens: 74_546,
          inputTokens: 60_000,
          outputTokens: 14_546,
          billedCostUsd: "0.029500800000",
          estimatedCostUsd: null,
        },
      },
    },
  },
  breakdown: [],
  items: [],
  nextCursor: null,
  textToSpeechPricing: {
    current: {
      rate: "15",
      currency: "usd",
      unit: "per_million_input_characters",
      effectiveFrom: "2026-07-29T10:00:00.000Z",
    },
    sourceUrl: "https://docs.x.ai/developers/pricing",
  },
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
      eventQuery: {
        calls: 6,
        resultBytes: 3_300,
        linkedAiUsage: {
          totalTokens: 74_546,
          billedCostUsd: 0.0295008,
        },
      },
      textToSpeechPricing: {
        current: { rate: "15", currency: "usd" },
        sourceUrl: "https://docs.x.ai/developers/pricing",
      },
    });
  });

  it("rejects missing Event Query data or a false totals-inclusion contract", () => {
    expect(
      parseEndUserAiUsageReport(
        { ...response, providers: undefined },
        "project-1",
        "user-1",
      ),
    ).toBeUndefined();
    expect(
      parseEndUserAiUsageReport(
        {
          ...response,
          providers: {
            xai: {
              eventQuery: {
                ...response.providers.xai.eventQuery,
                linkedUsageIncludedInProviderTotals: false,
              },
            },
          },
        },
        "project-1",
        "user-1",
      ),
    ).toBeUndefined();
  });

  it("accepts case intelligence usage returned for AI-created cases", () => {
    const responseWithCaseUsage = {
      ...response,
      categories: [
        ...response.categories,
        {
          ...summary,
          category: "CASE_INTELLIGENCE",
          currency: "usd",
          records: 23,
          totalTokens: 41_099,
        },
      ],
    };

    expect(
      parseEndUserAiUsageReport(responseWithCaseUsage, "project-1", "user-1"),
    ).toMatchObject({
      categories: [
        { category: "CHAT" },
        {
          category: "CASE_INTELLIGENCE",
          records: 23,
          totalTokens: 41_099,
        },
      ],
    });
  });

  it("preserves AI analysis usage attributed to the end user", () => {
    const responseWithAnalysisUsage = {
      ...response,
      categories: [
        ...response.categories,
        {
          ...summary,
          category: "AI_ANALYSIS",
          currency: "usd",
          records: 5,
          totalTokens: 9_876,
        },
      ],
    };

    expect(
      parseEndUserAiUsageReport(
        responseWithAnalysisUsage,
        "project-1",
        "user-1",
      ),
    ).toMatchObject({
      categories: [
        { category: "CHAT" },
        {
          category: "AI_ANALYSIS",
          records: 5,
          totalTokens: 9_876,
        },
      ],
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
    expect(
      parseEndUserAiUsageReport(
        {
          ...response,
          categories: [
            { ...summary, category: "CHAT", currency: "not-a-currency" },
          ],
        },
        "project-1",
        "user-1",
      ),
    ).toBeUndefined();
  });

  it("rejects an absent or unsafe TTS pricing explanation", () => {
    expect(
      parseEndUserAiUsageReport(
        { ...response, textToSpeechPricing: undefined },
        "project-1",
        "user-1",
      ),
    ).toBeUndefined();
    expect(
      parseEndUserAiUsageReport(
        {
          ...response,
          textToSpeechPricing: {
            ...response.textToSpeechPricing,
            sourceUrl: "https://user:secret@docs.x.ai/developers/pricing",
          },
        },
        "project-1",
        "user-1",
      ),
    ).toBeUndefined();
  });

  it("keeps demo speech cost backend-shaped and included in calculated totals", () => {
    const demo = buildEndUserAiUsageDemoReport("project-1", "user-1", "7d");
    const speech = demo.categories.find(
      (category) => category.category === "SPEECH",
    );

    expect(speech).toMatchObject({
      inputCharacters: 1_980,
      providerBilledUnits: 0,
      estimatedFallbackCost: 0.0297,
      effectiveCost: 0.0297,
    });
    expect(demo.totals).toMatchObject({
      estimatedFallbackCost: 0.0897,
      effectiveCost: 0.2497,
      providerUnitOnlyRecords: 0,
    });
    expect(demo.textToSpeechPricing.current?.rate).toBe("15");
    expect(demo.textToSpeechPricing).toEqual(
      buildDemoTextToSpeechPricingContext(),
    );
  });
});
