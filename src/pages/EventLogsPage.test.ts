import { flushPromises, shallowMount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EventLogsPage from "./EventLogsPage.vue";

const log = {
  id: "log-1",
  eventCode: "deposit",
  eventName: "Deposit",
  eventDefinitionId: "event-1",
  eventDefinitionKeyId: "event-key-1",
  eventVersion: 2,
  ingestionPolicyVersion: 3,
  ingestionPolicySnapshot: {
    enabled: true,
    clientIngestible: false,
    countsAsActivity: true,
    source: "SERVER",
  },
  userId: "user-1",
  userExternalId: "customer-1",
  source: "SERVER" as const,
  status: "PROCESSED" as const,
  occurredAt: "2026-07-16T10:00:00.000Z",
  receivedAt: "2026-07-16T10:00:00.100Z",
  payload: { amount: 25 },
  context: {},
};

function mountWithMessageSlots() {
  return shallowMount(EventLogsPage, {
    global: {
      stubs: {
        Message: { template: '<div class="message-stub"><slot /></div>' },
      },
    },
  });
}

function button(wrapper: ReturnType<typeof shallowMount>, label: string) {
  const value = wrapper.find(`button-stub[label="${label}"]`);
  if (!value.exists()) throw new Error(`Button ${label} not found`);
  return value;
}

function updateModel(
  wrapper: ReturnType<typeof shallowMount>,
  selector: string,
  value: unknown,
) {
  const component = wrapper.findComponent(selector) as unknown as {
    vm: { $emit: (event: string, value: unknown) => void };
  };
  component.vm.$emit("update:modelValue", value);
}

const mocks = vi.hoisted(() => ({
  auth: null as unknown as {
    project?: { id: string; effectivePermissionCodes: string[] };
  },
  role: "OWNER" as "OWNER" | "VIEWER",
  getEvents: vi.fn(),
  getEventLogPage: vi.fn(),
  getEventLog: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  routeQuery: {} as Record<string, string | string[]>,
}));

vi.mock("@/features/auth/auth.store", async () => {
  const { reactive } = await import("vue");
  mocks.auth = reactive({
    project: {
      id: "project-1",
      effectivePermissionCodes: ["project.event_logs.read"],
    },
  });
  return {
    useAuthStore: () => ({
      get project() {
        return mocks.auth.project;
      },
      user: {
        get role() {
          return mocks.role;
        },
      },
    }),
  };
});

vi.mock("@/shared/api/repository", () => ({
  repository: {
    getEvents: mocks.getEvents,
    getEventLogPage: mocks.getEventLogPage,
    getEventLog: mocks.getEventLog,
  },
}));

vi.mock("primevue/usetoast", () => ({ useToast: () => ({ add: vi.fn() }) }));
vi.mock("vue-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue-router")>()),
  useRoute: () => ({ query: mocks.routeQuery }),
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));

