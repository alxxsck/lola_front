import {
  projectAIAnalysisCancel,
  projectAIAnalysisDetail,
  projectAIAnalysisList,
} from "@/shared/api/generated/lola-backend";
import type {
  ProjectAIAnalysisDetailResponseDto,
  ProjectAIAnalysisListParams,
  ProjectAIAnalysisListResponseDto,
  ProjectAIAnalysisReceiptDto,
} from "@/shared/api/generated/models";
import { isMockMode } from "@/shared/config/data-mode";

export interface CancelProjectAIAnalysisCommand {
  projectId: string;
  analysisId: string;
  version: number;
  idempotencyKey: string;
}

export interface ProjectAIAnalysesRepository {
  list(
    projectId: string,
    params?: ProjectAIAnalysisListParams,
  ): Promise<ProjectAIAnalysisListResponseDto>;
  detail(
    projectId: string,
    analysisId: string,
  ): Promise<ProjectAIAnalysisDetailResponseDto>;
  cancel(
    command: CancelProjectAIAnalysisCommand,
  ): Promise<ProjectAIAnalysisReceiptDto>;
}

const apiRepository: ProjectAIAnalysesRepository = {
  list: projectAIAnalysisList,
  detail: projectAIAnalysisDetail,
  cancel: (command) =>
    projectAIAnalysisCancel(command.projectId, command.analysisId, {
      headers: {
        "Idempotency-Key": command.idempotencyKey,
        "If-Match": `"${command.version}"`,
      },
    }),
};

const now = new Date();
const scheduledAt = new Date(now.getTime() + 4 * 60 * 60 * 1_000);
const succeededAt = new Date(now.getTime() - 55 * 60 * 1_000);

const mockItems: ProjectAIAnalysisListResponseDto["items"] = [
  {
    analysisId: "mock-analysis-scheduled",
    complete: false,
    createdAt: now.toISOString(),
    createdByCmsUserId: "cms-admin-9f21",
    endUserId: null,
    eventCodes: [],
    hasLimitations: false,
    kind: "SCHEDULED_ONCE",
    projectSequence: "1042",
    questionPreview: "Сколько депозитов завершили пользователи за вчера?",
    schedule: {
      dstDisambiguation: "EXACT",
      localDateTime: "2026-07-31T12:00:00",
      nextRunAt: scheduledAt.toISOString(),
      runAt: scheduledAt.toISOString(),
      scheduleId: "mock-schedule",
      scheduleSpecVersion: 1,
      scheduleType: "ONCE",
      state: "ACTIVE",
      timezone: "Europe/Madrid",
    },
    scopeKind: "PROJECT",
    state: "ACTIVE",
    title: "Ежедневный итог по депозитам",
    version: 1,
  },
  {
    analysisId: "mock-analysis-succeeded",
    complete: true,
    createdAt: succeededAt.toISOString(),
    createdByCmsUserId: "cms-admin-4a17",
    endUserId: null,
    eventCodes: ["deposit.completed"],
    hasLimitations: false,
    kind: "ONE_OFF",
    latestRun: {
      actualAiCostUsdTicks: "245000000",
      actualDbWorkUnits: "1280",
      analysisId: "mock-analysis-succeeded",
      complete: true,
      completedAt: succeededAt.toISOString(),
      costAttributedToCmsUserId: "cms-admin-4a17",
      costStatus: "PROVIDER_REPORTED_USAGE",
      eventCodes: ["deposit.completed"],
      hasLimitations: false,
      limitationCodes: [],
      limitations: [],
      modelAttempts: 2,
      rootAiOperationId: "mock-operation-2026",
      runId: "mock-run-succeeded",
      status: "SUCCEEDED",
      version: 2,
    },
    projectSequence: "1041",
    questionPreview: "Покажи завершённые депозиты по GEO за вчера.",
    scopeKind: "PROJECT",
    state: "COMPLETED",
    title: "Депозиты по GEO",
    version: 2,
  },
];

