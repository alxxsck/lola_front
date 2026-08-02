import { axiosInstance } from "@/shared/api/http/axios-instance";
import type {
  AiAllowanceAccount,
  AiAllowanceAssignment,
  AiAllowanceGrant,
  AiAllowanceJournalEntry,
  AiAllowanceJournalPage,
  AiAllowancePeriod,
  AiAllowancePlan,
  AiAllowancePlanRevision,
  AiAllowancePlanRevisionPage,
  AiAllowancePlanRevisionSummary,
  AiAllowancePlanSummary,
  AiAllowancePolicy,
  AiAllowanceProjectPolicyView,
  AiAllowanceUserBalance,
  ManualAllowanceGrantInput,
  PutDefaultAllowancePlanInput,
  PutAllowancePlanInput,
  PutCohortAllowanceAssignmentInput,
  PutEndUserAllowanceAssignmentInput,
  ReconcileAiSpendReservationInput,
} from "../model/ai-allowance";
import { parseAllowanceUsd, parseSignedDecimal } from "../model/ai-allowance";

export interface AiAllowanceRepository {
  projectPolicy(
    projectId: string,
    query?: { planLimit?: number; planCursor?: string; revisionLimit?: number },
  ): Promise<AiAllowanceProjectPolicyView>;
  planRevisions(
    projectId: string,
    planKey: string,
    query: { limit: number; cursor?: string },
  ): Promise<AiAllowancePlanRevisionPage>;
  endUserBalance(
    projectId: string,
    endUserId: string,
    query?: { grantLimit?: number; grantCursor?: string },
  ): Promise<AiAllowanceUserBalance>;
  journal(
    projectId: string,
    endUserId: string,
    query: { limit: number; cursor?: string },
  ): Promise<AiAllowanceJournalPage>;
  putDefaultPlan(
    projectId: string,
    input: PutDefaultAllowancePlanInput,
    idempotencyKey: string,
  ): Promise<unknown>;
  putPlan(
    projectId: string,
    planKey: string,
    input: PutAllowancePlanInput,
    idempotencyKey: string,
  ): Promise<unknown>;
  putCohortAssignment(
    projectId: string,
    scope: "SEGMENT" | "LEVEL",
    cohortId: string,
    input: PutCohortAllowanceAssignmentInput,
    idempotencyKey: string,
  ): Promise<unknown>;
  createGrant(
    projectId: string,
    endUserId: string,
    input: ManualAllowanceGrantInput,
    idempotencyKey: string,
  ): Promise<unknown>;
  putEndUserAssignment(
    projectId: string,
    endUserId: string,
    input: PutEndUserAllowanceAssignmentInput,
    idempotencyKey: string,
  ): Promise<unknown>;
  reconcile(
    projectId: string,
    input: ReconcileAiSpendReservationInput,
    idempotencyKey: string,
  ): Promise<unknown>;
}

const root = (projectId: string) =>
  `/api/v1/admin/projects/${encodeURIComponent(projectId)}`;
const userRoot = (projectId: string, endUserId: string) =>
  `${root(projectId)}/end-users/${encodeURIComponent(endUserId)}/ai-allowance`;
const headers = (idempotencyKey: string) => ({
  headers: { "Idempotency-Key": idempotencyKey },
});

