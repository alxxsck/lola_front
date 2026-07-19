import {
  aIProposalEventsReceived,
  aIProposalsDecide,
  aIProposalsDetail,
  aIProposalsList,
  aIProposalsMarkRead,
  aIProposalsSummary,
} from "@/shared/api/generated/lola-backend";
import type { AIProposalsListParams } from "@/shared/api/generated/models";
import { isMockMode } from "@/shared/config/data-mode";
import {
  mapAIProposalDetail,
  mapAIProposalListItem,
  mapAIProposalSummary,
  proposalStatuses,
  type AIProposalDetail,
  type AIProposalFilters,
  type AIProposalListItem,
  type AIProposalSummary,
} from "../model/ai-proposal";

export interface AIProposalsPage {
  items: AIProposalListItem[];
  nextCursor: string | null;
  summary: AIProposalSummary;
}

export interface AIProposalReadResult {
  proposal: AIProposalDetail;
  summary: AIProposalSummary;
}

export interface AIProposalsRepository {
  list(
    projectId: string,
    filters: AIProposalFilters,
    cursor?: string,
  ): Promise<AIProposalsPage>;
  summary(projectId: string): Promise<AIProposalSummary>;
  detail(projectId: string, proposalId: string): Promise<AIProposalDetail>;
  markRead(
    projectId: string,
    proposalId: string,
  ): Promise<AIProposalReadResult>;
  decide(
    projectId: string,
    proposalId: string,
    input: { action: "RESOLVE"; expectedVersion: number; reason?: string },
  ): Promise<AIProposalDetail>;
  acknowledge(projectId: string, eventId: string): Promise<void>;
}

function listParams(
  filters: AIProposalFilters,
  cursor?: string,
): AIProposalsListParams {
  return {
    status: proposalStatuses(filters.preset),
    ...(filters.preset === "UNREAD" ? { read: "UNREAD" as const } : {}),
    ...(filters.kind ? { kind: [filters.kind] } : {}),
    ...(filters.priority ? { priority: [filters.priority] } : {}),
    ...(filters.endUserId ? { endUserId: filters.endUserId } : {}),
    ...(filters.createdFrom ? { createdFrom: filters.createdFrom } : {}),
    ...(filters.createdTo ? { createdTo: filters.createdTo } : {}),
    ...(cursor ? { cursor } : {}),
    limit: 25,
  };
}

const apiRepository: AIProposalsRepository = {
  async list(projectId, filters, cursor) {
    const response = await aIProposalsList(
      projectId,
      listParams(filters, cursor),
      { paramsSerializer: { indexes: null } },
    );
    return {
      items: response.items.map(mapAIProposalListItem),
      nextCursor: response.nextCursor ?? null,
      summary: mapAIProposalSummary(response.summary),
    };
  },
  async summary(projectId) {
    return mapAIProposalSummary(await aIProposalsSummary(projectId));
  },
  async detail(projectId, proposalId) {
    return mapAIProposalDetail(await aIProposalsDetail(projectId, proposalId));
  },
  async markRead(projectId, proposalId) {
    const response = await aIProposalsMarkRead(projectId, proposalId);
    return {
      proposal: mapAIProposalDetail(response.proposal),
      summary: mapAIProposalSummary(response.summary),
    };
  },
  async decide(projectId, proposalId, input) {
    return mapAIProposalDetail(
      await aIProposalsDecide(projectId, proposalId, input),
    );
  },
  async acknowledge(projectId, eventId) {
    await aIProposalEventsReceived(projectId, eventId);
  },
};

const now = new Date();
const hourAgo = (hours: number) =>
  new Date(now.valueOf() - hours * 3_600_000).toISOString();
