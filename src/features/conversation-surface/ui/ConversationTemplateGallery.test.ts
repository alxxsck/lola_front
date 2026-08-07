import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { defaultConversationReplyTemplates } from "../model/conversation-reply-templates";
import ConversationTemplateGallery from "./ConversationTemplateGallery.vue";

describe("ConversationTemplateGallery", () => {
  it("returns the selected editable reply template without sending it", async () => {
    const wrapper = mount(ConversationTemplateGallery, {
      props: {
        visible: true,
        templates: defaultConversationReplyTemplates,
      },
    });

    const template = wrapper
      .findAll(".template-gallery__grid > button")
      .find((button) => button.text().includes("Проверяю информацию"));
    expect(template).toBeTruthy();
    await template!.trigger("click");

    expect(wrapper.emitted("select")).toEqual([
      [defaultConversationReplyTemplates[0]],
    ]);
    expect(wrapper.emitted("send")).toBeUndefined();
    expect(document.body.classList).toContain(
      "conversation-template-gallery-open",
    );

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(wrapper.emitted("close")).toEqual([[]]);
    wrapper.unmount();
    expect(document.body.classList).not.toContain(
      "conversation-template-gallery-open",
    );
  });
});
