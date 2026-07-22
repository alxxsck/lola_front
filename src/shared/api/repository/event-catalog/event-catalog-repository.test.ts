import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  eventCatalogAnalyzeSchemaDraft,
  eventCatalogArchive,
  eventCatalogCreateSchemaSuccessor,
  eventCatalogDiscardSchemaDraft,
  eventCatalogDetail,
  eventCatalogHardDelete,
  eventCatalogList,
  eventCatalogPublishSchemaDraft,
  eventCatalogRestore,
  eventCatalogSaveSchemaDraft,
  eventCatalogSchemaDraft,
  eventCatalogUpdateMetadata,
  eventCatalogUpdatePolicy,
} from "@/shared/api/generated/lola-backend";
import type { EventDefinitionCatalogResponseDto } from "@/shared/api/generated/models";
import { ApiError } from "@/shared/api/http/api-error";
import { apiEventCatalogRepository } from "./event-catalog-repository";

vi.mock("@/shared/api/generated/lola-backend", () => ({
  eventCatalogAnalyzeSchemaDraft: vi.fn(),
  eventCatalogArchive: vi.fn(),
  eventCatalogDiscardSchemaDraft: vi.fn(),
  eventCatalogCreate: vi.fn(),
  eventCatalogCreateSchemaSuccessor: vi.fn(),
  eventCatalogDetail: vi.fn(),
  eventCatalogHardDelete: vi.fn(),
  eventCatalogList: vi.fn(),
  eventCatalogPublishSchemaDraft: vi.fn(),
  eventCatalogRestore: vi.fn(),
  eventCatalogSaveSchemaDraft: vi.fn(),
  eventCatalogSchemaDraft: vi.fn(),
  eventCatalogRevision: vi.fn(),
  eventCatalogRevisions: vi.fn(),
  eventCatalogUsage: vi.fn(),
  eventCatalogUpdateMetadata: vi.fn(),
  eventCatalogUpdatePolicy: vi.fn(),
}));

