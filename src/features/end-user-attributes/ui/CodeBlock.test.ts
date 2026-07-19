import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CodeBlock from "./CodeBlock.vue";

describe("CodeBlock", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it("shows formatted code and copies it without an editable textarea", async () => {
    const wrapper = mount(CodeBlock, {
      props: {
        title: "Пример профиля",
        language: "JSON",
        code: '{\n  "city": "Madrid"\n}',
      },
    });

    expect(wrapper.get("pre code").text()).toContain('"city": "Madrid"');
    expect(wrapper.find("textarea").exists()).toBe(false);
    await wrapper.get("button").trigger("click");
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      '{\n  "city": "Madrid"\n}',
    );
    expect(wrapper.get("button").text()).toContain("Скопировано");
  });
});
