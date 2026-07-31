import { shallowMount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import AIOperationFilters from "./AIOperationFilters.vue";

describe("AIOperationFilters", () => {
  it("keeps cost owner and data subject as separate filters", () => {
    const wrapper = shallowMount(AIOperationFilters, {
      props: { modelValue: {}, loading: false, canReadSubjects: true },
      global: {
        stubs: {
          Select: { template: "<select />" },
          InputText: {
            props: ["placeholder"],
            template: '<input :data-placeholder="placeholder" />',
          },
          DatePicker: { template: "<input />" },
          Button: { template: "<button />" },
        },
      },
    });

    const placeholders = wrapper
      .findAll("input")
      .map((input) => input.attributes("data-placeholder"));
    expect(placeholders).toEqual(
      expect.arrayContaining([
        "ID ответственного администратора",
        "ID владельца AI-лимита",
        "ID участника анализа",
      ]),
    );
  });

  it("does not expose exact subject filters without the subject permission", () => {
    const wrapper = shallowMount(AIOperationFilters, {
      props: { modelValue: {}, loading: false, canReadSubjects: false },
      global: {
        stubs: {
          Select: { template: "<select />" },
          InputText: {
            props: ["placeholder"],
            template: '<input :data-placeholder="placeholder" />',
          },
          DatePicker: { template: "<input />" },
          Button: { template: "<button />" },
        },
      },
    });

    expect(wrapper.text()).not.toContain("ID участника анализа");
    expect(
      wrapper
        .findAll("input")
        .map((input) => input.attributes("data-placeholder")),
    ).not.toContain("ID участника анализа");
  });
});
