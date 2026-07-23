import { shallowMount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import type { ScenarioAuthoringContract } from "@/shared/api/repository/scenario-authoring";
import type {
  ScenarioAction,
  ScenarioActionCatalogItem,
} from "@/shared/types/domain";
import ScenarioNodeInspector from "./ScenarioNodeInspector.vue";

const waitForGoal: ScenarioAction = {
  position: 0,
  nodeKey: "wait_for_deposit",
  type: "WAIT_FOR_GOAL",
  config: {},
};

const actionCatalog: ScenarioActionCatalogItem[] = [
  {
    id: "wait-for-goal",
    type: "WAIT_FOR_GOAL",
    name: "Ждать цель пользователя",
    description: null,
    executor: "SERVER",
    configSchema: { type: "object", properties: {}, required: [] },
    uiSchema: { fields: [] },
    enabled: true,
  },
  {
    id: "say",
    type: "SAY",
    name: "Сказать текст",
    description: null,
    executor: "SERVER",
    configSchema: { type: "object", properties: {}, required: [] },
    uiSchema: { fields: [] },
    enabled: true,
  },
  {
    id: "close-chat",
    type: "CLOSE_CHAT",
    name: "Закрыть чат",
    description: null,
    executor: "FRONTEND",
    configSchema: { type: "object", properties: {}, required: [] },
    uiSchema: { fields: [] },
    enabled: true,
  },
];

const contract = {
  projectId: "project-1",
  revision: "catalog-1",
  version: 1,
  events: [],
} as unknown as ScenarioAuthoringContract;

describe("ScenarioNodeInspector", () => {
  it("offers enabled actions for both WAIT_FOR_GOAL branches when no target nodes exist", async () => {
    const wrapper = shallowMount(ScenarioNodeInspector, {
      props: {
        projectId: "project-1",
        action: waitForGoal,
        actions: [waitForGoal],
        actionCatalog,
        events: [],
        elements: [],
        templateVariables: [],
        conditionPaths: [],
        issues: [],
        authoringContract: contract,
        localizationPolicy: {
          version: 1,
          mode: "ALL_PROJECT_LOCALES",
          locales: ["ru"],
        },
        scenarioId: "scenario-1",
        actionPath: "graph.actions.wait_for_deposit",
        translationStates: {},
      },
      global: {
        stubs: {
          ScenarioGoalEditor: false,
        },
      },
    });

    const expectedActions = [
      "＋ Создать: Ждать цель пользователя",
      "＋ Создать: Сказать текст",
      "＋ Создать: Закрыть чат",
    ];

    expect(
      wrapper
        .get('select[aria-label="Ветка при достижении цели"]')
        .findAll("option")
        .map((option) => option.text()),
    ).toEqual(["Выберите действие", ...expectedActions]);
    expect(
      wrapper
        .get('select[aria-label="Ветка по истечении срока"]')
        .findAll("option")
        .map((option) => option.text()),
    ).toEqual(["Выберите действие", ...expectedActions]);

    await wrapper
      .get('select[aria-label="Ветка при достижении цели"]')
      .setValue("__create__:SAY");
    await wrapper
      .get('select[aria-label="Ветка по истечении срока"]')
      .setValue("__create__:CLOSE_CHAT");

    expect(wrapper.emitted("createTarget")).toEqual([
      ["SAY", "goal"],
      ["CLOSE_CHAT", "timeout"],
    ]);

    await wrapper.setProps({
      action: {
        ...waitForGoal,
        config: {
          onGoal: "say_1",
          onTimeout: "close_chat_1",
        },
      },
    });
    await wrapper
      .get('input[aria-label="Порог цели"]')
      .setValue("2");

    const updates = wrapper.emitted("update") ?? [];
    const updatedAction = updates.at(-1)?.[0] as ScenarioAction;
    expect(updatedAction.config).toMatchObject({
      onGoal: "say_1",
      onTimeout: "close_chat_1",
    });
  });
});
