import { flushPromises, mount } from "@vue/test-utils";
import { reactive } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/http/api-error";
import ProjectIntegrationsPage from "./ProjectIntegrationsPage.vue";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  createSlack: vi.fn(),
  updateSlack: vi.fn(),
  testSlack: vi.fn(),
  permissions: [
    "project.notifications.read",
    "project.notifications.manage",
  ] as string[],
  auth: null as unknown as {
    project: {
      id: string;
      name: string;
      effectivePermissionCodes: string[];
    };
    logout: ReturnType<typeof vi.fn>;
  },
  replace: vi.fn(),
}));

vi.mock(
  "@/features/notification-destinations/notification-destinations.api",
  () => ({
    notificationDestinationsApi: {
      list: mocks.list,
      createSlack: mocks.createSlack,
      updateSlack: mocks.updateSlack,
      testSlack: mocks.testSlack,
    },
  }),
);

vi.mock("@/features/auth/auth.store", () => ({
  useAuthStore: () => mocks.auth,
}));

vi.mock("vue-router", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock(
  "@/features/notification-destinations/OperationalTelegramCard.vue",
  () => ({
    default: { template: '<section data-testid="telegram-card-stub" />' },
  }),
);

vi.mock(
  "@/features/telegram-product-installations/ProductTelegramCard.vue",
  () => ({
    default: {
      emits: ["fresh-login-requested"],
      props: ["projectId", "canRead", "canManage"],
      template: `
        <section
          data-testid="product-telegram-card-stub"
          :data-project-id="projectId"
          :data-can-read="String(canRead)"
          :data-can-manage="String(canManage)"
        >
          <button data-action="request-product-telegram-fresh-login" @click="$emit('fresh-login-requested')">
            fresh login
          </button>
        </section>
      `,
    },
  }),
);

const destination = (overrides: Record<string, unknown> = {}) => ({
  id: "destination-1",
  projectId: "project-1",
  topic: "AI_PROPOSALS",
  channel: "SLACK_WEBHOOK",
  displayName: "Поддержка",
  status: "PENDING_TEST",
  credentialFingerprint: "a1b2c3d4e5f60708",
  secretRevision: 1,
  testedSecretRevision: null,
  lastSuccessfulTestAt: null,
  lastFailureCategory: null,
  version: 1,
  updatedByActorType: "CMS_USER",
  updatedByActorId: "operator-1",
  updatedAt: "2026-07-23T12:00:00.000Z",
  ...overrides,
});

describe("ProjectIntegrationsPage", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    mocks.permissions = [
      "project.notifications.read",
      "project.notifications.manage",
    ];
    mocks.auth = reactive({
      project: {
        id: "project-1",
        name: "Project One",
        effectivePermissionCodes: [...mocks.permissions],
      },
      logout: vi.fn(),
    });
    mocks.list.mockResolvedValue({ items: [] });
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
  });

  it("loads a read-only Slack card without exposing secret controls to readers", async () => {
    mocks.permissions = ["project.notifications.read"];
    mocks.auth.project.effectivePermissionCodes = [...mocks.permissions];
    mocks.list.mockResolvedValue({
      items: [destination({ status: "ACTIVE" })],
    });
    const wrapper = mount(ProjectIntegrationsPage);
    await flushPromises();

    expect(wrapper.text()).toContain("Slack");
    expect(wrapper.text()).toContain("Подключено");
    expect(wrapper.text()).toContain("a1b2c3d4e5f60708");
    expect(wrapper.find('input[name="webhookUrl"]').exists()).toBe(false);
    expect(wrapper.find('button[data-action="disable"]').exists()).toBe(false);
  });

  it("renders the product Telegram card from its own integration permissions", async () => {
    mocks.permissions = [
      "project.integrations.read",
      "project.integrations.manage",
    ];
    mocks.auth.project.effectivePermissionCodes = [...mocks.permissions];

    const wrapper = mount(ProjectIntegrationsPage);
    await flushPromises();

    expect(mocks.list).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="telegram-card-stub"]').exists()).toBe(
      false,
    );
    expect(wrapper.text()).not.toContain("Slack");
    expect(
      wrapper.get('[data-testid="product-telegram-card-stub"]').attributes(),
    ).toMatchObject({
      "data-project-id": "project-1",
      "data-can-read": "true",
      "data-can-manage": "true",
    });
  });

  it("uses the existing logout redirect flow for product Telegram step-up", async () => {
    mocks.permissions = [
      "project.integrations.read",
      "project.integrations.manage",
    ];
    mocks.auth.project.effectivePermissionCodes = [...mocks.permissions];
    const wrapper = mount(ProjectIntegrationsPage);
    await flushPromises();

    await wrapper
      .get('button[data-action="request-product-telegram-fresh-login"]')
      .trigger("click");
    await flushPromises();

    expect(mocks.auth.logout).toHaveBeenCalledOnce();
    expect(mocks.replace).toHaveBeenCalledWith({
      name: "login",
      query: { redirect: "/settings/integrations" },
    });
  });

  it("creates and tests a destination, then clears the write-only webhook input", async () => {
    const created = destination();
    mocks.createSlack.mockResolvedValue(created);
    mocks.testSlack.mockResolvedValue({
      id: "test-1",
      destinationId: created.id,
      status: "SUCCEEDED",
      errorCode: null,
      finishedAt: "2026-07-23T12:01:00.000Z",
      destinationVersion: 2,
    });
    mocks.list.mockResolvedValueOnce({ items: [] }).mockResolvedValueOnce({
      items: [destination({ version: 2, testedSecretRevision: 1 })],
    });
    const wrapper = mount(ProjectIntegrationsPage);
    await flushPromises();

    await wrapper
      .get('input[name="displayName"]')
      .setValue("Команда поддержки");
    await wrapper
      .get('input[name="webhookUrl"]')
      .setValue("https://hooks.slack.com/services/T/B/secret");
    await wrapper.get('form[data-form="create-slack"]').trigger("submit");
    await flushPromises();

    expect(mocks.createSlack).toHaveBeenCalledWith(
      "project-1",
      {
        displayName: "Команда поддержки",
        webhookUrl: "https://hooks.slack.com/services/T/B/secret",
      },
      expect.any(String),
    );
    expect(mocks.testSlack).toHaveBeenCalledWith(
      "project-1",
      "destination-1",
      1,
      expect.any(String),
    );
    expect(
      (
        wrapper.find('input[name="webhookUrl"]').element as
          HTMLInputElement | undefined
      )?.value ?? "",
    ).toBe("");
    expect(wrapper.text()).toContain("Проверка Slack прошла успешно");
  });

  it("requires successful test before activation and uses the latest server version", async () => {
    mocks.list.mockResolvedValue({
      items: [destination({ version: 4, testedSecretRevision: 1 })],
    });
    mocks.updateSlack.mockResolvedValue(
      destination({ status: "ACTIVE", version: 5 }),
    );
    const wrapper = mount(ProjectIntegrationsPage);
    await flushPromises();

    await wrapper.get('button[data-action="activate"]').trigger("click");
    await flushPromises();

    expect(mocks.updateSlack).toHaveBeenCalledWith(
      "project-1",
      "destination-1",
      {
        expectedVersion: 4,
        desiredStatus: "ACTIVE",
      },
    );
    expect(wrapper.text()).toContain("Slack-уведомления включены");
  });

  it("rotates through PENDING_TEST and never renders the submitted replacement URL", async () => {
    mocks.list.mockResolvedValue({
      items: [destination({ status: "ACTIVE", version: 5 })],
    });
    mocks.updateSlack.mockResolvedValue(
      destination({ status: "PENDING_TEST", version: 6, secretRevision: 2 }),
    );
    mocks.testSlack.mockResolvedValue({
      id: "test-2",
      destinationId: "destination-1",
      status: "SUCCEEDED",
      errorCode: null,
      finishedAt: "2026-07-23T12:02:00.000Z",
      destinationVersion: 7,
    });
    const wrapper = mount(ProjectIntegrationsPage);
    await flushPromises();

    const secret = "https://hooks.slack.com/services/T2/B2/replacement-secret";
    await wrapper.get('input[name="webhookUrl"]').setValue(secret);
    await wrapper.get('form[data-form="rotate-slack"]').trigger("submit");
    await flushPromises();

    expect(mocks.updateSlack).toHaveBeenCalledWith(
      "project-1",
      "destination-1",
      {
        expectedVersion: 5,
        webhookUrl: secret,
      },
    );
    expect(wrapper.html()).not.toContain(secret);
    expect(wrapper.text()).toContain("Новый webhook сохранён и проверен");
  });

  it("reloads stale state after an optimistic concurrency conflict without exposing backend details", async () => {
    mocks.list
      .mockResolvedValueOnce({
        items: [destination({ status: "ACTIVE", version: 5 })],
      })
      .mockResolvedValueOnce({
        items: [destination({ status: "DISABLED", version: 6 })],
      });
    mocks.updateSlack.mockRejectedValue(
      new ApiError(
        409,
        "database row destination-1 already changed by operator-secret@example.com",
        undefined,
        "request-1",
        "NOTIFICATION_DESTINATION_VERSION_CONFLICT",
      ),
    );
    const wrapper = mount(ProjectIntegrationsPage);
    await flushPromises();

    await wrapper.get('button[data-action="disable"]').trigger("click");
    await flushPromises();

    expect(mocks.list).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain(
      "Настройки уже изменились в другой вкладке",
    );
    expect(wrapper.text()).not.toContain("operator-secret@example.com");
    expect(wrapper.text()).toContain("Отключено");
  });

  it("shows an ambiguous test outcome as non-activatable", async () => {
    mocks.list.mockResolvedValue({ items: [destination()] });
    mocks.testSlack.mockResolvedValue({
      id: "test-3",
      destinationId: "destination-1",
      status: "OUTCOME_UNKNOWN",
      errorCode: "SLACK_OUTCOME_UNKNOWN",
      finishedAt: null,
      destinationVersion: 2,
    });
    const wrapper = mount(ProjectIntegrationsPage);
    await flushPromises();

    await wrapper.get('button[data-action="test"]').trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Slack не подтвердил результат проверки");
    expect(wrapper.find('button[data-action="activate"]').exists()).toBe(false);
  });

  it("polls the same durable test command until the worker stores a terminal result", async () => {
    vi.useFakeTimers();
    mocks.list.mockResolvedValue({ items: [destination()] });
    mocks.testSlack
      .mockResolvedValueOnce({
        id: "test-durable",
        destinationId: "destination-1",
        status: "PENDING",
        errorCode: null,
        finishedAt: null,
        destinationVersion: 1,
      })
      .mockResolvedValueOnce({
        id: "test-durable",
        destinationId: "destination-1",
        status: "SUCCEEDED",
        errorCode: null,
        finishedAt: "2026-07-23T12:01:00.000Z",
        destinationVersion: 2,
      });
    const wrapper = mount(ProjectIntegrationsPage);
    await flushPromises();

    await wrapper.get('button[data-action="test"]').trigger("click");
    await flushPromises();
    await vi.advanceTimersByTimeAsync(500);
    await flushPromises();

    expect(mocks.testSlack).toHaveBeenCalledTimes(2);
    expect(mocks.testSlack.mock.calls[0]?.[3]).toEqual(
      mocks.testSlack.mock.calls[1]?.[3],
    );
    expect(wrapper.text()).toContain("Проверка Slack прошла успешно");
    vi.useRealTimers();
  });

  it("preserves the durable command key when polling is resumed later", async () => {
    vi.useFakeTimers();
    mocks.list.mockResolvedValue({ items: [destination()] });
    mocks.testSlack.mockResolvedValue({
      id: "test-slow",
      destinationId: "destination-1",
      status: "RETRY_WAIT",
      errorCode: "SLACK_RATE_LIMITED",
      finishedAt: null,
      destinationVersion: 1,
    });
    const wrapper = mount(ProjectIntegrationsPage);
    await flushPromises();

    const firstRun = wrapper.get('button[data-action="test"]').trigger("click");
    await flushPromises();
    await vi.advanceTimersByTimeAsync(10_000);
    await firstRun;
    await flushPromises();
    expect(wrapper.text()).toContain("Нажмите «Проверить»");

    mocks.testSlack.mockResolvedValueOnce({
      id: "test-slow",
      destinationId: "destination-1",
      status: "FAILED",
      errorCode: "SLACK_TEST_EXHAUSTED",
      finishedAt: "2026-07-23T12:15:00.000Z",
      destinationVersion: 2,
    });
    await wrapper.get('button[data-action="test"]').trigger("click");
    await flushPromises();

    const keys = mocks.testSlack.mock.calls.map((call) => call[3]);
    expect(new Set(keys).size).toBe(1);
    vi.useRealTimers();
  });

  it("reloads the durable pending destination when creation succeeds but testing fails", async () => {
    const submittedSecret = "https://hooks.slack.com/services/T/B/not-rendered";
    mocks.createSlack.mockResolvedValue(destination());
    mocks.testSlack.mockRejectedValue(new Error("network interrupted"));
    mocks.list
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ items: [destination()] });
    const wrapper = mount(ProjectIntegrationsPage);
    await flushPromises();

    await wrapper
      .get('input[name="displayName"]')
      .setValue("Команда поддержки");
    await wrapper.get('input[name="webhookUrl"]').setValue(submittedSecret);
    await wrapper.get('form[data-form="create-slack"]').trigger("submit");
    await flushPromises();

    expect(mocks.list).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain("Требуется проверка");
    expect(wrapper.html()).not.toContain(submittedSecret);
  });

  it("reuses the create idempotency key after an ambiguous client-side failure", async () => {
    mocks.createSlack.mockRejectedValue(new Error("connection reset"));
    const wrapper = mount(ProjectIntegrationsPage);
    await flushPromises();

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await wrapper
        .get('input[name="displayName"]')
        .setValue("Команда поддержки");
      await wrapper
        .get('input[name="webhookUrl"]')
        .setValue("https://hooks.slack.com/services/T/B/retry-secret");
      await wrapper.get('form[data-form="create-slack"]').trigger("submit");
      await flushPromises();
    }

    expect(mocks.createSlack).toHaveBeenCalledTimes(2);
    expect(mocks.createSlack.mock.calls[0]?.[2]).toEqual(
      mocks.createSlack.mock.calls[1]?.[2],
    );
  });

  it("fences a late create response after the operator switches projects", async () => {
    let resolveCreate!: (value: ReturnType<typeof destination>) => void;
    mocks.createSlack.mockReturnValue(
      new Promise((resolve) => {
        resolveCreate = resolve;
      }),
    );
    mocks.list.mockImplementation((selectedProjectId: string) =>
      Promise.resolve({
        items:
          selectedProjectId === "project-2"
            ? [
                destination({
                  id: "destination-2",
                  projectId: "project-2",
                  status: "ACTIVE",
                }),
              ]
            : [],
      }),
    );
    const wrapper = mount(ProjectIntegrationsPage);
    await flushPromises();

    await wrapper.get('input[name="displayName"]').setValue("Команда A");
    await wrapper
      .get('input[name="webhookUrl"]')
      .setValue("https://hooks.slack.com/services/T/B/project-a-secret");
    await wrapper.get('form[data-form="create-slack"]').trigger("submit");
    mocks.auth.project = {
      id: "project-2",
      name: "Project Two",
      effectivePermissionCodes: [...mocks.permissions],
    };
    await flushPromises();
    resolveCreate(destination());
    await flushPromises();

    expect(mocks.testSlack).not.toHaveBeenCalled();
    expect(mocks.list).toHaveBeenCalledWith("project-2");
    expect(wrapper.text()).toContain("Подключено");
    expect(wrapper.text()).not.toContain("Проверка Slack прошла успешно");
  });

  it("does not test a rotated credential after the operator switches projects", async () => {
    let resolveRotation!: (value: ReturnType<typeof destination>) => void;
    mocks.list.mockImplementation((selectedProjectId: string) =>
      Promise.resolve({
        items:
          selectedProjectId === "project-1"
            ? [destination({ status: "ACTIVE", version: 5 })]
            : [
                destination({
                  id: "destination-2",
                  projectId: "project-2",
                  status: "ACTIVE",
                }),
              ],
      }),
    );
    mocks.updateSlack.mockReturnValue(
      new Promise((resolve) => {
        resolveRotation = resolve;
      }),
    );
    const wrapper = mount(ProjectIntegrationsPage);
    await flushPromises();

    await wrapper
      .get('input[name="webhookUrl"]')
      .setValue(
        "https://hooks.slack.com/services/T/B/rotated-project-a-secret",
      );
    await wrapper.get('form[data-form="rotate-slack"]').trigger("submit");
    mocks.auth.project = {
      id: "project-2",
      name: "Project Two",
      effectivePermissionCodes: [...mocks.permissions],
    };
    await flushPromises();
    resolveRotation(
      destination({ status: "PENDING_TEST", version: 6, secretRevision: 2 }),
    );
    await flushPromises();

    expect(mocks.testSlack).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("Подключено");
  });

  it("clears loaded state and fences late operations when read permission is lost", async () => {
    let resolveUpdate!: (value: ReturnType<typeof destination>) => void;
    mocks.list.mockResolvedValue({
      items: [destination({ status: "ACTIVE" })],
    });
    mocks.updateSlack.mockReturnValue(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      }),
    );
    const wrapper = mount(ProjectIntegrationsPage);
    await flushPromises();

    await wrapper.get('button[data-action="disable"]').trigger("click");
    mocks.auth.project.effectivePermissionCodes = [
      "project.notifications.read",
    ];
    await flushPromises();
    resolveUpdate(destination({ status: "DISABLED", version: 2 }));
    await flushPromises();

    expect(wrapper.text()).not.toContain("Slack-уведомления отключены");
    expect(wrapper.find('button[data-action="disable"]').exists()).toBe(false);
    expect(mocks.list).toHaveBeenCalledTimes(2);
  });
});