export const aiAllowanceRepository: AiAllowanceRepository = {
  async projectPolicy(projectId, query) {
    const url = `${root(projectId)}/ai-allowance`;
    const response = query
      ? await axiosInstance.get<unknown>(url, { params: query })
      : await axiosInstance.get<unknown>(url);
    return policyView(response.data);
  },
  async planRevisions(projectId, planKey, query) {
    const response = await axiosInstance.get<unknown>(
      `${root(projectId)}/ai-allowance/plans/${encodeURIComponent(planKey)}/revisions`,
      { params: query },
    );
    return planRevisionPage(response.data);
  },
  async endUserBalance(projectId, endUserId, query) {
    const url = userRoot(projectId, endUserId);
    const response = query
      ? await axiosInstance.get<unknown>(url, { params: query })
      : await axiosInstance.get<unknown>(url);
    return balanceView(response.data);
  },
  async journal(projectId, endUserId, query) {
    const response = await axiosInstance.get<unknown>(
      `${userRoot(projectId, endUserId)}/journal`,
      { params: query },
    );
    return journalPage(response.data);
  },
  async putDefaultPlan(projectId, input, idempotencyKey) {
    return (
      await axiosInstance.put(
        `${root(projectId)}/ai-allowance/default-plan`,
        input,
        headers(idempotencyKey),
      )
    ).data;
  },
  async putPlan(projectId, planKey, input, idempotencyKey) {
    return (
      await axiosInstance.put(
        `${root(projectId)}/ai-allowance/plans/${encodeURIComponent(planKey)}`,
        input,
        headers(idempotencyKey),
      )
    ).data;
  },
  async putCohortAssignment(projectId, scope, cohortId, input, idempotencyKey) {
    return (
      await axiosInstance.put(
        `${root(projectId)}/ai-allowance/assignments/${scope}/${encodeURIComponent(cohortId)}`,
        input,
        headers(idempotencyKey),
      )
    ).data;
  },
  async createGrant(projectId, endUserId, input, idempotencyKey) {
    return (
      await axiosInstance.post(
        `${userRoot(projectId, endUserId)}/grants`,
        input,
        headers(idempotencyKey),
      )
    ).data;
  },
  async putEndUserAssignment(projectId, endUserId, input, idempotencyKey) {
    return (
      await axiosInstance.put(
        `${userRoot(projectId, endUserId)}/assignment`,
        input,
        headers(idempotencyKey),
      )
    ).data;
  },
  async reconcile(projectId, input, idempotencyKey) {
    return (
      await axiosInstance.post(
        `${root(projectId)}/ai-allowance/reconcile`,
        input,
        headers(idempotencyKey),
      )
    ).data;
  },
};

function policyView(value: unknown): AiAllowanceProjectPolicyView {
  const source = object(value);
  const policy = source?.policy === null ? null : parsePolicy(source?.policy);
  const assignment =
    source?.defaultAssignment === null
      ? null
      : parseAssignment(source?.defaultAssignment);
  const gates = object(source?.runtimeGates);
  const plansPageInfo = parsePageInfo(source?.plansPageInfo);
  if (
    !source ||
    (!policy && source.policy !== null) ||
    (!assignment && source.defaultAssignment !== null) ||
    !Array.isArray(source.plans) ||
    source.plans.length > 100 ||
    !gates ||
    !plansPageInfo ||
    typeof gates.hardEnforcementApproved !== "boolean" ||
    typeof gates.emergencyDisabled !== "boolean"
  )
    invalid();
  const plans = source.plans.map(parsePlan);
  if (plans.some((item) => !item)) invalid();
  return {
    policy,
    plans: plans as AiAllowancePlan[],
    plansPageInfo,
    defaultAssignment: assignment,
    runtimeGates: {
      hardEnforcementApproved: gates.hardEnforcementApproved,
      emergencyDisabled: gates.emergencyDisabled,
    },
  };
}

