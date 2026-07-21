import { flushPromises, shallowMount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RunExplainInspector } from "@/features/scenario-run-explain/ui";
import OperationsPage from "./OperationsPage.vue";

const mocks = vi.hoisted(() => ({
  auth: null as unknown as { project?: { id: string } },
  getEventLogs: vi.fn(),
  getScenarioRunsPage: vi.fn(),
  getAuditLogs: vi.fn(),
  routeQuery: {} as Record<string, string>,
}));

vi.mock("vue-router", () => ({
  useRoute: () => ({ query: mocks.routeQuery }),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

vi.mock("@/features/auth/auth.store", async () => {
  const { reactive } = await import("vue");
  mocks.auth = reactive({ project: { id: "project-1" } });
  return {
    useAuthStore: () => ({
      get project() {
        return mocks.auth.project;
      },
    }),
  };
});

vi.mock("@/shared/api/repository", () => ({
  repository: {
    mode: "api",
    getEventLogs: mocks.getEventLogs,
    getScenarioRunsPage: mocks.getScenarioRunsPage,
    getAuditLogs: mocks.getAuditLogs,
  },
}));

describe("OperationsPage event pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.routeQuery = {};
    mocks.getEventLogs.mockResolvedValue({
      items: [],
      pagination: {
        page: 1,
        limit: 12,
        total: 37,
        totalPages: 4,
        hasNextPage: true,
        hasPreviousPage: false,
      },
    });
    mocks.getScenarioRunsPage.mockResolvedValue({
      items: [],
      nextCursor: null,
    });
    mocks.getAuditLogs.mockResolvedValue([]);
  });

  it("loads numbered event pages and exposes the server total to the paginator", async () => {
    const wrapper = shallowMount(OperationsPage, {
      global: {
        stubs: {
          Drawer: { template: '<aside><slot name="header" /><slot /></aside>' },
        },
      },
    });
    await flushPromises();

    expect(mocks.getEventLogs).toHaveBeenCalledWith("project-1", {
      page: 1,
      limit: 12,
    });
    const table = wrapper.findComponent("data-table-stub") as unknown as {
      attributes: (name?: string) => string | Record<string, string>;
      vm: { $emit: (event: string, value: unknown) => void };
    };
    expect(table.attributes()).toHaveProperty("lazy");
    expect(table.attributes("total-records")).toBe("37");
    expect(table.attributes("current-page-report-template")).toContain(
      "{totalRecords}",
    );

    table.vm.$emit("page", { page: 2, rows: 12 });
    await flushPromises();

    expect(mocks.getEventLogs).toHaveBeenLastCalledWith("project-1", {
      page: 3,
      limit: 12,
    });
  });

  it("opens a real server-filtered Runs surface for an active-wait deep link", async () => {
    mocks.routeQuery = {
      section: "runs",
      eventDefinitionKeyId: "definition-key-1",
    };
    const wrapper = shallowMount(OperationsPage);
    await flushPromises();

    expect(
      wrapper.findAll(".section-tabs button")[1]!.attributes("aria-selected"),
    ).toBe("true");
    expect(mocks.getScenarioRunsPage).toHaveBeenCalledWith("project-1", {
      limit: 50,
      eventDefinitionKeyId: "definition-key-1",
    });
    expect(wrapper.find('[data-test="active-wait-filter"]').exists()).toBe(
      true,
    );
  });

  it("reloads on Project switch and rejects a late response from the old tenant", async () => {
    const old = deferred<{
      items: never[];
      pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNextPage: boolean;
        hasPreviousPage: boolean;
      };
    }>();
    mocks.getEventLogs.mockImplementation((projectId: string) =>
      projectId === "project-1"
        ? old.promise
        : Promise.resolve({
            items: [],
            pagination: {
              page: 1,
              limit: 12,
              total: 2,
              totalPages: 1,
              hasNextPage: false,
              hasPreviousPage: false,
            },
          }),
    );
    const wrapper = shallowMount(OperationsPage);
    await flushPromises();

    mocks.auth.project = { id: "project-2" };
    await flushPromises();
    expect(mocks.getEventLogs).toHaveBeenCalledWith("project-2", {
      page: 1,
      limit: 12,
    });

    old.resolve({
      items: [],
      pagination: {
        page: 1,
        limit: 12,
        total: 99,
        totalPages: 9,
        hasNextPage: true,
        hasPreviousPage: false,
      },
    });
    await flushPromises();
    expect(
      wrapper.findComponent("data-table-stub").attributes("total-records"),
    ).toBe("2");
    wrapper.unmount();
    mocks.auth.project = { id: "project-1" };
  });

  it("resets to page one and sends filters to the backend", async () => {
    vi.useFakeTimers();
    const wrapper = shallowMount(OperationsPage, {
      global: {
        stubs: {
          Drawer: { template: '<aside><slot name="header" /><slot /></aside>' },
        },
      },
    });
    await flushPromises();

    const search = wrapper.findComponent("input-text-stub") as unknown as {
      vm: { $emit: (event: string, value: unknown) => void };
    };
    const status = wrapper.findComponent("select-stub") as unknown as {
      vm: { $emit: (event: string, value: unknown) => void };
    };
    search.vm.$emit("update:modelValue", " deposit ");
    status.vm.$emit("update:modelValue", "FAILED");
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();

    expect(mocks.getEventLogs).toHaveBeenLastCalledWith("project-1", {
      page: 1,
      limit: 12,
      search: "deposit",
      status: "FAILED",
    });

    const tabs = wrapper.findAll(".section-tabs button");
    await tabs[1]!.trigger("click");
    await tabs[0]!.trigger("click");
    await vi.advanceTimersByTimeAsync(0);
    await flushPromises();

    expect(mocks.getEventLogs).toHaveBeenLastCalledWith("project-1", {
      page: 1,
      limit: 12,
    });
    vi.useRealTimers();
  });

  it("opens the strict Run Explain inspector for a selected project-scoped Run", async () => {
    const run = {
      id: "run-1",
      scenarioId: "scenario-1",
      scenarioCode: "welcome",
      scenarioName: "Welcome",
      userId: "user-1",
      userExternalId: "customer-1",
      eventLogId: "event-1",
      status: "COMPLETED",
      currentStep: 1,
      startedAt: "2026-07-18T10:00:00.000Z",
      steps: [],
    };
    mocks.getScenarioRunsPage.mockResolvedValue({
      items: [run],
      nextCursor: null,
    });
    const wrapper = shallowMount(OperationsPage, {
      global: {
        stubs: {
          Drawer: { template: '<aside><slot name="header" /><slot /></aside>' },
        },
      },
    });
    await flushPromises();
    await wrapper.findAll(".section-tabs button")[1]!.trigger("click");

    const table = wrapper.findComponent("data-table-stub") as unknown as {
      vm: { $emit: (event: string, value: unknown) => void };
    };
    table.vm.$emit("row-click", { data: run });
    await wrapper.vm.$nextTick();

    expect(wrapper.getComponent(RunExplainInspector).props()).toMatchObject({
      projectId: "project-1",
      runId: "run-1",
    });
  });

  it("appends scenario runs using the backend cursor", async () => {
    const run = {
      id: "run-1",
      scenarioId: "scenario-1",
      scenarioCode: "welcome",
      scenarioName: "Welcome",
      userId: "user-1",
      userExternalId: "customer-1",
      eventLogId: "event-1",
      status: "COMPLETED",
      currentStep: 1,
      startedAt: "2026-07-18T10:00:00.000Z",
      steps: [],
    };
    mocks.getScenarioRunsPage
      .mockResolvedValueOnce({ items: [run], nextCursor: "opaque-run-cursor" })
      .mockResolvedValueOnce({
        items: [{ ...run, id: "run-2" }],
        nextCursor: null,
      });
    const wrapper = shallowMount(OperationsPage);
    await flushPromises();
    await wrapper.findAll(".section-tabs button")[1]!.trigger("click");
    await wrapper
      .find('button-stub[label="Загрузить ещё запусков"]')
      .trigger("click");
    await flushPromises();

    expect(mocks.getScenarioRunsPage).toHaveBeenLastCalledWith("project-1", {
      limit: 50,
      cursor: "opaque-run-cursor",
    });
  });

  it("keeps the newest Runs and Audit snapshot when a slower reload finishes last", async () => {
    const oldEvents =
      deferred<Awaited<ReturnType<typeof mocks.getEventLogs>>>();
    const oldRuns =
      deferred<Awaited<ReturnType<typeof mocks.getScenarioRunsPage>>>();
    const oldAudit = deferred<Awaited<ReturnType<typeof mocks.getAuditLogs>>>();
    const run = (id: string) => ({
      id,
      scenarioId: "scenario-1",
      scenarioCode: "welcome",
      scenarioName: "Welcome",
      userId: "user-1",
      userExternalId: "customer-1",
      eventLogId: "event-1",
      status: "COMPLETED",
      currentStep: 1,
      startedAt: "2026-07-18T10:00:00.000Z",
      steps: [],
    });
    mocks.getEventLogs
      .mockReturnValueOnce(oldEvents.promise)
      .mockResolvedValueOnce({
        items: [],
        pagination: {
          page: 1,
          limit: 12,
          total: 0,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      });
    mocks.getScenarioRunsPage
      .mockReturnValueOnce(oldRuns.promise)
      .mockResolvedValueOnce({ items: [run("run-new")], nextCursor: null });
    mocks.getAuditLogs
      .mockReturnValueOnce(oldAudit.promise)
      .mockResolvedValueOnce([
        {
          id: "audit-new",
          action: "UPDATE",
          actor: { name: "Новый", email: "new@example.com" },
          resourceType: "scenario",
          resourceId: "scenario-1",
          status: "SUCCEEDED",
          createdAt: "2026-07-18T10:00:00.000Z",
        },
      ]);

    const wrapper = shallowMount(OperationsPage);
    await Promise.resolve();
    await wrapper.find('button-stub[label="Обновить"]').trigger("click");
    await flushPromises();

    oldEvents.resolve({
      items: [],
      pagination: {
        page: 1,
        limit: 12,
        total: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });
    oldRuns.resolve({ items: [run("run-old")], nextCursor: "stale-cursor" });
    oldAudit.resolve([
      {
        id: "audit-old",
        action: "UPDATE",
        actor: { name: "Старый", email: "old@example.com" },
        resourceType: "scenario",
        resourceId: "scenario-1",
        status: "SUCCEEDED",
        createdAt: "2026-07-18T09:00:00.000Z",
      },
    ]);
    await flushPromises();

    await wrapper.findAll(".section-tabs button")[1]!.trigger("click");
    const runsTable = wrapper.findComponent("data-table-stub") as unknown as {
      vm: { $attrs: { value: Array<{ id: string }> } };
    };
    expect(runsTable.vm.$attrs.value.map((item) => item.id)).toEqual([
      "run-new",
    ]);
    await wrapper.findAll(".section-tabs button")[2]!.trigger("click");
    const auditTable = wrapper.findComponent("data-table-stub") as unknown as {
      vm: { $attrs: { value: Array<{ id: string }> } };
    };
    expect(auditTable.vm.$attrs.value.map((item) => item.id)).toEqual([
      "audit-new",
    ]);
  });
});
