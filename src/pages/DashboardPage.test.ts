import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { beforeEach, describe, expect, it } from "vitest";
import { useAuthStore } from "@/features/auth/auth.store";
import { resetMockReportingRepository } from "@/features/reporting/api/reporting-repository";
import DashboardPage from "./DashboardPage.vue";

const stubs = {
  Button: {
    props: ["label", "loading", "disabled"],
    emits: ["click"],
    template:
      '<button :disabled="disabled" @click="$emit(\'click\')">{{ label }}<slot /></button>',
  },
  InputText: { template: "<input />" },
  Textarea: { template: "<textarea />" },
  Select: { template: "<select />" },
  Skeleton: { template: "<span />" },
};

async function mountPage(path: string) {
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
      effectivePermissionCodes: [
        "project.analytics.read",
        "project.analytics.query.execute",
        "project.dashboards.create",
        "project.dashboards.edit_own",
        "project.dashboards.publish",
      ],
    },
  });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/reports", component: { template: "<div />" } },
      { path: "/reports/:reportId", component: { template: "<div />" } },
      {
        path: "/dashboards/new",
        name: "dashboard-create",
        component: DashboardPage,
      },
      {
        path: "/dashboards/:dashboardId",
        name: "dashboard-view",
        component: DashboardPage,
      },
      {
        path: "/dashboards/:dashboardId/edit",
        name: "dashboard-edit",
        component: DashboardPage,
      },
    ],
  });
  await router.push(path);
  await router.isReady();
  const wrapper = mount(DashboardPage, {
    global: { plugins: [pinia, router], stubs },
  });
  await flushPromises();
  return { wrapper, router };
}

describe("DashboardPage", () => {
  beforeEach(() => resetMockReportingRepository());

  it("renders the Dashboard shell before independently loaded Widgets", async () => {
    const { wrapper } = await mountPage("/dashboards/dashboard-product-pulse");

    expect(wrapper.text()).toContain("Пульс продукта");
    expect(wrapper.text()).toContain("Применено к 3 из 3");
    expect(wrapper.findAll("[data-dashboard-widget]")).toHaveLength(3);
    expect(wrapper.text()).toContain("12 840 активных пользователей");
    expect(wrapper.text()).toContain("Каналы привлечения");
    expect(wrapper.text()).toContain("Объяснить");
  });

  it("builds a Dashboard Draft from published Saved Reports", async () => {
    const { wrapper } = await mountPage(
      "/dashboards/new?reportId=report-active-users",
    );

    expect(wrapper.text()).toContain("Новый дашборд");
    expect(wrapper.text()).toContain("Добавить отчёт");
    expect(wrapper.text()).toContain("Активные пользователи");
    expect(wrapper.text()).toContain("Ширина");
    expect(wrapper.text()).toContain("Сохранить черновик");
    expect(wrapper.text()).toContain("Опубликовать");
  });
});
