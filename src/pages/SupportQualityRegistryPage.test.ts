import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import PrimeVue from "primevue/config";
import { createMemoryHistory, createRouter } from "vue-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth/auth.store";
import SupportQualityRegistryPage from "./SupportQualityRegistryPage.vue";

const api = vi.hoisted(() => ({
  listCalibrations: vi.fn(),
}));

vi.mock("@/features/support-quality/api/support-quality-source", () => ({
  supportQualitySource: api,
}));

async function renderCalibrations() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const auth = useAuthStore();
  auth.$patch({
    restored: true,
    phase: "AUTHENTICATED",
    user: { id: "reviewer-1", email: "reviewer@example.com", name: "Ревьюер" },
    project: {
      id: "project-1",
      name: "Project One",
      slug: "project-one",
      status: "ACTIVE",
      effectivePermissionCodes: ["project.support.quality.read"],
    },
    projects: [],
  });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: "/support/quality",
        name: "support-quality",
        component: { template: "<div />" },
      },
      {
        path: "/support/quality/calibrations",
        name: "support-quality-calibrations",
        component: SupportQualityRegistryPage,
      },
      {
        path: "/support/quality/scorecards",
        name: "support-quality-scorecards",
        component: { template: "<div />" },
      },
      {
        path: "/support/quality/disputes",
        name: "support-quality-disputes",
        component: { template: "<div />" },
      },
    ],
  });
  await router.push("/support/quality/calibrations");
  await router.isReady();
  const wrapper = mount(SupportQualityRegistryPage, {
    global: { plugins: [pinia, router, PrimeVue] },
  });
  await flushPromises();
  return wrapper;
}

describe("SupportQualityRegistryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listCalibrations.mockResolvedValue({ items: [], nextCursor: null });
  });

  it("explains an empty calibration registry and offers a safe next step", async () => {
    const wrapper = await renderCalibrations();

    expect(wrapper.get("#calibrations-empty-title").text()).toBe(
      "Калибровок пока нет",
    );
    expect(wrapper.text()).toContain("Контроль качества работает");
    expect(wrapper.get(".calibration-empty__link").text()).toBe(
      "Открыть очередь проверок",
    );
  });
});
