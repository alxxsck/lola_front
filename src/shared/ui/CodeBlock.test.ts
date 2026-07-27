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

  it("renders JSON with syntax highlighting and copies the original source", async () => {
    const code = '{\n  "city": "Madrid",\n  "active": true\n}';
    const wrapper = mount(CodeBlock, {
      props: {
        title: "Тело запроса",
        language: "JSON",
        code,
      },
    });

    expect(wrapper.get("pre code").classes()).toContain("hljs");
    expect(wrapper.get("pre code").html()).toContain("hljs-attr");
    expect(wrapper.get("pre code").html()).toContain("hljs-string");

    await wrapper.get('[aria-label="Скопировать: Тело запроса"]').trigger("click");

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(code);
    expect(wrapper.get('[role="status"]').text()).toBe("Скопировано");
  });

  it("offers disclosure only when the code exceeds the collapsed line limit", async () => {
    const wrapper = mount(CodeBlock, {
      props: {
        title: "Тело запроса",
        code: ["{", '  "one": 1,', '  "two": 2,', '  "three": 3', "}"].join(
          "\n",
        ),
        collapsible: true,
        collapsedLines: 3,
      },
    });

    const toggle = wrapper.get("[aria-controls]");
    expect(toggle.attributes("aria-controls")).toBe(wrapper.get("pre").attributes("id"));
    expect(toggle.text()).toContain("Показать полностью");
    expect(toggle.attributes("aria-expanded")).toBe("false");
    expect(wrapper.get("pre").classes()).toContain("is-collapsed");

    await toggle.trigger("click");

    expect(toggle.text()).toContain("Свернуть");
    expect(toggle.attributes("aria-expanded")).toBe("true");
    expect(wrapper.get("pre").classes()).not.toContain("is-collapsed");
  });

  it("announces a clipboard failure without rejecting the click handler", async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(
      new Error("Clipboard unavailable"),
    );
    const wrapper = mount(CodeBlock, {
      props: {
        title: "Тело запроса",
        code: "{}",
      },
    });

    await wrapper
      .get('[aria-label="Скопировать: Тело запроса"]')
      .trigger("click");

    expect(wrapper.get('[role="status"]').text()).toBe(
      "Не удалось скопировать",
    );
    expect(wrapper.get(".code-actions button").text()).toContain("Ошибка");
  });
});
