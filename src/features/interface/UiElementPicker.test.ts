import { flushPromises, mount } from "@vue/test-utils";
import PrimeVue from "primevue/config";
import { describe, expect, it, vi } from "vitest";
import type { UiElement } from "@/shared/types/domain";
import UiElementPicker from "./UiElementPicker.vue";

const elements: UiElement[] = [
  {
    id: "page-home",
    projectId: "project-1",
    code: "home",
    name: "Главная",
    kind: "PAGE",
    route: "/home",
    config: {},
    enabled: true,
    aiEnabled: true,
    aiDescription: "Главный экран личного кабинета",
    aiAliases: ["стартовая страница"],
  },
  {
    id: "modal-deposit",
    projectId: "project-1",
    code: "deposit_modal",
    name: "Пополнение баланса",
    kind: "MODAL",
    modalName: "DepositModal",
    config: {},
    enabled: true,
    aiEnabled: false,
    aiDescription: "Окно ввода суммы пополнения",
    aiAliases: ["депозит"],
  },
  {
    id: "button-legacy",
    projectId: "project-1",
    code: "legacy_button",
    name: "Старая кнопка",
    kind: "BUTTON",
    config: {},
    enabled: false,
    aiEnabled: false,
    aiDescription: "Больше не используется",
    aiAliases: [],
  },
];

describe("UiElementPicker", () => {
  it("searches active targets by name, code, description and aliases", async () => {
    vi.useFakeTimers();
    const wrapper = mount(UiElementPicker, {
      props: {
        modelValue: "",
        elements,
        label: "Цель интерфейса",
        placeholder: "Выберите цель",
      },
      global: { plugins: [PrimeVue] },
    });

    await wrapper.get('[data-testid="ui-element-picker-trigger"]').trigger("click");
    await flushPromises();
    await wrapper
      .get('[data-testid="ui-element-picker-search"]')
      .setValue("депозит");
    await vi.advanceTimersByTimeAsync(250);
    await flushPromises();

    const options = wrapper.findAll('[data-testid="ui-element-picker-option"]');
    expect(options).toHaveLength(1);
    expect(options[0]?.text()).toContain("Пополнение баланса");
    expect(options[0]?.text()).toContain("Окно ввода суммы пополнения");
    vi.useRealTimers();
  });

  it("filters the catalog by compatible interface kind", async () => {
    const wrapper = mount(UiElementPicker, {
      props: {
        modelValue: "",
        elements,
        allowedKinds: ["PAGE", "MODAL"],
        label: "Цель интерфейса",
        placeholder: "Выберите цель",
      },
      global: { plugins: [PrimeVue] },
    });

    await wrapper.get('[data-testid="ui-element-picker-trigger"]').trigger("click");
    await flushPromises();
    await wrapper
      .get('[data-testid="ui-element-picker-filter-modal"]').trigger("click");
    await flushPromises();

    const options = wrapper.findAll('[data-testid="ui-element-picker-option"]');
    expect(options).toHaveLength(1);
    expect(options[0]?.text()).toContain("Пополнение баланса");
  });

  it("commits a single target only after explicit confirmation", async () => {
    const wrapper = mount(UiElementPicker, {
      props: {
        modelValue: "",
        elements,
        allowedKinds: ["PAGE"],
        label: "Страница",
        placeholder: "Выберите страницу",
      },
      global: { plugins: [PrimeVue] },
    });

    await wrapper.get('[data-testid="ui-element-picker-trigger"]').trigger("click");
    await flushPromises();
    const option = wrapper.get('[data-testid="ui-element-picker-option"]');
    expect(option.find('input[type="checkbox"]').exists()).toBe(false);

    await option.trigger("click");
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    expect(wrapper.get('[role="option"]').attributes("aria-selected")).toBe(
      "true",
    );

    await wrapper.get('[data-testid="ui-element-picker-apply"]').trigger("click");
    expect(wrapper.emitted("update:modelValue")).toEqual([["home"]]);
  });
});
