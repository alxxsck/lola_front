import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/shared/api/http/api-error";
import EventSchemaAuthoring from "./EventSchemaAuthoring.vue";

const mocks = vi.hoisted(() => ({
  getSchemaDraft: vi.fn(),
  saveSchemaDraft: vi.fn(),
  analyzeSchemaDraft: vi.fn(),
  publishSchemaDraft: vi.fn(),
  discardSchemaDraft: vi.fn(),
  createSchemaSuccessor: vi.fn(),
  getDefinition: vi.fn(),
}));

vi.mock("@/shared/api/repository/event-catalog", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/shared/api/repository/event-catalog")
  >()),
  eventCatalogRepository: mocks,
}));

const event = {
  definitionKeyId: "event-key-1",
  projectId: "project-1",
  code: "deposit.succeeded",
  lifecycle: "ACTIVE" as const,
  lifecycleVersion: 2,
  lifecycleUpdatedAt: "2026-07-22T09:00:00.000Z",
  metadata: {
    name: "Успешный депозит",
    description: null,
    concurrencyToken: "2026-07-22T09:00:00.000Z",
  },
  policy: {
    version: 3,
    updatedAt: "2026-07-22T09:00:00.000Z",
    enabled: true,
    clientIngestible: false,
    countsAsActivity: true,
  },
  currentSchema: {
    revisionId: "revision-4",
    revisionNumber: 4,
    payloadSchema: {
      type: "object",
      additionalProperties: false,
      properties: { amount: { type: "number" } },
      required: ["amount"],
    },
    publishedAt: "2026-07-22T08:00:00.000Z",
  },
  origin: "CUSTOM" as const,
  readOnly: false,
};

const draft = {
  id: "draft-1",
  definitionKeyId: event.definitionKeyId,
  baseRevisionId: event.currentSchema.revisionId,
  draftVersion: 1,
  payloadSchema: {
    ...event.currentSchema.payloadSchema,
    properties: {
      ...event.currentSchema.payloadSchema.properties,
      currency: { type: "string" },
    },
  },
  schemaHash: "hash-1",
  validation: { valid: true },
  updatedAt: "2026-07-22T10:00:00.000Z",
  changed: true,
};

const impact = {
  definitionKeyId: event.definitionKeyId,
  draftVersion: 1,
  baseRevisionId: event.currentSchema.revisionId,
  validation: { valid: true },
  compatibility: {
    classification: "FULL_TRANSITIVE_SAFE",
    producerCompatibility: "SAFE",
    consumerCompatibility: "SAFE",
    reasons: [],
  },
  impact: {
    consumers: [],
    activeWaits: [],
    summary: {
      consumerCount: 2,
      activeWaitCount: 0,
      blockingConsumerCount: 0,
      blockingActiveWaitCount: 0,
      legacyExactCount: 0,
    },
  },
};

function mountEditor() {
  return mount(EventSchemaAuthoring, {
    props: {
      projectId: "project-1",
      event,
      canEdit: true,
      canPublish: true,
    },
  });
}

