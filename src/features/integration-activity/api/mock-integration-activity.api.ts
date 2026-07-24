import type {
  IntegrationActivityContent,
  IntegrationActivityDetail,
  IntegrationActivityItem,
  IntegrationActivityRepository,
} from "../model/integration-activity";

const base = new Date("2026-07-24T15:42:00.000Z").getTime();
const at = (minutesAgo: number) =>
  new Date(base - minutesAgo * 60_000).toISOString();

const items: IntegrationActivityItem[] = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    provider: "TELEGRAM",
    activityType: "PERSONAL_MESSAGE",
    status: "SUCCEEDED",
    state: "SENT",
    endUser: { id: "user-1", externalId: "customer_10482" },
    origin: { kind: "AI", id: "conversation-1" },
    attemptCount: 1,
    errorCode: null,
    contentState: "AVAILABLE",
    createdAt: at(4),
    updatedAt: at(3),
    finishedAt: at(3),
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    provider: "TELEGRAM",
    activityType: "CONNECTION",
    status: "SUCCEEDED",
    state: "CONNECTED",
    endUser: { id: "user-2", externalId: "vip_anna_77" },
    origin: { kind: "END_USER", id: null },
    attemptCount: 1,
    errorCode: null,
    contentState: "NOT_APPLICABLE",
    createdAt: at(17),
    updatedAt: at(14),
    finishedAt: at(14),
  },
  {
    id: "10000000-0000-4000-8000-000000000003",
    provider: "TELEGRAM",
    activityType: "PERSONAL_MESSAGE",
    status: "PENDING",
    state: "RETRY_WAIT",
    endUser: { id: "user-3", externalId: "player_5081" },
    origin: { kind: "CMS_USER", id: "cms-1" },
    attemptCount: 2,
    errorCode: "TELEGRAM_RATE_LIMITED",
    contentState: "AVAILABLE",
    createdAt: at(26),
    updatedAt: at(22),
    finishedAt: null,
  },
  {
    id: "10000000-0000-4000-8000-000000000004",
    provider: "TELEGRAM",
    activityType: "CONNECTION",
    status: "PENDING",
    state: "AWAITING_CONFIRMATION",
    endUser: { id: "user-4", externalId: "client_eu_204" },
    origin: { kind: "END_USER", id: null },
    attemptCount: 1,
    errorCode: null,
    contentState: "NOT_APPLICABLE",
    createdAt: at(41),
    updatedAt: at(39),
    finishedAt: null,
  },
  {
    id: "10000000-0000-4000-8000-000000000005",
    provider: "TELEGRAM",
    activityType: "PERSONAL_MESSAGE",
    status: "OUTCOME_UNKNOWN",
    state: "OUTCOME_UNKNOWN",
    endUser: { id: "user-5", externalId: "user_003904" },
    origin: { kind: "SCENARIO", id: "run-1" },
    attemptCount: 1,
    errorCode: "TELEGRAM_OUTCOME_UNKNOWN",
    contentState: "REDACTED",
    createdAt: at(68),
    updatedAt: at(67),
    finishedAt: at(67),
  },
  {
    id: "10000000-0000-4000-8000-000000000006",
    provider: "TELEGRAM",
    activityType: "CONNECTION",
    status: "FAILED",
    state: "BLOCKED",
    endUser: { id: "user-6", externalId: "customer_88012" },
    origin: { kind: "SYSTEM", id: null },
    attemptCount: 0,
    errorCode: null,
    contentState: "NOT_APPLICABLE",
    createdAt: at(92),
    updatedAt: at(92),
    finishedAt: at(92),
  },
];

const contentById: Record<string, IntegrationActivityContent> = {
  "10000000-0000-4000-8000-000000000001": {
    state: "AVAILABLE",
    kind: "TEXT",
    text: "Анна, ваш персональный бонус уже доступен 🎁",
    attachment: null,
    redactedAt: null,
  },
  "10000000-0000-4000-8000-000000000003": {
    state: "AVAILABLE",
    kind: "TEXT",
    text: "Мы заметили, что вы не завершили оформление. Нужна помощь?",
    attachment: null,
    redactedAt: null,
  },
  "10000000-0000-4000-8000-000000000005": {
    state: "REDACTED",
    kind: "TEXT",
    text: null,
    attachment: null,
    redactedAt: at(30),
  },
};

function detail(item: IntegrationActivityItem): IntegrationActivityDetail {
  return {
    ...item,
    sourceResourceKind:
      item.activityType === "CONNECTION"
        ? "TELEGRAM_LINK_CHALLENGE"
        : "TELEGRAM_PERSONAL_MESSAGE",
    sourceResourceId: `source-${item.id}`,
    requestId: `req-${item.id.slice(-4)}`,
    correlationId: null,
    conversationId: item.origin.kind === "AI" ? item.origin.id : null,
    scenarioRunId: item.origin.kind === "SCENARIO" ? item.origin.id : null,
    attempts:
      item.activityType === "PERSONAL_MESSAGE"
        ? Array.from({ length: item.attemptCount }, (_, index) => ({
            attemptNumber: index + 1,
            outcome:
              index + 1 === item.attemptCount && item.status === "SUCCEEDED"
                ? "ACCEPTED"
                : item.status === "PENDING"
                  ? "RATE_LIMITED"
                  : item.status,
            errorCode: index + 1 === item.attemptCount ? item.errorCode : null,
            retryAfterMs: item.status === "PENDING" ? 30_000 : null,
            startedAt: item.createdAt,
            finishedAt: item.updatedAt,
          }))
        : [],
    milestones:
      item.activityType === "CONNECTION"
        ? [
            { state: "AWAITING_TELEGRAM", at: item.createdAt },
            ...(item.state !== "AWAITING_TELEGRAM"
              ? [{ state: item.state, at: item.updatedAt }]
              : []),
          ]
        : [],
  };
}

export const mockIntegrationActivityRepository: IntegrationActivityRepository =
  {
    async list(_projectId, filters = {}) {
      const filtered = items.filter(
        (item) =>
          (!filters.provider?.length ||
            filters.provider.includes(item.provider)) &&
          (!filters.activityType?.length ||
            filters.activityType.includes(item.activityType)) &&
          (!filters.status?.length || filters.status.includes(item.status)) &&
          (!filters.externalUserId ||
            item.endUser.externalId === filters.externalUserId),
      );
      return {
        items: filtered.slice(0, filters.limit ?? 25),
        nextCursor: null,
      };
    },
    async get(_projectId, activityId) {
      const item = items.find((candidate) => candidate.id === activityId);
      if (!item) throw new Error("Запись интеграции не найдена");
      return detail(item);
    },
    async content(_projectId, activityId) {
      const content = contentById[activityId];
      if (!content) throw new Error("Содержимое сообщения недоступно");
      return content;
    },
  };
