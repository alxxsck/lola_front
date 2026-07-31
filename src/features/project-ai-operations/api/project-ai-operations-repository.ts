import {
  aiOperationsAccessHistory,
  aiOperationsDetail,
  aiOperationsList,
  aiOperationsSubjects,
  aiOperationsSummary,
} from "@/shared/api/generated/lola-backend";
import type {
  AiOperationDetailResponseDto,
  AiOperationListItemDto,
  AiOperationListResponseDto,
  AiOperationProtectedAccessPageResponseDto,
  AiOperationsAccessHistoryParams,
  AiOperationsDetailParams,
  AiOperationsListParams,
  AiOperationsSubjectsParams,
  AiOperationsSummaryParams,
  AiOperationSubjectPageResponseDto,
  AiOperationSummaryResponseDto,
} from "@/shared/api/generated/models";
import { isMockMode } from "@/shared/config/data-mode";

export interface ProjectAIOperationsRepository {
  list(
    projectId: string,
    params?: AiOperationsListParams,
  ): Promise<AiOperationListResponseDto>;
  summary(
    projectId: string,
    params: AiOperationsSummaryParams,
  ): Promise<AiOperationSummaryResponseDto>;
  detail(
    projectId: string,
    operationId: string,
    params?: AiOperationsDetailParams,
  ): Promise<AiOperationDetailResponseDto>;
  subjects(
    projectId: string,
    operationId: string,
    params?: AiOperationsSubjectsParams,
  ): Promise<AiOperationSubjectPageResponseDto>;
  accessHistory(
    projectId: string,
    operationId: string,
    params?: AiOperationsAccessHistoryParams,
  ): Promise<AiOperationProtectedAccessPageResponseDto>;
}

const apiRepository: ProjectAIOperationsRepository = {
  list: aiOperationsList,
  summary: aiOperationsSummary,
  detail: aiOperationsDetail,
  subjects: aiOperationsSubjects,
  accessHistory: aiOperationsAccessHistory,
};

const now = new Date();
const hourAgo = new Date(now.getTime() - 60 * 60 * 1_000);
const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1_000);

const mockItems: AiOperationListItemDto[] = [
  {
    operationId: "mock-operation-analysis",
    projectSequence: "2241",
    rootCorrelationId: "7cd186aa-b80d-46be-9348-d13a3f7c7d21",
    parentOperationId: null,
    category: "AI_ANALYSIS",
    status: "SUCCEEDED",
    title: "Депозиты по GEO за вчера",
    sourceKind: "AI_ANALYSIS_RUN",
    sourceId: "mock-analysis-run",
    initiator: {
      type: "CMS_USER",
      id: "cms-admin-4a17",
      displayName: "Алексей Голубев",
    },
    chargedAccount: "PROJECT_BUDGET",
    responsibleCmsUserId: "cms-admin-4a17",
    responsibleCmsUserDisplayName: "Алексей Голубев",
    authorizedByCmsUserId: null,
    authorizedByCmsUserDisplayName: null,
    chargedEndUserId: null,
    subjectSummary: { availability: "EXACT", count: 3 },
    resultReference: {
      kind: "AI_ANALYSIS",
      id: "mock-analysis",
      endUserId: null,
    },
    usageRecords: 2,
    cost: {
      providerReportedCost: "0.0245",
      estimatedFallbackCost: "0",
      effectiveCost: "0.0245",
      state: "KNOWN",
      unknownUsageRecords: 0,
      reservedCostUsdTicks: "0",
    },
    dbWorkUnits: "1280",
    limitationCodes: [],
    startedAt: hourAgo.toISOString(),
    completedAt: new Date(hourAgo.getTime() + 48_000).toISOString(),
  },
  {
    operationId: "mock-operation-chat",
    projectSequence: "2240",
    rootCorrelationId: "3857e6c9-79ec-4c51-827c-d3f82bc669fb",
    parentOperationId: null,
    category: "CHAT",
    status: "SUCCEEDED",
    title: "Ответ пользователю в чате",
    sourceKind: "CONVERSATION_TURN",
    sourceId: "mock-conversation-turn",
    initiator: {
      type: "END_USER",
      id: "end-user-maxim",
      displayName: "Максим",
    },
    chargedAccount: "END_USER_ALLOWANCE",
    responsibleCmsUserId: null,
    responsibleCmsUserDisplayName: null,
    authorizedByCmsUserId: null,
    authorizedByCmsUserDisplayName: null,
    chargedEndUserId: "end-user-maxim",
    subjectSummary: { availability: "EXACT", count: 1 },
    resultReference: {
      kind: "CONVERSATION",
      id: "mock-conversation",
      endUserId: "end-user-maxim",
    },
    usageRecords: 1,
    cost: {
      providerReportedCost: "0.0042",
      estimatedFallbackCost: "0",
      effectiveCost: "0.0042",
      state: "KNOWN",
      unknownUsageRecords: 0,
      reservedCostUsdTicks: "0",
    },
    dbWorkUnits: "0",
    limitationCodes: [],
    startedAt: yesterday.toISOString(),
    completedAt: new Date(yesterday.getTime() + 9_000).toISOString(),
  },
];

