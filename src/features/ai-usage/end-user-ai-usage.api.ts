import { endUserAiUsageReport } from "@/shared/api/generated/lola-backend";
import { isMockMode } from "@/shared/config/data-mode";
import type { AiUsageRangeKey } from "./ai-usage.model";
import type {
  EndUserAiUsageCategory,
  EndUserAiUsageCategoryRow,
  EndUserAiUsageReport,
  EndUserAiUsageSummary,
  EndUserAiUsageTotals,
} from "./end-user-ai-usage.model";

const categories = new Set<EndUserAiUsageCategory>([
  "CHAT",
  "VOICE",
  "SPEECH",
  "MEMORY",
  "AI_REVIEW",
  "PROJECT_OVERHEAD",
]);
const windows = new Set<AiUsageRangeKey>(["today", "7d", "30d", "all"]);

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function integer(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

function decimal(value: unknown): number | undefined {
  if (
    typeof value === "string" &&
    (value.length > 64 || !/^\d+(?:\.\d+)?$/.test(value))
  )
    return undefined;
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function parseSummary(value: unknown): EndUserAiUsageSummary | undefined {
  const source = record(value);
  if (!source) return undefined;
  const parsed = {
    records: integer(source.records),
    totalTokens: integer(source.totalTokens),
    inputTokens: integer(source.inputTokens),
    outputTokens: integer(source.outputTokens),
    inputCharacters: integer(source.inputCharacters),
    providerBilledUnits: decimal(source.providerBilledUnits),
    durationSeconds: decimal(source.durationSeconds),
    providerReportedCost: decimal(source.providerReportedCost),
    estimatedFallbackCost: decimal(source.estimatedFallbackCost),
    effectiveCost: decimal(source.effectiveCost),
  };
  return Object.values(parsed).some((item) => item === undefined)
    ? undefined
    : (parsed as EndUserAiUsageSummary);
}

function parseTotals(value: unknown): EndUserAiUsageTotals | undefined {
  const source = record(value);
  const summary = parseSummary(value);
  if (!source || !summary) return undefined;
  const counters = {
    providerReportedCostRecords: integer(source.providerReportedCostRecords),
    estimatedRecords: integer(source.estimatedRecords),
    providerUnitOnlyRecords: integer(source.providerUnitOnlyRecords),
    unpricedRecords: integer(source.unpricedRecords),
  };
  return Object.values(counters).some((item) => item === undefined)
    ? undefined
    : ({ ...summary, ...counters } as EndUserAiUsageTotals);
}

function parseCategory(value: unknown): EndUserAiUsageCategoryRow | undefined {
  const source = record(value);
  const summary = parseSummary(value);
  if (
    !source ||
    !summary ||
    typeof source.category !== "string" ||
    !categories.has(source.category as EndUserAiUsageCategory) ||
    typeof source.currency !== "string"
  )
    return undefined;
  return {
    ...summary,
    category: source.category as EndUserAiUsageCategory,
    currency: source.currency,
  };
}

export function parseEndUserAiUsageReport(
  value: unknown,
  projectId: string,
  endUserId: string,
): EndUserAiUsageReport | undefined {
  const source = record(value);
  const range = record(source?.range);
  if (
    !source ||
    source.projectId !== projectId ||
    source.endUserId !== endUserId ||
    typeof source.window !== "string" ||
    !windows.has(source.window as AiUsageRangeKey) ||
    !range ||
    (range.from !== null && typeof range.from !== "string") ||
    typeof range.to !== "string" ||
    typeof range.timezone !== "string" ||
    !Array.isArray(source.categories) ||
    source.categories.length > categories.size
  )
    return undefined;
  const totals = parseTotals(source.totals);
  const parsedCategories = source.categories.map(parseCategory);
  if (!totals || parsedCategories.some((item) => !item)) return undefined;
  return {
    projectId,
    endUserId,
    window: source.window as AiUsageRangeKey,
    range: {
      from: range.from as string | null,
      to: range.to,
      timezone: range.timezone,
    },
    totals,
    categories: parsedCategories as EndUserAiUsageCategoryRow[],
  };
}

function demoReport(
  projectId: string,
  endUserId: string,
  window: AiUsageRangeKey,
): EndUserAiUsageReport {
  const summary = (
    values: Partial<EndUserAiUsageSummary>,
  ): EndUserAiUsageSummary => ({
    records: 0,
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    inputCharacters: 0,
    providerBilledUnits: 0,
    durationSeconds: 0,
    providerReportedCost: 0,
    estimatedFallbackCost: 0,
    effectiveCost: 0,
    ...values,
  });
  const categories: EndUserAiUsageCategoryRow[] = [
    {
      category: "CHAT",
      currency: "usd",
      ...summary({
        records: 18,
        totalTokens: 34_200,
        inputTokens: 27_500,
        outputTokens: 6_700,
        providerReportedCost: 0.14,
        effectiveCost: 0.14,
      }),
    },
    {
      category: "VOICE",
      currency: "usd",
      ...summary({
        records: 7,
        totalTokens: 8_100,
        inputTokens: 5_900,
        outputTokens: 2_200,
        estimatedFallbackCost: 0.06,
        effectiveCost: 0.06,
        durationSeconds: 146,
      }),
    },
    {
      category: "SPEECH",
      currency: "usd",
      ...summary({
        records: 4,
        inputCharacters: 1_980,
        providerBilledUnits: 2_040,
      }),
    },
    {
      category: "AI_REVIEW",
      currency: "usd",
      ...summary({
        records: 1,
        totalTokens: 2_400,
        inputTokens: 1_900,
        outputTokens: 500,
        providerReportedCost: 0.02,
        effectiveCost: 0.02,
      }),
    },
  ];
  return {
    projectId,
    endUserId,
    window,
    range: {
      from: window === "all" ? null : "2026-07-18T22:00:00.000Z",
      to: "2026-07-24T18:00:00.000Z",
      timezone: "Europe/Madrid",
    },
    totals: {
      ...summary({
        records: 30,
        totalTokens: 44_700,
        inputTokens: 35_300,
        outputTokens: 9_400,
        inputCharacters: 1_980,
        providerBilledUnits: 2_040,
        durationSeconds: 146,
        providerReportedCost: 0.16,
        estimatedFallbackCost: 0.06,
        effectiveCost: 0.22,
      }),
      providerReportedCostRecords: 19,
      estimatedRecords: 6,
      providerUnitOnlyRecords: 4,
      unpricedRecords: 0,
    },
    categories,
  };
}

export async function fetchEndUserAiUsageReport(
  projectId: string,
  endUserId: string,
  window: AiUsageRangeKey,
  signal?: AbortSignal,
): Promise<EndUserAiUsageReport> {
  if (isMockMode) return demoReport(projectId, endUserId, window);
  const response: unknown = await endUserAiUsageReport(
    projectId,
    endUserId,
    { window, limit: 1 },
    { signal },
  );
  const parsed = parseEndUserAiUsageReport(response, projectId, endUserId);
  if (!parsed)
    throw new Error(
      "Сервер вернул некорректные данные потребления пользователя",
    );
  return parsed;
}
