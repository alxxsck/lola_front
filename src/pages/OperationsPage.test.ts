import { flushPromises, shallowMount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RunExplainInspector } from "@/features/scenario-run-explain/ui";
import OperationsPage from "./OperationsPage.vue";

const mocks = vi.hoisted(() => ({
  auth: null as unknown as {
    project?: { id: string; effectivePermissionCodes: string[] };
  },
  getScenarioRunsPage: vi.fn(),
  getAuditEventsPage: vi.fn(),
  getProductApiRequestLog: vi.fn(),
  getProductApiRequestLogsPage: vi.fn(),
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
  mocks.auth = reactive({
    project: {
      id: "project-1",
      effectivePermissionCodes: ["project.integration_api_requests.read"],
    },
  });
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
    getScenarioRunsPage: mocks.getScenarioRunsPage,
    getAuditEventsPage: mocks.getAuditEventsPage,
    getProductApiRequestLog: mocks.getProductApiRequestLog,
    getProductApiRequestLogsPage: mocks.getProductApiRequestLogsPage,
  },
}));

describe("OperationsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.routeQuery = {};
    mocks.getScenarioRunsPage.mockResolvedValue({
      items: [],
      nextCursor: null,
    });
    mocks.getAuditEventsPage.mockResolvedValue({
      items: [],
      nextCursor: null,
    });
    mocks.getProductApiRequestLogsPage.mockResolvedValue({
      items: [],
      nextCursor: null,
    });
    mocks.getProductApiRequestLog.mockResolvedValue(null);
  });

  it("opens on scenario runs and does not expose an events section", async () => {
    const wrapper = shallowMount(OperationsPage);
    await flushPromises();

    expect(
      wrapper.findAll(".section-tabs button").map((tab) => tab.text()),
    ).toEqual([
      "Запуски сценариев0",
      "Аудит0",
      "Логи API0",
      "Решения о запуске0",
    ]);
    expect(
      wrapper.findAll(".section-tabs button")[0]!.attributes("aria-selected"),
    ).toBe("true");
    expect(wrapper.text()).not.toContain("События, выполнение сценариев");
    expect(mocks.getScenarioRunsPage).toHaveBeenCalledWith("project-1", {
      limit: 50,
    });
    expect(mocks.getAuditEventsPage).toHaveBeenCalledWith("project-1", {
      limit: 50,
    });
  });

  it("filters, opens JSON detail and appends Product API requests by cursor", async () => {
    vi.useFakeTimers();
    const requestLog = {
      id: "request-log-1",
      credentialId: "sk_live_abcd",
      requestId: "request-1",
      externalUserId: "user-1",
      method: "POST",
      path: "/interaction-sessions",
      payloadBytes: 128,
      statusCode: 201,
      outcome: "SUCCEEDED",
      durationMs: 24,
      receivedAt: "2026-07-27T10:00:00.000Z",
      retainUntil: "2026-08-26T10:00:00.000Z",
    };
    mocks.getProductApiRequestLogsPage
      .mockResolvedValueOnce({
        items: [requestLog],
        nextCursor: "opaque-product-api-cursor",
      })
      .mockResolvedValueOnce({
        items: [{ ...requestLog, id: "request-log-2" }],
        nextCursor: null,
      });
    mocks.getProductApiRequestLog.mockResolvedValue({
      ...requestLog,
      payload: { externalUserId: "user-1", locale: "ru" },
    });
    const wrapper = shallowMount(OperationsPage, {
      global: {
        stubs: {
          Drawer: {
            props: ["visible"],
            template:
              '<aside v-if="visible"><slot name="header" /><slot /></aside>',
          },
        },
      },
    });
    await flushPromises();
    await wrapper.findAll(".section-tabs button")[2]!.trigger("click");
    await flushPromises();

    const search = wrapper.findComponent("input-text-stub") as unknown as {
      vm: { $emit: (event: string, value: unknown) => void };
    };
    search.vm.$emit("update:modelValue", " sessions ");
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();
    expect(mocks.getProductApiRequestLogsPage).toHaveBeenLastCalledWith(
      "project-1",
      { limit: 50, path: "sessions" },
    );

    const table = wrapper.findComponent("data-table-stub") as unknown as {
      vm: {
        $attrs: { value: Array<{ id: string }> };
        $emit: (event: string, value: unknown) => void;
      };
    };
    table.vm.$emit("row-click", { data: requestLog });
    await flushPromises();
    expect(mocks.getProductApiRequestLog).toHaveBeenCalledWith(
      "project-1",
      "request-log-1",
    );
    expect(wrapper.text()).toContain('"locale": "ru"');
    expect(wrapper.text()).toContain("request-1");

    await wrapper
      .find('button-stub[label="Загрузить ещё запросов"]')
      .trigger("click");
    await flushPromises();
    expect(mocks.getProductApiRequestLogsPage).toHaveBeenLastCalledWith(
      "project-1",
      {
        limit: 50,
        path: "sessions",
        cursor: "opaque-product-api-cursor",
      },
    );
    expect(table.vm.$attrs.value.map((item) => item.id)).toEqual([
      "request-log-1",
      "request-log-2",
    ]);
    vi.useRealTimers();
  });

  it("opens a real server-filtered Runs surface for an active-wait deep link", async () => {
    mocks.routeQuery = {
      section: "runs",
      eventDefinitionKeyId: "definition-key-1",
    };
    const wrapper = shallowMount(OperationsPage);
    await flushPromises();

    expect(
      wrapper.findAll(".section-tabs button")[0]!.attributes("aria-selected"),
    ).toBe("true");
    expect(mocks.getScenarioRunsPage).toHaveBeenCalledWith("project-1", {
      limit: 50,
      eventDefinitionKeyId: "definition-key-1",
    });
    expect(wrapper.find('[data-test="active-wait-filter"]').exists()).toBe(
      true,
    );
  });

  it("does not expose Product API logs without the high-risk read permission", async () => {
    mocks.routeQuery = { section: "productApi" };
    mocks.auth.project = { id: "project-1", effectivePermissionCodes: [] };
    const wrapper = shallowMount(OperationsPage);
    await flushPromises();

    expect(wrapper.text()).not.toContain("Логи API");
    expect(mocks.getProductApiRequestLogsPage).not.toHaveBeenCalled();
    expect(
      wrapper.findAll(".section-tabs button")[0]!.attributes("aria-selected"),
    ).toBe("true");

    wrapper.unmount();
    mocks.auth.project = {
      id: "project-1",
      effectivePermissionCodes: ["project.integration_api_requests.read"],
    };
  });

  it("reloads on Project switch and rejects a late response from the old tenant", async () => {
    const old = deferred<{
      items: Array<{ id: string }>;
      nextCursor: string | null;
    }>();
    mocks.getScenarioRunsPage.mockImplementation((projectId: string) =>
      projectId === "project-1"
        ? old.promise
        : Promise.resolve({ items: [], nextCursor: null }),
    );
    const wrapper = shallowMount(OperationsPage);
    await flushPromises();

    mocks.auth.project = {
      id: "project-2",
      effectivePermissionCodes: ["project.integration_api_requests.read"],
    };
    await flushPromises();
    expect(mocks.getScenarioRunsPage).toHaveBeenCalledWith("project-2", {
      limit: 50,
    });

    old.resolve({
      items: [{ id: "stale-run" }],
      nextCursor: "stale-cursor",
    });
    await flushPromises();
    const runsTable = wrapper.findComponent("data-table-stub") as unknown as {
      vm: { $attrs: { value: Array<{ id: string }> } };
    };
    expect(runsTable.vm.$attrs.value).toEqual([]);
    wrapper.unmount();
    mocks.auth.project = {
      id: "project-1",
      effectivePermissionCodes: ["project.integration_api_requests.read"],
    };
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
    await wrapper
      .find('button-stub[label="Загрузить ещё запусков"]')
      .trigger("click");
    await flushPromises();

    expect(mocks.getScenarioRunsPage).toHaveBeenLastCalledWith("project-1", {
      limit: 50,
      cursor: "opaque-run-cursor",
    });
  });

  it("filters, paginates and opens canonical audit-event details", async () => {
    vi.useFakeTimers();
    const audit = {
      id: "audit-1",
      eventType: "iam.project_resource.changed",
      eventVersion: 1,
      operation: "SAVE_DRAFT",
      actor: {
        id: "admin-1",
        type: "CMS_USER",
        name: "Owner",
        email: "owner@lola.dev",
      },
      target: { kind: "PROJECT", id: "project-1" },
      resourceType: "SCENARIO",
      resourceId: "scenario-1",
      outcome: "SUCCESS",
      requiredPermissionCode: "project.scenarios.write",
      auditReason: "Save onboarding draft",
      requestId: "request-1",
      authorizationEvidence: { roleKeys: ["owner"] },
      metadata: { source: "scenario-authoring" },
      occurredAt: "2026-07-23T10:00:00.000Z",
    };
    mocks.getAuditEventsPage
      .mockResolvedValueOnce({
        items: [audit],
        nextCursor: "opaque-audit-cursor",
      })
      .mockResolvedValueOnce({
        items: [audit],
        nextCursor: "opaque-audit-cursor",
      })
      .mockResolvedValueOnce({
        items: [{ ...audit, id: "audit-2" }],
        nextCursor: null,
      });
    const wrapper = shallowMount(OperationsPage, {
      global: {
        stubs: {
          Drawer: {
            props: ["visible"],
            template:
              '<aside v-if="visible"><slot name="header" /><slot /></aside>',
          },
        },
      },
    });
    await flushPromises();
    await wrapper.findAll(".section-tabs button")[1]!.trigger("click");

    const search = wrapper.findComponent("input-text-stub") as unknown as {
      vm: { $emit: (event: string, value: unknown) => void };
    };
    const status = wrapper.findComponent("select-stub") as unknown as {
      vm: { $emit: (event: string, value: unknown) => void };
    };
    search.vm.$emit("update:modelValue", " draft ");
    status.vm.$emit("update:modelValue", "SUCCESS");
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();

    expect(mocks.getAuditEventsPage).toHaveBeenLastCalledWith("project-1", {
      limit: 50,
      search: "draft",
      outcome: "SUCCESS",
    });
    const table = wrapper.findComponent("data-table-stub") as unknown as {
      vm: {
        $attrs: { value: Array<{ id: string }> };
        $emit: (event: string, value: unknown) => void;
      };
    };
    expect(table.vm.$attrs.value.map((item) => item.id)).toEqual(["audit-1"]);
    table.vm.$emit("row-click", { data: audit });
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain("project.scenarios.write");
    expect(wrapper.text()).toContain("Save onboarding draft");
    expect(wrapper.text()).toContain("request-1");

    await wrapper
      .find('button-stub[label="Загрузить ещё событий аудита"]')
      .trigger("click");
    await flushPromises();
    expect(mocks.getAuditEventsPage).toHaveBeenLastCalledWith("project-1", {
      limit: 50,
      search: "draft",
      outcome: "SUCCESS",
      cursor: "opaque-audit-cursor",
    });
    expect(table.vm.$attrs.value.map((item) => item.id)).toEqual([
      "audit-1",
      "audit-2",
    ]);

    await wrapper.findAll(".section-tabs button")[0]!.trigger("click");
    await wrapper.findAll(".section-tabs button")[1]!.trigger("click");
    await vi.advanceTimersByTimeAsync(0);
    await flushPromises();
    expect(mocks.getAuditEventsPage).toHaveBeenLastCalledWith("project-1", {
      limit: 50,
    });
    vi.useRealTimers();
  });

  it("keeps the newest Runs and Audit snapshot when a slower reload finishes last", async () => {
    const oldRuns =
      deferred<Awaited<ReturnType<typeof mocks.getScenarioRunsPage>>>();
    const oldAudit =
      deferred<Awaited<ReturnType<typeof mocks.getAuditEventsPage>>>();
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
    mocks.getScenarioRunsPage
      .mockReturnValueOnce(oldRuns.promise)
      .mockResolvedValueOnce({ items: [run("run-new")], nextCursor: null });
    mocks.getAuditEventsPage
      .mockReturnValueOnce(oldAudit.promise)
      .mockResolvedValueOnce({
        items: [
          {
            id: "audit-new",
            eventType: "iam.project_resource.changed",
            eventVersion: 1,
            operation: "UPDATE",
            actor: {
              id: "admin-new",
              type: "CMS_USER",
              name: "Новый",
              email: "new@example.com",
            },
            target: { kind: "PROJECT", id: "project-1" },
            resourceType: "SCENARIO",
            resourceId: "scenario-1",
            outcome: "SUCCESS",
            authorizationEvidence: {},
            metadata: {},
            occurredAt: "2026-07-18T10:00:00.000Z",
          },
        ],
        nextCursor: null,
      });

    const wrapper = shallowMount(OperationsPage);
    await Promise.resolve();
    await wrapper.find('button-stub[label="Обновить"]').trigger("click");
    await flushPromises();

    oldRuns.resolve({ items: [run("run-old")], nextCursor: "stale-cursor" });
    oldAudit.resolve({
      items: [
        {
          id: "audit-old",
          eventType: "iam.project_resource.changed",
          eventVersion: 1,
          operation: "UPDATE",
          actor: {
            id: "admin-old",
            type: "CMS_USER",
            name: "Старый",
            email: "old@example.com",
          },
          target: { kind: "PROJECT", id: "project-1" },
          resourceType: "SCENARIO",
          resourceId: "scenario-1",
          outcome: "SUCCESS",
          authorizationEvidence: {},
          metadata: {},
          occurredAt: "2026-07-18T09:00:00.000Z",
        },
      ],
      nextCursor: null,
    });
    await flushPromises();

    const runsTable = wrapper.findComponent("data-table-stub") as unknown as {
      vm: { $attrs: { value: Array<{ id: string }> } };
    };
    expect(runsTable.vm.$attrs.value.map((item) => item.id)).toEqual([
      "run-new",
    ]);
    await wrapper.findAll(".section-tabs button")[1]!.trigger("click");
    const auditTable = wrapper.findComponent("data-table-stub") as unknown as {
      vm: { $attrs: { value: Array<{ id: string }> } };
    };
    expect(auditTable.vm.$attrs.value.map((item) => item.id)).toEqual([
      "audit-new",
    ]);
  });
});
