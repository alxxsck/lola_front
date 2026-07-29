import { describe, expect, it } from "vitest";
import {
  AI_USAGE_CATEGORY_LABELS,
  aggregateModelUsage,
  aggregateProviderUsage,
  formatDuration,
  formatMoney,
  getAiUsageRange,
  getCategoryUsage,
  getModelBreakdown,
  getModalityUsage,
  getProviderBreakdown,
  getReportCurrency,
  getUsageCost,
  pluralizeRu,
  usageOperationLabel,
  type AiUsageBreakdown,
  type AiUsageReport,
  type AiUsageTotals,
} from "./ai-usage.model";

const totals: AiUsageTotals = {
  records: 3,
  unpricedRecords: 0,
  providerReportedUsageRecords: 1,
  estimatedCostRecords: 2,
  providerReportedCostRecords: 1,
  estimatedRecords: 2,
  providerUnitOnlyRecords: 0,
  inputCharacters: 240,
  providerBilledUnits: 0,
  totalTokens: 1_300,
  inputTokens: 900,
  cachedInputTokens: 200,
  cacheWriteInputTokens: 0,
  outputTokens: 400,
  reasoningTokens: 0,
  inputTextTokens: 600,
  cachedInputTextTokens: 150,
  outputTextTokens: 250,
  inputAudioTokens: 300,
  cachedInputAudioTokens: 50,
  outputAudioTokens: 150,
  inputImageTokens: 0,
  cachedInputImageTokens: 0,
  outputImageTokens: 0,
  durationSeconds: 95,
  estimatedCost: 0.05,
  billedCost: 0.03,
  providerReportedCost: 0.03,
  estimatedFallbackCost: 0.05,
  effectiveCost: 0.08,
};

function breakdown(patch: Partial<AiUsageBreakdown> = {}): AiUsageBreakdown {
  return {
    provider: "xai",
    model: "grok-4.5",
    operation: "response",
    currency: "usd",
    records: 1,
    inputCharacters: 0,
    providerBilledUnits: 0,
    totalTokens: 100,
    inputTokens: 70,
    cachedInputTokens: 10,
    cacheWriteInputTokens: 0,
    outputTokens: 30,
    reasoningTokens: 0,
    inputTextTokens: 70,
    cachedInputTextTokens: 10,
    outputTextTokens: 30,
    inputAudioTokens: 0,
    cachedInputAudioTokens: 0,
    outputAudioTokens: 0,
    inputImageTokens: 0,
    cachedInputImageTokens: 0,
    outputImageTokens: 0,
    durationSeconds: 0,
    estimatedCost: 0,
    billedCost: 0.01,
    providerReportedCost: 0.01,
    estimatedFallbackCost: 0,
    effectiveCost: 0.01,
    ...patch,
  };
}

