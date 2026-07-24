import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import IntegrationActivityLogView from "./IntegrationActivityLogView.vue";

const item = {
  id: "activity-1",
  provider: "TELEGRAM",
  activityType: "PERSONAL_MESSAGE" as const,
  status: "SUCCEEDED" as const,
  state: "SENT",
  endUser: { id: "user-1", externalId: "customer_42" },
  origin: { kind: "AI", id: "conversation-1" },
  attemptCount: 1,
  errorCode: null,
  contentState: "AVAILABLE" as const,
  createdAt: "2026-07-24T11:25:10.000Z",
  updatedAt: "2026-07-24T11:25:16.000Z",
  finishedAt: "2026-07-24T11:25:16.000Z",
};
const detail = {
  ...item,
  sourceResourceKind: "TELEGRAM_PERSONAL_MESSAGE",
  sourceResourceId: "message-1",
  requestId: "request-1",
  correlationId: null,
  conversationId: "conversation-1",
  scenarioRunId: null,
  attempts: [
    {
      attemptNumber: 1,
      outcome: "ACCEPTED",
      errorCode: null,
      retryAfterMs: null,
      startedAt: "2026-07-24T11:25:14.000Z",
      finishedAt: "2026-07-24T11:25:16.000Z",
    },
  ],
  milestones: [],
};

const mocks = vi.hoisted(() => ({
  project: {
    id: "project-1",
    effectivePermissionCodes: [
      "project.integration_activity.read",
      "project.integration_message_content.read",
    ] as string[],
  },
  reactiveProject: null as null | {
    id: string;
    effectivePermissionCodes: string[];
  },
  query: {} as Record<string, string | string[]>,
  replace: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  content: vi.fn(),
}));

vi.mock("@/features/auth/auth.store", async () => {
  const { reactive } = await import("vue");
  mocks.reactiveProject = reactive(mocks.project);
  return {
    useAuthStore: () => ({ project: mocks.reactiveProject }),
  };
});
vi.mock("@/features/integration-activity/api", () => ({
  integrationActivityRepository: {
    list: mocks.list,
    get: mocks.get,
    content: mocks.content,
  },
}));
vi.mock("vue-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue-router")>()),
  useRoute: () => ({ query: mocks.query }),
  useRouter: () => ({ replace: mocks.replace }),
}));

function mountView() {
  return mount(IntegrationActivityLogView, {
    global: {
      stubs: {
        Button: {
          props: ["label", "disabled", "loading"],
          emits: ["click"],
          template:
            '<button type="button" :disabled="disabled" @click="$emit(\'click\')">{{ label }}<slot /></button>',
        },
        Column: { template: '<div><slot name="body" /></div>' },
        DataTable: {
          props: ["value"],
          emits: ["row-click"],
          template:
            '<div><button v-for="row in value" :key="row.id" class="activity-row" @click="$emit(\'row-click\', { data: row })">{{ row.endUser.externalId }}</button></div>',
        },
        Drawer: {
          props: ["visible"],
          template:
            '<aside v-if="visible"><slot name="header" /><slot /></aside>',
        },
        InputText: {
          props: ["modelValue"],
          emits: ["update:modelValue"],
          template: "<input />",
        },
        Message: { template: "<div><slot /></div>" },
        MultiSelect: { template: "<select />" },
        Select: { template: "<select />" },
        Skeleton: { template: "<div />" },
        Tag: { props: ["value"], template: "<span>{{ value }}</span>" },
      },
    },
  });
}

describe("IntegrationActivityLogView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reactiveProject!.effectivePermissionCodes = [
      "project.integration_activity.read",
      "project.integration_message_content.read",
    ];
    mocks.query = {};
    mocks.list.mockResolvedValue({ items: [item], nextCursor: null });
    mocks.get.mockResolvedValue(detail);
    mocks.content.mockResolvedValue({
      state: "AVAILABLE",
      kind: "TEXT",
      text: "<b>literal text</b>",
      attachment: null,
      redactedAt: null,
    });
    window.scrollTo = vi.fn();
  });

  it("loads detail without content and reveals plain text only after an explicit action", async () => {
    const wrapper = mountView();
    await flushPromises();

    expect(mocks.list).toHaveBeenCalledWith("project-1", { limit: 25 });
    await wrapper.get(".activity-row").trigger("click");
    await flushPromises();
    expect(mocks.get).toHaveBeenCalledWith("project-1", "activity-1");
    expect(mocks.content).not.toHaveBeenCalled();

    const reveal = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Показать содержимое"));
    expect(reveal).toBeDefined();
    await reveal!.trigger("click");
    await flushPromises();

    expect(mocks.content).toHaveBeenCalledWith("project-1", "activity-1");
    expect(wrapper.text()).toContain("<b>literal text</b>");
    expect(wrapper.html()).not.toContain("<b>literal text</b>");
  });

  it("never offers content reveal without the separate Permission", async () => {
    mocks.reactiveProject!.effectivePermissionCodes = [
      "project.integration_activity.read",
    ];
    const wrapper = mountView();
    await flushPromises();
    await wrapper.get(".activity-row").trigger("click");
    await flushPromises();

    expect(wrapper.text()).not.toContain("Показать содержимое");
    expect(mocks.content).not.toHaveBeenCalled();
  });

  it("ignores a late content response after the content Permission is revoked", async () => {
    let resolveContent!: (value: {
      state: "AVAILABLE";
      kind: string;
      text: string;
      attachment: null;
      redactedAt: null;
    }) => void;
    mocks.content.mockReturnValue(
      new Promise((resolve) => {
        resolveContent = resolve;
      }),
    );
    const wrapper = mountView();
    await flushPromises();
    await wrapper.get(".activity-row").trigger("click");
    await flushPromises();
    const reveal = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Показать содержимое"));
    await reveal!.trigger("click");

    mocks.reactiveProject!.effectivePermissionCodes = [
      "project.integration_activity.read",
    ];
    await flushPromises();
    resolveContent({
      state: "AVAILABLE",
      kind: "TEXT",
      text: "must stay hidden",
      attachment: null,
      redactedAt: null,
    });
    await flushPromises();

    expect(wrapper.text()).not.toContain("must stay hidden");
    expect(wrapper.text()).not.toContain("Показать содержимое");
  });

  it("restores integration filters from the URL and sends them server-side", async () => {
    mocks.query = {
      tab: "integrations",
      provider: "TELEGRAM",
      activityType: "CONNECTION",
      activityStatus: ["PENDING", "FAILED"],
      user: "customer_42",
      createdFrom: "2026-07-01T00:00:00.000Z",
      createdTo: "2026-08-01T00:00:00.000Z",
      limit: "50",
    };
    mountView();
    await flushPromises();

    expect(mocks.list).toHaveBeenCalledWith("project-1", {
      provider: ["TELEGRAM"],
      activityType: ["CONNECTION"],
      status: ["PENDING", "FAILED"],
      externalUserId: "customer_42",
      createdFrom: "2026-07-01T00:00:00.000Z",
      createdTo: "2026-08-01T00:00:00.000Z",
      limit: 50,
    });
  });
});