function balanceView(value: unknown): AiAllowanceUserBalance {
  const source = object(value);
  const account = parseAccount(source?.account);
  const period =
    source?.currentPeriod === null ? null : parsePeriod(source?.currentPeriod);
  const assignment =
    source?.endUserAssignment === null
      ? null
      : parseAssignment(source?.endUserAssignment);
  const pendingBaseAllocationUsd = parseAllowanceUsd(
    source?.pendingBaseAllocationUsd,
  );
  const currentPeriodSpend =
    source?.currentPeriodSpend === null
      ? null
      : parseCurrentPeriodSpend(source?.currentPeriodSpend);
  const grantsPageInfo = parsePageInfo(source?.grantsPageInfo);
  if (
    !source ||
    !account ||
    (!period && source.currentPeriod !== null) ||
    (!assignment && source.endUserAssignment !== null) ||
    !pendingBaseAllocationUsd ||
    (!currentPeriodSpend && source.currentPeriodSpend !== null) ||
    !Array.isArray(source.activeGrants) ||
    source.activeGrants.length > 500 ||
    !grantsPageInfo
  )
    invalid();
  const grants = source.activeGrants.map(parseGrant);
  if (grants.some((item) => !item)) invalid();
  return {
    account,
    currentPeriod: period,
    currentPeriodSpend,
    pendingBaseAllocationUsd,
    activeGrants: grants as AiAllowanceGrant[],
    grantsPageInfo,
    endUserAssignment: assignment,
  };
}

function planRevisionPage(value: unknown): AiAllowancePlanRevisionPage {
  const source = object(value);
  const plan = parsePlanSummary(source?.plan);
  const pageInfo = parsePageInfo(source?.pageInfo);
  if (
    !source ||
    !plan ||
    !pageInfo ||
    !Array.isArray(source.revisions) ||
    source.revisions.length > 100
  )
    invalid();
  const revisions = source.revisions.map((revision) =>
    parseRevision(revision, true),
  );
  if (revisions.some((revision) => !revision)) invalid();
  return { plan, revisions: revisions as AiAllowancePlanRevision[], pageInfo };
}

function parseCurrentPeriodSpend(
  value: unknown,
): AiAllowanceUserBalance["currentPeriodSpend"] {
  const s = object(value);
  const values =
    s &&
    ["reservedUsd", "settledUsd", "unknownHeldUsd", "overageUsd"].map((key) =>
      parseAllowanceUsd(s[key]),
    );
  return s && values && values.every(Boolean)
    ? {
        reservedUsd: values[0]!,
        settledUsd: values[1]!,
        unknownHeldUsd: values[2]!,
        overageUsd: values[3]!,
      }
    : null;
}

function journalPage(value: unknown): AiAllowanceJournalPage {
  const source = object(value);
  const pageInfo = object(source?.pageInfo);
  if (
    !source ||
    !Array.isArray(source.items) ||
    source.items.length > 100 ||
    !pageInfo ||
    typeof pageInfo.hasMore !== "boolean" ||
    !(pageInfo.nextCursor === null || text(pageInfo.nextCursor, 1, 160))
  )
    invalid();
  const items = source.items.map(parseJournalEntry);
  if (
    items.some((item) => !item) ||
    pageInfo.hasMore !== (pageInfo.nextCursor !== null)
  )
    invalid();
  return {
    items: items as AiAllowanceJournalEntry[],
    pageInfo: {
      hasMore: pageInfo.hasMore,
      nextCursor: pageInfo.nextCursor as string | null,
    },
  };
}

function parsePolicy(value: unknown): AiAllowancePolicy | null {
  const s = object(value);
  const mode = enumValue(s?.enforcementMode, [
    "DISABLED",
    "SHADOW",
    "SOFT",
    "HARD",
  ] as const);
  const warningContent = localizedContent(s?.warningContent);
  const exhaustedContent = localizedContent(s?.exhaustedContent);
  return s &&
    text(s.projectId) &&
    mode &&
    text(s.timezone, 1, 100) &&
    warningContent &&
    exhaustedContent &&
    bigintString(s.version) &&
    iso(s.createdAt) &&
    iso(s.updatedAt)
    ? {
        projectId: s.projectId,
        enforcementMode: mode,
        timezone: s.timezone,
        warningContent,
        exhaustedContent,
        version: s.version,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      }
    : null;
}