const mockRepository: ProjectAIOperationsRepository = {
  async list(_projectId, params) {
    const filtered = mockItems.filter((item) => {
      if (params?.status && item.status !== params.status) return false;
      if (params?.category && item.category !== params.category) return false;
      if (
        params?.responsibleCmsUserId &&
        item.responsibleCmsUserId !== params.responsibleCmsUserId
      )
        return false;
      if (
        params?.chargedEndUserId &&
        item.chargedEndUserId !== params.chargedEndUserId
      )
        return false;
      if (
        params?.chargedAccount &&
        item.chargedAccount !== params.chargedAccount
      )
        return false;
      return true;
    });
    return { items: filtered, pageInfo: { hasMore: false, nextCursor: null } };
  },
  async summary(_projectId, params) {
    const list = await this.list(_projectId, params);
    const effectiveCost = list.items
      .reduce((sum, item) => sum + Number(item.cost?.effectiveCost ?? "0"), 0)
      .toFixed(4);
    return {
      operations: list.items.length,
      rootOperations: list.items.length,
      usageRecords: list.items.reduce(
        (sum, item) => sum + item.usageRecords,
        0,
      ),
      cost: {
        providerReportedCost: effectiveCost,
        estimatedFallbackCost: "0",
        effectiveCost,
        state: "KNOWN",
        unknownUsageRecords: 0,
        reservedCostUsdTicks: "0",
      },
      dbWorkUnits: "1280",
      byStatus: [{ key: "SUCCEEDED", operations: list.items.length }],
      byChargedAccount: [],
      byProvider: [],
      byCategory: [],
      byResponsibleCmsUser: [
        {
          cmsUserId: "cms-admin-4a17",
          displayName: "Алексей Голубев",
          operations: 1,
          usageRecords: 2,
          cost: {
            providerReportedCost: "0.0245",
            estimatedFallbackCost: "0",
            effectiveCost: "0.0245",
            state: "KNOWN",
            unknownUsageRecords: 0,
            reservedCostUsdTicks: "0",
          },
          dbWorkUnits: "1280",
        },
      ],
      byChargedEndUser: [],
      byModel: [],
      byPeriod: [],
      breakdownLimits: {
        maxHighCardinalityItems: 100,
        responsibleCmsUsersTruncated: false,
        chargedEndUsersTruncated: false,
        modelsTruncated: false,
      },
    };
  },
  async detail(_projectId, operationId) {
    const item =
      mockItems.find((candidate) => candidate.operationId === operationId) ??
      mockItems[0]!;
    return {
      ...item,
      purpose:
        "Ответить на запрос с проверяемой атрибуцией и bounded data access",
      outcomeCode: "COMPLETED",
      restrictedSections: [],
      timeline: [
        {
          sequence: "1",
          kind: "ROOT",
          occurredAt: item.startedAt,
          eventType: "OPERATION_STARTED",
          actor: item.initiator,
          status: "STARTED",
          modelAttempt: null,
          toolCall: null,
          dataAccess: null,
        },
        {
          sequence: "2",
          kind: "DATA_ACCESS",
          occurredAt: new Date(
            new Date(item.startedAt).getTime() + 12_000,
          ).toISOString(),
          eventType: "DATA_ACCESS_COMPLETED",
          actor: { type: "SYSTEM", id: null, displayName: "Lola runtime" },
          status: "SUCCEEDED",
          name: "query_project_data_v1",
          summary: "Агрегация deposit.completed по GEO",
          modelAttempt: null,
          toolCall: null,
          dataAccess: {
            bytesRead: "18640",
            complete: true,
            groupsReturned: 3,
            limitationCodes: [],
            rangeEndedAt: now.toISOString(),
            rangeStartedAt: yesterday.toISOString(),
            rowsRead: 1280,
            sourceReceiptId: "mock-query-receipt",
            sourceType: "PROJECT_ANALYSIS_QUERY",
            toolCallStepId: "mock-tool-step",
            truncated: false,
            workUnits: "1280",
          },
        },
      ],
      timelinePageInfo: { hasMore: false, nextCursor: null },
      usage: {
        attempts: [],
        pageInfo: { hasMore: false, nextCursor: null },
        totals: item.cost ?? null,
      },
    };
  },
  async subjects() {
    return {
      availability: "EXACT",
      manifest: {
        manifestId: "mock-manifest",
        sourceDataAccessReceiptStepIds: ["mock-query-receipt"],
        state: "SEALED",
        snapshotKind: "EVENT_RECEIVED_AT",
        snapshotReference: now.toISOString(),
        subjectCount: 2,
        complete: true,
        sealedAt: now.toISOString(),
        redactedAt: null,
      },
      items: [
        {
          subjectRowId: "mock-subject-1",
          endUserId: "end-user-maxim",
          subjectReference: "end-user-maxim",
          charged: false,
          roles: ["DATA_CONTRIBUTOR"],
          redactedAt: null,
        },
        {
          subjectRowId: "mock-subject-2",
          endUserId: "end-user-2",
          subjectReference: "end-user-2",
          charged: false,
          roles: ["DATA_CONTRIBUTOR"],
          redactedAt: null,
        },
      ],
      pageInfo: { hasMore: false, nextCursor: null },
    };
  },
  async accessHistory() {
    return {
      items: [
        {
          accessEventId: "mock-access-event",
          accessKind: "COST",
          actor: {
            type: "CMS_USER",
            cmsUserId: "cms-admin-4a17",
            displayName: "Алексей Голубев",
            externalId: null,
          },
          outcome: "SUCCESS",
          requiredPermissionCode: "project.ai_analysis_cost.read",
          requestId: "3dcaf386-2f46-4d0f-8392-1acd08ee3d3b",
          correlationId: null,
          occurredAt: now.toISOString(),
        },
      ],
      pageInfo: { hasMore: false, nextCursor: null },
    };
  },
};

export const projectAIOperationsRepository = isMockMode
  ? mockRepository
  : apiRepository;
