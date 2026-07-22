import { demoEvents } from "@/shared/api/mock-data";
import type { EventDefinition } from "@/shared/types/domain";
import type {
  EventCatalogDefinition,
  EventMetadataUpdateResult,
  EventSchemaDraft,
  EventSchemaImpact,
} from "./event-catalog-contract";
import type { EventCatalogRepository } from "./event-catalog-repository";

const initialEvidence = "1970-01-01T00:00:00.000Z";
const lifecycleByKey = new Map<
  string,
  { lifecycle: "ACTIVE" | "ARCHIVED"; version: number }
>();
const policyByKey = new Map<
  string,
  {
    version: number;
    updatedAt: string;
    enabled: boolean;
    clientIngestible: boolean;
    countsAsActivity: boolean;
  }
>();
let events = structuredClone(demoEvents);
const schemaDrafts = new Map<string, EventSchemaDraft>();

function schemaDraftKey(projectId: string, definitionKeyId: string) {
  return `${projectId}:${definitionKeyId}`;
}

function staleSchemaDraft(): Error {
  return new Error("Event Schema Draft уже изменён. Обновите workspace.");
}

function emptyImpact(
  definitionKeyId: string,
  draft: EventSchemaDraft,
  publishedSchema: Record<string, unknown>,
): EventSchemaImpact {
  const publishedProperties = schemaProperties(publishedSchema);
  const draftProperties = schemaProperties(draft.payloadSchema);
  const existingFieldsUnchanged = Object.entries(publishedProperties).every(
    ([key, value]) =>
      JSON.stringify(draftProperties[key]) === JSON.stringify(value),
  );
  const publishedRequired = JSON.stringify(publishedSchema.required ?? []);
  const draftRequired = JSON.stringify(draft.payloadSchema.required ?? []);
  const safe = existingFieldsUnchanged && publishedRequired === draftRequired;
  return {
    definitionKeyId,
    draftVersion: draft.draftVersion,
    baseRevisionId: draft.baseRevisionId,
    validation: { valid: true, validatedAt: new Date().toISOString() },
    compatibility: {
      classification: safe ? "FULL_TRANSITIVE_SAFE" : "PRODUCER_BREAKING",
      producerCompatibility: safe ? "SAFE" : "BREAKING",
      consumerCompatibility: "SAFE",
      reasons: safe
        ? []
        : [
            {
              code: "UNSUPPORTED_VALIDATION_CHANGED",
              path: "/",
              severity: "BREAKING",
            },
          ],
    },
    impact: {
      consumers: [],
      activeWaits: [],
      summary: {
        consumerCount: 0,
        activeWaitCount: 0,
        blockingConsumerCount: 0,
        blockingActiveWaitCount: 0,
        legacyExactCount: 0,
      },
    },
  };
}

function schemaProperties(schema: Record<string, unknown>) {
  return schema.properties &&
    typeof schema.properties === "object" &&
    !Array.isArray(schema.properties)
    ? (schema.properties as Record<string, unknown>)
    : {};
}

function toMockDefinition(event: EventDefinition): EventCatalogDefinition {
  const definitionKeyId = event.definitionKeyId ?? event.id;
  const evidence = event.updatedAt ?? event.createdAt ?? initialEvidence;
  const lifecycle = lifecycleByKey.get(definitionKeyId) ?? {
    lifecycle: "ACTIVE" as const,
    version: 1,
  };
  const policy = policyByKey.get(definitionKeyId) ?? {
    version: 1,
    updatedAt: evidence,
    enabled: event.enabled,
    clientIngestible: event.clientIngestible,
    countsAsActivity: event.countsAsActivity,
  };
  return {
    definitionKeyId,
    projectId: event.projectId,
    code: event.code,
    lifecycle: lifecycle.lifecycle,
    lifecycleVersion: lifecycle.version,
    lifecycleUpdatedAt: evidence,
    metadata: {
      name: event.name,
      description: event.description ?? null,
      concurrencyToken: evidence,
    },
    policy: {
      ...policy,
      enabled: lifecycle.lifecycle === "ACTIVE" && policy.enabled,
    },
    currentSchema: {
      revisionId: event.currentRevisionId ?? event.id,
      revisionNumber: event.version,
      payloadSchema: event.payloadSchema,
      publishedAt: evidence,
    },
    origin: event.origin ?? "CUSTOM",
    readOnly: event.readOnly ?? lifecycle.lifecycle === "ARCHIVED",
  };
}

async function findEvent(projectId: string, definitionKeyId: string) {
  const event = events.find(
    (item) =>
      item.projectId === projectId &&
      (item.definitionKeyId ?? item.id) === definitionKeyId,
  );
  if (!event) throw new Error("Event Definition not found");
  return event;
}