function button(wrapper: ReturnType<typeof mountEditor>, label: string) {
  const found = wrapper.findAll("button").find((item) => item.text() === label);
  if (!found) throw new Error(`Button not found: ${label}`);
  return found;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("EventSchemaAuthoring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSchemaDraft.mockResolvedValue(null);
    mocks.saveSchemaDraft.mockResolvedValue(draft);
    mocks.analyzeSchemaDraft.mockResolvedValue(impact);
    mocks.publishSchemaDraft.mockResolvedValue({
      status: "SAFELY_PUBLISHED",
      definitionKeyId: event.definitionKeyId,
      previousRevisionId: event.currentSchema.revisionId,
      revisionId: "revision-5",
      revisionNumber: 5,
      schemaHash: "hash-1",
      compatibility: impact.compatibility,
      impact: impact.impact,
      automaticallyExtendedBindings: 2,
      automaticallyExtendedWaits: 0,
    });
    mocks.createSchemaSuccessor.mockResolvedValue({
      ...event,
      definitionKeyId: "event-key-semantic",
      code: "deposit.completed",
      metadata: { ...event.metadata, name: "Депозит завершён" },
      policy: { ...event.policy, enabled: false },
      currentSchema: { ...event.currentSchema, revisionNumber: 1 },
    });
    mocks.getDefinition.mockResolvedValue({
      ...event,
      currentSchema: {
        revisionId: "revision-5",
        revisionNumber: 5,
        payloadSchema: draft.payloadSchema,
        publishedAt: "2026-07-22T11:00:00.000Z",
      },
    });
  });

  it("runs current schema through save, impact and safe publication", async () => {
    const wrapper = mountEditor();
    await flushPromises();

    expect(mocks.getSchemaDraft).toHaveBeenCalledWith(
      "project-1",
      "event-key-1",
    );
    await wrapper.get('[data-test="add-field"]').trigger("click");
    const titles = wrapper.findAll('[data-test="field-title"]');
    const wireKeys = wrapper.findAll('[data-test="field-wire-key"]');
    await titles.at(-1)!.setValue("Валюта");
    await wireKeys.at(-1)!.setValue("currency");
    await button(wrapper, "Сохранить черновик").trigger("click");
    await flushPromises();
    expect(mocks.saveSchemaDraft).toHaveBeenCalledWith(
      "project-1",
      "event-key-1",
      expect.objectContaining({
        payloadSchema: expect.objectContaining({
          properties: expect.objectContaining({
            amount: { type: "number" },
            currency: expect.objectContaining({
              type: "string",
              title: "Валюта",
            }),
          }),
        }),
      }),
    );

    await button(wrapper, "Проверить влияние").trigger("click");
    await flushPromises();
    expect(mocks.analyzeSchemaDraft).toHaveBeenCalledWith(
      "project-1",
      "event-key-1",
      { expectedDraftVersion: 1 },
    );
    expect(wrapper.get('[data-test="compatibility-summary"]').text()).toContain(
      "Безопасное изменение",
    );
    expect(wrapper.get('[data-test="impact-summary"]').text()).toContain(
      "Зависимых consumers: 2",
    );

    await wrapper
      .get("#event-schema-publish-reason")
      .setValue("Добавлено необязательное поле currency");
    await button(wrapper, "Опубликовать версию 5").trigger("click");
    await flushPromises();
    expect(mocks.publishSchemaDraft).toHaveBeenCalledWith(
      "project-1",
      "event-key-1",
      {
        expectedDraftVersion: 1,
        expectedBaseRevisionId: "revision-4",
        reason: "Добавлено необязательное поле currency",
      },
    );
    expect(wrapper.emitted("published")?.[0]?.[0]).toMatchObject({
      revisionNumber: 5,
    });
    expect(wrapper.get('[data-test="publish-result"]').text()).toContain(
      "Продолжено consumers",
    );
    expect(wrapper.get('[data-test="publish-result"]').text()).toContain("2");
  });

  it("reports an indeterminate publish without fabricating server evidence", async () => {
    mocks.getSchemaDraft.mockResolvedValue(draft);
    mocks.publishSchemaDraft.mockRejectedValue(
      new ApiError(0, "Соединение прервано"),
    );
    const wrapper = mountEditor();
    await flushPromises();
    await button(wrapper, "Проверить влияние").trigger("click");
    await flushPromises();
    await wrapper
      .get("#event-schema-publish-reason")
      .setValue("Публикация с восстановлением ответа");
    await button(wrapper, "Опубликовать версию 5").trigger("click");
    await flushPromises();

    expect(mocks.getDefinition).toHaveBeenCalledWith(
      "project-1",
      "event-key-1",
    );
    expect(wrapper.get('[role="alert"]').text()).toContain(
      "Нельзя надёжно установить автора операции",
    );
    expect(wrapper.find('[data-test="publish-result"]').exists()).toBe(false);
    expect(wrapper.emitted("published")).toBeUndefined();
    expect(wrapper.emitted("publicationUncertain")?.[0]).toEqual([5]);
  });

  it("counts unextended active waits in post-publish warnings", async () => {
    mocks.getSchemaDraft.mockResolvedValue(draft);
    mocks.analyzeSchemaDraft.mockResolvedValue({
      ...impact,
      impact: {
        ...impact.impact,
        summary: { ...impact.impact.summary, activeWaitCount: 1 },
      },
    });
    mocks.publishSchemaDraft.mockResolvedValue({
      status: "SAFELY_PUBLISHED",
      definitionKeyId: event.definitionKeyId,
      previousRevisionId: event.currentSchema.revisionId,
      revisionId: "revision-5",
      revisionNumber: 5,
      schemaHash: "hash-1",
      compatibility: impact.compatibility,
      impact: {
        ...impact.impact,
        summary: { ...impact.impact.summary, activeWaitCount: 1 },
      },
      automaticallyExtendedBindings: 2,
      automaticallyExtendedWaits: 0,
    });
    const wrapper = mountEditor();
    await flushPromises();
    await button(wrapper, "Проверить влияние").trigger("click");
    await flushPromises();
    await wrapper
      .get("#event-schema-publish-reason")
      .setValue("Проверка предупреждений ожиданий");
    await button(wrapper, "Опубликовать версию 5").trigger("click");
    await flushPromises();

    expect(wrapper.get('[data-test="publish-result"]').text()).toContain(
      "Предупреждений1",
    );
  });

  it("freezes payload controls while a state-replacing save is pending", async () => {
    const pendingSave = deferred<typeof draft>();
    mocks.saveSchemaDraft.mockReturnValue(pendingSave.promise);
    const wrapper = mountEditor();
    await flushPromises();
    await wrapper.get('[data-test="add-field"]').trigger("click");
    const titles = wrapper.findAll('[data-test="field-title"]');
    const wireKeys = wrapper.findAll('[data-test="field-wire-key"]');
    await titles.at(-1)!.setValue("Валюта");
    await wireKeys.at(-1)!.setValue("currency");

    await button(wrapper, "Сохранить черновик").trigger("click");
    await wrapper.vm.$nextTick();
    expect(wrapper.get(".editor-lock").attributes("disabled")).toBeDefined();
    expect(
      wrapper
        .findAll('[data-test="field-title"]')[0]!
        .element.matches(":disabled"),
    ).toBe(true);

    pendingSave.resolve(draft);
    await flushPromises();
    expect(wrapper.get(".editor-lock").attributes("disabled")).toBeUndefined();
  });

  it("resumes a server draft and preserves local JSON after a stale save", async () => {
    mocks.getSchemaDraft.mockResolvedValue(draft);
    mocks.saveSchemaDraft.mockRejectedValue(
      new ApiError(
        409,
        "Черновик уже изменён другим администратором",
        undefined,
        undefined,
        "EVENT_SCHEMA_DRAFT_STALE",
      ),
    );
    const wrapper = mountEditor();
    await flushPromises();

    await wrapper
      .findAll('[data-test="field-title"]')[0]!
      .setValue("Локальная сумма");
    await button(wrapper, "Сохранить черновик").trigger("click");
    await flushPromises();

    expect(
      wrapper.findAll('[data-test="field-title"]')[0]!.element,
    ).toHaveProperty("value", "Локальная сумма");
    expect(wrapper.get('[role="alert"]').text()).toContain(
      "изменён другим администратором",
    );
    expect(wrapper.get(".conflict-panel").text()).toContain(
      "На сервере уже черновик v1",
    );
    await button(wrapper, "Продолжить с локальными полями").trigger("click");
    expect(
      wrapper.findAll('[data-test="field-title"]')[0]!.element,
    ).toHaveProperty("value", "Локальная сумма");
  });

  it("discards only the exact resumed draft and resets to the published schema", async () => {
    mocks.getSchemaDraft.mockResolvedValue(draft);
    const wrapper = mountEditor();
    await flushPromises();

    await button(wrapper, "Отменить черновик").trigger("click");
    await wrapper
      .get("#event-schema-discard-reason")
      .setValue("Изменение больше не требуется");
    await button(wrapper, "Удалить черновик").trigger("click");
    await flushPromises();

    expect(mocks.discardSchemaDraft).toHaveBeenCalledWith(
      "project-1",
      "event-key-1",
      { expectedDraftVersion: 1, reason: "Изменение больше не требуется" },
    );
    expect(
      wrapper
        .findAll('[data-test="field-wire-key"]')
        .map((field) => (field.element as HTMLInputElement).value),
    ).toEqual(["amount"]);
  });

  it("requires both explicit confirmations for a producer-breaking publish", async () => {
    mocks.getSchemaDraft.mockResolvedValue(draft);
    mocks.analyzeSchemaDraft.mockResolvedValue({
      ...impact,
      compatibility: {
        ...impact.compatibility,
        classification: "PRODUCER_BREAKING",
        producerCompatibility: "BREAKING",
        reasons: [
          {
            code: "REQUIRED_FIELD_ADDED",
            path: "/properties/currency",
            severity: "ERROR",
          },
        ],
      },
    });
    const wrapper = mountEditor();
    await flushPromises();

    await button(wrapper, "Проверить влияние").trigger("click");
    await flushPromises();
    await wrapper
      .get("#event-schema-publish-reason")
      .setValue("Обязательная валюта согласована");
    const publish = button(wrapper, "Опубликовать версию 5");
    expect(publish.attributes("disabled")).toBeDefined();

    const confirmations = wrapper.findAll(
      '.publish-form input[type="checkbox"]',
    );
    expect(confirmations).toHaveLength(2);
    await confirmations[0]!.setValue(true);
    expect(publish.attributes("disabled")).toBeDefined();
    await confirmations[1]!.setValue(true);
    await publish.trigger("click");
    await flushPromises();

    expect(mocks.publishSchemaDraft).toHaveBeenCalledWith(
      "project-1",
      "event-key-1",
      expect.objectContaining({
        confirmBreakingChange: true,
        producerMigrationConfirmed: true,
      }),
    );
  });

  it("never enables publish while scenarios or active waits block the revision", async () => {
    mocks.getSchemaDraft.mockResolvedValue(draft);
    mocks.analyzeSchemaDraft.mockResolvedValue({
      ...impact,
      compatibility: {
        ...impact.compatibility,
        classification: "CONSUMER_BREAKING",
        consumerCompatibility: "BREAKING",
      },
      impact: {
        ...impact.impact,
        summary: {
          ...impact.impact.summary,
          blockingConsumerCount: 1,
          blockingActiveWaitCount: 2,
        },
      },
    });
    const wrapper = mountEditor();
    await flushPromises();

    await button(wrapper, "Проверить влияние").trigger("click");
    await flushPromises();
    await wrapper.get("#event-schema-publish-reason").setValue("Breaking");
    for (const confirmation of wrapper.findAll('input[type="checkbox"]')) {
      await confirmation.setValue(true);
    }

    expect(wrapper.get(".publish-blocker").text()).toContain(
      "зависимости в сценариях или активных ожиданиях",
    );
    expect(
      button(wrapper, "Опубликовать версию 5").attributes("disabled"),
    ).toBeDefined();
    expect(mocks.publishSchemaDraft).not.toHaveBeenCalled();
  });

  it("renders archived definitions without any schema mutation controls", async () => {
    const wrapper = mount(EventSchemaAuthoring, {
      props: {
        projectId: "project-1",
        event: { ...event, lifecycle: "ARCHIVED", readOnly: true },
        canEdit: true,
        canPublish: true,
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("доступно только для чтения");
    expect(wrapper.find('[data-test="add-field"]').exists()).toBe(false);
    expect(
      wrapper
        .findAll("button")
        .some((item) =>
          ["Сохранить черновик", "Проверить влияние"].includes(item.text()),
        ),
    ).toBe(false);
  });

  it("keeps draft editing available but disables publish without publish permission", async () => {
    mocks.getSchemaDraft.mockResolvedValue(draft);
    const wrapper = mount(EventSchemaAuthoring, {
      props: {
        projectId: "project-1",
        event,
        canEdit: true,
        canPublish: false,
      },
    });
    await flushPromises();

    await button(
      wrapper as ReturnType<typeof mountEditor>,
      "Проверить влияние",
    ).trigger("click");
    await flushPromises();
    await wrapper
      .get("#event-schema-publish-reason")
      .setValue("Готово к публикации");

    expect(wrapper.text()).toContain("нет отдельного права публиковать");
    expect(
      button(
        wrapper as ReturnType<typeof mountEditor>,
        "Опубликовать версию 5",
      ).attributes("disabled"),
    ).toBeDefined();
  });

  it("does not misclassify a publication blocker as an OCC conflict", async () => {
    mocks.getSchemaDraft.mockResolvedValue(draft);
    mocks.publishSchemaDraft.mockRejectedValue(
      new ApiError(
        409,
        "Появилась новая runtime-зависимость",
        {
          compatibility: {
            ...impact.compatibility,
            classification: "CONSUMER_BREAKING",
          },
          impact: {
            ...impact.impact,
            summary: {
              ...impact.impact.summary,
              blockingConsumerCount: 1,
            },
          },
        },
        undefined,
        "EVENT_SCHEMA_PUBLISH_BLOCKED",
      ),
    );
    const wrapper = mountEditor();
    await flushPromises();
    await button(wrapper, "Проверить влияние").trigger("click");
    await flushPromises();
    await wrapper.get("#event-schema-publish-reason").setValue("Публикация");
    await button(wrapper, "Опубликовать версию 5").trigger("click");
    await flushPromises();

    expect(wrapper.find(".conflict-panel").exists()).toBe(false);
    expect(wrapper.get(".publish-blocker").text()).toContain("зависимости");
  });

  it("creates a disabled successor Event Definition for a semantic break", async () => {
    mocks.getSchemaDraft.mockResolvedValue(draft);
    mocks.analyzeSchemaDraft.mockResolvedValue({
      ...impact,
      compatibility: {
        ...impact.compatibility,
        classification: "SEMANTIC_BREAKING",
        producerCompatibility: "BREAKING",
        consumerCompatibility: "BREAKING",
        reasons: [
          {
            code: "EVENT_MEANING_CHANGED",
            path: "/",
            severity: "BREAKING",
          },
        ],
      },
    });
    const wrapper = mountEditor();
    await flushPromises();

    await button(wrapper, "Проверить влияние").trigger("click");
    await flushPromises();
    expect(wrapper.find(".publish-form").exists()).toBe(false);
    await wrapper.get("#semantic-event-name").setValue("Депозит завершён");
    await wrapper.get("#semantic-event-code").setValue("deposit.completed");
    await button(wrapper, "Создать новое событие").trigger("click");
    await flushPromises();

    expect(mocks.createSchemaSuccessor).toHaveBeenCalledWith(
      "project-1",
      "event-key-1",
      {
        code: "deposit.completed",
        name: "Депозит завершён",
        expectedDraftVersion: 1,
        expectedBaseRevisionId: "revision-4",
      },
    );
    expect(wrapper.emitted("created")?.[0]?.[0]).toMatchObject({
      definitionKeyId: "event-key-semantic",
    });
  });

  it("never creates a semantic successor from schema edited after impact analysis", async () => {
    mocks.getSchemaDraft.mockResolvedValue(draft);
    mocks.analyzeSchemaDraft.mockResolvedValue({
      ...impact,
      compatibility: {
        ...impact.compatibility,
        classification: "SEMANTIC_BREAKING",
      },
    });
    const wrapper = mountEditor();
    await flushPromises();
    await button(wrapper, "Проверить влияние").trigger("click");
    await flushPromises();
    await wrapper.get('[data-test="add-field"]').trigger("click");
    await wrapper.get("#semantic-event-code").setValue("deposit.completed");

    expect(
      button(wrapper, "Создать новое событие").attributes("disabled"),
    ).toBeDefined();
    await button(wrapper, "Создать новое событие").trigger("click");
    expect(mocks.createSchemaSuccessor).not.toHaveBeenCalled();
  });

  it("rejects semantic successor when the source draft changed remotely", async () => {
    mocks.getSchemaDraft.mockResolvedValue(draft);
    mocks.analyzeSchemaDraft.mockResolvedValue({
      ...impact,
      compatibility: {
        ...impact.compatibility,
        classification: "SEMANTIC_BREAKING",
      },
    });
    mocks.createSchemaSuccessor.mockRejectedValue(
      new ApiError(
        409,
        "Черновик изменился",
        undefined,
        "request-1",
        "EVENT_SCHEMA_DRAFT_STALE",
      ),
    );
    const wrapper = mountEditor();
    await flushPromises();
    await button(wrapper, "Проверить влияние").trigger("click");
    await flushPromises();
    await wrapper.get("#semantic-event-name").setValue("Депозит завершён");
    await wrapper.get("#semantic-event-code").setValue("deposit.completed");
    await button(wrapper, "Создать новое событие").trigger("click");
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain(
      "Черновик изменился",
    );
    expect(wrapper.emitted("created")).toBeUndefined();
  });
});