const mockRepository: ProjectAIAnalysesRepository = {
  async list(_projectId, params) {
    const items = mockItems.filter((item) => {
      if (params?.status === "SCHEDULED") return Boolean(item.schedule);
      if (params?.status && item.latestRun?.status !== params.status)
        return false;
      if (params?.scopeKind && item.scopeKind !== params.scopeKind)
        return false;
      if (params?.kind && item.kind !== params.kind) return false;
      if (
        params?.eventCode &&
        !item.eventCodes.some((code) => code.includes(params.eventCode!))
      )
        return false;
      return true;
    });
    return { items, nextCursor: null };
  },
  async detail(_projectId, analysisId) {
    const item =
      mockItems.find((candidate) => candidate.analysisId === analysisId) ??
      mockItems[0]!;
    const run = item.latestRun;
    return {
      analysis: {
        analysisId: item.analysisId,
        createdAt: item.createdAt,
        createdByCmsUserId: item.createdByCmsUserId,
        endUserId: item.endUserId,
        kind: item.kind,
        latestRunId: run?.runId,
        projectSequence: item.projectSequence,
        question: item.questionPreview,
        rootAiOperationId: run?.rootAiOperationId,
        scopeKind: item.scopeKind,
        state: item.state,
        title: item.title,
        updatedAt: run?.completedAt ?? item.createdAt,
        version: item.version,
      },
      runs: run
        ? [
            {
              actualAiCostUsdTicks: run.actualAiCostUsdTicks,
              actualDbWorkUnits: run.actualDbWorkUnits,
              attemptNumber: 1,
              budgetReconciliationPending: false,
              capabilitySetRevision: "b".repeat(64),
              catalogRevisionDigest: "c".repeat(64),
              catalogRevisionId: "mock-catalog-revision",
              costAttributedToCmsUserId: run.costAttributedToCmsUserId,
              costStatus: run.costStatus ?? "UNKNOWN",
              costStatuses: run.costStatuses ?? [],
              createdAt: item.createdAt,
              initiatedBy: "CMS_USER",
              initiatedByCmsUserId: item.createdByCmsUserId,
              limitationCodes: [],
              limitations: [],
              model: "grok-4.5",
              provider: "xAI",
              providerResponseIds: ["mock-provider-response"],
              queryPolicyRevisionId: "mock-query-policy-revision",
              receipts: [
                {
                  complete: true,
                  createdAt: item.createdAt,
                  durationMs: 182,
                  examinedRows: 1280,
                  groups: 3,
                  id: "mock-receipt",
                  limitationCodes: [],
                  limitations: [],
                  matchedEndUserCount: "12",
                  matchedEndUserCountExact: true,
                  ordinal: 1,
                  queryHash: "a".repeat(64),
                  rangeEndedAt: now.toISOString(),
                  rangeStartedAt: new Date(
                    now.getTime() - 24 * 60 * 60 * 1_000,
                  ).toISOString(),
                  resultRows: 3,
                  runId: run.runId ?? "mock-run",
                  serializedBytes: 420,
                  status: "ACCEPTED",
                  truncated: false,
                  workUnits: "1280",
                },
              ],
              result: {
                title: item.title,
                answer:
                  "Вчера депозит завершили 12 пользователей. Наибольшая доля пришлась на ES.",
                table: {
                  columns: [
                    { key: "geo", label: "GEO" },
                    { key: "users", label: "Пользователи" },
                    { key: "amount", label: "Сумма" },
                  ],
                  rows: [
                    { cells: ["ES", "7", "€4 820"] },
                    { cells: ["PT", "3", "€1 940"] },
                    { cells: ["DE", "2", "€1 120"] },
                  ],
                },
                interpretedScope: {
                  kind: "PROJECT",
                  description: "Все пользователи проекта",
                },
                interpretedTime: {
                  from: new Date(
                    now.getTime() - 24 * 60 * 60 * 1_000,
                  ).toISOString(),
                  to: now.toISOString(),
                  timezone: "Europe/Madrid",
                },
                definitions: [
                  {
                    kind: "EVENT",
                    code: "deposit.completed",
                    description:
                      "Событие приходит после успешного завершения депозита.",
                  },
                  {
                    kind: "EVENT_FIELD",
                    code: "geo",
                    eventCode: "deposit.completed",
                    description: "География пользователя в момент депозита.",
                  },
                ],
                receiptOrdinals: [1],
                completeness: "COMPLETE",
                limitations: [],
                actors: {
                  createdByCmsUserId: item.createdByCmsUserId,
                  costAttributedToCmsUserId: run.costAttributedToCmsUserId,
                },
                provenance: {
                  catalogRevisionId: "mock-catalog-revision",
                  catalogRevisionDigest: "c".repeat(64),
                  queryPolicyRevisionId: "mock-query-policy-revision",
                  queryReceipts: [
                    {
                      id: "mock-receipt",
                      ordinal: 1,
                      queryHash: "a".repeat(64),
                      complete: true,
                      truncated: false,
                    },
                  ],
                  aiOperationId: run.rootAiOperationId,
                },
              },
              rootAiOperationId: run.rootAiOperationId,
              runId: run.runId ?? "mock-run",
              status: "SUCCEEDED",
              updatedAt: run.completedAt ?? item.createdAt,
            },
          ]
        : [],
      schedule: item.schedule ?? null,
      subjectEvidence: { runId: run?.runId, total: run ? 12 : 0 },
    };
  },
  async cancel({ analysisId }: CancelProjectAIAnalysisCommand) {
    const item = mockItems.find(
      (candidate) => candidate.analysisId === analysisId,
    );
    if (item) {
      item.state = "CANCELLED";
      if (item.schedule) item.schedule.state = "CANCELLED";
    }
    return {
      analysisId,
      runId: null,
      status: "CANCELLED",
      replayed: false,
      version: 2,
    };
  },
};

export const projectAIAnalysesRepository = isMockMode
  ? mockRepository
  : apiRepository;
