import { axiosInstance } from "@/shared/api/http/axios-instance";
import { parseAllowanceUsd } from "../model/ai-allowance";
import type {
  AiAllowanceAccrualRule,
  AiAllowanceAccrualReceiptPage,
  PutAiAllowanceAccrualRuleInput,
} from "../model/ai-allowance-accrual";
import { isAccrualSource } from "../model/ai-allowance-accrual";

export const aiAllowanceAccrualRepository = {
  async listRules(
    projectId: string,
    query: { limit?: number; cursor?: string } = { limit: 50 },
  ): Promise<{
    items: AiAllowanceAccrualRule[];
    revisionHistoryLimit: number;
    pageInfo: { hasMore: boolean; nextCursor: string | null };
  }> {
    const response = await axiosInstance.get<unknown>(root(projectId), {
      params: query,
    });
    return parsePage(response.data);
  },
  async listReceipts(
    projectId: string,
    query: {
      limit?: number;
      cursor?: string;
      endUserId?: string;
      status?: "GRANTED" | "REJECTED";
    } = { limit: 50 },
  ): Promise<AiAllowanceAccrualReceiptPage> {
    const response = await axiosInstance.get<unknown>(
      `/api/v1/admin/projects/${encodeURIComponent(projectId)}/ai-allowance/accrual-receipts`,
      { params: query },
    );
    return parseReceiptPage(response.data);
  },
  async putRule(
    projectId: string,
    ruleKey: string,
    input: PutAiAllowanceAccrualRuleInput,
    idempotencyKey: string,
  ): Promise<unknown> {
    return (
      await axiosInstance.put(
        `${root(projectId)}/${encodeURIComponent(ruleKey)}`,
        input,
        { headers: { "Idempotency-Key": idempotencyKey } },
      )
    ).data;
  },
};
const root = (projectId: string) =>
  `/api/v1/admin/projects/${encodeURIComponent(projectId)}/ai-allowance/accrual-rules`;
