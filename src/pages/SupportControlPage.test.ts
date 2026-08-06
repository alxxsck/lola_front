import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import PrimeVue from "primevue/config";
import { createMemoryHistory, createRouter } from "vue-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth/auth.store";
import type {
  SupportLeadCaseRiskPage,
  SupportLeadSummary,
  SupportOperationalAlertDetail,
  SupportOperationalAlertPage,
} from "@/features/support-control/api/support-lead-source";
import SupportControlPage from "./SupportControlPage.vue";

const api = vi.hoisted(() => ({
  readSummary: vi.fn(),
  readCaseRisks: vi.fn(),
  readAlerts: vi.fn(),
  readAlertDetail: vi.fn(),
}));

vi.mock("@/features/support-control/api/support-lead-source", () => ({
  SUPPORT_LEAD_RISK_TYPES: [
    "UNASSIGNED_AGED",
    "SLA_AT_RISK",
    "SLA_BREACHED",
    "DELIVERY_OUTCOME_UNKNOWN",
  ],
  supportLeadSource: api,
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

const alertPage: SupportOperationalAlertPage = {
  computedAt: "2026-08-06T10:00:00.000Z",
  materializationState: "READY",
  items: [
    {
      id: "alert-1",
      severity: "HIGH",
      state: "NEW",
      sourceKind: "UNASSIGNED_AGED",
      firstObservedAt: "2026-08-06T09:55:00.000Z",
      lastObservedAt: "2026-08-06T10:00:00.000Z",
      occurrenceCount: 2,
      hasOwner: false,
    },
  ],
  nextCursor: null,
};

const alertDetail: SupportOperationalAlertDetail = {
  alert: alertPage.items[0]!,
  computedAt: "2026-08-06T10:00:00.000Z",
  materializationState: "READY",
  effectiveWindow: {
    from: "2026-08-06T09:00:00.000Z",
    to: "2026-08-06T10:00:00.000Z",
  },
  generation: 1,
  policyRevisionId: "policy-r1",
  nextCursor: null,
  timeline: [],
};

interface RenderOptions {
  allowAlerts?: boolean;
  allowLeadControl?: boolean;
  riskPage?: Omit<SupportLeadCaseRiskPage, "riskType">;
  alertsPage?: SupportOperationalAlertPage;
}

async function render(value: SupportLeadSummary, options: RenderOptions = {}) {
  const { allowAlerts = false, allowLeadControl = true, riskPage, alertsPage } = options;
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
      effectivePermissionCodes: [
        ...(allowLeadControl ? ["project.support.lead_control.read"] : []),
        ...(allowAlerts ? ["project.support.alerts.read"] : []),
      ],
    },
    projects: [],
  });
  api.readSummary.mockResolvedValue(value);
  api.readCaseRisks.mockImplementation((_, riskType) =>
    Promise.resolve({
      computedAt: riskPage?.computedAt ?? "2026-08-06T10:00:00.000Z",
      freshnessState: riskPage?.freshnessState ?? "READY",
      slaRolloutState: riskPage?.slaRolloutState ?? "SHADOW",
      riskType,
      items: riskPage?.items ?? [],
      nextCursor: riskPage?.nextCursor ?? null,
    }),
  );
  api.readAlerts.mockResolvedValue(alertsPage ?? alertPage);
  api.readAlertDetail.mockResolvedValue(alertDetail);
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

  it("mounts active alerts only for the exact alert-read permission", async () => {
    const { wrapper } = await render(summary, { allowAlerts: true });

    expect(wrapper.text()).toContain("Активные alerts");
    expect(wrapper.text()).toContain("Давно без назначения");
    expect(wrapper.text()).toContain("versioned intent");
  });

  it("does not request alerts for an account without support-control access", async () => {
    const { wrapper } = await render(summary, {
      allowAlerts: true,
      allowLeadControl: false,
    });

    expect(api.readAlerts).not.toHaveBeenCalled();
    expect(wrapper.text()).not.toContain("Активные alerts");
  });

  it("does not treat an incomplete risk projection as an empty queue", async () => {
    const { wrapper } = await render(summary, {
      riskPage: {
        computedAt: "2026-08-06T10:00:00.000Z",
        freshnessState: "DEGRADED",
        slaRolloutState: "SHADOW",
        items: [],
        nextCursor: null,
      },
    });

    expect(wrapper.text()).toContain("отсутствие Cases не подтверждено");
    expect(wrapper.text()).not.toContain("Сервер не нашёл Cases с этим риском");
  });

  it("does not treat a degraded alert materialization as no active alerts", async () => {
    const { wrapper } = await render(summary, {
      allowAlerts: true,
      alertsPage: { ...alertPage, materializationState: "DEGRADED", items: [] },
    });

    expect(wrapper.text()).toContain("отсутствие active alerts не подтверждено");
    expect(wrapper.text()).not.toContain("Активных alerts нет");
  });
});
