import type {
  EndUserCaseMessagesResponseDto,
  EndUserCaseProposalsResponseDto,
  EndUserCaseResponseDto,
  EndUserCasesListParams,
  EndUserCaseSummaryResponseDto,
  EndUserCaseTimelineResponseDto,
} from "@/shared/api/generated/models";

export type EndUserCase = EndUserCaseResponseDto;
export type EndUserCaseSummary = EndUserCaseSummaryResponseDto;
export type EndUserCaseMessages = EndUserCaseMessagesResponseDto;
export type EndUserCaseTimeline = EndUserCaseTimelineResponseDto;
export type EndUserCaseProposals = EndUserCaseProposalsResponseDto;
export type EndUserCaseStatus = EndUserCase["status"];
export type EndUserCasePriority = EndUserCase["priority"];
export type EndUserCaseImpact = EndUserCase["impact"];
export type EndUserCaseUrgency = EndUserCase["urgency"];
export type EndUserCasePreset =
  "ACTIVE" | "ATTENTION" | "WAITING" | "RESOLVED" | "ALL";
export type EndUserCaseSort = NonNullable<EndUserCasesListParams["sort"]>;

export interface EndUserCaseFilters {
  preset: EndUserCasePreset;
  sort: EndUserCaseSort;
  status?: NonNullable<EndUserCasesListParams["status"]>;
  priority?: EndUserCasePriority[];
  impact?: EndUserCaseImpact[];
  urgency?: EndUserCaseUrgency[];
  resolutionAssessment?: NonNullable<
    EndUserCasesListParams["resolutionAssessment"]
  >;
  resolutionSource?: NonNullable<EndUserCasesListParams["resolutionSource"]>;
  groupCode?: string;
  assignment?: NonNullable<EndUserCasesListParams["assignment"]>;
  endUserId?: string;
  assignedCmsUserId?: string;
  primaryLanguage?: string;
  channel?: NonNullable<EndUserCasesListParams["channel"]>;
  aiCapabilityCode?: string;
  aiCapabilityOutcome?: NonNullable<
    EndUserCasesListParams["aiCapabilityOutcome"]
  >;
  adminAttention?: NonNullable<EndUserCasesListParams["adminAttention"]>;
  cmsParticipation?: NonNullable<EndUserCasesListParams["cmsParticipation"]>;
  recontacted?: NonNullable<EndUserCasesListParams["recontacted"]>;
  reopened?: NonNullable<EndUserCasesListParams["reopened"]>;
  stale?: NonNullable<EndUserCasesListParams["stale"]>;
  degraded?: NonNullable<EndUserCasesListParams["degraded"]>;
  createdFrom?: string;
  createdTo?: string;
  lastActivityFrom?: string;
  lastActivityTo?: string;
}

const ACTIVE_STATUSES: EndUserCaseStatus[] = [
  "OPEN",
  "IN_PROGRESS",
  "WAITING_END_USER",
  "WAITING_SYSTEM",
  "WAITING_ADMIN",
];

export const defaultEndUserCaseFilters = (): EndUserCaseFilters => ({
  preset: "ACTIVE",
  sort: "ATTENTION_FIRST",
});

export function endUserCaseStatusesForPreset(
  preset: EndUserCasePreset,
): EndUserCaseStatus[] | undefined {
  if (preset === "ACTIVE" || preset === "ATTENTION")
    return [...ACTIVE_STATUSES];
  if (preset === "WAITING")
    return ["WAITING_END_USER", "WAITING_SYSTEM", "WAITING_ADMIN"];
  if (preset === "RESOLVED") return ["RESOLVED", "UNRESOLVED", "CANCELLED"];
  return undefined;
}

export function endUserCaseListParams(
  filters: EndUserCaseFilters,
  cursor?: string,
): EndUserCasesListParams {
  const status = filters.status?.length
    ? filters.status
    : endUserCaseStatusesForPreset(filters.preset);
  return {
    ...(status ? { status } : {}),
    ...(filters.adminAttention
      ? { adminAttention: filters.adminAttention }
      : filters.preset === "ATTENTION"
        ? { adminAttention: "OPEN" as const }
        : {}),
    ...(filters.priority?.length ? { priority: filters.priority } : {}),
    ...(filters.impact?.length ? { impact: filters.impact } : {}),
    ...(filters.urgency?.length ? { urgency: filters.urgency } : {}),
    ...(filters.resolutionAssessment?.length
      ? { resolutionAssessment: filters.resolutionAssessment }
      : {}),
    ...(filters.resolutionSource?.length
      ? { resolutionSource: filters.resolutionSource }
      : {}),
    ...(filters.groupCode ? { groupCode: filters.groupCode } : {}),
    ...(filters.assignment ? { assignment: filters.assignment } : {}),
    ...(filters.endUserId ? { endUserId: filters.endUserId } : {}),
    ...(filters.assignedCmsUserId
      ? { assignedCmsUserId: filters.assignedCmsUserId }
      : {}),
    ...(filters.primaryLanguage
      ? { primaryLanguage: filters.primaryLanguage }
      : {}),
    ...(filters.channel?.length ? { channel: filters.channel } : {}),
    ...(filters.aiCapabilityCode
      ? { aiCapabilityCode: filters.aiCapabilityCode }
      : {}),
    ...(filters.aiCapabilityOutcome?.length
      ? { aiCapabilityOutcome: filters.aiCapabilityOutcome }
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
      ? { lastActivityFrom: filters.lastActivityFrom }
      : {}),
    ...(filters.lastActivityTo
      ? { lastActivityTo: filters.lastActivityTo }
      : {}),
    sort: filters.sort,
    ...(cursor ? { cursor } : {}),
    limit: 30,
  };
}

interface EndUserCaseRealtimeBase {
  contractVersion: 1;
  eventId: string;
  projectSequence: string;
}

export type EndUserCaseRealtimeEvent =
  | (EndUserCaseRealtimeBase & {
      type: "end_user_case.created" | "end_user_case.updated";
      data: { case: EndUserCase };
    })
  | (EndUserCaseRealtimeBase & {
      type: "end_user_case.summary";
      data: EndUserCaseSummary;
    });

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export function isEndUserCaseRealtimeEvent(
  value: unknown,
): value is EndUserCaseRealtimeEvent {
  const envelope = record(value);
  if (
    !envelope ||
    envelope.contractVersion !== 1 ||
    typeof envelope.eventId !== "string" ||
    typeof envelope.projectSequence !== "string"
  )
    return false;
  const data = record(envelope.data);
  if (!data) return false;
  if (envelope.type === "end_user_case.summary")
    return (
      typeof data.lastProjectSequence === "string" &&
      typeof data.openCount === "number"
    );
  if (
    envelope.type !== "end_user_case.created" &&
    envelope.type !== "end_user_case.updated"
  )
    return false;
  const item = record(data.case);
  return (
    item !== null &&
    typeof item.id === "string" &&
    typeof item.version === "number"
  );
}

export function isTerminalEndUserCase(status: EndUserCaseStatus): boolean {
  return ["RESOLVED", "UNRESOLVED", "CANCELLED"].includes(status);
}
