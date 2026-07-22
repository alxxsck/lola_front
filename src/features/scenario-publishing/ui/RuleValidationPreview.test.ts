import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ScenarioAuthoringContract } from "@/shared/api/repository/scenario-authoring";
import type {
  RuleDomainContext,
  RuleDraft,
} from "@/features/scenario-rules/model";
import type {
  AudienceDomainContext,
  AudienceDraft,
} from "@/features/scenario-audience/model";
import RuleValidationPreview from "./RuleValidationPreview.vue";

const mocks = vi.hoisted(() => ({
  validateRule: vi.fn(),
  previewRule: vi.fn(),
  getEventLogPage: vi.fn(),
}));

vi.mock(
  "@/shared/api/repository/scenario-authoring",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/shared/api/repository/scenario-authoring")
    >()),
    scenarioAuthoringRepository: {
      validateRule: mocks.validateRule,
      previewRule: mocks.previewRule,
    },
  }),
);

vi.mock("@/shared/api/repository", () => ({
  repository: { getEventLogPage: mocks.getEventLogPage },
}));

const contract: ScenarioAuthoringContract = {
  projectId: "project-1",
  revision: "catalog-1",
  version: 1,
  events: [
    {
      code: "page.opened",
      definitionId: "event-page",
      definitionKeyId: "key-page",
      name: "Открыта страница",
      schemaVersion: 1,
      aggregateMeasures: [],
      fields: [
        {
          fieldKey: "page.name",
          label: "Страница",
          path: "event.payload.page",
          required: true,
          valueType: "string",
          control: { type: "select", options: ["promotions"] },
          allowedValues: ["promotions"],
          capabilities: {
            eventField: { operators: ["eq"] },
            aggregateFilter: { operators: ["eq"] },
            aggregateMeasure: { measures: [] },
          },
        },
      ],
    },
  ],
};

const context: RuleDomainContext = {
  triggerEventDefinitionId: "event-page",
  triggerEventCode: "page.opened",
  mode: "initialEligibility",
  contract,
};
const draft: RuleDraft = {
  version: 1,
  root: {
    nodeId: "node-page",
    kind: "eventField",
    eventCode: "page.opened",
    fieldKey: "page.name",
    operator: "eq",
    value: "promotions",
  },
};
const audienceDraft: AudienceDraft = {
  version: 1,
  root: {
    nodeId: "audience-locale",
    kind: "locale",
    operator: "eq",
    value: "ru-RU",
  },
};
const audienceContext: AudienceDomainContext = {
  segments: [],
  catalog: {
    version: 1,
    revision: "audience-catalog-1",
    locales: [{ code: "ru-RU", language: "ru", label: "Русский" }],
    localeSource: {
      operators: ["eq"],
      control: "SELECT",
      authoringAvailability: "AVAILABLE",
    },
    languageSource: {
      operators: ["eq"],
      control: "SELECT",
      authoringAvailability: "AVAILABLE",
    },
    country: {
      source: "profile.country",
      valueType: "countryCode",
      semantics: "ISO_3166_1_ALPHA_2_UPPERCASE",
      operators: ["eq"],
      control: "COUNTRY_CODE",
      authoringAvailability: "AVAILABLE",
    },
    attributes: [],
    segmentSource: {
      operators: ["is_member"],
      searchEndpoint: "/segments",
      control: "SEARCH",
      authoringAvailability: "AVAILABLE",
    },
    snapshotPolicy: {
      initialEvaluation: "RUN_START",
      missingOrNull: "NO_MATCH_EXCEPT_NOT_EXISTS",
      deletedDefinition: "PINNED_SNAPSHOT_CONTINUES",
      unavailableSource: "PUBLISH_REJECTED_EXPLAIN_UNAVAILABLE",
      segmentRevision: "PINNED_REVISION",
      persistence: "SNAPSHOT_WITH_SEPARATE_LAST_RECHECK",
      recheckTrigger: "DELIVERY_RECHECK_ELIGIBILITY",
    },
  },
};
const eventLog = {
  id: "log-1",
  eventCode: "page.opened",
  eventName: "Открыта страница",
  eventDefinitionId: "event-page",
  eventDefinitionKeyId: "event-page-key",
  eventVersion: 1,
  ingestionPolicyVersion: 1,
  ingestionPolicySnapshot: { enabled: true },
  userId: "user-1",
  userExternalId: "customer-1",
  source: "SERVER" as const,
  status: "PROCESSED" as const,
  occurredAt: "2026-07-18T09:59:59.000Z",
  receivedAt: "2026-07-18T10:00:00.000Z",
  payload: { page: "promotions" },
  context: {},
};
const aggregateContract: ScenarioAuthoringContract = {
  ...contract,
  events: [
    ...contract.events,
    {
      code: "deposit.succeeded",
      definitionId: "event-deposit",
      definitionKeyId: "key-deposit",
      name: "Успешный депозит",
      schemaVersion: 2,
      aggregateMeasures: [
        {
          measure: "count",
          field: "none",
          resultType: "integer",
          compareValueType: "integer",
          compareOperators: ["eq", "neq", "gt", "gte", "lt", "lte"],
        },
      ],
      fields: [],
    },
  ],
};
const aggregateContext: RuleDomainContext = {
  ...context,
  contract: aggregateContract,
};
const aggregateDraft: RuleDraft = {
  version: 1,
  root: {
    nodeId: "node-deposits",
    kind: "eventAggregate",
    eventCode: "deposit.succeeded",
    measure: "count",
    filters: [],
    window: { kind: "last", durationMs: 86_400_000, boundary: "beforeTrigger" },
    compare: { operator: "gte", value: 2 },
  },
};