function parsePage(value: unknown) {
  const s = object(value);
  if (
    !s ||
    !Array.isArray(s.items) ||
    !Number.isSafeInteger(s.revisionHistoryLimit) ||
    !pageInfo(s.pageInfo)
  )
    invalid();
  const items = s.items.map(parseRule);
  if (items.some((item) => !item)) invalid();
  return {
    items: items as AiAllowanceAccrualRule[],
    revisionHistoryLimit: s.revisionHistoryLimit as number,
    pageInfo: pageInfo(s.pageInfo)!,
  };
}
function parseReceiptPage(value: unknown): AiAllowanceAccrualReceiptPage {
  const s = object(value);
  const info = pageInfo(s?.pageInfo);
  if (!s || !info || !Array.isArray(s.items) || s.items.length > 100) invalid();
  const items = s.items.map((value) => {
    const r = object(value);
    const ruleRevision = object(r?.ruleRevision);
    const rule = object(ruleRevision?.rule);
    const eventLog = object(r?.eventLog);
    const eventKey = object(eventLog?.eventDefinitionKey);
    const rewardUsd = parseAllowanceUsd(r?.rewardUsd);
    return r &&
      text(r.id) &&
      text(r.endUserId) &&
      (r.status === "GRANTED" || r.status === "REJECTED") &&
      (r.rejectionReason === null || text(r.rejectionReason)) &&
      rewardUsd &&
      iso(r.evaluatedAt) &&
      iso(r.occurredAt) &&
      (r.grantId === null || text(r.grantId)) &&
      ruleRevision &&
      Number.isSafeInteger(ruleRevision.revisionNumber) &&
      rule &&
      text(rule.key) &&
      text(rule.name) &&
      eventLog &&
      text(eventLog.id) &&
      isAccrualSource(eventLog.source) &&
      iso(eventLog.occurredAt) &&
      eventKey &&
      text(eventKey.code) &&
      text(eventKey.name)
      ? {
          id: r.id,
          endUserId: r.endUserId,
          status: r.status,
          rejectionReason: r.rejectionReason as string | null,
          rewardUsd,
          evaluatedAt: r.evaluatedAt,
          occurredAt: r.occurredAt,
          grantId: r.grantId as string | null,
          ruleRevision: {
            revisionNumber: ruleRevision.revisionNumber as number,
            rule: { key: rule.key, name: rule.name },
          },
          eventLog: {
            id: eventLog.id,
            source: eventLog.source,
            occurredAt: eventLog.occurredAt,
            eventDefinitionKey: { code: eventKey.code, name: eventKey.name },
          },
        }
      : null;
  });
  if (items.some((item) => !item)) invalid();
  return {
    items: items as AiAllowanceAccrualReceiptPage["items"],
    pageInfo: info,
  };
}
function parseRule(value: unknown): AiAllowanceAccrualRule | undefined {
  const s = object(value);
  if (
    !s ||
    !text(s.id) ||
    !text(s.key) ||
    !text(s.name) ||
    !lifecycle(s.lifecycle) ||
    !iso(s.createdAt) ||
    !iso(s.updatedAt) ||
    !Array.isArray(s.revisions)
  )
    return;
  const revisions = s.revisions.map(parseRevision);
  if (revisions.some((item) => !item)) return;
  return {
    id: s.id,
    key: s.key,
    name: s.name,
    lifecycle: s.lifecycle,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    revisions: revisions as AiAllowanceAccrualRule["revisions"],
  };
}
function parseRevision(
  value: unknown,
): AiAllowanceAccrualRule["revisions"][number] | undefined {
  const s = object(value);
  const rewardUsd = parseAllowanceUsd(s?.rewardUsd);
  const userCap = parseAllowanceUsd(s?.perEndUserDailyCapUsd);
  const projectCap = parseAllowanceUsd(s?.projectDailyCapUsd);
  if (
    !s ||
    !text(s.id) ||
    !Number.isSafeInteger(s.revisionNumber) ||
    !text(s.name) ||
    !lifecycle(s.lifecycle) ||
    !text(s.eventDefinitionKeyId) ||
    !Array.isArray(s.allowedSources) ||
    s.allowedSources.some((source) => !isAccrualSource(source)) ||
    !text(s.timezone) ||
    !rewardUsd ||
    !userCap ||
    !projectCap ||
    !Number.isSafeInteger(s.grantTtlSeconds) ||
    !Number.isSafeInteger(s.cooldownSeconds) ||
    !iso(s.effectiveFrom) ||
    !(s.effectiveUntil === null || iso(s.effectiveUntil)) ||
    !text(s.changeReason) ||
    !iso(s.createdAt) ||
    !Array.isArray(s.eventRevisionBindings)
  )
    return;
  const bindings = s.eventRevisionBindings.map((item) => {
    const binding = object(item);
    const revision = object(binding?.eventDefinitionRevision);
    return binding && text(binding.eventDefinitionRevisionId)
      ? {
          eventDefinitionRevisionId: binding.eventDefinitionRevisionId,
          ...(revision && Number.isSafeInteger(revision.version)
            ? {
                eventDefinitionRevision: {
                  version: revision.version as number,
                },
              }
            : {}),
        }
      : null;
  });
  if (bindings.some((item) => !item)) return;
  const eventKey = object(s.eventDefinitionKey);
  return {
    id: s.id,
    revisionNumber: s.revisionNumber as number,
    name: s.name,
    lifecycle: s.lifecycle,
    eventDefinitionKeyId: s.eventDefinitionKeyId,
    allowedSources: s.allowedSources as never,
    timezone: s.timezone,
    rewardUsd,
    perEndUserDailyCapUsd: userCap,
    projectDailyCapUsd: projectCap,
    grantTtlSeconds: s.grantTtlSeconds as number,
    cooldownSeconds: s.cooldownSeconds as number,
    effectiveFrom: s.effectiveFrom,
    effectiveUntil: s.effectiveUntil as string | null,
    changeReason: s.changeReason,
    createdAt: s.createdAt,
    eventRevisionBindings: bindings as never,
    ...(eventKey &&
    text(eventKey.code) &&
    text(eventKey.name) &&
    text(eventKey.lifecycle)
      ? {
          eventDefinitionKey: {
            code: eventKey.code,
            name: eventKey.name,
            lifecycle: eventKey.lifecycle,
          },
        }
      : {}),
  };
}
function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function pageInfo(
  value: unknown,
): { hasMore: boolean; nextCursor: string | null } | undefined {
  const source = object(value);
  return source &&
    typeof source.hasMore === "boolean" &&
    (source.nextCursor === null || text(source.nextCursor)) &&
    source.hasMore === (source.nextCursor !== null)
    ? {
        hasMore: source.hasMore,
        nextCursor: source.nextCursor as string | null,
      }
    : undefined;
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 500;
}
function iso(value: unknown): value is string {
  return text(value) && Number.isFinite(Date.parse(value));
}
function lifecycle(value: unknown): value is "ACTIVE" | "PAUSED" | "ARCHIVED" {
  return value === "ACTIVE" || value === "PAUSED" || value === "ARCHIVED";
}
function invalid(): never {
  throw new Error("Сервер вернул некорректные правила лояльности");
}
