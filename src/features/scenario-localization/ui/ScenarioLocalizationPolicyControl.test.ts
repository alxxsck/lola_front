import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ScenarioLocalizationPolicyControl from "./ScenarioLocalizationPolicyControl.vue";
import type { ScenarioLocalizationCatalogResponseDto } from "@/shared/api/generated/models";

const catalog: ScenarioLocalizationCatalogResponseDto = {
  version: 1,
  enabled: true,
  attributeKey: "locale",
  attributeContractRevision: 2,
  defaultLocale: "en",
  localizedValueSchemaVersion: 1,
  policyModes: ["ALL_PROJECT_LOCALES", "SELECTED_LOCALES"],
  locales: [
    { code: "en", language: "en", default: true },
    { code: "es", language: "es", default: false },
  ],
  paths: [],
};

describe("ScenarioLocalizationPolicyControl", () => {
  it("switches explicitly to selected locales and keeps the default locked", async () => {
    const wrapper = mount(ScenarioLocalizationPolicyControl, {
      props: {
        modelValue: { version: 1, mode: "ALL_PROJECT_LOCALES", locales: [] },
        catalog,
      },
    });

    await wrapper.findAll('input[type="radio"]')[1]!.trigger("change");
    expect(wrapper.emitted("update:modelValue")?.at(-1)?.[0]).toEqual({
      version: 1,
      mode: "SELECTED_LOCALES",
      locales: ["en", "es"],
    });

    await wrapper.setProps({
      modelValue: { version: 1, mode: "SELECTED_LOCALES", locales: ["en", "es"] },
    });
    expect(wrapper.find('input[type="checkbox"][disabled]').attributes("checked")).toBeDefined();
    await wrapper.get("button.default-only").trigger("click");
    expect(wrapper.emitted("update:modelValue")?.at(-1)?.[0]).toEqual({
      version: 1,
      mode: "SELECTED_LOCALES",
      locales: ["en"],
    });
  });
});
