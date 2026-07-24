import {
  integrationActivityContent,
  integrationActivityGet,
  integrationActivityList,
} from "@/shared/api/generated/lola-backend";
import type {
  IntegrationActivityContentResponseDto,
  IntegrationActivityDetailResponseDto,
  IntegrationActivityItemDto,
  IntegrationActivityListParams,
} from "@/shared/api/generated/models";
import type {
  IntegrationActivityContent,
  IntegrationActivityDetail,
  IntegrationActivityFilters,
  IntegrationActivityItem,
  IntegrationActivityRepository,
} from "../model/integration-activity";

const nullable = <T>(value: T | null | undefined): T | null => value ?? null;

function mapItem(dto: IntegrationActivityItemDto): IntegrationActivityItem {
  return {
    id: dto.id,
    provider: dto.provider,
    activityType: dto.activityType,
    status: dto.status,
    state: dto.state,
    endUser: dto.endUser,
    origin: { kind: dto.origin.kind, id: nullable(dto.origin.id) },
    attemptCount: dto.attemptCount,
    errorCode: nullable(dto.errorCode),
    contentState: dto.contentState,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    finishedAt: nullable(dto.finishedAt),
  };
}

function mapDetail(
  dto: IntegrationActivityDetailResponseDto,
): IntegrationActivityDetail {
  return {
    ...mapItem(dto),
    sourceResourceKind: dto.sourceResourceKind,
    sourceResourceId: dto.sourceResourceId,
    requestId: nullable(dto.requestId),
    correlationId: nullable(dto.correlationId),
    conversationId: nullable(dto.conversationId),
    scenarioRunId: nullable(dto.scenarioRunId),
    attempts: dto.attempts.map((attempt) => ({
      attemptNumber: attempt.attemptNumber,
      outcome: attempt.outcome,
      errorCode: nullable(attempt.errorCode),
      retryAfterMs: nullable(attempt.retryAfterMs),
      startedAt: attempt.startedAt,
      finishedAt: attempt.finishedAt,
    })),
    milestones: dto.milestones,
  };
}

function mapContent(
  dto: IntegrationActivityContentResponseDto,
): IntegrationActivityContent {
  return {
    state: dto.state,
    kind: dto.kind,
    text: nullable(dto.text),
    attachment: dto.attachment
      ? {
          kind: dto.attachment.kind,
          mimeType: dto.attachment.mimeType,
          filename: dto.attachment.filename,
          sizeBytes: dto.attachment.sizeBytes,
        }
      : null,
    redactedAt: nullable(dto.redactedAt),
  };
}

function toParams(
  filters: IntegrationActivityFilters,
): IntegrationActivityListParams {
  return {
    ...filters,
    provider: filters.provider as IntegrationActivityListParams["provider"],
  };
}

export const apiIntegrationActivityRepository: IntegrationActivityRepository = {
  async list(projectId, filters = {}) {
    const response = await integrationActivityList(
      projectId,
      toParams(filters),
      { paramsSerializer: { indexes: null } },
    );
    return {
      items: response.items.map(mapItem),
      nextCursor: response.pageInfo.nextCursor ?? null,
    };
  },
  async get(projectId, activityId) {
    return mapDetail(await integrationActivityGet(projectId, activityId));
  },
  async content(projectId, activityId) {
    return mapContent(await integrationActivityContent(projectId, activityId));
  },
};
