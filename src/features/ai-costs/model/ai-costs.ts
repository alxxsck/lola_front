import { compareDecimalStrings, type DecimalString } from '@/shared/lib/decimal-money';

export type AiCostTab = 'overview' | 'users' | 'employees' | 'limits' | 'journal';
export type AiCostPeriod = 'today' | '7d' | '30d' | 'custom';
export type AiCostSortKey = 'identity' | 'records' | 'unpricedRecords' | 'effectiveCostUsd';
export type AiCostSortDirection = 'asc' | 'desc';

export interface AiCostMoney {
  providerReportedCostUsd: DecimalString | null;
  estimatedFallbackCostUsd: DecimalString | null;
  effectiveCostUsd: DecimalString | null;
  pricedCostRecords: number;
}

export interface AiCostProjection {
  status: 'FRESH' | 'STALE';
  timezone: string;
  asOf: string | null;
  lastReconciledAt: string | null;
  sourceRecords: string;
  projectedRecords: string;
  rebuildGeneration: string;
  driftDetected: boolean;
}

export interface AiCostRange {
  from: string;
  to: string;
}

export interface AiCostOverview {
  range: AiCostRange;
  timezone: string;
  projection: AiCostProjection;
  totals: AiCostMoney;
  completeness: {
    totalRecords: number;
    providerReportedRecords: number;
    estimatedRecords: number;
    unpricedRecords: number;
    pricedPercent: DecimalString;
  };
  categories: Array<
    AiCostMoney & {
      category: string;
      records: number;
    }
  >;
  daily: Array<
    AiCostMoney & {
      day: string;
      records: number;
    }
  >;
}

export interface AiCostRankedRow extends AiCostMoney {
  records: number;
  unpricedRecords: number;
}

export interface AiCostUserRow extends AiCostRankedRow {
  endUserId: string;
  externalId: string;
  segment: string | null;
}

export interface AiCostCmsUserRow extends AiCostRankedRow {
  cmsUserId: string;
  email: string;
}

export interface AiCostPage<T extends AiCostRankedRow> {
  range: AiCostRange;
  projection: AiCostProjection;
  items: T[];
  pagination: {
    limit: number;
    offset: number;
    hasMore: boolean;
    nextOffset: number | null;
    truncated: boolean;
  };
}

export interface AiCostRouteState extends AiCostRange {
  tab: AiCostTab;
  period: AiCostPeriod;
  customFrom: string;
  customTo: string;
  page: number;
  sort: AiCostSortKey;
  direction: AiCostSortDirection;
  allowanceUser: string;
  allowanceCursor: string;
}

type QueryValue = string | readonly string[] | null | undefined;
type RouteQuery = Record<string, QueryValue>;

const tabs = new Set<AiCostTab>(['overview', 'users', 'employees', 'limits', 'journal']);
const periods = new Set<AiCostPeriod>(['today', '7d', '30d', 'custom']);
const sorts = new Set<AiCostSortKey>([
  'identity',
  'records',
  'unpricedRecords',
  'effectiveCostUsd',
]);

export function parseAiCostRouteState(
  query: RouteQuery,
  now = new Date(),
  timezone = 'UTC',
): AiCostRouteState {
  const tab = enumValue(query.tab, tabs) ?? 'overview';
  const requestedPeriod = enumValue(query.period, periods) ?? '7d';
  const customFrom = dateValue(query.from) ?? '';
  const customTo = dateValue(query.to) ?? '';
  const customRange =
    requestedPeriod === 'custom' ? customDateRange(customFrom, customTo, timezone) : undefined;
  const fallbackPeriod: Exclude<AiCostPeriod, 'custom'> =
    requestedPeriod === 'custom' ? '7d' : requestedPeriod;
  const period: AiCostPeriod = customRange ? 'custom' : fallbackPeriod;
  const range = customRange ?? presetRange(fallbackPeriod, now, timezone);
  const rawPage = Number(single(query.page));
  const page = Number.isSafeInteger(rawPage) && rawPage >= 1 && rawPage <= 401 ? rawPage : 1;
  return {
    tab,
    period,
    customFrom: customRange ? customFrom : '',
    customTo: customRange ? customTo : '',
    page,
    sort: enumValue(query.sort, sorts) ?? 'effectiveCostUsd',
    direction: single(query.direction) === 'asc' ? 'asc' : 'desc',
    allowanceUser: boundedQuery(query.allowanceUser, 160) ?? '',
    allowanceCursor: boundedQuery(query.allowanceCursor, 160) ?? '',
    ...range,
  };
}

