import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import SupportSearchToolbar from "./SupportSearchToolbar.vue";
import type { SupportSearchRouteState } from "@/features/support-search/model/support-search-route";

const state: SupportSearchRouteState = {
  phrase: "возврат платежа",
  scope: "CASES" as const,
  filters: {
    statuses: ["OPEN"],
    priorities: ["HIGH"],
    slaStates: ["ON_TRACK"],
    waitingSides: ["END_USER"],
    channels: ["TEXT"],
    categoryCodes: ["INFORMATION_REQUEST"],
  },
  sort: { field: "SLA_DUE_AT", direction: "ASC" as const },
};

describe("SupportSearchToolbar", () => {
  it("shows active server constraints and emits a normalized submit", async () => {
    const wrapper = mount(SupportSearchToolbar, {
      props: { modelValue: state, active: true, loading: false },
    });

    expect(wrapper.text()).toContain("Статус: Открыто");
    expect(wrapper.text()).toContain("Приоритет: Высокий");
    expect(wrapper.text()).toContain("Срок SLA");
    expect(wrapper.text()).toContain("SLA: В норме");
    expect(wrapper.text()).toContain("Ожидаем: пользователя");
    expect(wrapper.text()).toContain("Канал: Текст");
    expect(wrapper.text()).toContain("Категория: Информация");
    expect(wrapper.text()).not.toContain("ON_TRACK");
    await wrapper.get("form").trigger("submit");

    expect(wrapper.emitted("submit")?.[0]?.[0]).toMatchObject({
      phrase: "возврат платежа",
      scope: "CASES",
      filters: { statuses: ["OPEN"], priorities: ["HIGH"] },
    });
  });

  it("drops Case filters when switching to Messages and closes on Escape", async () => {
    const wrapper = mount(SupportSearchToolbar, {
      props: { modelValue: state, active: true, loading: false },
    });

    await wrapper
      .get('select[aria-label="Область поиска"]')
      .setValue("MESSAGES");
    expect(wrapper.emitted("update:modelValue")?.at(-1)?.[0]).toMatchObject({
      scope: "MESSAGES",
      filters: {},
      sort: { field: "RELEVANCE", direction: "DESC" },
    });
    await wrapper.get("[data-support-search-input]").trigger("keydown.escape");
    expect(wrapper.emitted("close")).toHaveLength(1);
  });
});
