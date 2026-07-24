import { flushPromises, shallowMount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProjectLogsPage from "./ProjectLogsPage.vue";

const mocks = vi.hoisted(() => ({
  permissions: [
    "project.event_logs.read",
    "project.integration_activity.read",
  ] as string[],
  query: {} as Record<string, string>,
  replace: vi.fn(),
}));

vi.mock("@/features/auth/auth.store", () => ({
  useAuthStore: () => ({
    project: {
      id: "project-1",
      get effectivePermissionCodes() {
        return mocks.permissions;
      },
    },
  }),
}));

vi.mock("vue-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue-router")>()),
  useRoute: () => ({ query: mocks.query }),
  useRouter: () => ({ replace: mocks.replace }),
}));

describe("ProjectLogsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permissions = [
      "project.event_logs.read",
      "project.integration_activity.read",
    ];
    mocks.query = {};
  });

  it("keeps legacy links on Product Events and exposes both permitted tabs", async () => {
    const wrapper = shallowMount(ProjectLogsPage);
    await flushPromises();

    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toEqual([
      "События продукта",
      "Интеграции",
    ]);
    expect(wrapper.find("event-logs-page-stub").exists()).toBe(true);
    expect(wrapper.find("integration-activity-log-view-stub").exists()).toBe(
      false,
    );
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("normalizes to Integrations when it is the only permitted tab", async () => {
    mocks.permissions = ["project.integration_activity.read"];
    const wrapper = shallowMount(ProjectLogsPage);
    await flushPromises();

    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toEqual([
      "Интеграции",
    ]);
    expect(wrapper.find("integration-activity-log-view-stub").exists()).toBe(
      true,
    );
    expect(mocks.replace).toHaveBeenCalledWith({
      query: { tab: "integrations" },
    });
  });

  it("does not render a forbidden tab requested through the URL", async () => {
    mocks.permissions = ["project.event_logs.read"];
    mocks.query = { tab: "integrations", user: "customer_42" };
    const wrapper = shallowMount(ProjectLogsPage);
    await flushPromises();

    expect(wrapper.find("event-logs-page-stub").exists()).toBe(true);
    expect(mocks.replace).toHaveBeenCalledWith({
      query: { tab: "events", user: "customer_42" },
    });
  });
});
