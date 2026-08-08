import { shallowMount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import type { ScenarioAuthoringContract } from "@/shared/api/repository/scenario-authoring";
import type {
  ScenarioAction,
  ScenarioActionCatalogItem,
} from "@/shared/types/domain";
import ScenarioActionTargetPicker from "@/features/actions/ScenarioActionTargetPicker.vue";
import ActionPicker from "@/features/actions/ActionPicker.vue";
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
  it("replaces an action type and applies existing or newly created next actions through catalogs", async () => {
    const say: ScenarioAction = {
      position: 0,
      nodeKey: "say_1",
      nextNodeKey: null,
      type: "SAY",
      config: {},
    };
    const close: ScenarioAction = {
      position: 1,
      nodeKey: "close_2",
      nextNodeKey: null,
      type: "CLOSE_CHAT",
      config: {},
    };
    const wrapper = shallowMount(ScenarioNodeInspector, {
      props: {
        projectId: "project-1",
        action: say,
        actions: [say, close],
        actionCatalog,
        events: [],
        elements: [],
        templateVariables: [],
        conditionPaths: [],
        issues: [],
        authoringContract: null,
        localizationPolicy: {
          version: 1,
          mode: "ALL_PROJECT_LOCALES",
          locales: ["ru"],
        },
        scenarioId: "scenario-1",
        actionPath: "graph.actions.say_1",
        translationStates: {},
      },
    });

    wrapper.getComponent(ActionPicker).vm.$emit(
      "update:modelValue",
      "CLOSE_CHAT",
    );
    const targetPicker = wrapper.getComponent(ScenarioActionTargetPicker);
    expect(targetPicker.props("options")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "close_2", kind: "existing" }),
        expect.objectContaining({
          kind: "create",
          actionType: "CLOSE_CHAT",
        }),
      ]),
    );

    targetPicker.vm.$emit("update:modelValue", "close_2");
    targetPicker.vm.$emit(
      "select",
      targetPicker
        .props("options")
        .find((option) => option.kind === "create" && option.actionType === "CLOSE_CHAT"),
    );
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted("changeType")).toEqual([["CLOSE_CHAT"]]);
    expect(wrapper.emitted("update")?.[0]?.[0]).toMatchObject({
      nextNodeKey: "close_2",
    });
    expect(wrapper.emitted("createTarget")).toEqual([
      ["CLOSE_CHAT", "next", undefined],
    ]);
  });

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

    const branchPickers = wrapper.findAllComponents(ScenarioActionTargetPicker);
    expect(branchPickers).toHaveLength(2);
    expect(
      branchPickers[0]!
        .props("options")
        .map((option) => option.actionType),
    ).toEqual(["WAIT_FOR_GOAL", "SAY", "CLOSE_CHAT"]);

    branchPickers[0]!.vm.$emit(
      "select",
      branchPickers[0]!
        .props("options")
        .find((option) => option.actionType === "SAY"),
    );
    branchPickers[1]!.vm.$emit(
      "select",
      branchPickers[1]!
        .props("options")
        .find((option) => option.actionType === "CLOSE_CHAT"),
    );
    await wrapper.vm.$nextTick();

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
