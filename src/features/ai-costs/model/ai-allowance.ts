import type { DecimalString } from "@/shared/lib/decimal-money";

export type AiAllowanceEnforcementMode =
  "DISABLED" | "SHADOW" | "SOFT" | "HARD";
export type AiAllowancePeriodKind = "DAY" | "MONTH";
export const AI_ALLOWANCE_CATEGORIES = [
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
export type AiAllowanceCategory = (typeof AI_ALLOWANCE_CATEGORIES)[number];
export interface AiAllowanceLocalizedContent {
  message?: string;
  ru?: string;
  en?: string;
}
export type SignedDecimalString = string & {
  readonly __signedDecimal: unique symbol;
};

export interface AiAllowancePolicy {
  projectId: string;
  enforcementMode: AiAllowanceEnforcementMode;
  timezone: string;
  warningContent: AiAllowanceLocalizedContent;
  exhaustedContent: AiAllowanceLocalizedContent;
  showEndUserExactUsd: boolean;
  version: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiAllowancePlanRevisionSummary {
  id: string;
  planId: string;
  revisionNumber: number;
  periodKind: AiAllowancePeriodKind;
  recurringAmountUsd: DecimalString;
  dailyCapUsd: DecimalString | null;
  effectiveFrom: string;
  changeReason: string;
  createdAt: string;
}

export interface AiAllowancePlanRevision extends AiAllowancePlanRevisionSummary {
  categoryRules: Array<{
    category: AiAllowanceCategory;
    responsibility: "END_USER_ALLOWANCE" | "PROJECT_SPONSORED";
    capUsd: DecimalString | null;
  }>;
}

export interface AiAllowancePlan {
  id: string;
  key: string;
  name: string;
  status: "ACTIVE" | "ARCHIVED";
  createdAt: string;
  updatedAt: string;
  revisions: AiAllowancePlanRevision[];
  revisionsPageInfo: AiAllowanceCursorPageInfo;
}

export type AiAllowancePlanSummary = Pick<
  AiAllowancePlan,
  "id" | "key" | "name" | "status" | "createdAt" | "updatedAt"
>;

export interface AiAllowanceAssignment {
  id: string;
  scope: "PROJECT_DEFAULT" | "SEGMENT" | "LEVEL" | "END_USER";
  endUserId: string | null;
  planId: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  version: string;
  reason: string;
  plan?: AiAllowancePlanSummary;
}

export interface AiAllowanceProjectPolicyView {
  policy: AiAllowancePolicy | null;
  plans: AiAllowancePlan[];
  plansPageInfo: AiAllowanceCursorPageInfo;
  defaultAssignment: AiAllowanceAssignment | null;
  runtimeGates: {
    hardEnforcementApproved: boolean;
    emergencyDisabled: boolean;
  };
}

export interface AiAllowanceAccount {
  projectId: string;
  endUserId: string;
  currency: "USD";
  availableUsd: DecimalString;
  ledgerAvailableUsd?: DecimalString;
  reservedUsd: DecimalString;
  settledUsd: DecimalString;
  unknownHeldUsd: DecimalString;
  overageUsd: DecimalString;
  version: string;
}

export interface AiAllowancePeriod {
  id: string;
  kind: AiAllowancePeriodKind;
  timezone: string;
  startsAt: string;
  endsAt: string;
  baseAllocatedUsd: DecimalString;
  status: "OPEN" | "CLOSED";
  planRevision: AiAllowancePlanRevisionSummary;
}

export interface AiAllowanceGrant {
  id: string;
  amountUsd: DecimalString;
  sourceType: string;
  sourceId: string;
  validFrom: string;
  expiresAt: string;
  status: "ACTIVE" | "REVERSED";
  reason: string;
  actorType: string;
  actorId: string;
  createdAt: string;
}

export interface AiAllowanceUserBalance {
  account: AiAllowanceAccount;
  currentPeriod: AiAllowancePeriod | null;
  currentPeriodSpend: {
    reservedUsd: DecimalString;
    settledUsd: DecimalString;
    unknownHeldUsd: DecimalString;
    overageUsd: DecimalString;
  } | null;
  pendingBaseAllocationUsd: DecimalString;
  activeGrants: AiAllowanceGrant[];
  grantsPageInfo: AiAllowanceCursorPageInfo;
  endUserAssignment: AiAllowanceAssignment | null;
}
export interface AiAllowanceCursorPageInfo {
  hasMore: boolean;
  nextCursor: string | null;
}
export interface AiAllowancePlanRevisionPage {
  plan: AiAllowancePlanSummary;
  revisions: AiAllowancePlanRevision[];
  pageInfo: AiAllowanceCursorPageInfo;
}

export interface AiAllowanceJournalEntry {
  id: string;
  entryType:
    | "PLAN_ALLOCATED"
    | "GRANT_ALLOCATED"
    | "RESERVED"
    | "RELEASED"
    | "SETTLED"
    | "UNKNOWN_HELD"
    | "EXPIRED"
    | "CORRECTION";
  costQuality:
    | "EXACT_PROVIDER_COST"
    | "EXACT_PROVIDER_UNITS"
    | "MEASURED_ESTIMATE"
    | "RESERVED_ESTIMATE"
    | "UNKNOWN"
    | null;
  deltaAvailableUsd: SignedDecimalString;
  deltaReservedUsd: SignedDecimalString;
  deltaSettledUsd: SignedDecimalString;
  deltaUnknownUsd: SignedDecimalString;
  deltaOverageUsd: SignedDecimalString;
  periodId: string | null;
  reservationId: string | null;
  grantId: string | null;
  usageRecordId: string | null;
  correctsEntryId: string | null;
  actorType: string;
  actorId: string;
  reason: string;
  occurredAt: string;
  createdAt: string;
}

export interface AiAllowanceJournalPage {
  items: AiAllowanceJournalEntry[];
  pageInfo: { hasMore: boolean; nextCursor: string | null };
}

export interface PutDefaultAllowancePlanInput {
  amountUsd: DecimalString;
  period: AiAllowancePeriodKind;
  timezone: string;
  enforcementMode: AiAllowanceEnforcementMode;
  reason: string;
  warningContent?: AiAllowanceLocalizedContent;
  exhaustedContent?: AiAllowanceLocalizedContent;
  showEndUserExactUsd: boolean;
}

export interface PutAllowancePlanInput {
  name: string;
  amountUsd: DecimalString;
  period: AiAllowancePeriodKind;
  dailyCapUsd?: DecimalString;
  categoryRules?: Array<{
    category: AiAllowanceCategory;
    responsibility: "END_USER_ALLOWANCE" | "PROJECT_SPONSORED";
    capUsd?: DecimalString;
  }>;
  reason: string;
}

export interface PutCohortAllowanceAssignmentInput {
  planId: string;
  priority: number;
  effectiveFrom: string;
  effectiveUntil?: string;
  reason: string;
}

export interface ManualAllowanceGrantInput {
  amountUsd: DecimalString;
  validFrom: string;
  expiresAt: string;
  reason: string;
}

export interface PutEndUserAllowanceAssignmentInput {
  planId: string;
  effectiveFrom: string;
  effectiveUntil?: string;
  reason: string;
}

export type AiAllowanceReconciliationResolution =
  "SETTLE_FROM_USAGE" | "HOLD_UNKNOWN" | "RELEASE_PROVEN_NON_BILLABLE";

export interface ReconcileAiSpendReservationInput {
  reservationId: string;
  resolution: AiAllowanceReconciliationResolution;
  reason: string;
}

export interface ResolveAiSpendAttemptInput {
  resolution: AiAllowanceReconciliationResolution;
  reason: string;
}

export interface CorrectAiAllowanceInput {
  correctsEntryId: string;
  deltaAvailableUsd: SignedDecimalString;
  expectedAccountVersion: string;
  expiresAt?: string;
  reason: string;
}

export interface AiAllowanceReconciliationItem {
  id: string;
  endUserId: string;
  aiOperationId: string;
  modelAttemptId: string;
  usageGroupId: string;
  category: AiAllowanceCategory;
  status: "RESERVED" | "UNKNOWN_HELD";
  quotedUpperBoundUsd: DecimalString;
  reservedUsd: DecimalString;
  settledUsd: DecimalString;
  unknownHeldUsd: DecimalString;
  overageUsd: DecimalString;
  costQuality:
    | "EXACT_PROVIDER_COST"
    | "EXACT_PROVIDER_UNITS"
    | "MEASURED_ESTIMATE"
    | "RESERVED_ESTIMATE"
    | "UNKNOWN";
  usageRecordId: string | null;
  outcomeReason: string | null;
  reservedAt: string;
  terminalAt: string | null;
}

export interface AiAllowanceReconciliationPage {
  items: AiAllowanceReconciliationItem[];
  pageInfo: AiAllowanceCursorPageInfo;
}

export function parseSignedDecimal(
  value: unknown,
): SignedDecimalString | undefined {
  return typeof value === "string" &&
    /^-?(?:0|[1-9]\d{0,11})(?:\.\d{1,12})?$/.test(value)
    ? (value as SignedDecimalString)
    : undefined;
}

export function parseAllowanceUsd(value: unknown): DecimalString | undefined {
  return typeof value === "string" &&
    /^(?:0|[1-9]\d{0,11})(?:\.\d{1,12})?$/.test(value)
    ? (value as DecimalString)
    : undefined;
}
