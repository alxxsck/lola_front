import { flushPromises, shallowMount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ScenarioRuleBuilder } from "@/features/scenario-rules/ui";
import type { RuleDraft } from "@/features/scenario-rules/model";
import RuleValidationPreview from "@/features/scenario-publishing/ui/RuleValidationPreview.vue";
import ScenarioPublishPanel from "@/features/scenario-publishing/ui/ScenarioPublishPanel.vue";
import { DeliveryPolicyEditor } from "@/features/scenario-delivery/ui";
import {
  AudienceRuleBuilder,
  SegmentManager,
} from "@/features/scenario-audience/ui";
import type { AudienceDraft } from "@/features/scenario-audience/model";
import type { ScenarioAuthoringContract } from "@/shared/api/repository/scenario-authoring";
import ScenarioEditorPage from "./ScenarioEditorPage.vue";

const mocks = vi.hoisted(() => ({
  route: { params: { scenarioId: "scenario-1" } } as {
    params: { scenarioId: string };
  },
  push: vi.fn(),
  replace: vi.fn(),
  getScenarios: vi.fn(),
  getEvents: vi.fn(),
  getElements: vi.fn(),
  saveScenario: vi.fn(),
  updateScenarioMetadata: vi.fn(),
  getContract: vi.fn(),
  getScenarioDocument: vi.fn(),
  saveScenarioDraft: vi.fn(),
  searchSegments: vi.fn(),
  ensureLoaded: vi.fn(),
  guardDirty: null as { value: boolean } | null,
  routeLeaveGuards: [] as Array<() => boolean>,
  role: "OWNER" as "OWNER" | "ADMIN" | "EDITOR" | "VIEWER",
}));

vi.mock("vue-router", () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  onBeforeRouteLeave: (guard: () => boolean) =>
    mocks.routeLeaveGuards.push(guard),
}));

vi.mock("@/features/auth/auth.store", () => ({
  useAuthStore: () => ({
    project: { id: "project-1" },
    get user() {
      return { role: mocks.role };
    },
  }),
}));

vi.mock("@/features/actions/action-definitions.store", () => ({
  useActionDefinitionsStore: () => ({
    forProject: () => [],
    ensureLoaded: mocks.ensureLoaded,
  }),
}));

vi.mock("@/shared/api/repository", () => ({
  repository: {
    getScenarios: mocks.getScenarios,
    getEvents: mocks.getEvents,
    getElements: mocks.getElements,
    saveScenario: mocks.saveScenario,
    updateScenarioMetadata: mocks.updateScenarioMetadata,
  },
}));

vi.mock(
  "@/shared/api/repository/scenario-authoring",
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import("@/shared/api/repository/scenario-authoring")
      >();
    return {
      ...original,
      scenarioAuthoringRepository: {
        getContract: mocks.getContract,
        getScenarioDocument: mocks.getScenarioDocument,
        saveScenarioDraft: mocks.saveScenarioDraft,
        searchSegments: mocks.searchSegments,
      },
    };
  },
);

vi.mock("@/shared/lib/use-unsaved-changes-guard", () => ({
  useUnsavedChangesGuard: (dirty: { value: boolean }) => {
    mocks.guardDirty = dirty;
    return { confirmDiscard: () => true };
  },
}));

vi.mock(
  "@/features/scenarios/model/scenario-graph",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/features/scenarios/model/scenario-graph")
    >()),
    validateScenarioGraph: () => [],
  }),
);

const event = {
  id: "event-revision-1",
  projectId: "project-1",
  code: "page.opened",
  name: "Открыта страница",
  version: 1,
  payloadSchema: { type: "object" },
  clientIngestible: true,
  countsAsActivity: true,
  enabled: true,
};

const scenario = {
  id: "scenario-1",
  projectId: "project-1",
  code: "welcome",
  name: "Welcome",
  eventDefinitionId: event.id,
  status: "DRAFT",
  conversationPolicy: "create_new",
  priority: 0,
  conditions: [],
  actions: [],
};

