import { flushPromises, mount } from "@vue/test-utils";
import { nextTick, reactive, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UserWorkspaceDialog from "./UserWorkspaceDialog.vue";
import ConversationAISuspensionDialog from "@/features/conversation-ai-suspension/ui/ConversationAISuspensionDialog.vue";
import ConversationAISuspensionHeaderActions from "@/features/conversation-ai-suspension/ui/ConversationAISuspensionHeaderActions.vue";
import { conversationTranslationApi } from "@/features/conversation-translation/api/conversation-translation.api";
import ConversationTranslationBanner from "@/features/conversation-translation/ui/ConversationTranslationBanner.vue";
import ReplyTranslationPreview from "@/features/conversation-translation/ui/ReplyTranslationPreview.vue";
import ConversationComposer from "@/features/conversation-surface/ui/ConversationComposer.vue";
import ConversationSurface from "@/features/conversation-surface/ui/ConversationSurface.vue";
import type { ConversationTranslationResponseDto } from "@/shared/api/generated/models";
import {
  getRootScrollLockCount,
  releaseRootScrollLock,
} from "@/features/support-workspace/presentation/root-scroll-lock";

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
  suspensionLoadDetail: vi.fn(),
  suspensionEntry: undefined as
    | {
        summary: typeof automatic;
        endUserId: string;
        loading: boolean;
        mutating: null;
        error: null;
        locallyExpired: boolean;
        cancellationRequested: boolean;
        serverOffsetMs: number;
      }
    | undefined,
  logout: vi.fn(),
  replace: vi.fn(),
  route: { fullPath: "/users?userId=user-1" },
  permissions: [
    "project.profiles.read",
    "project.end_users.read",
    "project.conversations.read",
    "project.conversations.reply",
    "project.conversations.ai_suspend",
    "project.ai_usage.read",
  ],
  permissionRevision: undefined as { value: number } | undefined,
}));

