import {
  eventCatalogDetail,
  eventCatalogProjectHealth,
  eventCatalogUpdateMetadata,
} from "@/shared/api/generated/lola-backend";
import {
  toEventCatalogDefinition,
  toEventCatalogDefinitionHealth,
  toEventMetadataUpdateResult,
  type EventCatalogDefinition,
  type EventCatalogDefinitionHealth,
  type EventMetadataUpdateResult,
  type UpdateEventMetadataCommand,
} from "./event-catalog-contract";

export interface EventCatalogRepository {
  getDefinition(
    projectId: string,
    definitionKeyId: string,
  ): Promise<EventCatalogDefinition>;
  updateMetadata(
    projectId: string,
    definitionKeyId: string,
    command: UpdateEventMetadataCommand,
  ): Promise<EventMetadataUpdateResult>;
  getHealth(
    projectId: string,
    definitionKeyId: string,
  ): Promise<EventCatalogDefinitionHealth>;
}

export const apiEventCatalogRepository: EventCatalogRepository = {
  async getDefinition(projectId, definitionKeyId) {
    return toEventCatalogDefinition(
      await eventCatalogDetail(projectId, definitionKeyId),
    );
  },

  async updateMetadata(projectId, definitionKeyId, command) {
    return toEventMetadataUpdateResult(
      await eventCatalogUpdateMetadata(projectId, definitionKeyId, command),
    );
  },

  async getHealth(projectId, definitionKeyId) {
    return toEventCatalogDefinitionHealth(
      await eventCatalogProjectHealth(projectId),
      definitionKeyId,
    );
  },
};
