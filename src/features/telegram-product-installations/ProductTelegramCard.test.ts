import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/http/api-error";
import ProductTelegramCard from "./ProductTelegramCard.vue";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  create: vi.fn(),
  rotate: vi.fn(),
  disable: vi.fn(),
  setBroadcastsEnabled: vi.fn(),
  test: vi.fn(),
}));

vi.mock("./telegram-product-installations.api", () => ({
  telegramProductInstallationsApi: mocks,
}));

const installation = (overrides: Record<string, unknown> = {}) => ({
  id: "installation-1",
  projectId: "project-1",
  botUsername: "LolaProductBot",
  deepLinkBase: "https://t.me/LolaProductBot",
  telegramBotId: "9007199254740993",
  credentialFingerprint: "a1b2c3d4e5f60708",
  status: "ACTIVE",
  webhookSetupStatus: "SUCCEEDED",
  webhookSetupErrorCode: null,
  healthStatus: "HEALTHY",
  lastTestedAt: "2026-07-23T12:00:00.000Z",
  lastTestFailureCode: null,
  linkedUserCount: 12,
  broadcastsEnabled: false,
  broadcastsVersion: 7,
  updatedByActorType: "CMS_USER",
  updatedByActorId: "operator-1",
  version: 3,
  updatedAt: "2026-07-23T12:00:00.000Z",
  ...overrides,
});

function mountCard(
  props: Partial<{
    projectId: string;
    canRead: boolean;
    canManage: boolean;
  }> = {},
) {
  return mount(ProductTelegramCard, {
    props: {
      projectId: "project-1",
      canRead: true,
      canManage: true,
      ...props,
    },
  });
}

