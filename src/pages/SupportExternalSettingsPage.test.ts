import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";
import { useAuthStore } from "@/features/auth/auth.store";
import {
  mockSupportExternalWorkSource,
  resetMockSupportExternalWork,
} from "@/features/support-external-work/api/support-external-work-mock-source";
import { ApiError } from "@/shared/api/http/api-error";
import SupportExternalSettingsPage from "./SupportExternalSettingsPage.vue";

vi.mock("@/features/support-external-work/api/support-external-work-source", async () => {
  const actual = await vi.importActual<typeof import("@/features/support-external-work/api/support-external-work-source")>(
    "@/features/support-external-work/api/support-external-work-source",
  );
  const mock = await vi.importActual<typeof import("@/features/support-external-work/api/support-external-work-mock-source")>(
    "@/features/support-external-work/api/support-external-work-mock-source",
  );
  return { ...actual, supportExternalWorkSource: mock.mockSupportExternalWorkSource };
});

function authenticate(permissions = ["project.support.external_work.manage"]) {
  const auth = useAuthStore();
  const project = {
    id: "project-1",
    name: "Project One",
    slug: "project-one",
    status: "ACTIVE" as const,
    supportedLocales: ["ru"],
    effectivePermissionCodes: permissions,
  };
  auth.$patch({
    phase: "AUTHENTICATED",
    user: { id: "operator-1", email: "operator@example.com", name: "Оператор" },
    project,
    projects: [project],
  });
  return auth;
}

describe("Support External settings page", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setActivePinia(createPinia());
    resetMockSupportExternalWork();
  });

  it("renders connection health, catalog freshness and mapping lifecycle", async () => {
    authenticate();
    const { wrapper } = await mountPage();
    await flushPromises();

    expect(wrapper.get("h1").text()).toBe("Интеграции External Work");
    expect(wrapper.text()).toContain("JSM · Support cloud");
    expect(wrapper.text()).toContain("Требуется повторный вход");
    expect(wrapper.text()).toContain("Последняя успешная синхронизация");
    expect(wrapper.text()).toContain("Support routing");
    expect(wrapper.text()).toContain("Draft #4");
  });

  it("purges protected settings when manage permission is revoked", async () => {
    const auth = authenticate();
    const { wrapper } = await mountPage();
    await flushPromises();
    expect(wrapper.text()).toContain("JSM · Support cloud");

    auth.project!.effectivePermissionCodes = [];
    await flushPromises();

    expect(wrapper.text()).not.toContain("JSM · Support cloud");
    expect(wrapper.text()).toContain("Нет доступа к настройкам External Work");
  });

  it("offers a connection-scoped mapping draft for the second provider", async () => {
    authenticate();
    const { wrapper } = await mountPage();
    await flushPromises();

    await wrapper.findAll("button.connection-card")[1]!.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("HelpDesk · Tier 2");
    expect(wrapper.text()).toContain("Published mapping отсутствует");
    expect(wrapper.text()).not.toContain("Draft #4");
    expect(wrapper.text()).toContain("Создать mapping draft");
  });

  it("forgets a 428 command and routes through a fresh login", async () => {
    const auth = authenticate();
    const logout = vi.spyOn(auth, "logout").mockResolvedValue(undefined);
    const testConnection = vi
      .spyOn(mockSupportExternalWorkSource, "testConnection")
      .mockRejectedValueOnce(
        new ApiError(
          428,
          "fresh authentication required",
          undefined,
          undefined,
          "REAUTHENTICATION_REQUIRED",
        ),
      );
    const { router, wrapper } = await mountPage();
    const button = wrapper
      .findAll("button")
      .find((candidate) => candidate.text().includes("Проверить connection"))!;

    await button.trigger("click");
    await flushPromises();

    expect(logout).toHaveBeenCalledOnce();
    expect(testConnection).toHaveBeenCalledOnce();
    expect(router.currentRoute.value.fullPath).toBe(
      "/login?redirect=/support/settings/integrations",
    );
    expect(wrapper.text()).not.toContain("JSM · Support cloud");
    await button.trigger("click");
    expect(testConnection).toHaveBeenCalledOnce();
  });

  it("renders every same-provider site and keeps an explicit add action", async () => {
    authenticate();
    const base = await mockSupportExternalWorkSource.listConnections("project-1");
    const jsm = base.items.find((item) => item.provider === "JSM")!;
    const secondJsm = {
      ...jsm,
      id: "10000000-0000-4000-8000-000000000099",
      tenantIdentity: "support-emea",
      displayName: "JSM · EMEA",
    };
    const originalReadCatalog = mockSupportExternalWorkSource.readCatalog;
    vi.spyOn(mockSupportExternalWorkSource, "listConnections").mockImplementation(
      async (_projectId, cursor) =>
        cursor
          ? { items: [secondJsm], nextCursor: null }
          : { items: base.items, nextCursor: "next-site" },
    );
    vi.spyOn(mockSupportExternalWorkSource, "readCatalog").mockImplementation(
      (projectId, connectionId, params, signal) =>
        originalReadCatalog(
          projectId,
          connectionId === secondJsm.id ? jsm.id : connectionId,
          params,
          signal,
        ),
    );

    const { wrapper } = await mountPage();

    expect(wrapper.text()).toContain("JSM · EMEA");
    expect(wrapper.text()).toContain("Добавить JSM");
    const emea = wrapper
      .findAll("button.connection-card")
      .find((candidate) => candidate.text().includes("JSM · EMEA"))!;
    await emea.trigger("click");
    await flushPromises();
    expect(wrapper.get("h2").text()).not.toBe("");
    expect(wrapper.text()).toContain("Published mapping отсутствует");
  });
});

async function mountPage() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: "/support/settings/integrations",
        name: "support-external-settings",
        component: SupportExternalSettingsPage,
      },
      { path: "/login", component: { template: "<div>login</div>" } },
    ],
  });
  await router.push("/support/settings/integrations");
  await router.isReady();
  const wrapper = mount(SupportExternalSettingsPage, {
    global: { stubs, plugins: [router] },
  });
  await flushPromises();
  return { router, wrapper };
}

const stubs = {
  Button: { props: ["label"], emits: ["click"], template: '<button type="button" @click="$emit(\'click\')">{{ label }}<slot /></button>' },
  Checkbox: { template: '<input type="checkbox" />' },
  Dialog: { template: '<div><slot /><slot name="footer" /></div>' },
  InputText: { template: '<input />' },
  Message: { template: '<div><slot /></div>' },
  Select: { props: ["modelValue"], template: '<div><slot />{{ modelValue }}</div>' },
  Skeleton: { template: '<span />' },
  Tag: { props: ["value"], template: '<span>{{ value }}</span>' },
};
