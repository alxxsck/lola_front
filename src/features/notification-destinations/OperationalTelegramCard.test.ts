import { flushPromises, mount } from "@vue/test-utils";
import { reactive } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationDestinationResponseDto } from "@/shared/api/generated/models";
import OperationalTelegramCard from "./OperationalTelegramCard.vue";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  createOperationalTelegram: vi.fn(),
  updateOperationalTelegram: vi.fn(),
  createTelegramBindingChallenge: vi.fn(),
  testOperationalTelegram: vi.fn(),
}));

vi.mock("./notification-destinations.api", () => ({
  notificationDestinationsApi: mocks,
}));

const telegramDestination = (
  overrides: Partial<NotificationDestinationResponseDto> = {},
): NotificationDestinationResponseDto => ({
  id: "telegram-destination-1",
  projectId: "project-1",
  topic: "AI_PROPOSALS",
  channel: "TELEGRAM_OPERATIONAL",
  displayName: "Служебные уведомления",
  status: "PENDING_TEST",
  credentialFingerprint: "0123456789abcdef",
  secretRevision: 1,
  routingRevision: 1,
  testedSecretRevision: null,
  testedRoutingRevision: null,
  lastSuccessfulTestAt: null,
  lastFailureCategory: null,
  version: 1,
  updatedByActorType: "CMS_USER",
  updatedByActorId: "operator-1",
  updatedAt: "2026-07-23T12:00:00.000Z",
  botUsername: "LolaOpsBot",
  telegramBotId: "10001",
  destinationChatId: null,
  destinationTitle: null,
  telegramInstallationStatus: "PENDING_BINDING",
  telegramWebhookSetupStatus: "SUCCEEDED",
  ...overrides,
});

