import type {
  EndUserCaseEscalationResponseDto,
  EndUserCaseDetailResponseDto,
  EndUserCasePolicyPreviewResponseDto,
  EndUserCasePolicyRevisionResponseDto,
  EndUserCasePolicyResponseDto,
} from "@/shared/api/generated/models";
import type { EndUserCase, EndUserCaseFilters } from "../model/end-user-case";
import {
  endUserCaseStatusesForPreset,
  isTerminalEndUserCase,
} from "../model/end-user-case";
import type { EndUserCasesRepository } from "./end-user-cases-repository";

const now = "2026-07-26T10:00:00.000Z";
const requestedEscalation: EndUserCaseEscalationResponseDto = {
  id: "escalation-demo-game",
  caseId: "case-demo-game",
  occurrenceNumber: 1,
  version: 1,
  status: "REQUESTED",
  source: "END_USER_REQUEST",
  reasonCode: "SUPPORT_REQUEST",
  summary: "Пользователь явно попросил подключить специалиста.",
  requester: { type: "END_USER", id: "usr_2" },
  requestedAt: "2026-07-26T09:05:00.000Z",
  claimant: null,
  claimedAt: null,
  closedBy: null,
  closeReason: null,
  closedAt: null,
  cancelledBy: null,
  cancellationReason: null,
  cancelledAt: null,
  notificationEventId: "notification-demo-game",
  createdAt: "2026-07-26T09:05:00.000Z",
  updatedAt: "2026-07-26T09:05:00.000Z",
};

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
  allowedActions: [
    "SET_STATUS_IN_PROGRESS",
    "SET_STATUS_RESOLVED",
    "CHANGE_CLASSIFICATION",
    "RAISE_PRIORITY",
    "LOWER_PRIORITY_TO_FLOOR",
    "REQUEST_ESCALATION",
  ],
  classification: {
    source: "AI",
    confidence: 0.91,
    evidence: [{ id: "message-demo-1", kind: "MESSAGE" }],
  },
  resolution: {
    assessment: "LIKELY_RESOLVED",
    source: "AI_INFERENCE",
    confidence: "0.780",
  },
  impact: "HIGH",
  urgency: "HIGH",
  priority: "URGENT",
  priorityPolicy: {
    effectiveFloor: "NORMAL",
    overrideActive: false,
    policyRevisionId: "policy-demo-7",
    policyVersion: 7,
    reasons: ["Финансовые обращения не могут быть ниже обычного приоритета"],
    source: "PLATFORM_RULE",
  },
  prioritySource: "PLATFORM_RULE",
  priorityReasons: ["Пользователь не получил деньги"],
  requiresSpecialist: false,
  initialTone: "CONCERNED",
  currentTone: "CALM",
  toneTrend: "IMPROVING",
  primaryLanguage: "ru",
  languages: ["ru"],
  channels: ["TEXT", "VOICE"],
  endUser: { id: "usr_1" },
  assignee: null,
  messageCount: 3,
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
      "Retenive собрала данные об устройстве и предложила безопасные шаги. Пользователь ждёт администратора.",
    status: "WAITING_ADMIN",
    requiresSpecialist: true,
    activeEscalation: {
      id: requestedEscalation.id,
      status: "REQUESTED",
      source: "END_USER_REQUEST",
      reasonCode: "SUPPORT_REQUEST",
      requestedAt: requestedEscalation.requestedAt,
      claimant: null,
      claimedAt: null,
    },
    availableStatuses: ["IN_PROGRESS", "WAITING_END_USER", "RESOLVED"],
    allowedActions: [
      "SET_STATUS_IN_PROGRESS",
      "SET_STATUS_WAITING_END_USER",
      "SET_STATUS_RESOLVED",
      "CHANGE_CLASSIFICATION",
      "RAISE_PRIORITY",
      "LOWER_PRIORITY_TO_FLOOR",
      "REQUEST_ESCALATION",
    ],
    priority: "HIGH",
    urgency: "MEDIUM",
    currentTone: "FRUSTRATED",
    toneTrend: "WORSENING",
    channels: ["TEXT"],
    endUser: { id: "usr_2" },
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
    allowedActions: [
      "SET_STATUS_OPEN",
      "CHANGE_CLASSIFICATION",
      "RAISE_PRIORITY",
      "LOWER_PRIORITY_TO_FLOOR",
    ],
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
    endUser: { id: "usr_3" },
    messageCount: 5,
    endUserRecontactCount: 1,
    resolvedAt: "2026-07-26T08:30:00.000Z",
    lastActivityAt: "2026-07-26T08:30:00.000Z",
  },
];

