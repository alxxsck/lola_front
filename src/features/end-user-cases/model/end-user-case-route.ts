import type {
  EndUserCaseFilters,
  EndUserCasePreset,
  EndUserCasePriority,
  EndUserCaseSort,
} from "./end-user-case";
import type { LocationQueryRaw } from "vue-router";

const PRESETS = new Set<EndUserCasePreset>([
  "ACTIVE",
  "ATTENTION",
  "WAITING",
  "RESOLVED",
  "ALL",
]);
const SORTS = new Set<EndUserCaseSort>([
  "ATTENTION_FIRST",
  "LAST_ACTIVITY",
  "OLDEST_OPEN",
  "PRIORITY",
  "RECENTLY_RESOLVED",
]);
const PRIORITIES = new Set<EndUserCasePriority>([
  "LOW",
  "NORMAL",
  "HIGH",
  "URGENT",
  "CRITICAL",
]);
const STATUSES = new Set([
  "OPEN",
  "IN_PROGRESS",
  "WAITING_END_USER",
  "WAITING_SYSTEM",
  "WAITING_ADMIN",
  "RESOLVED",
  "UNRESOLVED",
  "CANCELLED",
] as const);
const IMPACTS = new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const);
const URGENCIES = new Set(["LOW", "MEDIUM", "HIGH", "IMMEDIATE"] as const);
const RESOLUTION_ASSESSMENTS = new Set([
  "NOT_ASSESSED",
  "LIKELY_RESOLVED",
  "CONFIRMED_RESOLVED",
  "LIKELY_UNRESOLVED",
  "CONFIRMED_UNRESOLVED",
  "INCONCLUSIVE",
] as const);
const RESOLUTION_SOURCES = new Set([
  "END_USER_EXPLICIT",
  "CMS_USER",
  "TRUSTED_VERIFICATION",
  "AI_INFERENCE",
] as const);
const CHANNELS = new Set(["TEXT", "VOICE", "CMS"] as const);
const CAPABILITY_OUTCOMES = new Set([
  "RESERVED",
  "ACCEPTED",
  "COMPLETED",
  "REJECTED",
  "FAILED",
] as const);

type Query = Record<string, unknown>;

const values = (value: unknown): unknown[] =>
  Array.isArray(value)
    ? value
    : value === undefined || value === null
      ? []
      : [value];

const one = (value: unknown): string | undefined =>
  typeof value === "string" && value ? value : undefined;
const oneOf = <T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | undefined =>
  typeof value === "string" && allowed.includes(value as T)
    ? (value as T)
    : undefined;
const selected = <T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
): T[] =>
  values(value).filter(
    (candidate): candidate is T =>
      typeof candidate === "string" && allowed.has(candidate as T),
  );
const iso = (value: unknown): string | undefined => {
  const candidate = one(value);
  return candidate && !Number.isNaN(Date.parse(candidate))
    ? candidate
    : undefined;
};

