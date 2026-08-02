import { axiosInstance } from "@/shared/api/http/axios-instance";
import { isMockMode } from "@/shared/config/data-mode";
import {
  addDecimalStrings,
  compareDecimalStrings,
  parseDecimalString,
  type DecimalString,
} from "@/shared/lib/decimal-money";
import type {
  AiCostCmsUserRow,
  AiCostMoney,
  AiCostOverview,
  AiCostPage,
  AiCostRange,
  AiCostProjection,
  AiCostRankedRow,
  AiCostSortDirection,
  AiCostSortKey,
  AiCostUserRow,
} from "../model/ai-costs";
import { sortAiCostRows } from "../model/ai-costs";

export interface AiCostPageQuery extends AiCostRange {
  sort: AiCostSortKey;
  direction: AiCostSortDirection;
  limit: number;
  offset: number;
}

export interface AiCostsRepository {
  overview(projectId: string, range: AiCostRange): Promise<AiCostOverview>;
  users(
    projectId: string,
    query: AiCostPageQuery,
  ): Promise<AiCostPage<AiCostUserRow>>;
  cmsUsers(
    projectId: string,
    query: AiCostPageQuery,
  ): Promise<AiCostPage<AiCostCmsUserRow>>;
}

const apiRepository: AiCostsRepository = {
  async overview(projectId, range) {
    const response = await axiosInstance.get<unknown>(
      endpoint(projectId, "overview"),
      { params: range },
    );
    return validOverview(response.data);
  },
  async users(projectId, query) {
    const response = await axiosInstance.get<unknown>(
      endpoint(projectId, "users"),
      {
        params: query,
      },
    );
    return validPage(response.data, parseUser);
  },
  async cmsUsers(projectId, query) {
    const response = await axiosInstance.get<unknown>(
      endpoint(projectId, "cms-users"),
      { params: query },
    );
    return validPage(response.data, parseCmsUser);
  },
};

const demoRange: AiCostRange = {
  from: "2026-07-27T00:00:00.000Z",
  to: "2026-08-03T00:00:00.000Z",
};
const demoCosts: AiCostMoney = {
  providerReportedCostUsd: "12.841200000000",
  estimatedFallbackCostUsd: "2.308700000000",
  effectiveCostUsd: "15.149900000000",
  pricedCostRecords: 1258,
};
const demoOverview: AiCostOverview = {
  range: demoRange,
  timezone: "Europe/Madrid",
  projection: {
    status: "FRESH",
    timezone: "Europe/Madrid",
    asOf: "2026-08-03T00:00:00.000Z",
    lastReconciledAt: "2026-08-03T00:00:00.000Z",
    sourceRecords: "1284",
    projectedRecords: "1284",
    rebuildGeneration: "1",
    driftDetected: false,
  },
  totals: demoCosts,
  completeness: {
    totalRecords: 1_284,
    providerReportedRecords: 1_047,
    estimatedRecords: 211,
    unpricedRecords: 26,
    pricedPercent: "97.98",
  },
  categories: [
    { category: "CHAT", records: 842, ...money("8.42", "1.18") },
    { category: "VOICE", records: 183, ...money("2.31", "0.64") },
    { category: "AI_ANALYSIS", records: 89, ...money("1.72", "0.28") },
    { category: "SPEECH", records: 170, ...money("0.3912", "0.2087") },
  ],
  daily: [
    { day: "2026-07-27", records: 161, ...money("1.44", "0.25") },
    { day: "2026-07-28", records: 178, ...money("1.71", "0.29") },
    { day: "2026-07-29", records: 194, ...money("1.82", "0.31") },
    { day: "2026-07-30", records: 207, ...money("2.03", "0.37") },
    { day: "2026-07-31", records: 188, ...money("1.94", "0.35") },
    { day: "2026-08-01", records: 169, ...money("1.83", "0.34") },
    { day: "2026-08-02", records: 187, ...money("2.0712", "0.3987") },
  ],
};
const demoUsers: AiCostUserRow[] = [
  user("end-user-anna", "anna@example.com", "vip", 164, "2.9831"),
  user("end-user-max", "max@example.com", "returning", 128, "2.2018"),
  user("end-user-42", "telegram:1042381", null, 91, "1.4862"),
];
const demoEmployees: AiCostCmsUserRow[] = [
  employee("cms-1", "admin@example.com", 84, "1.3201"),
  employee("cms-2", "analyst@example.com", 57, "0.8894"),
];

const mockRepository: AiCostsRepository = {
  async overview(_projectId, range) {
    return { ...demoOverview, range };
  },
  async users(_projectId, query) {
    return demoPage(demoUsers, query);
  },
  async cmsUsers(_projectId, query) {
    return demoPage(demoEmployees, query);
  },
};

export const aiCostsRepository: AiCostsRepository = isMockMode
  ? mockRepository
  : apiRepository;

