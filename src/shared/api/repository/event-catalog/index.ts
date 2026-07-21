import { isMockMode } from "@/shared/config/data-mode";
import { apiEventCatalogRepository } from "./event-catalog-repository";
import { mockEventCatalogRepository } from "./mock-event-catalog-repository";

export const eventCatalogRepository = isMockMode
  ? mockEventCatalogRepository
  : apiEventCatalogRepository;

export { applyEventMetadataUpdate } from "./event-catalog-contract";
export type { EventCatalogRepository } from "./event-catalog-repository";
export type {
  EventCatalogDefinition,
  EventDefinitionLifecycle,
  EventDefinitionRevision,
  EventDefinitionRevisionPage,
  EventDefinitionUsage,
  EventMetadataUpdateResult,
  CreateEventDefinitionCommand,
  UpdateEventPolicyCommand,
  ArchiveEventDefinitionCommand,
  RestoreEventDefinitionCommand,
  DeleteEventDefinitionCommand,
  UpdateEventMetadataCommand,
} from "./event-catalog-contract";
