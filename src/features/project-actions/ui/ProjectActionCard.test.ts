import { shallowMount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type { ProjectAction } from "../model/project-action";
import ProjectActionCard from "./ProjectActionCard.vue";

const action = {
  id: "action-1",
  projectId: "project-1",
  actionTypeId: "type-1",
  actionTypeRevisionId: "revision-1",
  code: "OPEN_PAGE",
  nameOverride: null,
  descriptionOverride: null,
  scenarioEnabled: false,
  aiEnabled: true,
  aiUsageDescription:
    "Use when the user explicitly asks to open a registered page.",
  configuration: { pageCodes: ["bonuses"] },
  lifecycle: "ACTIVE",
  createdAt: "now",
  updatedAt: "now",
  actionType: { key: "OPEN_PAGE", origin: "SYSTEM", ownerProjectId: null },
  actionTypeRevision: {
    id: "revision-1",
    version: 3,
    name: "Открыть страницу",
    description: "Открывает зарегистрированную страницу.",
    executorAdapter: "FRONTEND_COMMAND",
    inputSchema: {},
    resultSchema: {},
    projectConfigSchema: {},
    uiSchema: {},
    supportedSurfaces: ["SCENARIO", "AI"],
    risk: "UI_EFFECT",
    confirmationPolicy: "NEVER",
    multipleInstances: false,
  },
} satisfies ProjectAction;

describe("ProjectActionCard", () => {
  it("shows independent availability in plain Russian without internal terms", () => {
    const wrapper = shallowMount(ProjectActionCard, { props: { action } });

    expect(wrapper.text()).toContain("Сценарии");
    expect(wrapper.text()).toContain("Выключено");
    expect(wrapper.text()).toContain("Для помощника");
    expect(wrapper.text()).toContain("Включено");
    expect(wrapper.text()).toContain("Встроенное");
    expect(wrapper.text()).toContain("Версия 3");
    expect(wrapper.text()).toContain("В приложении");
    expect(wrapper.text()).toContain("Изменяет интерфейс");
    expect(wrapper.text()).not.toContain("OPEN_PAGE");
    expect(wrapper.text()).not.toContain("UI_EFFECT");
    expect(wrapper.text()).not.toContain("Frontend");
    expect(wrapper.text()).not.toContain("Доступно");
  });
});