function endpoint(projectId: string, resource: string): string {
  return `/api/v1/admin/projects/${encodeURIComponent(projectId)}/ai-costs/${resource}`;
}

function validOverview(value: unknown): AiCostOverview {
  const source = record(value);
  const range = parseRange(source?.range);
  const totals = parseMoney(source?.totals);
  const projection = parseProjection(source?.projection);
  const completeness = record(source?.completeness);
  const totalRecords = integer(completeness?.totalRecords);
  const providerReportedRecords = integer(
    completeness?.providerReportedRecords,
  );
  const estimatedRecords = integer(completeness?.estimatedRecords);
  const unpricedRecords = integer(completeness?.unpricedRecords);
  const pricedPercent = parseDecimalString(completeness?.pricedPercent);
  if (
    !source ||
    !range ||
    !totals ||
    !projection ||
    !bounded(source.timezone, 1, 80) ||
    totalRecords === undefined ||
    providerReportedRecords === undefined ||
    estimatedRecords === undefined ||
    unpricedRecords === undefined ||
    !pricedPercent ||
    compareDecimalStrings(pricedPercent, "100") > 0 ||
    providerReportedRecords + estimatedRecords + unpricedRecords !==
      totalRecords ||
    !Array.isArray(source.categories) ||
    source.categories.length > 100 ||
    !Array.isArray(source.daily) ||
    source.daily.length > 367
  )
    invalid();
  const categories = source.categories.map(parseCategory);
  const daily = source.daily.map(parseDaily);
  if (categories.some((item) => !item) || daily.some((item) => !item))
    invalid();
  return {
    range,
    timezone: source.timezone,
    projection,
    totals,
    completeness: {
      totalRecords,
      providerReportedRecords,
      estimatedRecords,
      unpricedRecords,
      pricedPercent,
    },
    categories: categories as AiCostOverview["categories"],
    daily: daily as AiCostOverview["daily"],
  };
}

function validPage<T extends AiCostRankedRow>(
  value: unknown,
  parseItem: (value: unknown) => T | undefined,
): AiCostPage<T> {
  const source = record(value);
  const range = parseRange(source?.range);
  const projection = parseProjection(source?.projection);
  const pagination = record(source?.pagination);
  const limit = integer(pagination?.limit);
  const offset = integer(pagination?.offset);
  const nextOffset =
    pagination?.nextOffset === null ? null : integer(pagination?.nextOffset);
  if (
    !source ||
    !range ||
    !projection ||
    !Array.isArray(source.items) ||
    source.items.length > 200 ||
    !pagination ||
    limit === undefined ||
    limit < 1 ||
    limit > 200 ||
    offset === undefined ||
    typeof pagination.hasMore !== "boolean" ||
    typeof pagination.truncated !== "boolean" ||
    nextOffset === undefined ||
    source.items.length > limit ||
    pagination.hasMore !== (nextOffset !== null || pagination.truncated) ||
    pagination.truncated !== (pagination.hasMore && nextOffset === null)
  )
    invalid();
  const items = source.items.map(parseItem);
  if (items.some((item) => !item)) invalid();
  return {
    range,
    projection,
    items: items as T[],
    pagination: {
      limit,
      offset,
      hasMore: pagination.hasMore,
      nextOffset,
      truncated: pagination.truncated,
    },
  };
}

function parseCategory(
  value: unknown,
): AiCostOverview["categories"][number] | undefined {
  const source = record(value);
  const costs = parseMoney(source);
  const records = integer(source?.records);
  return source &&
    costs &&
    bounded(source.category, 1, 80) &&
    records !== undefined
    ? { category: source.category, records, ...costs }
    : undefined;
}

function parseDaily(
  value: unknown,
): AiCostOverview["daily"][number] | undefined {
  const source = record(value);
  const costs = parseMoney(source);
  const records = integer(source?.records);
  return source && costs && calendarDate(source.day) && records !== undefined
    ? { day: source.day, records, ...costs }
    : undefined;
}

function parseUser(value: unknown): AiCostUserRow | undefined {
  const source = record(value);
  const base = parseRanked(source);
  return source &&
    base &&
    bounded(source.endUserId, 1, 160) &&
    bounded(source.externalId, 1, 320) &&
    (source.segment === null || bounded(source.segment, 1, 120))
    ? {
        endUserId: source.endUserId,
        externalId: source.externalId,
        segment: source.segment,
        ...base,
      }
    : undefined;
}

function parseCmsUser(value: unknown): AiCostCmsUserRow | undefined {
  const source = record(value);
  const base = parseRanked(source);
  return source &&
    base &&
    bounded(source.cmsUserId, 1, 160) &&
    bounded(source.email, 3, 320)
    ? { cmsUserId: source.cmsUserId, email: source.email, ...base }
    : undefined;
}

function parseRanked(
  source: Record<string, unknown> | undefined,
): AiCostRankedRow | undefined {
  const costs = parseMoney(source);
  const records = integer(source?.records);
  const unpricedRecords = integer(source?.unpricedRecords);
  return costs && records !== undefined && unpricedRecords !== undefined
    ? { records, unpricedRecords, ...costs }
    : undefined;
}

