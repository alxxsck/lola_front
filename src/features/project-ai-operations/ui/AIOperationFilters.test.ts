import { shallowMount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import AIFilterToggle from "@/shared/ui/AIFilterToggle.vue";
import AIOperationFilters from "./AIOperationFilters.vue";

describe("AIOperationFilters", () => {
  it("keeps mobile filters collapsed and reports the active period", async () => {
    const wrapper = shallowMount(AIOperationFilters, {
      props: {
        modelValue: {
          occurredFrom: "2026-07-01T00:00:00.000Z",
          occurredTo: "2026-08-01T00:00:00.000Z",
        },
        loading: false,
        canReadSubjects: true,
      },
      global: {
        stubs: {
          Select: { template: "<select />" },
          InputText: { template: "<input />" },
          DatePicker: { template: "<input />" },
          Button: { template: "<button />" },
        },
      },
    });

    const toggle = wrapper.getComponent(AIFilterToggle);
    expect(wrapper.get("form").classes()).toContain("collapsed");
    expect(toggle.props("filters")).toEqual({
      occurredFrom: "2026-07-01T00:00:00.000Z",
      occurredTo: "2026-08-01T00:00:00.000Z",
    });
    expect(toggle.props("expanded")).toBe(false);

    toggle.vm.$emit("update:expanded", true);
    await wrapper.vm.$nextTick();

    expect(wrapper.get("form").classes()).not.toContain("collapsed");
    expect(toggle.props("expanded")).toBe(true);
  });

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