export const mockEventCatalogRepository: EventCatalogRepository = {
  async listDefinitions(projectId, lifecycle = "ACTIVE") {
    return events
      .filter((event) => event.projectId === projectId)
      .map(toMockDefinition)
      .filter((definition) => definition.lifecycle === lifecycle);
  },
  async createDefinition(projectId, command) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const event: EventDefinition = {
      ...command,
      id,
      projectId,
      definitionKeyId: id,
      currentRevisionId: id,
      version: 1,
      enabled: command.enabled ?? true,
      clientIngestible: command.clientIngestible ?? false,
      countsAsActivity: command.countsAsActivity ?? false,
      createdAt: now,
      updatedAt: now,
      origin: "CUSTOM",
      readOnly: false,
    };
    events.push(event);
    return toMockDefinition(event);
  },
  async createSchemaSuccessor(projectId, definitionKeyId, command) {
    const key = schemaDraftKey(projectId, definitionKeyId);
    const draft = schemaDrafts.get(key);
    const source = await this.getDefinition(projectId, definitionKeyId);
    if (
      !draft ||
      draft.draftVersion !== command.expectedDraftVersion ||
      draft.baseRevisionId !== command.expectedBaseRevisionId
    ) {
      throw staleSchemaDraft();
    }
    const created = await this.createDefinition(projectId, {
      code: command.code,
      name: command.name,
      description: `Created from semantic-breaking draft of ${source.code}`,
      payloadSchema: draft.payloadSchema,
      enabled: false,
      clientIngestible: source.policy.clientIngestible,
      countsAsActivity: source.policy.countsAsActivity,
    });
    schemaDrafts.delete(key);
    return created;
  },
  async getDefinition(projectId, definitionKeyId) {
    return toMockDefinition(await findEvent(projectId, definitionKeyId));
  },
  async getSchemaDraft(projectId, definitionKeyId) {
    return schemaDrafts.get(schemaDraftKey(projectId, definitionKeyId)) ?? null;
  },
  async saveSchemaDraft(projectId, definitionKeyId, command) {
    const key = schemaDraftKey(projectId, definitionKeyId);
    const current = schemaDrafts.get(key);
    if (current && command.expectedDraftVersion === undefined) {
      throw staleSchemaDraft();
    }
    if (current && command.expectedDraftVersion !== current.draftVersion) {
      throw staleSchemaDraft();
    }
    const definition = await this.getDefinition(projectId, definitionKeyId);
    const changed =
      JSON.stringify(current?.payloadSchema) !==
      JSON.stringify(command.payloadSchema);
    if (current && !changed) return { ...current, changed: false };
    const next: EventSchemaDraft = {
      id: current?.id ?? crypto.randomUUID(),
      definitionKeyId,
      baseRevisionId: definition.currentSchema.revisionId,
      draftVersion: (current?.draftVersion ?? 0) + 1,
      payloadSchema: command.payloadSchema,
      schemaHash: `mock-${Date.now()}`,
      validation: { valid: true, validatedAt: new Date().toISOString() },
      updatedAt: new Date().toISOString(),
      changed,
    };
    schemaDrafts.set(key, next);
    return next;
  },
  async analyzeSchemaDraft(projectId, definitionKeyId, command) {
    const draft = schemaDrafts.get(schemaDraftKey(projectId, definitionKeyId));
    if (!draft || draft.draftVersion !== command.expectedDraftVersion) {
      throw staleSchemaDraft();
    }
    const definition = await this.getDefinition(projectId, definitionKeyId);
    return emptyImpact(
      definitionKeyId,
      draft,
      definition.currentSchema.payloadSchema,
    );
  },
  async publishSchemaDraft(projectId, definitionKeyId, command) {
    const key = schemaDraftKey(projectId, definitionKeyId);
    const draft = schemaDrafts.get(key);
    const event = await findEvent(projectId, definitionKeyId);
    const definition = toMockDefinition(event);
    if (
      !draft ||
      draft.draftVersion !== command.expectedDraftVersion ||
      draft.baseRevisionId !== command.expectedBaseRevisionId
    ) {
      throw staleSchemaDraft();
    }
    const analysis = emptyImpact(
      definitionKeyId,
      draft,
      definition.currentSchema.payloadSchema,
    );
    if (
      analysis.compatibility.classification !== "FULL_TRANSITIVE_SAFE" &&
      (!command.confirmBreakingChange || !command.producerMigrationConfirmed)
    ) {
      throw new Error("Подтвердите breaking change и миграцию producers.");
    }
    event.payloadSchema = draft.payloadSchema;
    event.version = definition.currentSchema.revisionNumber + 1;
    event.currentRevisionId = crypto.randomUUID();
    event.updatedAt = new Date().toISOString();
    schemaDrafts.delete(key);
    return {
      status:
        analysis.compatibility.classification === "FULL_TRANSITIVE_SAFE"
          ? "SAFELY_PUBLISHED"
          : "BREAKING_PUBLISHED",
      definitionKeyId,
      previousRevisionId: definition.currentSchema.revisionId,
      revisionId: event.currentRevisionId,
      revisionNumber: event.version,
      schemaHash: draft.schemaHash,
      compatibility: analysis.compatibility,
      impact: analysis.impact,
      automaticallyExtendedBindings: 0,
      automaticallyExtendedWaits: 0,
    };
  },
  async discardSchemaDraft(projectId, definitionKeyId, command) {
    const key = schemaDraftKey(projectId, definitionKeyId);
    const draft = schemaDrafts.get(key);
    if (!draft || draft.draftVersion !== command.expectedDraftVersion) {
      throw staleSchemaDraft();
    }
    schemaDrafts.delete(key);
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
    Object.assign(event, {
      name: command.name,
      description: command.description ?? undefined,
      updatedAt,
    });
    return {
      definitionKeyId,
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
  async updatePolicy(projectId, definitionKeyId, command) {
    const event = await findEvent(projectId, definitionKeyId);
    const current = toMockDefinition(event);
    if (command.expectedVersion !== current.policy.version) {
      throw new Error(
        "Event Ingestion Policy уже изменена. Обновите workspace.",
      );
    }
    const changed =
      command.enabled !== current.policy.enabled ||
      command.clientIngestible !== current.policy.clientIngestible ||
      command.countsAsActivity !== current.policy.countsAsActivity;
    if (changed) {
      const updatedAt = new Date().toISOString();
      policyByKey.set(definitionKeyId, {
        version: current.policy.version + 1,
        updatedAt,
        enabled: command.enabled,
        clientIngestible: command.clientIngestible,
        countsAsActivity: command.countsAsActivity,
      });
      Object.assign(event, {
        enabled: command.enabled,
        clientIngestible: command.clientIngestible,
        countsAsActivity: command.countsAsActivity,
        updatedAt,
      });
    }
    return this.getDefinition(projectId, definitionKeyId);
  },
  async getUsage(_projectId, definitionKeyId) {
    return {
      definitionKeyId,
      evaluatedAt: new Date().toISOString(),
      lifecycleVersion: lifecycleByKey.get(definitionKeyId)?.version ?? 1,
      policyVersion: policyByKey.get(definitionKeyId)?.version ?? 1,
      eventLogs: { exists: false },
      scenarios: { total: 0, items: [], truncated: false },
      scenarioDraftDependencyCount: 0,
      publishedScenarioRevisionCount: 0,
      activeWaitCount: 0,
      canArchive: true,
      canDelete: true,
      archiveBlockers: [],
      deleteBlockers: [],
    };
  },
  async archive(projectId, definitionKeyId, command) {
    const current = await this.getDefinition(projectId, definitionKeyId);
    if (
      command.expectedLifecycleVersion !== current.lifecycleVersion ||
      command.expectedPolicyVersion !== current.policy.version
    ) {
      throw new Error(
        "Event Definition lifecycle уже изменён. Обновите workspace.",
      );
    }
    lifecycleByKey.set(definitionKeyId, {
      lifecycle: "ARCHIVED",
      version: current.lifecycleVersion + 1,
    });
    if (current.policy.enabled) {
      const updatedAt = new Date().toISOString();
      policyByKey.set(definitionKeyId, {
        ...current.policy,
        version: current.policy.version + 1,
        updatedAt,
        enabled: false,
      });
      Object.assign(await findEvent(projectId, definitionKeyId), {
        enabled: false,
        updatedAt,
      });
    }
    return this.getDefinition(projectId, definitionKeyId);
  },
  async restore(projectId, definitionKeyId, command) {
    const current = await this.getDefinition(projectId, definitionKeyId);
    if (command.expectedLifecycleVersion !== current.lifecycleVersion) {
      throw new Error(
        "Event Definition lifecycle уже изменён. Обновите workspace.",
      );
    }
    lifecycleByKey.set(definitionKeyId, {
      lifecycle: "ACTIVE",
      version: current.lifecycleVersion + 1,
    });
    return this.getDefinition(projectId, definitionKeyId);
  },
  async hardDelete(projectId, definitionKeyId, command) {
    const event = await findEvent(projectId, definitionKeyId);
    const current = toMockDefinition(event);
    if (
      command.expectedLifecycleVersion !== current.lifecycleVersion ||
      command.expectedPolicyVersion !== current.policy.version ||
      !command.reason.trim()
    ) {
      throw new Error(
        "Event Definition delete intent недействителен. Обновите workspace.",
      );
    }
    events = events.filter((item) => item.id !== event.id);
    lifecycleByKey.delete(definitionKeyId);
    policyByKey.delete(definitionKeyId);
  },
  async listRevisions(projectId, definitionKeyId) {
    const definition = await this.getDefinition(projectId, definitionKeyId);
    return {
      items: [
        {
          id: definition.currentSchema.revisionId,
          projectId,
          definitionKeyId,
          code: definition.code,
          number: definition.currentSchema.revisionNumber,
          payloadSchema: definition.currentSchema.payloadSchema,
          publishedAt: definition.currentSchema.publishedAt,
          pinnedScenarioRevisionCount: 0,
          compatibility: "CURRENT",
          isCurrent: true,
        },
      ],
      nextCursor: null,
    };
  },
  async getRevision(projectId, definitionKeyId, revisionId) {
    const page = await this.listRevisions(projectId, definitionKeyId);
    const revision = page.items.find((item) => item.id === revisionId);
    if (!revision) throw new Error("Event Definition revision not found");
    return revision;
  },
};
