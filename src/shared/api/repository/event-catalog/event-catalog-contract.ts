import type {
  ArchiveEventDefinitionDto,
  CreateEventDefinitionDto,
  EventCatalogDeleteEventDefinitionParams,
  EventDefinitionCatalogResponseDto,
  EventDefinitionRevisionPageResponseDto,
  EventDefinitionRevisionResponseDto,
  EventDefinitionUsageResponseDto,
  RestoreEventDefinitionDto,
  UpdateEventDefinitionMetadataDto,
  UpdateEventIngestionPolicyDto,
} from "@/shared/api/generated/models";

export type EventDefinitionLifecycle = "ACTIVE" | "ARCHIVED";

export interface EventCatalogDefinition {
  definitionKeyId: string;
  projectId: string;
  code: string;
  lifecycle: EventDefinitionLifecycle;
  lifecycleVersion: number;
  lifecycleUpdatedAt: string;
  metadata: {
    name: string;
    description: string | null;
    concurrencyToken: string;
  };
  policy: {
    version: number;
    updatedAt: string;
    enabled: boolean;
    clientIngestible: boolean;
    countsAsActivity: boolean;
  };
  currentSchema: {
    revisionId: string;
    revisionNumber: number;
    payloadSchema: Record<string, unknown>;
    publishedAt: string;
  };
  origin: EventDefinitionCatalogResponseDto["origin"];
  readOnly: boolean;
}

export type EventDefinitionUsage = EventDefinitionUsageResponseDto;
export type EventDefinitionRevision = EventDefinitionRevisionResponseDto;
export type EventDefinitionRevisionPage =
  EventDefinitionRevisionPageResponseDto;
export type CreateEventDefinitionCommand = CreateEventDefinitionDto;
export type UpdateEventMetadataCommand = UpdateEventDefinitionMetadataDto;
export type UpdateEventPolicyCommand = UpdateEventIngestionPolicyDto;
export type ArchiveEventDefinitionCommand = ArchiveEventDefinitionDto;
export type RestoreEventDefinitionCommand = RestoreEventDefinitionDto;
export type DeleteEventDefinitionCommand =
  EventCatalogDeleteEventDefinitionParams;

export interface EventMetadataUpdateResult {
  definitionKeyId: string;
  code: string;
  metadata: EventCatalogDefinition["metadata"];
  currentRevisionId: string | null;
  metadataChanged: boolean;
  schemaRevisionUnchanged: boolean;
}

export function toEventCatalogDefinition(
  dto: EventDefinitionCatalogResponseDto,
): EventCatalogDefinition {
  if (!dto.currentRevision) {
    throw new Error(
      `Event Definition ${dto.id} has no current schema revision`,
    );
  }
  return {
    definitionKeyId: dto.id,
    projectId: dto.projectId,
    code: dto.code,
    lifecycle: dto.lifecycle,
    lifecycleVersion: dto.lifecycleVersion,
    lifecycleUpdatedAt: dto.lifecycleUpdatedAt,
    metadata: {
      name: dto.name,
      description: dto.description,
      concurrencyToken: dto.metadataUpdatedAt,
    },
    policy: dto.policy,
    currentSchema: {
      revisionId: dto.currentRevision.id,
      revisionNumber: dto.currentRevision.number,
      payloadSchema: dto.currentRevision.payloadSchema,
      publishedAt: dto.currentRevision.publishedAt,
    },
    origin: dto.origin,
    readOnly: dto.readOnly,
  };
}

export function applyEventMetadataUpdate(
  current: EventCatalogDefinition,
  result: EventMetadataUpdateResult,
): EventCatalogDefinition {
  const responseTime = Date.parse(result.metadata.concurrencyToken);
  const currentTime = Date.parse(current.metadata.concurrencyToken);
  if (
    result.definitionKeyId !== current.definitionKeyId ||
    result.code !== current.code ||
    responseTime < currentTime
  ) {
    return current;
  }
  return { ...current, metadata: result.metadata };
}
