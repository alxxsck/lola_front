import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UserWorkspaceDialog from "./UserWorkspaceDialog.vue";
import { conversationTranslationApi } from "@/features/conversation-translation/api/conversation-translation.api";
import ConversationTranslationBanner from "@/features/conversation-translation/ui/ConversationTranslationBanner.vue";
import ReplyTranslationPreview from "@/features/conversation-translation/ui/ReplyTranslationPreview.vue";
import type { ConversationTranslationResponseDto } from "@/shared/api/generated/models";

const mocks = vi.hoisted(() => ({
  getConversations: vi.fn(),
  getConversation: vi.fn(),
  getMessages: vi.fn(),
  getSessions: vi.fn(),
  sendAdminMessage: vi.fn(),
  profile: vi.fn(),
  activateProject: vi.fn(),
  watchConversation: vi.fn(),
  unwatchConversation: vi.fn(),
  subscribe: vi.fn(),
  onState: vi.fn(),
  reconcile: vi.fn(),
  updateVisible: vi.fn(),
  messageHandler: undefined as ((value: unknown) => void) | undefined,
  translationHandler: undefined as ((value: unknown) => void) | undefined,
  stateHandler: undefined as ((value: string) => void) | undefined,
  reconcileHandler: undefined as (() => Promise<void>) | undefined,
  toastAdd: vi.fn(),
  permissions: [
    "project.profiles.read",
    "project.end_users.read",
    "project.conversations.read",
    "project.conversations.reply",
    "project.conversations.ai_suspend",
    "project.ai_usage.read",
  ],
}));

vi.mock("@/features/auth/auth.store", () => ({
  useAuthStore: () => ({
    project: {
      effectivePermissionCodes: mocks.permissions,
    },
  }),
}));
vi.mock("@/features/end-user-profile/api/end-user-profile-repository", () => ({
  endUserProfileRepository: { profile: mocks.profile },
}));
vi.mock("@/shared/api/repository", () => ({
  repository: {
    getConversations: mocks.getConversations,
    getConversation: mocks.getConversation,
    getMessages: mocks.getMessages,
    getSessions: mocks.getSessions,
    sendAdminMessage: mocks.sendAdminMessage,
  },
}));
vi.mock(
  "@/features/conversation-ai-suspension/model/conversation-ai-suspension.store",
  () => ({
    useConversationAISuspensionStore: () => ({
      ingestConversations: vi.fn(),
      loadDetail: vi.fn(),
      getEntry: vi.fn(),
      applyConfirmedState: vi.fn(),
      start: vi.fn(),
      extend: vi.fn(),
      resume: vi.fn(),
    }),
  }),
);
vi.mock("@/shared/realtime/cms-realtime-client", () => ({
  cmsRealtimeClient: {
    activateProject: mocks.activateProject,
    watchConversation: mocks.watchConversation,
    unwatchConversation: mocks.unwatchConversation,
    subscribe: mocks.subscribe,
    onState: mocks.onState,
    reconcile: mocks.reconcile,
  },
}));
vi.mock("primevue/usetoast", () => ({
  useToast: () => ({ add: mocks.toastAdd }),
}));

const automatic = {
  mode: "AUTOMATIC" as const,
  lifecycle: "NONE" as const,
  version: "0",
  suspendedUntil: null,
  serverTime: "2026-07-20T13:00:00.000Z",
};
const current = {
  id: "conversation-current",
  userId: "user-1",
  title: "Текущий разговор",
  status: "ACTIVE" as const,
  lastMessageAt: "2026-07-20T13:00:00.000Z",
  messageCount: 2,
  isCurrent: true,
  currentInteractionSessionCount: 1,
  aiSuspension: automatic,
};

function translationState(
  enabled: boolean,
): ConversationTranslationResponseDto {
  return {
    availability: { available: true, reason: null },
    budget: {
      consumedMicros: "0",
      hardExhausted: false,
      hardLimitMicros: null,
      hardPercent: null,
      reservedMicros: "0",
      softLimitMicros: null,
      softPercent: null,
    },
    configRevision: "translation-config-1",
    supportedLocales: ["ru", "de", "en"],
    language: { locale: "de", needsConfirmation: false, source: "PROFILE" },
    preference: {
      enabled,
      endUserLocaleOverride: null,
      updatedAt: "2026-07-30T10:00:00.000Z",
      version: 1,
      workingLocale: "ru",
    },
    projectVersion: 1,
  };
}

