import { flushPromises, mount } from "@vue/test-utils";
import PrimeVue from "primevue/config";
import { describe, expect, it } from "vitest";

import ScenarioActionTargetPicker, {
  type ScenarioActionTargetOption,
} from "./ScenarioActionTargetPicker.vue";

const targets: ScenarioActionTargetOption[] = [
  {
    value: "say_1",
    name: "Сказать текст",
    code: "say_1",
    description: "Уже настроенный шаг с сообщением",
    kind: "existing",
    executor: "SERVER",
  },
  {
    value: "catalog-action-open-page",
    name: "Открыть страницу",
    code: "OPEN_PAGE",
    description: "Создаст новый шаг и откроет раздел интерфейса",
    kind: "create",
    actionType: "OPEN_PAGE",
    executor: "FRONTEND",
  },
];

describe("ScenarioActionTargetPicker", () => {
  it("shows existing and new targets together and applies a single outlined choice", async () => {
    const wrapper = mount(ScenarioActionTargetPicker, {
      props: {
        modelValue: "",
        options: targets,
        label: "Следующее действие",
        placeholder: "Завершить или выбрать действие",
        allowEmpty: true,
      },
      global: { plugins: [PrimeVue] },
    });

    await wrapper
      .get('[data-testid="action-target-picker-trigger"]')
      .trigger("click");
    await flushPromises();

    expect(
      wrapper
        .findAll('[data-testid="action-target-picker-option"]')
        .map((option) => option.text()),
    ).toEqual([
      expect.stringMatching(/В сценарии.*Сказать текст/),
      expect.stringMatching(/Добавить в сценарий.*Открыть страницу/),
    ]);
    expect(wrapper.text()).not.toContain("Создать новый шаг");
    const options = wrapper.findAll('[role="option"]');
    expect(options[0]?.find('input[type="checkbox"]').exists()).toBe(false);

    await options[1]!.trigger("click");
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    expect(options[1]?.attributes("aria-selected")).toBe("true");
    await wrapper
      .get('[data-testid="action-target-picker-apply"]')
      .trigger("click");

    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    expect(wrapper.emitted("select")).toEqual([[targets[1]]]);
  });

  it("filters existing scenario steps separately from actions that create a new step", async () => {
    const wrapper = mount(ScenarioActionTargetPicker, {
      props: {
        modelValue: "",
        options: targets,
        label: "Следующее действие",
        placeholder: "Выберите действие",
      },
      global: { plugins: [PrimeVue] },
    });

    await wrapper
      .get('[data-testid="action-target-picker-trigger"]')
      .trigger("click");
    await flushPromises();
    await wrapper
      .get('[data-testid="action-target-picker-filter-existing"]')
      .trigger("click");
    await flushPromises();

    const options = wrapper.findAll(
      '[data-testid="action-target-picker-option"]',
    );
    expect(options).toHaveLength(1);
    expect(options[0]?.text()).toContain("say_1");
  });
});
