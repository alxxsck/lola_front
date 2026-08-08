import { flushPromises, mount } from "@vue/test-utils";
import PrimeVue from "primevue/config";
import { describe, expect, it, vi } from "vitest";

import type { ScenarioActionCatalogItem } from "@/shared/types/domain";
import ActionPicker from "./ActionPicker.vue";

function action(
  type: string,
  name: string,
  description: string,
  executor: "SERVER" | "FRONTEND" = "SERVER",
): ScenarioActionCatalogItem {
  return {
    id: type.toLocaleLowerCase(),
    type,
    name,
    description,
    executor,
    configSchema: { type: "object", properties: {}, required: [] },
    uiSchema: { fields: [] },
    enabled: true,
  };
}

const catalog = [
  action("SAY", "Сказать текст", "Отправляет пользователю сообщение"),
  action(
    "OPEN_PAGE",
    "Открыть страницу",
    "Показывает нужный раздел интерфейса",
    "FRONTEND",
  ),
  action("WAIT_FOR_GOAL", "Ждать цель", "Продолжает после достижения цели"),
];

describe("ActionPicker", () => {
  it("searches actions by name, type and description and commits only after confirmation", async () => {
    vi.useFakeTimers();
    const wrapper = mount(ActionPicker, {
      props: {
        modelValue: "SAY",
        catalog,
        label: "Тип действия",
        placeholder: "Выберите действие",
      },
      global: { plugins: [PrimeVue] },
    });

    await wrapper
      .get('[data-testid="action-picker-trigger"]')
      .trigger("click");
    await flushPromises();
    await wrapper
      .get('[data-testid="action-picker-search"]')
      .setValue("интерфейса");
    await vi.advanceTimersByTimeAsync(250);
    await flushPromises();

    const option = wrapper.get('[data-testid="action-picker-option"]');
    expect(option.text()).toContain("Открыть страницу");
    expect(option.text()).toContain("OPEN_PAGE");
    expect(option.text()).toContain("Показывает нужный раздел интерфейса");

    await option.trigger("click");
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    await wrapper
      .get('[data-testid="action-picker-apply"]')
      .trigger("click");
    expect(wrapper.emitted("update:modelValue")).toEqual([["OPEN_PAGE"]]);
    vi.useRealTimers();
  });

  it("filters logic, waits and product actions without preloading a flat select", async () => {
    const wrapper = mount(ActionPicker, {
      props: {
        modelValue: "",
        catalog: [
          ...catalog,
          action("CONDITION", "Условие", "Разделяет сценарий на ветки"),
        ],
        label: "Добавить действие",
        placeholder: "Выберите действие",
      },
      global: { plugins: [PrimeVue] },
    });

    await wrapper
      .get('[data-testid="action-picker-trigger"]')
      .trigger("click");
    await flushPromises();
    await wrapper
      .get('[data-testid="action-picker-filter-logic"]')
      .trigger("click");
    await flushPromises();

    expect(
      wrapper
        .findAll('[data-testid="action-picker-option"]')
        .map((option) => option.text()),
    ).toEqual([expect.stringContaining("Условие")]);
  });
});
