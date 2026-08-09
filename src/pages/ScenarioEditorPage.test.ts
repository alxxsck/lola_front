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
import ScenarioNodeInspector from "@/features/scenarios/ScenarioNodeInspector.vue";
import ScenarioActionChangeDialog from "@/features/scenarios/ScenarioActionChangeDialog.vue";
import ScenarioGraphLayoutToolbar from "@/features/scenarios/ScenarioGraphLayoutToolbar.vue";
import ScenarioFlowControls from "@/features/scenarios/ScenarioFlowControls.vue";
import ScenarioActionInspectorDock from "@/features/scenarios/ScenarioActionInspectorDock.vue";
import ActionPicker from "@/features/actions/ActionPicker.vue";
import ScenarioActionTargetPicker from "@/features/actions/ScenarioActionTargetPicker.vue";
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
  updateScenarioMetadata: vi.fn(),
  getContract: vi.fn(),
  createScenario: vi.fn(),
  getScenarioDocument: vi.fn(),
  saveScenarioDraft: vi.fn(),
  searchSegments: vi.fn(),
  ensureProjectActionsLoaded: vi.fn(),
  projectActions: [] as ProjectAction[],
  authoringActions: [] as Array<Record<string, unknown>>,
  layoutGraph: vi.fn(),
  createLayoutWorker: vi.fn(),
  guardDirty: null as { value: boolean } | null,
  routeLeaveGuards: [] as Array<() => boolean>,
  permissions: [
    "project.scenarios.read",
    "project.scenarios.write",
    "project.scenarios.publish",
    "project.actions.read",
  ] as string[],
}));

vi.mock(
  "@/features/scenarios/model/scenario-graph-auto-layout",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/features/scenarios/model/scenario-graph-auto-layout")
    >()),
    layoutScenarioGraphViewModel: mocks.layoutGraph,
  }),
);

vi.mock("@/features/scenarios/model/scenario-graph-layout-worker", () => ({
  createScenarioGraphLayoutWorker: mocks.createLayoutWorker,
}));

vi.mock("vue-router", () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  onBeforeRouteLeave: (guard: () => boolean) =>
    mocks.routeLeaveGuards.push(guard),
}));

vi.mock("@/features/auth/auth.store", () => ({
  useAuthStore: () => ({
    user: { id: "operator-1" },
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
          props: ["nodes", "edges", "nodesDraggable", "nodesConnectable"],
          emits: [
            "init",
            "node-click",
            "node-drag-stop",
            "viewport-change-end",
          ],
          template: '<div data-test="vue-flow"><slot /></div>',
        },
        Background: true,
        Controls: true,
        Message: { template: '<div class="message-stub"><slot /></div>' },
        ScenarioActionInspectorDock: {
          name: "ScenarioActionInspectorDock",
          props: ["width", "minWidth", "maxWidth"],
          emits: ["resize"],
          template:
            '<section class="scenario-action-inspector-dock-stub"><slot /></section>',
        },
      },
    },
  });
}

function stageButton(wrapper: ReturnType<typeof mountPage>, label: string) {
  return wrapper
    .findAll(".studio-stages button")
    .find((button) => button.find("strong").text() === label)!;
}

function setAuthoringActions(actions: Array<Record<string, unknown>>) {
  mocks.authoringActions = actions;
}

async function openValidation(wrapper: ReturnType<typeof mountPage>) {
  await wrapper
    .find('button-stub[label="Проверить условия"]')
    .trigger("click");
}

