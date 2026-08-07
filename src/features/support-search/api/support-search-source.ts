import {
  supportSearchCases,
  supportSearchConversations,
  supportSearchMessages,
  supportSearchUsers,
} from "@/shared/api/generated/retenive-backend";
import type {
  SupportCaseSearchQueryDto,
  SupportCaseSearchQueryDtoAssignmentStatesItem,
  SupportCaseSearchQueryDtoCategoryCodesItem,
  SupportCaseSearchQueryDtoChannelsItem,
  SupportCaseSearchQueryDtoDeliveryState,
  SupportCaseSearchQueryDtoDraftState,
  SupportCaseSearchQueryDtoPrioritiesItem,
  SupportCaseSearchQueryDtoSlaStatesItem,
  SupportCaseSearchQueryDtoStatusesItem,
  SupportCaseSearchQueryDtoUnreadState,
  SupportCaseSearchQueryDtoWaitingSidesItem,
  SupportCaseSearchSortDtoDirection,
  SupportCaseSearchSortDtoField,
  SupportContentSearchSortDtoDirection,
  SupportContentSearchSortDtoField,
  SupportConversationSearchQueryDto,
  SupportEndUserSearchQueryDto,
  SupportMessageSearchQueryDto,
  SupportSearchFreshnessResponseDto,
  SupportSearchTimeRangeDto,
} from "@/shared/api/generated/models";

export type SupportSearchScope =
  | "CASES"
  | "CONVERSATIONS"
  | "MESSAGES"
  | "END_USERS";

export interface SupportCaseSearchFilters {
  caseIds?: string[];
  conversationIds?: string[];
  messageIds?: string[];
  endUserIds?: string[];
  externalEndUserIds?: string[];
  statuses?: SupportCaseSearchQueryDtoStatusesItem[];
  waitingSides?: SupportCaseSearchQueryDtoWaitingSidesItem[];
  assignmentStates?: SupportCaseSearchQueryDtoAssignmentStatesItem[];
  assigneeCmsUserIds?: string[];
  teamIds?: string[];
  priorities?: SupportCaseSearchQueryDtoPrioritiesItem[];
  slaStates?: SupportCaseSearchQueryDtoSlaStatesItem[];
  queueIds?: string[];
  topicCodes?: string[];
  categoryCodes?: SupportCaseSearchQueryDtoCategoryCodesItem[];
  languages?: string[];
  channels?: SupportCaseSearchQueryDtoChannelsItem[];
  unreadState?: SupportCaseSearchQueryDtoUnreadState;
  draftState?: SupportCaseSearchQueryDtoDraftState;
  deliveryState?: SupportCaseSearchQueryDtoDeliveryState;
  timeRange?: SupportSearchTimeRangeDto;
}

export interface SupportSearchRequest {
  phrase: string;
  scope: SupportSearchScope;
  filters: SupportCaseSearchFilters;
  sort: {
    field: SupportCaseSearchSortDtoField | SupportContentSearchSortDtoField;
    direction:
      | SupportCaseSearchSortDtoDirection
      | SupportContentSearchSortDtoDirection;
  };
  cursor?: string;
  limit?: number;
}

export interface SupportSearchResult {
  id: string;
  kind: "CASE" | "CONVERSATION" | "MESSAGE" | "END_USER";
  selection: {
    kind: "CASE" | "CONVERSATION" | "END_USER";
    id: string;
  };
  snippet: string;
  activityAt: string;
  matchProvenance?: "ORIGINAL" | "TRANSLATION" | "NONE";
  locale?: string | null;
  role?: string;
}

export interface SupportSearchFreshness {
  state: "READY" | "BUILDING" | "DEGRADED";
  lagSeconds: number;
  indexedThrough: string;
  generationId?: string | null;
}

export interface SupportSearchPage {
  items: SupportSearchResult[];
  nextCursor: string | null;
  freshness: SupportSearchFreshness;
}

export interface SupportSearchSource {
  search(
    projectId: string,
    request: SupportSearchRequest,
  ): Promise<SupportSearchPage>;
}

function mapFreshness(
  value: SupportSearchFreshnessResponseDto,
): SupportSearchFreshness {
  return {
    state: value.state,
    lagSeconds: value.lagSeconds,
    indexedThrough: value.indexedThrough,
    ...(value.generationId !== undefined
      ? { generationId: value.generationId }
      : {}),
  };
}

function actionableSelection(value: {
  caseId?: string | null;
  conversationId?: string | null;
  endUserId?: string | null;
  target: { kind: string; id: string };
}): SupportSearchResult["selection"] | null {
  if (value.caseId) return { kind: "CASE", id: value.caseId };
  if (value.conversationId)
    return { kind: "CONVERSATION", id: value.conversationId };
  if (value.endUserId) return { kind: "END_USER", id: value.endUserId };
  if (value.target.kind === "CASE")
    return { kind: "CASE", id: value.target.id };
  if (value.target.kind === "CONVERSATION")
    return { kind: "CONVERSATION", id: value.target.id };
  if (value.target.kind === "END_USER")
    return { kind: "END_USER", id: value.target.id };
  return null;
}

function baseQuery(request: SupportSearchRequest) {
  return {
    ...(request.phrase ? { phrase: request.phrase } : {}),
    ...(request.cursor ? { cursor: request.cursor } : {}),
    limit: request.limit ?? 30,
  };
}

function commonFilters(filters: SupportCaseSearchFilters) {
  return {
    ...(filters.endUserIds ? { endUserIds: filters.endUserIds } : {}),
    ...(filters.externalEndUserIds
      ? { externalEndUserIds: filters.externalEndUserIds }
      : {}),
    ...(filters.timeRange ? { timeRange: filters.timeRange } : {}),
  };
}