describe("EventLogsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.role = "OWNER";
    mocks.auth.project = {
      id: "project-1",
      effectivePermissionCodes: ["project.event_logs.read"],
    };
    mocks.getEvents.mockResolvedValue([]);
    mocks.getEventLogPage.mockResolvedValue({ items: [], nextCursor: null });
    mocks.routeQuery = {};
    window.scrollTo = vi.fn();
  });

  it("clears the old tenant and ignores its late page after a Project switch", async () => {
    let resolveOld!: (value: {
      items: (typeof log)[];
      nextCursor: null;
    }) => void;
    const oldPage = new Promise<{ items: (typeof log)[]; nextCursor: null }>(
      (resolve) => {
        resolveOld = resolve;
      },
    );
    const newLog = { ...log, id: "log-2", eventName: "New project event" };
    mocks.getEventLogPage.mockImplementation((projectId: string) =>
      projectId === "project-1"
        ? oldPage
        : Promise.resolve({ items: [newLog], nextCursor: null }),
    );
    const wrapper = shallowMount(EventLogsPage);
    await flushPromises();

    mocks.auth.project = {
      id: "project-2",
      effectivePermissionCodes: ["project.event_logs.read"],
    };
    await flushPromises();
    expect(mocks.getEventLogPage).toHaveBeenCalledWith("project-2", {
      limit: 25,
    });

    resolveOld({
      items: [{ ...log, eventName: "Old project event" }],
      nextCursor: null,
    });
    await flushPromises();
    await wrapper.findAll(".view-switch button")[1]!.trigger("click");
    expect(wrapper.text()).toContain("New project event");
    expect(wrapper.text()).not.toContain("Old project event");
    wrapper.unmount();
    mocks.auth.project = {
      id: "project-1",
      effectivePermissionCodes: ["project.event_logs.read"],
    };
  });

  it("loads the first snapshot page through the filtered CMS endpoint", async () => {
    const wrapper = shallowMount(EventLogsPage);
    await flushPromises();

    expect(mocks.getEventLogPage).toHaveBeenCalledWith("project-1", {
      limit: 25,
    });
    expect(mocks.getEvents).toHaveBeenCalledWith("project-1");
    expect(wrapper.get(".stream-summary").attributes()).toMatchObject({
      tabindex: "0",
      "aria-label": "Сводка потока событий",
    });
  });

  it("does not request sensitive logs for a viewer", async () => {
    mocks.role = "VIEWER";
    mocks.auth.project = {
      id: "project-1",
      effectivePermissionCodes: [],
    };
    const wrapper = shallowMount(EventLogsPage);
    await flushPromises();

    expect(mocks.getEventLogPage).not.toHaveBeenCalled();
    expect(wrapper.find('message-stub[severity="warn"]').exists()).toBe(true);
  });

  it("shows all-value defaults and sends multiple selected filters", async () => {
    const wrapper = shallowMount(EventLogsPage);
    await flushPromises();

    expect(
      wrapper.find("multi-select-stub#event-filter").attributes("placeholder"),
    ).toBe("Все события");
    expect(
      wrapper.find("multi-select-stub#status-filter").attributes("placeholder"),
    ).toBe("Все статусы");
    expect(
      wrapper.find("multi-select-stub#source-filter").attributes("placeholder"),
    ).toBe("Все источники");

    updateModel(wrapper, "multi-select-stub#event-filter", [
      "deposit",
      "purchase",
    ]);
    updateModel(wrapper, "multi-select-stub#status-filter", [
      "FAILED",
      "PROCESSED",
    ]);
    updateModel(wrapper, "multi-select-stub#source-filter", [
      "SERVER",
      "FRONTEND",
    ]);
    await button(wrapper, "Применить").trigger("click");
    await flushPromises();

    expect(mocks.getEventLogPage).toHaveBeenLastCalledWith("project-1", {
      eventCode: ["deposit", "purchase"],
      status: ["FAILED", "PROCESSED"],
      source: ["SERVER", "FRONTEND"],
      limit: 25,
    });
    expect(mocks.replace).toHaveBeenCalledWith({
      query: {
        eventCode: ["deposit", "purchase"],
        status: ["FAILED", "PROCESSED"],
        source: ["SERVER", "FRONTEND"],
      },
    });
  });

  it("restores repeated and legacy single filters from the URL", async () => {
    mocks.routeQuery = {
      eventCode: ["deposit", "purchase"],
      status: "FAILED",
      source: ["SERVER", "FRONTEND"],
    };
    shallowMount(EventLogsPage);
    await flushPromises();

    expect(mocks.getEventLogPage).toHaveBeenCalledWith("project-1", {
      eventCode: ["deposit", "purchase"],
      status: ["FAILED"],
      source: ["SERVER", "FRONTEND"],
      limit: 25,
    });
  });

  it("opens a project-scoped Event Log linked from Run Explain", async () => {
    mocks.routeQuery = { eventId: "log-1" };
    mocks.getEventLog.mockResolvedValue(log);

    const wrapper = shallowMount(EventLogsPage);
    await flushPromises();

    expect(mocks.getEventLog).toHaveBeenCalledWith("project-1", "log-1");
    expect(wrapper.find("drawer-stub").attributes()).toHaveProperty("visible");
  });

  it("retries a failed refresh from page one and resets cursor history only after success", async () => {
    mocks.getEventLogPage
      .mockResolvedValueOnce({ items: [log], nextCursor: "cursor-2" })
      .mockResolvedValueOnce({ items: [log], nextCursor: "cursor-3" })
      .mockRejectedValueOnce(new Error("refresh failed"))
      .mockResolvedValueOnce({ items: [log], nextCursor: "fresh-cursor" });
    const wrapper = mountWithMessageSlots();
    await flushPromises();

    await button(wrapper, "Дальше").trigger("click");
    await flushPromises();
    await button(wrapper, "Обновить").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("refresh failed");
    await button(wrapper, "Повторить").trigger("click");
    await flushPromises();

    expect(mocks.getEventLogPage.mock.calls.slice(1)).toEqual([
      ["project-1", { limit: 25, cursor: "cursor-2" }],
      ["project-1", { limit: 25 }],
      ["project-1", { limit: 25 }],
    ]);
    expect(wrapper.text()).toContain("Страница 1");
  });

  it("retries the exact failed filter request and commits its URL state after success", async () => {
    mocks.getEventLogPage
      .mockResolvedValueOnce({ items: [], nextCursor: null })
      .mockRejectedValueOnce(new Error("filter failed"))
      .mockResolvedValueOnce({ items: [], nextCursor: null });
    const wrapper = mountWithMessageSlots();
    await flushPromises();

    updateModel(wrapper, "input-text-stub#user-filter", " customer-42 ");
    await button(wrapper, "Применить").trigger("click");
    await flushPromises();
    await button(wrapper, "Повторить").trigger("click");
    await flushPromises();

    expect(mocks.getEventLogPage.mock.calls.slice(1)).toEqual([
      ["project-1", { externalUserId: "customer-42", limit: 25 }],
      ["project-1", { externalUserId: "customer-42", limit: 25 }],
    ]);
    expect(mocks.replace).toHaveBeenCalledWith({
      query: { user: "customer-42" },
    });
  });

  it("shows loading and empty states", async () => {
    mocks.getEventLogPage.mockReturnValue(new Promise(() => {}));
    const loadingWrapper = shallowMount(EventLogsPage);

    expect(loadingWrapper.findAll("skeleton-stub")).toHaveLength(8);
    loadingWrapper.unmount();

    mocks.getEventLogPage.mockResolvedValue({ items: [], nextCursor: null });
    const emptyWrapper = shallowMount(EventLogsPage);
    await flushPromises();

    expect(emptyWrapper.get(".empty").text()).toContain("События не найдены");
  });

  it("switches to the timeline and opens a detail drawer", async () => {
    mocks.getEventLogPage.mockResolvedValue({ items: [log], nextCursor: null });
    const wrapper = shallowMount(EventLogsPage, {
      global: { renderStubDefaultSlot: true },
    });
    await flushPromises();

    await wrapper.findAll(".view-switch button")[1]!.trigger("click");
    expect(wrapper.find(".timeline").exists()).toBe(true);

    await wrapper.get(".timeline-item").trigger("click");
    expect(wrapper.find("drawer-stub").attributes()).toHaveProperty("visible");
    expect(wrapper.get('[data-test="policy-snapshot"]').text()).toContain(
      "Приём включёнДа",
    );
    expect(wrapper.get('[data-test="policy-snapshot"]').text()).toContain(
      "Из браузераНет",
    );
    expect(wrapper.get('[data-test="policy-snapshot"]').text()).toContain(
      "ИсточникSERVER",
    );
    await button(wrapper, "Открыть event").trigger("click");
    expect(mocks.push).toHaveBeenCalledWith({
      name: "event-definition-workspace",
      params: { definitionKeyId: "event-key-1" },
      query: { revisionId: "event-1" },
    });
  });
});