function parseMoney(value: unknown): AiCostMoney | undefined {
  const source = record(value);
  if (!source) return undefined;
  const providerReportedCostUsd =
    source.providerReportedCostUsd === null
      ? null
      : parseDecimalString(source.providerReportedCostUsd);
  const estimatedFallbackCostUsd =
    source.estimatedFallbackCostUsd === null
      ? null
      : parseDecimalString(source.estimatedFallbackCostUsd);
  const effectiveCostUsd =
    source.effectiveCostUsd === null
      ? null
      : parseDecimalString(source.effectiveCostUsd);
  const pricedCostRecords = integer(source.pricedCostRecords);
  const parts = [providerReportedCostUsd, estimatedFallbackCostUsd].filter(
    (part): part is DecimalString => part !== null && part !== undefined,
  );
  return providerReportedCostUsd !== undefined &&
    estimatedFallbackCostUsd !== undefined &&
    effectiveCostUsd !== undefined &&
    pricedCostRecords !== undefined &&
    ((parts.length === 0 && effectiveCostUsd === null) ||
      (parts.length > 0 &&
        effectiveCostUsd !== null &&
        compareDecimalStrings(addDecimalStrings(parts), effectiveCostUsd) ===
          0))
    ? {
        providerReportedCostUsd,
        estimatedFallbackCostUsd,
        effectiveCostUsd,
        pricedCostRecords,
      }
    : undefined;
}

function parseProjection(value: unknown): AiCostProjection | undefined {
  const s = record(value);
  const status =
    s?.status === "FRESH" || s?.status === "STALE" ? s.status : undefined;
  const nullableIso = (v: unknown) => v === null || iso(v);
  return s &&
    status &&
    bounded(s.timezone, 1, 100) &&
    nullableIso(s.asOf) &&
    nullableIso(s.lastReconciledAt) &&
    bigintString(s.sourceRecords) &&
    bigintString(s.projectedRecords) &&
    bigintString(s.rebuildGeneration) &&
    typeof s.driftDetected === "boolean"
    ? {
        status,
        timezone: s.timezone,
        asOf: s.asOf as string | null,
        lastReconciledAt: s.lastReconciledAt as string | null,
        sourceRecords: s.sourceRecords,
        projectedRecords: s.projectedRecords,
        rebuildGeneration: s.rebuildGeneration,
        driftDetected: s.driftDetected,
      }
    : undefined;
}

function parseRange(value: unknown): AiCostRange | undefined {
  const source = record(value);
  if (
    !source ||
    !iso(source.from) ||
    !iso(source.to) ||
    source.from >= source.to
  )
    return undefined;
  return { from: source.from, to: source.to };
}

function iso(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 64) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString() === value;
}

function calendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function integer(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

function bounded(value: unknown, min: number, max: number): value is string {
  return (
    typeof value === "string" && value.length >= min && value.length <= max
  );
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function invalid(): never {
  throw new Error("Сервер вернул некорректные данные расходов AI");
}

function bigintString(value: unknown): value is string {
  return typeof value === "string" && /^\d+$/.test(value);
}

function money(provider: DecimalString, estimated: DecimalString): AiCostMoney {
  return {
    providerReportedCostUsd: provider,
    estimatedFallbackCostUsd: estimated,
    effectiveCostUsd: addDecimalStrings([provider, estimated]),
    pricedCostRecords: 1,
  };
}

function user(
  endUserId: string,
  externalId: string,
  segment: string | null,
  records: number,
  cost: DecimalString,
): AiCostUserRow {
  return {
    endUserId,
    externalId,
    segment,
    records,
    unpricedRecords: 0,
    providerReportedCostUsd: cost,
    estimatedFallbackCostUsd: "0",
    effectiveCostUsd: cost,
    pricedCostRecords: records,
  };
}

function employee(
  cmsUserId: string,
  email: string,
  records: number,
  cost: DecimalString,
): AiCostCmsUserRow {
  return {
    cmsUserId,
    email,
    records,
    unpricedRecords: 0,
    providerReportedCostUsd: cost,
    estimatedFallbackCostUsd: "0",
    effectiveCostUsd: cost,
    pricedCostRecords: records,
  };
}

function demoPage<T extends AiCostRankedRow>(
  items: readonly T[],
  query: AiCostPageQuery,
): AiCostPage<T> {
  const page = sortAiCostRows(items, query.sort, query.direction).slice(
    query.offset,
    query.offset + query.limit,
  );
  const hasMore = query.offset + query.limit < items.length;
  return {
    range: { from: query.from, to: query.to },
    projection: demoOverview.projection,
    items: page,
    pagination: {
      limit: query.limit,
      offset: query.offset,
      hasMore,
      nextOffset: hasMore ? query.offset + query.limit : null,
      truncated: false,
    },
  };
}
