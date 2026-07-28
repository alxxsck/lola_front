import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eventQueryRepository } from "../api/event-query-repository";
import { eventCatalogRepository } from "@/shared/api/repository/event-catalog";
import type { EventQueryPolicyDocumentDto } from "@/shared/api/generated/models";
import EventQueryPolicySection from "./EventQueryPolicySection.vue";

vi.mock("../api/event-query-repository", () => ({
  eventQueryRepository: {
    getPolicy: vi.fn(),
    saveDraft: vi.fn(),
    validate: vi.fn(),
    publish: vi.fn(),
    preview: vi.fn(),
    usage: vi.fn(),
  },
}));
vi.mock("@/shared/api/repository/event-catalog", () => ({
  eventCatalogRepository: { listDefinitions: vi.fn() },
}));

const definition = {
  definitionKeyId: "definition-1",
  projectId: "project-1",
  code: "deposit.completed",
  lifecycle: "ACTIVE",
  lifecycleVersion: 1,
  lifecycleUpdatedAt: "2026-07-28T10:00:00.000Z",
  metadata: {
    name: "Депозит зачислен",
    description: null,
    concurrencyToken: "2026-07-28T10:00:00.000Z",
  },
  policy: {
    version: 1,
    updatedAt: "2026-07-28T10:00:00.000Z",
    enabled: true,
    clientIngestible: false,
    countsAsActivity: true,
  },
  currentSchema: {
    revisionId: "revision-1",
    revisionNumber: 1,
    publishedAt: "2026-07-28T10:00:00.000Z",
    payloadSchema: {
      type: "object",
      properties: {
        amount: { type: "number" },
        currency: { type: "string" },
      },
    },
  },
  origin: "CUSTOM",
  readOnly: false,
} as const;

const document: EventQueryPolicyDocumentDto = {
  enabled: true,
  items: [
    {
      stableCode: "deposit.completed",
      descriptionForAI: "Факт успешного зачисления депозита",
      allowedModes: ["SUMMARY", "AGGREGATE"],
      maxInteractiveLookbackHours: 168,
      maxVerificationLookbackHours: 720,
      safeFields: [],
    },
  ],
};

