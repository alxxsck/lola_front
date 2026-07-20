import { flushPromises, shallowMount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectAction } from "@/features/project-actions/model/project-action";
import ProjectActionCard from "@/features/project-actions/ui/ProjectActionCard.vue";
import ProjectActionEditor from "@/features/project-actions/ui/ProjectActionEditor.vue";
import ActionsPage from "./ActionsPage.vue";

const mocks = vi.hoisted(() => ({
  ensureLoaded: vi.fn(),
  refresh: vi.fn(),
  loadPreview: vi.fn(),
  configure: vi.fn(),
  archive: vi.fn(),
  toast: vi.fn(),
}));

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
  aiUsageDescription: "Use when the user explicitly asks to open bonuses.",
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

const store = {
  catalogByProject: {
    "project-1": [
      {
        id: "type-1",
        key: "OPEN_PAGE",
        origin: "SYSTEM",
        ownerProjectId: null,
        activeRevisionId: "revision-1",
        activeRevision: action.actionTypeRevision,
      },
    ],
  },
  actionsByProject: { "project-1": [action] },
  loadingByProject: {},
  errorsByProject: {},
  previewByAction: { "action-1": { tool: null, issues: [] } },
  previewErrorsByAction: {},
  previewLoadingByAction: {},
  mutationErrorsByAction: {},
  mutatingByAction: {},
  catalogForProject: () => store.catalogByProject["project-1"],
  actionsForProject: () => store.actionsByProject["project-1"],
  ensureLoaded: mocks.ensureLoaded,
  refresh: mocks.refresh,
  loadPreview: mocks.loadPreview,
  configure: mocks.configure,
  archive: mocks.archive,
};

vi.mock("@/features/auth/auth.store", () => ({
  useAuthStore: () => ({
    project: { id: "project-1" },
    user: { role: "OWNER" },
  }),
}));
vi.mock("@/features/project-actions/model/project-actions.store", () => ({
  useProjectActionsStore: () => store,
}));
vi.mock("primevue/usetoast", () => ({
  useToast: () => ({ add: mocks.toast }),
}));

describe("ActionsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureLoaded.mockResolvedValue(undefined);
    mocks.loadPreview.mockResolvedValue({ tool: null, issues: [] });
    mocks.configure.mockResolvedValue(action);
  });

  it("loads Project Actions and reconciles an OWNER edit through the domain store", async () => {
    const wrapper = shallowMount(ActionsPage, {
      global: {
        stubs: {
          Dialog: {
            props: ["visible"],
            template: '<div v-if="visible"><slot /></div>',
          },
        },
      },
    });
    await flushPromises();

    expect(mocks.ensureLoaded).toHaveBeenCalledWith("project-1");
    const card = wrapper.getComponent(ProjectActionCard);
    card.vm.$emit("select", action);
    await flushPromises();
    expect(mocks.loadPreview).toHaveBeenCalledWith(
      "project-1",
      "action-1",
      false,
    );

    const editor = wrapper.getComponent(ProjectActionEditor);
    editor.vm.$emit("save", { scenarioEnabled: false, aiEnabled: true });
    await flushPromises();

    expect(mocks.configure).toHaveBeenCalledWith("project-1", "action-1", {
      scenarioEnabled: false,
      aiEnabled: true,
    });
    expect(mocks.loadPreview).toHaveBeenLastCalledWith(
      "project-1",
      "action-1",
      true,
    );
  });

  it("loads authoritative previews for the AI-only overview", async () => {
    const wrapper = shallowMount(ActionsPage, {
      global: { stubs: { Dialog: true, AiCapabilityPreview: true } },
    });
    await flushPromises();
    const aiTab = wrapper
      .findAll(".view-tabs button")
      .find((button) => button.text().includes("Возможности помощника"))!;

    await aiTab.trigger("click");
    await flushPromises();

    expect(mocks.loadPreview).toHaveBeenCalledWith(
      "project-1",
      "action-1",
      false,
    );
    expect(wrapper.find(".ai-capability-list").exists()).toBe(true);
    expect(wrapper.text()).not.toContain("AI capabilities");
    expect(wrapper.text()).not.toContain("Default-deny");

    mocks.loadPreview.mockClear();
    await wrapper.find('button-stub[label="Обновить"]').trigger("click");
    await flushPromises();
    expect(mocks.loadPreview).toHaveBeenCalledWith(
      "project-1",
      "action-1",
      true,
    );
  });
});
