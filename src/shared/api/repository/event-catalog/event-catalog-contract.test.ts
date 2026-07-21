import { describe, expect, it } from "vitest";
import type { EventDefinitionCatalogResponseDto } from "@/shared/api/generated/models";

import {
  applyEventMetadataUpdate,
  toEventCatalogDefinition,
} from "./event-catalog-contract";

const dto: EventDefinitionCatalogResponseDto = {
  id: "event-key-1",
  projectId: "project-1",
  code: "deposit.succeeded",
  name: "Успешный депозит",
  description: null,
  origin: "CUSTOM",
  lifecycle: "ACTIVE",
  lifecycleVersion: 2,
  lifecycleUpdatedAt: "2026-07-20T11:00:00.000Z",
  metadataUpdatedAt: "2026-07-20T10:00:00.000Z",
  policy: {
    version: 3,
    updatedAt: "2026-07-20T09:00:00.000Z",
    enabled: true,
    clientIngestible: false,
    countsAsActivity: true,
  },
  currentRevision: {
    id: "revision-4",
    number: 4,
    payloadSchema: { type: "object" },
    publishedAt: "2026-07-19T10:00:00.000Z",
  },
  readOnly: false,
};

describe("toEventCatalogDefinition", () => {
  it("keeps stable identity, lifecycle, policy and immutable revision evidence separate", () => {
    expect(toEventCatalogDefinition(dto)).toEqual({
      definitionKeyId: "event-key-1",
      projectId: "project-1",
      code: "deposit.succeeded",
      lifecycle: "ACTIVE",
      lifecycleVersion: 2,
      lifecycleUpdatedAt: "2026-07-20T11:00:00.000Z",
      metadata: {
        name: "Успешный депозит",
        description: null,
        concurrencyToken: "2026-07-20T10:00:00.000Z",
      },
      policy: dto.policy,
      currentSchema: {
        revisionId: "revision-4",
        revisionNumber: 4,
        payloadSchema: { type: "object" },
        publishedAt: "2026-07-19T10:00:00.000Z",
      },
      origin: "CUSTOM",
      readOnly: false,
    });
  });

  it("fails closed when a stable definition has no current revision", () => {
    expect(() =>
      toEventCatalogDefinition({ ...dto, currentRevision: null }),
    ).toThrow("has no current schema revision");
  });
});

const current = toEventCatalogDefinition(dto);

describe("applyEventMetadataUpdate", () => {
  it("ignores older metadata evidence", () => {
    const result = applyEventMetadataUpdate(current, {
      definitionKeyId: "event-key-1",
      code: "deposit.succeeded",
      metadata: {
        name: "Late",
        description: null,
        concurrencyToken: "2026-07-20T09:30:00.000Z",
      },
      currentRevisionId: "revision-4",
      metadataChanged: true,
      schemaRevisionUnchanged: true,
    });
    expect(result).toBe(current);
  });

  it("applies current metadata without replacing policy or schema", () => {
    const result = applyEventMetadataUpdate(current, {
      definitionKeyId: "event-key-1",
      code: "deposit.succeeded",
      metadata: {
        name: "Новое имя",
        description: null,
        concurrencyToken: "2026-07-20T12:00:00.000Z",
      },
      currentRevisionId: "revision-5",
      metadataChanged: true,
      schemaRevisionUnchanged: true,
    });
    expect(result.metadata.name).toBe("Новое имя");
    expect(result.policy).toBe(current.policy);
    expect(result.currentSchema).toBe(current.currentSchema);
  });
});
