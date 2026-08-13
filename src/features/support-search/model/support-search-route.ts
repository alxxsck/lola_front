import type {
  SupportCaseSearchFilters,
  SupportSearchRequest,
  SupportSearchScope,
} from '@/features/support-search/api/support-search-source';
import type {
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
} from '@/shared/api/generated/models';
import { normalizeSearchTimeRange } from './support-search-time';

export type SupportSearchRouteState = Omit<SupportSearchRequest, 'cursor' | 'limit'>;
type RouteQuery = Record<string, string | readonly (string | null)[] | null | undefined>;
type WrittenRouteQuery = Record<string, string>;

const scopes = new Set<SupportSearchScope>(['CASES', 'CONVERSATIONS', 'MESSAGES', 'END_USERS']);
const caseSortFields = new Set([
  'RELEVANCE',
  'ACTIVITY_AT',
  'PRIORITY',
  'SLA_DUE_AT',
  'WAITING_SINCE',
  'UNREAD_COUNT',
  'CREATED_AT',
]);
const contentSortFields = new Set(['RELEVANCE', 'ACTIVITY_AT']);
const allowed = {
  statuses: new Set<SupportCaseSearchQueryDtoStatusesItem>([
    'OPEN',
    'IN_PROGRESS',
    'WAITING_END_USER',
    'WAITING_SYSTEM',
    'WAITING_ADMIN',
    'RESOLVED',
    'UNRESOLVED',
    'CANCELLED',
  ]),
  waitingSides: new Set<SupportCaseSearchQueryDtoWaitingSidesItem>([
    'END_USER',
    'SUPPORT',
    'SYSTEM',
    'NONE',
  ]),
  assignmentStates: new Set<SupportCaseSearchQueryDtoAssignmentStatesItem>([
    'ASSIGNED',
    'UNASSIGNED',
  ]),
  priorities: new Set<SupportCaseSearchQueryDtoPrioritiesItem>([
    'LOW',
    'NORMAL',
    'HIGH',
    'URGENT',
    'CRITICAL',
  ]),
  slaStates: new Set<SupportCaseSearchQueryDtoSlaStatesItem>([
    'ON_TRACK',
    'AT_RISK',
    'BREACHED',
    'NOT_CONFIGURED',
  ]),
  channels: new Set<SupportCaseSearchQueryDtoChannelsItem>(['TEXT', 'VOICE', 'CMS']),
  categoryCodes: new Set<SupportCaseSearchQueryDtoCategoryCodesItem>([
    'INFORMATION_REQUEST',
    'PROBLEM_RESOLUTION',
    'DECISION_SUPPORT',
    'ACTION_REQUEST',
    'FEEDBACK',
    'OTHER',
  ]),
};

function single(value: RouteQuery[string]): string {
  const resolved = Array.isArray(value) ? value[0] : value;
  return typeof resolved === 'string' ? resolved.trim() : '';
}

function phrase(value: RouteQuery[string]): string {
  return single(value).replace(/\s+/gu, ' ').slice(0, 256);
}

function list<T extends string = string>(
  value: RouteQuery[string],
  values?: ReadonlySet<T>,
  limit = 50,
): T[] | undefined {
  const result = [
    ...new Set(
      single(value)
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item && (!values || (values as ReadonlySet<string>).has(item))),
    ),
  ].slice(0, limit) as T[];
  return result.length ? result : undefined;
}

