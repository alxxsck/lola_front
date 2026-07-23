import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ProjectSettingsSectionHeader from "./ProjectSettingsSectionHeader.vue";

describe("ProjectSettingsSectionHeader", () => {
  it("starts collapsed and emits expansion from the shared toggle", async () => {
    const wrapper = mount(ProjectSettingsSectionHeader, {
      props: {
        title: "Память Lola",
        description: "Настройки памяти",
        icon: "pi pi-book",
        contentId: "memory-settings",
        expanded: false,
      },
    });

    const toggle = wrapper.get("button");
    expect(toggle.attributes("aria-expanded")).toBe("false");
    expect(toggle.attributes("aria-controls")).toBe("memory-settings");
    expect(wrapper.get("header").classes()).toContain("is-collapsed");

    await toggle.trigger("click");

    expect(wrapper.emitted("update:expanded")).toEqual([[true]]);
  });
});
