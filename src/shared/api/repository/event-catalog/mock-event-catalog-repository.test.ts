import { beforeEach, describe, expect, it, vi } from "vitest";

import { mockRepository } from "@/shared/api/repository/mock-repository";
import { mockEventCatalogRepository } from "./mock-event-catalog-repository";

vi.mock("@/shared/api/repository/mock-repository", () => ({
  mockRepository: {
    getEvents: vi.fn(),
    saveEvent: vi.fn(),
  },
}));

const event = {
  id: "revision-1",
  definitionKeyId: "event-key-1",
  currentRevisionId: "revision-1",
  isCurrent: true,
  origin: "CUSTOM" as const,
  readOnly: false,
  projectId: "project-1",
  code: "registration_completed",
  name: "Регистрация завершена",
  description: "Пользователь завершил регистрацию",
  version: 1,
  payloadSchema: {
    type: "object",
    properties: { language: { type: "string" } },
  },
  clientIngestible: true,
  countsAsActivity: true,
  enabled: true,
};

describe("mockEventCatalogRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mockRepository.getEvents).mockResolvedValue([event]);
    vi.mocked(mockRepository.saveEvent).mockImplementation(
      async (_projectId, value) => ({
        ...event,
        ...value,
      }),
    );
  });

  it("updates demo metadata without changing policy, payload schema or revision identity", async () => {
    const loaded = await mockEventCatalogRepository.getDefinition(
      "project-1",
      "event-key-1",
    );
    const result = await mockEventCatalogRepository.updateMetadata(
      "project-1",
      "event-key-1",
      {
        name: "Регистрация готова",
        description: null,
        expectedUpdatedAt: loaded.metadata.concurrencyToken!,
      },
    );

    expect(mockRepository.saveEvent).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        id: "revision-1",
        code: "registration_completed",
        name: "Регистрация готова",
        payloadSchema: event.payloadSchema,
        enabled: true,
        clientIngestible: true,
        countsAsActivity: true,
        version: 1,
      }),
    );
    expect(result.currentRevisionId).toBe("revision-1");
    expect(result.schemaRevisionUnchanged).toBe(true);
  });
});
