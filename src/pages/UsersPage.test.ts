import { flushPromises, shallowMount } from "@vue/test-utils";
import DataTable from "primevue/datatable";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UsersPage from "./UsersPage.vue";

const profile = {
  endUserId: "user-1",
  externalUserId: "customer-1",
  profileVersion: "8",
  syncStatus: "VALID" as const,
  lastSeenAt: "2026-07-16T10:00:00.000Z",
  observedAt: "2026-07-16T09:59:00.000Z",
  fields: [],
  conversationAiSuspensionSummary: {
    activeConversationCount: 0,
    nearestSuspendedUntil: null,
    mostRecentlyStartedConversationId: null,
    serverTime: "2026-07-20T13:00:00.000Z",
  },
};
const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  profile: vi.fn(),
  getConversations: vi.fn(),
  getConversation: vi.fn(),
  getMessages: vi.fn(),
  getSessions: vi.fn(),
  sendAdminMessage: vi.fn(),
  ingestConversations: vi.fn(),
  applyConfirmedState: vi.fn(),
  loadSuspension: vi.fn(),
  getSuspensionEntry: vi.fn(),
  startSuspension: vi.fn(),
  extendSuspension: vi.fn(),
  resumeSuspension: vi.fn(),
  replace: vi.fn(),
  routeParams: {} as Record<string, string>,
  routeQuery: {} as Record<string, string>,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