describe("AI usage model", () => {
  it("uses user-facing labels for every end-user AI and speech category", () => {
    expect(AI_USAGE_CATEGORY_LABELS).toMatchObject({
      CHAT: "Чат с Lola",
      VOICE: "Голосовой чат",
      SPEECH: "Озвучивание текста",
      MEMORY: "Память Lola",
      AI_REVIEW: "Проверка сообщений",
      AI_ANALYSIS: "AI-анализ",
      CASE_INTELLIGENCE: "Анализ и проверка обращений",
    });
  });

  it("builds calendar ranges in the browser timezone", () => {
    const now = new Date(2026, 6, 14, 15, 30);
    const expectedStart = new Date(now);
    expectedStart.setHours(0, 0, 0, 0);

    expect(getAiUsageRange("today", now)).toEqual({
      from: expectedStart.toISOString(),
      to: now.toISOString(),
    });

    expectedStart.setDate(expectedStart.getDate() - 6);
    expect(getAiUsageRange("7d", now).from).toBe(expectedStart.toISOString());
    expect(getAiUsageRange("all", now)).toEqual({});
  });

  it("keeps only non-Voice, non-Speech operations in the Grok model slice", () => {
    const model = breakdown();
    const voice = breakdown({
      model: "grok-voice-latest",
      operation: "realtime_response",
      durationSeconds: 95,
    });
    const speech = breakdown({
      model: null,
      operation: "speech",
      inputCharacters: 240,
      totalTokens: 0,
    });

    expect(getModelBreakdown([model, voice, speech])).toEqual([model]);
    expect(
      aggregateModelUsage(getModelBreakdown([model, voice, speech])),
    ).toHaveLength(1);
  });

  it("combines operations of the same Grok model and currency", () => {
    const result = aggregateModelUsage([
      breakdown(),
      breakdown({
        operation: "case_router",
        records: 2,
        totalTokens: 200,
        billedCost: 0.02,
      }),
    ]);

    expect(result).toEqual([
      expect.objectContaining({
        model: "grok-4.5",
        records: 3,
        totalTokens: 300,
        billedCost: 0.03,
      }),
    ]);
  });

  it("returns category usage without inventing an empty ledger row", () => {
    const speech = {
      ...breakdown({ model: null, operation: "speech" }),
      category: "SPEECH" as const,
    };
    const report: AiUsageReport = {
      projectId: "project-1",
      totals,
      breakdown: [],
      categories: [speech],
      eventQuery: {
        calls: 0,
        resultBytes: 0,
        estimatedAddedInputTokens: 0,
        linkedUsageIncludedInProviderTotals: true,
        linkedAiUsage: {
          records: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          billedCostUsd: null,
          estimatedCostUsd: null,
        },
      },
      textToSpeechPricing: {
        current: null,
        sourceUrl: "https://docs.x.ai/developers/pricing",
      },
    };

    expect(getCategoryUsage(report, "SPEECH")).toBe(speech);
    expect(getCategoryUsage(report, "VOICE")).toBeUndefined();
  });

  it("keeps provider totals and factual/calculated money separate", () => {
    const usage = aggregateProviderUsage([
      breakdown(),
      breakdown({
        operation: "realtime_response",
        billedCost: 0,
        providerReportedCost: 0,
        estimatedCost: 0.05,
        estimatedFallbackCost: 0.05,
        effectiveCost: 0.05,
      }),
    ]);

    expect(usage).toMatchObject({
      providerReportedCost: 0.01,
      estimatedFallbackCost: 0.05,
    });
    expect(usage.effectiveCost).toBeCloseTo(0.06);
    expect(getUsageCost(usage)).toBeCloseTo(0.06);
  });

  it("keeps currencies separate and refuses to combine their report total", () => {
    const report: AiUsageReport = {
      projectId: "project-1",
      totals,
      breakdown: [breakdown(), breakdown({ currency: "eur" })],
      categories: [],
      eventQuery: {
        calls: 0,
        resultBytes: 0,
        estimatedAddedInputTokens: 0,
        linkedUsageIncludedInProviderTotals: true,
        linkedAiUsage: {
          records: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          billedCostUsd: null,
          estimatedCostUsd: null,
        },
      },
      textToSpeechPricing: {
        current: null,
        sourceUrl: "https://docs.x.ai/developers/pricing",
      },
    };

    expect(aggregateModelUsage(report.breakdown)).toHaveLength(2);
    expect(getReportCurrency(report)).toBeUndefined();
    expect(getProviderBreakdown(report.breakdown, "xai")).toHaveLength(2);
  });

  it("uses non-overlapping text, audio and image modality totals", () => {
    expect(getModalityUsage(totals).map((item) => item.tokens)).toEqual([
      850, 450, 0,
    ]);
  });

  it("labels speech as text-to-speech and formats duration without token language", () => {
    expect(usageOperationLabel("speech")).toBe("Озвучивание текста");
    expect(usageOperationLabel("case_router")).toBe("Маршрутизация");
    expect(usageOperationLabel("realtime_response")).toBe("Голосовой ответ");
    expect(usageOperationLabel("knowledge_search")).toBe("Knowledge search");
    expect(formatDuration(95)).toBe("1 мин 35 сек");
  });

  it("uses correct Russian plural forms and money formatting", () => {
    expect(
      [1, 2, 5, 11, 21, 24].map((value) =>
        pluralizeRu(value, "модель", "модели", "моделей"),
      ),
    ).toEqual(["модель", "модели", "моделей", "моделей", "модель", "модели"]);
    expect(formatMoney(0.0012, "usd")).toBe("< 0,01 $");
  });
});
