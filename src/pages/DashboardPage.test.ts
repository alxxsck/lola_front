import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth/auth.store";
import { resetMockReportingRepository } from "@/features/reporting/api/reporting-repository";
import { reportingRepository } from "@/features/reporting/api/reporting-repository";
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
      {
        path: "/overview",
        name: "overview",
        component: { template: "<div />" },
      },
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
  return { wrapper, router, auth };
}

describe("DashboardPage", () => {
  beforeEach(() => resetMockReportingRepository());

  it("renders the Dashboard shell before independently loaded Widgets", async () => {
    const listSavedReports = vi.spyOn(reportingRepository, "listSavedReports");
    const runDashboardWidget = vi.spyOn(
      reportingRepository,
      "runDashboardWidget",
    );
    const { wrapper } = await mountPage("/dashboards/dashboard-product-pulse");

    expect(wrapper.text()).toContain("Пульс продукта");
    expect(wrapper.text()).toContain("Применено к 3 из 3");
    expect(wrapper.findAll("[data-dashboard-widget]")).toHaveLength(3);
    expect(wrapper.text()).toContain("12 840 активных пользователей");
    expect(wrapper.text()).toContain("Каналы привлечения");
    expect(wrapper.text()).toContain("Объяснить");
    expect(wrapper.text()).toContain("Диагностика");
    expect(listSavedReports).not.toHaveBeenCalled();
    expect(runDashboardWidget).toHaveBeenCalledTimes(3);
    expect(runDashboardWidget).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        dashboardRevisionId: "dashboard-product-pulse-r4",
        periodDays: 2,
      }),
      expect.any(AbortSignal),
    );

    await wrapper.findAll(".dashboard-pages button")[1]?.trigger("click");
    await flushPromises();
    expect(wrapper.findAll("[data-dashboard-widget]")).toHaveLength(50);
    expect(runDashboardWidget).toHaveBeenCalledTimes(4);
    listSavedReports.mockRestore();
    runDashboardWidget.mockRestore();
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

  it("preserves hidden pages when editing the Overview Draft", async () => {
    const { wrapper, router } = await mountPage(
      "/dashboards/dashboard-product-pulse/edit",
    );

    await wrapper.get(".dashboard-actions button:first-child").trigger("click");
    await flushPromises();

    const draftId = String(router.currentRoute.value.params.dashboardId);
    const saved = await reportingRepository.getDashboard("project-1", draftId);
    expect(saved.pages).toHaveLength(2);
    expect(saved.pages[1]?.title).toBe("Диагностика");
    expect(saved.pages[1]?.widgets).toHaveLength(50);
  });

  it("purges rendered Widgets immediately when aggregate read is revoked", async () => {
    const { wrapper, router, auth } = await mountPage(
      "/dashboards/dashboard-product-pulse",
    );
    expect(wrapper.findAll("[data-dashboard-widget]")).toHaveLength(3);

    auth.project!.effectivePermissionCodes = [];
    await flushPromises();

    expect(wrapper.findAll("[data-dashboard-widget]")).toHaveLength(0);
    expect(router.currentRoute.value.name).toBe("overview");
  });
});