vi.mock("@/features/auth/auth.store", () => ({
  useAuthStore: () => ({ project: { id: "project-1" }, user: { role: "OWNER" } }),
}));
vi.mock("@/features/conversation-ai-suspension/model/conversation-ai-suspension.store", () => ({
  useConversationAISuspensionStore: () => ({
    changeRevision: 0,
    ingestConversations: mocks.ingestConversations,
    applyConfirmedState: mocks.applyConfirmedState,
    loadDetail: mocks.loadSuspension,
    getEntry: mocks.getSuspensionEntry,
    start: mocks.startSuspension,
    extend: mocks.extendSuspension,
    resume: mocks.resumeSuspension,
  }),
}));
vi.mock("vue-router", () => ({
  useRoute: () => ({ params: mocks.routeParams, query: mocks.routeQuery }),
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock("@/shared/api/repository", () => ({
  repository: {
    mode: "api",
    getConversations: mocks.getConversations,
    getConversation: mocks.getConversation,
    getMessages: mocks.getMessages,
    getSessions: mocks.getSessions,
    sendAdminMessage: mocks.sendAdminMessage,
  },
}));
vi.mock("@/features/end-user-profile/api/end-user-profile-repository", () => ({
  endUserProfileRepository: { list: mocks.list, profile: mocks.profile },
}));

describe("UsersPage Current Profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mocks.routeParams).forEach(
      (key) => delete mocks.routeParams[key],
    );
    Object.keys(mocks.routeQuery).forEach(
      (key) => delete mocks.routeQuery[key],
    );
    mocks.list.mockResolvedValue({ items: [profile], nextCursor: null });
    mocks.profile.mockResolvedValue({
      ...profile,
      contractRevision: 3,
      ageSeconds: 60,
      receivedAt: profile.lastSeenAt,
      provenance: "PRODUCT_PROFILE",
    });
    mocks.getConversations.mockResolvedValue({ items: [], nextCursor: null });
    mocks.getConversation.mockResolvedValue(null);
    mocks.getMessages.mockResolvedValue({ items: [], nextCursor: null });
    mocks.getSessions.mockResolvedValue([]);
  });

  it("loads detail only after the operator opens a Current Profile", async () => {
    const wrapper = shallowMount(UsersPage);
    await flushPromises();
    expect(mocks.profile).not.toHaveBeenCalled();
    wrapper.getComponent(DataTable).vm.$emit("row-click", { data: profile });
    await flushPromises();
    expect(mocks.profile).toHaveBeenCalledWith("project-1", "user-1");
  });

  it("links to the dedicated profile field page with Russian product copy", async () => {
    const wrapper = shallowMount(UsersPage);
    await flushPromises();

    expect(wrapper.text()).toContain("Профили пользователей");
    expect(wrapper.find('button-stub[to="/profile-fields"]').exists()).toBe(
      true,
    );
    expect(wrapper.text()).not.toContain("Current Profiles");
  });

  it("translates an absent profile status and omits the redundant language column", async () => {
    mocks.list.mockResolvedValue({
      items: [{ ...profile, syncStatus: "NO_VALID_SNAPSHOT" }],
      nextCursor: null,
    });
    const wrapper = shallowMount(UsersPage);
    await flushPromises();

    const vm = wrapper.vm as unknown as {
      syncStatusLabel: (status: string) => string;
    };
    expect(vm.syncStatusLabel("NO_VALID_SNAPSHOT")).toBe(
      "Профиль ещё не передан",
    );
    expect(wrapper.find('column-stub[header="Язык"]').exists()).toBe(false);
  });

  it("keeps backend cursor pagination and sort parameters", async () => {
    mocks.list
      .mockResolvedValueOnce({
        items: [profile],
        nextCursor: "opaque-profile-cursor",
      })
      .mockResolvedValueOnce({
        items: [
          { ...profile, endUserId: "user-2", externalUserId: "customer-2" },
        ],
        nextCursor: null,
      });
    const wrapper = shallowMount(UsersPage);
    await flushPromises();
    expect(mocks.list).toHaveBeenCalledWith("project-1", {
      limit: 50,
      sort: "LAST_SEEN_DESC",
    });
    await wrapper.find('button-stub[label="Загрузить ещё"]').trigger("click");
    await flushPromises();
    expect(mocks.list).toHaveBeenLastCalledWith("project-1", {
      limit: 50,
      cursor: "opaque-profile-cursor",
      sort: "LAST_SEEN_DESC",
    });
  });

  it("keeps the latest selected profile when requests resolve out of order", async () => {
    const other = {
      ...profile,
      endUserId: "user-2",
      externalUserId: "customer-2",
    };
    mocks.list.mockResolvedValue({ items: [profile, other], nextCursor: null });
    const first = deferred<Record<string, unknown>>();
    const second = deferred<Record<string, unknown>>();
    mocks.profile
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const wrapper = shallowMount(UsersPage);
    await flushPromises();
    const table = wrapper.getComponent(DataTable);

    table.vm.$emit("row-click", { data: profile });
    table.vm.$emit("row-click", { data: other });
    second.resolve({
      ...other,
      profileVersion: "B-VERSION",
      contractRevision: 4,
      ageSeconds: 20,
      receivedAt: other.lastSeenAt,
      provenance: "PRODUCT_PROFILE",
    });
    await flushPromises();
    first.resolve({
      ...profile,
      profileVersion: "A-VERSION",
      contractRevision: 3,
      ageSeconds: 60,
      receivedAt: profile.lastSeenAt,
      provenance: "PRODUCT_PROFILE",
    });
    await flushPromises();

    expect(
      (wrapper.vm as unknown as { detail: { profileVersion: string } }).detail
        .profileVersion,
    ).toBe("B-VERSION");
  });

  it("opens the exact user and conversation from a proposal deep link", async () => {
    mocks.routeParams.endUserId = "user-1";
    mocks.routeQuery.conversationId = "conversation-1";
    mocks.getConversations.mockResolvedValue({
      items: [
        {
          id: "conversation-1",
          userId: "user-1",
          title: "Поддержка",
          status: "ACTIVE",
          lastMessageAt: "2026-07-19T18:00:00.000Z",
          messageCount: 2,
          aiSuspension: { mode: "AUTOMATIC", lifecycle: "NONE", version: "0", suspendedUntil: null, serverTime: "2026-07-20T13:00:00.000Z" },
        },
      ],
      nextCursor: null,
    });

    shallowMount(UsersPage);
    await flushPromises();

    expect(mocks.profile).toHaveBeenCalledWith("project-1", "user-1");
    expect(mocks.getConversations).toHaveBeenCalledWith("project-1", "user-1", {
      limit: 30,
    });
    expect(mocks.getMessages).toHaveBeenCalledWith(
      "project-1",
      "user-1",
      "conversation-1",
      { limit: 50 },
    );
  });

  it("loads an exact deep-linked user even when it is absent from the first page", async () => {
    mocks.routeParams.endUserId = "user-off-page";
    const exactSummary = {
      ...profile,
      endUserId: "user-off-page",
      externalUserId: "customer-off-page",
      conversationAiSuspensionSummary: {
        activeConversationCount: 1,
        nearestSuspendedUntil: "2026-07-20T14:00:00.000Z",
        mostRecentlyStartedConversationId: "conversation-99",
        serverTime: "2026-07-20T13:00:00.000Z",
      },
    };
    mocks.list
      .mockResolvedValueOnce({ items: [profile], nextCursor: "next-page" })
      .mockResolvedValueOnce({ items: [exactSummary], nextCursor: null });
    mocks.profile.mockResolvedValue({
      ...profile,
      endUserId: "user-off-page",
      externalUserId: "customer-off-page",
      contractRevision: 3,
      ageSeconds: 60,
      receivedAt: profile.lastSeenAt,
      provenance: "PRODUCT_PROFILE",
    });

    shallowMount(UsersPage);
    await flushPromises();

    expect(mocks.profile).toHaveBeenCalledWith("project-1", "user-off-page");
    expect(mocks.list).toHaveBeenLastCalledWith("project-1", {
      limit: 50,
      externalUserId: "customer-off-page",
    });
    expect(mocks.getConversations).toHaveBeenCalledWith(
      "project-1",
      "user-off-page",
      { limit: 30 },
    );
  });

  it("добавляет точный диалог по глубокой ссылке, если его нет на первой странице", async () => {
    mocks.routeParams.endUserId = "user-1";
    mocks.routeQuery.conversationId = "conversation-99";
    mocks.getConversations.mockResolvedValue({ items: [], nextCursor: "next" });
    mocks.getConversation.mockResolvedValue({
      id: "conversation-99", userId: "user-1", title: "Точная поддержка", status: "ACTIVE",
      lastMessageAt: "2026-07-20T13:00:00.000Z", messageCount: 1,
      aiSuspension: { mode: "SUSPENDED", lifecycle: "ACTIVE", version: "2", suspendedUntil: "2026-07-20T14:00:00.000Z", serverTime: "2026-07-20T13:00:00.000Z" },
    });

    shallowMount(UsersPage);
    await flushPromises();

    expect(mocks.getConversation).toHaveBeenCalledWith("project-1", "user-1", "conversation-99");
    expect(mocks.getMessages).toHaveBeenCalledWith("project-1", "user-1", "conversation-99", { limit: 50 });
  });

  it("точечно обновляет сводку открытого пользователя, исчезнувшего из фильтрованной страницы", async () => {
    mocks.routeParams.endUserId = "user-1";
    const wrapper = shallowMount(UsersPage);
    await flushPromises();
    const resumedProfile = {
      ...profile,
      conversationAiSuspensionSummary: {
        ...profile.conversationAiSuspensionSummary,
        activeConversationCount: 0,
      },
    };
    mocks.list
      .mockResolvedValueOnce({ items: [], nextCursor: null })
      .mockResolvedValueOnce({ items: [resumedProfile], nextCursor: null });

    await (wrapper.vm as unknown as {
      refreshSelectedSummary(endUserId: string): Promise<void>;
    }).refreshSelectedSummary("user-1");

    expect(
      (wrapper.vm as unknown as {
        selected: { conversationAiSuspensionSummary: { activeConversationCount: number } };
      }).selected.conversationAiSuspensionSummary.activeConversationCount,
    ).toBe(0);
  });
});