describe("единое рабочее пространство пользователя", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    document.body.classList.remove("workspace-scroll-locked");
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: vi.fn(),
    });
    vi.clearAllMocks();
    mocks.permissions.splice(
      0,
      mocks.permissions.length,
      "project.profiles.read",
      "project.end_users.read",
      "project.conversations.read",
      "project.conversations.reply",
      "project.conversations.ai_suspend",
      "project.ai_usage.read",
    );
    mocks.messageHandler = undefined;
    mocks.translationHandler = undefined;
    mocks.stateHandler = undefined;
    mocks.reconcileHandler = undefined;
    mocks.subscribe.mockImplementation(
      (events: string[], handler: (value: unknown) => void) => {
        if (events.includes("conversation.message.translation.upserted.v1")) {
          mocks.translationHandler = handler;
        } else {
          mocks.messageHandler = handler;
        }
        return vi.fn();
      },
    );
    mocks.reconcile.mockImplementation((handler: () => Promise<void>) => {
      mocks.reconcileHandler = handler;
      return vi.fn();
    });
    mocks.onState.mockImplementation((handler: (state: string) => void) => {
      mocks.stateHandler = handler;
      handler("CONNECTED");
      return vi.fn();
    });
    mocks.activateProject.mockResolvedValue(undefined);
    mocks.profile.mockResolvedValue({
      endUserId: "user-1",
      externalUserId: "customer-1",
      profileVersion: "8",
      syncStatus: "VALID",
      fields: [],
      observedAt: "2026-07-20T12:00:00.000Z",
      receivedAt: "2026-07-20T12:00:00.000Z",
      ageSeconds: 60,
      contractRevision: 1,
      publicationId: "publication-12",
      publicationSequence: 12,
      provenance: "PRODUCT_PROFILE",
    });
    mocks.getConversations.mockResolvedValue({
      items: [current],
      nextCursor: null,
    });
    mocks.getSessions.mockResolvedValue([
      {
        id: "session-1",
        userId: "user-1",
        externalId: "customer-1",
        userName: "Customer",
        device: "Web",
        status: "ONLINE",
        startedAt: automatic.serverTime,
        lastSeenAt: automatic.serverTime,
      },
    ]);
    mocks.getMessages.mockResolvedValue({
      items: [
        {
          id: "user-message",
          conversationId: current.id,
          author: "USER",
          status: "COMPLETED",
          text: "Сообщение пользователя",
          createdAt: "2026-07-20T12:59:00.000Z",
        },
        {
          id: "operator-message",
          conversationId: current.id,
          author: "ADMIN",
          status: "COMPLETED",
          text: "Ответ оператора",
          createdAt: "2026-07-20T13:00:00.000Z",
        },
      ],
      nextCursor: "older",
    });
  });

  function mountWorkspace(preferredConversationId?: string) {
    return mount(UserWorkspaceDialog, {
      props: {
        visible: true,
        projectId: "project-1",
        endUserId: "user-1",
        externalUserId: "customer-1",
        preferredConversationId,
        "onUpdate:visible": mocks.updateVisible,
      },
      global: {
        stubs: {
          Dialog: {
            props: ["blockScroll"],
            emits: ["update:visible"],
            template:
              '<section :data-block-scroll="String(blockScroll)"><button data-action="close-dialog" @click="$emit(\'update:visible\', false)">close</button><slot name="header"/><slot/></section>',
          },
          Button: {
            props: ["label"],
            emits: ["click"],
            template:
              '<button type="button" @click="$emit(\'click\')">{{ label }}<slot/></button>',
          },
          Textarea: {
            props: ["modelValue"],
            emits: ["update:modelValue"],
            template:
              '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
          },
          Select: {
            props: ["modelValue", "options"],
            emits: ["update:modelValue"],
            template:
              '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="option in options" :key="String(option.value)" :value="option.value">{{ option.label }}</option></select>',
          },
          ToggleSwitch: {
            props: ["modelValue"],
            emits: ["update:modelValue"],
            template:
              '<input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" />',
          },
          Tag: { props: ["value"], template: "<span>{{ value }}</span>" },
          Skeleton: { template: "<span />" },
          Message: { template: "<div><slot /></div>" },
          ConversationAISuspensionBanner: true,
          ConversationAISuspensionDialog: true,
          ConversationAISuspensionHistory: true,
          EndUserProfileSyncHistory: {
            props: ["projectId", "endUserId"],
            template:
              '<div data-testid="profile-sync-history" :data-project-id="projectId" :data-end-user-id="endUserId" />',
          },
          EndUserTelegramPanel: {
            props: ["visible", "projectId", "endUserId", "canRead", "canSend"],
            emits: ["dirty-change"],
            template:
              '<div v-if="canRead" data-testid="end-user-telegram-panel" :data-project-id="projectId" :data-end-user-id="endUserId" :data-visible="String(visible)" :data-can-send="String(canSend)"><button data-action="telegram-draft-dirty" @click="$emit(\'dirty-change\', true)">dirty</button></div>',
          },
          UserMemoryPanel: {
            template: '<div data-testid="user-memory-panel" />',
          },
          EndUserAiUsageCard: {
            props: ["projectId", "endUserId"],
            template:
              '<div data-testid="end-user-ai-usage" :data-project-id="projectId" :data-end-user-id="endUserId" />',
          },
          AIReviewDialog: true,
        },
      },
    });
  }

  it("shows the independently authorized Telegram panel in the profile workspace", async () => {
    mocks.permissions.push("project.telegram.links.read");
    const wrapper = mountWorkspace();
    await flushPromises();

    const panel = wrapper.get('[data-testid="end-user-telegram-panel"]');
    expect(panel.attributes()).toMatchObject({
      "data-project-id": "project-1",
      "data-end-user-id": "user-1",
      "data-visible": "true",
    });
  });

  it("opens as a spacious profile overview and moves chat behind an explicit action", async () => {
    const wrapper = mountWorkspace();
    await flushPromises();

    expect(wrapper.get('[data-testid="profile-overview"]')).toBeTruthy();
    expect(wrapper.text()).toContain("Контракт полей");
    expect(wrapper.text()).toContain("v1");
    expect(wrapper.text()).toContain("Публикация настроек");
    expect(wrapper.text()).toContain("#12");
    expect(
      wrapper.get('[data-testid="end-user-ai-usage"]').attributes(),
    ).toMatchObject({
      "data-project-id": "project-1",
      "data-end-user-id": "user-1",
    });
    expect(wrapper.text()).not.toContain("Сообщение пользователя");

    await wrapper.get('[data-action="open-chat"]').trigger("click");
    await flushPromises();
    expect(wrapper.get('[data-testid="chat-workspace"]')).toBeTruthy();
    expect(wrapper.text()).toContain("Сообщение пользователя");

    await wrapper.get('[data-action="open-profile"]').trigger("click");
    expect(wrapper.get('[data-testid="profile-overview"]')).toBeTruthy();
  });

  it("фильтрует список диалогов по названию без перезагрузки истории", async () => {
    mocks.getConversations.mockResolvedValue({
      items: [
        current,
        {
          ...current,
          id: "conversation-deposit",
          title: "Депозит не зачислен",
          isCurrent: false,
          currentInteractionSessionCount: 0,
        },
      ],
      nextCursor: null,
    });

    const wrapper = mountWorkspace(current.id);
    await flushPromises();

    expect(wrapper.get(".conversation-list").text()).toContain(
      "Текущий разговор",
    );
    expect(wrapper.get(".conversation-list").text()).toContain(
      "Депозит не зачислен",
    );

    await wrapper
      .get('input[aria-label="Поиск по диалогам"]')
      .setValue("депозит");

    expect(wrapper.get(".conversation-list").text()).not.toContain(
      "Текущий разговор",
    );
    expect(wrapper.get(".conversation-list").text()).toContain(
      "Депозит не зачислен",
    );
    expect(mocks.getConversations).toHaveBeenCalledTimes(1);
  });

  it("сохраняет геометрию диалога скелетонами и блокирует composer до загрузки", async () => {
    let resolveMessages:
      | ((value: Awaited<ReturnType<typeof mocks.getMessages>>) => void)
      | undefined;
    mocks.getMessages.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveMessages = resolve;
      }),
    );

    const wrapper = mountWorkspace(current.id);
    await flushPromises();

    const skeletons = wrapper.get(".message-skeletons");
    expect(skeletons.classes()).toContain("message-skeletons--bottom");
    expect(skeletons.classes()).toContain("message-skeletons--message-sized");
    expect(skeletons.classes()).toContain("message-skeletons--full-width");
    expect(skeletons.findAll(":scope > span")).toHaveLength(20);
    expect(wrapper.find(".composer--loading").exists()).toBe(true);

    resolveMessages?.({ items: [], nextCursor: null });
    await flushPromises();
    expect(wrapper.find(".message-skeletons").exists()).toBe(false);
  });

  it("показывает прогресс массового перевода без перестановки сообщений", async () => {
    mocks.permissions.push("project.translation.create");
    vi.spyOn(conversationTranslationApi, "getConversation").mockResolvedValue(
      translationState(true),
    );
    mocks.getMessages.mockResolvedValueOnce({
      items: [1, 2, 3].map((index) => ({
        id: `message-${index}`,
        conversationId: current.id,
        author: "USER" as const,
        status: "COMPLETED" as const,
        text: `Nachricht ${index}`,
        createdAt: `2026-07-20T12:5${index}:00.000Z`,
      })),
      nextCursor: null,
    });
    let resolveTranslation:
      | ((value: { items: never[]; queued: boolean }) => void)
      | undefined;
    vi.spyOn(
      conversationTranslationApi,
      "translateMessages",
    ).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveTranslation = resolve;
      }),
    );

    const wrapper = mountWorkspace(current.id);
    await flushPromises();
    await wrapper
      .get('[data-action="show-translated-messages"]')
      .trigger("click");
    await flushPromises();

    expect(wrapper.get(".bulk-translation-progress").text()).toContain(
      "0 из 3",
    );
    expect(wrapper.findAll(".message-bubble")).toHaveLength(3);

    resolveTranslation?.({ items: [], queued: false });
    await flushPromises();
    expect(wrapper.find(".bulk-translation-progress").exists()).toBe(false);
  });

  it("размещает историю синхронизации в карточке доступного профиля", async () => {
    const wrapper = mountWorkspace();
    await flushPromises();

    const history = wrapper.get('[data-testid="profile-sync-history"]');
    expect(history.attributes()).toMatchObject({
      "data-project-id": "project-1",
      "data-end-user-id": "user-1",
    });
    expect(history.element.closest(".profile-card-header")).not.toBeNull();
  });

  it("скрывает историю синхронизации без права чтения профилей", async () => {
    mocks.permissions.splice(
      mocks.permissions.indexOf("project.profiles.read"),
      1,
    );
    const wrapper = mountWorkspace();
    await flushPromises();

    expect(wrapper.find('[data-testid="profile-sync-history"]').exists()).toBe(
      false,
    );
  });

  it("opens a conversation deep link directly in chat mode", async () => {
    const wrapper = mountWorkspace(current.id);
    await flushPromises();

    expect(wrapper.get('[data-testid="chat-workspace"]')).toBeTruthy();
    expect(wrapper.text()).toContain("Сообщение пользователя");
  });

  it("passes the independent personal-send permission without using conversation reply authority", async () => {
    mocks.permissions.push(
      "project.telegram.links.read",
      "project.telegram.personal_messages.send",
    );
    const wrapper = mountWorkspace();
    await flushPromises();

    expect(
      wrapper
        .get('[data-testid="end-user-telegram-panel"]')
        .attributes("data-can-send"),
    ).toBe("true");
  });

  it("includes a Telegram composer draft in the workspace close guard", async () => {
    mocks.permissions.push(
      "project.telegram.links.read",
      "project.telegram.personal_messages.send",
    );
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const wrapper = mountWorkspace();
    await flushPromises();
    await wrapper
      .get('button[data-action="telegram-draft-dirty"]')
      .trigger("click");
    await wrapper.get('button[data-action="close-dialog"]').trigger("click");

    expect(confirm).toHaveBeenCalledWith(
      "Закрыть рабочее пространство и потерять черновик?",
    );
    expect(mocks.updateVisible).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    await wrapper.get('button[data-action="close-dialog"]').trigger("click");
    expect(mocks.updateVisible).toHaveBeenCalledWith(false);
  });

  it("показывает текущий разговор, обе стороны переписки и включает watch только для него", async () => {
    const wrapper = mountWorkspace();
    await flushPromises();
    await wrapper.get('[data-action="open-chat"]').trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Текущий разговор");
    expect(wrapper.text()).toContain("Сообщение пользователя");
    expect(wrapper.text()).toContain("Ответ оператора");
    expect(mocks.activateProject).toHaveBeenCalledWith("project-1");
    expect(mocks.watchConversation).toHaveBeenCalledWith(current.id);
    expect(mocks.subscribe).toHaveBeenCalledWith(
      ["conversation.message.upserted.v1"],
      expect.any(Function),
    );
  });

  it("загружает профиль независимо от ошибки realtime activation", async () => {
    mocks.activateProject.mockRejectedValueOnce(
      new Error("Realtime unavailable"),
    );
    const wrapper = mountWorkspace();
    await flushPromises();

    expect(mocks.profile).toHaveBeenCalledWith("project-1", "user-1");
    expect(wrapper.text()).toContain("customer-1");
    expect(wrapper.find(".profile-skeleton").exists()).toBe(false);
  });

  it("позволяет вернуться к профилю из чата без диалогов", async () => {
    mocks.getConversations.mockResolvedValueOnce({
      items: [],
      nextCursor: null,
    });
    const wrapper = mountWorkspace();
    await flushPromises();

    await wrapper.get('[data-action="open-chat"]').trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Выберите диалог");
    await wrapper
      .get('.chat-empty [data-action="open-profile"]')
      .trigger("click");
    await flushPromises();

    expect(wrapper.find('[data-action="open-chat"]').exists()).toBe(true);
  });

  it("показывает live-состояние компактным тегом без изменяющего высоту сообщения", async () => {
    const wrapper = mountWorkspace();
    await flushPromises();

    const status = wrapper.get('[data-testid="live-connection-status"]');
    expect(status.text()).toContain("Live");
    expect(status.find(".connection-live-dot").exists()).toBe(true);
    expect(wrapper.find(".realtime-message").exists()).toBe(false);

    mocks.stateHandler?.("CONNECTING");
    await flushPromises();
    expect(
      wrapper.get('[data-testid="live-connection-status"]').text(),
    ).toContain("Подключение");
    expect(wrapper.find(".realtime-message").exists()).toBe(false);

    mocks.stateHandler?.("DEGRADED");
    await flushPromises();
    expect(
      wrapper.get('[data-testid="live-connection-status"]').text(),
    ).toContain("Ошибка связи");
    expect(wrapper.find(".realtime-message").exists()).toBe(false);
  });

  it("игнорирует чужое realtime-событие и принимает событие выбранного диалога", async () => {
    const wrapper = mountWorkspace();
    await flushPromises();
    await wrapper.get('[data-action="open-chat"]').trigger("click");
    await flushPromises();
    const base = {
      contractVersion: 1,
      projectId: "project-1",
      endUserId: "user-1",
      message: {
        id: "live",
        threadId: current.id,
        role: "USER",
        status: "COMPLETED",
        text: "Live-сообщение",
        createdAt: "2026-07-20T13:01:00.000Z",
        updatedAt: "2026-07-20T13:01:00.000Z",
      },
    };

    mocks.messageHandler?.({ ...base, conversationId: "another-conversation" });
    await flushPromises();
    expect(wrapper.text()).not.toContain("Live-сообщение");
    mocks.messageHandler?.({ ...base, conversationId: current.id });
    await flushPromises();
    expect(wrapper.text()).toContain("Live-сообщение");
  });

  it("принимает только translation realtime выбранного диалога", async () => {
    mocks.permissions.push("project.translation.create");
    vi.spyOn(conversationTranslationApi, "getConversation").mockResolvedValue(
      translationState(true),
    );
    vi.spyOn(conversationTranslationApi, "translateMessages").mockResolvedValue(
      { items: [], queued: false },
    );
    const wrapper = mountWorkspace();
    await flushPromises();
    await wrapper.get('[data-action="open-chat"]').trigger("click");
    await flushPromises();
    await wrapper
      .get('[data-action="show-translated-messages"]')
      .trigger("click");
    await flushPromises();

    expect(mocks.subscribe).toHaveBeenCalledWith(
      ["conversation.message.translation.upserted.v1"],
      expect.any(Function),
    );
    const event = {
      contractVersion: 1,
      projectId: "project-1",
      endUserId: "user-1",
      conversationId: current.id,
      messageId: "user-message",
      translation: {
        id: "translation-1",
        sourceMessageId: "user-message",
        status: "COMPLETED",
        sourceLocale: "de",
        detectedSourceLocale: "de",
        targetLocale: "ru",
        translatedText: "Переведённое сообщение",
        warnings: [],
        errorCode: null,
        updatedAt: "2026-07-20T13:02:00.000Z",
      },
    };

    mocks.translationHandler?.({
      ...event,
      conversationId: "another-conversation",
    });
    await flushPromises();
    expect(wrapper.text()).not.toContain("Переведённое сообщение");

    mocks.translationHandler?.(event);
    await flushPromises();
    expect(wrapper.text()).toContain("Переведённое сообщение");
  });

  it("не создаёт provider work для сохранённого перевода после повторной загрузки", async () => {
    mocks.permissions.push("project.translation.create");
    vi.spyOn(conversationTranslationApi, "getConversation").mockResolvedValue(
      translationState(true),
    );
    const translate = vi
      .spyOn(conversationTranslationApi, "translateMessages")
      .mockResolvedValue({ items: [], queued: false });
    mocks.getMessages.mockResolvedValue({
      items: [
        {
          id: "translated-message",
          conversationId: current.id,
          author: "USER",
          status: "COMPLETED",
          text: "Guten Tag",
          createdAt: "2026-07-20T12:59:00.000Z",
          translation: {
            id: "translation-1",
            direction: "INBOUND",
            status: "COMPLETED",
            originalText: "Guten Tag",
            translatedText: "Добрый день",
            deliveredText: null,
            viewText: "Добрый день",
            sourceLocale: "de",
            targetLocale: "ru",
            errorCode: null,
            warnings: [],
            updatedAt: "2026-07-20T13:00:00.000Z",
          },
        },
      ],
      nextCursor: null,
    });

    const wrapper = mountWorkspace(current.id);
    await flushPromises();

    expect(wrapper.text()).toContain("Guten Tag");
    await wrapper
      .get('[data-action="show-translated-messages"]')
      .trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Добрый день");
    expect(translate).not.toHaveBeenCalled();
  });

  it("переключает все сообщения между оригиналом и рабочим переводом из шапки", async () => {
    mocks.permissions.push("project.translation.create");
    vi.spyOn(conversationTranslationApi, "getConversation").mockResolvedValue(
      translationState(true),
    );
    vi.spyOn(conversationTranslationApi, "translateMessages").mockResolvedValue(
      { items: [], queued: false },
    );
    mocks.getMessages.mockResolvedValue({
      items: [
        {
          id: "translated-message",
          conversationId: current.id,
          author: "USER",
          status: "COMPLETED",
          text: "Guten Tag",
          createdAt: "2026-07-20T12:59:00.000Z",
          translation: {
            id: "translation-1",
            direction: "INBOUND",
            status: "COMPLETED",
            originalText: "Guten Tag",
            translatedText: "Добрый день",
            deliveredText: null,
            viewText: "Добрый день",
            sourceLocale: "de",
            targetLocale: "ru",
            errorCode: null,
            warnings: [],
            updatedAt: "2026-07-20T13:00:00.000Z",
          },
        },
      ],
      nextCursor: null,
    });

    const wrapper = mountWorkspace(current.id);
    await flushPromises();

    expect(wrapper.text()).toContain("Guten Tag");
    expect(wrapper.text()).not.toContain("Добрый день");

    await wrapper
      .get('[data-action="show-translated-messages"]')
      .trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Добрый день");
    expect(wrapper.text()).not.toContain("Guten Tag");

    await wrapper
      .get('[data-action="show-original-messages"]')
      .trigger("click");
    expect(wrapper.text()).toContain("Guten Tag");
    expect(wrapper.text()).not.toContain("Добрый день");
  });

  it("не загружает настройки перевода до явного действия оператора", async () => {
    mocks.permissions.push("project.translation.create");
    mocks.getMessages.mockResolvedValue({
      items: [
        {
          id: "german-message",
          conversationId: current.id,
          author: "USER",
          status: "COMPLETED",
          text: "Meine Einzahlung ist nicht angekommen",
          createdAt: "2026-07-20T12:59:00.000Z",
        },
      ],
      nextCursor: null,
    });
    const getTranslation = vi
      .spyOn(conversationTranslationApi, "getConversation")
      .mockRejectedValue(new Error("translation unavailable"));

    const wrapper = mountWorkspace(current.id);
    await flushPromises();

    expect(getTranslation).not.toHaveBeenCalled();
    expect(mocks.toastAdd).not.toHaveBeenCalledWith(
      expect.objectContaining({ summary: "Ошибка перевода" }),
    );

    await wrapper
      .get('button[aria-label="Другие действия с диалогом"]')
      .trigger("click");
    await flushPromises();
    expect(getTranslation).not.toHaveBeenCalled();

    await wrapper
      .get('[data-action="show-translated-messages"]')
      .trigger("click");
    await flushPromises();

    expect(getTranslation).toHaveBeenCalledTimes(1);
    expect(mocks.toastAdd).toHaveBeenCalledTimes(1);
  });

  it("для русского диалога включает режим перевода без API и ошибок", async () => {
    mocks.permissions.push("project.translation.create");
    const getTranslation = vi
      .spyOn(conversationTranslationApi, "getConversation")
      .mockRejectedValue(new Error("translation unavailable"));
    const translate = vi.spyOn(
      conversationTranslationApi,
      "translateMessages",
    );
    mocks.getMessages.mockResolvedValue({
      items: [
        {
          id: "russian-message",
          conversationId: current.id,
          author: "SCENARIO",
          status: "COMPLETED",
          text: "Почему не пришёл депозит?",
          createdAt: "2026-07-20T12:59:00.000Z",
        },
      ],
      nextCursor: null,
    });

    const wrapper = mountWorkspace(current.id);
    await flushPromises();
    await wrapper
      .get('[data-action="show-translated-messages"]')
      .trigger("click");
    await flushPromises();

    expect(getTranslation).not.toHaveBeenCalled();
    expect(translate).not.toHaveBeenCalled();
    expect(
      wrapper
        .get('[data-action="show-translated-messages"]')
        .attributes("aria-pressed"),
    ).toBe("true");
    expect(wrapper.text()).toContain("Почему не пришёл депозит?");
    expect(mocks.toastAdd).not.toHaveBeenCalled();
  });

  it("оставляет перевод ответа доступным даже в русскоязычном диалоге", async () => {
    mocks.permissions.push("project.translation.create");
    const wrapper = mountWorkspace(current.id);
    await flushPromises();

    await wrapper
      .get('textarea[aria-label="Ответ пользователю"]')
      .setValue("Проверяю ваш вопрос");

    expect(
      wrapper
        .findAll("button")
        .some((button) => button.text().includes("Перевести ответ")),
    ).toBe(true);
    const improve = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Улучшить с AI"));
    expect(improve?.attributes("disabled")).toBeDefined();
  });

  it("не показывает кнопку Диалоги в верхней панели и действия внутри сообщений", async () => {
    const wrapper = mountWorkspace(current.id);
    await flushPromises();

    expect(
      wrapper
        .get(".workspace-title")
        .findAll("button")
        .some((button) => button.text().trim() === "Диалоги"),
    ).toBe(false);
    expect(wrapper.find(".message-bubble button").exists()).toBe(false);
  });

  it("блокирует скролл страницы, пока рабочее пространство открыто", async () => {
    const wrapper = mountWorkspace(current.id);
    await flushPromises();

    expect(
      wrapper.get("section[data-block-scroll]").attributes("data-block-scroll"),
    ).toBeDefined();
    expect(document.body.classList.contains("workspace-scroll-locked")).toBe(
      true,
    );
  });

  it("показывает ошибку перевода вне chat layout", async () => {
    mocks.permissions.push("project.translation.create");
    vi.spyOn(conversationTranslationApi, "getConversation").mockResolvedValue(
      translationState(true),
    );
    vi.spyOn(conversationTranslationApi, "translateMessages").mockRejectedValue(
      {
        response: {
          data: {
            error: {
              code: "TRANSLATION_DISABLED",
              requestId: "request-translation-disabled",
            },
          },
        },
      },
    );
    const wrapper = mountWorkspace(current.id);
    await flushPromises();

    await wrapper.get(".conversation-more").trigger("click");
    const translationBanner = wrapper.getComponent(
      ConversationTranslationBanner,
    );
    translationBanner.vm.$emit("reload");
    await flushPromises();
    translationBanner.vm.$emit("translateVisible");
    await flushPromises();

    expect(mocks.toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "warn",
        summary: "Переводы временно выключены",
      }),
    );
    expect(wrapper.find(".chat-error").exists()).toBe(false);
  });

  it("после reload восстанавливает composer из scoped translation draft", async () => {
    mocks.permissions.push("project.translation.create");
    const sourceText = "Пожалуйста, уточните номер заказа";
    sessionStorage.setItem(
      `lola:reply-translation-draft:project-1:user-1:${current.id}`,
      JSON.stringify({
        draftId: "draft-reload",
        sourceTextHash: "hash-reload",
        sourceLocale: "ru",
        targetLocale: "de",
        expiresAt: "2099-07-30T10:10:00.000Z",
      }),
    );
    vi.spyOn(conversationTranslationApi, "getConversation").mockResolvedValue(
      translationState(true),
    );
    const getReplyDraft = vi
      .spyOn(conversationTranslationApi, "getReplyDraft")
      .mockResolvedValue({
        conversationId: current.id,
        createdAt: "2026-07-30T10:00:00.000Z",
        deliveredTextPreview: "Bitte geben Sie die Bestellnummer an",
        editedTranslatedText: null,
        errorCode: null,
        expiresAt: "2099-07-30T10:10:00.000Z",
        id: "draft-reload",
        model: "grok-4.3",
        modelConfigRevision: "model-1",
        provider: "xai",
        queued: false,
        sourceLocale: "ru",
        sourceText,
        sourceTextHash: "hash-reload",
        status: "READY",
        targetLocale: "de",
        targetLocaleSource: "PROFILE",
        translatedText: "Bitte geben Sie die Bestellnummer an",
        translationConfigRevision: "translation-config-1",
        updatedAt: "2026-07-30T10:00:01.000Z",
        warnings: [],
      });
    mocks.sendAdminMessage.mockResolvedValue({ threadId: current.id });

    const wrapper = mountWorkspace(current.id);
    await flushPromises();

    expect(
      (
        wrapper.get('textarea[aria-label="Ответ пользователю"]')
          .element as HTMLTextAreaElement
      ).value,
    ).toBe(sourceText);
    expect(
      wrapper.getComponent(ReplyTranslationPreview).props("draft")
        ?.translatedText,
    ).toBe("Bitte geben Sie die Bestellnummer an");
    expect(getReplyDraft).toHaveBeenCalledTimes(1);

    await wrapper
      .get('textarea[aria-label="Ответ пользователю"]')
      .trigger("keydown", { key: "Enter" });
    await flushPromises();

    expect(mocks.sendAdminMessage).toHaveBeenCalledWith(
      "project-1",
      "user-1",
      expect.objectContaining({
        replyTranslationDraftId: "draft-reload",
      }),
    );
  });

  it("переводит только новую загруженную страницу истории", async () => {
    mocks.permissions.push("project.translation.create");
    vi.spyOn(conversationTranslationApi, "getConversation").mockResolvedValue(
      translationState(true),
    );
    const translate = vi
      .spyOn(conversationTranslationApi, "translateMessages")
      .mockResolvedValue({ items: [], queued: false });
    mocks.getMessages
      .mockResolvedValueOnce({
        items: [
          {
            id: "current-german",
            conversationId: current.id,
            author: "USER",
            status: "COMPLETED",
            text: "Danke, es hat funktioniert",
            createdAt: "2026-07-20T12:59:00.000Z",
          },
        ],
        nextCursor: "older",
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: "older-german",
            conversationId: current.id,
            author: "USER",
            status: "COMPLETED",
            text: "Eine ältere Nachricht",
            createdAt: "2026-07-19T12:59:00.000Z",
          },
        ],
        nextCursor: null,
      });
    const wrapper = mountWorkspace(current.id);
    await flushPromises();
    await wrapper
      .get('[data-action="show-translated-messages"]')
      .trigger("click");
    await flushPromises();
    translate.mockClear();

    const older = wrapper
      .findAll("button")
      .find((button) =>
        button.text().includes("Показать предыдущие сообщения"),
      );
    await older?.trigger("click");
    await flushPromises();

    expect(translate).toHaveBeenCalledTimes(1);
    expect(translate.mock.calls[0]?.[3]).toEqual(["older-german"]);
  });

  it("не отсекает substantive Cyrillic future realtime до backend", async () => {
    mocks.permissions.push("project.translation.create");
    vi.spyOn(conversationTranslationApi, "getConversation").mockResolvedValue(
      translationState(false),
    );
    vi.spyOn(
      conversationTranslationApi,
      "updateConversation",
    ).mockResolvedValue(translationState(true));
    const translate = vi
      .spyOn(conversationTranslationApi, "translateMessages")
      .mockResolvedValue({ items: [], queued: false });
    const wrapper = mountWorkspace(current.id);
    await flushPromises();
    await wrapper.get(".conversation-more").trigger("click");
    wrapper
      .getComponent(ConversationTranslationBanner)
      .vm.$emit("updateEnabled", true);
    await flushPromises();
    translate.mockClear();

    const event = {
      contractVersion: 1,
      projectId: "project-1",
      endUserId: "user-1",
      conversationId: current.id,
      message: {
        id: "future-german",
        threadId: current.id,
        role: "USER",
        status: "COMPLETED",
        text: "Danke für Ihre Hilfe",
        createdAt: "2026-07-20T13:01:00.000Z",
        updatedAt: "2026-07-20T13:01:00.000Z",
      },
    };
    mocks.messageHandler?.(event);
    await flushPromises();
    mocks.messageHandler?.({
      ...event,
      message: {
        ...event.message,
        id: "future-russian",
        text: "Спасибо за помощь",
      },
    });
    await flushPromises();

    expect(translate).toHaveBeenCalledTimes(2);
    expect(translate.mock.calls.map((call) => call[3])).toEqual([
      ["future-german"],
      ["future-russian"],
    ]);
  });

  it("возвращает выбранный диалог из мобильного списка при повторном выборе", async () => {
    const wrapper = mountWorkspace(current.id);
    await flushPromises();

    await wrapper.get(".mobile-chat-back").trigger("click");
    expect(
      wrapper
        .get('[data-testid="chat-workspace"]')
        .attributes("data-mobile-pane"),
    ).toBe("LIST");

    await wrapper.get(".conversation-list button").trigger("click");
    await flushPromises();

    expect(
      wrapper
        .get('[data-testid="chat-workspace"]')
        .attributes("data-mobile-pane"),
    ).toBe("CHAT");
  });

  it("открывает форму тикета без ложной отправки в неподключённый API", async () => {
    const wrapper = mountWorkspace(current.id);
    await flushPromises();

    await wrapper.get(".composer-action-menu > button").trigger("click");
    const ticketAction = wrapper
      .findAll('[role="menuitem"]')
      .find((item) => item.text().includes("Создать тикет"));
    expect(ticketAction).toBeTruthy();
    await ticketAction!.trigger("click");

    const drawer = wrapper.get('[data-testid="ticket-drawer"]');
    expect(drawer.text()).toContain("Support API");
    expect(drawer.get("footer .primary").attributes("disabled")).toBeDefined();
  });

  it("открывает галерею шаблонов только из отдельной кнопки", async () => {
    const wrapper = mountWorkspace(current.id);
    await flushPromises();

    await wrapper.get(".composer-action-menu > button").trigger("click");
    expect(wrapper.get(".composer-action-menu__panel").text()).not.toContain(
      "Шаблон ответа",
    );

    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Шаблоны"))
      ?.trigger("click");

    expect(wrapper.get('[data-testid="reply-template-gallery"]').text()).toContain(
      "Галерея шаблонов",
    );
  });

  it("после reconnect сверяет REST projection выбранного диалога", async () => {
    mocks.permissions.push("project.translation.create");
    vi.spyOn(conversationTranslationApi, "getConversation").mockResolvedValue(
      translationState(true),
    );
    mountWorkspace(current.id);
    await flushPromises();
    mocks.getMessages.mockClear();

    await mocks.reconcileHandler?.();
    await flushPromises();

    expect(mocks.getMessages).toHaveBeenCalledWith(
      "project-1",
      "user-1",
      current.id,
      { limit: 20 },
    );
  });

  it("снимает подписку с выбранного диалога при закрытии", async () => {
    const wrapper = mountWorkspace();
    await flushPromises();
    await wrapper.setProps({ visible: false });
    await flushPromises();

    expect(mocks.unwatchConversation).toHaveBeenCalledWith(current.id);
  });

  it("не запрашивает диалоги и realtime без project.conversations.read", async () => {
    mocks.permissions.splice(
      0,
      mocks.permissions.length,
      "project.profiles.read",
    );
    const wrapper = mountWorkspace();
    await flushPromises();

    expect(mocks.profile).toHaveBeenCalledWith("project-1", "user-1");
    expect(mocks.getConversations).not.toHaveBeenCalled();
    expect(mocks.activateProject).not.toHaveBeenCalled();
    expect(mocks.subscribe).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("customer-1");
  });

  it("не показывает и не вызывает reply controls без project.conversations.reply", async () => {
    mocks.permissions.splice(
      0,
      mocks.permissions.length,
      "project.profiles.read",
      "project.conversations.read",
    );
    const wrapper = mountWorkspace();
    await flushPromises();
    await wrapper.get('[data-action="open-chat"]').trigger("click");
    await flushPromises();

    expect(wrapper.find("form.composer").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("Новый");
    expect(mocks.sendAdminMessage).not.toHaveBeenCalled();
  });

  it("не запрашивает presence без project.end_users.read", async () => {
    mocks.permissions.splice(
      0,
      mocks.permissions.length,
      "project.conversations.read",
    );
    mountWorkspace();
    await flushPromises();

    expect(mocks.getConversations).toHaveBeenCalledWith("project-1", "user-1", {
      limit: 30,
    });
    expect(mocks.getSessions).not.toHaveBeenCalled();
  });

  it("показывает Memory и Review по их permissions без доступа к профилю", async () => {
    mocks.permissions.splice(
      0,
      mocks.permissions.length,
      "project.user_memory.read",
      "project.ai_review.read",
      "project.ai_review.run",
      "project.settings.read",
      "project.event_query_policy.preview",
      "project.ai_proposals.read",
    );
    const wrapper = mountWorkspace();
    await flushPromises();

    expect(mocks.profile).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="user-memory-panel"]').exists()).toBe(
      true,
    );
    const review = wrapper.get('[data-testid="ai-review-entry"]');
    expect(review.text()).toContain("AI-анализ событий");
    expect(review.text()).toContain(
      "Выберите события и сначала оцените объём запроса",
    );
    expect(review.find("button").text()).toContain("Запросить анализ");
  });
});