describe("ProductTelegramCard", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    mocks.get.mockResolvedValue(null);
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
  });

  it("renders GET null as an independent empty product-bot setup", async () => {
    const wrapper = mountCard();
    await flushPromises();

    expect(mocks.get).toHaveBeenCalledWith("project-1");
    expect(wrapper.text()).toContain("Telegram · Пользователи продукта");
    expect(wrapper.text()).toContain("Не подключено");
    expect(wrapper.find('form[data-form="create-product-telegram"]').exists()).toBe(
      true,
    );
  });

  it("creates with a durable idempotency key and never echoes the write-only token", async () => {
    const created = installation({ status: "PENDING_SETUP" });
    mocks.create.mockResolvedValue(created);
    mocks.get.mockResolvedValueOnce(null).mockResolvedValue(created);
    const wrapper = mountCard();
    await flushPromises();

    const input = wrapper.get('input[name="productTelegramToken"]');
    await input.setValue("123456789:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    await wrapper.get('form[data-form="create-product-telegram"]').trigger("submit");
    await flushPromises();

    expect(mocks.create).toHaveBeenCalledWith(
      "project-1",
      { botToken: "123456789:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" },
      expect.any(String),
    );
    expect(wrapper.text()).not.toContain(
      "123456789:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    );
    expect(
      (wrapper.get('input[name="productTelegramToken"]').element as HTMLInputElement)
        .value,
    ).toBe("");
  });

  it("polls background webhook setup after create until it becomes terminal", async () => {
    vi.useFakeTimers();
    const pendingSetup = installation({
      status: "PENDING_SETUP",
      webhookSetupStatus: "PENDING",
      healthStatus: "NOT_TESTED",
    });
    mocks.create.mockResolvedValue(pendingSetup);
    mocks.get
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        ...pendingSetup,
        webhookSetupStatus: "PROCESSING",
      })
      .mockResolvedValueOnce({
        ...pendingSetup,
        webhookSetupStatus: "RETRY_WAIT",
      })
      .mockResolvedValueOnce({
        ...pendingSetup,
        status: "ACTIVE",
        webhookSetupStatus: "SUCCEEDED",
        healthStatus: "HEALTHY",
      });
    const wrapper = mountCard();
    await flushPromises();

    await wrapper
      .get('input[name="productTelegramToken"]')
      .setValue("123456789:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    await wrapper
      .get('form[data-form="create-product-telegram"]')
      .trigger("submit");
    await flushPromises();
    await vi.advanceTimersByTimeAsync(1_500);
    await flushPromises();

    expect(mocks.get).toHaveBeenCalledTimes(4);
    expect(wrapper.text()).toContain("SUCCEEDED");
    expect(wrapper.text()).toContain("HEALTHY");
  });

  it("clears an initial load error after create and webhook setup succeed", async () => {
    vi.useFakeTimers();
    const pendingSetup = installation({
      status: "PENDING_SETUP",
      webhookSetupStatus: "PROCESSING",
      healthStatus: "NOT_TESTED",
    });
    mocks.get
      .mockRejectedValueOnce(new Error("initial load failed"))
      .mockResolvedValueOnce({
        ...pendingSetup,
        status: "ACTIVE",
        webhookSetupStatus: "SUCCEEDED",
        healthStatus: "HEALTHY",
      });
    mocks.create.mockResolvedValue(pendingSetup);
    const wrapper = mountCard();
    await flushPromises();
    expect(wrapper.text()).toContain(
      "Не удалось загрузить пользовательский Telegram.",
    );

    await wrapper
      .get('input[name="productTelegramToken"]')
      .setValue("123456789:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    await wrapper
      .get('form[data-form="create-product-telegram"]')
      .trigger("submit");
    await flushPromises();
    await vi.advanceTimersByTimeAsync(500);
    await flushPromises();

    expect(wrapper.text()).toContain("Бот и защищённый webhook подключены.");
    expect(wrapper.text()).not.toContain(
      "Не удалось загрузить пользовательский Telegram.",
    );
  });

  it("keeps loading until the newest retry wins over an out-of-order response", async () => {
    let resolveOlder!: (value: ReturnType<typeof installation>) => void;
    let resolveNewest!: (value: ReturnType<typeof installation>) => void;
    mocks.get
      .mockRejectedValueOnce(new Error("initial load failed"))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOlder = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveNewest = resolve;
          }),
      );
    const wrapper = mountCard();
    await flushPromises();
    const retry = wrapper.get(".feedback.error button");

    void retry.trigger("click");
    void retry.trigger("click");
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).not.toContain(
      "Не удалось загрузить пользовательский Telegram.",
    );
    expect(
      wrapper.find(".feedback.error button").exists(),
    ).toBe(false);

    resolveOlder(
      installation({
        botUsername: "StaleRetryBot",
      }),
    );
    await flushPromises();
    expect(wrapper.text()).toContain("Загружаем product Telegram…");
    expect(wrapper.text()).not.toContain("StaleRetryBot");

    resolveNewest(
      installation({
        botUsername: "NewestRetryBot",
      }),
    );
    await flushPromises();
    expect(wrapper.text()).toContain("NewestRetryBot");
    expect(wrapper.text()).not.toContain("Загружаем product Telegram…");
  });

  it("stops background webhook polling immediately when manage permission is lost", async () => {
    vi.useFakeTimers();
    const pendingSetup = installation({
      status: "PENDING_SETUP",
      webhookSetupStatus: "PROCESSING",
      healthStatus: "NOT_TESTED",
    });
    mocks.get.mockResolvedValueOnce(null).mockResolvedValue(pendingSetup);
    mocks.create.mockResolvedValue(pendingSetup);
    const wrapper = mountCard();
    await flushPromises();

    await wrapper
      .get('input[name="productTelegramToken"]')
      .setValue("123456789:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    await wrapper
      .get('form[data-form="create-product-telegram"]')
      .trigger("submit");
    await flushPromises();
    await wrapper.setProps({ canManage: false });
    await flushPromises();
    await vi.advanceTimersByTimeAsync(2_000);
    await flushPromises();

    expect(mocks.get).toHaveBeenCalledTimes(2);
    expect(wrapper.find('form[data-form="rotate-product-telegram"]').exists()).toBe(
      false,
    );
  });

  it("uses OCC for rotate and disable and requires explicit disable confirmation", async () => {
    const current = installation();
    mocks.get.mockResolvedValue(current);
    mocks.rotate.mockResolvedValue(installation({ version: 4 }));
    mocks.disable.mockResolvedValue(
      installation({ version: 5, status: "DISABLED" }),
    );
    const wrapper = mountCard();
    await flushPromises();

    await wrapper
      .get('input[name="productTelegramToken"]')
      .setValue("123456789:BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB");
    await wrapper
      .get('form[data-form="rotate-product-telegram"]')
      .trigger("submit");
    await flushPromises();
    expect(confirm).toHaveBeenNthCalledWith(
      1,
      "Заменить product bot @LolaProductBot? Подключение другого бота разорвёт активные связи 12 пользователей.",
    );
    expect(mocks.rotate).toHaveBeenCalledWith("project-1", {
      botToken: "123456789:BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
      expectedVersion: 3,
    });

    mocks.get.mockResolvedValue(current);
    await wrapper.get('button[data-action="product-telegram-disable"]').trigger("click");
    await flushPromises();
    expect(confirm).toHaveBeenNthCalledWith(
      2,
      "Отключить product bot @LolaProductBot? Будут разорваны активные связи 12 пользователей.",
    );
    expect(mocks.disable).toHaveBeenCalledWith("project-1", {
      expectedVersion: 4,
    });
  });

  it("changes broadcast delivery with its independent OCC version and idempotency key", async () => {
    const current = installation();
    mocks.get.mockResolvedValue(current);
    mocks.setBroadcastsEnabled.mockResolvedValue(
      installation({ broadcastsEnabled: true, broadcastsVersion: 8 }),
    );
    const wrapper = mountCard();
    await flushPromises();

    const disabledOption = wrapper.get(
      'button[data-action="product-telegram-broadcasts-disable"]',
    );
    const enabledOption = wrapper.get(
      'button[data-action="product-telegram-broadcasts-enable"]',
    );
    expect(disabledOption.attributes("disabled")).toBeDefined();
    expect(enabledOption.attributes("disabled")).toBeUndefined();

    await disabledOption.trigger("click");
    expect(mocks.setBroadcastsEnabled).not.toHaveBeenCalled();

    await enabledOption.trigger("click");
    await flushPromises();

    expect(mocks.setBroadcastsEnabled).toHaveBeenCalledWith(
      "project-1",
      { enabled: true, expectedVersion: 7 },
      expect.any(String),
    );
    expect(wrapper.text()).toContain("Telegram-рассылки включены");
    expect(
      wrapper
        .get('button[data-action="product-telegram-broadcasts-enable"]')
        .attributes("disabled"),
    ).toBeDefined();
  });

  it("requires confirmation before disabling broadcasts and never sends after rejection", async () => {
    mocks.get.mockResolvedValue(
      installation({ broadcastsEnabled: true, broadcastsVersion: 9 }),
    );
    vi.mocked(confirm).mockReturnValue(false);
    const wrapper = mountCard();
    await flushPromises();

    await wrapper
      .get('button[data-action="product-telegram-broadcasts-disable"]')
      .trigger("click");

    expect(confirm).toHaveBeenCalledWith(
      "Отключить Telegram-рассылки? Неотправленные сообщения этой инсталляции будут остановлены.",
    );
    expect(mocks.setBroadcastsEnabled).not.toHaveBeenCalled();
  });

  it("explains readiness and blocks enabling before the product bot is active", async () => {
    mocks.get.mockResolvedValue(
      installation({
        status: "PENDING_SETUP",
        webhookSetupStatus: "PROCESSING",
      }),
    );
    const wrapper = mountCard();
    await flushPromises();

    expect(wrapper.text()).toContain(
      "Рассылки можно включить после активации бота и завершения настройки webhook.",
    );
    expect(
      wrapper
        .get('button[data-action="product-telegram-broadcasts-enable"]')
        .attributes("disabled"),
    ).toBeDefined();
  });

  it("offers fresh login after 428 without replaying the broadcast command", async () => {
    mocks.get.mockResolvedValue(installation());
    mocks.setBroadcastsEnabled.mockRejectedValue(
      new ApiError(
        428,
        "unsafe backend text",
        undefined,
        "step-up-request",
        "MFA_REQUIRED",
      ),
    );
    const wrapper = mountCard();
    await flushPromises();

    await wrapper
      .get('button[data-action="product-telegram-broadcasts-enable"]')
      .trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Требуется свежий вход с MFA");
    expect(wrapper.text()).not.toContain("unsafe backend text");
    expect(mocks.setBroadcastsEnabled).toHaveBeenCalledOnce();

    await wrapper
      .get('button[data-action="product-telegram-broadcasts-fresh-login"]')
      .trigger("click");
    expect(wrapper.emitted("fresh-login-requested")).toHaveLength(1);
    expect(mocks.setBroadcastsEnabled).toHaveBeenCalledOnce();
  });

  it("reuses the command key after an ambiguous failure while the server state is unchanged", async () => {
    const current = installation();
    mocks.get.mockResolvedValue(current);
    mocks.setBroadcastsEnabled
      .mockRejectedValueOnce(new Error("connection lost"))
      .mockResolvedValueOnce(
        installation({ broadcastsEnabled: true, broadcastsVersion: 8 }),
      );
    const wrapper = mountCard();
    await flushPromises();

    await wrapper
      .get('button[data-action="product-telegram-broadcasts-enable"]')
      .trigger("click");
    await flushPromises();
    await wrapper
      .get('button[data-action="product-telegram-broadcasts-enable"]')
      .trigger("click");
    await flushPromises();

    expect(mocks.setBroadcastsEnabled).toHaveBeenCalledTimes(2);
    expect(mocks.setBroadcastsEnabled.mock.calls[0]?.[2]).toBe(
      mocks.setBroadcastsEnabled.mock.calls[1]?.[2],
    );
  });

  it("rejects a broadcast response after project switch and resets command state", async () => {
    let resolveBroadcasts!: (value: ReturnType<typeof installation>) => void;
    mocks.get
      .mockResolvedValueOnce(installation())
      .mockResolvedValueOnce(
        installation({
          id: "installation-2",
          projectId: "project-2",
          botUsername: "ProjectTwoBot",
          broadcastsVersion: 2,
        }),
      );
    mocks.setBroadcastsEnabled.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveBroadcasts = resolve;
        }),
    );
    const wrapper = mountCard();
    await flushPromises();

    void wrapper
      .get('button[data-action="product-telegram-broadcasts-enable"]')
      .trigger("click");
    await flushPromises();
    await wrapper.setProps({ projectId: "project-2" });
    await flushPromises();
    resolveBroadcasts(
      installation({
        broadcastsEnabled: true,
        broadcastsVersion: 8,
        botUsername: "StaleProjectOneBot",
      }),
    );
    await flushPromises();

    expect(wrapper.text()).toContain("ProjectTwoBot");
    expect(wrapper.text()).not.toContain("StaleProjectOneBot");
    expect(wrapper.text()).not.toContain("Telegram-рассылки включены");
    expect(
      wrapper
        .get('button[data-action="product-telegram-broadcasts-enable"]')
        .attributes("disabled"),
    ).toBeUndefined();
  });

  it("rejects a broadcast response after manage permission is lost", async () => {
    let resolveBroadcasts!: (value: ReturnType<typeof installation>) => void;
    mocks.get.mockResolvedValue(installation());
    mocks.setBroadcastsEnabled.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveBroadcasts = resolve;
        }),
    );
    const wrapper = mountCard();
    await flushPromises();

    void wrapper
      .get('button[data-action="product-telegram-broadcasts-enable"]')
      .trigger("click");
    await flushPromises();
    await wrapper.setProps({ canManage: false });
    await flushPromises();
    resolveBroadcasts(
      installation({ broadcastsEnabled: true, broadcastsVersion: 8 }),
    );
    await flushPromises();

    expect(wrapper.text()).toContain("только для просмотра");
    expect(wrapper.text()).not.toContain("Telegram-рассылки включены.");
    expect(
      wrapper.find(
        'button[data-action="product-telegram-broadcasts-enable"]',
      ).exists(),
    ).toBe(false);
  });

  it("polls background webhook setup after rotation without overlapping refreshes", async () => {
    vi.useFakeTimers();
    let activeReads = 0;
    let maximumActiveReads = 0;
    const current = installation();
    const pendingSetup = installation({
      version: 4,
      status: "PENDING_SETUP",
      webhookSetupStatus: "PENDING",
      healthStatus: "NOT_TESTED",
    });
    const reads = [
      current,
      { ...pendingSetup, webhookSetupStatus: "PROCESSING" },
      { ...pendingSetup, webhookSetupStatus: "RETRY_WAIT" },
      {
        ...pendingSetup,
        status: "ACTIVE",
        webhookSetupStatus: "SUCCEEDED",
        healthStatus: "HEALTHY",
      },
    ];
    mocks.get.mockImplementation(async () => {
      activeReads += 1;
      maximumActiveReads = Math.max(maximumActiveReads, activeReads);
      const next = reads.shift() ?? reads.at(-1);
      await Promise.resolve();
      activeReads -= 1;
      return next;
    });
    mocks.rotate.mockResolvedValue(pendingSetup);
    const wrapper = mountCard();
    await flushPromises();

    await wrapper
      .get('input[name="productTelegramToken"]')
      .setValue("123456789:BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB");
    await wrapper
      .get('form[data-form="rotate-product-telegram"]')
      .trigger("submit");
    await flushPromises();
    await vi.advanceTimersByTimeAsync(1_500);
    await flushPromises();

    expect(mocks.get).toHaveBeenCalledTimes(4);
    expect(maximumActiveReads).toBe(1);
    expect(wrapper.text()).toContain("SUCCEEDED");
    expect(wrapper.text()).toContain("HEALTHY");
  });

  it("polls a durable test with one idempotency key and displays safe failure copy", async () => {
    vi.useFakeTimers();
    const current = installation();
    mocks.get.mockResolvedValue(current);
    mocks.test
      .mockResolvedValueOnce({
        id: "test-1",
        installationVersion: 3,
        status: "PROCESSING",
        errorCode: null,
        finishedAt: null,
        createdAt: "2026-07-23T12:00:00.000Z",
      })
      .mockResolvedValueOnce({
        id: "test-1",
        installationVersion: 3,
        status: "FAILED",
        errorCode: "provider raw error must not leak",
        finishedAt: "2026-07-23T12:01:00.000Z",
        createdAt: "2026-07-23T12:00:00.000Z",
      });
    const wrapper = mountCard();
    await flushPromises();

    await wrapper
      .get('button[data-action="product-telegram-test"]')
      .trigger("click");
    await vi.advanceTimersByTimeAsync(500);
    await flushPromises();

    const firstKey = mocks.test.mock.calls[0]?.[3];
    expect(mocks.test).toHaveBeenNthCalledWith(
      2,
      "project-1",
      "installation-1",
      { expectedVersion: 3 },
      firstKey,
    );
    expect(wrapper.text()).toContain("Подключение требует проверки");
    expect(wrapper.text()).not.toContain("provider raw error must not leak");
  });

  it("treats TELEGRAM_CHANNEL_DISABLED as an intentional terminal state", async () => {
    mocks.get
      .mockResolvedValueOnce(installation())
      .mockResolvedValueOnce(
        installation({
          status: "DISABLED",
          lastTestFailureCode: "TELEGRAM_CHANNEL_DISABLED",
        }),
      );
    mocks.test.mockRejectedValue(
      new ApiError(
        409,
        "raw provider details must stay hidden",
        undefined,
        "request-1",
        "TELEGRAM_CHANNEL_DISABLED",
      ),
    );
    const wrapper = mountCard();
    await flushPromises();

    await wrapper
      .get('button[data-action="product-telegram-test"]')
      .trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Пользовательский Telegram уже отключён.");
    expect(wrapper.text()).toContain("Отключено администратором");
    expect(wrapper.text()).not.toContain("Подключение требует проверки");
    expect(wrapper.text()).not.toContain("raw provider details");
  });

  it("refreshes exactly once after an optimistic concurrency conflict", async () => {
    mocks.get.mockResolvedValue(installation());
    mocks.disable.mockRejectedValue(
      new ApiError(
        409,
        "stale version",
        undefined,
        "request-conflict",
        "TELEGRAM_CHANNEL_VERSION_CONFLICT",
      ),
    );
    const wrapper = mountCard();
    await flushPromises();

    await wrapper
      .get('button[data-action="product-telegram-disable"]')
      .trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain(
      "Настройки изменились в другой вкладке. Данные обновлены.",
    );
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });

  it("stops durable test polling and skips the final refresh after unmount", async () => {
    vi.useFakeTimers();
    mocks.get.mockResolvedValue(installation());
    mocks.test.mockResolvedValue({
      id: "test-unmounted",
      installationVersion: 3,
      status: "PROCESSING",
      errorCode: null,
      finishedAt: null,
      createdAt: "2026-07-23T12:00:00.000Z",
    });
    const wrapper = mountCard();
    await flushPromises();

    await wrapper
      .get('button[data-action="product-telegram-test"]')
      .trigger("click");
    await flushPromises();
    wrapper.unmount();
    await vi.advanceTimersByTimeAsync(2_000);
    await flushPromises();

    expect(mocks.test).toHaveBeenCalledTimes(1);
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });

  it("fences stale project responses and clears secrets on project switch", async () => {
    mocks.get.mockResolvedValueOnce(null);
    const wrapper = mountCard();
    await flushPromises();
    await wrapper
      .get('input[name="productTelegramToken"]')
      .setValue("secret-for-project-one");

    let resolveProjectTwo!: (value: ReturnType<typeof installation>) => void;
    mocks.get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveProjectTwo = resolve;
        }),
    );
    mocks.get.mockResolvedValueOnce(
      installation({
        id: "installation-3",
        projectId: "project-3",
        botUsername: "ProjectThreeBot",
      }),
    );
    await wrapper.setProps({ projectId: "project-2" });
    await wrapper.setProps({ projectId: "project-3" });
    await flushPromises();
    resolveProjectTwo(
      installation({
        projectId: "project-2",
        botUsername: "StaleProjectTwoBot",
      }),
    );
    await flushPromises();

    expect(wrapper.text()).toContain("ProjectThreeBot");
    expect(wrapper.text()).not.toContain("StaleProjectTwoBot");
    expect(wrapper.text()).not.toContain("secret-for-project-one");
  });

  it("does not let a stale action finally clear the current project's pending state", async () => {
    let resolveStaleRefresh!: (
      value: ReturnType<typeof installation>,
    ) => void;
    let resolveCurrentTest!: (value: {
      id: string;
      installationVersion: number;
      status: "SUCCEEDED";
      errorCode: null;
      finishedAt: string;
      createdAt: string;
    }) => void;
    mocks.get
      .mockResolvedValueOnce(installation())
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveStaleRefresh = resolve;
          }),
      )
      .mockResolvedValueOnce(
        installation({
          id: "installation-2",
          projectId: "project-2",
          botUsername: "ProjectTwoBot",
        }),
      );
    mocks.test
      .mockResolvedValueOnce({
        id: "test-project-1",
        installationVersion: 3,
        status: "SUCCEEDED",
        errorCode: null,
        finishedAt: "2026-07-23T12:01:00.000Z",
        createdAt: "2026-07-23T12:00:00.000Z",
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveCurrentTest = resolve;
          }),
      );
    const wrapper = mountCard();
    await flushPromises();

    await wrapper
      .get('button[data-action="product-telegram-test"]')
      .trigger("click");
    await flushPromises();
    await wrapper.setProps({ projectId: "project-2" });
    await flushPromises();
    await wrapper
      .get('button[data-action="product-telegram-test"]')
      .trigger("click");
    await flushPromises();

    resolveStaleRefresh(installation());
    await flushPromises();
    expect(
      wrapper
        .get('button[data-action="product-telegram-test"]')
        .attributes("disabled"),
    ).toBeDefined();

    resolveCurrentTest({
      id: "test-project-2",
      installationVersion: 3,
      status: "SUCCEEDED",
      errorCode: null,
      finishedAt: "2026-07-23T12:02:00.000Z",
      createdAt: "2026-07-23T12:00:00.000Z",
    });
    await flushPromises();
  });

  it("becomes read-only immediately on manage loss and resets on read loss", async () => {
    mocks.get.mockResolvedValue(installation());
    const wrapper = mountCard();
    await flushPromises();
    expect(wrapper.find('form[data-form="rotate-product-telegram"]').exists()).toBe(
      true,
    );

    await wrapper.setProps({ canManage: false });
    await flushPromises();
    expect(wrapper.find('form[data-form="rotate-product-telegram"]').exists()).toBe(
      false,
    );
    expect(wrapper.text()).toContain("только для просмотра");

    await wrapper.setProps({ canRead: false });
    await flushPromises();
    expect(wrapper.text()).not.toContain("LolaProductBot");
  });
});