function caseFilters(filters: SupportCaseSearchFilters) {
  const {
    statuses,
    waitingSides,
    assignmentStates,
    assigneeCmsUserIds,
    teamIds,
    priorities,
    slaStates,
    queueIds,
    topicCodes,
    categoryCodes,
    languages,
    channels,
    unreadState,
    draftState,
    deliveryState,
    caseIds,
  } = filters;
  return {
    ...commonFilters(filters),
    ...(caseIds ? { caseIds } : {}),
    ...(statuses ? { statuses } : {}),
    ...(waitingSides ? { waitingSides } : {}),
    ...(assignmentStates ? { assignmentStates } : {}),
    ...(assigneeCmsUserIds ? { assigneeCmsUserIds } : {}),
    ...(teamIds ? { teamIds } : {}),
    ...(priorities ? { priorities } : {}),
    ...(slaStates ? { slaStates } : {}),
    ...(queueIds ? { queueIds } : {}),
    ...(topicCodes ? { topicCodes } : {}),
    ...(categoryCodes ? { categoryCodes } : {}),
    ...(languages ? { languages } : {}),
    ...(channels ? { channels } : {}),
    ...(unreadState ? { unreadState } : {}),
    ...(draftState ? { draftState } : {}),
    ...(deliveryState ? { deliveryState } : {}),
  };
}

function caseSort(request: SupportSearchRequest) {
  const fields = new Set<SupportCaseSearchSortDtoField>([
    "RELEVANCE",
    "ACTIVITY_AT",
    "PRIORITY",
    "SLA_DUE_AT",
    "WAITING_SINCE",
    "UNREAD_COUNT",
    "CREATED_AT",
  ]);
  return {
    field: fields.has(request.sort.field as SupportCaseSearchSortDtoField)
      ? (request.sort.field as SupportCaseSearchSortDtoField)
      : "RELEVANCE",
    direction: request.sort.direction,
  };
}

function contentSort(request: SupportSearchRequest) {
  return {
    field:
      request.sort.field === "ACTIVITY_AT" ? "ACTIVITY_AT" : "RELEVANCE",
    direction: request.sort.direction,
  } as const;
}

export const supportSearchSource: SupportSearchSource = {
  async search(projectId, request) {
    if (request.scope === "CASES") {
      const response = await supportSearchCases(projectId, {
        ...baseQuery(request),
        ...caseFilters(request.filters),
        sort: caseSort(request),
      } satisfies SupportCaseSearchQueryDto);
      return {
        items: response.items.flatMap((item) => {
          const selection = actionableSelection(item);
          return selection
            ? [{
                id: item.target.id,
                kind: "CASE" as const,
                selection,
                snippet: item.snippet,
                activityAt: item.activityAt,
                matchProvenance: item.matchProvenance,
                locale: item.matchLocale,
              }]
            : [];
        }),
        nextCursor: response.nextCursor ?? null,
        freshness: mapFreshness(response.freshness),
      };
    }
    if (request.scope === "CONVERSATIONS") {
      const response = await supportSearchConversations(projectId, {
        ...baseQuery(request),
        ...commonFilters(request.filters),
        ...(request.filters.conversationIds
          ? { conversationIds: request.filters.conversationIds }
          : {}),
        sort: contentSort(request),
      } satisfies SupportConversationSearchQueryDto);
      return {
        items: response.items.flatMap((item) => {
          const selection = actionableSelection(item);
          return selection
            ? [{
                id: item.target.id,
                kind: "CONVERSATION" as const,
                selection,
                snippet: item.snippet,
                activityAt: item.activityAt,
                matchProvenance: item.matchProvenance,
                locale: item.matchLocale,
              }]
            : [];
        }),
        nextCursor: response.nextCursor ?? null,
        freshness: mapFreshness(response.freshness),
      };
    }
    if (request.scope === "MESSAGES") {
      const response = await supportSearchMessages(projectId, {
        ...baseQuery(request),
        ...commonFilters(request.filters),
        ...(request.filters.caseIds ? { caseIds: request.filters.caseIds } : {}),
        ...(request.filters.conversationIds
          ? { conversationIds: request.filters.conversationIds }
          : {}),
        ...(request.filters.messageIds
          ? { messageIds: request.filters.messageIds }
          : {}),
        ...(request.filters.languages
          ? { languages: request.filters.languages }
          : {}),
        sort: contentSort(request),
      } satisfies SupportMessageSearchQueryDto);
      return {
        items: response.items.flatMap((item) => {
          const selection = actionableSelection(item);
          return selection
            ? [{
                id: item.target.id,
                kind: "MESSAGE" as const,
                selection,
                snippet: item.snippet,
                activityAt: item.activityAt,
                matchProvenance: item.matchProvenance,
                locale: item.matchLocale ?? item.language,
                role: item.role,
              }]
            : [];
        }),
        nextCursor: response.nextCursor ?? null,
        freshness: mapFreshness(response.freshness),
      };
    }
    const response = await supportSearchUsers(
      projectId,
      {
        ...baseQuery(request),
        ...(request.filters.endUserIds
          ? { endUserIds: request.filters.endUserIds }
          : {}),
        ...(request.filters.externalEndUserIds
          ? { externalEndUserIds: request.filters.externalEndUserIds }
          : {}),
      } satisfies SupportEndUserSearchQueryDto,
    );
    return {
      items: response.items.map((item) => ({
        id: item.target.id,
        kind: "END_USER" as const,
        selection: { kind: "END_USER" as const, id: item.endUserId },
        snippet: item.externalEndUserId,
        activityAt: item.lastSeenAt,
      })),
      nextCursor: response.nextCursor ?? null,
      freshness: mapFreshness(response.freshness),
    };
  },
};
