import { describe, expect, it } from "vitest";
import type { EventDefinitionResponseDto } from "@/shared/api/generated/models";

import {
  applyEventMetadataUpdate,
  toEventCatalogDefinition,
} from "./event-catalog-contract";

describe("toEventCatalogDefinition", () => {
  it("uses the stable metadata clock as the Overview OCC token", () => {
    const definition = toEventCatalogDefinition({
      id: "revision-4",
      projectId: "project-1",
      definitionKeyId: "event-key-1",
      currentRevisionId: "revision-4",
      code: "deposit.succeeded",
      name: "Успешный депозит",
      description: null,
      version: 4,
      payloadSchema: { type: "object" },
      enabled: true,
      clientIngestible: false,
      countsAsActivity: true,
      policyVersion: 3,
      policyUpdatedAt: "2026-07-20T09:00:00.000Z",
      metadataUpdatedAt: "2026-07-20T10:00:00.000Z",
      isCurrent: true,
      origin: "CUSTOM",
      readOnly: false,
      createdAt: "2026-07-19T10:00:00.000Z",
      updatedAt: "2026-07-19T10:00:00.000Z",
    } as unknown as EventDefinitionResponseDto);

    expect(definition.metadata.concurrencyToken).toBe(
      "2026-07-20T10:00:00.000Z",
    );
  });
});

const current = {
  definitionKeyId: "event-key-1",
  code: "deposit.succeeded",
  metadata: {
    name: "Newer server name",
    description: "Already refreshed",
    concurrencyToken: "2026-07-20T12:00:00.000Z",
  },
  policy: {
    version: 3,
    updatedAt: "2026-07-20T09:00:00.000Z",
    enabled: true,
    clientIngestible: false,
    countsAsActivity: true,
  },
  currentSchema: {
    revisionId: "revision-4",
    revisionNumber: 4,
    payloadSchema: { type: "object" },
  },
  origin: "CUSTOM" as const,
  readOnly: false,
};

describe("applyEventMetadataUpdate", () => {
  it("ignores a mutation response whose concurrency evidence is older than the loaded workspace", () => {
    const result = applyEventMetadataUpdate(current, {
      definitionKeyId: "event-key-1",
      code: "deposit.succeeded",
      metadata: {
        name: "Late response",
        description: null,
        concurrencyToken: "2026-07-20T11:00:00.000Z",
      },
      currentRevisionId: "revision-4",
      metadataChanged: true,
      schemaRevisionUnchanged: true,
    });

    expect(result).toBe(current);
  });

  it("applies current evidence without changing policy or the schema head", () => {
    const result = applyEventMetadataUpdate(current, {
      definitionKeyId: "event-key-1",
      code: "deposit.succeeded",
      metadata: {
        name: "Current response",
        description: null,
        concurrencyToken: "2026-07-20T13:00:00.000Z",
      },
      currentRevisionId: "revision-4",
      metadataChanged: true,
      schemaRevisionUnchanged: true,
    });

    expect(result.metadata.name).toBe("Current response");
    expect(result.policy).toBe(current.policy);
    expect(result.currentSchema).toBe(current.currentSchema);
  });

  it("applies metadata evidence independently when a concurrent publish changed the schema head", () => {
    const result = applyEventMetadataUpdate(current, {
      definitionKeyId: "event-key-1",
      code: "deposit.succeeded",
      metadata: {
        name: "Current response",
        description: null,
        concurrencyToken: "2026-07-20T13:00:00.000Z",
      },
      currentRevisionId: "revision-5",
      metadataChanged: true,
      schemaRevisionUnchanged: true,
    });

    expect(result.metadata.name).toBe("Current response");
    expect(result.currentSchema).toBe(current.currentSchema);
  });
});