describe("ScenarioEditorPage V2 rule journey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
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
    mocks.authoringActions = [];
    mocks.layoutGraph.mockImplementation(async (viewModel) => ({
      status: "laid-out",
      viewModel,
    }));
    mocks.createLayoutWorker.mockImplementation(() => ({
      layout: vi.fn(),
      terminateWorker: vi.fn(),
    }));
    mocks.getContract.mockResolvedValue(contract);
    mocks.getScenarioDocument.mockImplementation(async () => ({
        scenarioId: scenario.id,
        projectId: "project-1",
        code: scenario.code,
        name: scenario.name,
        status: scenario.status,
        triggerEventDefinitionRevisionId: event.id,
        currentRevisionId: null,
        editable: true,
        source: {
          graph: {
            actions: mocks.authoringActions,
          },
        },
        draft: undefined,
        createdAt: "now",
        updatedAt: "now",
      }));
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

  it("keeps legacy frequency controls in one balanced row", async () => {
    const wrapper = mountPage();
    await flushPromises();

    const legacyFields = wrapper.find(".legacy-frequency-fields");
    expect(legacyFields.exists()).toBe(true);
    expect(legacyFields.findAll(".field")).toHaveLength(2);
    expect(legacyFields.text()).toContain("Макс. запусков");
    expect(legacyFields.text()).toContain("Пауза, сек.");
    expect(wrapper.find(".legacy-frequency-note").text()).toContain(
      "Перейдите на общую частоту",
    );
  });

  it("preserves a new multilingual form after create failure and retries atomic creation", async () => {
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

  it("does not leave Studio after saving an Audience-only draft change", async () => {
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
    vi.stubGlobal(
      "matchMedia",
      vi
        .fn()
        .mockReturnValue({
          matches: true,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }),
    );
    const wrapper = mountPage();
    await flushPromises();
    await stageButton(wrapper, "Действия").trigger("click");

    expect(wrapper.find('[data-test="vue-flow"]').exists()).toBe(false);
    wrapper.unmount();
    expect(window.matchMedia).toHaveBeenCalledWith("(max-width: 1100px)");
    vi.unstubAllGlobals();
  });

  it("shows the action canvas only after the first action exists", async () => {
    const wrapper = mountPage();
    await flushPromises();
    await stageButton(wrapper, "Действия").trigger("click");

    expect(wrapper.find('[data-test="vue-flow"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("Добавьте первое действие");

    setAuthoringActions([
      {
        position: 0,
        nodeKey: "welcome_message",
        type: "SAY",
        config: { text: "Добро пожаловать" },
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
    setAuthoringActions([
      {
        position: 0,
        nodeKey: "welcome_message",
        nextNodeKey: null,
        type: "SAY",
        config: { text: "Добро пожаловать" },
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
      .get('button-stub[label="Заменить первое действие"]')
      .trigger("click");

    expect(stageButton(wrapper, "Действия").classes()).toContain("active");
    expect(wrapper.getComponent(ScenarioNodeInspector).props("action"))
      .toMatchObject({ nodeKey: "welcome_message", type: "SAY" });
  });

  it("does not re-run auto-layout when a node is selected", async () => {
    setAuthoringActions([
      {
        position: 0,
        nodeKey: "welcome_message",
        nextNodeKey: null,
        type: "SAY",
        config: { text: "Добро пожаловать" },
      },
    ]);
    const wrapper = mountPage();
    await flushPromises();
    await stageButton(wrapper, "Действия").trigger("click");
    await flushPromises();
    const callsBeforeSelection = mocks.layoutGraph.mock.calls.length;

    wrapper.getComponent({ name: "VueFlow" }).vm.$emit("node-click", {
      node: { id: "welcome_message" },
    });
    await flushPromises();

    expect(mocks.layoutGraph).toHaveBeenCalledTimes(callsBeforeSelection);
  });

  it("fits the viewport after an explicit auto-layout command", async () => {
    setAuthoringActions([
      {
        position: 0,
        nodeKey: "welcome_message",
        nextNodeKey: null,
        type: "SAY",
        config: { text: "Добро пожаловать" },
      },
    ]);
    const wrapper = mountPage();
    await flushPromises();
    await stageButton(wrapper, "Действия").trigger("click");
    await flushPromises();
    const fitView = vi.fn().mockResolvedValue(true);
    wrapper.getComponent({ name: "VueFlow" }).vm.$emit("init", { fitView });
    await flushPromises();
    const layoutCallsBeforeCommand = mocks.layoutGraph.mock.calls.length;
    const fitCallsBeforeCommand = fitView.mock.calls.length;

    wrapper.getComponent(ScenarioGraphLayoutToolbar).vm.$emit("auto-layout");
    await flushPromises();

    expect(mocks.layoutGraph).toHaveBeenCalledTimes(layoutCallsBeforeCommand + 1);
    expect(fitView).toHaveBeenCalledTimes(fitCallsBeforeCommand + 1);
    expect(fitView).toHaveBeenLastCalledWith({ padding: 0.16, duration: 240 });
  });

  it("keeps drag presentation-only, restores it locally and never enables edge reconnect", async () => {
    const actions = [
      {
        position: 0,
        nodeKey: "welcome_message",
        nextNodeKey: "finish",
        type: "SAY",
        config: { text: "Добро пожаловать" },
      },
      {
        position: 1,
        nodeKey: "finish",
        nextNodeKey: null,
        type: "COMPLETE_SCENARIO",
        config: {},
      },
    ];
    setAuthoringActions(actions);
    const wrapper = mountPage();
    await flushPromises();
    await stageButton(wrapper, "Действия").trigger("click");
    await flushPromises();
    const vueFlow = wrapper.getComponent({ name: "VueFlow" });
    const getViewport = vi.fn(() => ({ x: -80, y: 30, zoom: 0.85 }));
    vueFlow.vm.$emit("init", {
      fitView: vi.fn().mockResolvedValue(true),
      getViewport,
      setViewport: vi.fn().mockResolvedValue(true),
    });
    await flushPromises();

    wrapper.getComponent(ScenarioGraphLayoutToolbar).vm.$emit("mode-change", "manual");
    await flushPromises();
    expect(vueFlow.props("nodesDraggable")).toBe(true);
    expect(vueFlow.props("nodesConnectable")).toBe(false);

    vueFlow.vm.$emit("node-drag-stop", {
      node: { id: "welcome_message", position: { x: 740, y: 310 } },
      nodes: [],
      event: new MouseEvent("mouseup"),
    });
    vueFlow.vm.$emit("viewport-change-end", { x: -120, y: 45, zoom: 0.9 });
    await flushPromises();

    expect(vueFlow.props("nodes").find(({ id }: { id: string }) => id === "welcome_message").position)
      .toEqual({ x: 740, y: 310 });
    expect(JSON.parse(window.localStorage.getItem(
      "retenive:scenario-graph-layout:v1:operator-1:project-1:scenario-1",
    )!)).toMatchObject({
      mode: "manual",
      nodes: { welcome_message: { x: 740, y: 310, pinned: true } },
      viewport: { x: -120, y: 45, zoom: 0.9 },
    });
    expect(mocks.authoringActions).toEqual(actions);

    wrapper.unmount();
    const reopened = mountPage();
    await flushPromises();
    await stageButton(reopened, "Действия").trigger("click");
    await flushPromises();
    const reopenedFlow = reopened.getComponent({ name: "VueFlow" });
    const setViewport = vi.fn().mockResolvedValue(true);
    reopenedFlow.vm.$emit("init", {
      fitView: vi.fn().mockResolvedValue(true),
      getViewport: vi.fn(() => ({ x: 0, y: 0, zoom: 1 })),
      setViewport,
    });
    await flushPromises();

    expect(reopenedFlow.props("nodesDraggable")).toBe(true);
    expect(reopenedFlow.props("nodes").find(({ id }: { id: string }) => id === "welcome_message").position)
      .toEqual({ x: 740, y: 310 });
    expect(setViewport).toHaveBeenCalledWith(
      { x: -120, y: 45, zoom: 0.9 },
      { duration: 0 },
    );
  });

  it("restores the saved viewport when the same automatic-layout draft is reopened", async () => {
    window.localStorage.setItem(
      "retenive:scenario-graph-layout:v1:operator-1:project-1:scenario-1",
      JSON.stringify({
        version: 1,
        mode: "auto",
        nodes: {},
        viewport: { x: -360, y: 128, zoom: 0.72 },
      }),
    );
    setAuthoringActions([
      {
        position: 0,
        nodeKey: "welcome_message",
        nextNodeKey: null,
        type: "SAY",
        config: { text: "Добро пожаловать" },
      },
    ]);
    const wrapper = mountPage();
    await flushPromises();
    await stageButton(wrapper, "Действия").trigger("click");
    const setViewport = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true);
    wrapper.getComponent({ name: "VueFlow" }).vm.$emit("init", {
      fitView: vi.fn().mockResolvedValue(true),
      getViewport: vi.fn(() => ({ x: 0, y: 0, zoom: 1 })),
      setViewport,
    });
    await new Promise((resolve) => setTimeout(resolve, 40));
    await flushPromises();

    expect(setViewport).toHaveBeenCalledTimes(2);
    expect(setViewport).toHaveBeenLastCalledWith(
      { x: -360, y: 128, zoom: 0.72 },
      { duration: 0 },
    );
    expect(wrapper.getComponent({ name: "VueFlow" }).props("nodesDraggable"))
      .toBe(false);
  });

  it("ignores a rejected saved-viewport restore after the graph canvas unmounts", async () => {
    window.localStorage.setItem(
      "retenive:scenario-graph-layout:v1:operator-1:project-1:scenario-1",
      JSON.stringify({
        version: 1,
        mode: "auto",
        nodes: {},
        viewport: { x: -240, y: 96, zoom: 0.8 },
      }),
    );
    setAuthoringActions([{
      position: 0,
      nodeKey: "welcome_message",
      nextNodeKey: null,
      type: "SAY",
      config: { text: "Добро пожаловать" },
    }]);
    const wrapper = mountPage();
    await flushPromises();
    await stageButton(wrapper, "Действия").trigger("click");
    let rejectViewport!: (error: Error) => void;
    const setViewport = vi.fn(() => new Promise<boolean>((_resolve, reject) => {
      rejectViewport = reject;
    }));
    const fitView = vi.fn().mockResolvedValue(true);
    wrapper.getComponent({ name: "VueFlow" }).vm.$emit("init", {
      fitView,
      setViewport,
    });
    await wrapper.vm.$nextTick();

    wrapper.unmount();
    rejectViewport(new Error("canvas removed"));
    await flushPromises();

    expect(setViewport).toHaveBeenCalledOnce();
    expect(fitView).not.toHaveBeenCalled();
  });

  it("keeps the canvas pannable but disables node movement in read-only mode", async () => {
    mocks.permissions = ["project.scenarios.read", "project.actions.read"];
    setAuthoringActions([
      {
        position: 0,
        nodeKey: "welcome_message",
        nextNodeKey: null,
        type: "SAY",
        config: { text: "Добро пожаловать" },
      },
    ]);
    window.localStorage.setItem(
      "retenive:scenario-graph-layout:v1:operator-1:project-1:scenario-1",
      JSON.stringify({
        version: 1,
        mode: "manual",
        nodes: { welcome_message: { x: 700, y: 300, pinned: true } },
        viewport: { x: -100, y: 40, zoom: 0.8 },
      }),
    );
    const wrapper = mountPage();
    await flushPromises();
    await stageButton(wrapper, "Действия").trigger("click");
    await flushPromises();

    const flow = wrapper.getComponent({ name: "VueFlow" });
    expect(flow.props("nodesDraggable")).toBe(false);
    expect(flow.props("nodesConnectable")).toBe(false);
    expect(wrapper.getComponent(ScenarioGraphLayoutToolbar).props("canArrange"))
      .toBe(false);
    expect(flow.attributes("pan-on-drag")).not.toBe("false");
    expect(flow.attributes("zoom-on-scroll")).not.toBe("false");
    expect(wrapper.getComponent(ScenarioFlowControls).props("selectedNodeId"))
      .toBeNull();
    expect(wrapper.get('[aria-label="Найти действие"]').attributes("disabled"))
      .toBeUndefined();
  });

  it("keeps authoring available when browser layout storage is blocked", async () => {
    setAuthoringActions([
      {
        position: 0,
        nodeKey: "welcome_message",
        nextNodeKey: null,
        type: "SAY",
        config: { text: "Добро пожаловать" },
      },
    ]);
    const descriptor = Object.getOwnPropertyDescriptor(window, "localStorage")!;
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: () => {
        throw new DOMException("Storage is disabled", "SecurityError");
      },
    });
    try {
      const wrapper = mountPage();
      await flushPromises();
      await stageButton(wrapper, "Действия").trigger("click");
      await flushPromises();

      wrapper.getComponent({ name: "VueFlow" });
      expect(wrapper.getComponent(ScenarioGraphLayoutToolbar).props("mode"))
        .toBe("auto");
      wrapper.unmount();
    } finally {
      Object.defineProperty(window, "localStorage", descriptor);
    }
  });

  it("keeps manual positions through inspector edits and places new nodes without a global relayout", async () => {
    setAuthoringActions([
      {
        position: 0,
        nodeKey: "welcome_message",
        nextNodeKey: null,
        type: "SAY",
        config: { text: "Добро пожаловать" },
      },
    ]);
    const wrapper = mountPage();
    await flushPromises();
    await stageButton(wrapper, "Действия").trigger("click");
    await flushPromises();
    const flow = wrapper.getComponent({ name: "VueFlow" });
    flow.vm.$emit("init", {
      fitView: vi.fn().mockResolvedValue(true),
      getViewport: vi.fn(() => ({ x: 0, y: 0, zoom: 1 })),
      setViewport: vi.fn().mockResolvedValue(true),
    });
    wrapper.getComponent(ScenarioGraphLayoutToolbar).vm.$emit("mode-change", "manual");
    flow.vm.$emit("node-drag-stop", {
      node: { id: "welcome_message", position: { x: 680, y: 300 } },
      nodes: [],
      event: new MouseEvent("mouseup"),
    });
    flow.vm.$emit("node-click", { node: { id: "welcome_message" } });
    await flushPromises();
    const layoutCallsBeforeEdit = mocks.layoutGraph.mock.calls.length;

    wrapper.getComponent(ScenarioNodeInspector).vm.$emit("update", {
      position: 0,
      nodeKey: "welcome_message",
      nextNodeKey: null,
      type: "SAY",
      config: { text: "Изменённый текст" },
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
    await flushPromises();

    expect(mocks.layoutGraph).toHaveBeenCalledTimes(layoutCallsBeforeEdit);
    expect(flow.props("nodes").find(({ id }: { id: string }) => id === "welcome_message").position)
      .toEqual({ x: 680, y: 300 });

    wrapper.getComponent(ScenarioNodeInspector).vm.$emit(
      "rename",
      "welcome_message",
      "renamed_message",
    );
    await flushPromises();
    expect(flow.props("nodes").find(({ id }: { id: string }) => id === "renamed_message").position)
      .toEqual({ x: 680, y: 300 });
    expect(JSON.parse(window.localStorage.getItem(
      "retenive:scenario-graph-layout:v1:operator-1:project-1:scenario-1",
    )!).nodes).toMatchObject({
      renamed_message: { x: 680, y: 300, pinned: true },
    });

    wrapper.getComponent(ActionPicker).vm.$emit("update:model-value", "SAY");
    await flushPromises();
    const actionNodes = flow.props("nodes").filter(({ id }: { id: string }) => id !== "trigger");
    expect(actionNodes.find(({ id }: { id: string }) => id === "renamed_message").position)
      .toEqual({ x: 680, y: 300 });
    expect(actionNodes.at(-1).position.y).toBeGreaterThan(420);
    expect(mocks.layoutGraph).toHaveBeenCalledTimes(layoutCallsBeforeEdit);
  });

  it("migrates an ephemeral new-scenario layout only after the scenario receives an id", async () => {
    mocks.route.params.scenarioId = "new";
    mocks.getScenarios.mockResolvedValue([]);
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
        uiSchema: { fields: [{ key: "text", label: "Текст", control: "textarea" }] },
      }),
    ];
    window.localStorage.setItem(
      "retenive:scenario-graph-layout:v1:operator-1:project-1:new",
      JSON.stringify({
        version: 1,
        mode: "manual",
        nodes: { step_1: { x: 999, y: 999, pinned: true } },
      }),
    );
    const wrapper = mountPage();
    await flushPromises();
    const page = wrapper.vm as unknown as {
      form: { name: string; code: string; actions: Array<Record<string, unknown>> };
    };
    page.form.name = "Новый сценарий";
    page.form.code = "new_scenario";
    page.form.actions = [{
      position: 0,
      nodeKey: "step_1",
      nextNodeKey: null,
      type: "SAY",
      config: { text: "Привет" },
    }];
    await wrapper.vm.$nextTick();
    await stageButton(wrapper, "Действия").trigger("click");
    await flushPromises();
    const flow = wrapper.getComponent({ name: "VueFlow" });
    flow.vm.$emit("init", {
      fitView: vi.fn().mockResolvedValue(true),
      getViewport: vi.fn(() => ({ x: 0, y: 0, zoom: 1 })),
      setViewport: vi.fn().mockResolvedValue(true),
    });
    wrapper.getComponent(ScenarioGraphLayoutToolbar).vm.$emit("mode-change", "manual");
    flow.vm.$emit("node-drag-stop", {
      node: { id: "step_1", position: { x: 620, y: 280 } },
      nodes: [],
      event: new MouseEvent("mouseup"),
    });
    await flushPromises();

    expect(window.localStorage.getItem(
      "retenive:scenario-graph-layout:v1:operator-1:project-1:new",
    )).toBeNull();
    await wrapper.find('button-stub[label="Сохранить"]').trigger("click");
    await flushPromises();

    expect(JSON.parse(window.localStorage.getItem(
      "retenive:scenario-graph-layout:v1:operator-1:project-1:scenario-1",
    )!)).toMatchObject({
      mode: "manual",
      nodes: { step_1: { x: 620, y: 280, pinned: true } },
    });

    wrapper.unmount();
    const fresh = mountPage();
    await flushPromises();
    const freshPage = fresh.vm as unknown as {
      form: { actions: Array<Record<string, unknown>> };
    };
    freshPage.form.actions = [{
      position: 0,
      nodeKey: "step_1",
      nextNodeKey: null,
      type: "SAY",
      config: { text: "Другой" },
    }];
    await fresh.vm.$nextTick();
    await stageButton(fresh, "Действия").trigger("click");
    await flushPromises();
    expect(fresh.getComponent(ScenarioGraphLayoutToolbar).props("mode")).toBe("auto");
    expect(fresh.getComponent({ name: "VueFlow" }).props("nodesDraggable")).toBe(false);
  });

  it("retries fitting when nodes are not measured on the first attempt", async () => {
    setAuthoringActions([
      {
        position: 0,
        nodeKey: "welcome_message",
        nextNodeKey: null,
        type: "SAY",
        config: { text: "Добро пожаловать" },
      },
    ]);
    const wrapper = mountPage();
    await flushPromises();
    await stageButton(wrapper, "Действия").trigger("click");
    await flushPromises();
    const delayedFit = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true);
    wrapper.getComponent({ name: "VueFlow" }).vm.$emit("init", {
      fitView: delayedFit,
    });
    await new Promise((resolve) => setTimeout(resolve, 40));
    await flushPromises();

    expect(delayedFit).toHaveBeenCalledTimes(2);
    expect(delayedFit).toHaveBeenLastCalledWith({ padding: 0.16, duration: 240 });
  });

  it("coalesces rapid topology-label edits and skips layout for presentation-only text", async () => {
    const action = {
      position: 0,
      nodeKey: "question",
      nextNodeKey: null,
      type: "ASK_CHOICE",
      config: {
        message: "Продолжить?",
        options: [{ id: "yes", label: "Да", nextNodeKey: "finish" }],
      },
    };
    setAuthoringActions([
      action,
      {
        position: 1,
        nodeKey: "finish",
        nextNodeKey: null,
        type: "COMPLETE_SCENARIO",
        config: {},
      },
    ]);
    const wrapper = mountPage();
    await flushPromises();
    await stageButton(wrapper, "Действия").trigger("click");
    wrapper.getComponent({ name: "VueFlow" }).vm.$emit("node-click", {
      node: { id: "question" },
    });
    await flushPromises();
    const callsAfterInitialLayout = mocks.layoutGraph.mock.calls.length;
    const inspector = wrapper.getComponent(ScenarioNodeInspector);

    inspector.vm.$emit("update", {
      ...action,
      config: { ...action.config, message: "Новый текст без изменения размеров узла" },
    });
    await wrapper.vm.$nextTick();
    expect(mocks.layoutGraph).toHaveBeenCalledTimes(callsAfterInitialLayout);

    for (const label of ["Конечно", "Да, продолжить", "Подтверждаю"]) {
      inspector.vm.$emit("update", {
        ...action,
        config: {
          ...action.config,
          message: "Новый текст без изменения размеров узла",
          options: [{ id: "yes", label, nextNodeKey: "finish" }],
        },
      });
      await wrapper.vm.$nextTick();
    }
    expect(mocks.layoutGraph).toHaveBeenCalledTimes(callsAfterInitialLayout);
    await new Promise((resolve) => setTimeout(resolve, 150));
    await flushPromises();
    expect(mocks.layoutGraph).toHaveBeenCalledTimes(callsAfterInitialLayout + 1);
  });

  it("cancels the worker and ignores a late layout result after unmount", async () => {
    setAuthoringActions([
      {
        position: 0,
        nodeKey: "welcome_message",
        nextNodeKey: null,
        type: "SAY",
        config: { text: "Добро пожаловать" },
      },
    ]);
    let resolveLayout!: (value: { status: "laid-out"; viewModel: unknown }) => void;
    mocks.layoutGraph.mockImplementation((viewModel) => new Promise((resolve) => {
      resolveLayout = resolve as typeof resolveLayout;
      void viewModel;
    }));
    const terminateWorker = vi.fn();
    mocks.createLayoutWorker.mockReturnValue({
      layout: vi.fn(),
      terminateWorker,
    });
    const wrapper = mountPage();
    await flushPromises();
    await stageButton(wrapper, "Действия").trigger("click");
    const fitView = vi.fn().mockResolvedValue(true);
    wrapper.getComponent({ name: "VueFlow" }).vm.$emit("init", { fitView });
    await wrapper.vm.$nextTick();
    const pendingViewModel = mocks.layoutGraph.mock.calls.at(-1)?.[0];

    wrapper.unmount();
    expect(terminateWorker).toHaveBeenCalledOnce();
    resolveLayout({ status: "laid-out", viewModel: pendingViewModel });
    await flushPromises();

    expect(fitView).not.toHaveBeenCalled();
  });

  it("previews a linear entry-point change and never connects the old prefix after the selected branch", async () => {
    mocks.projectActions = [
      projectAction("OPEN_MODAL"),
      projectAction("OPEN_CHAT"),
      projectAction("SAY"),
    ];
    setAuthoringActions([
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
    ]);
    const wrapper = mountPage();
    await flushPromises();

    const firstActionPicker = wrapper.getComponent(ScenarioActionTargetPicker);
    expect(firstActionPicker.props("title")).toBe("Изменить точку входа");
    expect(firstActionPicker.props("description")).toContain(
      "какие связи и действия изменятся",
    );
    firstActionPicker.vm.$emit("update:modelValue", "open_chat");
    firstActionPicker.vm.$emit("closed");
    await wrapper.vm.$nextTick();

    const page = wrapper.vm as unknown as {
      form: { actions: Array<Record<string, unknown>> };
    };
    expect(page.form.actions[0]).toMatchObject({ nodeKey: "open_form", nextNodeKey: "open_chat" });
    const dialog = wrapper.getComponent(ScenarioActionChangeDialog);
    expect(dialog.props("preview")).toMatchObject({
      kind: "entry-point",
      targetNodeKey: "open_chat",
      plan: {
        status: "ready",
        unreachableNodeKeys: ["open_form"],
      },
    });

    dialog.vm.$emit("cancel");
    await wrapper.vm.$nextTick();
    expect(page.form.actions[0]).toMatchObject({ nodeKey: "open_form", nextNodeKey: "open_chat" });

    firstActionPicker.vm.$emit("update:modelValue", "open_chat");
    firstActionPicker.vm.$emit("closed");
    await wrapper.vm.$nextTick();
    page.form.actions[2]!.config = { lateTranslation: "Свежий перевод" };
    await wrapper.vm.$nextTick();
    wrapper.getComponent(ScenarioActionChangeDialog).vm.$emit("apply");
    await wrapper.vm.$nextTick();
    expect(page.form.actions[0]).toMatchObject({ nodeKey: "open_form" });
    expect(wrapper.getComponent(ScenarioActionChangeDialog).props("preview"))
      .toMatchObject({ refreshed: true });

    wrapper.getComponent(ScenarioActionChangeDialog).vm.$emit("apply");
    await wrapper.vm.$nextTick();
    expect(page.form.actions).toMatchObject([
      { position: 0, nodeKey: "open_chat", nextNodeKey: "say_hello" },
      {
        position: 1,
        nodeKey: "say_hello",
        nextNodeKey: null,
        config: { lateTranslation: "Свежий перевод" },
      },
    ]);
    expect(page.form.actions).toHaveLength(2);
    expect(wrapper.get('[data-testid="scenario-first-action"]').text())
      .toContain("OPEN_CHAT");
  });

  it("explains why a branch target cannot become the entry point and keeps the graph unchanged", async () => {
    mocks.projectActions = [
      projectAction("ASK_CHOICE"),
      projectAction("SAY"),
    ];
    setAuthoringActions([
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
    ]);
    const wrapper = mountPage();
    await flushPromises();

    const firstActionPicker = wrapper.getComponent(ScenarioActionTargetPicker);
    firstActionPicker.vm.$emit("update:modelValue", "answer");
    firstActionPicker.vm.$emit("closed");
    await wrapper.vm.$nextTick();
    expect(wrapper.getComponent(ScenarioActionChangeDialog).props("preview"))
      .toMatchObject({
        kind: "entry-point",
        plan: {
          status: "blocked",
          reason: expect.stringContaining("обязательная ветка «Да»"),
        },
      });
    const page = wrapper.vm as unknown as {
      form: { actions: Array<Record<string, unknown>> };
    };
    expect(page.form.actions).toMatchObject([
      { position: 0, nodeKey: "question" },
      { position: 1, nodeKey: "answer" },
    ]);
    expect(
      wrapper
        .get('button-stub[label="Заменить первое действие"]')
        .attributes("label"),
    ).toBe("Заменить первое действие");
  });

  it("previews incompatible fields and transitions before replacing the first action type", async () => {
    mocks.projectActions = [
      projectActionFromCatalogItem({
        type: "ASK_CHOICE",
        name: "Вопрос",
        description: null,
        executor: "SERVER",
        configSchema: {
          type: "object",
          properties: {
            message: { type: "string" },
            options: { type: "array" },
            onTimeout: { type: "string" },
          },
          required: ["message", "options"],
        },
        uiSchema: {
          fields: [
            { key: "message", label: "Вопрос", control: "textarea" },
            { key: "options", label: "Варианты", control: "json" },
            { key: "onTimeout", label: "Тайм-аут", control: "node" },
          ],
        },
      }),
      projectActionFromCatalogItem({
        type: "SAY",
        name: "Сообщение",
        description: null,
        executor: "SERVER",
        configSchema: {
          type: "object",
          properties: { text: { type: "string", default: "" } },
          required: ["text"],
        },
        uiSchema: { fields: [{ key: "text", label: "Текст", control: "textarea" }] },
      }),
    ];
    setAuthoringActions([
      {
        position: 0,
        nodeKey: "question",
        nextNodeKey: null,
        type: "ASK_CHOICE",
        config: {
          message: "Продолжить?",
          options: [{ id: "yes", label: "Да", nextNodeKey: "finish" }],
          onTimeout: "finish",
        },
      },
      { position: 1, nodeKey: "finish", nextNodeKey: null, type: "COMPLETE_SCENARIO", config: {} },
    ]);
    const wrapper = mountPage();
    await flushPromises();
    await stageButton(wrapper, "Действия").trigger("click");
    wrapper.getComponent({ name: "VueFlow" }).vm.$emit("node-click", { node: { id: "question" } });
    await wrapper.vm.$nextTick();
    const inspector = wrapper.getComponent(ScenarioNodeInspector);
    inspector.vm.$emit("changeType", "SAY");
    inspector.vm.$emit("typePickerClosed");
    await wrapper.vm.$nextTick();

    const page = wrapper.vm as unknown as { form: { actions: Array<Record<string, unknown>> } };
    expect(page.form.actions[0]).toMatchObject({ type: "ASK_CHOICE" });
    expect(wrapper.getComponent(ScenarioActionChangeDialog).props("preview"))
      .toMatchObject({
        kind: "type-replacement",
        targetName: "Сообщение",
        plan: {
          transitionImpact: "reset-required",
          removedTransitionCount: 2,
          removedConfigKeys: ["message", "options", "onTimeout"],
        },
      });

    wrapper.getComponent(ScenarioActionChangeDialog).vm.$emit("apply");
    await wrapper.vm.$nextTick();
    expect(page.form.actions[0]).toMatchObject({
      nodeKey: "question",
      type: "SAY",
      nextNodeKey: null,
      config: { text: "" },
    });
  });

  it("requires an explicit change draft for a published head and saves it against the immutable revision", async () => {
    mocks.getScenarios.mockResolvedValueOnce([{ ...scenario, status: "ACTIVE" }]);
    mocks.projectActions = [projectAction("SAY")];
    setAuthoringActions([
      { position: 0, nodeKey: "message", nextNodeKey: null, type: "SAY", config: {} },
    ]);
    mocks.getScenarioDocument.mockResolvedValueOnce({
      scenarioId: scenario.id,
      projectId: "project-1",
      code: scenario.code,
      name: scenario.name,
      status: "ACTIVE",
      triggerEventDefinitionRevisionId: event.id,
      currentRevisionId: "revision-9",
      editable: true,
      source: { graph: { actions: mocks.authoringActions } },
      draft: undefined,
      createdAt: "now",
      updatedAt: "now",
    });
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain("Опубликованная версия revision-9 не изменится");
    expect(wrapper.find('button-stub[label="Сохранить"]').attributes("disabled")).toBeDefined();
    expect(wrapper.find('[data-testid="scenario-first-action"]').exists()).toBe(false);
    await wrapper.get('button-stub[label="Создать черновик изменений"]').trigger("click");
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain("Новые запуски перейдут на неё только после публикации");
    expect(wrapper.get('[data-testid="scenario-first-action"] button-stub').attributes("disabled")).toBe("false");

    await wrapper.find('button-stub[label="Сохранить"]').trigger("click");
    await flushPromises();
    expect(mocks.saveScenarioDraft).toHaveBeenCalledWith(
      "project-1",
      "scenario-1",
      expect.objectContaining({
        expectedCurrentRevisionId: "revision-9",
        expectedDraftVersion: null,
      }),
    );
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

  it("saves the durable document before updating scenario metadata", async () => {
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

  it("does not offer ACTIVE activation before atomic publish", async () => {
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

  it("blocks draft save when a persisted Goal config fails domain validation", async () => {
    setAuthoringActions([
      {
        position: 0,
        nodeKey: "wait",
        type: "WAIT_FOR_GOAL",
        config: { eventCode: "", onGoal: "done", onTimeout: "timeout" },
      },
      { position: 1, nodeKey: "done", type: "SAY", config: {} },
      { position: 2, nodeKey: "timeout", type: "SAY", config: {} },
    ]);
    const wrapper = mountPage();
    await flushPromises();

    await wrapper.find('button-stub[label="Сохранить"]').trigger("click");

    expect(wrapper.text()).toContain("Цель в узле «wait»");
  });

  it("blocks atomic publish when the document graph or Goal is invalid", async () => {
    setAuthoringActions([
      {
        position: 0,
        nodeKey: "wait",
        type: "WAIT_FOR_GOAL",
        config: { eventCode: "", onGoal: "", onTimeout: "" },
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

  it("fails closed when the authoring catalog is unavailable", async () => {
    mocks.getContract.mockRejectedValue(new Error("catalog offline"));
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain("catalog offline");
    expect(wrapper.find(".studio-stages").exists()).toBe(false);
    expect(wrapper.find('button-stub[label="Сохранить"]').exists()).toBe(false);
  });

  it("does not expose or retain scenario conditions from the removed editor", async () => {
    mocks.getScenarios.mockResolvedValue([
      {
        ...scenario,
        conditions: [{ path: "user.segment", operator: "eq", value: "vip" }],
      },
    ]);
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.text()).not.toContain("Условия старого формата");
    expect(
      (wrapper.vm as unknown as { form: Record<string, unknown> }).form,
    ).not.toHaveProperty("conditions");
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
    const addPicker = wrapper
      .findAllComponents(ActionPicker)
      .find((picker) => picker.classes().includes("action-library-picker"))!;
    expect(addPicker.props("catalog").map((action) => action.name))
      .toEqual(["Открыть страницу"]);
  });

  it("uses the pinned Project Action revision as the editor definition catalog", async () => {
    mocks.projectActions = [projectAction("SHOW_ASSISTANT")];
    setAuthoringActions([
      {
        position: 0,
        nodeKey: "show_assistant",
        type: "SHOW_ASSISTANT",
        config: {},
      },
    ]);

    const wrapper = mountPage();
    await flushPromises();
    await stageButton(wrapper, "Действия").trigger("click");

    expect(wrapper.text()).not.toContain(
      "Действие SHOW_ASSISTANT отсутствует в каталоге проекта",
    );
    const addPicker = wrapper
      .findAllComponents(ActionPicker)
      .find((picker) => picker.classes().includes("action-library-picker"))!;
    expect(addPicker.props("catalog").map((action) => action.type))
      .toContain("SHOW_ASSISTANT");
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
    setAuthoringActions([
      {
        position: 0,
        nodeKey: "custom_action",
        type: "CUSTOM_UNKNOWN",
        config: { preserved: true },
      },
    ]);

    const wrapper = mountPage();
    await flushPromises();
    await stageButton(wrapper, "Действия").trigger("click");

    expect(wrapper.get(".mobile-action-outline").text()).toContain("custom_action");
    expect(stageButton(wrapper, "Действия").classes()).toContain("active");
    expect(wrapper.text()).toContain("1 ошибка в действиях");
  });

  it("renders a mobile-safe action outline that can open a node without canvas gestures", async () => {
    setAuthoringActions([
      {
        position: 0,
        nodeKey: "welcome_message",
        type: "SAY",
        config: { text: "Добро пожаловать" },
      },
    ]);
    const wrapper = mountPage();
    await flushPromises();
    await stageButton(wrapper, "Действия").trigger("click");

    expect(wrapper.get(".mobile-action-outline").text()).toContain(
      "welcome_message",
    );
    const mobilePicker = wrapper
      .findAllComponents(ActionPicker)
      .find((picker) => picker.classes().includes("mobile-library-picker"));
    expect(mobilePicker?.props("label")).toBe("Добавить действие");
    expect(mobilePicker?.props("placeholder")).toBe("Добавить действие");
    await wrapper
      .get('button[aria-label="Открыть узел welcome_message"]')
      .trigger("click");

    expect(
      wrapper.findComponent({ name: "ScenarioNodeInspector" }).exists(),
    ).toBe(true);
  });

  it("creates and wires both WAIT_FOR_GOAL outcome actions", async () => {
    mocks.projectActions = [
      projectAction("WAIT_FOR_GOAL"),
      projectAction("SAY"),
      projectAction("CLOSE_CHAT"),
    ];
    setAuthoringActions([
      {
        position: 0,
        nodeKey: "wait_for_deposit",
        type: "WAIT_FOR_GOAL",
        config: {},
      },
    ]);
    const wrapper = mountPage();
    await flushPromises();
    await stageButton(wrapper, "Действия").trigger("click");
    await wrapper
      .get('button[aria-label="Открыть узел wait_for_deposit"]')
      .trigger("click");

    wrapper
      .getComponent(ScenarioNodeInspector)
      .vm.$emit("createTarget", "SAY", "goal");
    await wrapper.vm.$nextTick();
    await wrapper
      .get('button[aria-label="Открыть узел wait_for_deposit"]')
      .trigger("click");
    wrapper
      .getComponent(ScenarioNodeInspector)
      .vm.$emit("createTarget", "CLOSE_CHAT", "timeout");
    await wrapper.vm.$nextTick();

    const page = wrapper.vm as unknown as {
      form: {
        actions: Array<{
          nodeKey?: string;
          type: string;
          config: Record<string, unknown>;
        }>;
      };
    };
    const source = page.form.actions.find(
      (action) => action.nodeKey === "wait_for_deposit",
    );
    const goalAction = page.form.actions.find(
      (action) => action.nodeKey === source?.config.onGoal,
    );
    const timeoutAction = page.form.actions.find(
      (action) => action.nodeKey === source?.config.onTimeout,
    );

    expect(goalAction?.type).toBe("SAY");
    expect(timeoutAction?.type).toBe("CLOSE_CHAT");
    expect(page.form.actions).toHaveLength(3);
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
    setAuthoringActions([
      {
        position: 0,
        nodeKey: "welcome_message",
        type: "SAY",
        config: { text: "Добро пожаловать" },
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
    setAuthoringActions([
      {
        position: 0,
        nodeKey: "welcome_message",
        type: "SAY",
        config: { text: "Добро пожаловать" },
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
    const addPicker = wrapper
      .findAllComponents(ActionPicker)
      .find((picker) => picker.classes().includes("action-library-picker"))!;
    expect(addPicker.props("label")).toBe("Добавить действие");
    expect(addPicker.props("catalog")[0].description).toBe(
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

  it("keeps the desktop canvas mounted while outline search, error filter and centering drive one selection", async () => {
    setAuthoringActions([
      {
        position: 0,
        nodeKey: "welcome_message",
        nextNodeKey: "broken_action",
        type: "SAY",
        config: { text: "Добро пожаловать" },
      },
      {
        position: 1,
        nodeKey: "broken_action",
        nextNodeKey: null,
        type: "CUSTOM_UNKNOWN",
        config: {},
      },
    ]);
    const wrapper = mountPage();
    await flushPromises();
    await stageButton(wrapper, "Действия").trigger("click");
    const fitView = vi.fn().mockResolvedValue(true);
    wrapper.getComponent({ name: "VueFlow" }).vm.$emit("init", {
      fitView,
      getViewport: vi.fn(() => ({ x: 18, y: -24, zoom: 0.9 })),
    });
    await flushPromises();
    const fitCallsBeforeSelection = fitView.mock.calls.length;
    const layoutCallsBeforeNavigation = mocks.layoutGraph.mock.calls.length;

    await wrapper.get('[data-action-node-key="welcome_message"] .action-outline-main').trigger("click");
    await wrapper.vm.$nextTick();

    expect(wrapper.get(".studio-grid").classes()).toContain("has-action-inspector");
    expect(wrapper.find('[data-test="vue-flow"]').exists()).toBe(true);
    expect(wrapper.get('[data-action-node-key="welcome_message"]').classes()).toContain("active");
    expect(wrapper.getComponent(ScenarioActionInspectorDock).props("width")).toBe(380);
    expect(fitView).toHaveBeenCalledTimes(fitCallsBeforeSelection);

    await wrapper.get('[aria-label="Найти действие"]').setValue("broken");
    expect(wrapper.findAll(".action-outline-row")).toHaveLength(1);
    expect(wrapper.get(".action-outline-row").text()).toContain("broken_action");
    await wrapper.get('[aria-label="Показать только действия с ошибками"]').trigger("click");
    expect(wrapper.findAll(".action-outline-row")).toHaveLength(1);
    await wrapper.get('[aria-label="Найти действие"]').trigger("keydown", { key: "Enter" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    await flushPromises();

    expect(fitView).toHaveBeenLastCalledWith({
      nodes: ["broken_action"],
      padding: 0.75,
      minZoom: 0.9,
      maxZoom: 0.9,
      duration: 240,
    });
    expect(
      wrapper
        .getComponent({ name: "VueFlow" })
        .props("nodes")
        .find((node: { id: string }) => node.id === "broken_action"),
    ).toMatchObject({ selected: true });
    expect(wrapper.get('[data-action-node-key="broken_action"]').classes()).toContain("active");
    expect(mocks.layoutGraph).toHaveBeenCalledTimes(layoutCallsBeforeNavigation);

    wrapper.getComponent(ScenarioActionInspectorDock).vm.$emit("resize", 520);
    await wrapper.vm.$nextTick();
    expect(wrapper.get(".studio-grid").attributes("style")).toContain(
      "--action-inspector-width: 520px",
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
    expect(wrapper.text()).toContain("0 действий");
    expect(wrapper.find(".readonly-action-panel").exists()).toBe(false);

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
      code: "retenive.became_online",
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
    expect(wrapper.text()).toContain("retenive.became_online");
    expect(wrapper.text()).not.toContain("User became online");
  });
});
