import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TechnicalIdentifier from "./TechnicalIdentifier.vue";

describe("TechnicalIdentifier", () => {
  const writeText = vi.fn();

  beforeEach(() => {
    writeText.mockReset();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
  });

  it("copies the full identifier and confirms the action", async () => {
    writeText.mockResolvedValue(undefined);
    const wrapper = mount(TechnicalIdentifier, {
      props: { label: "Analysis ID", value: "analysis-full-id" },
    });

    await wrapper.get("button").trigger("click");
    await flushPromises();

    expect(writeText).toHaveBeenCalledWith("analysis-full-id");
    expect(wrapper.text()).toContain("Скопировано");
    expect(wrapper.get("button").attributes("aria-label")).toBe(
      "Analysis ID скопирован",
    );
  });

  it("reports clipboard errors without claiming success", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    const wrapper = mount(TechnicalIdentifier, {
      props: { label: "Operation ID", value: "operation-full-id" },
    });

    await wrapper.get("button").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Не удалось скопировать");
  });
});
