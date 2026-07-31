import { shallowMount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import AIAnalysisFilters from "./AIAnalysisFilters.vue";

function mountFilters(canReadCost: boolean) {
  return shallowMount(AIAnalysisFilters, {
    props: { modelValue: {}, canReadCost, loading: false },
    global: {
      stubs: {
        Select: { template: "<select />" },
        InputText: {
          props: ["placeholder"],
          template: '<input :data-placeholder="placeholder" />',
        },
        DatePicker: {
          props: ["placeholder"],
          template: '<input :data-placeholder="placeholder" />',
        },
        Button: { template: "<button />" },
      },
    },
  });
}

describe("AIAnalysisFilters", () => {
  it("offers every supported terminal analysis status", () => {
    const wrapper = shallowMount(AIAnalysisFilters, {
      props: { modelValue: {}, canReadCost: false, loading: false },
      global: {
        stubs: {
          Select: {
            name: "Select",
            props: ["options"],
            template: "<select />",
          },
          InputText: { template: "<input />" },
          DatePicker: { template: "<input />" },
          Button: { template: "<button />" },
        },
      },
    });

    const statuses = wrapper
      .findAllComponents({ name: "Select" })[0]!
      .props("options");
    expect(statuses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "EXPIRED" }),
        expect.objectContaining({ value: "OUTCOME_UNKNOWN" }),
      ]),
    );
  });

  it("hides cost-attributed administrator filters without cost permission", () => {
    expect(
      mountFilters(false)
        .findAll("input")
        .some(
          (input) =>
            input.attributes("data-placeholder") ===
            "ID расхода администратора",
        ),
    ).toBe(false);
  });

  it("exposes the protected cost actor filter to an authorized reader", () => {
    expect(
      mountFilters(true)
        .findAll("input")
        .some(
          (input) =>
            input.attributes("data-placeholder") ===
            "ID расхода администратора",
        ),
    ).toBe(true);
  });
});
