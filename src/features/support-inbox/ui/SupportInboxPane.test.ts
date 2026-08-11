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
    slaSignal: null,
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

const systemView = {
  code: "MY_ACTIVE" as const,
  permitted: true,
  surface: "CASES" as const,
  scope: "SYSTEM" as const,
  displayNameKey: "my-active",
  count: { state: "EXACT" as const, value: 3, cappedAt: 100 },
  freshness: {
    state: "READY" as const,
    lagSeconds: 0,
    indexedThrough: "2026-08-08T10:00:00.000Z",
    sourceWatermarks: {},
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
  it("keeps the direct mode control alongside the unified view picker", () => {
    const wrapper = render({ viewSystem: [systemView] });

    expect(wrapper.find(".inbox-modes").exists()).toBe(true);
    expect(wrapper.find(".inbox-tools__trigger").exists()).toBe(true);
  });

  it("shows canonical system views before remote view metadata arrives", async () => {
    const wrapper = render({
      mode: "ALL_CONVERSATIONS",
      viewSystem: [],
      viewSelection: null,
      viewActive: false,
    });
    const trigger = wrapper.get(".inbox-tools__trigger");

    expect(trigger.text()).toContain("Все диалоги");
    expect(trigger.text()).toContain("Системное представление");

    await trigger.trigger("click");

    expect(wrapper.text()).toContain("Мои обращения");
    expect(wrapper.text()).toContain("Неназначенные команды");
    expect(wrapper.text()).toContain("Все обращения");
    expect(wrapper.text()).toContain("Все диалоги");
  });

  it("keeps search tools compact until the operator opens them", async () => {
    const wrapper = render({ viewSystem: [systemView] });
    const trigger = wrapper.get(".inbox-tools__trigger");

    expect(trigger.attributes("aria-expanded")).toBe("false");
    expect(wrapper.find(".inbox-tools__panel").exists()).toBe(false);
    expect(trigger.text()).toContain("Поиск и представления");

    await trigger.trigger("click");

    expect(trigger.attributes("aria-expanded")).toBe("true");
    expect(wrapper.get(".inbox-tools__panel").isVisible()).toBe(true);
    expect(wrapper.text()).toContain("Мои обращения");
    expect(wrapper.find("[data-support-search-input]").exists()).toBe(true);
  });

  it("shows the active view in the compact summary and collapses after selection", async () => {
    const wrapper = render({
      viewSystem: [systemView],
      viewSelection: { kind: "SYSTEM", code: "MY_ACTIVE" },
      viewActive: true,
    });
    const trigger = wrapper.get(".inbox-tools__trigger");

    expect(trigger.text()).toContain("Мои обращения");
    expect(trigger.text()).toContain("Системное представление");

    await trigger.trigger("click");
    await wrapper.get(".view-list button").trigger("click");

    expect(wrapper.emitted("selectView")?.[0]).toEqual([
      { kind: "SYSTEM", code: "MY_ACTIVE" },
    ]);
    expect(trigger.attributes("aria-expanded")).toBe("false");
    expect(wrapper.find(".inbox-tools__panel").exists()).toBe(false);
  });

  it("summarizes active filters while their controls stay collapsed", () => {
    const wrapper = render({
      searchActive: true,
      searchState: {
        ...searchState,
        filters: { priorities: ["HIGH"], assignmentStates: ["UNASSIGNED"] },
      },
    });
    const trigger = wrapper.get(".inbox-tools__trigger");

    expect(trigger.text()).toContain("Настроенный поиск");
    expect(trigger.text()).toContain("Обращения · 2 фильтра");
    expect(trigger.attributes("aria-expanded")).toBe("false");
    expect(wrapper.find(".search-controls").exists()).toBe(false);
  });

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

  it("renders a compact Case row without duplicating its attention state", () => {
    const wrapper = render();
    const row = wrapper.get(".case-row");

    expect(row.get(".case-row__sequence").text()).toBe("42");
    expect(row.get(".case-row__headline").text()).toContain(
      "Очень длинное название обращения о возврате платежа",
    );
    expect(row.get(".case-row__metadata").text()).toContain(
      "Нужен оператор",
    );
    expect(row.get(".case-row__priority").classes()).toContain(
      "case-row__priority--emphasis",
    );
    expect(row.text()).not.toContain("Нужна реакция");
    expect(row.find(".case-row__attention-icon").exists()).toBe(true);
    expect(row.classes()).not.toContain("case-row--with-sla");
    expect(wrapper.text()).not.toMatch(/SLA|назнач/i);
    expect(row.attributes("aria-label")).toContain(
      "Очень длинное название обращения о возврате платежа",
    );
    expect(row.attributes("aria-label")).toContain("BILLING");
    expect(row.attributes("title")).toContain("BILLING");
    expect(row.get("time").attributes("title")).toContain("2026");
  });

  it("keeps the loaded count mounted while replacing rows with skeletons", async () => {
    const wrapper = render();

    expect(wrapper.get(".support-inbox-heading p").text()).toBe("Загружено: 1");
    await wrapper.setProps({ items: [], loading: true });

    expect(wrapper.get(".support-inbox-heading p").text()).toBe("Загружено: 1");
    expect(wrapper.findAll(".inbox-skeleton-row")).toHaveLength(14);
  });

  it("renders mode-shaped skeleton rows without PrimeVue stretch markers", () => {
    const cases = render({ items: [], loading: true });
    const caseSkeleton = cases.get(".inbox-skeleton-row");

    expect(caseSkeleton.classes()).toContain("is-case");
    expect(caseSkeleton.find(".inbox-skeleton-marker").exists()).toBe(true);
    expect(caseSkeleton.find(".inbox-skeleton-title").exists()).toBe(true);
    expect(caseSkeleton.find(".inbox-skeleton-time").exists()).toBe(true);
    expect(caseSkeleton.find(".p-skeleton").exists()).toBe(false);

    const conversations = render({
      mode: "ALL_CONVERSATIONS",
      items: [],
      loading: true,
    });
    expect(conversations.get(".inbox-skeleton-row").classes()).toContain(
      "is-conversation",
    );
  });

  it("renders one compact SLA forecast with the full explanation available", () => {
    const wrapper = render({
      items: [
        {
          ...items[0]!,
          slaSignal: {
            state: "AVAILABLE",
            signalCode: "SLA_AT_RISK",
            kind: "FIRST_HUMAN_RESPONSE",
            timing: "RUNNING",
            risk: "AT_RISK",
            pauseReason: null,
            currentDeadlineAt: "2026-08-08T10:15:00.000Z",
            remainingBusinessMs: 900_000,
            computedAt: "2026-08-08T10:00:00.000Z",
          },
        },
      ],
    });

    const signal = wrapper.get("[data-sla-signal]");
    expect(signal.text()).toContain("Риск первого ответа");
    expect(signal.text()).toContain("15 мин");
    expect(signal.text()).toContain("прогноз");
    expect(signal.text()).not.toContain("теневой прогноз");
    expect(signal.attributes("title")).toContain(
      "Прогноз не является договорным сроком",
    );
    expect(wrapper.get(".case-row").attributes("aria-describedby")).toBe(
      "case-sla-description-case-1",
    );
    expect(wrapper.get("#case-sla-description-case-1").text()).toContain(
      "не является договорным сроком",
    );
    expect(wrapper.get(".case-row").classes()).toContain("case-row--with-sla");
  });

  it("keeps a normal priority as quiet metadata instead of another chip", () => {
    const wrapper = render({
      items: [
        {
          ...items[0]!,
          priority: "NORMAL",
          attentionRequired: false,
        },
      ],
    });

    const priority = wrapper.get(".case-row__priority");
    expect(priority.text()).toBe("Обычный");
    expect(priority.classes()).not.toContain("case-row__priority--emphasis");
  });

  it("changes server-owned mode and selects the exact typed row", async () => {
    const wrapper = render({ canSearch: false });

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

  it("marks the search result for the open chat as selected", () => {
    const wrapper = render({
      selectedKey: "CONVERSATION:conversation-1",
      searchActive: true,
      searchItems: [
        {
          id: "conversation-1",
          kind: "CONVERSATION",
          selection: { kind: "CONVERSATION", id: "conversation-1" },
          snippet: "Открытая переписка",
          activityAt: "2026-08-08T10:00:00.000Z",
          matchProvenance: "ORIGINAL",
          locale: "ru",
        },
      ],
      searchFreshness: {
        state: "READY",
        lagSeconds: 0,
        indexedThrough: "2026-08-08T10:00:00.000Z",
      },
    });

    const row = wrapper.get(".search-result-row");
    expect(row.classes()).toContain("selected");
    expect(row.attributes("aria-current")).toBe("true");
    expect(row.attributes("data-selection-key")).toBe(
      "CONVERSATION:conversation-1",
    );
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
