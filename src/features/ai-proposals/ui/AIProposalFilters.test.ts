import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import AIProposalFilters from "./AIProposalFilters.vue";

describe("AIProposalFilters", () => {
  it("labels every filter and marks only active open and unread tabs", () => {
    const wrapper = mount(AIProposalFilters, {
      props: {
        modelValue: { preset: "OPEN", sort: "ATTENTION_FIRST" },
        openCount: 4,
        unreadCount: 2,
      },
      global: {
        stubs: {
          Select: { props: ["modelValue"], template: "<select />" },
          InputText: { template: "<input />" },
          DatePicker: { template: "<input />" },
        },
      },
    });

    expect(wrapper.text()).toContain("Тип запроса");
    expect(wrapper.text()).toContain("Приоритет");
    expect(wrapper.text()).toContain("Порядок");
    expect(wrapper.text()).toContain("Пользователь");
    expect(wrapper.findAll(".tab-notice")).toHaveLength(2);
    expect(wrapper.find('[data-preset="COMPLETED"] .tab-notice').exists()).toBe(
      false,
    );
  });

  it("keeps the chosen calendar day when an end-of-day UTC filter is restored", () => {
    const DatePickerStub = {
      name: "DatePicker",
      props: ["modelValue", "ariaLabel"],
      template: "<input />",
    };
    const wrapper = mount(AIProposalFilters, {
      props: {
        modelValue: {
          preset: "OPEN",
          sort: "ATTENTION_FIRST",
          createdTo: "2026-07-20T23:59:59.999Z",
        },
      },
      global: {
        stubs: {
          Select: { template: "<select />" },
          InputText: { template: "<input />" },
          DatePicker: DatePickerStub,
        },
      },
    });

    const datePickers = wrapper.findAllComponents(DatePickerStub);
    expect(datePickers).toHaveLength(2);
    expect((datePickers[1]!.props("modelValue") as Date).getDate()).toBe(20);
  });
});
