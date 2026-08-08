import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type { SupportInboxItem } from "@/features/support-workspace/api/support-workspace-source";
import SupportInboxPane from "./SupportInboxPane.vue";
import type { SupportSearchRouteState } from "@/features/support-search/model/support-search-route";

const searchState: SupportSearchRouteState = {
  phrase: "",
  scope: "CASES",
  filters: {},
  sort: { field: "RELEVANCE", direction: "DESC" },
};

const items: SupportInboxItem[] = [
  {
    kind: "CASE",
    id: "case-1",
    endUserId: "user-1",
    projectSequence: "42",
    title: "Очень длинное название обращения о возврате платежа",
    status: "WAITING_ADMIN",
    priority: "HIGH",
    groupCode: "BILLING",
    attentionRequired: true,
    lastActivityAt: "2026-08-07T10:00:00.000Z",
    updatedAt: "2026-08-07T10:00:00.000Z",
    version: 3,
  },
];

const unreadConversation: SupportInboxItem = {
  kind: "CONVERSATION",
  id: "conversation-1",
  endUserId: "user-1",
  title: "Вопрос по депозиту",
  status: "OPEN",
  createdAt: "2026-08-07T09:00:00.000Z",
  updatedAt: "2026-08-07T10:00:00.000Z",
  messageCount: 8,
  isCurrent: true,
  currentInteractionSessionCount: 1,
  lastMessageAt: "2026-08-07T10:00:00.000Z",
  readState: {
    conversationId: "conversation-1",
    lastReadOrdinal: 5,
    highestOrdinal: 8,
    firstUnreadOrdinal: 6,
    unreadMessageCount: 3,
    unreadCustomerMessageCount: 2,
    updatedAt: "2026-08-07T09:55:00.000Z",
  },
};

function render(overrides: Record<string, unknown> = {}) {
  return mount(SupportInboxPane, {
    props: {
      mode: "CASES",
      items,
      selectedKey: "CASE:case-1",
      loading: false,
      error: "",
      failure: "NONE",
      hasMore: false,
      canReadCases: true,
      canReadConversations: true,
      canSearch: true,
      searchState,
      searchActive: false,
      searchItems: [],
      searchLoading: false,
      searchError: "",
      searchFailure: "NONE",
      searchFreshness: null,
      searchHasMore: false,
      viewSystem: [],
      viewSaved: [],
      viewSelection: null,
      viewCanCreate: false,
      viewCanManageAll: false,
      viewMutating: false,
      viewConflict: "",
      viewActive: false,
      ...overrides,
    },
    global: {
      stubs: {
        Skeleton: { template: '<span class="skeleton" />' },
      },
    },
  });
}

describe("SupportInboxPane", () => {
  it("renders the authoritative unread count without deriving it from time", () => {
    const wrapper = render({
      mode: "ALL_CONVERSATIONS",
      items: [unreadConversation],
      selectedKey: undefined,
    });

    const badge = wrapper.get('[data-unread-conversation="conversation-1"]');
    expect(badge.text()).toBe("3");
    expect(badge.attributes("aria-label")).toContain(
      "3 непрочитанных сообщения, 2 от пользователя",
    );
  });

  it("renders authoritative Case signals without unavailable SLA or assignment", () => {
    const wrapper = render();

    expect(wrapper.text()).toContain("Обращения");
    expect(wrapper.text()).toContain("Все чаты");
    expect(wrapper.text()).toContain("Нужен оператор");
    expect(wrapper.text()).toContain("Высокий");
    expect(wrapper.text()).toContain("Нужна реакция");
    expect(wrapper.text()).not.toMatch(/SLA|назнач/i);
    expect(
      wrapper.get('.inbox-row[aria-current="true"]').attributes("title"),
    ).toBeUndefined();
  });

  it("changes server-owned mode and selects the exact typed row", async () => {
    const wrapper = render();

    await wrapper.findAll(".inbox-modes button")[1]!.trigger("click");
    await wrapper.get(".inbox-row").trigger("click");

    expect(wrapper.emitted("changeMode")?.[0]).toEqual(["ALL_CONVERSATIONS"]);
    expect(wrapper.emitted("select")?.[0]?.[0]).toMatchObject({
      kind: "CASE",
      id: "case-1",
    });
  });

  it("keeps pane geometry and exposes retry for initial and pagination errors", async () => {
    const emptyError = render({
      items: [],
      error: "Сеть недоступна",
      failure: "ERROR",
    });
    expect(emptyError.get("[role=alert]").text()).toContain(
      "Не удалось загрузить входящие",
    );
    await emptyError.get("[role=alert] button").trigger("click");
    expect(emptyError.emitted("retry")).toHaveLength(1);

    const paginationError = render({
      error: "Следующая страница недоступна",
      failure: "ERROR",
    });
    expect(paginationError.get(".pagination-error").text()).toContain(
      "Следующая страница недоступна",
    );
  });

  it("renders a neutral forbidden state without concealed row metadata", () => {
    const wrapper = render({
      items: [],
      error: "Доступ изменился",
      failure: "FORBIDDEN",
    });

    expect(wrapper.text()).toContain("Входящие больше недоступны");
    expect(wrapper.text()).not.toContain("возврата платежа");
  });

  it("renders a mode-specific empty state", () => {
    expect(render({ items: [] }).text()).toContain("Обращений пока нет");
    expect(render({ items: [], mode: "ALL_CONVERSATIONS" }).text()).toContain(
      "Чатов пока нет",
    );
  });

  it("renders server search results with provenance and degraded freshness", async () => {
    const wrapper = render({
      searchState: { ...searchState, phrase: "payment", scope: "MESSAGES" },
      searchActive: true,
      searchItems: [
        {
          id: "message-1",
          kind: "MESSAGE",
          selection: { kind: "CONVERSATION", id: "conversation-1" },
          snippet: "Safe server snippet",
          activityAt: "2026-08-08T10:00:00.000Z",
          matchProvenance: "TRANSLATION",
          locale: "es",
        },
      ],
      searchFreshness: {
        state: "DEGRADED",
        lagSeconds: 42,
        indexedThrough: "2026-08-08T09:59:18.000Z",
      },
    });

    expect(wrapper.text()).toContain("Индекс отстаёт");
    expect(wrapper.text()).toContain("Safe server snippet");
    expect(wrapper.text()).toContain("Совпадение в переводе");
    await wrapper.get(".search-result-row").trigger("click");
    expect(wrapper.emitted("selectSearch")?.[0]?.[0]).toMatchObject({
      id: "message-1",
      selection: { kind: "CONVERSATION", id: "conversation-1" },
    });
  });

  it("renders no-results after a successful filter-only search", () => {
    const wrapper = render({
      searchState: {
        ...searchState,
        filters: { assignmentStates: ["UNASSIGNED"] },
      },
      searchActive: true,
      searchFreshness: {
        state: "READY",
        lagSeconds: 0,
        indexedThrough: "2026-08-08T10:00:00.000Z",
      },
    });

    expect(wrapper.text()).toContain("Ничего не найдено");
    expect(wrapper.text()).not.toContain("Введите запрос");
  });
});
