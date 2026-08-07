import { mount } from "@vue/test-utils";
import PrimeVue from "primevue/config";
import { describe, expect, it } from "vitest";
import type { ConversationSurfaceComposer } from "@/features/conversation-surface/model/conversation-surface-contract";
import ConversationComposer from "@/features/conversation-surface/ui/ConversationComposer.vue";
import SupportReplyComposer from "./SupportReplyComposer.vue";

function composer(
  sendCapability: Extract<
    ConversationSurfaceComposer,
    { mode: "PUBLIC_REPLY" }
  >["sendCapability"] = { kind: "SOURCE" },
): Extract<ConversationSurfaceComposer, { mode: "PUBLIC_REPLY" }> {
  return {
    visibility: "ENABLED",
    mode: "PUBLIC_REPLY",
    scope: {
      projectId: "project-1",
      actorId: "operator-1",
      conversationId: "conversation-1",
    },
    initialDraft: "",
    draftRevision: "1",
    sending: false,
    recipientStatus: null,
    actions: {
      attachment: { visibility: "HIDDEN" },
      createTicket: { visibility: "HIDDEN" },
      templates: { visibility: "HIDDEN" },
      improveWithAI: { visibility: "HIDDEN" },
      sendWithoutTranslation: { visibility: "HIDDEN" },
    },
    sendCapability,
    replyPreview: null,
    translationAssist: null,
  };
}

const global = {
  plugins: [PrimeVue],
  stubs: {
    Button: {
      props: ["label", "disabled", "loading", "type"],
      emits: ["click"],
      template:
        '<button :type="type || \'button\'" :aria-label="label" :disabled="disabled" @click="$emit(\'click\')">{{ label }}</button>',
    },
    Textarea: {
      props: ["modelValue", "disabled"],
      emits: ["update:modelValue", "keydown"],
      template:
        '<textarea :value="modelValue" :disabled="disabled" @input="$emit(\'update:modelValue\', $event.target.value)" @keydown="$emit(\'keydown\', $event)" />',
    },
  },
};

describe("SupportReplyComposer", () => {
  it("adapts the Support workspace to the shared conversation composer", async () => {
    const wrapper = mount(SupportReplyComposer, {
      props: {
        composer: composer(),
        draft: "",
        workingLocaleLabel: "RU",
        error: "",
      },
      global,
    });

    expect(wrapper.findComponent(ConversationComposer).exists()).toBe(true);
    await wrapper.get("textarea").setValue("Добрый день!");
    await wrapper.setProps({ draft: "Добрый день!" });
    expect(
      wrapper.get("button[aria-label='Отправить']").attributes("disabled"),
    ).toBeUndefined();
    await wrapper.get("form").trigger("submit");

    expect(wrapper.emitted("update:draft")).toEqual([["Добрый день!"]]);
    expect(wrapper.emitted("send-source")).toEqual([[]]);
  });

  it("keeps the shared send disabled while translation policy is checked", () => {
    const wrapper = mount(SupportReplyComposer, {
      props: {
        composer: composer({
          kind: "BLOCKED",
          reason: "Проверяем правила перевода…",
        }),
        draft: "Сообщение",
        workingLocaleLabel: "RU",
        error: "",
      },
      global,
    });

    expect(
      wrapper.get("button[aria-label='Отправить']").attributes("disabled"),
    ).toBeDefined();
    expect(wrapper.text()).toContain("Проверяем правила перевода…");
  });
});
