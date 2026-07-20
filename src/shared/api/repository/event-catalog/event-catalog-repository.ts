import {
  eventCatalogUpdateMetadata,
  platformEventDefinitions,
} from "@/shared/api/generated/lola-backend";
import {
  toEventCatalogDefinition,
  toEventMetadataUpdateResult,
  type EventCatalogDefinition,
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
}

export const apiEventCatalogRepository: EventCatalogRepository = {
  async getDefinition(projectId, definitionKeyId) {
    const definitions = await platformEventDefinitions(projectId);
    const definition = definitions.find(
      (item) => item.definitionKeyId === definitionKeyId,
    );
    if (!definition) throw new Error("Event Definition not found");
    return toEventCatalogDefinition(definition);
  },

  async updateMetadata(projectId, definitionKeyId, command) {
    return toEventMetadataUpdateResult(
      await eventCatalogUpdateMetadata(projectId, definitionKeyId, command),
    );
  },
};
