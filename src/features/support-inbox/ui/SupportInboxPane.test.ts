import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type { SupportInboxItem } from "@/features/support-workspace/api/support-workspace-source";
import SupportInboxPane from "./SupportInboxPane.vue";

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
});
