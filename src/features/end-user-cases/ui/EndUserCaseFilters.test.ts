import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import EndUserCaseFilters from "./EndUserCaseFilters.vue";
import { defaultEndUserCaseFilters } from "../model/end-user-case";

describe("EndUserCaseFilters", () => {
  it("keeps specialist filters collapsed until the operator asks for them", async () => {
    const wrapper = mount(EndUserCaseFilters, {
      props: {
        modelValue: defaultEndUserCaseFilters(),
        counts: { active: 12, attention: 3, resolved: 8 },
      },
      global: {
        stubs: {
          Button: {
            props: ["label"],
            emits: ["click"],
            template:
              '<button data-test="advanced-toggle" @click="$emit(\'click\')">{{ label }}</button>',
          },
          Select: {
            props: ["ariaLabel"],
            template: '<div :aria-label="ariaLabel" />',
          },
          MultiSelect: {
            props: ["ariaLabel"],
            template: '<div :aria-label="ariaLabel" />',
          },
          InputText: {
            props: ["ariaLabel"],
            template: '<div :aria-label="ariaLabel" />',
          },
        },
      },
    });

    expect(wrapper.text()).toContain("Дополнительные фильтры");
    expect(wrapper.find('[aria-label="Статус"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Приоритет"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Сортировка"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="ID пользователя"]').exists()).toBe(false);

    await wrapper.get('[data-test="advanced-toggle"]').trigger("click");
    expect(wrapper.find('[aria-label="ID пользователя"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("Скрыть фильтры");
  });

  it("exposes operational presets with visible counts", async () => {
    const wrapper = mount(EndUserCaseFilters, {
      props: {
        modelValue: defaultEndUserCaseFilters(),
        counts: { active: 12, attention: 3, resolved: 8 },
      },
      global: {
        stubs: {
          Select: true,
          MultiSelect: true,
          InputText: true,
        },
      },
    });
    expect(wrapper.text()).toContain("Активные 12");
    expect(wrapper.text()).toContain("Требуют внимания 3");
    await wrapper.get('[data-preset="ATTENTION"]').trigger("click");
    expect(wrapper.emitted("update:modelValue")?.[0]?.[0]).toEqual({
      preset: "ATTENTION",
      sort: "ATTENTION_FIRST",
    });
  });

  it("emits every server-side filter and clears empty selections", async () => {
    const FieldStub = {
      name: "FieldStub",
      props: ["modelValue"],
      emits: ["update:modelValue"],
      template: "<div />",
    };
    const wrapper = mount(EndUserCaseFilters, {
      props: {
        modelValue: defaultEndUserCaseFilters(),
        counts: { active: 1, attention: 2, resolved: 3 },
      },
      global: {
        stubs: {
          Button: {
            props: ["label"],
            emits: ["click"],
            template:
              '<button data-test="advanced-toggle" @click="$emit(\'click\')">{{ label }}</button>',
          },
          MultiSelect: { ...FieldStub, name: "MultiSelect" },
          InputText: { ...FieldStub, name: "InputText" },
          Select: { ...FieldStub, name: "Select" },
        },
      },
    });
    await wrapper.get('[data-test="advanced-toggle"]').trigger("click");
    const field = (label: string) => {
      const found = [
        ...wrapper.findAllComponents({ name: "MultiSelect" }),
        ...wrapper.findAllComponents({ name: "InputText" }),
        ...wrapper.findAllComponents({ name: "Select" }),
      ].find((component) => component.attributes("aria-label") === label);
      expect(found, label).toBeDefined();
      return found!;
    };

    field("Статус").vm.$emit("update:modelValue", ["WAITING_ADMIN"]);
    field("Приоритет").vm.$emit("update:modelValue", ["CRITICAL"]);
    field("Влияние").vm.$emit("update:modelValue", ["HIGH"]);
    field("Срочность").vm.$emit("update:modelValue", ["IMMEDIATE"]);
    field("Оценка решения").vm.$emit("update:modelValue", ["LIKELY_RESOLVED"]);
    field("Источник решения").vm.$emit("update:modelValue", ["AI_INFERENCE"]);
    field("Код категории").vm.$emit("update:modelValue", "DEPOSIT");
    field("ID исполнителя").vm.$emit("update:modelValue", "admin-id");
    field("ID пользователя").vm.$emit("update:modelValue", "user-id");
    field("Назначение").vm.$emit("update:modelValue", "ASSIGNED");
    field("Основной язык").vm.$emit("update:modelValue", "es");
    field("Эскалация обращения").vm.$emit("update:modelValue", "OPEN");
    field("Участие администратора").vm.$emit("update:modelValue", "YES");
    field("Возврат").vm.$emit("update:modelValue", "YES");
    field("Переоткрытие").vm.$emit("update:modelValue", "YES");
    field("Просроченность").vm.$emit("update:modelValue", "NO");
    field("Состояние анализа").vm.$emit("update:modelValue", "YES");
    field("Канал").vm.$emit("update:modelValue", ["VOICE"]);
    field("Код инструмента Retenive").vm.$emit(
      "update:modelValue",
      "check_deposit",
    );
    field("Результат инструмента").vm.$emit("update:modelValue", ["COMPLETED"]);
    field("Создано с").vm.$emit("update:modelValue", "2026-07-01T00:00:00Z");
    field("Активность до").vm.$emit(
      "update:modelValue",
      "2026-07-31T23:59:59Z",
    );
    await wrapper.vm.$nextTick();

    const values = wrapper
      .emitted("update:modelValue")!
      .map((event) => event[0]);
    expect(values).toContainEqual(
      expect.objectContaining({ status: ["WAITING_ADMIN"] }),
    );
    expect(values).toContainEqual(
      expect.objectContaining({ priority: ["CRITICAL"] }),
    );
    expect(values).toContainEqual(
      expect.objectContaining({ impact: ["HIGH"] }),
    );
    expect(values).toContainEqual(
      expect.objectContaining({ urgency: ["IMMEDIATE"] }),
    );
    expect(values).toContainEqual(
      expect.objectContaining({ resolutionAssessment: ["LIKELY_RESOLVED"] }),
    );
    expect(values).toContainEqual(
      expect.objectContaining({ resolutionSource: ["AI_INFERENCE"] }),
    );
    expect(values).toContainEqual(
      expect.objectContaining({ groupCode: "DEPOSIT" }),
    );
    expect(values).toContainEqual(
      expect.objectContaining({ assignedCmsUserId: "admin-id" }),
    );
    expect(values).toContainEqual(
      expect.objectContaining({ endUserId: "user-id" }),
    );
    expect(values).toContainEqual(
      expect.objectContaining({ assignment: "ASSIGNED" }),
    );
    expect(values).toContainEqual(
      expect.objectContaining({ primaryLanguage: "es" }),
    );
    expect(values).toContainEqual(
      expect.objectContaining({ adminAttention: "OPEN" }),
    );
    expect(values).toContainEqual(
      expect.objectContaining({ cmsParticipation: "YES" }),
    );
    expect(values).toContainEqual(
      expect.objectContaining({ recontacted: "YES" }),
    );
    expect(values).toContainEqual(expect.objectContaining({ reopened: "YES" }));
    expect(values).toContainEqual(expect.objectContaining({ stale: "NO" }));
    expect(values).toContainEqual(expect.objectContaining({ degraded: "YES" }));
    expect(values).toContainEqual(
      expect.objectContaining({ channel: ["VOICE"] }),
    );
    expect(values).toContainEqual(
      expect.objectContaining({ aiCapabilityCode: "check_deposit" }),
    );
    expect(values).toContainEqual(
      expect.objectContaining({ aiCapabilityOutcome: ["COMPLETED"] }),
    );
    expect(values).toContainEqual(
      expect.objectContaining({ createdFrom: "2026-07-01T00:00:00.000Z" }),
    );
    expect(values).toContainEqual(
      expect.objectContaining({
        lastActivityTo: "2026-07-31T23:59:59.000Z",
      }),
    );

    field("Статус").vm.$emit("update:modelValue", []);
    field("Код категории").vm.$emit("update:modelValue", "");
    await wrapper.vm.$nextTick();
    const cleared = wrapper.emitted("update:modelValue")!.slice(-2);
    expect(cleared[0]?.[0]).toEqual(
      expect.objectContaining({ status: undefined }),
    );
    expect(cleared[1]?.[0]).toEqual(
      expect.objectContaining({ groupCode: undefined }),
    );
  });
});
