import { flushPromises, shallowMount } from "@vue/test-utils";
import Select from "primevue/select";
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
import ScenarioNodeInspector from "@/features/scenarios/ScenarioNodeInspector.vue";
import type { ProjectAction } from "@/features/project-actions/model/project-action";
import type { ScenarioActionCatalogItem } from "@/shared/types/domain";
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
  createScenario: vi.fn(),
  getScenarioDocument: vi.fn(),
  saveScenarioDraft: vi.fn(),
  searchSegments: vi.fn(),
  ensureProjectActionsLoaded: vi.fn(),
  projectActions: [] as ProjectAction[],
  guardDirty: null as { value: boolean } | null,
  routeLeaveGuards: [] as Array<() => boolean>,
  permissions: [
    "project.scenarios.read",
    "project.scenarios.write",
    "project.scenarios.publish",
    "project.actions.read",
  ] as string[],
}));

vi.mock("vue-router", () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  onBeforeRouteLeave: (guard: () => boolean) =>
    mocks.routeLeaveGuards.push(guard),
}));

vi.mock("@/features/auth/auth.store", () => ({
  useAuthStore: () => ({
    project: {
      id: "project-1",
      get effectivePermissionCodes() {
        return mocks.permissions;
      },
    },
  }),
}));

vi.mock("@/features/project-actions/model/project-actions.store", () => ({
  useProjectActionsStore: () => ({
    actionsForProject: () => mocks.projectActions,
    ensureLoaded: mocks.ensureProjectActionsLoaded,
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
        createScenario: mocks.createScenario,
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
  updatedAt: "2026-07-20T10:00:00.000Z",
};

function projectAction(
  code: string,
  overrides: Partial<ProjectAction> = {},
): ProjectAction {
  return {
    id: `action-${code}`,
    projectId: "project-1",
    actionTypeId: `type-${code}`,
    actionTypeRevisionId: `revision-${code}`,
    code,
    nameOverride: null,
    descriptionOverride: null,
    scenarioEnabled: true,
    aiEnabled: false,
    aiUsageDescription: null,
    configuration: {},
    lifecycle: "ACTIVE",
    createdAt: "now",
    updatedAt: "now",
    actionType: { key: code, origin: "SYSTEM", ownerProjectId: null },
    actionTypeRevision: {
      id: `revision-${code}`,
      version: 1,
      name: code,
      description: code,
      executorAdapter: "FRONTEND_COMMAND",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      },
      resultSchema: {},
      projectConfigSchema: {},
      uiSchema: { fields: [] },
      supportedSurfaces: ["SCENARIO"],
      risk: "UI_EFFECT",
      confirmationPolicy: "NEVER",
      multipleInstances: false,
    },
    ...overrides,
  };
}

function projectActionFromCatalogItem(
  item: Omit<ScenarioActionCatalogItem, "id" | "enabled"> & {
    enabled?: boolean;
    supportedSurfaces?: ProjectAction["actionTypeRevision"]["supportedSurfaces"];
  },
): ProjectAction {
  const base = projectAction(item.type);
  return projectAction(item.type, {
    scenarioEnabled: item.enabled ?? true,
    actionTypeRevision: {
      ...base.actionTypeRevision,
      name: item.name,
      description: item.description ?? "",
      executorAdapter:
        item.executor === "FRONTEND"
          ? "FRONTEND_COMMAND"
          : "SERVER_HANDLER",
      inputSchema: item.configSchema,
      uiSchema: item.uiSchema,
      supportedSurfaces: item.supportedSurfaces ?? ["SCENARIO"],
    },
  });
}

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
        VueFlow: {
          name: "VueFlow",
          emits: ["node-click"],
          template: '<div data-test="vue-flow"><slot /></div>',
        },
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

async function openValidation(wrapper: ReturnType<typeof mountPage>) {
  await wrapper
    .find('button-stub[label="Проверить условия"]')
    .trigger("click");
}

describe("ScenarioEditorPage V2 rule journey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.routeLeaveGuards.length = 0;
    mocks.route.params.scenarioId = "scenario-1";
    mocks.permissions = [
      "project.scenarios.read",
      "project.scenarios.write",
      "project.scenarios.publish",
      "project.actions.read",
    ];
    mocks.getScenarios.mockResolvedValue([scenario]);
    mocks.getEvents.mockResolvedValue([event]);
    mocks.getElements.mockResolvedValue([]);
    mocks.ensureProjectActionsLoaded.mockResolvedValue([]);
    mocks.projectActions = [];
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
    mocks.createScenario.mockResolvedValue({
      scenarioId: "scenario-1",
      currentRevisionId: null,
      draft: {
        id: "draft-1",
        version: 1,
        baseRevisionId: null,
        catalogRevision: contract.revision,
        deliveryPolicy: { kind: "IMMEDIATE" },
        graph: { actions: [] },
        createdAt: "now",
        updatedAt: "now",
      },
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

  it("preserves a new multilingual form after create failure and retries without legacy graph save", async () => {
    mocks.route.params.scenarioId = "new";
    mocks.getScenarios.mockResolvedValueOnce([]);
    mocks.projectActions = [
      projectActionFromCatalogItem({
        type: "SAY",
        name: "Сказать текст",
        description: null,
        executor: "SERVER",
        configSchema: {
          type: "object",
          properties: { text: { type: "string", maxLength: 10_000 } },
          required: ["text"],
        },
        uiSchema: { fields: [{ key: "text", label: "Текст", control: "textarea" }] },
      }),
    ];
    mocks.getContract.mockResolvedValueOnce({
      ...contract,
      localization: {
        version: 1,
        enabled: true,
        attributeKey: "preferredLocale",
        attributeContractRevision: 7,
        defaultLocale: "ru",
        localizedValueSchemaVersion: 1,
        policyModes: ["ALL_PROJECT_LOCALES", "SELECTED_LOCALES"],
        locales: [
          { code: "ru", language: "ru", default: true },
          { code: "en", language: "en", default: false },
        ],
        paths: [{ actionType: "SAY", path: "config.text", maxLength: 10_000 }],
      },
    });
    const wrapper = mountPage();
    await flushPromises();
    const page = wrapper.vm as unknown as {
      form: { name: string; code: string; actions: Array<Record<string, unknown>> };
    };
    page.form.name = "Localized welcome";
    page.form.code = "welcome.localized";
    page.form.actions = [
      {
        position: 0,
        nodeKey: "say",
        nextNodeKey: null,
        type: "SAY",
        config: { text: { ru: "Привет", en: "Hello" } },
      },
    ];
    await wrapper.vm.$nextTick();
    const formBeforeFailure = JSON.stringify(page.form);
    mocks.createScenario.mockRejectedValueOnce(new Error("create failed"));

    await wrapper.find('button-stub[label="Сохранить"]').trigger("click");
    await flushPromises();

    expect(mocks.createScenario).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(page.form)).toBe(formBeforeFailure);
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.saveScenario).not.toHaveBeenCalled();
    expect(mocks.saveScenarioDraft).not.toHaveBeenCalled();
    expect(mocks.updateScenarioMetadata).not.toHaveBeenCalled();

    await wrapper.find('button-stub[label="Сохранить"]').trigger("click");
    await flushPromises();

    expect(mocks.createScenario).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        scenario: expect.objectContaining({
          code: "localized_welcome",
          name: "Localized welcome",
          triggerEventDefinitionRevisionId: event.id,
        }),
        draft: expect.objectContaining({
          localization: { version: 1, mode: "ALL_PROJECT_LOCALES", locales: [] },
          graph: {
            actions: [expect.objectContaining({
              type: "SAY",
              config: { text: { ru: "Привет", en: "Hello" } },
            })],
          },
        }),
      }),
    );
    expect(mocks.createScenario).toHaveBeenCalledTimes(2);
    expect(mocks.saveScenario).not.toHaveBeenCalled();
    expect(mocks.saveScenarioDraft).not.toHaveBeenCalled();
    expect(mocks.updateScenarioMetadata).not.toHaveBeenCalled();
    expect(mocks.replace).toHaveBeenCalledWith({
      name: "scenario-edit",
      params: { scenarioId: "scenario-1" },
    });
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

  it("migrates localized scalar leaves to maps and saves the content locale policy", async () => {
    mocks.projectActions = [
      projectActionFromCatalogItem({
        type: "SAY",
        name: "Сказать текст",
        description: "Показывает полный приветственный текст пользователю.",
        executor: "SERVER",
        configSchema: {
          type: "object",
          properties: { text: { type: "string", maxLength: 10_000 } },
          required: ["text"],
        },
        uiSchema: {
          fields: [{ key: "text", label: "Текст", control: "textarea" }],
        },
      }),
    ];
    mocks.getContract.mockResolvedValueOnce({
      ...contract,
      localization: {
        version: 1,
        enabled: true,
        attributeKey: "locale",
        attributeContractRevision: 2,
        defaultLocale: "en",
        localizedValueSchemaVersion: 1,
        policyModes: ["ALL_PROJECT_LOCALES", "SELECTED_LOCALES"],
        locales: [
          { code: "en", language: "en", default: true },
          { code: "es", language: "es", default: false },
        ],
        paths: [{ actionType: "SAY", path: "config.text", maxLength: 10_000 }],
      },
      translation: {
        enabled: true,
        supportedSourceLocales: ["en"],
        supportedTargetLocales: ["es"],
        maxBatchCharacters: 50_000,
      },
    });
    mocks.getScenarioDocument.mockResolvedValueOnce({
      scenarioId: scenario.id,
      projectId: "project-1",
      code: scenario.code,
      name: scenario.name,
      status: scenario.status,
      triggerEventDefinitionRevisionId: event.id,
      currentRevisionId: null,
      editable: true,
      source: undefined,
      draft: {
        id: "draft-localized",
        version: 3,
        baseRevisionId: null,
        catalogRevision: contract.revision,
        deliveryPolicy: { kind: "IMMEDIATE" },
        localization: {
          version: 1,
          mode: "SELECTED_LOCALES",
          locales: ["en"],
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

    await wrapper.find('button-stub[label="Сохранить"]').trigger("click");
    await flushPromises();

    expect(mocks.saveScenarioDraft).toHaveBeenCalledWith(
      "project-1",
      "scenario-1",
      expect.objectContaining({
        expectedDraftVersion: 3,
        localization: {
          version: 1,
          mode: "SELECTED_LOCALES",
          locales: ["en"],
        },
        graph: {
          actions: [
            expect.objectContaining({
              nodeKey: "say",
              config: { text: { en: "Hello" } },
            }),
          ],
        },
      }),
    );
    await stageButton(wrapper, "Доставка").trigger("click");
    expect(wrapper.getComponent(ScenarioPublishPanel).props("localizationPolicy")).toEqual({
      version: 1,
      mode: "SELECTED_LOCALES",
      locales: ["en"],
    });
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
    await openValidation(wrapper);
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

  it("shows the action canvas only after the first action exists", async () => {
    const wrapper = mountPage();
    await flushPromises();
    await stageButton(wrapper, "Действия").trigger("click");

    expect(wrapper.find('[data-test="vue-flow"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("Добавьте первое действие");

    mocks.getScenarios.mockResolvedValueOnce([
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
    const configuredWrapper = mountPage();
    await flushPromises();
    await stageButton(configuredWrapper, "Действия").trigger("click");

    expect(configuredWrapper.find('[data-test="vue-flow"]').exists()).toBe(true);
  });

  it("opens the Trigger stage from the graph and edits its first action", async () => {
    mocks.projectActions = [
      projectActionFromCatalogItem({
        type: "SAY",
        name: "Сказать текст",
        description: null,
        executor: "SERVER",
        configSchema: {
          type: "object",
          properties: { text: { type: "string" } },
          required: ["text"],
        },
        uiSchema: {
          fields: [{ key: "text", label: "Текст", control: "textarea" }],
        },
      }),
    ];
    mocks.getScenarios.mockResolvedValue([
      {
        ...scenario,
        actions: [
          {
            position: 0,
            nodeKey: "welcome_message",
            nextNodeKey: null,
            type: "SAY",
            config: { text: "Добро пожаловать" },
          },
        ],
      },
    ]);
    const wrapper = mountPage();
    await flushPromises();

    await stageButton(wrapper, "Действия").trigger("click");
    wrapper.getComponent({ name: "VueFlow" }).vm.$emit("node-click", {
      node: { id: "trigger" },
    });
    await wrapper.vm.$nextTick();

    expect(stageButton(wrapper, "Запуск").classes()).toContain("active");
    expect(wrapper.get('[data-testid="scenario-first-action"]').text())
      .toContain("Сказать текст");
    expect(wrapper.text()).not.toContain("Смена корня отключена");
    await wrapper
      .get('button-stub[label="Настроить первое действие"]')
      .trigger("click");

    expect(stageButton(wrapper, "Действия").classes()).toContain("active");
    expect(wrapper.getComponent(ScenarioNodeInspector).props("action"))
      .toMatchObject({ nodeKey: "welcome_message", type: "SAY" });
  });

  it("changes the first action of a linear scenario without deleting its steps", async () => {
    mocks.projectActions = [
      projectAction("OPEN_MODAL"),
      projectAction("OPEN_CHAT"),
      projectAction("SAY"),
    ];
    mocks.getScenarios.mockResolvedValue([
      {
        ...scenario,
        actions: [
          {
            position: 0,
            nodeKey: "open_form",
            nextNodeKey: "open_chat",
            type: "OPEN_MODAL",
            config: {},
          },
          {
            position: 1,
            nodeKey: "open_chat",
            nextNodeKey: "say_hello",
            type: "OPEN_CHAT",
            config: {},
          },
          {
            position: 2,
            nodeKey: "say_hello",
            nextNodeKey: null,
            type: "SAY",
            config: {},
          },
        ],
      },
    ]);
    const wrapper = mountPage();
    await flushPromises();

    const firstActionSelect = wrapper
      .findAllComponents(Select)
      .find(
        (component) =>
          component.attributes("input-id") === "scenario-first-action",
      )!;
    firstActionSelect.vm.$emit("update:modelValue", "open_chat");
    await wrapper.vm.$nextTick();

    const page = wrapper.vm as unknown as {
      form: { actions: Array<Record<string, unknown>> };
    };
    expect(page.form.actions).toMatchObject([
      { position: 0, nodeKey: "open_chat", nextNodeKey: "say_hello" },
      { position: 1, nodeKey: "say_hello", nextNodeKey: "open_form" },
      { position: 2, nodeKey: "open_form", nextNodeKey: null },
    ]);
    expect(page.form.actions).toHaveLength(3);
    expect(wrapper.get('[data-testid="scenario-first-action"]').text())
      .toContain("OPEN_CHAT");
  });

  it("keeps first-action editing available without rewriting a branching graph", async () => {
    mocks.projectActions = [
      projectAction("ASK_CHOICE"),
      projectAction("SAY"),
    ];
    mocks.getScenarios.mockResolvedValue([
      {
        ...scenario,
        actions: [
          {
            position: 0,
            nodeKey: "question",
            nextNodeKey: null,
            type: "ASK_CHOICE",
            config: {
              message: "Продолжить?",
              options: [
                {
                  id: "continue",
                  label: "Да",
                  nextNodeKey: "answer",
                },
              ],
            },
          },
          {
            position: 1,
            nodeKey: "answer",
            nextNodeKey: null,
            type: "SAY",
            config: { text: "Готово" },
          },
        ],
      },
    ]);
    const wrapper = mountPage();
    await flushPromises();

    expect(
      wrapper.find('[input-id="scenario-first-action"]').exists(),
    ).toBe(false);
    expect(wrapper.text()).toContain(
      "Смена корня отключена, чтобы не потерять ветки",
    );
    expect(
      wrapper
        .get('button-stub[label="Настроить первое действие"]')
        .attributes("label"),
    ).toBe("Настроить первое действие");
  });

  it("opens the Rule Builder only for the exact catalog Event revision", async () => {
    const wrapper = mountPage();
    await flushPromises();
    await stageButton(wrapper, "Условия").trigger("click");

    const builder = wrapper.getComponent(ScenarioRuleBuilder);
    expect(builder.props("context")).toMatchObject({
      triggerEventDefinitionId: "event-revision-1",
      triggerEventCode: "page.opened",
      contract: { revision: "catalog-1" },
    });
    expect(wrapper.findComponent(RuleValidationPreview).exists()).toBe(false);
    expect(
      wrapper.find(".stage-section-header button-stub").exists(),
    ).toBe(false);
    const validationActions = wrapper.get(
      '[data-testid="rule-validation-actions"]',
    );
    expect(validationActions.text()).toContain(
      "Добавьте хотя бы одно условие",
    );
    expect(
      validationActions
        .get('button-stub[label="Проверить условия"]')
        .attributes("label"),
    ).toBe("Проверить условия");
    builder.vm.$emit("update:modelValue", {
      version: 1,
      root: {
        nodeId: "root",
        kind: "all",
        children: [
          {
            nodeId: "streak",
            kind: "activityDayStreak",
            compare: { operator: "gte", value: 3 },
          },
        ],
      },
    } satisfies RuleDraft);
    await wrapper.vm.$nextTick();
    expect(validationActions.text()).toContain("Условия готовы к проверке");

    await validationActions
      .get('button-stub[label="Проверить условия"]')
      .trigger("click");
    const preview = wrapper.getComponent(RuleValidationPreview);
    expect(preview.props()).toMatchObject({
      projectId: "project-1",
      draftRevision: 1,
    });

    await wrapper
      .find('button-stub[aria-label="Закрыть проверку условий"]')
      .trigger("click");
    expect(wrapper.findComponent(RuleValidationPreview).exists()).toBe(false);
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
    await openValidation(wrapper);
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
    mocks.projectActions = [
      projectAction("BROKEN", {
        actionTypeRevision: {
          ...projectAction("BROKEN").actionTypeRevision,
          inputSchema: {
            type: "object",
            properties: { target: { type: "string" } },
            required: ["target"],
          },
          uiSchema: { fields: [] },
        },
      }),
    ];
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain("Событие запуска");
    await stageButton(wrapper, "Условия").trigger("click");
    expect(wrapper.findComponent(ScenarioRuleBuilder).exists()).toBe(true);

    await stageButton(wrapper, "Действия").trigger("click");
    expect(wrapper.text()).toContain("Не удалось загрузить каталог действий");
  });

  it("does not request Project Actions without catalog read permission", async () => {
    mocks.permissions = [
      "project.scenarios.read",
      "project.scenarios.write",
      "project.scenarios.publish",
    ];
    mocks.projectActions = [
      projectActionFromCatalogItem({
        type: "CACHED_ACTION",
        name: "Секретное имя из старой сессии",
        description: null,
        executor: "FRONTEND",
        configSchema: { type: "object", properties: {}, required: [] },
        uiSchema: { fields: [] },
      }),
    ];
    const wrapper = mountPage();
    await flushPromises();

    expect(mocks.ensureProjectActionsLoaded).not.toHaveBeenCalled();
    await stageButton(wrapper, "Действия").trigger("click");
    expect(wrapper.text()).toContain("нет права читать Project Actions");
    expect(wrapper.text()).not.toContain("Секретное имя из старой сессии");
  });

  it("uses active scenario-enabled Project Actions as the action picker authority", async () => {
    mocks.projectActions = [
      projectActionFromCatalogItem({
        type: "OPEN_PAGE",
        name: "Открыть страницу",
        description: null,
        executor: "FRONTEND",
        configSchema: { type: "object", properties: {}, required: [] },
        uiSchema: { fields: [] },
      }),
      projectActionFromCatalogItem({
        type: "AI_ONLY",
        name: "Только для AI",
        description: null,
        executor: "FRONTEND",
        configSchema: { type: "object", properties: {}, required: [] },
        uiSchema: { fields: [] },
        supportedSurfaces: ["AI"],
      }),
      projectActionFromCatalogItem({
        type: "DISABLED",
        name: "Выключено",
        description: null,
        executor: "FRONTEND",
        configSchema: { type: "object", properties: {}, required: [] },
        uiSchema: { fields: [] },
        enabled: false,
      }),
    ];

    const wrapper = mountPage();
    await flushPromises();
    await stageButton(wrapper, "Действия").trigger("click");

    expect(mocks.ensureProjectActionsLoaded).toHaveBeenCalledWith("project-1");
    expect(wrapper.get(".action-library").text()).toContain("Открыть страницу");
    expect(wrapper.get(".action-library").text()).not.toContain("Только для AI");
    expect(wrapper.get(".action-library").text()).not.toContain("Выключено");
  });

  it("uses the pinned Project Action revision as the editor definition catalog", async () => {
    mocks.projectActions = [projectAction("SHOW_ASSISTANT")];
    mocks.getScenarios.mockResolvedValue([
      {
        ...scenario,
        actions: [
          {
            position: 0,
            nodeKey: "show_assistant",
            type: "SHOW_ASSISTANT",
            config: {},
          },
        ],
      },
    ]);

    const wrapper = mountPage();
    await flushPromises();
    await stageButton(wrapper, "Действия").trigger("click");

    expect(wrapper.text()).not.toContain(
      "Действие SHOW_ASSISTANT отсутствует в каталоге проекта",
    );
    expect(wrapper.get(".action-library").text()).toContain("SHOW_ASSISTANT");
    await wrapper.get(".action-outline-item").trigger("click");
    expect(
      wrapper
        .getComponent(ScenarioNodeInspector)
        .props("actionCatalog")
        .map((definition: { type: string }) => definition.type),
    ).toContain("SHOW_ASSISTANT");
    expect(
      wrapper.getComponent(ScenarioNodeInspector).props("issues"),
    ).not.toContain(
      "Действие SHOW_ASSISTANT отсутствует в каталоге проекта",
    );
  });

  it("keeps an unknown existing action as an opaque node and marks the graph invalid", async () => {
    mocks.getScenarios.mockResolvedValue([
      {
        ...scenario,
        actions: [
          {
            position: 0,
            nodeKey: "legacy_action",
            type: "LEGACY_UNKNOWN",
            config: { preserved: true },
          },
        ],
      },
    ]);

    const wrapper = mountPage();
    await flushPromises();
    await stageButton(wrapper, "Действия").trigger("click");

    expect(wrapper.get(".mobile-action-outline").text()).toContain("legacy_action");
    expect(stageButton(wrapper, "Действия").classes()).toContain("active");
    expect(wrapper.text()).toContain("1 ошибка в действиях");
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
      "Добавить действие",
    );
    expect(
      wrapper.find('input[aria-label="Найти действие на мобильном"]').exists(),
    ).toBe(true);
    await wrapper
      .get('button[aria-label="Открыть узел welcome_message"]')
      .trigger("click");

    expect(
      wrapper.findComponent({ name: "ScenarioNodeInspector" }).exists(),
    ).toBe(true);
  });

  it("opens the graph as a dedicated mobile overview only when requested", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
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

    expect(wrapper.find('[data-test="vue-flow"]').exists()).toBe(false);
    await wrapper.get(".mobile-graph-button").trigger("click");

    expect(wrapper.get(".graph-canvas").classes()).toContain("graph-expanded");
    expect(wrapper.find('[data-test="vue-flow"]').exists()).toBe(true);
    expect(
      wrapper.get('button[aria-label="Вернуться к настройке действия"]').text(),
    ).toContain("К настройке");
    wrapper.unmount();
    vi.unstubAllGlobals();
  });

  it("uses the created-action list as the primary navigation and keeps full names visible", async () => {
    mocks.projectActions = [
      projectActionFromCatalogItem({
        type: "SAY",
        name: "Отправить пользователю приветственное сообщение",
        description: "Показывает полный приветственный текст пользователю.",
        executor: "SERVER",
        configSchema: {
          type: "object",
          properties: { text: { type: "string" } },
          required: ["text"],
        },
        uiSchema: {
          fields: [{ key: "text", label: "Текст", control: "textarea" }],
        },
      }),
    ];
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

    const actionButton = wrapper.get(
      'button[aria-label="Настроить действие Отправить пользователю приветственное сообщение"]',
    );
    expect(actionButton.text()).toContain(
      "Отправить пользователю приветственное сообщение",
    );
    expect(wrapper.get(".action-library summary").text()).toContain(
      "Добавить действие",
    );
    expect(wrapper.get(".action-library").text()).toContain(
      "Показывает полный приветственный текст пользователю.",
    );
    await wrapper.get(".graph-toolbar button").trigger("click");
    expect(wrapper.get(".studio-grid").classes()).toContain("graph-is-expanded");
    await actionButton.trigger("click");
    expect(wrapper.get(".studio-grid").classes()).not.toContain(
      "graph-is-expanded",
    );
    expect(wrapper.get(".studio-grid").classes()).toContain(
      "has-action-inspector",
    );
  });

  it("keeps Audience and publish mutations read-only outside OWNER and ADMIN roles", async () => {
    mocks.permissions = ["project.scenarios.read"];
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
      "У вас нет права публиковать сценарии",
    );
  });

  it("explains an unavailable source snapshot without exposing the backend code", async () => {
    mocks.getScenarioDocument.mockResolvedValueOnce({
      scenarioId: scenario.id,
      projectId: "project-1",
      code: scenario.code,
      name: scenario.name,
      status: "ACTIVE",
      triggerEventDefinitionRevisionId: event.id,
      currentRevisionId: "revision-1",
      editable: false,
      unavailableReason: "SOURCE_SNAPSHOT_UNAVAILABLE",
      createdAt: "now",
      updatedAt: "now",
    });

    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain("Сценарий продолжает работать как раньше");
    expect(wrapper.text()).toContain("исходные настройки этой версии не сохранились");
    expect(wrapper.text()).not.toContain("SOURCE_SNAPSHOT_UNAVAILABLE");
    expect(wrapper.find('button-stub[label="Сохранить"]').exists()).toBe(false);
    await wrapper
      .get('button-stub[label="Создать новый сценарий"]')
      .trigger("click");
    expect(mocks.push).toHaveBeenCalledWith({ name: "scenario-create" });
  });

  it("keeps stage navigation usable while the scenario is read-only", async () => {
    mocks.getScenarios.mockResolvedValueOnce([
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
    mocks.getScenarioDocument.mockResolvedValueOnce({
      scenarioId: scenario.id,
      projectId: "project-1",
      code: scenario.code,
      name: scenario.name,
      status: "ACTIVE",
      triggerEventDefinitionRevisionId: event.id,
      currentRevisionId: "revision-1",
      editable: false,
      unavailableReason: "SOURCE_SNAPSHOT_UNAVAILABLE",
      createdAt: "now",
      updatedAt: "now",
    });

    const wrapper = mountPage();
    await flushPromises();

    await stageButton(wrapper, "Условия").trigger("click");
    expect(stageButton(wrapper, "Условия").classes()).toContain("active");
    expect(wrapper.findComponent(RuleValidationPreview).exists()).toBe(false);
    expect(wrapper.text()).toContain("Исходные условия недоступны");
    expect(wrapper.text()).not.toContain("Условия ещё не добавлены");

    await stageButton(wrapper, "Аудитория").trigger("click");
    expect(wrapper.text()).toContain("Аудитория только для просмотра");
    expect(wrapper.text()).toContain("Исходные настройки аудитории недоступны");
    expect(wrapper.text()).not.toContain("Аудитория не ограничена");
    expect(wrapper.findComponent(AudienceRuleBuilder).exists()).toBe(false);

    await stageButton(wrapper, "Действия").trigger("click");
    await wrapper
      .get('button[aria-label="Открыть узел welcome_message"]')
      .trigger("click");
    expect(wrapper.get(".readonly-action-panel").text()).toContain(
      "Добро пожаловать",
    );

    await stageButton(wrapper, "Доставка").trigger("click");
    expect(wrapper.text()).toContain("Настройки доставки только для просмотра");
    expect(wrapper.text()).toContain("Исходные настройки доставки недоступны");
    expect(wrapper.findComponent(ScenarioPublishPanel).exists()).toBe(false);

    await stageButton(wrapper, "Запуск").trigger("click");
    expect(stageButton(wrapper, "Запуск").classes()).toContain("active");
    expect(wrapper.find(".readonly-panel").exists()).toBe(true);
    expect(wrapper.find("[inert]").exists()).toBe(false);
  });

  it("shows system event names in Russian while preserving their codes", async () => {
    const systemEvent = {
      ...event,
      id: "system-event-revision",
      code: "lola.became_online",
      name: "User became online",
    };
    mocks.getScenarios.mockResolvedValue([
      { ...scenario, eventDefinitionId: systemEvent.id },
    ]);
    mocks.getEvents.mockResolvedValue([systemEvent]);
    mocks.getContract.mockResolvedValue({
      ...contract,
      events: [
        {
          ...contract.events[0]!,
          code: systemEvent.code,
          definitionId: systemEvent.id,
          name: systemEvent.name,
        },
      ],
    });

    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain("Пользователь появился в сети");
    expect(wrapper.text()).toContain("lola.became_online");
    expect(wrapper.text()).not.toContain("User became online");
  });
});
