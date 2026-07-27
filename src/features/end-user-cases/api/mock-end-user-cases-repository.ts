import type {
  EndUserCasePolicyPreviewResponseDto,
  EndUserCasePolicyRevisionResponseDto,
  EndUserCasePolicyResponseDto,
} from "@/shared/api/generated/models";
import type {
  EndUserCase,
  EndUserCaseFilters,
} from "../model/end-user-case";
import {
  endUserCaseStatusesForPreset,
  isTerminalEndUserCase,
} from "../model/end-user-case";
import type { EndUserCasesRepository } from "./end-user-cases-repository";

const now = "2026-07-26T10:00:00.000Z";

const primaryCase: EndUserCase = {
  id: "case-demo-deposit",
  projectSequence: "48",
  version: 2,
  type: "PROBLEM_RESOLUTION",
  groupCode: "PAYMENTS",
  suggestedGroup: null,
  title: "Не поступил депозит",
  goal: "Понять статус депозита и получить деньги на счёт",
  summary:
    "Платёж найден. Провайдер обрабатывает его дольше обычного; ожидаем проверяемый результат.",
  status: "WAITING_SYSTEM",
  availableStatuses: ["IN_PROGRESS", "WAITING_ADMIN", "RESOLVED"],
  resolution: {
    assessment: "LIKELY_RESOLVED",
    source: "AI_INFERENCE",
    confidence: "0.780",
  },
  impact: "HIGH",
  urgency: "HIGH",
  priority: "URGENT",
  prioritySource: "PLATFORM_RULE",
  priorityReasons: ["Пользователь не получил деньги"],
  initialTone: "CONCERNED",
  currentTone: "CALM",
  toneTrend: "IMPROVING",
  primaryLanguage: "ru",
  languages: ["ru"],
  channels: ["TEXT", "VOICE"],
  endUser: { id: "usr_1", externalId: "player-0042" },
  assignee: null,
  messageCount: 3,
  proposalCount: 1,
  firstObservedAt: "2026-07-26T09:00:00.000Z",
  lastActivityAt: now,
  lastEndUserRecontactAt: "2026-07-26T09:45:00.000Z",
  waitingSince: "2026-07-26T09:30:00.000Z",
  resolvedAt: null,
  reopenedAt: null,
  aggregationDirtyAt: null,
  nextAggregationAt: null,
  degradedReason: null,
  createdAt: "2026-07-26T09:00:00.000Z",
  updatedAt: now,
  endUserRecontactCount: 1,
  mergedIntoCaseId: null,
  splitFromCaseId: null,
  splitEvidence: [],
  staleAt: null,
  workSummary: {
    aiCapabilities: [
      {
        actionTypeCode: "check_deposit",
        invocationCount: 2,
        succeeded: 2,
        failed: 0,
        lastInvokedAt: "2026-07-26T09:40:00.000Z",
      },
    ],
    cmsParticipation: {
      messageCount: 1,
      actionCount: 1,
      firstParticipatedAt: "2026-07-26T09:35:00.000Z",
    },
    blockers: ["Ожидается ответ платёжного провайдера"],
    limitations: ["Точный срок зачисления пока неизвестен"],
  },
};

