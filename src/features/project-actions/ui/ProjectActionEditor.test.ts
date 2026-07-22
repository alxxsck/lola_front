import { shallowMount } from "@vue/test-utils";
import InputText from "primevue/inputtext";
import Textarea from "primevue/textarea";
import ToggleSwitch from "primevue/toggleswitch";
import { describe, expect, it } from "vitest";
import type { ProjectAction } from "../model/project-action";
import ProjectActionEditor from "./ProjectActionEditor.vue";

const action = {
  id: "action-1",
  projectId: "project-1",
  actionTypeId: "type-1",
  actionTypeRevisionId: "revision-1",
  code: "OPEN_PAGE",
  nameOverride: null,
  descriptionOverride: null,
  scenarioEnabled: false,
  aiEnabled: false,
  aiUsageDescription: null,
  configuration: {},
  lifecycle: "ACTIVE",
  createdAt: "now",
  updatedAt: "now",
  actionType: { key: "OPEN_PAGE", origin: "SYSTEM", ownerProjectId: null },
  actionTypeRevision: {
    id: "revision-1",
    version: 1,
    name: "Открыть страницу",
    description: "Открывает зарегистрированную страницу.",
    executorAdapter: "FRONTEND_COMMAND",
    inputSchema: {},
    resultSchema: {},
    projectConfigSchema: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    uiSchema: { fields: [] },
    supportedSurfaces: ["SCENARIO", "AI"],
    risk: "UI_EFFECT",
    confirmationPolicy: "NEVER",
    multipleInstances: false,
  },
} satisfies ProjectAction;

const dialogStub = {
  props: ["visible", "header"],
  template:
    '<div v-if="visible" class="dialog-stub"><h2>{{ header }}</h2><slot /><slot name="footer" /></div>',
};
const messageStub = { template: '<div class="message-stub"><slot /></div>' };
const allPermissions = [
  "project.actions.manage",
  "project.actions.manage_ai_exposure",
];

describe("ProjectActionEditor", () => {
  it("requires AI-exposure Permission, description, audit reason and explicit confirmation", async () => {
    const wrapper = shallowMount(ProjectActionEditor, {
      props: { action, effectivePermissionCodes: allPermissions },
      global: { stubs: { Dialog: dialogStub, Message: messageStub } },
    });
    const aiToggle = wrapper
      .findAllComponents(ToggleSwitch)
      .find(
        (item) => item.attributes("aria-label") === "Разрешить помощнику Lola",
      )!;
    aiToggle.vm.$emit("update:modelValue", true);
    await wrapper.vm.$nextTick();
    await wrapper.get("form").trigger("submit");

    expect(wrapper.text()).toContain(
      "Подсказка для Lola должна содержать от 20 до 2000 символов",
    );
    expect(wrapper.emitted("save")).toBeUndefined();

    wrapper
      .getComponent(Textarea)
      .vm.$emit(
        "update:modelValue",
        "Use when the user explicitly asks to open the bonuses page.",
      );
    wrapper
      .getComponent(InputText)
      .vm.$emit("update:modelValue", "Enable requested bonuses navigation");
    await wrapper.vm.$nextTick();
    await wrapper.get("form").trigger("submit");
    expect(wrapper.text()).toContain("Проверьте изменения перед сохранением");
    expect(wrapper.text()).toContain(
      "Use when the user explicitly asks to open the bonuses page.",
    );
    expect(wrapper.text()).toContain("Что изменится после сохранения");
    expect(wrapper.text()).not.toContain("Backend");
    expect(wrapper.text()).not.toContain("authority");
    await wrapper
      .get('[data-test="confirm-project-action-save"]')
      .trigger("click");

    expect(wrapper.emitted("save")?.[0]?.[0]).toEqual({
      scenarioEnabled: false,
      aiEnabled: true,
      aiUsageDescription:
        "Use when the user explicitly asks to open the bonuses page.",
      configuration: {},
      auditReason: "Enable requested bonuses navigation",
    });
  });

  it("keeps mutation controls read-only without the manage Permission", () => {
    const wrapper = shallowMount(ProjectActionEditor, {
      props: { action, effectivePermissionCodes: [] },
    });

    expect(
      wrapper
        .findAllComponents(ToggleSwitch)
        .every((item) => item.attributes("disabled") !== undefined),
    ).toBe(true);
    expect(
      wrapper.get('[data-test="save-project-action"]').attributes("disabled"),
    ).toBeDefined();
    expect(wrapper.find('[data-test="archive-project-action"]').exists()).toBe(
      false,
    );
  });

  it("blocks confirmation when configuration violates the published schema", async () => {
    const configuredAction: ProjectAction = {
      ...action,
      actionTypeRevision: {
        ...action.actionTypeRevision,
        projectConfigSchema: {
          type: "object",
          properties: { target: { type: "string", enum: ["bonuses"] } },
          required: ["target"],
          additionalProperties: false,
        },
      },
    };
    const wrapper = shallowMount(ProjectActionEditor, {
      props: { action: configuredAction, effectivePermissionCodes: allPermissions },
      global: { stubs: { Dialog: dialogStub, Message: messageStub } },
    });

    await wrapper.get("form").trigger("submit");

    expect(wrapper.text()).toContain("Заполните поле «Target»");
    expect(wrapper.text()).not.toContain(
      "Проверьте изменения перед сохранением",
    );
  });
});