function mountPreview(
  props: Partial<InstanceType<typeof RuleValidationPreview>["$props"]> = {},
) {
  return mount(RuleValidationPreview, {
    props: {
      projectId: "project-1",
      draft,
      context,
      draftRevision: 1,
      ...props,
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

describe("RuleValidationPreview", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.validateRule.mockResolvedValue({
      valid: true,
      issues: [],
      dependencies: [],
      cost: null,
      warnings: [],
    });
    mocks.getEventLogPage.mockResolvedValue({ items: [], nextCursor: null });
  });

  afterEach(() => vi.useRealTimers());

  it("debounces automatic validation of a serialized draft", async () => {
    const wrapper = mountPreview();

    expect(wrapper.get('[role="status"]').text()).toContain(
      "Подготовка проверки",
    );
    await vi.advanceTimersByTimeAsync(400);
    await flushPromises();

    expect(mocks.validateRule).toHaveBeenCalledWith(
      "project-1",
      {
        version: 1,
        root: {
          kind: "eventField",
          eventCode: "page.opened",
          fieldKey: "page.name",
          operator: "eq",
          value: "promotions",
        },
      },
      { signal: expect.any(AbortSignal) },
    );
    expect(wrapper.text()).toContain("Правило прошло проверку");
  });

  it("keeps the latest validation when an aborted request resolves late", async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    mocks.validateRule
      .mockImplementationOnce((_projectId, _rule, options) => {
        expect(options.signal.aborted).toBe(false);
        return first.promise;
      })
      .mockImplementationOnce(() => second.promise);
    const wrapper = mountPreview();
    await vi.advanceTimersByTimeAsync(400);

    await wrapper.setProps({ draftRevision: 2 });
    await vi.advanceTimersByTimeAsync(400);
    second.resolve({
      valid: true,
      issues: [],
      dependencies: [],
      cost: null,
      warnings: [],
    });
    await flushPromises();
    expect(wrapper.text()).toContain("Правило прошло проверку");

    first.resolve({
      valid: false,
      issues: [{ code: "STALE", path: "root.value", message: "Старая ошибка" }],
      dependencies: [],
      cost: null,
      warnings: [],
    });
    await flushPromises();
    expect(wrapper.text()).not.toContain("Старая ошибка");
    expect(wrapper.text()).toContain("Правило прошло проверку");
  });

  it("maps backend paths to a focus-node action", async () => {
    mocks.validateRule.mockResolvedValue({
      valid: false,
      issues: [
        {
          code: "VALUE_NOT_ALLOWED",
          path: "root.value",
          message: "Выберите другое значение",
        },
      ],
      dependencies: [],
      cost: null,
      warnings: [],
    });
    const wrapper = mountPreview();
    await vi.advanceTimersByTimeAsync(400);
    await flushPromises();

    expect(wrapper.text()).toContain("Выберите другое значение");
    await wrapper
      .get('ul[aria-label="Ошибки правила"] button')
      .trigger("click");

    expect(wrapper.emitted("focus-node")).toEqual([
      [
        {
          nodeId: "node-page",
          fieldPath: "value",
          message: "Выберите другое значение",
        },
      ],
    ]);
  });

  it("previews only against a selected project Event Log id", async () => {
    mocks.getEventLogPage.mockResolvedValue({
      items: [eventLog],
      nextCursor: null,
    });
    mocks.previewRule.mockResolvedValue({
      valid: true,
      matched: true,
      explanation: {
        kind: "eventField",
        matched: true,
        actual: { visibility: "VISIBLE", value: "promotions" },
        expected: { visibility: "REDACTED" },
      },
      issues: [],
      dependencies: [],
      cost: {
        class: "LOW",
        leaves: 1,
        aggregateLeaves: 0,
        historyWindowDays: 0,
      },
      warnings: [],
    });
    const wrapper = mountPreview();
    await flushPromises();

    expect(mocks.getEventLogPage).toHaveBeenCalledWith("project-1", {
      eventCode: ["page.opened"],
      limit: 25,
    });
    await wrapper.get('input[type="radio"][value="log-1"]').setValue();
    await wrapper
      .get('button[aria-label="Проверить правило на событии"]')
      .trigger("click");
    await flushPromises();

    expect(mocks.previewRule).toHaveBeenCalledWith(
      "project-1",
      {
        version: 1,
        root: {
          kind: "eventField",
          eventCode: "page.opened",
          fieldKey: "page.name",
          operator: "eq",
          value: "promotions",
        },
      },
      { kind: "eventLog", eventLogId: "log-1" },
      { signal: expect.any(AbortSignal) },
    );
    expect(wrapper.text()).toContain("Условие совпало");
    expect(wrapper.text()).toContain("promotions");
    expect(wrapper.text()).toContain("Скрыто из-за чувствительности данных");
  });

  it("validates and previews Audience separately with redaction-safe explanations", async () => {
    mocks.getEventLogPage.mockResolvedValue({
      items: [eventLog],
      nextCursor: null,
    });
    mocks.validateRule.mockResolvedValue({
      valid: false,
      issues: [],
      dependencies: [],
      cost: null,
      warnings: [],
      audience: {
        valid: false,
        issues: [
          {
            code: "AUDIENCE_VALUE_INVALID",
            path: "root.value",
            message: "Locale недоступен",
          },
        ],
        dependencies: { attributeRevisionIds: [], segmentRevisionIds: [] },
        cost: null,
        warnings: [],
      },
    });
    const wrapper = mountPreview({
      audienceDraft,
      audienceContext,
      audienceDraftRevision: 1,
    });
    await vi.advanceTimersByTimeAsync(400);
    await flushPromises();

    expect(mocks.validateRule).toHaveBeenCalledWith(
      "project-1",
      expect.any(Object),
      { signal: expect.any(AbortSignal) },
      { version: 1, root: { kind: "locale", operator: "eq", value: "ru-RU" } },
    );
    await wrapper
      .get('ul[aria-label="Ошибки аудитории"] button')
      .trigger("click");
    expect(wrapper.emitted("focus-audience-node")).toEqual([
      [
        {
          nodeId: "audience-locale",
          fieldPath: "value",
          message: "Locale недоступен",
        },
      ],
    ]);

    mocks.previewRule.mockResolvedValue({
      valid: true,
      matched: true,
      explanation: { kind: "eventField", matched: true },
      issues: [],
      dependencies: [],
      cost: null,
      warnings: [],
      audience: {
        valid: true,
        matched: true,
        issues: [],
        dependencies: {
          attributeRevisionIds: ["attribute-revision-7"],
          segmentRevisionIds: ["segment-revision-4"],
        },
        cost: { leaves: 1, segmentLeaves: 0 },
        warnings: [{ code: "AUDIENCE_LOOKUP_COST" }],
        explanation: {
          kind: "locale",
          matched: true,
          actual: { visibility: "REDACTED" },
          expected: { visibility: "VISIBLE", value: "ru-RU" },
          children: [
            {
              kind: "userAttribute",
              matched: true,
              definitionId: "attribute-revision-7",
              actual: { visibility: "REDACTED" },
            },
          ],
        },
      },
    });
    await wrapper.get('input[type="radio"][value="log-1"]').setValue();
    await wrapper
      .get('button[aria-label="Проверить правило на событии"]')
      .trigger("click");
    await flushPromises();
    expect(mocks.previewRule).toHaveBeenCalledWith(
      "project-1",
      expect.any(Object),
      { kind: "eventLog", eventLogId: "log-1" },
      { signal: expect.any(AbortSignal) },
      { version: 1, root: { kind: "locale", operator: "eq", value: "ru-RU" } },
    );
    expect(wrapper.text()).toContain("Аудитория подходит");
    expect(wrapper.text()).toContain("Скрыто из-за чувствительности данных");
    expect(wrapper.text()).toContain("attribute-revision-7");
    expect(wrapper.text()).toContain("segment-revision-4");
    expect(wrapper.text()).toContain("Аудитория · AUDIENCE_LOOKUP_COST");
  });

  it("resets the anchor and pagination when the trigger Event changes", async () => {
    mocks.getEventLogPage
      .mockResolvedValueOnce({ items: [eventLog], nextCursor: "cursor-2" })
      .mockResolvedValueOnce({ items: [], nextCursor: null });
    const wrapper = mountPreview();
    await flushPromises();
    await wrapper.get('input[type="radio"][value="log-1"]').setValue();

    await wrapper.setProps({
      context: {
        ...context,
        triggerEventDefinitionId: "event-purchase",
        triggerEventCode: "purchase.completed",
      },
    });
    await flushPromises();

    expect(mocks.getEventLogPage).toHaveBeenLastCalledWith("project-1", {
      eventCode: ["purchase.completed"],
      limit: 25,
    });
    expect(wrapper.find('input[type="radio"][value="log-1"]').exists()).toBe(
      false,
    );
    expect(
      wrapper
        .get('button[aria-label="Проверить правило на событии"]')
        .attributes(),
    ).toHaveProperty("disabled");
    expect(wrapper.text()).toContain("Страница 1");
  });

  it("retries the exact failed cursor page and can return through cursor history", async () => {
    mocks.getEventLogPage
      .mockResolvedValueOnce({ items: [eventLog], nextCursor: "cursor-2" })
      .mockRejectedValueOnce(new Error("Журнал временно недоступен"))
      .mockResolvedValueOnce({ items: [eventLog], nextCursor: null })
      .mockResolvedValueOnce({ items: [eventLog], nextCursor: "cursor-2" });
    const wrapper = mountPreview();
    await flushPromises();

    await wrapper
      .get('nav[aria-label="Страницы событий"] button:last-child')
      .trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Журнал временно недоступен");

    await wrapper.get('.anchor-section [role="alert"] button').trigger("click");
    await flushPromises();
    expect(mocks.getEventLogPage.mock.calls.slice(0, 3)).toEqual([
      ["project-1", { eventCode: ["page.opened"], limit: 25 }],
      [
        "project-1",
        { eventCode: ["page.opened"], limit: 25, cursor: "cursor-2" },
      ],
      [
        "project-1",
        { eventCode: ["page.opened"], limit: 25, cursor: "cursor-2" },
      ],
    ]);
    expect(wrapper.text()).toContain("Страница 2");

    await wrapper
      .get('nav[aria-label="Страницы событий"] button:first-child')
      .trigger("click");
    await flushPromises();
    expect(mocks.getEventLogPage).toHaveBeenLastCalledWith("project-1", {
      eventCode: ["page.opened"],
      limit: 25,
    });
  });

  it("applies Event Log server filters while keeping the trigger fixed", async () => {
    const wrapper = mountPreview();
    await flushPromises();

    await wrapper
      .get('input[aria-label="ID пользователя для проверки"]')
      .setValue(" customer-42 ");
    await wrapper
      .get('select[aria-label="Источник события для проверки"]')
      .setValue("FRONTEND");
    await wrapper
      .get('select[aria-label="Статус события для проверки"]')
      .setValue("FAILED");
    await wrapper
      .get('input[aria-label="Получено с для проверки"]')
      .setValue("2026-07-18T10:00");
    await wrapper
      .get('select[aria-label="Размер страницы событий"]')
      .setValue("50");
    await wrapper
      .get('button[aria-label="Применить фильтры событий"]')
      .trigger("click");
    await flushPromises();

    expect(mocks.getEventLogPage).toHaveBeenLastCalledWith("project-1", {
      eventCode: ["page.opened"],
      externalUserId: "customer-42",
      source: ["FRONTEND"],
      status: ["FAILED"],
      receivedFrom: new Date("2026-07-18T10:00").toISOString(),
      limit: 50,
    });
  });

  it("hides Event Logs from another revision even when the event code is the same", async () => {
    mocks.getEventLogPage.mockResolvedValueOnce({
      items: [
        { ...eventLog, id: "log-old", eventDefinitionId: "event-page-old" },
        eventLog,
      ],
      nextCursor: null,
    });

    const wrapper = mountPreview();
    await flushPromises();

    expect(wrapper.find('input[value="log-old"]').exists()).toBe(false);
    expect(wrapper.find('input[value="log-1"]').exists()).toBe(true);
  });

  it("zips aggregate explanation details with the draft and shows review metadata", async () => {
    mocks.getEventLogPage.mockResolvedValue({
      items: [eventLog],
      nextCursor: null,
    });
    mocks.previewRule.mockResolvedValue({
      valid: true,
      matched: true,
      explanation: {
        kind: "eventAggregate",
        matched: true,
        actual: { visibility: "VISIBLE", value: "3" },
        expected: { visibility: "VISIBLE", value: 2 },
        matchedCount: "3",
        window: {
          from: "2026-07-17T10:00:00.000Z",
          to: "2026-07-18T10:00:00.000Z",
        },
      },
      issues: [],
      dependencies: [
        {
          eventCode: "deposit.succeeded",
          definitionKeyId: "key-deposit",
          eventDefinitionRevisionId: "event-deposit",
          schemaVersion: 2,
        },
      ],
      cost: {
        class: "MEDIUM",
        leaves: 1,
        aggregateLeaves: 1,
        historyWindowDays: 1,
      },
      warnings: [{ code: "HISTORY_WINDOW_NOTICE" }],
    });
    const wrapper = mountPreview({
      draft: aggregateDraft,
      context: aggregateContext,
    });
    await flushPromises();
    await wrapper.get('input[type="radio"][value="log-1"]').setValue();
    await wrapper
      .get('button[aria-label="Проверить правило на событии"]')
      .trigger("click");
    await flushPromises();

    const explanation = wrapper.get('ol[aria-label="Объяснение результата"]');
    expect(explanation.text()).toContain("Найдено событий3");
    expect(explanation.text()).toContain("Окно");
    expect(
      wrapper.get('section[aria-label="Стоимость и зависимости"]').text(),
    ).toContain("MEDIUM");
    expect(wrapper.text()).toContain("deposit.succeeded · schema v2");
    expect(wrapper.text()).toContain("HISTORY_WINDOW_NOTICE");
  });

  it("shows a contract state instead of pairing a mismatched explanation tree", async () => {
    mocks.getEventLogPage.mockResolvedValue({
      items: [eventLog],
      nextCursor: null,
    });
    mocks.previewRule.mockResolvedValue({
      valid: true,
      matched: false,
      explanation: { kind: "activityDayStreak", matched: false },
      issues: [],
      dependencies: [],
      cost: null,
      warnings: [],
    });
    const wrapper = mountPreview();
    await flushPromises();
    await wrapper.get('input[type="radio"][value="log-1"]').setValue();
    await wrapper
      .get('button[aria-label="Проверить правило на событии"]')
      .trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain(
      "Сервер вернул ответ, который пока нельзя показать",
    );
    expect(
      wrapper.find('ol[aria-label="Объяснение результата"]').exists(),
    ).toBe(false);
  });

  it("clears an obsolete preview when the catalog revision changes", async () => {
    mocks.getEventLogPage.mockResolvedValue({
      items: [eventLog],
      nextCursor: null,
    });
    mocks.previewRule.mockResolvedValue({
      valid: true,
      matched: true,
      explanation: { kind: "eventField", matched: true },
      issues: [],
      dependencies: [],
      cost: null,
      warnings: [],
    });
    const wrapper = mountPreview();
    await flushPromises();
    await wrapper.get('input[type="radio"][value="log-1"]').setValue();
    await wrapper
      .get('button[aria-label="Проверить правило на событии"]')
      .trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Условие совпало");

    await wrapper.setProps({
      context: { ...context, contract: { ...contract, revision: "catalog-2" } },
    });
    await flushPromises();

    expect(wrapper.text()).not.toContain("Условие совпало");
  });

  it("clears a selected Event Log when refresh no longer returns it", async () => {
    mocks.getEventLogPage
      .mockResolvedValueOnce({ items: [eventLog], nextCursor: null })
      .mockResolvedValueOnce({ items: [], nextCursor: null });
    const wrapper = mountPreview();
    await flushPromises();
    await wrapper.get('input[type="radio"][value="log-1"]').setValue();
    expect(
      wrapper
        .get('button[aria-label="Проверить правило на событии"]')
        .attributes(),
    ).not.toHaveProperty("disabled");

    await wrapper
      .get(".anchor-section .section-header button")
      .trigger("click");
    await flushPromises();

    expect(
      wrapper
        .get('button[aria-label="Проверить правило на событии"]')
        .attributes(),
    ).toHaveProperty("disabled");
  });
});
