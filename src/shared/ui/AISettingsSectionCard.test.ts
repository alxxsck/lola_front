import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import AISettingsSectionCard from "./AISettingsSectionCard.vue";

describe("AISettingsSectionCard", () => {
  it("keeps AI settings collapsed by default and reveals the mounted editor", async () => {
    const wrapper = mount(AISettingsSectionCard, {
      props: {
        title: "Память Lola",
        description: "Настройки памяти",
        loading: false,
      },
      slots: {
        default: '<div data-testid="editor">Редактор памяти</div>',
      },
    });

    const toggle = wrapper.get("[aria-controls]");
    const contentId = toggle.attributes("aria-controls");

    expect(toggle.attributes("aria-expanded")).toBe("false");
    expect(wrapper.get(`#${contentId}`).attributes("style")).toContain(
      "display: none",
    );
    expect(wrapper.find('[data-testid="editor"]').exists()).toBe(true);

    await toggle.trigger("click");

    expect(toggle.attributes("aria-expanded")).toBe("true");
    expect(wrapper.get(`#${contentId}`).attributes("style")).not.toContain(
      "display: none",
    );
  });
});
