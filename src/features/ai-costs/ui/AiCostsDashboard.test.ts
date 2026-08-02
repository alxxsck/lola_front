import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AiCostsDashboard from "./AiCostsDashboard.vue";

const mocks = vi.hoisted(() => ({
  overview: vi.fn(),
  users: vi.fn(),
  cmsUsers: vi.fn(),
  replace: vi.fn(),
  route: { query: {} as Record<string, string> },
  auth: {
    project: {
      id: "project-1",
      effectivePermissionCodes: [
        "project.ai_usage.read",
        "project.ai_costs.read",
        "project.profiles.read",
      ],
    },
    user: { platformPermissionCodes: ["platform.cms_users.read"] },
  },
}));

vi.mock("vue-router", () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock("@/features/auth/auth.store", () => ({
  useAuthStore: () => mocks.auth,
}));
vi.mock("../api/ai-costs-repository", () => ({
  aiCostsRepository: {
    overview: mocks.overview,
    users: mocks.users,
    cmsUsers: mocks.cmsUsers,
  },
}));

const costs = {
  providerReportedCostUsd: "0.100000000001",
  estimatedFallbackCostUsd: "0.020000000002",
  effectiveCostUsd: "0.120000000003",
  pricedCostRecords: 3,
};
const projection = {
  status: "FRESH",
  timezone: "Europe/Madrid",
  asOf: "2026-08-03T00:00:00.000Z",
  lastReconciledAt: "2026-08-03T00:00:00.000Z",
  sourceRecords: "4",
  projectedRecords: "4",
  rebuildGeneration: "1",
  driftDetected: false,
};
const range = {
  from: "2026-07-27T00:00:00.000Z",
  to: "2026-08-03T00:00:00.000Z",
};

describe("AiCostsDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.route.query = { period: "7d", tab: "overview" };
    mocks.overview.mockResolvedValue({
      range,
      timezone: "Europe/Madrid",
      projection,
      totals: costs,
      completeness: {
        totalRecords: 4,
        providerReportedRecords: 2,
        estimatedRecords: 1,
        unpricedRecords: 1,
        pricedPercent: "75.00",
      },
      categories: [{ category: "CHAT", records: 4, ...costs }],
      daily: [{ day: "2026-08-01", records: 4, ...costs }],
    });
    mocks.users.mockResolvedValue({
      range,
      projection,
      items: [],
      pagination: {
        limit: 25,
        offset: 0,
        hasMore: false,
        nextOffset: null,
        truncated: false,
      },
    });
    mocks.cmsUsers.mockResolvedValue({
      range,
      projection,
      items: [],
      pagination: {
        limit: 25,
        offset: 0,
        hasMore: false,
        nextOffset: null,
        truncated: false,
      },
    });
  });

  it("renders exact cost KPIs, completeness and Project-timezone charts", async () => {
    const wrapper = mount(AiCostsDashboard);
    await flushPromises();

    expect(mocks.overview).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        from: expect.any(String),
        to: expect.any(String),
      }),
    );
    expect(wrapper.get(".timezone-badge").text()).toContain("Europe/Madrid");
    expect(wrapper.get(".kpi-effective").text()).toContain("0,12 $");
    expect(wrapper.get('[role="alert"]').text()).toContain("1");
    expect(wrapper.get(".daily-chart").text()).toContain("01.08");
    expect(wrapper.get(".category-chart").text()).toContain("Чат с Lola");
  });

  it("loads a URL-selected users page and provides the existing profile drilldown", async () => {
    mocks.route.query = {
      period: "7d",
      tab: "users",
      page: "2",
      sort: "identity",
      direction: "asc",
    };
    mocks.users.mockResolvedValue({
      range,
      projection,
      items: [
        {
          endUserId: "user-1",
          externalId: "z-server-first",
          segment: "vip",
          records: 3,
          unpricedRecords: 0,
          ...costs,
        },
        {
          endUserId: "user-2",
          externalId: "a-server-second",
          segment: null,
          records: 2,
          unpricedRecords: 0,
          ...costs,
        },
      ],
      pagination: {
        limit: 25,
        offset: 25,
        hasMore: false,
        nextOffset: null,
        truncated: false,
      },
    });

    const wrapper = mount(AiCostsDashboard);
    await flushPromises();

    expect(mocks.users).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        limit: 25,
        offset: 25,
        sort: "identity",
        direction: "asc",
      }),
    );
    expect(wrapper.get('a[href="/users/user-1"]').text()).toContain(
      "z-server-first",
    );
    expect(wrapper.get("tbody tr").text()).toContain("z-server-first");
    expect(wrapper.get(".pagination-status").text()).toContain("2");
  });

  it("loads employees independently and links to the existing CMS User workspace", async () => {
    mocks.route.query = { period: "30d", tab: "employees" };
    mocks.cmsUsers.mockResolvedValue({
      range,
      projection,
      items: [
        {
          cmsUserId: "cms-1",
          email: "operator@example.test",
          records: 2,
          unpricedRecords: 0,
          ...costs,
        },
      ],
      pagination: {
        limit: 25,
        offset: 0,
        hasMore: false,
        nextOffset: null,
        truncated: false,
      },
    });

    const wrapper = mount(AiCostsDashboard);
    await flushPromises();

    expect(mocks.cmsUsers).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({ limit: 25, offset: 0 }),
    );
    expect(wrapper.get('a[href="/platform/cms-users/cms-1"]').text()).toContain(
      "operator@example.test",
    );
  });

  it("writes tab changes back to the URL query", async () => {
    const wrapper = mount(AiCostsDashboard);
    await flushPromises();

    await wrapper
      .findAll('[role="tab"]')
      .find((tab) => tab.text() === "Пользователи")!
      .trigger("click");

    expect(mocks.replace).toHaveBeenCalledWith({
      query: expect.objectContaining({ tab: "users", period: "7d" }),
    });
  });

  it("keeps future Limits and Journal tabs explicit instead of inventing data", async () => {
    mocks.route.query = { period: "7d", tab: "limits" };
    const wrapper = mount(AiCostsDashboard);
    await flushPromises();

    expect(wrapper.text()).toContain("project.ai_allowance.read");
    expect(mocks.users).not.toHaveBeenCalled();
    expect(mocks.cmsUsers).not.toHaveBeenCalled();
  });
});
