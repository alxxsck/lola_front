import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UserWorkspaceDialog from "./UserWorkspaceDialog.vue";

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
  permissions: [
    "project.profiles.read",
    "project.end_users.read",
    "project.conversations.read",
    "project.conversations.reply",
    "project.conversations.ai_suspend",
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

describe("единое рабочее пространство пользователя", () => {
  beforeEach(() => {
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
    );
    mocks.messageHandler = undefined;
    mocks.subscribe.mockImplementation(
      (_events: string[], handler: (value: unknown) => void) => {
        mocks.messageHandler = handler;
        return vi.fn();
      },
    );
    mocks.reconcile.mockReturnValue(vi.fn());
    mocks.onState.mockImplementation((handler: (state: string) => void) => {
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

  function mountWorkspace() {
    return mount(UserWorkspaceDialog, {
      props: {
        visible: true,
        projectId: "project-1",
        endUserId: "user-1",
        externalUserId: "customer-1",
        "onUpdate:visible": mocks.updateVisible,
      },
      global: {
        stubs: {
          Dialog: {
            emits: ["update:visible"],
            template:
              '<section><button data-action="close-dialog" @click="$emit(\'update:visible\', false)">close</button><slot name="header"/><slot/></section>',
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
          Tag: { props: ["value"], template: "<span>{{ value }}</span>" },
          Skeleton: { template: "<span />" },
          Message: { template: "<div><slot /></div>" },
          ConversationAISuspensionBanner: true,
          ConversationAISuspensionDialog: true,
          ConversationAISuspensionHistory: true,
          EndUserTelegramPanel: {
            props: ["visible", "projectId", "endUserId", "canRead", "canSend"],
            emits: ["dirty-change"],
            template:
              '<div v-if="canRead" data-testid="end-user-telegram-panel" :data-project-id="projectId" :data-end-user-id="endUserId" :data-visible="String(visible)" :data-can-send="String(canSend)"><button data-action="telegram-draft-dirty" @click="$emit(\'dirty-change\', true)">dirty</button></div>',
          },
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

  it("игнорирует чужое realtime-событие и принимает событие выбранного диалога", async () => {
    const wrapper = mountWorkspace();
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
});