export function aiCostRouteQuery(state: AiCostRouteState): Record<string, string> {
  return {
    tab: state.tab,
    period: state.period,
    ...(state.period === 'custom' ? { from: state.customFrom, to: state.customTo } : {}),
    ...(state.page > 1 ? { page: String(state.page) } : {}),
    ...(state.sort !== 'effectiveCostUsd' ? { sort: state.sort } : {}),
    ...(state.direction !== 'desc' ? { direction: state.direction } : {}),
    ...(state.allowanceUser ? { allowanceUser: state.allowanceUser } : {}),
    ...(state.allowanceCursor ? { allowanceCursor: state.allowanceCursor } : {}),
  };
}

export function sortAiCostRows<T extends AiCostRankedRow>(
  rows: readonly T[],
  key: AiCostSortKey,
  direction: AiCostSortDirection,
): T[] {
  const multiplier = direction === 'asc' ? 1 : -1;
  return [...rows].sort((left, right) => {
    if (key === 'effectiveCostUsd')
      if (left.effectiveCostUsd === null || right.effectiveCostUsd === null) {
        if (left.effectiveCostUsd === right.effectiveCostUsd) return 0;
        return left.effectiveCostUsd === null ? 1 : -1;
      } else
        return compareDecimalStrings(left.effectiveCostUsd, right.effectiveCostUsd) * multiplier;
    if (key === 'identity') return identity(left).localeCompare(identity(right), 'ru') * multiplier;
    return (left[key] - right[key]) * multiplier;
  });
}

function identity(row: AiCostRankedRow): string {
  if ('externalId' in row && typeof row.externalId === 'string') return row.externalId;
  if ('email' in row && typeof row.email === 'string') return row.email;
  return '';
}

function presetRange(
  period: Exclude<AiCostPeriod, 'custom'>,
  now: Date,
  timezone: string,
): AiCostRange {
  const days = period === 'today' ? 1 : period === '30d' ? 30 : 7;
  const today = calendarDateInTimezone(now, timezone);
  const toDate = shiftCalendarDate(today, 1);
  const fromDate = shiftCalendarDate(toDate, -days);
  return {
    from: zonedMidnightIso(fromDate, timezone),
    to: zonedMidnightIso(toDate, timezone),
  };
}

function customDateRange(from: string, to: string, timezone: string): AiCostRange | undefined {
  if (!isDate(from) || !isDate(to) || from > to) return undefined;
  const inclusiveDays =
    (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000 + 1;
  if (inclusiveDays > 366) return undefined;
  return {
    from: zonedMidnightIso(from, timezone),
    to: zonedMidnightIso(shiftCalendarDate(to, 1), timezone),
  };
}

export function projectTimezone(settings: unknown): string {
  const root =
    settings && typeof settings === 'object' && !Array.isArray(settings)
      ? (settings as Record<string, unknown>)
      : {};
  const engine =
    root.scenarioEngine &&
    typeof root.scenarioEngine === 'object' &&
    !Array.isArray(root.scenarioEngine)
      ? (root.scenarioEngine as Record<string, unknown>)
      : {};
  const activity =
    engine.activity && typeof engine.activity === 'object' && !Array.isArray(engine.activity)
      ? (engine.activity as Record<string, unknown>)
      : {};
  const candidate = typeof activity.timezone === 'string' ? activity.timezone : 'UTC';
  try {
    new Intl.DateTimeFormat('en', { timeZone: candidate }).format();
    return candidate;
  } catch {
    return 'UTC';
  }
}

export function zonedMidnightIso(date: string, timezone: string): string {
  const [year, month, day] = date.split('-').map(Number);
  let instant = Date.UTC(year!, month! - 1, day!);
  for (let i = 0; i < 3; i += 1) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(instant));
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value ?? 0);
    const represented = Date.UTC(
      value('year'),
      value('month') - 1,
      value('day'),
      value('hour') % 24,
      value('minute'),
      value('second'),
    );
    instant += Date.UTC(year!, month! - 1, day!) - represented;
  }
  return new Date(instant).toISOString();
}

function calendarDateInTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: 'year' | 'month' | 'day') =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function shiftCalendarDate(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateValue(value: QueryValue): string | undefined {
  const candidate = single(value);
  return candidate && isDate(candidate) ? candidate : undefined;
}

function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function enumValue<T extends string>(value: QueryValue, allowed: ReadonlySet<T>): T | undefined {
  const candidate = single(value);
  return candidate && allowed.has(candidate as T) ? (candidate as T) : undefined;
}

function single(value: QueryValue): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function boundedQuery(value: QueryValue, max: number): string | undefined {
  const candidate = single(value);
  return candidate && candidate.length <= max ? candidate : undefined;
}
