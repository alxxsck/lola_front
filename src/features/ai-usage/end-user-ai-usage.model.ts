import {
  AI_USAGE_CATEGORY_LABELS,
  type AiUsageCategory,
  type AiUsageEventQueryBreakdown,
  type AiUsageRangeKey,
  type AiTextToSpeechPricingContext,
} from './ai-usage.model';
import type { DecimalString } from '@/shared/lib/decimal-money';

export type EndUserAiUsageCategory = AiUsageCategory;

export interface EndUserAiUsageSummary {
  records: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  inputCharacters: number;
  providerBilledUnits: number;
  durationSeconds: number;
  providerReportedCost: DecimalString;
  estimatedFallbackCost: DecimalString;
  effectiveCost: DecimalString;
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
  eventQuery: AiUsageEventQueryBreakdown;
  textToSpeechPricing: AiTextToSpeechPricingContext;
}

export const END_USER_AI_USAGE_WINDOWS: ReadonlyArray<{
  label: string;
  value: AiUsageRangeKey;
}> = [
  { label: 'Сегодня', value: 'today' },
  { label: '7 дней', value: '7d' },
  { label: '30 дней', value: '30d' },
  { label: 'Всё', value: 'all' },
];

export const END_USER_AI_USAGE_CATEGORY_LABELS: Record<EndUserAiUsageCategory, string> =
  AI_USAGE_CATEGORY_LABELS;