function parsePlan(value: unknown): AiAllowancePlan | null {
  const s = object(value);
  const status = enumValue(s?.status, ["ACTIVE", "ARCHIVED"] as const);
  const revisionsPageInfo = parsePageInfo(s?.revisionsPageInfo);
  if (
    !s ||
    !text(s.id) ||
    !text(s.key, 1, 100) ||
    !text(s.name, 1, 160) ||
    !status ||
    !iso(s.createdAt) ||
    !iso(s.updatedAt) ||
    !revisionsPageInfo ||
    !Array.isArray(s.revisions) ||
    s.revisions.length > 100
  )
    return null;
  const revisions = s.revisions.map((revision) =>
    parseRevision(revision, true),
  );
  if (revisions.some((item) => !item)) return null;
  return {
    id: s.id,
    key: s.key,
    name: s.name,
    status,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    revisions: revisions as AiAllowancePlanRevision[],
    revisionsPageInfo,
  };
}

function parseRevision(
  value: unknown,
  requireRules: true,
): AiAllowancePlanRevision | null;
function parseRevision(
  value: unknown,
  requireRules?: false,
): AiAllowancePlanRevisionSummary | null;
function parseRevision(
  value: unknown,
  requireRules = false,
): AiAllowancePlanRevision | AiAllowancePlanRevisionSummary | null {
  const s = object(value);
  const period = enumValue(s?.periodKind, ["DAY", "MONTH"] as const);
  const amount = parseAllowanceUsd(s?.recurringAmountUsd);
  const cap =
    s?.dailyCapUsd === null ? null : parseAllowanceUsd(s?.dailyCapUsd);
  if (
    !s ||
    !text(s.id) ||
    !text(s.planId) ||
    !integer(s.revisionNumber) ||
    !period ||
    !amount ||
    cap === undefined ||
    !iso(s.effectiveFrom) ||
    !text(s.changeReason, 1, 500) ||
    !iso(s.createdAt)
  )
    return null;
  const base: AiAllowancePlanRevisionSummary = {
    id: s.id,
    planId: s.planId,
    revisionNumber: s.revisionNumber as number,
    periodKind: period,
    recurringAmountUsd: amount,
    dailyCapUsd: cap,
    effectiveFrom: s.effectiveFrom,
    changeReason: s.changeReason,
    createdAt: s.createdAt,
  };
  if (!requireRules) return base;
  if (!Array.isArray(s.categoryRules) || s.categoryRules.length > 100)
    return null;
  const categories = [
    "CHAT",
    "VOICE",
    "SPEECH",
    "MEMORY",
    "AI_REVIEW",
    "AI_ANALYSIS",
    "CMS_AGENT",
    "CASE_INTELLIGENCE",
    "PROJECT_OVERHEAD",
  ] as const;
  const rules = s.categoryRules.map((value) => {
    const r = object(value);
    const category = enumValue(r?.category, categories);
    const responsibility = enumValue(r?.responsibility, [
      "END_USER_ALLOWANCE",
      "PROJECT_SPONSORED",
    ] as const);
    const ruleCap = r?.capUsd === null ? null : parseAllowanceUsd(r?.capUsd);
    return r && category && responsibility && ruleCap !== undefined
      ? { category, responsibility, capUsd: ruleCap }
      : null;
  });
  if (rules.some((item) => !item)) return null;
  return {
    ...base,
    categoryRules: rules as AiAllowancePlanRevision["categoryRules"],
  };
}

function parseAssignment(value: unknown): AiAllowanceAssignment | null {
  const s = object(value);
  const scope = enumValue(s?.scope, [
    "PROJECT_DEFAULT",
    "SEGMENT",
    "LEVEL",
    "END_USER",
  ] as const);
  const plan = s?.plan === undefined ? undefined : parsePlanSummary(s.plan);
  return s &&
    text(s.id) &&
    scope &&
    (s.endUserId === null || text(s.endUserId)) &&
    text(s.planId) &&
    iso(s.effectiveFrom) &&
    (s.effectiveUntil === null || iso(s.effectiveUntil)) &&
    bigintString(s.version) &&
    text(s.reason, 1, 500) &&
    plan !== null
    ? {
        id: s.id,
        scope,
        endUserId: s.endUserId as string | null,
        planId: s.planId,
        effectiveFrom: s.effectiveFrom,
        effectiveUntil: s.effectiveUntil as string | null,
        version: s.version,
        reason: s.reason,
        ...(plan ? { plan } : {}),
      }
    : null;
}

