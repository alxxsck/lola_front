import axios from "axios";
import { ApiError } from "@/shared/api/http/api-error";
import {
  eventCatalogArchiveEventDefinition,
  eventCatalogCreateEventDefinition,
  eventCatalogDeleteEventDefinition,
  eventCatalogEventDefinitionRevision,
  eventCatalogEventDefinitionRevisions,
  eventCatalogEventDefinitionUsage,
  eventCatalogGetEventDefinition,
  eventCatalogListEventDefinitions,
  eventCatalogRestoreEventDefinition,
  eventCatalogUpdateMetadata,
  eventCatalogUpdatePolicy,
} from "@/shared/api/generated/lola-backend";
import {
  toEventCatalogDefinition,
  type ArchiveEventDefinitionCommand,
  type CreateEventDefinitionCommand,
  type DeleteEventDefinitionCommand,
  type EventCatalogDefinition,
  type EventDefinitionLifecycle,
  type EventDefinitionRevision,
  type EventDefinitionRevisionPage,
  type EventDefinitionUsage,
  type EventMetadataUpdateResult,
  type RestoreEventDefinitionCommand,
  type UpdateEventMetadataCommand,
  type UpdateEventPolicyCommand,
} from "./event-catalog-contract";

export interface EventCatalogRepository {
  listDefinitions(
    projectId: string,
    lifecycle?: EventDefinitionLifecycle,
  ): Promise<EventCatalogDefinition[]>;
  createDefinition(
    projectId: string,
    command: CreateEventDefinitionCommand,
  ): Promise<EventCatalogDefinition>;
  getDefinition(
    projectId: string,
    definitionKeyId: string,
  ): Promise<EventCatalogDefinition>;
  getUsage(
    projectId: string,
    definitionKeyId: string,
  ): Promise<EventDefinitionUsage>;
  updateMetadata(
    projectId: string,
    definitionKeyId: string,
    command: UpdateEventMetadataCommand,
  ): Promise<EventMetadataUpdateResult>;
  updatePolicy(
    projectId: string,
    definitionKeyId: string,
    command: UpdateEventPolicyCommand,
  ): Promise<EventCatalogDefinition>;
  archive(
    projectId: string,
    definitionKeyId: string,
    command: ArchiveEventDefinitionCommand,
  ): Promise<EventCatalogDefinition>;
  restore(
    projectId: string,
    definitionKeyId: string,
    command: RestoreEventDefinitionCommand,
  ): Promise<EventCatalogDefinition>;
  hardDelete(
    projectId: string,
    definitionKeyId: string,
    command: DeleteEventDefinitionCommand,
  ): Promise<void>;
  listRevisions(
    projectId: string,
    definitionKeyId: string,
    query?: { limit?: number; cursor?: string },
  ): Promise<EventDefinitionRevisionPage>;
  getRevision(
    projectId: string,
    definitionKeyId: string,
    revisionId: string,
  ): Promise<EventDefinitionRevision>;
}

const pendingDeleteIntents = new Map<string, string>();

function deleteIntentKey(projectId: string, definitionKeyId: string) {
  return `${projectId}:${definitionKeyId}`;
}

function deleteIntentFingerprint(command: DeleteEventDefinitionCommand) {
  return JSON.stringify(command);
}

function errorStatus(error: unknown) {
  if (error instanceof ApiError) return error.status;
  return axios.isAxiosError(error) ? error.response?.status : undefined;
}

function isNotFound(error: unknown) {
  return errorStatus(error) === 404;
}

export const apiEventCatalogRepository: EventCatalogRepository = {
  async listDefinitions(projectId, lifecycle = "ACTIVE") {
    return (
      await eventCatalogListEventDefinitions(projectId, { lifecycle })
    ).map(toEventCatalogDefinition);
  },
  async createDefinition(projectId, command) {
    return toEventCatalogDefinition(
      await eventCatalogCreateEventDefinition(projectId, command),
    );
  },
  async getDefinition(projectId, definitionKeyId) {
    return toEventCatalogDefinition(
      await eventCatalogGetEventDefinition(projectId, definitionKeyId),
    );
  },
  getUsage: eventCatalogEventDefinitionUsage,
  async updateMetadata(projectId, definitionKeyId, command) {
    const dto = await eventCatalogUpdateMetadata(
      projectId,
      definitionKeyId,
      command,
    );
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
  },
  async updatePolicy(projectId, definitionKeyId, command) {
    await eventCatalogUpdatePolicy(projectId, definitionKeyId, command);
    return this.getDefinition(projectId, definitionKeyId);
  },
  async archive(projectId, definitionKeyId, command) {
    return toEventCatalogDefinition(
      await eventCatalogArchiveEventDefinition(
        projectId,
        definitionKeyId,
        command,
      ),
    );
  },
  async restore(projectId, definitionKeyId, command) {
    return toEventCatalogDefinition(
      await eventCatalogRestoreEventDefinition(
        projectId,
        definitionKeyId,
        command,
      ),
    );
  },
  async hardDelete(projectId, definitionKeyId, command) {
    const intentKey = deleteIntentKey(projectId, definitionKeyId);
    const fingerprint = deleteIntentFingerprint(command);
    const retryingSameIntent =
      pendingDeleteIntents.get(intentKey) === fingerprint;
    pendingDeleteIntents.set(intentKey, fingerprint);
    try {
      await eventCatalogDeleteEventDefinition(
        projectId,
        definitionKeyId,
        command,
      );
    } catch (error) {
      if (!isNotFound(error) || !retryingSameIntent) {
        if ((errorStatus(error) ?? 0) > 0) {
          pendingDeleteIntents.delete(intentKey);
        }
        throw error;
      }
    }
    try {
      await eventCatalogGetEventDefinition(projectId, definitionKeyId);
    } catch (error) {
      if (isNotFound(error)) {
        pendingDeleteIntents.delete(intentKey);
        return;
      }
      throw error;
    }
    pendingDeleteIntents.delete(intentKey);
    throw new Error("EVENT_DELETE_NOT_CONFIRMED");
  },
  listRevisions: eventCatalogEventDefinitionRevisions,
  getRevision: eventCatalogEventDefinitionRevision,
};
