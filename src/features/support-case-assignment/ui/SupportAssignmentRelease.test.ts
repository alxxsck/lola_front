import { mount } from "@vue/test-utils";
import PrimeVue from "primevue/config";
import { describe, expect, it } from "vitest";
import SupportAssignmentRelease from "./SupportAssignmentRelease.vue";

function render(
  overrides: Partial<InstanceType<typeof SupportAssignmentRelease>["$props"]> = {},
) {
  return mount(SupportAssignmentRelease, {
    props: {
      releasing: false,
      error: "",
      unknownOutcome: false,
      completed: false,
      canRetry: false,
      ...overrides,
    },
    global: {
      plugins: [PrimeVue],
      stubs: {
        Dialog: {
          props: ["visible"],
          template: "<div v-if=\"visible\"><slot /><slot name=\"footer\" /></div>",
        },
        Select: {
          props: ["modelValue", "options"],
          emits: ["update:modelValue"],
          template: `
            <select :value="modelValue" v-bind="$attrs" @change="$emit('update:modelValue', $event.target.value)">
              <option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          `,
        },
      },
    },
  });
}

describe("SupportAssignmentRelease", () => {
  it("requires confirmation and emits a typed default reason without internal assignment data", async () => {
    const wrapper = render();

    await wrapper.get("button[aria-label='Снять назначение']").trigger("click");
    expect(wrapper.text()).toContain("Case вернётся в серверный workflow");
    expect(wrapper.text()).toContain("Работа возвращена в очередь");
    await wrapper
      .get("button[aria-label='Подтвердить снятие']")
      .trigger("click");

    expect(wrapper.emitted("release")).toEqual([
      [{ reasonCode: "WORK_RETURNED" }],
    ]);
    expect(wrapper.html()).not.toContain("assignment-1");
    expect(wrapper.html()).not.toContain("sa1.");
  });

  it("makes an unknown outcome replayable with one explicit action", async () => {
    const wrapper = render({
      unknownOutcome: true,
      canRetry: true,
      error: "Результат снятия назначения неизвестен.",
    });

    expect(wrapper.get("button[aria-label='Снять назначение']").attributes("disabled")).toBeDefined();
    await wrapper
      .get("button[aria-label='Повторить тот же запрос']")
      .trigger("click");

    expect(wrapper.emitted("retry")).toEqual([[]]);
  });
});
