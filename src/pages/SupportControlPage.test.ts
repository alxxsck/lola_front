import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import PrimeVue from "primevue/config";
import { createMemoryHistory, createRouter } from "vue-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth/auth.store";
import type { SupportLeadSummary } from "@/features/support-control/api/support-lead-source";
import SupportControlPage from "./SupportControlPage.vue";

const api = vi.hoisted(() => ({ readSummary: vi.fn() }));

vi.mock("@/features/support-control/api/support-lead-source", () => ({
  supportLeadSource: { readSummary: api.readSummary },
}));

const summary: SupportLeadSummary = {
  computedAt: "2026-08-06T10:00:00.000Z",
  freshnessState: "READY",
  slaRolloutState: "SHADOW",
  actionableBacklog: { unassignedCount: 3, oldestUnassignedAgeMs: null },
  sla: { atRiskCount: 2, breachedCount: 1, oldestDueAgeMs: null },
  workforce: {
    availability: { AVAILABLE: 1, BUSY: 0, AWAY: 0, DRAINING: 0, OFFLINE: 0 },
    capacityGapUnits: 0,
    currentWorkloadUnits: 1,
    maximumCapacityUnits: 2,
  },
  delivery: { pendingCount: 0, outcomeUnknownCount: 0, state: "AVAILABLE" },
  projectionHealth: { deadLetterCount: 0, retryCount: 0, state: "AVAILABLE" },
};

async function render(value: SupportLeadSummary) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const auth = useAuthStore();
  auth.$patch({
    restored: true,
    phase: "AUTHENTICATED",
    user: { id: "operator-1", email: "operator@example.com", name: "Оператор" },
    project: {
      id: "project-1",
      name: "Project One",
      slug: "project-one",
      status: "ACTIVE",
      effectivePermissionCodes: ["project.support.lead_control.read"],
    },
    projects: [],
  });
  api.readSummary.mockResolvedValue(value);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/support/control", component: SupportControlPage },
      { path: "/overview", name: "overview", component: { template: "<div />" } },
    ],
  });
  await router.push("/support/control");
  await router.isReady();
  const wrapper = mount(SupportControlPage, {
    global: { plugins: [pinia, router, PrimeVue] },
  });
  await flushPromises();
  return { auth, router, wrapper };
}

describe("SupportControlPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("marks the authoritative SLA counts as shadow-mode data", async () => {
    const { wrapper } = await render(summary);

    expect(wrapper.text()).toContain("SLA в shadow-режиме");
    expect(wrapper.text()).toContain("Под риском");
  });

  it("does not present disabled SLA as zero risk", async () => {
    const { wrapper } = await render({
      ...summary,
      slaRolloutState: "DISABLED",
    });

    expect(wrapper.text()).toContain("SLA не включён");
    expect(wrapper.text()).toContain("Риски и нарушения пока не рассчитываются");
    expect(wrapper.text()).not.toContain("Под риском");
  });

  it("purges cached operational data and leaves the route after permission revoke", async () => {
    const { auth, router, wrapper } = await render(summary);

    auth.project!.effectivePermissionCodes = [];
    await flushPromises();

    expect(router.currentRoute.value.name).toBe("overview");
    expect(wrapper.text()).not.toContain("Без назначения");
  });
});