vi.mock("@/features/auth/auth.store", () => ({
  useAuthStore: () => ({
    logout: mocks.logout,
    project: {
      get effectivePermissionCodes() {
        void mocks.permissionRevision?.value;
        return mocks.permissions;
      },
    },
  }),
}));
vi.mock("vue-router", () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ replace: mocks.replace }),
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
      loadDetail: mocks.suspensionLoadDetail,
      getEntry: () => mocks.suspensionEntry,
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
    Object.defineProperty(window, "scrollTo", {
      configurable: true,
      value: vi.fn(),
    });
    while (getRootScrollLockCount() > 0) releaseRootScrollLock();
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: vi.fn(),
    });
    vi.clearAllMocks();
    mocks.permissionRevision = ref(0);
    mocks.permissions = reactive([
      "project.profiles.read",
      "project.end_users.read",
      "project.conversations.read",
      "project.conversations.reply",
      "project.conversations.ai_suspend",
      "project.ai_usage.read",
    ]);
    mocks.messageHandler = undefined;
    mocks.translationHandler = undefined;
    mocks.suspensionEntry = undefined;
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
    mocks.logout.mockResolvedValue(undefined);
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
          ordinal: 1,
          author: "USER",
          status: "COMPLETED",
          text: "Сообщение пользователя",
          createdAt: "2026-07-20T12:59:00.000Z",
        },
        {
          id: "operator-message",
          conversationId: current.id,
          ordinal: 2,
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
          FullViewportWorkspaceShell: {
            props: ["mode"],
            template:
              '<div data-testid="workspace-presentation-shell" :data-presentation-mode="mode"><slot /></div>',
          },
          Dialog: {
            props: ["blockScroll", "visible"],
            emits: ["update:visible"],
            template:
              '<section v-if="visible !== false" :data-block-scroll="String(blockScroll)"><button data-action="close-dialog" @click="$emit(\'update:visible\', false)">close</button><slot name="header"/><slot/></section>',
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
          EndUserAiAllowanceCard: {
            props: [
              "projectId",
              "endUserId",
              "canGrant",
              "canManage",
              "canReconcile",
              "refreshKey",
            ],
            emits: ["open-details", "open-journal"],
            template:
              '<div data-testid="end-user-ai-allowance" :data-project-id="projectId" :data-end-user-id="endUserId" :data-can-grant="String(canGrant)" :data-can-manage="String(canManage)" :data-can-reconcile="String(canReconcile)" :data-refresh-key="String(refreshKey)"><button data-action="open-allowance-details" @click="$emit(\'open-details\', \'summary\')">details</button><button data-action="open-allowance-grant" @click="$emit(\'open-details\', \'grant\')">grant</button><button data-action="open-allowance-journal" @click="$emit(\'open-journal\')">journal</button></div>',
          },
          AiAllowanceUserDialog: {
            props: [
              "visible",
              "projectId",
              "endUserId",
              "identity",
              "initialMode",
              "canRead",
              "canGrant",
              "canManage",
              "canReconcile",
            ],
            emits: ["update:visible", "open-journal", "changed", "fresh-login"],
            template:
              '<div v-if="visible && canRead" data-testid="ai-allowance-user-dialog" :data-project-id="projectId" :data-end-user-id="endUserId" :data-identity="identity" :data-initial-mode="initialMode" :data-can-grant="String(canGrant)" :data-can-manage="String(canManage)" :data-can-reconcile="String(canReconcile)"><button data-action="allowance-changed" @click="$emit(\'changed\')">changed</button><button data-action="allowance-fresh-login" @click="$emit(\'fresh-login\')">fresh login</button></div>',
          },
          AiAllowanceJournalPanel: {
            props: ["projectId", "endUserId", "cursor", "embedded"],
            emits: ["next-cursor", "changed", "fresh-login"],
            template:
              '<div data-testid="ai-allowance-journal" :data-project-id="projectId" :data-end-user-id="endUserId" :data-cursor="cursor" :data-embedded="String(embedded)"><button data-action="journal-fresh-login" @click="$emit(\'fresh-login\')">fresh login</button></div>',
          },
          AIReviewDialog: true,
        },
      },
    });
  }

  it("renders the selected Users chat through the canonical Conversation Surface", async () => {
    mocks.permissions.push("project.translation.create");
    const wrapper = mountWorkspace(current.id);
    await flushPromises();

    const surface = wrapper.findComponent(ConversationSurface);
    expect(surface.exists()).toBe(true);
    expect(surface.findComponent(ConversationComposer).exists()).toBe(true);
    expect(surface.findAll("[data-message-id]")).toHaveLength(2);
    expect(surface.text()).toContain("Сообщение пользователя");
    expect(surface.text()).toContain("Ответ оператора");
    expect(wrapper.find(".message-history").exists()).toBe(false);
    expect(wrapper.find(".message-bubble").exists()).toBe(false);
    expect(
      wrapper.findAll('[aria-label="Режим отображения сообщений"]'),
    ).toHaveLength(1);
  });

  it("keeps AI suspension controls beside the shared Surface and revokes mutation authority at runtime", async () => {
    mocks.suspensionEntry = {
      summary: automatic,
      endUserId: "user-1",
      loading: false,
      mutating: null,
      error: null,
      locallyExpired: false,
      cancellationRequested: false,
      serverOffsetMs: 0,
    };
    const wrapper = mountWorkspace(current.id);
    await flushPromises();

    expect(wrapper.findComponent(ConversationSurface).exists()).toBe(true);
    expect(
      wrapper.findComponent(ConversationAISuspensionHeaderActions).exists(),
    ).toBe(true);
    expect(mocks.suspensionLoadDetail).toHaveBeenCalledWith(
      "user-1",
      current.id,
    );

    await wrapper.get('[aria-label="Приостановить AI"]').trigger("click");
    const dialog = wrapper.getComponent(ConversationAISuspensionDialog);
    expect(dialog.props("visible")).toBe(true);
    expect(dialog.props("mode")).toBe("START");

    mocks.permissions.splice(
      mocks.permissions.indexOf("project.conversations.ai_suspend"),
      1,
    );
    mocks.permissionRevision!.value += 1;
    await flushPromises();

    expect(wrapper.find('[aria-label="Приостановить AI"]').exists()).toBe(
      false,
    );
    expect(wrapper.findComponent(ConversationSurface).exists()).toBe(true);
  });

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
    expect(
      wrapper.get<HTMLElement>('[data-testid="chat-workspace"]').element.style
        .display,
    ).toBe("none");

    await wrapper.get('[data-action="open-chat"]').trigger("click");
    await flushPromises();
    expect(
      wrapper.get<HTMLElement>('[data-testid="chat-workspace"]').element.style
        .display,
    ).toBe("");
    expect(wrapper.text()).toContain("Сообщение пользователя");

    await wrapper.get('[data-action="open-profile"]').trigger("click");
    expect(wrapper.get('[data-testid="profile-overview"]')).toBeTruthy();
  });

  it("shows and opens the independently authorized AI allowance in the user profile", async () => {
    mocks.permissions.push(
      "project.ai_allowance.read",
      "project.ai_allowance.grant",
    );
    const wrapper = mountWorkspace();
    await flushPromises();

    const card = wrapper.get('[data-testid="end-user-ai-allowance"]');
    expect(card.attributes()).toMatchObject({
      "data-project-id": "project-1",
      "data-end-user-id": "user-1",
      "data-can-grant": "true",
      "data-can-manage": "false",
      "data-can-reconcile": "false",
    });

    await card.get('[data-action="open-allowance-details"]').trigger("click");
    const dialog = wrapper.get('[data-testid="ai-allowance-user-dialog"]');
    expect(dialog.attributes()).toMatchObject({
      "data-project-id": "project-1",
      "data-end-user-id": "user-1",
      "data-identity": "customer-1",
      "data-can-grant": "true",
      "data-can-manage": "false",
      "data-can-reconcile": "false",
      "data-initial-mode": "summary",
    });

    await dialog.get('[data-action="allowance-changed"]').trigger("click");
    expect(card.attributes("data-refresh-key")).toBe("1");

    await card.get('[data-action="open-allowance-grant"]').trigger("click");
    expect(
      wrapper
        .get('[data-testid="ai-allowance-user-dialog"]')
        .attributes("data-initial-mode"),
    ).toBe("grant");

    await card.get('[data-action="open-allowance-journal"]').trigger("click");
    await flushPromises();
    expect(mocks.updateVisible).not.toHaveBeenCalledWith(false);
    expect(
      wrapper.get('[data-testid="ai-allowance-journal"]').attributes(),
    ).toMatchObject({
      "data-project-id": "project-1",
      "data-end-user-id": "user-1",
      "data-cursor": "",
      "data-embedded": "",
    });
  });

  it("does not expose AI allowance without its read permission", async () => {
    const wrapper = mountWorkspace();
    await flushPromises();

    expect(wrapper.find('[data-testid="end-user-ai-allowance"]').exists()).toBe(
      false,
    );
    expect(
      wrapper.find('[data-testid="ai-allowance-user-dialog"]').exists(),
    ).toBe(false);
  });

  it.each([
    [
      "user allowance dialog",
      "open-allowance-details",
      "allowance-fresh-login",
    ],
    ["allowance journal", "open-allowance-journal", "journal-fresh-login"],
  ])(
    "starts one fresh login from %s and preserves the workspace route",
    async (_surface, openAction, freshLoginAction) => {
      mocks.permissions.push(
        "project.ai_allowance.read",
        "project.ai_allowance.manage",
      );
      const wrapper = mountWorkspace();
      await flushPromises();

      await wrapper.get(`[data-action="${openAction}"]`).trigger("click");
      const action = wrapper.get(`[data-action="${freshLoginAction}"]`);
      await action.trigger("click");
      await action.trigger("click");
      await flushPromises();

      expect(mocks.logout).toHaveBeenCalledOnce();
      expect(mocks.replace).toHaveBeenCalledOnce();
      expect(mocks.replace).toHaveBeenCalledWith({
        name: "login",
        query: { redirect: "/users?userId=user-1" },
      });
    },
  );

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

    const skeletons = wrapper.get(".conversation-surface__skeletons");
    expect(skeletons.findAll(":scope > i")).toHaveLength(5);
    expect(wrapper.find(".conversation-composer.is-blocked").exists()).toBe(
      true,
    );
    expect(
      wrapper.get(".conversation-composer textarea").attributes("disabled"),
    ).toBeDefined();

    resolveMessages?.({ items: [], nextCursor: null });
    await flushPromises();
    expect(wrapper.find(".conversation-surface__skeletons").exists()).toBe(
      false,
    );
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
        ordinal: index,
        author: "USER" as const,
        status: "COMPLETED" as const,
        text: `Nachricht ${index}`,
        createdAt: `2026-07-20T12:5${index}:00.000Z`,
      })),
      nextCursor: null,
    });
    let resolveTranslation:
      ((value: { items: never[]; queued: boolean }) => void) | undefined;
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

    expect(
      wrapper.get(".conversation-surface__translation-progress").text(),
    ).toContain("0 из 3");
    expect(wrapper.findAll("[data-message-id]")).toHaveLength(3);

    resolveTranslation?.({ items: [], queued: false });
    await flushPromises();
    expect(
      wrapper.find(".conversation-surface__translation-progress").exists(),
    ).toBe(false);
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
        ordinal: 3,
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
          ordinal: 1,
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
          ordinal: 1,
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

  it("загружает настройки перевода только после явного действия оператора", async () => {
    mocks.permissions.push("project.translation.create");
    mocks.getMessages.mockResolvedValue({
      items: [
        {
          id: "german-message",
          conversationId: current.id,
          ordinal: 1,
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

    expect(getTranslation).toHaveBeenCalledTimes(1);
    expect(mocks.toastAdd).toHaveBeenCalledTimes(1);
  });

  it("определяет английский язык по сообщениям, а не по locale профиля", async () => {
    mocks.permissions.push("project.translation.create");
    mocks.profile.mockResolvedValue({
      endUserId: "user-1",
      externalUserId: "customer-1",
      profileVersion: "8",
      syncStatus: "VALID",
      fields: [
        {
          definitionId: "locale",
          definitionRevisionId: "locale-r1",
          key: "locale",
          label: "Язык контента",
          valueType: "STRING",
          lifecycle: "ACTIVE",
          classification: "INTERNAL",
          access: "ALLOWED",
          availability: "AVAILABLE",
          semanticRole: "LOCALE",
          value: { type: "STRING", value: "ru" },
        },
      ],
      observedAt: "2026-07-20T12:00:00.000Z",
      receivedAt: "2026-07-20T12:00:00.000Z",
      ageSeconds: 60,
      contractRevision: 1,
      publicationId: "publication-12",
      publicationSequence: 12,
      provenance: "PRODUCT_PROFILE",
    });
    mocks.getMessages.mockResolvedValue({
      items: [
        {
          id: "english-message-1",
          conversationId: current.id,
          ordinal: 1,
          author: "USER",
          status: "COMPLETED",
          text: "hello i need help",
          createdAt: "2026-07-20T12:58:00.000Z",
        },
        {
          id: "english-message-2",
          conversationId: current.id,
          ordinal: 2,
          author: "USER",
          status: "COMPLETED",
          text: "i have a problem with my deposit, i cant see it",
          createdAt: "2026-07-20T12:59:00.000Z",
        },
      ],
      nextCursor: null,
    });
    const getTranslation = vi.spyOn(
      conversationTranslationApi,
      "getConversation",
    );

    const wrapper = mountWorkspace(current.id);
    await flushPromises();

    expect(wrapper.get(".conversation-badge.accent").text()).toBe("EN");
    expect(getTranslation).not.toHaveBeenCalled();
  });

  it("для русского диалога включает режим перевода без API и ошибок", async () => {
    mocks.permissions.push("project.translation.create");
    const getTranslation = vi
      .spyOn(conversationTranslationApi, "getConversation")
      .mockRejectedValue(new Error("translation unavailable"));
    const translate = vi.spyOn(conversationTranslationApi, "translateMessages");
    mocks.getMessages.mockResolvedValue({
      items: [
        {
          id: "russian-message",
          conversationId: current.id,
          ordinal: 1,
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
    expect(wrapper.find("[data-message-id] button").exists()).toBe(false);
  });

  it("блокирует скролл страницы, пока рабочее пространство открыто", async () => {
    const wrapper = mountWorkspace(current.id);
    await flushPromises();

    expect(getRootScrollLockCount()).toBe(1);
    expect(document.body.style.position).toBe("fixed");

    wrapper.unmount();
    expect(getRootScrollLockCount()).toBe(0);
    expect(document.body.style.position).toBe("");
  });

  it("разворачивает Users workspace через общий presentation shell", async () => {
    const wrapper = mountWorkspace(current.id);
    await flushPromises();

    const toggle = wrapper.get(
      'button[aria-label="Развернуть рабочее место на всю вкладку"]',
    );
    await toggle.trigger("click");
    await nextTick();

    const shell = wrapper.get('[data-testid="workspace-presentation-shell"]');
    expect(shell.attributes("data-presentation-mode")).toBe("full-tab");
    expect(wrapper.find(".p-dialog-maximized").exists()).toBe(false);
    expect(getRootScrollLockCount()).toBe(1);

    wrapper.unmount();
    expect(getRootScrollLockCount()).toBe(0);
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
      `retenive:reply-translation-draft:project-1:user-1:${current.id}`,
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

  it("сохраняет визуальный anchor при добавлении предыдущей страницы истории", async () => {
    let resolveOlder:
      | ((value: Awaited<ReturnType<typeof mocks.getMessages>>) => void)
      | undefined;
    mocks.getMessages
      .mockResolvedValueOnce({
        items: [
          {
            id: "current-message",
            conversationId: current.id,
            ordinal: 2,
            author: "USER",
            status: "COMPLETED",
            text: "Текущее сообщение",
            createdAt: "2026-07-20T12:59:00.000Z",
          },
        ],
        nextCursor: "older",
      })
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveOlder = resolve;
        }),
      );
    const wrapper = mountWorkspace(current.id);
    await flushPromises();
    const history = wrapper.get<HTMLElement>(
      ".conversation-surface__log",
    ).element;
    Object.defineProperties(history, {
      clientHeight: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, value: 600 },
      scrollTop: { configurable: true, value: 40, writable: true },
    });

    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Показать предыдущие сообщения"))
      ?.trigger("click");
    Object.defineProperty(history, "scrollHeight", {
      configurable: true,
      value: 900,
    });
    resolveOlder?.({
      items: [
        {
          id: "older-message",
          conversationId: current.id,
          ordinal: 1,
          author: "ASSISTANT",
          status: "COMPLETED",
          text: "Предыдущее сообщение",
          createdAt: "2026-07-19T12:59:00.000Z",
        },
      ],
      nextCursor: null,
    });
    await flushPromises();

    expect(history.scrollTop).toBe(340);
    expect(
      wrapper.findAll("[data-message-id]").map((message) => message.text()),
    ).toEqual([
      expect.stringContaining("Предыдущее сообщение"),
      expect.stringContaining("Текущее сообщение"),
    ]);
  });

  it("следует за live-сообщением только у нижней границы истории", async () => {
    const wrapper = mountWorkspace(current.id);
    await flushPromises();
    const history = wrapper.get<HTMLElement>(
      ".conversation-surface__log",
    ).element;
    const scrollTo = vi.mocked(history.scrollTo);
    let scrollTop = 660;
    Object.defineProperties(history, {
      clientHeight: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, value: 1000 },
      scrollTop: {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => {
          scrollTop = value;
        },
      },
    });
    scrollTo.mockClear();
    const event = {
      contractVersion: 1,
      projectId: "project-1",
      endUserId: "user-1",
      conversationId: current.id,
      message: {
        id: "near-bottom-message",
        threadId: current.id,
        ordinal: 3,
        role: "USER",
        status: "COMPLETED",
        text: "Сообщение у нижней границы",
        createdAt: "2026-07-20T13:01:00.000Z",
        updatedAt: "2026-07-20T13:01:00.000Z",
      },
    };

    mocks.messageHandler?.(event);
    await flushPromises();

    expect(scrollTo).toHaveBeenCalledWith({ top: 1000, behavior: "auto" });
    expect(wrapper.find(".conversation-surface__new-messages").exists()).toBe(
      false,
    );

    scrollTop = 200;
    scrollTo.mockClear();
    mocks.messageHandler?.({
      ...event,
      message: {
        ...event.message,
        id: "while-reading-message",
        ordinal: 4,
        text: "Сообщение во время чтения истории",
        createdAt: "2026-07-20T13:02:00.000Z",
        updatedAt: "2026-07-20T13:02:00.000Z",
      },
    });
    await flushPromises();

    expect(scrollTo).not.toHaveBeenCalled();
    expect(wrapper.get(".conversation-surface__new-messages").text()).toContain(
      "1 новое сообщение",
    );
  });

  it("восстанавливает отдельный public draft при возврате в диалог", async () => {
    const second = {
      ...current,
      id: "conversation-second",
      title: "Второй разговор",
      isCurrent: false,
      currentInteractionSessionCount: 0,
      lastMessageAt: "2026-07-20T12:00:00.000Z",
    };
    mocks.getConversations.mockResolvedValue({
      items: [current, second],
      nextCursor: null,
    });
    mocks.getMessages.mockImplementation(
      async (_projectId, _endUserId, conversationId) => ({
        items: [
          {
            id: `message-${conversationId}`,
            conversationId,
            ordinal: 1,
            author: "USER",
            status: "COMPLETED",
            text: `Сообщение ${conversationId}`,
            createdAt: "2026-07-20T12:59:00.000Z",
          },
        ],
        nextCursor: null,
      }),
    );
    const wrapper = mountWorkspace(current.id);
    await flushPromises();
    const composer = () =>
      wrapper.get('textarea[aria-label="Ответ пользователю"]');
    const conversationButton = (title: string) =>
      wrapper
        .findAll(".conversation-list button")
        .find((button) => button.text().includes(title))!;

    await composer().setValue("Черновик текущего разговора");
    await conversationButton("Второй разговор").trigger("click");
    await flushPromises();
    expect((composer().element as HTMLTextAreaElement).value).toBe("");

    await composer().setValue("Черновик второго разговора");
    await conversationButton("Текущий разговор").trigger("click");
    await flushPromises();
    expect((composer().element as HTMLTextAreaElement).value).toBe(
      "Черновик текущего разговора",
    );

    await conversationButton("Второй разговор").trigger("click");
    await flushPromises();
    expect((composer().element as HTMLTextAreaElement).value).toBe(
      "Черновик второго разговора",
    );
  });

  it("сохраняет Surface, draft и history anchor при переходе профиль → чат", async () => {
    const wrapper = mountWorkspace(current.id);
    await flushPromises();
    const surface = wrapper.get(".conversation-surface").element;
    const history = wrapper.get<HTMLElement>(
      ".conversation-surface__log",
    ).element;
    history.scrollTop = 184;
    await wrapper
      .get('textarea[aria-label="Ответ пользователю"]')
      .setValue("Черновик до просмотра профиля");

    await wrapper.get('[data-action="open-profile"]').trigger("click");
    expect(
      wrapper.get<HTMLElement>('[data-testid="chat-workspace"]').element.style
        .display,
    ).toBe("none");
    await wrapper.get('[data-action="open-chat"]').trigger("click");

    expect(wrapper.get(".conversation-surface").element).toBe(surface);
    expect(history.scrollTop).toBe(184);
    expect(
      (
        wrapper.get('textarea[aria-label="Ответ пользователю"]')
          .element as HTMLTextAreaElement
      ).value,
    ).toBe("Черновик до просмотра профиля");
  });

  it("purges the scoped Surface draft on project and user switch", async () => {
    const wrapper = mountWorkspace(current.id);
    await flushPromises();
    const previousSurface = wrapper.get(".conversation-surface").element;
    await wrapper
      .get('textarea[aria-label="Ответ пользователю"]')
      .setValue("Чувствительный черновик user-1");

    await wrapper.setProps({ projectId: "project-2", endUserId: "user-2" });
    await flushPromises();

    expect(mocks.unwatchConversation).toHaveBeenCalledWith(current.id);
    expect(wrapper.get(".conversation-surface").element).not.toBe(
      previousSurface,
    );
    expect(
      (
        wrapper.get('textarea[aria-label="Ответ пользователю"]')
          .element as HTMLTextAreaElement
      ).value,
    ).toBe("");
  });

  it("purges the selected conversation and draft when read permission is revoked", async () => {
    const wrapper = mountWorkspace(current.id);
    await flushPromises();
    await wrapper
      .get('textarea[aria-label="Ответ пользователю"]')
      .setValue("Секрет из отозванного диалога");

    mocks.permissions.splice(
      mocks.permissions.indexOf("project.conversations.read"),
      1,
    );
    mocks.permissionRevision!.value += 1;
    await flushPromises();

    expect(mocks.unwatchConversation).toHaveBeenCalledWith(current.id);
    expect(wrapper.findComponent(ConversationSurface).exists()).toBe(false);
    expect(wrapper.text()).not.toContain("Секрет из отозванного диалога");
  });

  it("purges the composer attempt and draft when reply permission is revoked", async () => {
    const wrapper = mountWorkspace(current.id);
    await flushPromises();
    await wrapper
      .get('textarea[aria-label="Ответ пользователю"]')
      .setValue("Секретный черновик ответа");

    mocks.permissions.splice(
      mocks.permissions.indexOf("project.conversations.reply"),
      1,
    );
    mocks.permissionRevision!.value += 1;
    await flushPromises();
    expect(
      wrapper.find('textarea[aria-label="Ответ пользователю"]').exists(),
    ).toBe(false);

    mocks.permissions.push("project.conversations.reply");
    mocks.permissionRevision!.value += 1;
    await flushPromises();

    expect(
      (
        wrapper.get('textarea[aria-label="Ответ пользователю"]')
          .element as HTMLTextAreaElement
      ).value,
    ).toBe("");
    expect(wrapper.text()).not.toContain("Секретный черновик ответа");
  });

  it("closes and purges the new-conversation draft when reply permission is revoked", async () => {
    const wrapper = mountWorkspace(current.id);
    await flushPromises();
    await wrapper
      .findAll("button")
      .find((button) => button.text().trim() === "Новый")!
      .trigger("click");
    await wrapper
      .get('textarea[aria-label="Первое сообщение нового диалога"]')
      .setValue("Секретный черновик нового диалога");

    mocks.permissions.splice(
      mocks.permissions.indexOf("project.conversations.reply"),
      1,
    );
    mocks.permissionRevision!.value += 1;
    await flushPromises();

    expect(
      wrapper
        .find('textarea[aria-label="Первое сообщение нового диалога"]')
        .exists(),
    ).toBe(false);
    expect(wrapper.text()).not.toContain("Секретный черновик нового диалога");

    mocks.permissions.push("project.conversations.reply");
    mocks.permissionRevision!.value += 1;
    await flushPromises();
    await wrapper
      .findAll("button")
      .find((button) => button.text().trim() === "Новый")!
      .trigger("click");

    expect(
      (
        wrapper.get('textarea[aria-label="Первое сообщение нового диалога"]')
          .element as HTMLTextAreaElement
      ).value,
    ).toBe("");
  });

  it("purges cached translations and returns to original mode when translation permission is revoked", async () => {
    mocks.permissions.push(
      "project.translation.create",
      "project.translation.provider_details.read",
    );
    vi.spyOn(conversationTranslationApi, "getConversation").mockResolvedValue(
      translationState(true),
    );
    vi.spyOn(conversationTranslationApi, "translateMessages").mockResolvedValue(
      { items: [], queued: false },
    );
    mocks.getMessages.mockResolvedValue({
      items: [
        {
          id: "translated-sensitive-message",
          conversationId: current.id,
          ordinal: 1,
          author: "USER",
          status: "COMPLETED",
          text: "Sensitive original",
          createdAt: "2026-07-20T12:59:00.000Z",
          translation: {
            id: "translation-sensitive",
            direction: "INBOUND",
            status: "COMPLETED",
            originalText: "Sensitive original",
            translatedText: "Секретный перевод",
            deliveredText: null,
            viewText: "Секретный перевод",
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
    await wrapper
      .get('[data-action="show-translated-messages"]')
      .trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Секретный перевод");

    mocks.permissions.splice(
      mocks.permissions.indexOf("project.translation.create"),
      1,
    );
    mocks.permissionRevision!.value += 1;
    await flushPromises();

    expect(wrapper.text()).toContain("Sensitive original");
    expect(wrapper.text()).not.toContain("Секретный перевод");
    expect(
      wrapper.find('[aria-label="Режим отображения сообщений"]').exists(),
    ).toBe(false);

    mocks.translationHandler?.({
      contractVersion: 1,
      projectId: "project-1",
      endUserId: "user-1",
      conversationId: current.id,
      messageId: "translated-sensitive-message",
      translation: {
        id: "late-sensitive-translation",
        direction: "INBOUND",
        status: "COMPLETED",
        originalText: "Sensitive original",
        translatedText: "Поздний секретный перевод",
        deliveredText: null,
        viewText: "Поздний секретный перевод",
        sourceLocale: "de",
        targetLocale: "ru",
        errorCode: null,
        warnings: [],
        updatedAt: "2026-07-20T13:01:00.000Z",
      },
    });
    mocks.permissions.push("project.translation.create");
    mocks.permissionRevision!.value += 1;
    await flushPromises();
    await wrapper
      .get('[data-action="show-translated-messages"]')
      .trigger("click");
    await flushPromises();

    expect(wrapper.text()).not.toContain("Поздний секретный перевод");
  });

  it("treats realtime without a server ordinal as a REST reconcile hint", async () => {
    const wrapper = mountWorkspace(current.id);
    await flushPromises();
    mocks.getMessages.mockClear();

    mocks.messageHandler?.({
      contractVersion: 1,
      projectId: "project-1",
      endUserId: "user-1",
      conversationId: current.id,
      message: {
        id: "ordinal-less-hint",
        threadId: current.id,
        role: "USER",
        status: "COMPLETED",
        text: "Непроверенная realtime-проекция",
        createdAt: "2026-07-20T13:01:00.000Z",
        updatedAt: "2026-07-20T13:01:00.000Z",
      },
    });
    await flushPromises();

    expect(mocks.getMessages).toHaveBeenCalledWith(
      "project-1",
      "user-1",
      current.id,
      { limit: 20 },
    );
    expect(wrapper.text()).not.toContain("Непроверенная realtime-проекция");
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
        ordinal: 3,
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
        ordinal: 4,
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

    await wrapper
      .get(".conversation-composer__actions > button")
      .trigger("click");
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

    await wrapper
      .get(".conversation-composer__actions > button")
      .trigger("click");
    expect(
      wrapper.get(".conversation-composer__action-menu").text(),
    ).not.toContain("Шаблон ответа");

    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Шаблоны"))
      ?.trigger("click");

    expect(
      wrapper.get('[data-testid="reply-template-gallery"]').text(),
    ).toContain("Галерея шаблонов");
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

  describe("characterization: Users chat during Conversation Surface migration", () => {
    it("keeps the current log, translation toggle, pagination and composer landmarks", async () => {
      mocks.permissions.push("project.translation.create");
      vi.spyOn(conversationTranslationApi, "getConversation").mockResolvedValue(
        translationState(true),
      );
      const wrapper = mountWorkspace(current.id);
      await flushPromises();

      expect(wrapper.get('[role="log"]').attributes("aria-live")).toBe(
        "polite",
      );
      expect(
        wrapper
          .findAll('[aria-label="Режим отображения сообщений"] button')
          .map((button) => button.text().replace(/\s+/g, " ").trim()),
      ).toEqual(["Оригинал", "Перевод · RU"]);
      expect(wrapper.text()).toContain("Показать предыдущие сообщения");
      expect(wrapper.findComponent(ConversationComposer).exists()).toBe(true);
      expect(
        wrapper.get('textarea[aria-label="Ответ пользователю"]').element,
      ).toBeInstanceOf(HTMLTextAreaElement);
    });

    it("does not send the legacy draft during IME composition or with Shift+Enter", async () => {
      mocks.sendAdminMessage.mockResolvedValue({ threadId: current.id });
      const wrapper = mountWorkspace(current.id);
      await flushPromises();
      const textarea = wrapper.get('textarea[aria-label="Ответ пользователю"]');
      await textarea.setValue("Проверю статус платежа");

      await textarea.trigger("keydown", { key: "Enter", isComposing: true });
      await textarea.trigger("keydown", { key: "Enter", shiftKey: true });
      expect(mocks.sendAdminMessage).not.toHaveBeenCalled();

      await textarea.trigger("keydown", { key: "Enter" });
      await flushPromises();
      expect(mocks.sendAdminMessage).toHaveBeenCalledTimes(1);
    });
  });
});
