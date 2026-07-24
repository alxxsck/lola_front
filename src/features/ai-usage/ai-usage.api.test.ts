import { describe, expect, it } from "vitest";
import type { AiUsageReportResponseDto } from "@/shared/api/generated/models";
import { parseAiUsageReport } from "./ai-usage.api";

const currentTotals = {
  records: 2,
  unpricedRecords: 0,
  providerReportedUsageRecords: 0,
  estimatedCostRecords: 2,
  providerReportedCostRecords: 0,
  estimatedRecords: 2,
  providerUnitOnlyRecords: 0,
  inputCharacters: 0,
  totalTokens: 120,
  inputTokens: 80,
  cachedInputTokens: 20,
  cacheWriteInputTokens: 0,
  outputTokens: 40,
  reasoningTokens: 0,
  inputTextTokens: 80,
  cachedInputTextTokens: 20,
  outputTextTokens: 40,
  inputAudioTokens: 0,
  cachedInputAudioTokens: 0,
  outputAudioTokens: 0,
  inputImageTokens: 0,
  cachedInputImageTokens: 0,
  outputImageTokens: 0,
  durationSeconds: "0.000000000000",
  providerBilledUnits: "0.000000000000",
  estimatedCost: "0.001200000000",
  billedCost: "0.000000000000",
  providerReportedCost: "0.000000000000",
  estimatedFallbackCost: "0.001200000000",
  effectiveCost: "0.001200000000",
};

const response = {
  projectId: "project-1",
  range: { from: null, to: null },
  totals: currentTotals,
  breakdown: [
    {
      provider: "xai",
      model: "grok-4.5",
      operation: "responses",
      currency: "usd",
      records: 2,
      inputCharacters: 0,
      totalTokens: 120,
      inputTokens: 80,
      cachedInputTokens: 20,
      cacheWriteInputTokens: 0,
      outputTokens: 40,
      reasoningTokens: 0,
      inputTextTokens: 80,
      cachedInputTextTokens: 20,
      outputTextTokens: 40,
      inputAudioTokens: 0,
      cachedInputAudioTokens: 0,
      outputAudioTokens: 0,
      inputImageTokens: 0,
      cachedInputImageTokens: 0,
      outputImageTokens: 0,
      durationSeconds: "0.000000000000",
      providerBilledUnits: "0.000000000000",
      estimatedCost: "0.001200000000",
      billedCost: "0.000000000000",
      providerReportedCost: "0.000000000000",
      estimatedFallbackCost: "0.001200000000",
      effectiveCost: "0.001200000000",
    },
  ],
  categories: [],
  items: [],
  nextCursor: null,
} satisfies AiUsageReportResponseDto;

describe("AI usage API response validation", () => {
  it("normalizes decimal strings without exposing raw ledger rows", () => {
    expect(parseAiUsageReport(response, "project-1")).toMatchObject({
      projectId: "project-1",
      totals: {
        inputCharacters: 0,
        providerBilledUnits: 0,
        estimatedCost: 0.0012,
      },
      breakdown: [
        {
          model: "grok-4.5",
          inputCharacters: 0,
          providerBilledUnits: 0,
          estimatedCost: 0.0012,
        },
      ],
    });
  });

  it("parses modality details from the current backend DTO", () => {
    expect(parseAiUsageReport(response, "project-1")?.totals).toMatchObject({
      cacheWriteInputTokens: 0,
      cachedInputTextTokens: 20,
      cachedInputAudioTokens: 0,
      inputImageTokens: 0,
      cachedInputImageTokens: 0,
      outputImageTokens: 0,
    });
  });

  it("parses provider-reported xAI billed cost when estimated cost is zero", () => {
    const providerReportedResponse = {
      ...response,
      totals: {
        ...response.totals,
        providerReportedUsageRecords: 2,
        estimatedCostRecords: 0,
        estimatedCost: "0.000000000000",
        billedCost: "0.018152000000",
      },
      breakdown: [
        {
          ...response.breakdown[0],
          estimatedCost: "0.000000000000",
          billedCost: "0.018152000000",
        },
      ],
    };

    expect(
      parseAiUsageReport(providerReportedResponse, "project-1"),
    ).toMatchObject({
      totals: { estimatedCost: 0, billedCost: 0.018152 },
      breakdown: [{ estimatedCost: 0, billedCost: 0.018152 }],
    });
  });

  it("parses nonzero cache and image modality details", () => {
    const legacyResponse = {
      ...response,
      totals: {
        ...response.totals,
        cacheWriteInputTokens: 3,
        cachedInputTextTokens: 4,
        cachedInputAudioTokens: 5,
        inputImageTokens: 6,
        cachedInputImageTokens: 7,
        outputImageTokens: 8,
      },
    };

    expect(
      parseAiUsageReport(legacyResponse, "project-1")?.totals,
    ).toMatchObject({
      cacheWriteInputTokens: 3,
      cachedInputTextTokens: 4,
      cachedInputAudioTokens: 5,
      inputImageTokens: 6,
      cachedInputImageTokens: 7,
      outputImageTokens: 8,
    });
  });

  it("does not guess exact coverage counters from an aggregated legacy response", () => {
    const legacyResponse = {
      ...response,
      totals: {
        ...response.totals,
        records: 3,
        unpricedRecords: 3,
        providerReportedUsageRecords: undefined,
        estimatedCostRecords: undefined,
        inputCharacters: 1_200,
        providerBilledUnits: "1250.000000000000",
        estimatedCost: "0.000000000000",
      },
      breakdown: [
        {
          ...response.breakdown[0],
          provider: "elevenlabs",
          model: "eleven_v3",
          operation: "speech",
          records: 3,
          inputCharacters: 1_200,
          providerBilledUnits: "1250.000000000000",
          totalTokens: 0,
          inputTokens: 0,
          cachedInputTokens: 0,
          outputTokens: 0,
          inputTextTokens: 0,
          outputTextTokens: 0,
          estimatedCost: "0.000000000000",
        },
      ],
    };

    expect(
      parseAiUsageReport(legacyResponse, "project-1")?.totals,
    ).toMatchObject({
      unpricedRecords: 3,
    });
    expect(
      parseAiUsageReport(legacyResponse, "project-1")?.totals,
    ).not.toHaveProperty("providerReportedUsageRecords");
    expect(
      parseAiUsageReport(legacyResponse, "project-1")?.totals,
    ).not.toHaveProperty("estimatedCostRecords");
  });

  it("rejects cross-project, negative and oversized responses", () => {
    expect(parseAiUsageReport(response, "project-2")).toBeUndefined();
    expect(
      parseAiUsageReport(
        { ...response, totals: { ...response.totals, totalTokens: -1 } },
        "project-1",
      ),
    ).toBeUndefined();
    expect(
      parseAiUsageReport(
        { ...response, breakdown: Array.from({ length: 1_001 }) },
        "project-1",
      ),
    ).toBeUndefined();
  });
});
