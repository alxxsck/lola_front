import { mockRepository } from "@/shared/api/repository/mock-repository";
import type { EventDefinition } from "@/shared/types/domain";
import type {
  EventCatalogDefinition,
  EventMetadataUpdateResult,
} from "./event-catalog-contract";
import type { EventCatalogRepository } from "./event-catalog-repository";

const initialEvidence = "1970-01-01T00:00:00.000Z";

function toMockDefinition(event: EventDefinition): EventCatalogDefinition {
  return {
    definitionKeyId: event.definitionKeyId ?? event.id,
    code: event.code,
    metadata: {
      name: event.name,
      description: event.description ?? null,
      concurrencyToken: event.updatedAt ?? event.createdAt ?? initialEvidence,
    },
    policy: {
      version: 1,
      updatedAt: event.updatedAt ?? event.createdAt ?? initialEvidence,
      enabled: event.enabled,
      clientIngestible: event.clientIngestible,
      countsAsActivity: event.countsAsActivity,
    },
    currentSchema: {
      revisionId: event.currentRevisionId ?? event.id,
      revisionNumber: event.version,
      payloadSchema: event.payloadSchema,
    },
    origin: event.origin ?? "CUSTOM",
    readOnly: event.readOnly ?? false,
  };
}

async function findEvent(projectId: string, definitionKeyId: string) {
  const event = (await mockRepository.getEvents(projectId)).find(
    (item) => (item.definitionKeyId ?? item.id) === definitionKeyId,
  );
  if (!event) throw new Error("Event Definition not found");
  return event;
}

export const mockEventCatalogRepository: EventCatalogRepository = {
  async getDefinition(projectId, definitionKeyId) {
    return toMockDefinition(await findEvent(projectId, definitionKeyId));
  },

  async updateMetadata(
    projectId,
    definitionKeyId,
    command,
  ): Promise<EventMetadataUpdateResult> {
    const event = await findEvent(projectId, definitionKeyId);
    const current = toMockDefinition(event);
    if (command.expectedUpdatedAt !== current.metadata.concurrencyToken) {
      throw new Error(
        "Event Definition metadata уже изменена. Обновите workspace.",
      );
    }
    const updatedAt = new Date().toISOString();
    await mockRepository.saveEvent(projectId, {
      ...event,
      name: command.name,
      description: command.description ?? undefined,
      updatedAt,
    });
    return {
      definitionKeyId: current.definitionKeyId,
      code: current.code,
      metadata: {
        name: command.name,
        description: command.description ?? null,
        concurrencyToken: updatedAt,
      },
      currentRevisionId: current.currentSchema.revisionId,
      metadataChanged:
        command.name !== current.metadata.name ||
        (command.description ?? null) !== current.metadata.description,
      schemaRevisionUnchanged: true,
    };
  },

  async getHealth() {
    return { consumers: [], activeWaits: [], drafts: [] };
  },
};