export function endUserCaseFiltersFromRoute(query: Query): EndUserCaseFilters {
  const preset = PRESETS.has(String(query.view) as EndUserCasePreset)
    ? (query.view as EndUserCasePreset)
    : "ACTIVE";
  const sort = SORTS.has(String(query.sort) as EndUserCaseSort)
    ? (query.sort as EndUserCaseSort)
    : "ATTENTION_FIRST";
  const priority = values(query.priority).filter(
    (value): value is EndUserCasePriority =>
      PRIORITIES.has(String(value) as EndUserCasePriority),
  );
  const status = selected(query.status, STATUSES);
  const impact = selected(query.impact, IMPACTS);
  const urgency = selected(query.urgency, URGENCIES);
  const resolutionAssessment = selected(
    query.resolution,
    RESOLUTION_ASSESSMENTS,
  );
  const resolutionSource = selected(query.resolutionSource, RESOLUTION_SOURCES);
  const channel = values(query.channel).filter(
    (value): value is "TEXT" | "VOICE" | "CMS" =>
      CHANNELS.has(String(value) as "TEXT" | "VOICE" | "CMS"),
  );
  const aiCapabilityOutcome = values(query.capabilityOutcome).filter(
    (
      value,
    ): value is "RESERVED" | "ACCEPTED" | "COMPLETED" | "REJECTED" | "FAILED" =>
      CAPABILITY_OUTCOMES.has(
        String(value) as
          "RESERVED" | "ACCEPTED" | "COMPLETED" | "REJECTED" | "FAILED",
      ),
  );
  const assignment = ["ASSIGNED", "UNASSIGNED"].includes(
    String(query.assignment),
  )
    ? (query.assignment as "ASSIGNED" | "UNASSIGNED")
    : undefined;
  const recontacted = ["YES", "NO"].includes(String(query.recontacted))
    ? (query.recontacted as "YES" | "NO")
    : undefined;
  const yesNo = (value: unknown) => oneOf(value, ["YES", "NO"] as const);
  return {
    preset,
    sort,
    ...(status.length ? { status } : {}),
    ...(priority.length ? { priority } : {}),
    ...(impact.length ? { impact } : {}),
    ...(urgency.length ? { urgency } : {}),
    ...(resolutionAssessment.length ? { resolutionAssessment } : {}),
    ...(resolutionSource.length ? { resolutionSource } : {}),
    ...(one(query.group) ? { groupCode: one(query.group) } : {}),
    ...(assignment ? { assignment } : {}),
    ...(one(query.endUser) ? { endUserId: one(query.endUser) } : {}),
    ...(one(query.assignee) ? { assignedCmsUserId: one(query.assignee) } : {}),
    ...(one(query.language) ? { primaryLanguage: one(query.language) } : {}),
    ...(channel.length ? { channel } : {}),
    ...(one(query.capability)
      ? { aiCapabilityCode: one(query.capability) }
      : {}),
    ...(aiCapabilityOutcome.length ? { aiCapabilityOutcome } : {}),
    ...(oneOf(query.adminAttention, ["OPEN", "NONE"] as const)
      ? {
          adminAttention: oneOf(query.adminAttention, [
            "OPEN",
            "NONE",
          ] as const),
        }
      : {}),
    ...(yesNo(query.cmsParticipation)
      ? { cmsParticipation: yesNo(query.cmsParticipation) }
      : {}),
    ...(recontacted ? { recontacted } : {}),
    ...(yesNo(query.reopened) ? { reopened: yesNo(query.reopened) } : {}),
    ...(yesNo(query.stale) ? { stale: yesNo(query.stale) } : {}),
    ...(yesNo(query.degraded) ? { degraded: yesNo(query.degraded) } : {}),
    ...(iso(query.createdFrom) ? { createdFrom: iso(query.createdFrom) } : {}),
    ...(iso(query.createdTo) ? { createdTo: iso(query.createdTo) } : {}),
    ...(iso(query.activityFrom)
      ? { lastActivityFrom: iso(query.activityFrom) }
      : {}),
    ...(iso(query.activityTo) ? { lastActivityTo: iso(query.activityTo) } : {}),
  };
}

export function endUserCaseRouteQuery(
  filters: EndUserCaseFilters,
): LocationQueryRaw {
  return {
    ...(filters.preset !== "ACTIVE" ? { view: filters.preset } : {}),
    ...(filters.sort !== "ATTENTION_FIRST" ? { sort: filters.sort } : {}),
    ...(filters.status?.length ? { status: filters.status } : {}),
    ...(filters.priority?.length ? { priority: filters.priority } : {}),
    ...(filters.impact?.length ? { impact: filters.impact } : {}),
    ...(filters.urgency?.length ? { urgency: filters.urgency } : {}),
    ...(filters.resolutionAssessment?.length
      ? { resolution: filters.resolutionAssessment }
      : {}),
    ...(filters.resolutionSource?.length
      ? { resolutionSource: filters.resolutionSource }
      : {}),
    ...(filters.groupCode ? { group: filters.groupCode } : {}),
    ...(filters.assignment ? { assignment: filters.assignment } : {}),
    ...(filters.endUserId ? { endUser: filters.endUserId } : {}),
    ...(filters.assignedCmsUserId
      ? { assignee: filters.assignedCmsUserId }
      : {}),
    ...(filters.primaryLanguage ? { language: filters.primaryLanguage } : {}),
    ...(filters.channel?.length ? { channel: filters.channel } : {}),
    ...(filters.aiCapabilityCode
      ? { capability: filters.aiCapabilityCode }
      : {}),
    ...(filters.aiCapabilityOutcome?.length
      ? { capabilityOutcome: filters.aiCapabilityOutcome }
      : {}),
    ...(filters.adminAttention
      ? { adminAttention: filters.adminAttention }
      : {}),
    ...(filters.cmsParticipation
      ? { cmsParticipation: filters.cmsParticipation }
      : {}),
    ...(filters.recontacted ? { recontacted: filters.recontacted } : {}),
    ...(filters.reopened ? { reopened: filters.reopened } : {}),
    ...(filters.stale ? { stale: filters.stale } : {}),
    ...(filters.degraded ? { degraded: filters.degraded } : {}),
    ...(filters.createdFrom ? { createdFrom: filters.createdFrom } : {}),
    ...(filters.createdTo ? { createdTo: filters.createdTo } : {}),
    ...(filters.lastActivityFrom
      ? { activityFrom: filters.lastActivityFrom }
      : {}),
    ...(filters.lastActivityTo ? { activityTo: filters.lastActivityTo } : {}),
  };
}
