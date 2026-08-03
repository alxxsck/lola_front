import type { DecimalString } from "@/shared/lib/decimal-money";

export type AccrualLifecycle = "ACTIVE" | "PAUSED" | "ARCHIVED";
export type AccrualSource = "SERVER" | "FRONTEND" | "INTERNAL" | "INTEGRATION";
export interface AiAllowanceAccrualRevision {
  id: string;
  revisionNumber: number;
  name: string;
  lifecycle: AccrualLifecycle;
  eventDefinitionKeyId: string;
  allowedSources: AccrualSource[];
  timezone: string;
  rewardUsd: DecimalString;
  perEndUserDailyCapUsd: DecimalString;
  projectDailyCapUsd: DecimalString;
  grantTtlSeconds: number;
  cooldownSeconds: number;
  effectiveFrom: string;
  effectiveUntil: string | null;
  changeReason: string;
  createdAt: string;
  eventDefinitionKey?: { code: string; name: string; lifecycle: string };
  eventRevisionBindings: Array<{
    eventDefinitionRevisionId: string;
    eventDefinitionRevision?: { version: number };
  }>;
}
export interface AiAllowanceAccrualRule {
  id: string;
  key: string;
  name: string;
  lifecycle: AccrualLifecycle;
  createdAt: string;
  updatedAt: string;
  revisions: AiAllowanceAccrualRevision[];
}
export interface PutAiAllowanceAccrualRuleInput {
  name: string;
  lifecycle: AccrualLifecycle;
  eventDefinitionKeyId: string;
  eventDefinitionRevisionIds: string[];
  allowedSources: AccrualSource[];
  timezone: string;
  rewardUsd: DecimalString;
  perEndUserDailyCapUsd: DecimalString;
  projectDailyCapUsd: DecimalString;
  grantTtlSeconds: number;
  cooldownSeconds: number;
  effectiveFrom: string;
  effectiveUntil?: string;
  reason: string;
}
export interface AiAllowanceAccrualReceipt {
  id: string;
  endUserId: string;
  status: "GRANTED" | "REJECTED";
  rejectionReason: string | null;
  rewardUsd: DecimalString;
  evaluatedAt: string;
  occurredAt: string;
  grantId: string | null;
  ruleRevision: { revisionNumber: number; rule: { key: string; name: string } };
  eventLog: {
    id: string;
    source: AccrualSource;
    occurredAt: string;
    eventDefinitionKey: { code: string; name: string };
  };
}
export interface AiAllowanceAccrualReceiptPage {
  items: AiAllowanceAccrualReceipt[];
  pageInfo: { hasMore: boolean; nextCursor: string | null };
}
