import { mount } from "@vue/test-utils";
import PrimeVue from "primevue/config";
import { describe, expect, it } from "vitest";
import SupportReplyComposer from "./SupportReplyComposer.vue";

describe("SupportReplyComposer", () => {
  it("lets an authorized operator send a non-empty public reply", async () => {
    const wrapper = mount(SupportReplyComposer, {
      props: {
        draft: "",
        canReply: true,
        sending: false,
        error: "",
      },
      global: {
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
      },
    });

    await wrapper.get("textarea").setValue("Добрый день!");
    await wrapper.setProps({ draft: "Добрый день!" });
    expect(wrapper.get("button[aria-label='Отправить пользователю']").attributes("disabled")).toBeUndefined();
    await wrapper.get("form").trigger("submit");

    expect(wrapper.emitted("update:draft")).toEqual([["Добрый день!"]]);
    expect(wrapper.emitted("send")).toEqual([[]]);
  });

  it("keeps send disabled while translation policy is being checked", async () => {
    const wrapper = mount(SupportReplyComposer, {
      props: {
        draft: "Сообщение",
        canReply: true,
        canSend: false,
        blockedReason: "Проверяем правила перевода…",
        sending: false,
        error: "",
      },
      global: {
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
            template: "<textarea />",
          },
        },
      },
    });

    expect(wrapper.get("button").attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain("Проверяем правила перевода…");
  });
});
