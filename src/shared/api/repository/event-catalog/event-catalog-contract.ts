import type {
  EventDefinitionMetadataMutationResponseDto,
  EventDefinitionResponseDto,
  UpdateEventDefinitionMetadataDto,
} from "@/shared/api/generated/models";

export interface EventCatalogDefinition {
  definitionKeyId: string;
  code: string;
  metadata: {
    name: string;
    description: string | null;
    concurrencyToken: string | null;
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
  };
  origin: EventDefinitionResponseDto["origin"];
  readOnly: boolean;
}

export type UpdateEventMetadataCommand = UpdateEventDefinitionMetadataDto;

export interface EventMetadataUpdateResult {
  definitionKeyId: string;
  code: string;
  metadata: EventCatalogDefinition["metadata"] & { concurrencyToken: string };
  currentRevisionId: string | null;
  metadataChanged: boolean;
  schemaRevisionUnchanged: boolean;
}

export function toEventCatalogDefinition(
  dto: EventDefinitionResponseDto,
): EventCatalogDefinition {
  const currentRevisionId =
    typeof dto.currentRevisionId === "string" ? dto.currentRevisionId : null;
  if (!currentRevisionId) {
    throw new Error(
      `Event Definition ${dto.definitionKeyId} has no current schema revision`,
    );
  }

  return {
    definitionKeyId: dto.definitionKeyId,
    code: dto.code,
    metadata: {
      name: dto.name,
      description: typeof dto.description === "string" ? dto.description : null,
      concurrencyToken: dto.metadataUpdatedAt,
    },
    policy: {
      version: dto.policyVersion,
      updatedAt: dto.policyUpdatedAt,
      enabled: dto.enabled,
      clientIngestible: dto.clientIngestible,
      countsAsActivity: dto.countsAsActivity,
    },
    currentSchema: {
      revisionId: currentRevisionId,
      revisionNumber: dto.version,
      payloadSchema: dto.payloadSchema,
    },
    origin: dto.origin,
    readOnly: dto.readOnly,
  };
}

export function toEventMetadataUpdateResult(
  dto: EventDefinitionMetadataMutationResponseDto,
): EventMetadataUpdateResult {
  if (!dto.schemaRevisionUnchanged) {
    throw new Error(
      "Invalid backend response: metadata mutation changed the schema revision",
    );
  }
  return {
    definitionKeyId: dto.definitionKeyId,
    code: dto.code,
    metadata: {
      name: dto.name,
      description: dto.description ?? null,
      concurrencyToken: dto.updatedAt,
    },
    currentRevisionId: dto.currentRevisionId ?? null,
    metadataChanged: dto.metadataChanged,
    schemaRevisionUnchanged: dto.schemaRevisionUnchanged,
  };
}

export function applyEventMetadataUpdate(
  current: EventCatalogDefinition,
  result: EventMetadataUpdateResult,
): EventCatalogDefinition {
  const responseTime = Date.parse(result.metadata.concurrencyToken);
  const currentTime = current.metadata.concurrencyToken
    ? Date.parse(current.metadata.concurrencyToken)
    : Number.NEGATIVE_INFINITY;
  const matchesWorkspace =
    result.definitionKeyId === current.definitionKeyId &&
    result.code === current.code;

  if (!matchesWorkspace || responseTime < currentTime) return current;

  return {
    ...current,
    metadata: result.metadata,
  };
}
