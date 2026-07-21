import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  eventCatalogArchiveEventDefinition,
  eventCatalogDeleteEventDefinition,
  eventCatalogGetEventDefinition,
  eventCatalogListEventDefinitions,
  eventCatalogRestoreEventDefinition,
  eventCatalogUpdateMetadata,
  eventCatalogUpdatePolicy,
} from "@/shared/api/generated/lola-backend";
import type { EventDefinitionCatalogResponseDto } from "@/shared/api/generated/models";
import { ApiError } from "@/shared/api/http/api-error";
import { apiEventCatalogRepository } from "./event-catalog-repository";

vi.mock("@/shared/api/generated/lola-backend", () => ({
  eventCatalogArchiveEventDefinition: vi.fn(),
  eventCatalogCreateEventDefinition: vi.fn(),
  eventCatalogDeleteEventDefinition: vi.fn(),
  eventCatalogEventDefinitionRevision: vi.fn(),
  eventCatalogEventDefinitionRevisions: vi.fn(),
  eventCatalogEventDefinitionUsage: vi.fn(),
  eventCatalogGetEventDefinition: vi.fn(),
  eventCatalogListEventDefinitions: vi.fn(),
  eventCatalogRestoreEventDefinition: vi.fn(),
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
    vi.mocked(eventCatalogGetEventDefinition).mockResolvedValue(definitionDto);
  });

  it("uses the canonical lifecycle-filtered stable list", async () => {
    vi.mocked(eventCatalogListEventDefinitions).mockResolvedValue([
      definitionDto,
    ]);
    const result = await apiEventCatalogRepository.listDefinitions(
      "project-1",
      "ARCHIVED",
    );
    expect(eventCatalogListEventDefinitions).toHaveBeenCalledWith("project-1", {
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
    expect(eventCatalogGetEventDefinition).toHaveBeenCalledWith(
      "project-1",
      "event-key-1",
    );
  });

  it("passes lifecycle OCC commands to archive and restore", async () => {
    vi.mocked(eventCatalogArchiveEventDefinition).mockResolvedValue({
      ...definitionDto,
      lifecycle: "ARCHIVED",
      policy: { ...definitionDto.policy, enabled: false },
    });
    vi.mocked(eventCatalogRestoreEventDefinition).mockResolvedValue({
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
    expect(eventCatalogArchiveEventDefinition).toHaveBeenCalledWith(
      "project-1",
      "event-key-1",
      { expectedLifecycleVersion: 2, expectedPolicyVersion: 3 },
    );
    expect(eventCatalogRestoreEventDefinition).toHaveBeenCalledWith(
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
    vi.mocked(eventCatalogGetEventDefinition).mockRejectedValue(
      new ApiError(404, "Event Definition not found"),
    );
    await expect(
      apiEventCatalogRepository.hardDelete("project-1", "event-key-1", command),
    ).resolves.toBeUndefined();
    expect(eventCatalogDeleteEventDefinition).toHaveBeenCalledWith(
      "project-1",
      "event-key-1",
      command,
    );
    expect(eventCatalogGetEventDefinition).toHaveBeenCalledAfter(
      vi.mocked(eventCatalogDeleteEventDefinition),
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
    vi.mocked(eventCatalogDeleteEventDefinition)
      .mockRejectedValueOnce({ isAxiosError: true, request: {} })
      .mockRejectedValueOnce({ isAxiosError: true, response: { status: 404 } });
    vi.mocked(eventCatalogGetEventDefinition).mockRejectedValue({
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
    vi.mocked(eventCatalogDeleteEventDefinition).mockRejectedValue({
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
    expect(eventCatalogGetEventDefinition).not.toHaveBeenCalled();
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
