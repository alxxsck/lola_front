import { flushPromises, shallowMount } from "@vue/test-utils";
import DataTable from "primevue/datatable";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UserWorkspaceDialog from "@/features/end-user-workspace/UserWorkspaceDialog.vue";
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
  replace: vi.fn(),
  routeParams: {} as Record<string, string>,
  routeQuery: {} as Record<string, string>,
}));

vi.mock("@/features/auth/auth.store", () => ({
  useAuthStore: () => ({
    project: { id: "project-1" },
  }),
}));
vi.mock("vue-router", () => ({
  useRoute: () => ({ params: mocks.routeParams, query: mocks.routeQuery }),
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock("@/features/end-user-profile/api/end-user-profile-repository", () => ({
  endUserProfileRepository: { list: mocks.list, profile: mocks.profile },
}));

function mountPage() {
  return shallowMount(UsersPage, {
    global: {
      stubs: {
        RouterLink: true,
        DataTable: {
          name: "DataTable",
          template: "<div><slot /></div>",
        },
      },
    },
  });
}

describe("страница профилей с единым рабочим пространством", () => {
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
  });

  it("открывает общий workspace по клику на строку и сохраняет пользователя в URL", async () => {
    const wrapper = mountPage();
    await flushPromises();

    wrapper.getComponent(DataTable).vm.$emit("row-click", { data: profile });
    await flushPromises();

    const workspace = wrapper.getComponent(UserWorkspaceDialog);
    expect(workspace.props()).toMatchObject({
      visible: true,
      projectId: "project-1",
      endUserId: "user-1",
      externalUserId: "customer-1",
    });
    expect(mocks.replace).toHaveBeenCalledWith({
      name: "users",
      params: { endUserId: "user-1" },
    });
    expect(mocks.profile).not.toHaveBeenCalled();
  });

  it("передаёт workspace точный диалог из глубокой ссылки", async () => {
    mocks.routeParams.endUserId = "user-1";
    mocks.routeQuery.conversationId = "conversation-42";
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.getComponent(UserWorkspaceDialog).props()).toMatchObject({
      visible: true,
      endUserId: "user-1",
      preferredConversationId: "conversation-42",
    });
  });

  it("обновляет deep-link при выборе другого диалога в workspace", async () => {
    const wrapper = mountPage();
    await flushPromises();
    wrapper.getComponent(DataTable).vm.$emit("row-click", { data: profile });
    await flushPromises();
    mocks.replace.mockClear();

    wrapper
      .getComponent(UserWorkspaceDialog)
      .vm.$emit("conversation-selected", "conversation-2");
    await flushPromises();

    expect(mocks.replace).toHaveBeenCalledWith({
      name: "users",
      params: { endUserId: "user-1" },
      query: { conversationId: "conversation-2" },
    });
  });

  it("убирает conversation deep-link при возврате к профилю", async () => {
    const wrapper = mountPage();
    await flushPromises();
    wrapper.getComponent(DataTable).vm.$emit("row-click", { data: profile });
    await flushPromises();
    mocks.replace.mockClear();

    wrapper.getComponent(UserWorkspaceDialog).vm.$emit("profile-selected");
    await flushPromises();

    expect(mocks.replace).toHaveBeenCalledWith({
      name: "users",
      params: { endUserId: "user-1" },
    });
  });

  it("находит пользователя глубокой ссылки вне первой страницы точным запросом", async () => {
    const offPage = {
      ...profile,
      endUserId: "user-off-page",
      externalUserId: "customer-off-page",
    };
    mocks.routeParams.endUserId = offPage.endUserId;
    mocks.list
      .mockResolvedValueOnce({ items: [], nextCursor: "next" })
      .mockResolvedValueOnce({ items: [offPage], nextCursor: null });
    mocks.profile.mockResolvedValue({ ...offPage, contractRevision: 3 });

    const wrapper = mountPage();
    await flushPromises();

    expect(mocks.profile).toHaveBeenCalledWith("project-1", offPage.endUserId);
    expect(mocks.list).toHaveBeenLastCalledWith("project-1", {
      limit: 50,
      externalUserId: offPage.externalUserId,
    });
    expect(wrapper.getComponent(UserWorkspaceDialog).props("endUserId")).toBe(
      offPage.endUserId,
    );
  });

  it("не пытается открывать deep link и не показывает ошибку для пустого route-параметра", async () => {
    mocks.routeParams.endUserId = "";
    mocks.profile.mockRejectedValue(new Error("should not be called"));

    const wrapper = mountPage();
    await flushPromises();

    expect(mocks.profile).not.toHaveBeenCalled();
    expect(wrapper.text()).not.toContain(
      "Не удалось открыть пользователя по ссылке",
    );
  });

  it("не применяет запоздалую страницу после более нового запроса", async () => {
    let finishOld!: (value: unknown) => void;
    const oldRequest = new Promise((resolve) => {
      finishOld = resolve;
    });
    mocks.list
      .mockReturnValueOnce(oldRequest)
      .mockResolvedValueOnce({
        items: [{ ...profile, externalUserId: "new-result" }],
        nextCursor: null,
      });
    const wrapper = mountPage();
    const newer = (wrapper.vm as unknown as { load(): Promise<void> }).load();
    await newer;
    finishOld({
      items: [{ ...profile, externalUserId: "stale-result" }],
      nextCursor: null,
    });
    await flushPromises();

    expect(
      (wrapper.vm as unknown as { items: (typeof profile)[] }).items[0]
        ?.externalUserId,
    ).toBe("new-result");
  });

  it("сохраняет понятную продуктовую навигацию к настройке полей", async () => {
    const wrapper = mountPage();
    await flushPromises();
    expect(wrapper.text()).toContain("Профили пользователей");
    expect(wrapper.find('button-stub[to="/profile-fields"]').exists()).toBe(
      true,
    );
  });

  it("оставляет в таблице только полезные колонки состояния профиля", async () => {
    const wrapper = mountPage();
    await flushPromises();

    const headers = wrapper
      .findAll("column-stub")
      .map((column) => column.attributes("header"))
      .filter(Boolean);
    expect(headers).toEqual([
      "Пользователь",
      "Состояние",
      "Версия профиля",
      "Данные получены",
      "Последняя активность",
    ]);
  });

  it("показывает системное имя над external ID и не использует внутренний ID", async () => {
    const wrapper = mountPage();
    await flushPromises();
    const namedProfile = {
      ...profile,
      fields: [
        {
          definitionId: "display-name",
          definitionRevisionId: "display-name-r1",
          key: "nickname",
          label: "Имя пользователя",
          valueType: "STRING",
          lifecycle: "ACTIVE",
          classification: "INTERNAL",
          access: "ALLOWED",
          availability: "AVAILABLE",
          semanticRole: "DISPLAY_NAME",
          value: { type: "STRING", value: "Анна Смирнова" },
        },
      ],
    };
    const page = wrapper.vm as unknown as {
      userDisplayName(value: typeof namedProfile): string;
      userProductId(value: typeof namedProfile): string;
    };

    expect(page.userDisplayName(namedProfile)).toBe("Анна Смирнова");
    expect(page.userProductId(namedProfile)).toBe("customer-1");
    expect(page.userDisplayName(profile)).toBe("customer-1");
    expect(page.userProductId(profile)).toBe("customer-1");
  });
});
