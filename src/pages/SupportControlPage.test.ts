import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import PrimeVue from "primevue/config";
import { createMemoryHistory, createRouter } from "vue-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth/auth.store";
import type {
  SupportLeadCaseRiskPage,
  SupportLeadSummary,
  SupportLeadCapacityRiskPage,
  SupportLeadReadiness,
  SupportOperationalAlertDetail,
  SupportOperationalAlertPage,
} from "@/features/support-control/api/support-lead-source";
import SupportControlPage from "./SupportControlPage.vue";

const api = vi.hoisted(() => ({
  readReadiness: vi.fn(),
  readSummary: vi.fn(),
  readCaseRisks: vi.fn(),
  readCapacityRisks: vi.fn(),
  readInvestigation: vi.fn(),
  readActivity: vi.fn(),
  readCases: vi.fn(),
  readAlerts: vi.fn(),
  readAlertDetail: vi.fn(),
  readAvailability: vi.fn(),
  setOwnAvailability: vi.fn(),
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

vi.mock("@/features/support-availability/api/support-availability-source", () => ({
  supportAvailabilitySource: {
    read: api.readAvailability,
    setOwn: api.setOwnAvailability,
  },
}));

vi.mock("@/features/support-workspace/api/support-workspace-source", () => ({
  supportWorkspaceSource: {
    readCases: api.readCases,
  },
}));

const summary: SupportLeadSummary = {
  computedAt: "2026-08-06T10:00:00.000Z",
  freshnessState: "READY",
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
      version: 1,
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
  allowAvailability?: boolean;
  allowAssignment?: boolean;
  allowActivity?: boolean;
  readiness?: SupportLeadReadiness;
  capacityPage?: SupportLeadCapacityRiskPage;
}

async function render(value: SupportLeadSummary, options: RenderOptions = {}) {
  const {
    allowAlerts = false,
    allowLeadControl = true,
    allowAvailability = false,
    allowAssignment = false,
    allowActivity = false,
    readiness: readinessOverride,
    capacityPage,
    riskPage,
    alertsPage,
  } = options;
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
        ...(allowAvailability
          ? [
              "project.support.availability.read",
              "project.support.availability.self_manage",
            ]
          : []),
        ...(allowAssignment
          ? [
              "project.cases.read",
              "project.support.assignments.override",
              "project.support.assignments.force_assign",
            ]
          : []),
        ...(allowActivity ? ["project.support.activity.read"] : []),
      ],
    },
    projects: [],
  });
  api.readSummary.mockResolvedValue(value);
  api.readReadiness.mockResolvedValue(readinessOverride ?? {
    readinessState: "READY",
    evaluatedAt: "2026-08-06T10:00:00.000Z",
    computedAt: "2026-08-06T10:00:00.000Z",
    projectionGeneration: 1,
    checkpoint: "10",
    sourceHighWater: "10",
    capabilities: {
      summary: "AVAILABLE",
      caseRisks: "AVAILABLE",
      capacityRisks: "AVAILABLE",
      investigation: "AVAILABLE",
      activity: "AVAILABLE",
      realtime: "AVAILABLE",
    },
  });
  api.readCapacityRisks.mockResolvedValue(capacityPage ?? {
    computedAt: "2026-08-06T10:00:00.000Z",
    freshnessState: "READY",
    state: "AVAILABLE",
    items: [],
    nextCursor: null,
  });
  api.readInvestigation.mockResolvedValue({
    caseId: "case-1",
    computedAt: "2026-08-06T10:00:00.000Z",
    freshnessState: "READY",
    routingFactsState: "AVAILABLE",
    routing: null,
    facts: [],
    nextCursor: null,
  });
  api.readActivity.mockResolvedValue({
    computedAt: "2026-08-06T10:00:00.000Z",
    freshnessState: "READY",
    facts: [],
    nextCursor: null,
  });
  api.readCaseRisks.mockImplementation((_, riskType) =>
    Promise.resolve({
      computedAt: riskPage?.computedAt ?? "2026-08-06T10:00:00.000Z",
      freshnessState: riskPage?.freshnessState ?? "READY",
      riskType,
      items: riskPage?.items ?? [],
      nextCursor: riskPage?.nextCursor ?? null,
    }),
  );
  api.readCases.mockResolvedValue({
    items: [
      {
        id: "case-1",
        endUserId: "user-1",
        projectSequence: "104",
        title: "Не поступил депозит",
        status: "WAITING_ADMIN",
        priority: "HIGH",
        groupCode: "PAYMENTS",
        attentionRequired: true,
        slaSignal: null,
        lastActivityAt: "2026-08-06T09:55:00.000Z",
        updatedAt: "2026-08-06T09:55:00.000Z",
        version: 3,
      },
    ],
    nextCursor: null,
  });
  api.readAlerts.mockResolvedValue(alertsPage ?? alertPage);
  api.readAlertDetail.mockResolvedValue(alertDetail);
  const availability = {
    operatorId: "operator-1",
    projectId: "project-1",
    declaredState: "AVAILABLE" as const,
    effectiveState: "AVAILABLE" as const,
    acceptsNewWork: true,
    effectiveUntil: null,
    leaseRenewedAt: "2026-08-06T10:00:00.000Z",
    leaseUntil: "2026-08-06T10:02:00.000Z",
    reasonCode: "SHIFT_START" as const,
    source: "SELF" as const,
    transitionedAt: "2026-08-06T10:00:00.000Z",
    version: 7,
  };
  api.readAvailability.mockResolvedValue(availability);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/support/control", component: SupportControlPage },
      { path: "/overview", name: "overview", component: { template: "<div />" } },
      {
        path: "/cases/:caseId",
        name: "end-user-case-detail",
        component: { template: "<div />" },
      },
      {
        path: "/support/inbox",
        name: "support-inbox",
        component: { template: "<div />" },
      },
      {
        path: "/support/inbox/cases/:caseId",
        name: "support-inbox-case",
        component: { template: "<div />" },
      },
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

  it("leads with decisions, team capacity, and the risk work queue", async () => {
    const { wrapper } = await render(summary, { allowAlerts: true });

    const attention = wrapper.get('[aria-labelledby="attention-heading"]');
    expect(attention.text()).toContain("Без назначения");
    expect(attention.text()).toContain("3");

    const workforce = wrapper.get('[aria-labelledby="workforce-heading"]');
    expect(workforce.text()).toContain("1 из 2");
    expect(workforce.text()).toContain("Доступны");

    expect(wrapper.get("#risk-heading").text()).toBe("Обращения в риске");
    expect(wrapper.get("#alerts-heading").text()).toBe(
      "Операционные сигналы",
    );
  });

  it("renders authoritative SLA counts without release qualifiers", async () => {
    const { wrapper } = await render(summary);

    expect(wrapper.text()).not.toContain("SLA рассчитывается в фоновом режиме");
    expect(wrapper.text()).toContain("SLA · Под риском");
  });

  it("uses projection readiness instead of showing unavailable aggregates as zero", async () => {
    const { wrapper } = await render(summary, {
      readiness: {
        readinessState: "NOT_PROVISIONED",
        evaluatedAt: "2026-08-06T10:00:00.000Z",
        computedAt: null,
        projectionGeneration: null,
        checkpoint: null,
        sourceHighWater: null,
        capabilities: {
          summary: "UNAVAILABLE",
          caseRisks: "UNAVAILABLE",
          capacityRisks: "UNAVAILABLE",
          investigation: "UNAVAILABLE",
          activity: "UNAVAILABLE",
          realtime: "UNAVAILABLE",
        },
      },
    });

    expect(wrapper.text()).toContain("Операционный снимок ещё не подготовлен");
    expect(api.readSummary).not.toHaveBeenCalled();
    expect(api.readCaseRisks).not.toHaveBeenCalled();
    expect(wrapper.text()).not.toContain("Без назначения");
  });

  it("shows server capacity causes and opens the canonical filtered inbox", async () => {
    const { wrapper } = await render(summary, {
      capacityPage: {
        computedAt: "2026-08-06T10:00:00.000Z",
        freshnessState: "READY",
        state: "AVAILABLE",
        nextCursor: null,
        items: [{
          riskId: "risk-capacity-1",
          riskVersion: 1,
          lastDecisionId: "decision-1",
          observedAt: "2026-08-06T10:00:00.000Z",
          requiredCapacityUnits: 3,
          teamId: "team-1",
          queue: { id: "queue-1", code: "PAYMENTS", name: "Платежи" },
          exclusionCounts: { CAPACITY_EXHAUSTED: 2 },
        }],
      },
    });

    expect(wrapper.text()).toContain("Ёмкость по очередям");
    expect(wrapper.text()).toContain("Исчерпана ёмкость · 2");
    const href = wrapper.get(".capacity-row .row-link").attributes("href");
    expect(href).toContain("/support/inbox");
    expect(href).toContain("queue=queue-1");
  });

  it("exposes the shared Lead assignment action from a Control risk drill-down", async () => {
    const { wrapper } = await render(summary, {
      allowAssignment: true,
      riskPage: {
        computedAt: "2026-08-06T10:00:00.000Z",
        freshnessState: "READY",
        nextCursor: null,
        items: [
          {
            caseId: "case-1",
            caseVersion: 3,
            assignmentVersion: null,
            deliveryVersion: null,
            detectedAt: "2026-08-06T09:55:00.000Z",
            dueAt: null,
            riskSortAt: "2026-08-06T09:55:00.000Z",
            riskType: "UNASSIGNED_AGED",
            slaClockVersion: null,
          },
        ],
      },
    });

    expect(
      wrapper.get("button[aria-label='Управлять назначением лида']").text(),
    ).toContain("Назначить");
    expect(wrapper.find(".risk-row__select .sr-only").exists()).toBe(false);
  });

  it("shows a human-readable identity for every risk case", async () => {
    const { wrapper } = await render(summary, {
      allowAssignment: true,
      riskPage: {
        computedAt: "2026-08-06T10:00:00.000Z",
        freshnessState: "READY",
        nextCursor: null,
        items: [
          {
            caseId: "case-1",
            caseVersion: 3,
            assignmentVersion: null,
            deliveryVersion: null,
            detectedAt: "2026-08-06T09:55:00.000Z",
            dueAt: null,
            riskSortAt: "2026-08-06T09:55:00.000Z",
            riskType: "UNASSIGNED_AGED",
            slaClockVersion: null,
          },
        ],
      },
    });

    const row = wrapper.get(".risk-row");
    expect(row.get("h3").text()).toBe("Не поступил депозит");
    expect(row.get(".case-reference").text()).toContain(
      `Обращение ${String.fromCodePoint(35)}104 · PAYMENTS`,
    );
    expect(row.text()).toContain("Высокий приоритет");
  });

  it("does not hide SLA behind a module state", async () => {
    const { wrapper } = await render({
      ...summary,
    });

    expect(wrapper.text()).toContain("SLA · Под риском");
    expect(wrapper.text()).not.toContain("SLA не включён");
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

    expect(wrapper.text()).toContain("Операционные сигналы");
    expect(wrapper.text()).toContain("Давно без назначения");
    expect(wrapper.text()).toContain(
      "Управление сигналами доступно по отдельному разрешению",
    );
  });

  it("does not request alerts for an account without support-control access", async () => {
    const { wrapper } = await render(summary, {
      allowAlerts: true,
      allowLeadControl: false,
    });

    expect(api.readAlerts).not.toHaveBeenCalled();
    expect(wrapper.text()).not.toContain("Операционные сигналы");
  });

  it("loads durable availability without renewing a browser presence lease", async () => {
    const { wrapper } = await render(summary, { allowAvailability: true });

    expect(api.readAvailability).toHaveBeenCalledWith(
      "project-1",
      "operator-1",
      expect.any(AbortSignal),
    );
    wrapper.unmount();
    expect(api.setOwnAvailability).not.toHaveBeenCalled();
  });

  it("does not treat an incomplete risk projection as an empty queue", async () => {
    const { wrapper } = await render(summary, {
      riskPage: {
        computedAt: "2026-08-06T10:00:00.000Z",
        freshnessState: "DEGRADED",
        items: [],
        nextCursor: null,
      },
    });

    expect(wrapper.text()).toContain("отсутствие обращений не подтверждено");
    expect(wrapper.text()).not.toContain("Сервер не нашёл обращений с этим риском");
  });

  it("does not treat a degraded alert materialization as no active alerts", async () => {
    const { wrapper } = await render(summary, {
      allowAlerts: true,
      alertsPage: { ...alertPage, materializationState: "DEGRADED", items: [] },
    });

    expect(wrapper.text()).toContain("сервер не подтвердил, что активных сигналов нет");
    expect(wrapper.text()).not.toContain("Активных сигналов нет");
  });
});
