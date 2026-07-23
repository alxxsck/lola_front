import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { createEmptyBroadcastDraft } from "../model/telegram-broadcast";
import TelegramBroadcastDraftForm from "./TelegramBroadcastDraftForm.vue";

describe("TelegramBroadcastDraftForm", () => {
  it("exposes content limits and associates validation feedback with each field", async () => {
    const wrapper = mount(TelegramBroadcastDraftForm, {
      props: {
        draft: createEmptyBroadcastDraft(),
        disabled: false,
      },
    });

    const title = wrapper.get("#broadcast-title");
    const text = wrapper.get("#broadcast-text");
    expect(title.attributes("maxlength")).toBe("120");
    expect(text.attributes("maxlength")).toBe("4096");

    await title.setValue(" ");
    await text.setValue(" ");
    await wrapper.get("form").trigger("submit");

    expect(title.attributes("aria-invalid")).toBe("true");
    expect(title.attributes("aria-describedby")).toBe("broadcast-title-error");
    expect(wrapper.get("#broadcast-title-error").text()).toBe(
      "Укажите название рассылки.",
    );
    expect(text.attributes("aria-invalid")).toBe("true");
    expect(text.attributes("aria-describedby")).toBe("broadcast-text-error");
    expect(wrapper.get("#broadcast-text-error").text()).toBe(
      "Введите сообщение.",
    );
  });
});
