import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  eventCatalogDetail,
  eventCatalogProjectHealth,
  eventCatalogUpdateMetadata,
} from "@/shared/api/generated/lola-backend";
import { apiEventCatalogRepository } from "./event-catalog-repository";

vi.mock("@/shared/api/generated/lola-backend", () => ({
  eventCatalogDetail: vi.fn(),
  eventCatalogProjectHealth: vi.fn(),
  eventCatalogUpdateMetadata: vi.fn(),
}));

describe("apiEventCatalogRepository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads a definition through the generated target endpoint", async () => {
    vi.mocked(eventCatalogDetail).mockResolvedValue({
      id: "event-revision-4",
      projectId: "project-1",
      definitionKeyId: "event-key-1",
      currentRevisionId: "event-revision-4",
      isCurrent: true,
      code: "deposit.succeeded",
      name: "Successful deposit",
      description: null,
      version: 4,
      payloadSchema: { type: "object" },
      enabled: true,
      clientIngestible: true,
      countsAsActivity: true,
      policyVersion: 2,
      policyUpdatedAt: "2026-07-20T10:00:00.000Z",
      metadataUpdatedAt: "2026-07-20T09:00:00.000Z",
      origin: "CUSTOM",
      readOnly: false,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-20T10:00:00.000Z",
      lifecycle: "ACTIVE",
      archivedAt: null,
    });

    await expect(
      apiEventCatalogRepository.getDefinition("project-1", "event-key-1"),
    ).resolves.toMatchObject({
      definitionKeyId: "event-key-1",
      currentSchema: { revisionId: "event-revision-4", revisionNumber: 4 },
      policy: { version: 2, enabled: true },
    });
    expect(eventCatalogDetail).toHaveBeenCalledWith("project-1", "event-key-1");
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

  it("loads usage health from the server and keeps only the selected stable identity", async () => {
    vi.mocked(eventCatalogProjectHealth).mockResolvedValue({
      consumers: [
        {
          definitionKeyId: "event-key-1",
          consumerId: "scenario-1",
          consumerType: "SCENARIO_TRIGGER",
          health: "HEALTHY",
          matchingMode: "STABLE_TYPE",
          acceptsCurrentRevision: true,
        },
        {
          definitionKeyId: "event-key-2",
          consumerId: "scenario-2",
          consumerType: "SCENARIO_TRIGGER",
          health: "BLOCKED",
          matchingMode: "EXACT",
          acceptsCurrentRevision: false,
        },
      ],
      activeWaits: [],
      drafts: [],
      summary: {
        healthyConsumerCount: 1,
        exactConsumerCount: 1,
        blockedConsumerCount: 1,
        needsReviewDraftCount: 0,
        blockedDraftCount: 0,
      },
      truncated: false,
    });

    await expect(
      apiEventCatalogRepository.getHealth("project-1", "event-key-1"),
    ).resolves.toMatchObject({
      consumers: [{ consumerId: "scenario-1" }],
      activeWaits: [],
      drafts: [],
    });
  });
});
