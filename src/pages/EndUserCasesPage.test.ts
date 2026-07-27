import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  route: { params: {}, query: {} },
  router: { push: vi.fn(), replace: vi.fn() },
  store: {
    projectId: null,
    items: [],
    selectedId: null,
    selected: null,
    summary: {
      totalCount: 24,
      openCount: 12,
      attentionCount: 3,
      criticalCount: 1,
      unassignedCount: 4,
      resolvedCount: 8,
      unresolvedCount: 2,
      cancelledCount: 2,
    },
    filters: { preset: "ACTIVE", sort: "ATTENTION_FIRST" },
    nextCursor: null,
    loading: false,
    loadingMore: false,
    detailLoading: false,
    mutating: false,
    error: null,
    detailError: null,
    realtimeState: "CONNECTED",
    activateProject: vi.fn(),
    setFilters: vi.fn(),
    reconcile: vi.fn(),
    loadPage: vi.fn(),
    open: vi.fn(),
    close: vi.fn(),
    transition: vi.fn(),
    assign: vi.fn(),
    classify: vi.fn(),
    unlinkMessage: vi.fn(),
  },
}));
const authState = vi.hoisted(() => ({
  user: { id: "cms-1" },
  project: {
    id: "project-1",
    effectivePermissionCodes: [
      "project.cases.read",
      "project.cases.manage",
      "project.cases.assign",
      "project.cases.settings.manage",
    ],
  } as {
    id: string;
    effectivePermissionCodes: string[];
  } | null,
}));
const repository = vi.hoisted(() => ({
  assignees: vi.fn(),
  list: vi.fn(),
}));

vi.mock("vue-router", () => ({
  useRoute: () => state.route,
  useRouter: () => state.router,
}));
vi.mock("@/features/auth/auth.store", () => ({
  useAuthStore: () => authState,
}));
vi.mock("@/features/end-user-cases/model/end-user-cases.store", () => ({
  useEndUserCasesStore: () => state.store,
}));
vi.mock("@/features/end-user-cases/api/end-user-cases-repository", () => ({
  endUserCasesRepository: repository,
}));

import EndUserCasesPage from "./EndUserCasesPage.vue";