export function readSupportSearchRoute(query: RouteQuery): SupportSearchRouteState {
  const requestedScope = single(query.scope).toUpperCase().replace('USERS', 'END_USERS');
  const scope = scopes.has(requestedScope as SupportSearchScope)
    ? (requestedScope as SupportSearchScope)
    : 'CASES';
  const timeRange = normalizeSearchTimeRange(single(query.from), single(query.to));
  const filters: SupportCaseSearchFilters =
    scope === 'CASES'
      ? {
          ...(list(query.caseId) ? { caseIds: list(query.caseId) } : {}),
          ...(list(query.endUserId) ? { endUserIds: list(query.endUserId) } : {}),
          ...(list(query.status, allowed.statuses, 8)
            ? { statuses: list(query.status, allowed.statuses, 8) }
            : {}),
          ...(list(query.waiting, allowed.waitingSides, 4)
            ? { waitingSides: list(query.waiting, allowed.waitingSides, 4) }
            : {}),
          ...(list(query.assignment, allowed.assignmentStates, 2)
            ? {
                assignmentStates: list(query.assignment, allowed.assignmentStates, 2),
              }
            : {}),
          ...(list(query.priority, allowed.priorities, 5)
            ? { priorities: list(query.priority, allowed.priorities, 5) }
            : {}),
          ...(list(query.sla, allowed.slaStates, 4)
            ? { slaStates: list(query.sla, allowed.slaStates, 4) }
            : {}),
          ...(list(query.channel, allowed.channels, 3)
            ? { channels: list(query.channel, allowed.channels, 3) }
            : {}),
          ...(list(query.queue) ? { queueIds: list(query.queue) } : {}),
          ...(list(query.topic, undefined, 50)
            ? { topicCodes: list(query.topic, undefined, 50) }
            : {}),
          ...(list(query.category, allowed.categoryCodes, 6)
            ? { categoryCodes: list(query.category, allowed.categoryCodes, 6) }
            : {}),
          ...(list(query.language, undefined, 16)
            ? { languages: list(query.language, undefined, 16) }
            : {}),
          ...(list(query.team) ? { teamIds: list(query.team) } : {}),
          ...(list(query.assignee) ? { assigneeCmsUserIds: list(query.assignee) } : {}),
          ...(['UNREAD', 'READ'].includes(single(query.unread))
            ? { unreadState: single(query.unread) as SupportCaseSearchQueryDtoUnreadState }
            : {}),
          ...(['HAS_DRAFT', 'NO_DRAFT'].includes(single(query.draft))
            ? { draftState: single(query.draft) as SupportCaseSearchQueryDtoDraftState }
            : {}),
          ...(['PROBLEM', 'HEALTHY'].includes(single(query.delivery))
            ? { deliveryState: single(query.delivery) as SupportCaseSearchQueryDtoDeliveryState }
            : {}),
          ...(timeRange ? { timeRange } : {}),
        }
      : {
          ...(list(query.endUserId) ? { endUserIds: list(query.endUserId) } : {}),
          ...(scope === 'CONVERSATIONS' && list(query.conversationId)
            ? { conversationIds: list(query.conversationId) }
            : {}),
          ...(scope === 'MESSAGES' && list(query.caseId) ? { caseIds: list(query.caseId) } : {}),
          ...(scope === 'MESSAGES' && list(query.conversationId)
            ? { conversationIds: list(query.conversationId) }
            : {}),
          ...(scope === 'MESSAGES' && list(query.messageId)
            ? { messageIds: list(query.messageId) }
            : {}),
          ...(scope !== 'END_USERS' && timeRange ? { timeRange } : {}),
        };
  const sortFields =
    scope === 'CASES'
      ? caseSortFields
      : scope === 'END_USERS'
        ? new Set(['RELEVANCE'])
        : contentSortFields;
  const requestedSort = single(query.sort).toUpperCase();
  const field = (
    sortFields.has(requestedSort) ? requestedSort : 'RELEVANCE'
  ) as SupportSearchRouteState['sort']['field'];
  const direction = single(query.direction).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  return { phrase: '', scope, filters, sort: { field, direction } };
}

export function normalizeSupportSearchState(
  state: SupportSearchRouteState,
): SupportSearchRouteState {
  const normalizedExternalIds = [
    ...new Set(
      (state.filters.externalEndUserIds ?? []).map((value) => value.trim()).filter(Boolean),
    ),
  ].slice(0, 50);
  const routed = readSupportSearchRoute(writeSupportSearchRoute(state));
  return {
    ...routed,
    phrase: phrase(state.phrase),
    filters: {
      ...routed.filters,
      ...(normalizedExternalIds.length ? { externalEndUserIds: normalizedExternalIds } : {}),
    },
  };
}

export function writeSupportSearchRoute(state: SupportSearchRouteState): WrittenRouteQuery {
  const query: WrittenRouteQuery = {};
  query.scope = state.scope.toLowerCase().replace('end_users', 'users');
  if (state.scope === 'CASES') {
    const filters = state.filters;
    if (filters.statuses?.length) query.status = filters.statuses.join(',');
    if (filters.waitingSides?.length) query.waiting = filters.waitingSides.join(',');
    if (filters.assignmentStates?.length) query.assignment = filters.assignmentStates.join(',');
    if (filters.priorities?.length) query.priority = filters.priorities.join(',');
    if (filters.slaStates?.length) query.sla = filters.slaStates.join(',');
    if (filters.channels?.length) query.channel = filters.channels.join(',');
    if (filters.queueIds?.length) query.queue = filters.queueIds.join(',');
    if (filters.topicCodes?.length) query.topic = filters.topicCodes.join(',');
    if (filters.categoryCodes?.length) query.category = filters.categoryCodes.join(',');
    if (filters.languages?.length) query.language = filters.languages.join(',');
    if (filters.teamIds?.length) query.team = filters.teamIds.join(',');
    if (filters.assigneeCmsUserIds?.length) query.assignee = filters.assigneeCmsUserIds.join(',');
    if (filters.unreadState) query.unread = filters.unreadState;
    if (filters.draftState) query.draft = filters.draftState;
    if (filters.deliveryState) query.delivery = filters.deliveryState;
  }
  const filters = state.filters;
  if (filters.caseIds?.length) query.caseId = filters.caseIds.join(',');
  if (filters.conversationIds?.length) query.conversationId = filters.conversationIds.join(',');
  if (filters.messageIds?.length) query.messageId = filters.messageIds.join(',');
  if (filters.endUserIds?.length) query.endUserId = filters.endUserIds.join(',');
  if (filters.timeRange) {
    query.from = filters.timeRange.from;
    query.to = filters.timeRange.to;
  }
  query.sort = state.sort.field;
  query.direction = state.sort.direction;
  return query;
}

export function hasSupportSearchCriteria(state: SupportSearchRouteState): boolean {
  return (
    state.phrase.length >= 2 ||
    Object.keys(state.filters).length > 0 ||
    (state.scope !== 'END_USERS' && state.sort.field !== 'RELEVANCE')
  );
}