function parsePlanSummary(value: unknown): AiAllowancePlanSummary | null {
  const s = object(value);
  const status = enumValue(s?.status, ["ACTIVE", "ARCHIVED"] as const);
  return s &&
    text(s.id) &&
    text(s.key, 1, 100) &&
    text(s.name, 1, 160) &&
    status &&
    iso(s.createdAt) &&
    iso(s.updatedAt)
    ? {
        id: s.id,
        key: s.key,
        name: s.name,
        status,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      }
    : null;
}

function parseAccount(value: unknown): AiAllowanceAccount | null {
  const s = object(value);
  const money =
    s &&
    [
      "availableUsd",
      "reservedUsd",
      "settledUsd",
      "unknownHeldUsd",
      "overageUsd",
    ].map((key) => parseAllowanceUsd(s[key]));
  const hasLedger = s?.ledgerAvailableUsd !== undefined;
  const ledger = hasLedger
    ? parseAllowanceUsd(s?.ledgerAvailableUsd)
    : undefined;
  return s &&
    text(s.projectId) &&
    text(s.endUserId) &&
    s.currency === "USD" &&
    money &&
    money.every(Boolean) &&
    (!hasLedger || ledger !== undefined) &&
    bigintString(s.version)
    ? {
        projectId: s.projectId,
        endUserId: s.endUserId,
        currency: "USD",
        availableUsd: money[0]!,
        ...(ledger ? { ledgerAvailableUsd: ledger } : {}),
        reservedUsd: money[1]!,
        settledUsd: money[2]!,
        unknownHeldUsd: money[3]!,
        overageUsd: money[4]!,
        version: s.version,
      }
    : null;
}

function parsePeriod(value: unknown): AiAllowancePeriod | null {
  const s = object(value);
  const kind = enumValue(s?.kind, ["DAY", "MONTH"] as const);
  const status = enumValue(s?.status, ["OPEN", "CLOSED"] as const);
  const amount = parseAllowanceUsd(s?.baseAllocatedUsd);
  const revision = parseRevision(s?.planRevision, false);
  return s &&
    text(s.id) &&
    kind &&
    text(s.timezone, 1, 100) &&
    iso(s.startsAt) &&
    iso(s.endsAt) &&
    amount &&
    status &&
    revision
    ? {
        id: s.id,
        kind,
        timezone: s.timezone,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        baseAllocatedUsd: amount,
        status,
        planRevision: revision,
      }
    : null;
}

function parseGrant(value: unknown): AiAllowanceGrant | null {
  const s = object(value);
  const amount = parseAllowanceUsd(s?.amountUsd);
  const status = enumValue(s?.status, ["ACTIVE", "REVERSED"] as const);
  return s &&
    text(s.id) &&
    amount &&
    text(s.sourceType) &&
    text(s.sourceId) &&
    iso(s.validFrom) &&
    iso(s.expiresAt) &&
    status &&
    text(s.reason, 1, 500) &&
    text(s.actorType) &&
    text(s.actorId) &&
    iso(s.createdAt)
    ? {
        id: s.id,
        amountUsd: amount,
        sourceType: s.sourceType,
        sourceId: s.sourceId,
        validFrom: s.validFrom,
        expiresAt: s.expiresAt,
        status,
        reason: s.reason,
        actorType: s.actorType,
        actorId: s.actorId,
        createdAt: s.createdAt,
      }
    : null;
}

