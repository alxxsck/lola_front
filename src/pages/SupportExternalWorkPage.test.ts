import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";
import { useAuthStore } from "@/features/auth/auth.store";
import { resetMockSupportExternalWork } from "@/features/support-external-work/api/support-external-work-mock-source";
import SupportExternalWorkPage from "./SupportExternalWorkPage.vue";

vi.mock(
  "@/features/support-external-work/api/support-external-work-source",
  async () => {
    const actual = await vi.importActual<
      typeof import("@/features/support-external-work/api/support-external-work-source")
    >("@/features/support-external-work/api/support-external-work-source");
    const mock = await vi.importActual<
      typeof import("@/features/support-external-work/api/support-external-work-mock-source")
    >("@/features/support-external-work/api/support-external-work-mock-source");
    return {
      ...actual,
      supportExternalWorkSource: mock.mockSupportExternalWorkSource,
    };
  },
);

function authenticate() {
  const auth = useAuthStore();
  const project = {
    id: "project-1",
    name: "Project One",
    slug: "project-one",
    status: "ACTIVE" as const,
    supportedLocales: ["ru"],
    effectivePermissionCodes: [
      "project.support.external_work.inbox_read",
      "project.support.external_work.read_linked",
      "project.support.external_work.retry",
      "project.support.external_work.resolve_unknown",
    ],
  };
  auth.$patch({
    phase: "AUTHENTICATED",
    user: { id: "operator-1", email: "operator@example.com", name: "Оператор" },
    project,
    projects: [project],
  });
}

describe("Support External Work page", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    resetMockSupportExternalWork();
  });

  it("moves from the attention queue to a safe causal detail", async () => {
    authenticate();
    const { router, wrapper } = await mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain(
      "Уведомление принято, но сверка с внешней системой требует внимания",
    );
    await wrapper.get('[data-testid="external-item"]').trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Идентификатор во внешней системе");
    expect(wrapper.text()).toContain("HD-2048");
    expect(wrapper.text()).toContain("История событий");
    expect(wrapper.text()).toContain("Содержимое недоступно");
    expect(router.currentRoute.value.query.itemId).toBeTruthy();

    router.back();
    await flushPromises();
    expect(router.currentRoute.value.query.itemId).toBeUndefined();
    expect(wrapper.text()).toContain("Выберите внешнюю задачу");
  });

  it("shows an exact unknown-outcome recovery action for linked work", async () => {
    authenticate();
    const { wrapper } = await mountPage();
    await flushPromises();

    await wrapper.get('[data-testid="mode-linked"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="external-item"]').trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Результат неизвестен");
    expect(wrapper.text()).toContain("Проверить результат");
    expect(wrapper.text()).toContain("60000000-0000-4000-8000-000000000001");
  });

  it("authoritatively reads a route-owned deep-link selection", async () => {
    authenticate();
    const { router, wrapper } = await mountPage(
      "/support/external-work?mode=linked&itemId=40000000-0000-4000-8000-000000000002&hostile=drop-me",
    );
    await flushPromises();

    expect(wrapper.text()).toContain(
      "После превышения времени ожидания результат внешней системы неизвестен",
    );
    expect(router.currentRoute.value.query).toEqual({
      mode: "linked",
      itemId: "40000000-0000-4000-8000-000000000002",
    });
  });
});

async function mountPage(path = "/support/external-work") {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: "/support/external-work",
        name: "support-external-work",
        component: SupportExternalWorkPage,
      },
    ],
  });
  await router.push(path);
  await router.isReady();
  const wrapper = mount(SupportExternalWorkPage, {
    global: { stubs, plugins: [router] },
  });
  await flushPromises();
  return { router, wrapper };
}

const stubs = {
  Button: {
    props: ["label"],
    emits: ["click"],
    template:
      '<button type="button" @click="$emit(\'click\')">{{ label }}<slot /></button>',
  },
  InputText: { template: "<input />" },
  Message: { template: "<div><slot /></div>" },
  Select: {
    props: ["modelValue"],
    template: "<div><slot />{{ modelValue }}</div>",
  },
  Skeleton: { template: "<span />" },
  Tag: { props: ["value"], template: "<span>{{ value }}</span>" },
};