let mockCases = structuredClone(mockSeed);
const mockEscalations = [structuredClone(requestedEscalation)];
type MockTimelineEvent = {
  id: string;
  caseId: string;
  type:
    | "ADMIN_ATTENTION_REQUESTED"
    | "ADMIN_ATTENTION_CLAIMED"
    | "STATUS_CHANGED"
    | "CORRECTED";
  caseVersion: number;
  projectSequence: string;
  actor: { type: "CMS_USER" | "SYSTEM"; cmsUserId: string | null };
  reason: string | null;
  previous: Record<string, unknown> | null;
  next: Record<string, unknown> | null;
  createdAt: string;
};
const mockTimelineSeed: MockTimelineEvent[] = [
  {
    id: "event-demo-game-requested",
    caseId: "case-demo-game",
    type: "ADMIN_ATTENTION_REQUESTED",
    caseVersion: 1,
    projectSequence: "47",
    actor: { type: "SYSTEM", cmsUserId: null },
    reason: "Пользователь запросил поддержку",
    previous: null,
    next: { status: "WAITING_ADMIN" },
    createdAt: requestedEscalation.requestedAt,
  },
];
let mockTimelineEvents = structuredClone(mockTimelineSeed);

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

function exactCaseById(id: string): EndUserCaseDetailResponseDto {
  const value = caseById(id);
  if (!value.allowedActions || !value.priorityPolicy)
    throw new Error("Mock Case detail is missing server action authority");
  return value as EndUserCaseDetailResponseDto;
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

function escalationById(id: string): EndUserCaseEscalationResponseDto {
  const value = mockEscalations.find((item) => item.id === id);
  if (!value) throw new Error("Эскалация не найдена");
  return value;
}

function updateEscalation(
  id: string,
  expectedVersion: number,
  patch: Partial<EndUserCaseEscalationResponseDto>,
): EndUserCaseEscalationResponseDto {
  const current = escalationById(id);
  if (current.version !== expectedVersion)
    throw new Error("Эскалация уже изменена");
  Object.assign(current, patch, {
    version: current.version + 1,
    updatedAt: new Date().toISOString(),
  });
  return structuredClone(current);
}

function filteredCases(filters: EndUserCaseFilters): EndUserCase[] {
  const statuses = filters.status?.length
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
  async detail(_projectId, caseId) {
    return {
      case: structuredClone(exactCaseById(caseId)),
      messages: structuredClone(messages),
      timeline: {
        events: structuredClone(
          mockTimelineEvents
            .filter((event) => event.caseId === caseId)
            .map(
              ({
                id,
                type,
                caseVersion,
                projectSequence,
                actor,
                reason,
                previous,
                next,
                createdAt,
              }) => ({
                id,
                type,
                caseVersion,
                projectSequence,
                actor,
                reason,
                previous,
                next,
                createdAt,
              }),
            ),
        ),
        revisions: [],
      },
      escalations: {
        items: structuredClone(
          mockEscalations.filter((item) => item.caseId === caseId),
        ),
      },
    };
  },
  async workflow(_projectId, caseId, command) {
    const previous = structuredClone(caseById(caseId));
    const value = updateCase(
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
    mockTimelineEvents.push({
      id: `event-${caseId}-status-${value.version}`,
      caseId,
      type: "STATUS_CHANGED",
      caseVersion: value.version,
      projectSequence: value.projectSequence,
      actor: { type: "CMS_USER", cmsUserId: "cms-1" },
      reason: command.reason,
      previous: { status: previous.status },
      next: { status: value.status },
      createdAt: value.updatedAt,
    });
    return value;
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
    const previous = structuredClone(caseById(caseId));
    const value = updateCase(
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
    mockTimelineEvents.push({
      id: `event-${caseId}-classification-${value.version}`,
      caseId,
      type: "CORRECTED",
      caseVersion: value.version,
      projectSequence: value.projectSequence,
      actor: { type: "CMS_USER", cmsUserId: "cms-1" },
      reason: command.reason,
      previous: {
        groupCode: previous.groupCode,
        type: previous.type,
        impact: previous.impact,
        urgency: previous.urgency,
        priority: previous.priority,
      },
      next: {
        groupCode: value.groupCode,
        type: value.type,
        impact: value.impact,
        urgency: value.urgency,
        priority: value.priority,
      },
      createdAt: value.updatedAt,
    });
    return value;
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
  async requestEscalation(_projectId, caseId, command) {
    const existing = mockEscalations.find(
      (item) =>
        item.caseId === caseId &&
        (item.status === "REQUESTED" || item.status === "CLAIMED"),
    );
    if (existing)
      return {
        escalation: structuredClone(existing),
        caseVersion: caseById(caseId).version,
        replayed: true,
      };
    const requestedAt = new Date().toISOString();
    const escalation: EndUserCaseEscalationResponseDto = {
      ...structuredClone(requestedEscalation),
      id: `escalation-demo-${caseId}-${mockEscalations.length + 1}`,
      caseId,
      occurrenceNumber:
        mockEscalations.filter((item) => item.caseId === caseId).length + 1,
      source: "CMS_USER",
      reasonCode: command.reasonCode,
      summary: command.summary,
      requester: { type: "CMS_USER", id: "cms-1" },
      requestedAt,
      createdAt: requestedAt,
      updatedAt: requestedAt,
      notificationEventId: `notification-${caseId}-${mockEscalations.length + 1}`,
    };
    mockEscalations.push(escalation);
    const value = updateCase(
      caseId,
      {
        status: "WAITING_ADMIN",
        requiresSpecialist: true,
        assignee: undefined,
        activeEscalation: {
          id: escalation.id,
          status: "REQUESTED",
          source: escalation.source,
          reasonCode: escalation.reasonCode,
          requestedAt,
          claimant: null,
          claimedAt: null,
        },
      },
      command.expectedCaseVersion,
    );
    mockTimelineEvents.push({
      id: `event-${escalation.id}-requested`,
      caseId,
      type: "ADMIN_ATTENTION_REQUESTED",
      caseVersion: value.version,
      projectSequence: value.projectSequence,
      actor: { type: "CMS_USER", cmsUserId: "cms-1" },
      reason: command.summary,
      previous: null,
      next: { status: "WAITING_ADMIN" },
      createdAt: requestedAt,
    });
    return {
      escalation: structuredClone(escalation),
      caseVersion: value.version,
      replayed: false,
    };
  },
  async claimEscalation(_projectId, caseId, escalationId, command) {
    const claimedAt = new Date().toISOString();
    const escalation = updateEscalation(
      escalationId,
      command.expectedEscalationVersion,
      {
        status: "CLAIMED",
        claimant: { id: "cms-1", displayName: "Алексей Владелец" },
        claimedAt,
      },
    );
    const value = updateCase(
      caseId,
      {
        status: "IN_PROGRESS",
        requiresSpecialist: true,
        assignee: escalation.claimant ?? undefined,
        activeEscalation: {
          id: escalation.id,
          status: "CLAIMED",
          source: escalation.source,
          reasonCode: escalation.reasonCode,
          requestedAt: escalation.requestedAt,
          claimant: escalation.claimant,
          claimedAt,
        },
      },
      command.expectedCaseVersion,
    );
    mockTimelineEvents.push({
      id: `event-${escalation.id}-claimed`,
      caseId,
      type: "ADMIN_ATTENTION_CLAIMED",
      caseVersion: value.version,
      projectSequence: value.projectSequence,
      actor: { type: "CMS_USER", cmsUserId: "cms-1" },
      reason: "Эскалация принята оператором",
      previous: { status: "WAITING_ADMIN" },
      next: { status: "IN_PROGRESS" },
      createdAt: claimedAt,
    });
    return { escalation, caseVersion: value.version, replayed: false };
  },
  async releaseEscalation(_projectId, caseId, escalationId, command) {
    const escalation = updateEscalation(
      escalationId,
      command.expectedEscalationVersion,
      { status: "REQUESTED", claimant: null, claimedAt: null },
    );
    const value = updateCase(
      caseId,
      {
        status: "WAITING_ADMIN",
        assignee: undefined,
        activeEscalation: {
          id: escalation.id,
          status: "REQUESTED",
          source: escalation.source,
          reasonCode: escalation.reasonCode,
          requestedAt: escalation.requestedAt,
          claimant: null,
          claimedAt: null,
        },
      },
      command.expectedCaseVersion,
    );
    return { escalation, caseVersion: value.version, replayed: false };
  },
  async transferEscalation(_projectId, caseId, escalationId, command) {
    const claimant = {
      id: command.cmsUserId,
      displayName:
        command.cmsUserId === "cms-2" ? "Анна Специалист" : "Алексей Владелец",
    };
    const escalation = updateEscalation(
      escalationId,
      command.expectedEscalationVersion,
      { claimant },
    );
    const value = updateCase(
      caseId,
      {
        assignee: claimant,
        activeEscalation: {
          ...caseById(caseId).activeEscalation!,
          claimant,
        },
      },
      command.expectedCaseVersion,
    );
    return { escalation, caseVersion: value.version, replayed: false };
  },
  async closeEscalation(_projectId, caseId, escalationId, command) {
    const closedAt = new Date().toISOString();
    const escalation = updateEscalation(
      escalationId,
      command.expectedEscalationVersion,
      {
        status: "CLOSED",
        claimant: null,
        claimedAt: null,
        closeReason: command.reason,
        closedAt,
        closedBy: { type: "CMS_USER", id: "cms-1" },
      },
    );
    const value = updateCase(
      caseId,
      {
        status: command.nextCaseStatus,
        requiresSpecialist: false,
        activeEscalation: undefined,
      },
      command.expectedCaseVersion,
    );
    return { escalation, caseVersion: value.version, replayed: false };
  },
  async cancelEscalation(_projectId, caseId, escalationId, command) {
    const cancelledAt = new Date().toISOString();
    const escalation = updateEscalation(
      escalationId,
      command.expectedEscalationVersion,
      {
        status: "CANCELLED",
        claimant: null,
        claimedAt: null,
        cancellationReason: command.reason,
        cancelledAt,
        cancelledBy: { type: "CMS_USER", id: "cms-1" },
      },
    );
    const value = updateCase(
      caseId,
      {
        status: command.nextCaseStatus,
        requiresSpecialist: false,
        activeEscalation: undefined,
      },
      command.expectedCaseVersion,
    );
    return { escalation, caseVersion: value.version, replayed: false };
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
  mockTimelineEvents = structuredClone(mockTimelineSeed);
  mockEscalations.splice(
    0,
    mockEscalations.length,
    structuredClone(requestedEscalation),
  );
  policy = { published: publishedPolicy, draft: undefined };
}