describe("EndUserCasesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.route.params = {};
    state.route.query = {};
    authState.project = {
      id: "project-1",
      effectivePermissionCodes: [
        "project.cases.read",
        "project.cases.manage",
        "project.cases.assign",
        "project.cases.settings.manage",
      ],
    };
    (state.store as { selected: unknown }).selected = null;
    state.store.selectedId = null;
    state.store.items = [];
    state.store.error = null;
    state.store.loading = false;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1200,
    });
  });

  it("shows backend summary and settings only to authorized CMS users", async () => {
    const wrapper = mount(EndUserCasesPage, {
      global: {
        stubs: {
          Button: {
            props: ["label"],
            template: "<button>{{ label }}</button>",
          },
          Dialog: true,
          Drawer: true,
          InputText: true,
          Message: { template: "<div><slot /></div>" },
          Select: true,
          Skeleton: true,
          Textarea: true,
          EndUserCaseFilters: true,
          EndUserCaseCard: true,
          EndUserCaseDetail: true,
          EndUserCaseDialogs: true,
        },
      },
    });
    await vi.waitFor(() =>
      expect(state.store.activateProject).toHaveBeenCalledWith("project-1"),
    );
    expect(wrapper.text()).toContain("Обращения пользователей");
    expect(wrapper.text()).toContain("Всего");
    expect(wrapper.text()).toContain("Решены");
    expect(wrapper.text()).toContain("Требуют внимания");
    expect(wrapper.text()).toContain("Настройки");
  });

  it("keeps header actions enabled and renders them as tertiary buttons", () => {
    const wrapper = mount(EndUserCasesPage, {
      global: {
        stubs: {
          Button: {
            props: ["label", "text", "outlined", "disabled"],
            template:
              '<button :data-label="label" :data-text="text" :data-outlined="outlined" :disabled="disabled">{{ label }}</button>',
          },
          Drawer: true,
          Message: true,
          Skeleton: true,
          EndUserCaseFilters: true,
          EndUserCaseCard: true,
          EndUserCaseDetail: true,
          EndUserCaseDialogs: true,
        },
      },
    });

    for (const label of ["Настройки", "Обновить"]) {
      const action = wrapper.get(`[data-label="${label}"]`);
      expect(action.attributes("data-text")).toBe("");
      expect(action.attributes("data-outlined")).not.toBe("true");
      expect(action.attributes("disabled")).toBeUndefined();
    }
  });

  it("forwards detail assignment actions to the isolated dialogs workflow", async () => {
    (state.store as { selected: unknown }).selected = {
      case: { id: "case-1", assignee: null },
    };
    repository.assignees.mockResolvedValue({
      items: [
        { id: "cms-1", displayName: "Текущий администратор" },
        { id: "cms-2", displayName: "Анна" },
      ],
    });
    state.store.assign.mockResolvedValue(true);
    const wrapper = mount(EndUserCasesPage, {
      global: {
        stubs: {
          Button: {
            props: ["label"],
            emits: ["click"],
            template: "<button @click=\"$emit('click')\">{{ label }}</button>",
          },
          Drawer: true,
          Dialog: {
            props: ["visible", "header"],
            template:
              '<section v-if="visible" :data-header="header"><slot /><slot name="footer" /></section>',
          },
          InputText: true,
          Message: { template: "<div><slot /></div>" },
          MultiSelect: true,
          Select: {
            props: ["modelValue", "options", "optionLabel", "optionValue"],
            emits: ["update:modelValue"],
            template:
              '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in options" :key="item.id" :value="item.id">{{ item.displayName }}</option></select>',
          },
          Skeleton: true,
          Textarea: {
            props: ["modelValue"],
            emits: ["update:modelValue"],
            template:
              '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
          },
          EndUserCaseFilters: true,
          EndUserCaseCard: true,
          EndUserCaseDetail: {
            emits: ["request-assignment"],
            template:
              '<button data-test="request-assignment" @click="$emit(\'request-assignment\')">Назначить</button>',
          },
        },
      },
    });

    await wrapper.get('[data-test="request-assignment"]').trigger("click");
    await vi.waitFor(() =>
      expect(repository.assignees).toHaveBeenCalledWith("project-1"),
    );
    expect(wrapper.text()).toContain("Анна");
    await wrapper.get("select").setValue("cms-2");
    await wrapper.get("textarea").setValue("Передача профильному специалисту");
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Сохранить")!
      .trigger("click");
    expect(state.store.assign).toHaveBeenCalledWith(
      "cms-2",
      "Передача профильному специалисту",
    );
  });

  it("normalizes a deep-link query and loads the selected Case", async () => {
    state.route.params = { caseId: "case-7" };
    state.route.query = {
      view: "WAITING",
      priority: ["CRITICAL", "invalid"],
      channel: "VOICE",
    };
    mount(EndUserCasesPage, {
      global: {
        stubs: {
          Button: true,
          Drawer: true,
          Message: true,
          Skeleton: true,
          EndUserCaseFilters: true,
          EndUserCaseCard: true,
          EndUserCaseDetail: true,
          EndUserCaseDialogs: true,
        },
      },
    });
    await vi.waitFor(() =>
      expect(state.store.setFilters).toHaveBeenCalledWith({
        preset: "WAITING",
        sort: "ATTENTION_FIRST",
        priority: ["CRITICAL"],
        channel: ["VOICE"],
      }),
    );
    expect(state.store.open).toHaveBeenCalledWith("case-7", false);
  });

  it("syncs filters and list selection into shareable routes", async () => {
    (state.store as { items: unknown[] }).items = [
      {
        id: "case-1",
        projectSequence: "1",
        title: "Deposit",
      },
    ];
    const wrapper = mount(EndUserCasesPage, {
      global: {
        stubs: {
          Button: true,
          Drawer: true,
          Message: true,
          Skeleton: true,
          EndUserCaseFilters: {
            emits: ["update:modelValue"],
            template:
              "<button data-test=\"filters\" @click=\"$emit('update:modelValue', { preset: 'ALL', sort: 'PRIORITY', groupCode: 'PAYMENT' })\">filters</button>",
          },
          EndUserCaseCard: {
            emits: ["select"],
            template:
              '<button data-test="case" @click="$emit(\'select\')">case</button>',
          },
          EndUserCaseDetail: true,
          EndUserCaseDialogs: true,
        },
      },
    });
    await wrapper.get('[data-test="filters"]').trigger("click");
    expect(state.router.replace).toHaveBeenCalledWith({
      query: { view: "ALL", sort: "PRIORITY", group: "PAYMENT" },
    });
    expect(state.store.setFilters).toHaveBeenCalledWith({
      preset: "ALL",
      sort: "PRIORITY",
      groupCode: "PAYMENT",
    });

    await wrapper.get('[data-test="case"]').trigger("click");
    expect(state.router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "end-user-case-detail",
        params: { caseId: "case-1" },
      }),
    );
    expect(state.store.open).toHaveBeenCalledWith("case-1", false);
  });

  it("uses the full-screen detail on tablet and mobile widths", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1024,
    });
    (state.store as { selectedId: string | null }).selectedId = "case-1";
    const wrapper = mount(EndUserCasesPage, {
      global: {
        stubs: {
          Button: true,
          Drawer: {
            props: ["visible"],
            emits: ["update:visible"],
            template:
              '<button v-if="visible" data-test="close-drawer" @click="$emit(\'update:visible\', false)">close</button>',
          },
          Message: true,
          Skeleton: true,
          EndUserCaseFilters: true,
          EndUserCaseCard: true,
          EndUserCaseDetail: true,
          EndUserCaseDialogs: true,
        },
      },
    });
    window.dispatchEvent(new Event("resize"));
    await wrapper.vm.$nextTick();
    await wrapper.get('[data-test="close-drawer"]').trigger("click");
    expect(state.store.close).toHaveBeenCalled();
    expect(state.router.push).toHaveBeenCalledWith({
      name: "end-user-cases",
      query: {},
    });
  });

  it("renders the standard forbidden state without loading project data", async () => {
    authState.project = {
      id: "project-1",
      effectivePermissionCodes: [],
    };
    const wrapper = mount(EndUserCasesPage, {
      global: {
        stubs: {
          Button: true,
          Drawer: true,
          Message: { template: "<div><slot /></div>" },
          Skeleton: true,
          EndUserCaseFilters: true,
          EndUserCaseCard: true,
          EndUserCaseDetail: true,
          EndUserCaseDialogs: true,
        },
      },
    });
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain("требуется разрешение проекта");
    expect(state.store.activateProject).not.toHaveBeenCalled();
  });
});
