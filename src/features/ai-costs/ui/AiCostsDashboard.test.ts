import {
  flushPromises,
  mount,
  type ComponentMountingOptions,
} from "@vue/test-utils";
import PrimeVue from "primevue/config";
import DatePicker from "primevue/datepicker";
import { nextTick, reactive } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { primeVueRussianLocale } from "@/app/primevue-ru";
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

function userPage(externalId: string) {
  return {
    range,
    projection,
    items: [
      {
        endUserId: `id-${externalId}`,
        externalId,
        segment: null,
        records: 1,
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
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function mountDashboard(
  options: ComponentMountingOptions<typeof AiCostsDashboard> = {},
) {
  const plugins = options.global?.plugins ?? [];
  return mount(AiCostsDashboard, {
    ...options,
    global: {
      ...options.global,
      plugins: [[PrimeVue, { locale: primeVueRussianLocale }], ...plugins],
    },
  });
}

describe("AiCostsDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    );
    mocks.route.query = reactive({ period: "7d", tab: "overview" });
    mocks.auth.project = reactive({
      id: "project-1",
      effectivePermissionCodes: [
        "project.ai_usage.read",
        "project.ai_costs.read",
        "project.profiles.read",
      ],
    });
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
    const wrapper = mountDashboard();
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

  it("exposes chart bars as decorative when the adjacent text carries the value", async () => {
    const wrapper = mountDashboard();
    await flushPromises();

    const chartBars = wrapper.findAll(".bar-track");
    expect(chartBars).toHaveLength(2);
    for (const bar of chartBars) {
      expect(bar.attributes("aria-hidden")).toBe("true");
      expect(bar.attributes("role")).toBeUndefined();
      expect(bar.attributes("aria-valuenow")).toBeUndefined();
    }
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

    const wrapper = mountDashboard();
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

    const wrapper = mountDashboard();
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
    const wrapper = mountDashboard();
    await flushPromises();

    await wrapper
      .findAll('[role="tab"]')
      .find((tab) => tab.text() === "Пользователи")!
      .trigger("click");

    expect(mocks.replace).toHaveBeenCalledWith({
      query: expect.objectContaining({ tab: "users", period: "7d" }),
    });
  });

  it("keeps the global tabs above the period filter", async () => {
    const wrapper = mountDashboard();
    await flushPromises();

    const tabs = wrapper.get(".cost-tabs").element;
    const periodFilter = wrapper.get(".period-panel").element;
    expect(
      tabs.compareDocumentPosition(periodFilter) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("uses localized date controls without browser-dependent native placeholders", async () => {
    const wrapper = mountDashboard();
    await flushPromises();

    const periodFilter = wrapper.get(".period-panel");
    expect(periodFilter.findAll('input[type="date"]')).toHaveLength(0);
    expect(
      periodFilter.findAll('input[placeholder="Выбрать даты"]'),
    ).toHaveLength(1);
    expect(periodFilter.get(".custom-period").attributes("aria-label")).toBe(
      "Произвольный период",
    );
    expect(periodFilter.find(".period-note").exists()).toBe(false);
  });

  it("writes a selected calendar range to the URL as local calendar dates", async () => {
    const wrapper = mountDashboard();
    await flushPromises();

    await wrapper
      .getComponent(DatePicker)
      .setValue([new Date(2026, 6, 3), new Date(2026, 6, 9)]);
    await wrapper.get(".custom-period button").trigger("click");

    expect(mocks.replace).toHaveBeenCalledWith({
      query: expect.objectContaining({
        period: "custom",
        from: "2026-07-03",
        to: "2026-07-09",
      }),
    });
  });

  it("keeps future Limits and Journal tabs explicit instead of inventing data", async () => {
    mocks.route.query = { period: "7d", tab: "limits" };
    const wrapper = mountDashboard();
    await flushPromises();

    expect(wrapper.text()).toContain("project.ai_allowance.read");
    expect(mocks.users).not.toHaveBeenCalled();
    expect(mocks.cmsUsers).not.toHaveBeenCalled();
  });

  it("does not restore a previous query page after the replacement query fails", async () => {
    mocks.route.query = reactive({ period: "7d", tab: "users" });
    mocks.users.mockResolvedValueOnce(userPage("previous-query-user"));
    const wrapper = mountDashboard();
    await flushPromises();
    expect(wrapper.text()).toContain("previous-query-user");

    mocks.users.mockRejectedValueOnce(new Error("replacement query failed"));
    mocks.route.query.page = "2";
    mocks.route.query.sort = "identity";
    mocks.route.query.direction = "asc";
    await nextTick();
    await flushPromises();

    expect(wrapper.text()).toContain("replacement query failed");
    expect(wrapper.text()).not.toContain("previous-query-user");
  });

  it("never exposes rows from another Project after a failed reload or permission revocation", async () => {
    mocks.route.query = reactive({ period: "7d", tab: "users" });
    mocks.users.mockResolvedValueOnce(userPage("tenant-one-user"));
    const wrapper = mountDashboard();
    await flushPromises();
    expect(wrapper.text()).toContain("tenant-one-user");

    mocks.users.mockRejectedValueOnce(new Error("tenant reload failed"));
    mocks.auth.project.id = "project-2";
    await nextTick();
    await flushPromises();
    expect(wrapper.text()).not.toContain("tenant-one-user");

    mocks.users.mockResolvedValueOnce(userPage("tenant-two-user"));
    mocks.route.query.page = "2";
    await nextTick();
    await flushPromises();
    expect(wrapper.text()).toContain("tenant-two-user");

    mocks.auth.project.effectivePermissionCodes = [];
    await nextTick();
    expect(wrapper.text()).not.toContain("tenant-two-user");
  });

  it("closes an open allowance balance when its read permission is revoked", async () => {
    mocks.route.query = reactive({ period: "7d", tab: "users" });
    mocks.auth.project.effectivePermissionCodes = [
      "project.ai_usage.read",
      "project.ai_costs.read",
      "project.profiles.read",
      "project.ai_allowance.read",
    ];
    mocks.users.mockResolvedValueOnce(userPage("allowance-user"));
    const wrapper = mountDashboard({
      global: {
        stubs: {
          AiAllowanceUserDialog: {
            props: ["endUserId"],
            template:
              '<div data-testid="allowance-user-dialog">{{ endUserId }}</div>',
          },
        },
      },
    });
    await flushPromises();

    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Баланс"))!
      .trigger("click");
    expect(wrapper.get('[data-testid="allowance-user-dialog"]').text()).toBe(
      "id-allowance-user",
    );

    mocks.auth.project.effectivePermissionCodes = [
      "project.ai_usage.read",
      "project.ai_costs.read",
      "project.profiles.read",
    ];
    await nextTick();

    expect(wrapper.find('[data-testid="allowance-user-dialog"]').exists()).toBe(
      false,
    );
  });

  it("ignores a late table response from a previous full context", async () => {
    mocks.route.query = reactive({ period: "7d", tab: "users" });
    const previous = deferred<ReturnType<typeof userPage>>();
    mocks.users
      .mockReturnValueOnce(previous.promise)
      .mockResolvedValueOnce(userPage("current-tenant-user"));
    const wrapper = mountDashboard();

    mocks.auth.project.id = "project-2";
    await nextTick();
    await flushPromises();
    previous.resolve(userPage("stale-tenant-user"));
    await flushPromises();

    expect(wrapper.text()).toContain("current-tenant-user");
    expect(wrapper.text()).not.toContain("stale-tenant-user");
  });
});
