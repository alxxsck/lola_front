import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  eventCatalogUpdateMetadata,
  platformEventDefinitions,
} from "@/shared/api/generated/lola-backend";
import type { EventDefinitionResponseDto } from "@/shared/api/generated/models";
import { apiEventCatalogRepository } from "./event-catalog-repository";

vi.mock("@/shared/api/generated/lola-backend", () => ({
  eventCatalogUpdateMetadata: vi.fn(),
  platformEventDefinitions: vi.fn(),
}));

const definitionDto = {
  id: "revision-4",
  definitionKeyId: "event-key-1",
  currentRevisionId: "revision-4",
  isCurrent: true,
  projectId: "project-1",
  code: "deposit.succeeded",
  name: "Deposit succeeded",
  description: "A deposit reached the account",
  version: 4,
  payloadSchema: {
    type: "object",
    properties: { amount: { type: "integer" } },
  },
  clientIngestible: false,
  countsAsActivity: true,
  enabled: true,
  origin: "CUSTOM" as const,
  readOnly: false,
  createdAt: "2026-07-01T10:00:00.000Z",
  updatedAt: "2026-07-20T10:00:00.000Z",
  policyVersion: 3,
  policyUpdatedAt: "2026-07-19T10:00:00.000Z",
  metadataUpdatedAt: "2026-07-20T10:00:00.000Z",
};

describe("apiEventCatalogRepository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads a workspace by stable Event Definition identity and keeps metadata, policy and schema evidence separate", async () => {
    vi.mocked(platformEventDefinitions).mockResolvedValue([
      definitionDto as unknown as EventDefinitionResponseDto,
    ]);

    await expect(
      apiEventCatalogRepository.getDefinition("project-1", "event-key-1"),
    ).resolves.toEqual({
      definitionKeyId: "event-key-1",
      code: "deposit.succeeded",
      metadata: {
        name: "Deposit succeeded",
        description: "A deposit reached the account",
        concurrencyToken: "2026-07-20T10:00:00.000Z",
      },
      policy: {
        version: 3,
        updatedAt: "2026-07-19T10:00:00.000Z",
        enabled: true,
        clientIngestible: false,
        countsAsActivity: true,
      },
      currentSchema: {
        revisionId: "revision-4",
        revisionNumber: 4,
        payloadSchema: definitionDto.payloadSchema,
      },
      origin: "CUSTOM",
      readOnly: false,
    });

    expect(platformEventDefinitions).toHaveBeenCalledWith("project-1");
  });

  it("updates metadata with its concurrency evidence and preserves the backend schema guarantee", async () => {
    vi.mocked(eventCatalogUpdateMetadata).mockResolvedValue({
      definitionKeyId: "event-key-1",
      code: "deposit.succeeded",
      name: "Successful deposit",
      description: null,
      currentRevisionId: "revision-4",
      updatedAt: "2026-07-20T11:00:00.000Z",
      metadataChanged: true,
      schemaRevisionUnchanged: true,
    });

    await expect(
      apiEventCatalogRepository.updateMetadata("project-1", "event-key-1", {
        name: "Successful deposit",
        description: null,
        expectedUpdatedAt: "2026-07-20T10:00:00.000Z",
      }),
    ).resolves.toEqual({
      definitionKeyId: "event-key-1",
      code: "deposit.succeeded",
      metadata: {
        name: "Successful deposit",
        description: null,
        concurrencyToken: "2026-07-20T11:00:00.000Z",
      },
      currentRevisionId: "revision-4",
      metadataChanged: true,
      schemaRevisionUnchanged: true,
    });

    expect(eventCatalogUpdateMetadata).toHaveBeenCalledWith(
      "project-1",
      "event-key-1",
      {
        name: "Successful deposit",
        description: null,
        expectedUpdatedAt: "2026-07-20T10:00:00.000Z",
      },
    );
  });

  it("fails closed when the backend violates the metadata-only mutation invariant", async () => {
    vi.mocked(eventCatalogUpdateMetadata).mockResolvedValue({
      definitionKeyId: "event-key-1",
      code: "deposit.succeeded",
      name: "Unexpected response",
      description: null,
      currentRevisionId: "revision-5",
      updatedAt: "2026-07-20T11:00:00.000Z",
      metadataChanged: true,
      schemaRevisionUnchanged: false,
    });

    await expect(
      apiEventCatalogRepository.updateMetadata("project-1", "event-key-1", {
        name: "Unexpected response",
        description: null,
        expectedUpdatedAt: "2026-07-20T10:00:00.000Z",
      }),
    ).rejects.toThrow("metadata mutation changed the schema revision");
  });
});