const mockSeed: EndUserCase[] = [
  primaryCase,
  {
    ...primaryCase,
    id: "case-demo-game",
    projectSequence: "47",
    version: 1,
    groupCode: "GAMES",
    title: "Не запускается игра",
    goal: "Запустить игру на мобильном устройстве",
    summary:
      "Lola собрала данные об устройстве и предложила безопасные шаги. Пользователь ждёт администратора.",
    status: "WAITING_ADMIN",
    availableStatuses: ["IN_PROGRESS", "WAITING_END_USER", "RESOLVED"],
    priority: "HIGH",
    urgency: "MEDIUM",
    currentTone: "FRUSTRATED",
    toneTrend: "WORSENING",
    channels: ["TEXT"],
    endUser: { id: "usr_2", externalId: "player-0198" },
    proposalCount: 1,
    messageCount: 6,
    endUserRecontactCount: 0,
    lastActivityAt: "2026-07-26T09:20:00.000Z",
  },
  {
    ...primaryCase,
    id: "case-demo-resolved",
    projectSequence: "46",
    version: 4,
    groupCode: "ACCOUNT",
    title: "Восстановление доступа",
    goal: "Вернуть доступ к учётной записи",
    summary:
      "Пользователь подтвердил, что вошёл с новым паролем. Решение проверено.",
    status: "RESOLVED",
    availableStatuses: ["OPEN"],
    priority: "NORMAL",
    urgency: "LOW",
    resolution: {
      assessment: "CONFIRMED_RESOLVED",
      source: "END_USER_EXPLICIT",
      confidence: "1",
    },
    initialTone: "CONCERNED",
    currentTone: "POSITIVE",
    toneTrend: "IMPROVING",
    channels: ["TEXT"],
    endUser: { id: "usr_3", externalId: "player-0281" },
    proposalCount: 0,
    messageCount: 5,
    endUserRecontactCount: 1,
    resolvedAt: "2026-07-26T08:30:00.000Z",
    lastActivityAt: "2026-07-26T08:30:00.000Z",
  },
];

let mockCases = structuredClone(mockSeed);

const messages = {
  items: [
    {
      relation: "PRIMARY" as const,
      relevance: "1",
      linkedBy: "ROUTER" as const,
      linkedAt: "2026-07-26T09:00:00.000Z",
      message: {
        id: "message-demo-1",
        threadId: "thread-demo-1",
        role: "USER" as const,
        text: "Я пополнил счёт, но депозит до сих пор не пришёл.",
        status: "COMPLETED" as const,
        createdAt: "2026-07-26T09:00:00.000Z",
        metadata: {},
      },
    },
    {
      relation: "PRIMARY" as const,
      relevance: "1",
      linkedBy: "ROUTER" as const,
      linkedAt: "2026-07-26T09:01:00.000Z",
      message: {
        id: "message-demo-2",
        threadId: "thread-demo-1",
        role: "ASSISTANT" as const,
        text: "Проверяю состояние платежа.",
        status: "COMPLETED" as const,
        createdAt: "2026-07-26T09:01:00.000Z",
        metadata: {},
      },
    },
    {
      relation: "SUPPORTING" as const,
      relevance: "0.9",
      linkedBy: "CMS" as const,
      linkedAt: "2026-07-26T09:35:00.000Z",
      message: {
        id: "message-demo-3",
        threadId: "thread-demo-1",
        role: "ADMIN" as const,
        text: "Платёж найден, продолжаем следить за его состоянием.",
        status: "COMPLETED" as const,
        createdAt: "2026-07-26T09:35:00.000Z",
        metadata: {},
      },
    },
  ],
  nextCursor: null,
};

const publishedPolicy = {
  id: "policy-demo-1",
  version: 1,
  status: "PUBLISHED",
  compilerVersion: "1",
  compiledPolicyHash: "demo-policy-hash",
  publishedAt: now,
  compiledPolicy: {
    groups: [
      {
        code: "PAYMENTS",
        title: "Платежи",
        description: "Пополнение и вывод средств",
      },
      {
        code: "GAMES",
        title: "Игры",
        description: "Запуск и работа игр",
      },
    ],
    priorityFloors: [],
    scheduling: {},
  },
} as unknown as EndUserCasePolicyRevisionResponseDto;

let policy: EndUserCasePolicyResponseDto = {
  published: publishedPolicy,
  draft: undefined,
};

function caseById(id: string): EndUserCase {
  const value = mockCases.find((item) => item.id === id);
  if (!value) throw new Error("Обращение не найдено");
  return value;
}