describe("OperationalTelegramCard", () => {
  beforeEach(() => {
    mocks.list.mockReset();
    mocks.createOperationalTelegram.mockReset();
    mocks.updateOperationalTelegram.mockReset();
    mocks.createTelegramBindingChallenge.mockReset();
    mocks.testOperationalTelegram.mockReset();
    vi.useRealTimers();
    mocks.list.mockResolvedValue({ items: [] });
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
  });

  it("validates a write-only token and shows a one-time chat binding command", async () => {
    const created = telegramDestination();
    mocks.createOperationalTelegram.mockResolvedValue(created);
    mocks.createTelegramBindingChallenge.mockResolvedValue({
      id: "challenge-1",
      command: "/connect AbCdEf1234567890abcd",
      expiresAt: "2026-07-23T12:05:00.000Z",
      botUsername: "LolaOpsBot",
    });
    mocks.list
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ items: [created] });
    const wrapper = mount(OperationalTelegramCard, {
      props: { projectId: "project-1", canRead: true, canManage: true },
    });
    await flushPromises();

    const token = `123456789:${"A".repeat(32)}`;
    await wrapper
      .get('input[name="telegramDisplayName"]')
      .setValue("Operations");
    await wrapper.get('input[name="telegramBotToken"]').setValue(token);
    await wrapper.get('form[data-form="create-telegram"]').trigger("submit");
    await flushPromises();

    expect(mocks.createOperationalTelegram).toHaveBeenCalledWith(
      "project-1",
      { displayName: "Operations", botToken: token },
      expect.any(String),
    );
    expect(mocks.createTelegramBindingChallenge).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("регистрирует защищённый webhook");
    await wrapper
      .get('button[data-action="telegram-new-challenge"]')
      .trigger("click");
    await flushPromises();
    expect(mocks.createTelegramBindingChallenge).toHaveBeenCalledWith(
      "project-1",
      created.id,
      created.version,
    );
    expect(wrapper.text()).toContain("/connect AbCdEf1234567890abcd");
    expect(wrapper.text()).toContain("не пишет пользователям продукта");
    expect(wrapper.html()).not.toContain(token);
  });

  it("waits for durable webhook setup before offering a binding challenge", async () => {
    const settingUp = telegramDestination({
      telegramWebhookSetupStatus: "PROCESSING",
    });
    const ready = telegramDestination({
      telegramWebhookSetupStatus: "SUCCEEDED",
    });
    mocks.list
      .mockResolvedValueOnce({ items: [settingUp] })
      .mockResolvedValueOnce({ items: [ready] });
    const wrapper = mount(OperationalTelegramCard, {
      props: { projectId: "project-1", canRead: true, canManage: true },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("Регистрируем защищённый webhook");
    expect(
      wrapper.find('button[data-action="telegram-new-challenge"]').exists(),
    ).toBe(false);
    await wrapper
      .get('button[data-action="telegram-refresh-binding"]')
      .trigger("click");
    await flushPromises();

    expect(
      wrapper.find('button[data-action="telegram-new-challenge"]').exists(),
    ).toBe(true);
    expect(mocks.createTelegramBindingChallenge).not.toHaveBeenCalled();
  });

  it("clears an old challenge and waits for webhook setup after token rotation", async () => {
    const current = telegramDestination();
    const rotated = telegramDestination({
      version: 2,
      secretRevision: 2,
      routingRevision: 2,
      telegramWebhookSetupStatus: "PENDING",
    });
    mocks.list
      .mockResolvedValueOnce({ items: [current] })
      .mockResolvedValueOnce({ items: [rotated] });
    mocks.createTelegramBindingChallenge.mockResolvedValue({
      id: "old-challenge",
      command: "/connect old-invalid-command",
      expiresAt: "2026-07-23T12:05:00.000Z",
      botUsername: "LolaOpsBot",
    });
    mocks.updateOperationalTelegram.mockResolvedValue(rotated);
    const wrapper = mount(OperationalTelegramCard, {
      props: { projectId: "project-1", canRead: true, canManage: true },
    });
    await flushPromises();

    await wrapper
      .get('button[data-action="telegram-new-challenge"]')
      .trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("/connect old-invalid-command");

    const replacementToken = `987654321:${"B".repeat(32)}`;
    await wrapper
      .get('input[name="telegramBotToken"]')
      .setValue(replacementToken);
    await wrapper.get('form[data-form="rotate-telegram"]').trigger("submit");
    await flushPromises();

    expect(mocks.updateOperationalTelegram).toHaveBeenCalledWith(
      "project-1",
      current.id,
      { expectedVersion: current.version, botToken: replacementToken },
    );
    expect(mocks.createTelegramBindingChallenge).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).not.toContain("old-invalid-command");
    expect(wrapper.text()).toContain("Регистрируем защищённый webhook");
    expect(
      wrapper.find('button[data-action="telegram-new-challenge"]').exists(),
    ).toBe(false);
  });

  it("tests a bound chat with one durable key and activates only the tested route", async () => {
    const bound = telegramDestination({
      routingRevision: 2,
      version: 2,
      destinationChatId: "-100123",
      destinationTitle: "Lola Ops",
      telegramInstallationStatus: "BOUND",
    });
    const tested = telegramDestination({
      ...bound,
      version: 3,
      testedSecretRevision: 1,
      testedRoutingRevision: 2,
      lastSuccessfulTestAt: "2026-07-23T12:01:00.000Z",
    });
    mocks.list
      .mockResolvedValueOnce({ items: [bound] })
      .mockResolvedValueOnce({ items: [tested] });
    mocks.testOperationalTelegram.mockResolvedValue({
      id: "test-1",
      destinationId: bound.id,
      status: "SUCCEEDED",
      errorCode: null,
      finishedAt: "2026-07-23T12:01:00.000Z",
      destinationVersion: 2,
    });
    mocks.updateOperationalTelegram.mockResolvedValue(
      telegramDestination({ ...tested, status: "ACTIVE", version: 4 }),
    );
    const wrapper = mount(OperationalTelegramCard, {
      props: { projectId: "project-1", canRead: true, canManage: true },
    });
    await flushPromises();

    await wrapper.get('button[data-action="telegram-test"]').trigger("click");
    await flushPromises();
    expect(mocks.testOperationalTelegram).toHaveBeenCalledWith(
      "project-1",
      bound.id,
      bound.version,
      expect.any(String),
    );
    await wrapper
      .get('button[data-action="telegram-activate"]')
      .trigger("click");
    await flushPromises();
    expect(mocks.updateOperationalTelegram).toHaveBeenCalledWith(
      "project-1",
      bound.id,
      {
        expectedVersion: 3,
        desiredStatus: "ACTIVE",
      },
    );
  });

  it("keeps token controls hidden for a read-only operator", async () => {
    mocks.list.mockResolvedValue({
      items: [
        telegramDestination({
          status: "ACTIVE",
          destinationChatId: "-100123",
          destinationTitle: "Lola Ops",
          telegramInstallationStatus: "BOUND",
        }),
      ],
    });
    const wrapper = mount(OperationalTelegramCard, {
      props: { projectId: "project-1", canRead: true, canManage: false },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("Lola Ops");
    expect(wrapper.find('input[name="telegramBotToken"]').exists()).toBe(false);
    expect(
      wrapper.find('button[data-action="telegram-disable"]').exists(),
    ).toBe(false);
  });

  it("shows safe operational identity, failure and update metadata", async () => {
    mocks.list.mockResolvedValue({
      items: [
        telegramDestination({
          status: "INVALID",
          lastFailureCategory: "TELEGRAM_DESTINATION_UNAVAILABLE",
          updatedByActorType: "CMS_USER",
          updatedByActorId: "operator-42",
          updatedAt: "2026-07-23T12:00:00.000Z",
        }),
      ],
    });
    const wrapper = mount(OperationalTelegramCard, {
      props: { projectId: "project-1", canRead: true, canManage: false },
    });
    await flushPromises();

    expect(wrapper.get('[data-field="telegram-bot-id"]').text()).toContain(
      "10001",
    );
    expect(
      wrapper.get('[data-field="telegram-last-failure"]').text(),
    ).toContain("Чат недоступен или бот заблокирован");
    expect(wrapper.get('[data-field="telegram-updated-by"]').text()).toContain(
      "Пользователь · operator-42",
    );
    expect(
      wrapper.get('[data-field="telegram-updated-at"]').text(),
    ).not.toContain("—");
    expect(wrapper.text()).not.toContain("TELEGRAM_DESTINATION_UNAVAILABLE");
  });

  it("drops a late response after the selected Project changes", async () => {
    let resolveList!: (value: {
      items: ReturnType<typeof telegramDestination>[];
    }) => void;
    mocks.list.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveList = resolve;
      }),
    );
    const props = reactive({
      projectId: "project-1",
      canRead: true,
      canManage: true,
    });
    const wrapper = mount(OperationalTelegramCard, { props });
    await flushPromises();
    await wrapper.setProps({ projectId: "project-2" });
    mocks.list.mockResolvedValueOnce({ items: [] });
    resolveList({ items: [telegramDestination()] });
    await flushPromises();

    expect(wrapper.text()).toContain("Не подключено");
    expect(wrapper.text()).not.toContain("@LolaOpsBot");
  });

  it("drops a late binding challenge after the selected Project changes", async () => {
    const current = telegramDestination();
    let resolveChallenge!: (value: {
      id: string;
      command: string;
      expiresAt: string;
      botUsername: string;
    }) => void;
    mocks.list
      .mockResolvedValueOnce({ items: [current] })
      .mockResolvedValueOnce({ items: [] });
    mocks.createTelegramBindingChallenge.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveChallenge = resolve;
      }),
    );
    const wrapper = mount(OperationalTelegramCard, {
      props: { projectId: "project-1", canRead: true, canManage: true },
    });
    await flushPromises();

    await wrapper
      .get('button[data-action="telegram-new-challenge"]')
      .trigger("click");
    await wrapper.setProps({ projectId: "project-2" });
    resolveChallenge({
      id: "late-challenge",
      command: "/connect late-project-one-command",
      expiresAt: "2026-07-23T12:05:00.000Z",
      botUsername: "LolaOpsBot",
    });
    await flushPromises();

    expect(wrapper.text()).toContain("Не подключено");
    expect(wrapper.text()).not.toContain("late-project-one-command");
    expect(wrapper.text()).not.toContain("@LolaOpsBot");
  });

  it("drops a late destination update after the selected Project changes", async () => {
    const active = telegramDestination({
      status: "ACTIVE",
      destinationChatId: "-100123",
      destinationTitle: "Project One Ops",
      telegramInstallationStatus: "BOUND",
    });
    let resolveUpdate!: (value: ReturnType<typeof telegramDestination>) => void;
    mocks.list
      .mockResolvedValueOnce({ items: [active] })
      .mockResolvedValueOnce({ items: [] });
    mocks.updateOperationalTelegram.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      }),
    );
    const wrapper = mount(OperationalTelegramCard, {
      props: { projectId: "project-1", canRead: true, canManage: true },
    });
    await flushPromises();

    await wrapper
      .get('button[data-action="telegram-disable"]')
      .trigger("click");
    await wrapper.setProps({ projectId: "project-2" });
    resolveUpdate(
      telegramDestination({
        status: "DISABLED",
        version: 2,
        destinationChatId: "-100123",
        destinationTitle: "Project One Ops",
        telegramInstallationStatus: "BOUND",
      }),
    );
    await flushPromises();

    expect(wrapper.text()).toContain("Не подключено");
    expect(wrapper.text()).not.toContain("Project One Ops");
    expect(wrapper.text()).not.toContain(
      "Служебные Telegram-уведомления отключены.",
    );
  });
});
