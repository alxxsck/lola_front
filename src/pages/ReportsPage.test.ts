import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { beforeEach, describe, expect, it } from "vitest";
import { useAuthStore } from "@/features/auth/auth.store";
import { resetMockReportingRepository } from "@/features/reporting/api/reporting-repository";
import ReportsPage from "./ReportsPage.vue";

function mountPage(permissions: string[]) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const auth = useAuthStore();
  auth.$patch({
    phase: "AUTHENTICATED",
    user: { id: "operator-1", email: "operator@example.com", name: "Оператор" },
    project: {
      id: "project-1",
      name: "Project One",
      slug: "project-one",
      status: "ACTIVE",
      supportedLocales: ["ru"],
      effectivePermissionCodes: permissions,
    },
  });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/reports", component: ReportsPage },
      { path: "/reports/new", component: { template: "<div />" } },
      { path: "/reports/:reportId", component: { template: "<div />" } },
      { path: "/reports/:reportId/edit", component: { template: "<div />" } },
      { path: "/dashboards/new", component: { template: "<div />" } },
      { path: "/dashboards/:dashboardId", component: { template: "<div />" } },
      {
        path: "/dashboards/:dashboardId/edit",
        component: { template: "<div />" },
      },
    ],
  });
  return { pinia, router, auth };
}

describe("ReportsPage", () => {
  beforeEach(() => resetMockReportingRepository());

  it("browses authority-filtered dashboards and Saved Reports without running widgets", async () => {
    const { pinia, router } = mountPage([
      "project.analytics.read",
      "project.saved_reports.create",
      "project.dashboards.create",
    ]);
    await router.push("/reports");
    await router.isReady();
    const wrapper = mount(ReportsPage, {
      global: {
        plugins: [pinia, router],
        stubs: {
          Button: {
            props: ["label"],
            template: "<button>{{ label }}<slot /></button>",
          },
          InputText: {
            props: ["modelValue"],
            emits: ["update:modelValue"],
            template:
              '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
          },
          Select: { template: "<select />" },
          Tag: { props: ["value"], template: "<span>{{ value }}</span>" },
          Skeleton: { template: "<span />" },
        },
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("Пульс продукта");
    expect(wrapper.text()).toContain("Создать отчёт");
    expect(wrapper.text()).toContain("Создать дашборд");

    await wrapper.get('[data-tab="reports"]').trigger("click");
    expect(wrapper.text()).toContain("Активные пользователи");
    expect(wrapper.text()).not.toContain("Пульс продукта");

    await wrapper.get('input[type="search"]').setValue("Каналы");
    expect(wrapper.text()).toContain("Каналы привлечения");
    expect(wrapper.text()).not.toContain("Активные пользователи");
  });

  it("keeps authoring actions hidden from a read-only CMS User", async () => {
    const { pinia, router } = mountPage(["project.analytics.read"]);
    await router.push("/reports");
    await router.isReady();
    const wrapper = mount(ReportsPage, {
      global: {
        plugins: [pinia, router],
        stubs: {
          Button: {
            props: ["label"],
            template: "<button>{{ label }}<slot /></button>",
          },
          InputText: { template: '<input type="search" />' },
          Select: { template: "<select />" },
          Tag: { template: "<span />" },
          Skeleton: { template: "<span />" },
        },
      },
    });
    await flushPromises();

    expect(wrapper.text()).not.toContain("Создать отчёт");
    expect(wrapper.text()).not.toContain("Создать дашборд");
    expect(wrapper.find('button[aria-label^="Редактировать"]').exists()).toBe(
      false,
    );
  });
});