function updateCase(
  id: string,
  patch: Partial<EndUserCase>,
  expectedVersion: number,
): EndUserCase {
  const current = caseById(id);
  if (current.version !== expectedVersion)
    throw new Error("Обращение уже изменилось");
  Object.assign(current, patch, {
    version: current.version + 1,
    updatedAt: new Date().toISOString(),
  });
  return structuredClone(current);
}

function filteredCases(filters: EndUserCaseFilters): EndUserCase[] {
  const statuses =
    filters.status?.length
      ? filters.status
      : endUserCaseStatusesForPreset(filters.preset);
  return mockCases.filter(
    (item) =>
      (!statuses || statuses.includes(item.status)) &&
      (!filters.priority?.length || filters.priority.includes(item.priority)) &&
      (!filters.assignment ||
        (filters.assignment === "ASSIGNED"
          ? Boolean(item.assignee)
          : !item.assignee)) &&
      (!filters.endUserId || item.endUser.id === filters.endUserId) &&
      (!filters.groupCode || item.groupCode === filters.groupCode),
  );
}

export const mockEndUserCasesRepository: EndUserCasesRepository = {
  async list(_projectId, filters) {
    return {
      items: structuredClone(filteredCases(filters)),
      nextCursor: null,
    };
  },
  async summary() {
    return {
      totalCount: mockCases.length,
      openCount: mockCases.filter((item) => !isTerminalEndUserCase(item.status))
        .length,
      attentionCount: mockCases.filter(
        (item) => item.status === "WAITING_ADMIN",
      ).length,
      criticalCount: mockCases.filter((item) => item.priority === "CRITICAL")
        .length,
      unassignedCount: mockCases.filter(
        (item) => !isTerminalEndUserCase(item.status) && !item.assignee,
      ).length,
      resolvedCount: mockCases.filter((item) => item.status === "RESOLVED")
        .length,
      unresolvedCount: mockCases.filter((item) => item.status === "UNRESOLVED")
        .length,
      cancelledCount: mockCases.filter((item) => item.status === "CANCELLED")
        .length,
      staleCount: mockCases.filter((item) => Boolean(item.staleAt)).length,
      degradedCount: mockCases.filter((item) => Boolean(item.degradedReason))
        .length,
      lastProjectSequence: "48",
      calculatedAt: new Date().toISOString(),
    };
  },
  async assignees() {
    return {
      items: [
        { id: "cms-1", displayName: "Алексей Владелец" },
        { id: "cms-2", displayName: "Анна Специалист" },
      ],
    };
  },
  async messages() {
    return structuredClone(messages);
  },
  async detail(_projectId, caseId, options) {
    return {
      case: structuredClone(caseById(caseId)),
      messages: structuredClone(messages),
      timeline: {
        events: [
          {
            id: "event-demo-1",
            type: "ADMIN_ATTENTION_REQUESTED",
            caseVersion: 2,
            projectSequence: "48",
            payload: {},
            createdAt: "2026-07-26T09:05:00.000Z",
          },
        ],
        revisions: [],
      },
      proposals:
        options?.includeProposals === false
          ? { items: [] }
          : {
              items: [
                {
                  id: "proposal-demo-1",
                  kind: "ADMIN_ATTENTION",
                  workflowStatus: "OPEN",
                  priority: "HIGH",
                  title: "Подключиться к обращению",
                  summary: "Пользователь явно попросил помощи администратора.",
                  version: 1,
                  createdAt: "2026-07-26T09:05:00.000Z",
                  updatedAt: "2026-07-26T09:05:00.000Z",
                },
              ],
            },
    };
  },
  async workflow(_projectId, caseId, command) {
    return updateCase(
      caseId,
      {
        status: command.status,
        ...(command.status === "RESOLVED"
          ? {
              resolvedAt: new Date().toISOString(),
              resolution: {
                assessment: "CONFIRMED_RESOLVED",
                source: "CMS_USER",
                confidence: "1",
              },
            }
          : {}),
      },
      command.expectedVersion,
    );
  },
  async assign(_projectId, caseId, command) {
    return updateCase(
      caseId,
      {
        assignee: command.assignedCmsUserId
          ? {
              id: command.assignedCmsUserId,
              displayName:
                command.assignedCmsUserId === "cms-2"
                  ? "Анна Специалист"
                  : "Алексей Владелец",
            }
          : undefined,
      },
      command.expectedVersion,
    );
  },
  async classify(_projectId, caseId, command) {
    return updateCase(
      caseId,
      {
        ...(command.groupCode ? { groupCode: command.groupCode } : {}),
        ...(command.priority ? { priority: command.priority } : {}),
        ...(command.impact ? { impact: command.impact } : {}),
        ...(command.urgency ? { urgency: command.urgency } : {}),
        ...(command.type ? { type: command.type } : {}),
      },
      command.expectedVersion,
    );
  },
  async linkMessage(_projectId, caseId, command) {
    return updateCase(caseId, {}, command.expectedVersion);
  },
  async unlinkMessage(_projectId, caseId, _messageId, command) {
    return updateCase(caseId, {}, command.expectedVersion);
  },
  async merge(_projectId, caseId, command) {
    const result = updateCase(caseId, {}, command.expectedVersion);
    return {
      caseId,
      version: result.version,
      mergedCaseIds: command.sources.map((source) => source.caseId),
    };
  },
  async split(_projectId, caseId, command) {
    const source = updateCase(caseId, {}, command.expectedVersion);
    const splitId = `case-demo-split-${source.version}`;
    mockCases.push({
      ...structuredClone(source),
      id: splitId,
      projectSequence: String(48 + source.version),
      version: 1,
      title: command.title,
      groupCode: command.groupCode ?? source.groupCode,
      status: "OPEN",
      splitFromCaseId: caseId,
      mergedIntoCaseId: null,
    });
    return {
      sourceCaseId: caseId,
      sourceVersion: source.version,
      newCaseId: splitId,
      newCaseVersion: 1,
    };
  },
  async cost() {
    return {
      requestCount: 84,
      totalTokens: "18240",
      billedCostUsd: "0.42",
      estimatedCostUsd: "0.45",
      calculatedAt: new Date().toISOString(),
      operations: [],
      budget: {
        projectDailyTokenHardCap: "250000",
        emergencyPaused: false,
        backlogCount: 0,
        oldestPendingAt: null,
        degradedReasons: [],
      },
    } as never;
  },
  async policy() {
    return structuredClone(policy);
  },
  async previewPolicy(_projectId, command) {
    return {
      compiledPolicy: {
        groups: command.groups,
        priorityFloors: command.priorityRules,
        scheduling: command.scheduling ?? {},
      },
      compiledPolicyHash: "demo-preview-hash",
      compilerVersion: "1",
      examples: [],
    } as unknown as EndUserCasePolicyPreviewResponseDto;
  },
  async savePolicy(_projectId, command) {
    const draft = {
      ...publishedPolicy,
      id: "policy-demo-draft",
      version: command.expectedVersion + 1,
      status: "DRAFT",
      publishedAt: null,
      compiledPolicy: {
        groups: command.groups,
        priorityFloors: command.priorityRules,
        scheduling: command.scheduling ?? {},
      },
    } as unknown as EndUserCasePolicyRevisionResponseDto;
    policy = { ...policy, draft: draft as never };
    return structuredClone(draft);
  },
  async publishPolicy(_projectId, command) {
    if (!policy.draft || policy.draft.version !== command.expectedVersion)
      throw new Error("Черновик уже изменился");
    const published = {
      ...policy.draft,
      status: "PUBLISHED",
      publishedAt: new Date().toISOString(),
    } as unknown as EndUserCasePolicyRevisionResponseDto;
    policy = { published, draft: undefined };
    return structuredClone(published);
  },
};

export function resetMockEndUserCases(): void {
  mockCases = structuredClone(mockSeed);
  policy = { published: publishedPolicy, draft: undefined };
}