const contract: ScenarioAuthoringContract = {
  projectId: "project-1",
  revision: "catalog-1",
  version: 1,
  events: [
    {
      code: event.code,
      definitionId: event.id,
      definitionKeyId: "event-key-1",
      name: event.name,
      schemaVersion: 1,
      fields: [],
      aggregateMeasures: [],
    },
  ],
  audience: {
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

function mountPage() {
  return shallowMount(ScenarioEditorPage, {
    global: {
      stubs: {
        VueFlow: { template: '<div data-test="vue-flow"><slot /></div>' },
        Background: true,
        Controls: true,
        Message: { template: '<div class="message-stub"><slot /></div>' },
      },
    },
  });
}

function stageButton(wrapper: ReturnType<typeof mountPage>, label: string) {
  return wrapper
    .findAll(".studio-stages button")
    .find((button) => button.find("strong").text() === label)!;
}

describe("ScenarioEditorPage V2 rule journey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.routeLeaveGuards.length = 0;
    mocks.route.params.scenarioId = "scenario-1";
    mocks.role = "OWNER";
    mocks.getScenarios.mockResolvedValue([scenario]);
    mocks.getEvents.mockResolvedValue([event]);
    mocks.getElements.mockResolvedValue([]);
    mocks.ensureLoaded.mockResolvedValue([]);
    mocks.getContract.mockResolvedValue(contract);
    mocks.getScenarioDocument.mockResolvedValue({
      scenarioId: scenario.id,
      projectId: "project-1",
      code: scenario.code,
      name: scenario.name,
      status: scenario.status,
      triggerEventDefinitionRevisionId: event.id,
      currentRevisionId: null,
      editable: true,
      source: undefined,
      draft: undefined,
      createdAt: "now",
      updatedAt: "now",
    });
    mocks.saveScenarioDraft.mockResolvedValue({
      id: "draft-1",
      version: 1,
      baseRevisionId: null,
      catalogRevision: contract.revision,
      deliveryPolicy: { kind: "IMMEDIATE" },
      graph: { actions: [] },
      createdAt: "now",
      updatedAt: "now",
    });
    mocks.searchSegments.mockResolvedValue({ items: [], nextCursor: null });
    mocks.saveScenario.mockResolvedValue(scenario);
    mocks.updateScenarioMetadata.mockResolvedValue(scenario);
  });

  it("keeps Trigger, Audience, Eligibility, Actions and Delivery as explicit stages", async () => {
    const wrapper = mountPage();
    await flushPromises();

    expect(
      wrapper
        .findAll(".studio-stages button strong")
        .map((item) => item.text()),
    ).toEqual(["Запуск", "Аудитория", "Условия", "Действия", "Доставка"]);
    expect(wrapper.text()).toContain("Событие запуска");

    await stageButton(wrapper, "Аудитория").trigger("click");
    expect(wrapper.findComponent(AudienceRuleBuilder).exists()).toBe(true);
    expect(wrapper.findComponent(SegmentManager).exists()).toBe(false);
    expect(wrapper.text()).toContain("Сегменты живут в отдельной библиотеке");
    expect(stageButton(wrapper, "Аудитория").text()).not.toContain(
      "Пока недоступна",
    );
  });

  it("restores the durable source document and observed concurrency versions after reload", async () => {
    mocks.getScenarioDocument.mockResolvedValueOnce({
      scenarioId: scenario.id,
      projectId: "project-1",
      code: scenario.code,
      name: scenario.name,
      status: "ACTIVE",
      triggerEventDefinitionRevisionId: event.id,
      currentRevisionId: "revision-4",
      editable: true,
      source: undefined,
      draft: {
        id: "draft-1",
        version: 7,
        baseRevisionId: "revision-4",
        catalogRevision: contract.revision,
        rule: {
          version: 1,
          root: {
            kind: "activityDayStreak",
            compare: { operator: "gte", value: 3 },
          },
        },
        audience: {
          version: 1,
          root: { kind: "locale", operator: "eq", value: "ru-RU" },
        },
        deliveryPolicy: {
          kind: "WAIT_UNTIL_ONLINE",
          expiryMs: 90_000,
          recheckEligibility: true,
        },
        graph: {
          actions: [
            {
              position: 0,
              nodeKey: "say",
              nextNodeKey: null,
              type: "SAY",
              config: { text: "Hello" },
            },
          ],
        },
        createdAt: "now",
        updatedAt: "now",
      },
      createdAt: "now",
      updatedAt: "now",
    });
    const wrapper = mountPage();
    await flushPromises();

    await stageButton(wrapper, "Условия").trigger("click");
    expect(
      wrapper.getComponent(ScenarioRuleBuilder).props("modelValue"),
    ).toMatchObject({
      root: { kind: "activityDayStreak", compare: { value: 3 } },
    });
    await stageButton(wrapper, "Аудитория").trigger("click");
    expect(
      wrapper.getComponent(AudienceRuleBuilder).props("modelValue"),
    ).toMatchObject({ root: { kind: "locale", value: "ru-RU" } });
    await stageButton(wrapper, "Доставка").trigger("click");
    expect(
      wrapper.getComponent(DeliveryPolicyEditor).props("modelValue"),
    ).toEqual({
      kind: "WAIT_UNTIL_ONLINE",
      expiryMs: 90_000,
      recheckEligibility: true,
    });
    expect(wrapper.getComponent(ScenarioPublishPanel).props()).toMatchObject({
      expectedCurrentRevisionId: "revision-4",
      expectedDraftVersion: 7,
    });
    expect(wrapper.text()).toContain("Черновик v7");
  });

  it("keeps Audience draft dirty and sends it to validation and atomic publish as a separate contract", async () => {
    const wrapper = mountPage();
    await flushPromises();
    await stageButton(wrapper, "Аудитория").trigger("click");
    const audienceDraft: AudienceDraft = {
      version: 1,
      root: {
        nodeId: "audience-root",
        kind: "locale",
        operator: "eq",
        value: "ru-RU",
      },
    };
    wrapper
      .getComponent(AudienceRuleBuilder)
      .vm.$emit("update:modelValue", audienceDraft);
    await wrapper.vm.$nextTick();
    expect(mocks.guardDirty?.value).toBe(true);

    await stageButton(wrapper, "Условия").trigger("click");
    expect(wrapper.getComponent(RuleValidationPreview).props()).toMatchObject({
      audienceDraft,
      audienceDraftRevision: 1,
    });
    await stageButton(wrapper, "Доставка").trigger("click");
    expect(wrapper.getComponent(ScenarioPublishPanel).props()).toMatchObject({
      audienceDraft,
    });
  });

  it("does not leave Studio after legacy save when Audience is the only V2 change", async () => {
    const wrapper = mountPage();
    await flushPromises();
    await stageButton(wrapper, "Аудитория").trigger("click");
    wrapper
      .getComponent(AudienceRuleBuilder)
      .vm.$emit("update:modelValue", {
        version: 1,
        root: {
          nodeId: "audience-root",
          kind: "locale",
          operator: "eq",
          value: "ru-RU",
        },
      } satisfies AudienceDraft);
    await wrapper.vm.$nextTick();

    await wrapper.find('button-stub[label="Сохранить"]').trigger("click");
    await flushPromises();

    expect(mocks.push).not.toHaveBeenCalledWith("/scenarios");
    expect(mocks.saveScenarioDraft).toHaveBeenCalledWith(
      "project-1",
      "scenario-1",
      expect.objectContaining({
        audience: {
          version: 1,
          root: { kind: "locale", operator: "eq", value: "ru-RU" },
        },
        expectedDraftVersion: null,
      }),
    );
    expect(wrapper.text()).toContain("Черновик v1 сохранён на сервере");
  });

  it("does not mount the desktop graph behind the mobile action outline", async () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    vi.stubGlobal(
      "matchMedia",
      vi
        .fn()
        .mockReturnValue({
          matches: true,
          addEventListener,
          removeEventListener,
        }),
    );
    const wrapper = mountPage();
    await flushPromises();
    await stageButton(wrapper, "Действия").trigger("click");

    expect(wrapper.find('[data-test="vue-flow"]').exists()).toBe(false);
    wrapper.unmount();
    expect(addEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    );
    expect(removeEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    );
    expect(window.matchMedia).toHaveBeenCalledWith("(max-width: 1024px)");
    vi.unstubAllGlobals();
  });

  it("opens the Rule Builder only for the exact catalog Event revision", async () => {
    const wrapper = mountPage();
    await flushPromises();
    await stageButton(wrapper, "Условия").trigger("click");

    const builder = wrapper.getComponent(ScenarioRuleBuilder);
    const preview = wrapper.getComponent(RuleValidationPreview);
    expect(builder.props("context")).toMatchObject({
      triggerEventDefinitionId: "event-revision-1",
      triggerEventCode: "page.opened",
      contract: { revision: "catalog-1" },
    });
    expect(preview.props()).toMatchObject({
      projectId: "project-1",
      draftRevision: 0,
    });
  });

  it("saves the durable document before legacy metadata and never sends actions through the legacy PATCH", async () => {
    const wrapper = mountPage();
    await flushPromises();
    await stageButton(wrapper, "Условия").trigger("click");
    const nextDraft: RuleDraft = {
      version: 1,
      root: {
        nodeId: "root",
        kind: "all",
        children: [
          {
            nodeId: "streak",
            kind: "activityDayStreak",
            compare: { operator: "gte", value: 2 },
          },
        ],
      },
    };
    wrapper
      .getComponent(ScenarioRuleBuilder)
      .vm.$emit("update:modelValue", nextDraft);
    await wrapper.vm.$nextTick();

    expect(mocks.guardDirty?.value).toBe(true);
    expect(
      wrapper.getComponent(RuleValidationPreview).props("draftRevision"),
    ).toBe(1);
    await wrapper.find('button-stub[label="Сохранить"]').trigger("click");
    await flushPromises();

    expect(mocks.saveScenario).not.toHaveBeenCalled();
    expect(mocks.updateScenarioMetadata).toHaveBeenCalledWith(
      "project-1",
      "scenario-1",
      expect.not.objectContaining({ actions: expect.anything() }),
    );
    expect(mocks.saveScenarioDraft.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.updateScenarioMetadata.mock.invocationCallOrder[0]!,
    );
    expect(mocks.push).not.toHaveBeenCalledWith("/scenarios");
    expect(mocks.saveScenarioDraft).toHaveBeenCalledWith(
      "project-1",
      "scenario-1",
      expect.objectContaining({
        rule: {
          version: 1,
          root: {
            kind: "all",
            children: [
              {
                kind: "activityDayStreak",
                compare: { operator: "gte", value: 2 },
              },
            ],
          },
        },
      }),
    );
    expect(wrapper.text()).toContain("Черновик v1 сохранён на сервере");
  });

  it("blocks publication again when any durable document section changes after save", async () => {
    const wrapper = mountPage();
    await flushPromises();
    await wrapper.find('button-stub[label="Сохранить"]').trigger("click");
    await flushPromises();
    await stageButton(wrapper, "Доставка").trigger("click");

    expect(
      wrapper.getComponent(ScenarioPublishPanel).props("blockedReason"),
    ).toBe("");
    wrapper
      .getComponent(DeliveryPolicyEditor)
      .vm.$emit("update:modelValue", { kind: "SKIP_IF_OFFLINE" });
    await wrapper.vm.$nextTick();

    expect(
      wrapper.getComponent(ScenarioPublishPanel).props("blockedReason"),
    ).toContain("сохраните все изменения");
  });

  it("keeps local edits and offers a reload when durable draft concurrency fails", async () => {
    const { ApiError } = await import("@/shared/api/http/api-error");
    mocks.saveScenarioDraft.mockRejectedValueOnce(
      new ApiError(
        409,
        "Draft changed",
        {},
        undefined,
        "SCENARIO_DRAFT_CONFLICT",
      ),
    );
    const wrapper = mountPage();
    await flushPromises();
    await stageButton(wrapper, "Условия").trigger("click");
    wrapper.getComponent(ScenarioRuleBuilder).vm.$emit("update:modelValue", {
      version: 1,
      root: {
        nodeId: "streak",
        kind: "activityDayStreak",
        compare: { operator: "gte", value: 3 },
      },
    } satisfies RuleDraft);
    await wrapper.vm.$nextTick();
    await wrapper.find('button-stub[label="Сохранить"]').trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Черновик изменён в другой вкладке");
    expect(
      wrapper
        .find('button-stub[label="Загрузить актуальный черновик"]')
        .exists(),
    ).toBe(true);
    expect(mocks.guardDirty?.value).toBe(true);
  });

  it("keeps Delivery Policy separate from Goal Deadline and inside the page dirty guard", async () => {
    const wrapper = mountPage();
    await flushPromises();
    await stageButton(wrapper, "Доставка").trigger("click");

    const editor = wrapper.getComponent(DeliveryPolicyEditor);
    editor.vm.$emit("update:modelValue", {
      kind: "WAIT_UNTIL_ONLINE",
      expiryMs: 86_400_000,
      recheckEligibility: true,
    });
    await wrapper.vm.$nextTick();

    expect(mocks.guardDirty?.value).toBe(true);
    expect(wrapper.text()).toContain("не продлевает срок цели");
  });

  it("keeps newer session edits dirty when an older publish request completes", async () => {
    const wrapper = mountPage();
    await flushPromises();
    await stageButton(wrapper, "Доставка").trigger("click");
    const page = wrapper.vm as unknown as { ruleDraft: RuleDraft };
    wrapper
      .getComponent(DeliveryPolicyEditor)
      .vm.$emit("update:modelValue", { kind: "SKIP_IF_OFFLINE" });
    await wrapper.vm.$nextTick();

    wrapper
      .getComponent(ScenarioPublishPanel)
      .vm.$emit("published", "revision-2", {
        ruleSnapshot: JSON.stringify(page.ruleDraft),
        deliverySnapshot: JSON.stringify({ kind: "IMMEDIATE" }),
        authoringSnapshot: JSON.stringify({ stale: true }),
      });
    await wrapper.vm.$nextTick();

    expect(mocks.guardDirty?.value).toBe(true);
    expect(wrapper.text()).toContain("более новые изменения");
  });

  it("keeps the publish coordinator mounted until the request finishes", async () => {
    const wrapper = mountPage();
    await flushPromises();
    await stageButton(wrapper, "Доставка").trigger("click");
    wrapper.getComponent(ScenarioPublishPanel).vm.$emit("publishing", true);
    await wrapper.vm.$nextTick();

    await stageButton(wrapper, "Действия").trigger("click");
    await wrapper.find('button-stub[label="Отмена"]').trigger("click");

    expect(stageButton(wrapper, "Доставка").classes()).toContain("active");
    expect(wrapper.text()).toContain("Дождитесь завершения публикации");
    expect(mocks.push).not.toHaveBeenCalledWith("/scenarios");
    expect(mocks.guardDirty?.value).toBe(true);
    expect(mocks.routeLeaveGuards.at(-1)?.()).toBe(false);
  });

  it("does not offer legacy ACTIVE activation before atomic V2 publish", async () => {
    const wrapper = mountPage();
    await flushPromises();

    const page = wrapper.vm as unknown as {
      statusOptions: Array<{ value: string }>;
    };
    expect(page.statusOptions.map((option) => option.value)).not.toContain(
      "ACTIVE",
    );
  });

  it("shows an already active scenario as an explicit read-only status", async () => {
    mocks.getScenarios.mockResolvedValue([{ ...scenario, status: "ACTIVE" }]);
    const wrapper = mountPage();
    await flushPromises();

    expect(
      wrapper.get('[aria-label="Текущий статус сценария"]').text(),
    ).toContain("Активен");
    expect(
      wrapper.find('select-stub[aria-label="Статус сценария"]').exists(),
    ).toBe(false);
  });

  it("blocks legacy graph save when a persisted Goal config fails domain validation", async () => {
    mocks.getScenarios.mockResolvedValue([
      {
        ...scenario,
        actions: [
          {
            position: 0,
            nodeKey: "wait",
            type: "WAIT_FOR_GOAL",
            config: { eventCode: "", onGoal: "done", onTimeout: "timeout" },
          },
          { position: 1, nodeKey: "done", type: "SAY", config: {} },
          { position: 2, nodeKey: "timeout", type: "SAY", config: {} },
        ],
      },
    ]);
    const wrapper = mountPage();
    await flushPromises();

    await wrapper.find('button-stub[label="Сохранить"]').trigger("click");

    expect(mocks.saveScenario).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("Цель в узле «wait»");
  });

  it("blocks atomic publish when the document graph or Goal is invalid", async () => {
    mocks.getScenarios.mockResolvedValue([
      {
        ...scenario,
        actions: [
          {
            position: 0,
            nodeKey: "wait",
            type: "WAIT_FOR_GOAL",
            config: { eventCode: "", onGoal: "", onTimeout: "" },
          },
        ],
      },
    ]);
    const wrapper = mountPage();
    await flushPromises();
    await stageButton(wrapper, "Доставка").trigger("click");

    expect(
      wrapper.getComponent(ScenarioPublishPanel).props("blockedReason"),
    ).toContain("Исправьте ошибки");
  });

  it("protects unsaved edits inside the condition drawer before changing stages", async () => {
    const wrapper = mountPage();
    await flushPromises();
    await stageButton(wrapper, "Условия").trigger("click");
    wrapper.getComponent(ScenarioRuleBuilder).vm.$emit("editing-dirty", true);
    await wrapper.vm.$nextTick();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);

    await stageButton(wrapper, "Аудитория").trigger("click");

    expect(confirm).toHaveBeenCalledWith(
      "В условии есть несохранённые изменения. Закрыть его и перейти к другому этапу?",
    );
    expect(stageButton(wrapper, "Условия").classes()).toContain("active");
    expect(mocks.guardDirty?.value).toBe(true);
    confirm.mockRestore();
  });

  it("keeps the legacy editor usable when the authoring catalog is temporarily unavailable", async () => {
    mocks.getContract.mockRejectedValue(new Error("catalog offline"));
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain("Welcome");
    await stageButton(wrapper, "Условия").trigger("click");
    expect(wrapper.text()).toContain("Не удалось загрузить каталог условий");
    expect(wrapper.findComponent(ScenarioRuleBuilder).exists()).toBe(false);
  });

  it("keeps Trigger and Eligibility usable when the Actions catalog is incompatible", async () => {
    mocks.ensureLoaded.mockRejectedValue(
      new Error("unsupported action uiSchema"),
    );
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain("Событие запуска");
    await stageButton(wrapper, "Условия").trigger("click");
    expect(wrapper.findComponent(ScenarioRuleBuilder).exists()).toBe(true);

    await stageButton(wrapper, "Действия").trigger("click");
    expect(wrapper.text()).toContain("Не удалось загрузить каталог действий");
  });

  it("renders a mobile-safe action outline that can open a node without canvas gestures", async () => {
    mocks.getScenarios.mockResolvedValue([
      {
        ...scenario,
        actions: [
          {
            position: 0,
            nodeKey: "welcome_message",
            type: "SAY",
            config: { text: "Добро пожаловать" },
          },
        ],
      },
    ]);
    const wrapper = mountPage();
    await flushPromises();
    await stageButton(wrapper, "Действия").trigger("click");

    expect(wrapper.get(".mobile-action-outline").text()).toContain(
      "welcome_message",
    );
    expect(wrapper.get(".mobile-library summary").text()).toContain(
      "Добавить узел",
    );
    await wrapper
      .get('button[aria-label="Открыть узел welcome_message"]')
      .trigger("click");

    expect(
      wrapper.findComponent({ name: "ScenarioNodeInspector" }).exists(),
    ).toBe(true);
  });

  it("keeps Audience and publish mutations read-only outside OWNER and ADMIN roles", async () => {
    mocks.role = "VIEWER";
    const wrapper = mountPage();
    await flushPromises();

    expect(
      wrapper.find('button-stub[label="Сохранить"]').attributes("disabled"),
    ).toBeDefined();
    await stageButton(wrapper, "Аудитория").trigger("click");
    expect(wrapper.findComponent(AudienceRuleBuilder).exists()).toBe(false);
    expect(wrapper.findComponent(SegmentManager).exists()).toBe(false);
    expect(wrapper.text()).toContain("только владельцы и администраторы");

    await stageButton(wrapper, "Доставка").trigger("click");
    expect(wrapper.findComponent(ScenarioPublishPanel).exists()).toBe(false);
    expect(wrapper.text()).toContain(
      "Публикация доступна только владельцам и администраторам",
    );
  });
});