function mountSection() {
  return mount(EventQueryPolicySection, {
    props: {
      projectId: "project-1",
      canManage: true,
      canPreview: true,
      canReadCatalog: true,
    },
    global: {
      stubs: {
        Button: {
          props: ["label", "disabled", "loading"],
          emits: ["click"],
          template:
            '<button :disabled="disabled" @click="$emit(\'click\')">{{ label }}</button>',
        },
        Message: { template: '<div class="message"><slot /></div>' },
        ProjectSettingsSectionHeader: {
          template:
            '<div><h2>Доступ ИИ к событиям</h2><slot name="actions" /><slot /></div>',
        },
      },
    },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("EventQueryPolicySection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(eventCatalogRepository.listDefinitions).mockResolvedValue([
      definition as never,
    ]);
    vi.mocked(eventQueryRepository.getPolicy).mockResolvedValue({
      draft: {
        version: 3,
        updatedAt: "2026-07-28T10:00:00.000Z",
        document,
      },
      published: {
        id: "policy-1",
        version: 2,
        publishedAt: "2026-07-27T10:00:00.000Z",
        compilerVersion: "1",
        documentHash: "hash",
        document,
      },
    });
    vi.mocked(eventQueryRepository.validate).mockResolvedValue({
      valid: true,
      errors: [],
    });
    vi.mocked(eventQueryRepository.saveDraft).mockResolvedValue({
      version: 4,
      updatedAt: "2026-07-28T11:00:00.000Z",
      document,
    });
    vi.mocked(eventQueryRepository.publish).mockResolvedValue({
      id: "policy-2",
      version: 3,
      publishedAt: "2026-07-28T11:00:00.000Z",
      compilerVersion: "1",
      documentHash: "hash-2",
      document,
    });
  });

  it("shows published state, catalog schema and performs validate-save-publish", async () => {
    const wrapper = mountSection();
    await flushPromises();

    expect(wrapper.text()).toContain("Опубликована ревизия 2");
    expect(wrapper.text()).toContain("Депозит зачислен");
    expect(wrapper.text()).toContain("published");
    expect(wrapper.text()).toContain("amount");
    expect(wrapper.text()).toContain("number");

    await wrapper
      .get('[data-test="policy-description"]')
      .setValue("Новое описание");
    await wrapper.get('button[data-test="save-policy"]').trigger("click");
    await flushPromises();

    expect(eventQueryRepository.validate).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        document: expect.objectContaining({
          items: [
            expect.objectContaining({ descriptionForAI: "Новое описание" }),
          ],
        }),
      }),
    );
    expect(eventQueryRepository.saveDraft).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({ expectedVersion: 3 }),
    );

    await wrapper.get('button[data-test="publish-policy"]').trigger("click");
    await flushPromises();

    expect(eventQueryRepository.publish).toHaveBeenCalledWith("project-1", {
      expectedDraftVersion: 4,
    });
  });

  it("renders server diagnostics at their exact location and blocks publish", async () => {
    vi.mocked(eventQueryRepository.validate).mockResolvedValue({
      valid: false,
      errors: [
        {
          code: "FIELD_NOT_SAFE",
          location: "items[0].safeFields[0]",
          message: "Поле запрещено политикой схемы",
        },
      ],
    });
    const wrapper = mountSection();
    await flushPromises();

    await wrapper.get('button[data-test="save-policy"]').trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Поле запрещено политикой схемы");
    expect(
      wrapper.get('button[data-test="publish-policy"]').attributes(),
    ).toHaveProperty("disabled");
    expect(eventQueryRepository.saveDraft).not.toHaveBeenCalled();
  });

  it("requires changed policy content to be saved before publishing", async () => {
    const wrapper = mountSection();
    await flushPromises();

    expect(
      wrapper.get('button[data-test="publish-policy"]').attributes(),
    ).not.toHaveProperty("disabled");

    await wrapper
      .get('[data-test="policy-description"]')
      .setValue("Несохранённое описание");

    expect(
      wrapper.get('button[data-test="publish-policy"]').attributes(),
    ).toHaveProperty("disabled");
    await wrapper.get('button[data-test="publish-policy"]').trigger("click");
    expect(eventQueryRepository.publish).not.toHaveBeenCalled();
  });

  it("shows global validation diagnostics outside a field editor", async () => {
    vi.mocked(eventQueryRepository.validate).mockResolvedValue({
      valid: false,
      errors: [
        {
          code: "POLICY_DISABLED",
          location: "enabled",
          message: "Политика должна быть включена",
        },
      ],
    });
    const wrapper = mountSection();
    await flushPromises();

    await wrapper.get('button[data-test="save-policy"]').trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("enabled");
    expect(wrapper.text()).toContain("Политика должна быть включена");
  });

  it("reloads isolated state when the active Project changes", async () => {
    const secondDocument = {
      enabled: true,
      items: [
        {
          ...document.items[0]!,
          descriptionForAI: "Политика второго проекта",
        },
      ],
    };
    vi.mocked(eventQueryRepository.getPolicy)
      .mockResolvedValueOnce({
        draft: {
          version: 3,
          updatedAt: "2026-07-28T10:00:00.000Z",
          document,
        },
        published: null,
      })
      .mockResolvedValueOnce({
        draft: {
          version: 1,
          updatedAt: "2026-07-28T12:00:00.000Z",
          document: secondDocument,
        },
        published: null,
      });
    const wrapper = mountSection();
    await flushPromises();

    await wrapper.setProps({ projectId: "project-2" });
    await flushPromises();

    expect(eventQueryRepository.getPolicy).toHaveBeenLastCalledWith(
      "project-2",
    );
    expect(
      wrapper.get('[data-test="policy-description"]').element,
    ).toHaveProperty("value", "Политика второго проекта");
  });

  it("ignores a late save response after the active Project changes", async () => {
    const lateSave =
      deferred<Awaited<ReturnType<typeof eventQueryRepository.saveDraft>>>();
    const secondDocument = {
      enabled: true,
      items: [
        {
          ...document.items[0]!,
          descriptionForAI: "Политика второго проекта",
        },
      ],
    };
    vi.mocked(eventQueryRepository.saveDraft).mockReturnValueOnce(
      lateSave.promise,
    );
    vi.mocked(eventQueryRepository.getPolicy)
      .mockResolvedValueOnce({
        draft: {
          version: 3,
          updatedAt: "2026-07-28T10:00:00.000Z",
          document,
        },
        published: null,
      })
      .mockResolvedValueOnce({
        draft: {
          version: 1,
          updatedAt: "2026-07-28T12:00:00.000Z",
          document: secondDocument,
        },
        published: null,
      });
    const wrapper = mountSection();
    await flushPromises();

    await wrapper.get('button[data-test="save-policy"]').trigger("click");
    await flushPromises();
    await wrapper.setProps({ projectId: "project-2" });
    await flushPromises();

    lateSave.resolve({
      version: 4,
      updatedAt: "2026-07-28T13:00:00.000Z",
      document: {
        ...document,
        items: [
          {
            ...document.items[0]!,
            descriptionForAI: "Поздний ответ первого проекта",
          },
        ],
      },
    });
    await flushPromises();

    expect(
      wrapper.get('[data-test="policy-description"]').element,
    ).toHaveProperty("value", "Политика второго проекта");
  });

  it("ignores a late publish response after the active Project changes", async () => {
    const latePublish =
      deferred<Awaited<ReturnType<typeof eventQueryRepository.publish>>>();
    vi.mocked(eventQueryRepository.publish).mockReturnValueOnce(
      latePublish.promise,
    );
    const wrapper = mountSection();
    await flushPromises();

    await wrapper.get('button[data-test="publish-policy"]').trigger("click");
    await wrapper.setProps({ projectId: "project-2" });
    await flushPromises();
    latePublish.resolve({
      id: "late-policy",
      version: 99,
      publishedAt: "2026-07-28T14:00:00.000Z",
      compilerVersion: "1",
      documentHash: "late-hash",
      document,
    });
    await flushPromises();

    expect(wrapper.text()).not.toContain("Опубликована ревизия 99");
  });
});
