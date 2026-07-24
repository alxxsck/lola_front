import type { AiUsageRangeKey } from "./ai-usage.model";

export type EndUserAiUsageCategory =
  "CHAT" | "VOICE" | "SPEECH" | "MEMORY" | "AI_REVIEW" | "PROJECT_OVERHEAD";

export interface EndUserAiUsageSummary {
  records: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  inputCharacters: number;
  providerBilledUnits: number;
  durationSeconds: number;
  providerReportedCost: number;
  estimatedFallbackCost: number;
  effectiveCost: number;
}

export interface EndUserAiUsageTotals extends EndUserAiUsageSummary {
  providerReportedCostRecords: number;
  estimatedRecords: number;
  providerUnitOnlyRecords: number;
  unpricedRecords: number;
}

export interface EndUserAiUsageCategoryRow extends EndUserAiUsageSummary {
  category: EndUserAiUsageCategory;
  currency: string;
}

export interface EndUserAiUsageReport {
  projectId: string;
  endUserId: string;
  window: AiUsageRangeKey;
  range: {
    from: string | null;
    to: string;
    timezone: string;
  };
  totals: EndUserAiUsageTotals;
  categories: EndUserAiUsageCategoryRow[];
}

export const END_USER_AI_USAGE_WINDOWS: ReadonlyArray<{
  label: string;
  value: AiUsageRangeKey;
}> = [
  { label: "Сегодня", value: "today" },
  { label: "7 дней", value: "7d" },
  { label: "30 дней", value: "30d" },
  { label: "Всё", value: "all" },
];

export const END_USER_AI_USAGE_CATEGORY_LABELS: Record<
  EndUserAiUsageCategory,
  string
> = {
  CHAT: "Чат с Lola",
  VOICE: "Голос",
  SPEECH: "Озвучивание",
  MEMORY: "Память Lola",
  AI_REVIEW: "AI Review",
  PROJECT_OVERHEAD: "Системные операции",
};
