import { describe, expect, it } from "vitest";
import { mockEventCatalogRepository } from "./mock-event-catalog-repository";

describe("mockEventCatalogRepository", () => {
  it("models create, metadata, archive and restore without changing schema identity", async () => {
    const created = await mockEventCatalogRepository.createDefinition(
      "project-1",
      {
        code: `test_event_${Date.now()}`,
        name: "Тестовое событие",
        payloadSchema: { type: "object" },
        enabled: true,
        clientIngestible: false,
        countsAsActivity: false,
      },
    );
    const metadata = await mockEventCatalogRepository.updateMetadata(
      "project-1",
      created.definitionKeyId,
      {
        name: "Новое имя",
        description: null,
        expectedUpdatedAt: created.metadata.concurrencyToken,
      },
    );
    const disabled = await mockEventCatalogRepository.updatePolicy(
      "project-1",
      created.definitionKeyId,
      {
        enabled: false,
        clientIngestible: created.policy.clientIngestible,
        countsAsActivity: created.policy.countsAsActivity,
        expectedVersion: created.policy.version,
      },
    );
    const archived = await mockEventCatalogRepository.archive(
      "project-1",
      created.definitionKeyId,
      {
        expectedLifecycleVersion: created.lifecycleVersion,
        expectedPolicyVersion: disabled.policy.version,
      },
    );
    const restored = await mockEventCatalogRepository.restore(
      "project-1",
      created.definitionKeyId,
      {
        expectedLifecycleVersion: archived.lifecycleVersion,
      },
    );

    expect(metadata.schemaRevisionUnchanged).toBe(true);
    expect(disabled.policy).toMatchObject({ enabled: false, version: 2 });
    expect(archived).toMatchObject({
      lifecycle: "ARCHIVED",
      policy: { enabled: false },
    });
    expect(restored).toMatchObject({
      lifecycle: "ACTIVE",
      policy: { enabled: false },
    });
    expect(restored.currentSchema.revisionId).toBe(
      created.currentSchema.revisionId,
    );
  });
});