function parseJournalEntry(value: unknown): AiAllowanceJournalEntry | null {
  const s = object(value);
  const entryType = enumValue(s?.entryType, [
    "PLAN_ALLOCATED",
    "GRANT_ALLOCATED",
    "RESERVED",
    "RELEASED",
    "SETTLED",
    "UNKNOWN_HELD",
    "EXPIRED",
    "CORRECTION",
  ] as const);
  const quality =
    s?.costQuality === null
      ? null
      : enumValue(s?.costQuality, [
          "EXACT_PROVIDER_COST",
          "EXACT_PROVIDER_UNITS",
          "MEASURED_ESTIMATE",
          "RESERVED_ESTIMATE",
          "UNKNOWN",
        ] as const);
  const deltas =
    s &&
    [
      "deltaAvailableUsd",
      "deltaReservedUsd",
      "deltaSettledUsd",
      "deltaUnknownUsd",
      "deltaOverageUsd",
    ].map((key) => parseSignedDecimal(s[key]));
  const nullableIds = [
    "periodId",
    "reservationId",
    "grantId",
    "usageRecordId",
    "correctsEntryId",
  ] as const;
  return s &&
    text(s.id) &&
    entryType &&
    quality !== undefined &&
    deltas &&
    deltas.every(Boolean) &&
    nullableIds.every((key) => s[key] === null || text(s[key])) &&
    text(s.actorType) &&
    text(s.actorId) &&
    text(s.reason, 1, 500) &&
    iso(s.occurredAt) &&
    iso(s.createdAt)
    ? {
        id: s.id,
        entryType,
        costQuality: quality,
        deltaAvailableUsd: deltas[0]!,
        deltaReservedUsd: deltas[1]!,
        deltaSettledUsd: deltas[2]!,
        deltaUnknownUsd: deltas[3]!,
        deltaOverageUsd: deltas[4]!,
        periodId: s.periodId as string | null,
        reservationId: s.reservationId as string | null,
        grantId: s.grantId as string | null,
        usageRecordId: s.usageRecordId as string | null,
        correctsEntryId: s.correctsEntryId as string | null,
        actorType: s.actorType,
        actorId: s.actorId,
        reason: s.reason,
        occurredAt: s.occurredAt,
        createdAt: s.createdAt,
      }
    : null;
}

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function parsePageInfo(
  value: unknown,
): { hasMore: boolean; nextCursor: string | null } | undefined {
  const source = object(value);
  return source &&
    typeof source.hasMore === "boolean" &&
    (source.nextCursor === null || text(source.nextCursor, 1, 160)) &&
    source.hasMore === (source.nextCursor !== null)
    ? {
        hasMore: source.hasMore,
        nextCursor: source.nextCursor as string | null,
      }
    : undefined;
}
function localizedContent(
  value: unknown,
): AiAllowancePolicy["warningContent"] | undefined {
  const s = object(value);
  if (!s) return undefined;
  const keys = ["message", "ru", "en"] as const;
  if (
    Object.keys(s).some(
      (key) => !keys.includes(key as (typeof keys)[number]),
    ) ||
    keys.some((key) => s[key] !== undefined && !text(s[key], 1, 2000))
  )
    return undefined;
  return s as AiAllowancePolicy["warningContent"];
}
function text(value: unknown, min = 1, max = 500): value is string {
  return (
    typeof value === "string" && value.length >= min && value.length <= max
  );
}
function iso(value: unknown): value is string {
  return text(value) && Number.isFinite(Date.parse(value));
}
function bigintString(value: unknown): value is string {
  return typeof value === "string" && /^\d+$/.test(value);
}
function integer(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1;
}
function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | undefined {
  return typeof value === "string" && allowed.includes(value as T)
    ? (value as T)
    : undefined;
}
function invalid(): never {
  throw new Error("Сервер вернул некорректные данные лимитов AI");
}