const mockSeed: AIProposalDetail[] = [
  {
    id: "62c36b82-8066-45d0-b5ee-d734d9fed4d1",
    projectSequence: "104",
    kind: "ADMIN_ATTENTION",
    workflowStatus: "OPEN",
    decisionMode: "ACKNOWLEDGE",
    priority: "HIGH",
    title: "Клиент просит связаться с администратором",
    summary:
      "Мария не смогла подобрать подходящий тариф и просит помочь с условиями подключения сегодня.",
    sourceType: "TEXT_CHAT",
    endUser: {
      id: "usr_1",
      externalId: "user_89421",
      displayName: "Анна Смирнова",
    },
    conversationId: "conv_1",
    sourceMessageId: "message_104",
    version: 2,
    isRead: false,
    createdAt: hourAgo(0.3),
    updatedAt: hourAgo(0.2),
    content: { reasonCode: "SUPPORT_REQUEST", repeatedCount: 2 },
    evidence: [
      {
        type: "USER_MESSAGE",
        excerpt:
          "Позовите, пожалуйста, администратора. Хочу уточнить тариф и подключиться сегодня.",
      },
    ],
  },
  {
    id: "b398af2e-3bff-4c1c-bbab-d426615f7b75",
    projectSequence: "103",
    kind: "ADMIN_ATTENTION",
    workflowStatus: "OPEN",
    decisionMode: "ACKNOWLEDGE",
    priority: "NORMAL",
    title: "Нужна помощь с возвратом",
    summary:
      "Пользователь просит проверить статус возврата по последнему заказу.",
    sourceType: "VOICE",
    endUser: {
      id: "usr_2",
      externalId: "user_11603",
      displayName: "Marco Silva",
    },
    conversationId: "conv_3",
    version: 1,
    isRead: true,
    readAt: hourAgo(1.9),
    createdAt: hourAgo(2),
    updatedAt: hourAgo(1.9),
    content: { reasonCode: "REFUND_STATUS" },
    evidence: [
      {
        type: "VOICE_TRANSCRIPT",
        excerpt: "Соедините меня с человеком, хочу узнать про возврат.",
      },
    ],
  },
  {
    id: "6bf251f0-5a08-4c73-8b38-f017b31cdedf",
    projectSequence: "98",
    kind: "ADMIN_ATTENTION",
    workflowStatus: "RESOLVED",
    decisionMode: "ACKNOWLEDGE",
    priority: "NORMAL",
    title: "Запрос условий для команды",
    summary: "Администратор связался с клиентом и отправил условия.",
    sourceType: "TEXT_CHAT",
    endUser: {
      id: "usr_4",
      externalId: "user_53187",
      displayName: "Иван Петров",
    },
    version: 3,
    isRead: true,
    readAt: hourAgo(22),
    decidedAt: hourAgo(20),
    resolvedAt: hourAgo(20),
    decisionReason: "Условия отправлены в диалоге",
    decidedByAdminId: "cms_1",
    createdAt: hourAgo(24),
    updatedAt: hourAgo(20),
    content: { reasonCode: "CONTACT_REQUEST" },
    evidence: [
      {
        type: "USER_MESSAGE",
        excerpt: "Нужны условия для команды из 30 человек.",
      },
    ],
  },
];
let mockItems = structuredClone(mockSeed);

function mockSummary(): AIProposalSummary {
  const open = mockItems.filter((item) =>
    ["OPEN", "ACCEPTED"].includes(item.workflowStatus),
  );
  return {
    openCount: open.length,
    unreadCount: open.filter((item) => !item.isRead).length,
    highPriorityUnreadCount: open.filter(
      (item) => !item.isRead && ["HIGH", "URGENT"].includes(item.priority),
    ).length,
    lastSequence: mockItems.reduce(
      (latest, item) =>
        BigInt(item.projectSequence) > BigInt(latest)
          ? item.projectSequence
          : latest,
      "0",
    ),
    calculatedAt: new Date().toISOString(),
  };
}

const mockRepository: AIProposalsRepository = {
  async list(_projectId, filters) {
    const statuses = proposalStatuses(filters.preset);
    const items = mockItems.filter(
      (item) =>
        statuses.includes(item.workflowStatus) &&
        (filters.preset !== "UNREAD" || !item.isRead) &&
        (!filters.kind || item.kind === filters.kind) &&
        (!filters.priority || item.priority === filters.priority) &&
        (!filters.endUserId || item.endUser?.id === filters.endUserId),
    );
    return { items, nextCursor: null, summary: mockSummary() };
  },
  async summary() {
    return mockSummary();
  },
  async detail(_projectId, proposalId) {
    const item = mockItems.find((proposal) => proposal.id === proposalId);
    if (!item) throw new Error("Предложение не найдено");
    return structuredClone(item);
  },
  async markRead(_projectId, proposalId) {
    const item = mockItems.find((proposal) => proposal.id === proposalId);
    if (!item) throw new Error("Предложение не найдено");
    item.isRead = true;
    item.readAt ??= new Date().toISOString();
    return { proposal: structuredClone(item), summary: mockSummary() };
  },
  async decide(_projectId, proposalId, input) {
    const item = mockItems.find((proposal) => proposal.id === proposalId);
    if (!item) throw new Error("Предложение не найдено");
    if (item.version !== input.expectedVersion)
      throw new Error("Предложение уже изменилось");
    item.workflowStatus = "RESOLVED";
    item.version += 1;
    item.updatedAt = new Date().toISOString();
    item.decidedAt = item.updatedAt;
    item.resolvedAt = item.updatedAt;
    item.decisionReason = input.reason;
    return structuredClone(item);
  },
  async acknowledge() {},
};

export const aiProposalsRepository = isMockMode
  ? mockRepository
  : apiRepository;

export function resetMockAIProposals(): void {
  mockItems = structuredClone(mockSeed);
}