const definitionDto: EventDefinitionCatalogResponseDto = {
  id: "event-key-1",
  projectId: "project-1",
  code: "deposit.succeeded",
  name: "Deposit succeeded",
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

describe("apiEventCatalogRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(eventCatalogDetail).mockResolvedValue(definitionDto);
  });

  it("uses the canonical lifecycle-filtered stable list", async () => {
    vi.mocked(eventCatalogList).mockResolvedValue([definitionDto]);
    const result = await apiEventCatalogRepository.listDefinitions(
      "project-1",
      "ARCHIVED",
    );
    expect(eventCatalogList).toHaveBeenCalledWith("project-1", {
      lifecycle: "ARCHIVED",
    });
    expect(result[0]?.definitionKeyId).toBe("event-key-1");
  });

  it("updates policy with OCC and performs mandatory stable-identity reload", async () => {
    vi.mocked(eventCatalogUpdatePolicy).mockResolvedValue({
      definitionKeyId: "event-key-1",
      policy: definitionDto.policy,
      policyChanged: true,
      schemaRevisionUnchanged: true,
    });
    const command = {
      enabled: false,
      clientIngestible: false,
      countsAsActivity: true,
      expectedVersion: 3,
    };
    await apiEventCatalogRepository.updatePolicy(
      "project-1",
      "event-key-1",
      command,
    );
    expect(eventCatalogUpdatePolicy).toHaveBeenCalledWith(
      "project-1",
      "event-key-1",
      command,
    );
    expect(eventCatalogDetail).toHaveBeenCalledWith("project-1", "event-key-1");
  });

  it("creates a semantic successor through the OCC source-draft command", async () => {
    vi.mocked(eventCatalogCreateSchemaSuccessor).mockResolvedValue({
      definitionKeyId: "successor-key",
    } as never);
    const command = {
      code: "deposit.completed",
      name: "Deposit completed",
      expectedDraftVersion: 2,
      expectedBaseRevisionId: "revision-4",
    };

    await apiEventCatalogRepository.createSchemaSuccessor(
      "project-1",
      "event-key-1",
      command,
    );

    expect(eventCatalogCreateSchemaSuccessor).toHaveBeenCalledWith(
      "project-1",
      "event-key-1",
      command,
    );
    expect(eventCatalogDetail).toHaveBeenCalledWith(
      "project-1",
      "successor-key",
    );
  });

  it("owns the complete server-backed schema draft lifecycle", async () => {
    const draft = {
      id: "draft-1",
      definitionKeyId: "event-key-1",
      baseRevisionId: "revision-4",
      draftVersion: 2,
      payloadSchema: { type: "object", properties: {} },
      schemaHash: "schema-hash",
      validation: { valid: true },
      updatedAt: "2026-07-22T10:00:00.000Z",
      changed: false,
    };
    const impact = {
      definitionKeyId: "event-key-1",
      draftVersion: 2,
      baseRevisionId: "revision-4",
      validation: { valid: true },
      compatibility: { classification: "FULL_TRANSITIVE_SAFE" },
      impact: {
        summary: { blockingConsumerCount: 0, blockingActiveWaitCount: 0 },
      },
    };
    const published = {
      status: "SAFELY_PUBLISHED",
      definitionKeyId: "event-key-1",
      previousRevisionId: "revision-4",
      revisionId: "revision-5",
      revisionNumber: 5,
      schemaHash: "schema-hash",
      compatibility: impact.compatibility,
      impact: impact.impact,
      automaticallyExtendedBindings: 1,
      automaticallyExtendedWaits: 0,
    };
    vi.mocked(eventCatalogSchemaDraft).mockResolvedValue(draft);
    vi.mocked(eventCatalogSaveSchemaDraft).mockResolvedValue({
      ...draft,
      changed: true,
    });
    vi.mocked(eventCatalogAnalyzeSchemaDraft).mockResolvedValue(
      impact as never,
    );
    vi.mocked(eventCatalogPublishSchemaDraft).mockResolvedValue(
      published as never,
    );

    await expect(
      apiEventCatalogRepository.getSchemaDraft("project-1", "event-key-1"),
    ).resolves.toEqual(draft);
    await apiEventCatalogRepository.saveSchemaDraft(
      "project-1",
      "event-key-1",
      {
        payloadSchema: draft.payloadSchema,
        expectedDraftVersion: 2,
      },
    );
    await apiEventCatalogRepository.analyzeSchemaDraft(
      "project-1",
      "event-key-1",
      { expectedDraftVersion: 2 },
    );
    await apiEventCatalogRepository.publishSchemaDraft(
      "project-1",
      "event-key-1",
      {
        expectedDraftVersion: 2,
        expectedBaseRevisionId: "revision-4",
        reason: "Add optional field",
      },
    );
    await apiEventCatalogRepository.discardSchemaDraft(
      "project-1",
      "event-key-1",
      { expectedDraftVersion: 2, reason: "Discard proposal" },
    );

    expect(eventCatalogSaveSchemaDraft).toHaveBeenCalledWith(
      "project-1",
      "event-key-1",
      expect.objectContaining({ expectedDraftVersion: 2 }),
    );
    expect(eventCatalogAnalyzeSchemaDraft).toHaveBeenCalledWith(
      "project-1",
      "event-key-1",
      { expectedDraftVersion: 2 },
    );
    expect(eventCatalogPublishSchemaDraft).toHaveBeenCalledWith(
      "project-1",
      "event-key-1",
      expect.objectContaining({ expectedBaseRevisionId: "revision-4" }),
    );
    expect(eventCatalogDiscardSchemaDraft).toHaveBeenCalledWith(
      "project-1",
      "event-key-1",
      { expectedDraftVersion: 2, reason: "Discard proposal" },
    );

    vi.mocked(eventCatalogSchemaDraft).mockRejectedValue(
      new ApiError(
        404,
        "Event Schema draft not found",
        undefined,
        undefined,
        "EVENT_SCHEMA_DRAFT_NOT_FOUND",
      ),
    );
    await expect(
      apiEventCatalogRepository.getSchemaDraft("project-1", "event-key-1"),
    ).resolves.toBeNull();

    vi.mocked(eventCatalogSchemaDraft).mockRejectedValue(
      new ApiError(
        404,
        "Event Definition not found",
        undefined,
        undefined,
        "EVENT_DEFINITION_NOT_FOUND",
      ),
    );
    await expect(
      apiEventCatalogRepository.getSchemaDraft("project-1", "event-key-1"),
    ).rejects.toMatchObject({ code: "EVENT_DEFINITION_NOT_FOUND" });
  });

  it("passes lifecycle OCC commands to archive and restore", async () => {
    vi.mocked(eventCatalogArchive).mockResolvedValue({
      ...definitionDto,
      lifecycle: "ARCHIVED",
      policy: { ...definitionDto.policy, enabled: false },
    });
    vi.mocked(eventCatalogRestore).mockResolvedValue({
      ...definitionDto,
      policy: { ...definitionDto.policy, enabled: false },
    });
    await apiEventCatalogRepository.archive("project-1", "event-key-1", {
      expectedLifecycleVersion: 2,
      expectedPolicyVersion: 3,
    });
    await apiEventCatalogRepository.restore("project-1", "event-key-1", {
      expectedLifecycleVersion: 3,
    });
    expect(eventCatalogArchive).toHaveBeenCalledWith(
      "project-1",
      "event-key-1",
      { expectedLifecycleVersion: 2, expectedPolicyVersion: 3 },
    );
    expect(eventCatalogRestore).toHaveBeenCalledWith(
      "project-1",
      "event-key-1",
      { expectedLifecycleVersion: 3 },
    );
  });

  it("confirms hard delete only when the stable GET returns 404", async () => {
    const command = {
      expectedLifecycleVersion: 2,
      expectedPolicyVersion: 3,
      reason: "Created by mistake",
    };
    vi.mocked(eventCatalogDetail).mockRejectedValue(
      new ApiError(404, "Event Definition not found"),
    );
    await expect(
      apiEventCatalogRepository.hardDelete("project-1", "event-key-1", command),
    ).resolves.toBeUndefined();
    expect(eventCatalogHardDelete).toHaveBeenCalledWith(
      "project-1",
      "event-key-1",
      command,
    );
    expect(eventCatalogDetail).toHaveBeenCalledAfter(
      vi.mocked(eventCatalogHardDelete),
    );
  });

  it("fails when DELETE returns but the stable identity still reloads", async () => {
    await expect(
      apiEventCatalogRepository.hardDelete("project-1", "event-key-1", {
        expectedLifecycleVersion: 2,
        expectedPolicyVersion: 3,
        reason: "Created by mistake",
      }),
    ).rejects.toThrow("EVENT_DELETE_NOT_CONFIRMED");
  });

  it("accepts DELETE 404 only when retrying the same retained timeout intent", async () => {
    const command = {
      expectedLifecycleVersion: 7,
      expectedPolicyVersion: 5,
      reason: "Retry after timeout",
    };
    vi.mocked(eventCatalogHardDelete)
      .mockRejectedValueOnce({ isAxiosError: true, request: {} })
      .mockRejectedValueOnce({ isAxiosError: true, response: { status: 404 } });
    vi.mocked(eventCatalogDetail).mockRejectedValue({
      isAxiosError: true,
      response: { status: 404 },
    });

    await expect(
      apiEventCatalogRepository.hardDelete(
        "project-1",
        "event-key-timeout",
        command,
      ),
    ).rejects.toBeTruthy();
    await expect(
      apiEventCatalogRepository.hardDelete(
        "project-1",
        "event-key-timeout",
        command,
      ),
    ).resolves.toBeUndefined();
  });

  it("rejects a first-attempt DELETE 404 without a retained local intent", async () => {
    vi.mocked(eventCatalogHardDelete).mockRejectedValue({
      isAxiosError: true,
      response: { status: 404 },
    });
    await expect(
      apiEventCatalogRepository.hardDelete("project-1", "event-key-unknown", {
        expectedLifecycleVersion: 1,
        expectedPolicyVersion: 1,
        reason: "No prior attempt",
      }),
    ).rejects.toBeTruthy();
    expect(eventCatalogDetail).not.toHaveBeenCalled();
  });

  it("keeps metadata OCC separate from schema evidence", async () => {
    vi.mocked(eventCatalogUpdateMetadata).mockResolvedValue({
      definitionKeyId: "event-key-1",
      code: "deposit.succeeded",
      name: "Deposit",
      description: null,
      currentRevisionId: "revision-4",
      updatedAt: "2026-07-20T12:00:00.000Z",
      metadataChanged: true,
      schemaRevisionUnchanged: true,
    });
    await expect(
      apiEventCatalogRepository.updateMetadata("project-1", "event-key-1", {
        name: "Deposit",
        description: null,
        expectedUpdatedAt: "2026-07-20T10:00:00.000Z",
      }),
    ).resolves.toMatchObject({
      metadata: { concurrencyToken: "2026-07-20T12:00:00.000Z" },
    });
  });
});
