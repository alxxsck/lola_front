import { computed, nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import type { EndUserCaseDetailBundle } from "@/features/end-user-cases/api/end-user-cases-repository";
import SupportCaseDesk from "./SupportCaseDesk.vue";

function controller() {
  const exactCase = ref({
    id: "case-1",
    projectSequence: "42",
    title: "Не поступил депозит",
    status: "IN_PROGRESS",
    priority: "HIGH",
    groupCode: "PAYMENTS",
    type: "PROBLEM_RESOLUTION",
    impact: "HIGH",
    urgency: "HIGH",
    version: 4,
    updatedAt: "2026-08-08T09:00:00.000Z",
    availableStatuses: ["WAITING_END_USER", "RESOLVED"],
    allowedActions: [
      "SET_STATUS_WAITING_END_USER",
      "SET_STATUS_RESOLVED",
      "CHANGE_CLASSIFICATION",
      "RAISE_PRIORITY",
      "LOWER_PRIORITY_TO_FLOOR",
      "REQUEST_ESCALATION",
    ],
    classification: {
      source: "AI",
      confidence: 0.91,
      evidence: [{ id: "message-1", kind: "MESSAGE" }],
    },
    priorityPolicy: {
      effectiveFloor: "NORMAL",
      overrideActive: false,
      policyRevisionId: "policy-7",
      policyVersion: 7,
      reasons: ["Финансовая операция"],
      source: "PLATFORM_RULE",
    },
    priorityReasons: ["Средства не зачислены"],
  });
  return {
    exactCase,
    detail: ref({ timeline: { events: [], revisions: [] } } as unknown as EndUserCaseDetailBundle),
    loading: ref(false),
    mutating: ref(false),
    error: ref<string | null>(null),
    conflict: ref(null),
    reconciling: ref(false),
    reconciliationReason: ref(null),
    load: vi.fn(),
    transition: vi.fn().mockResolvedValue(undefined),
    classify: vi.fn().mockResolvedValue(undefined),
    escalate: vi.fn().mockResolvedValue(undefined),
    retryReconcile: vi.fn().mockResolvedValue(undefined),
    reset: vi.fn(),
    available: computed(() => true),
  };
}

const stubs = {
  Button: {
    props: ["label", "disabled", "loading"],
    emits: ["click"],
    template:
      '<button type="button" :disabled="disabled || loading" @click="$emit(\'click\')">{{ label }}<slot /></button>',
  },
  Dialog: {
    props: ["visible", "header"],
    emits: ["update:visible"],
    template:
      '<section v-if="visible" role="dialog"><h2>{{ header }}</h2><slot/><footer><slot name="footer"/></footer></section>',
  },
  Message: { template: '<div role="alert"><slot /></div>' },
  Select: {
    props: ["modelValue", "options", "optionLabel", "optionValue", "disabled"],
    emits: ["update:modelValue"],
    template:
      '<select :value="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in options" :key="item[optionValue]" :value="item[optionValue]">{{ item[optionLabel] }}</option></select>',
  },
  Textarea: {
    props: ["modelValue"],
    emits: ["update:modelValue"],
    template:
      '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
  InputText: {
    props: ["modelValue"],
    emits: ["update:modelValue"],
    template:
      '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
};

describe("SupportCaseDesk", () => {
  it("renders canonical classification, evidence and the pinned priority floor", () => {
    const wrapper = mount(SupportCaseDesk, {
      props: {
        controller: controller() as never,
        classificationOptions: [{ code: "PAYMENTS", label: "Платежи" }],
      },
      global: { stubs },
    });

    expect(wrapper.get(".case-desk-classification").text()).toContain(
      "Платежи",
    );
    expect(wrapper.get(".case-desk-classification").text()).toContain("91%");
    expect(wrapper.get(".case-desk-evidence").text()).toContain("message-1");
    expect(wrapper.get(".case-desk-policy").text()).toContain("Обычный");
    expect(wrapper.get(".case-desk-policy").text()).toContain("v7");
  });

  it("shows only server-authorized actions and requires an operator reason", async () => {
    const value = controller();
    const wrapper = mount(SupportCaseDesk, {
      props: {
        controller: value as never,
        classificationOptions: [{ code: "PAYMENTS", label: "Платежи" }],
      },
      global: { stubs },
    });

    expect(wrapper.text()).toContain("Изменить классификацию");
    expect(wrapper.text()).toContain("Изменить статус");
    expect(wrapper.text()).toContain("Эскалировать");
    wrapper.vm.requestClassification();
    await nextTick();
    expect(wrapper.get('[role="dialog"]').text()).toContain(
      "Причина изменения",
    );
    expect(wrapper.get(".classification-submit").attributes("disabled")).toBeDefined();
  });

  it("submits only fields touched against the dialog baseline after a concurrent refresh", async () => {
    const value = controller();
    const wrapper = mount(SupportCaseDesk, {
      props: {
        controller: value as never,
        classificationOptions: [
          { code: "PAYMENTS", label: "Платежи" },
          { code: "GENERAL", label: "Общие вопросы" },
        ],
      },
      global: { stubs },
    });
    wrapper.vm.requestClassification();
    await nextTick();
    const selects = wrapper.findAll("select");
    await selects[0]!.setValue("GENERAL");
    await wrapper.find("textarea").setValue("Уточнено оператором");

    value.exactCase.value = {
      ...value.exactCase.value,
      version: 5,
      priority: "URGENT",
    };
    await wrapper.get(".classification-submit").trigger("click");

    expect(value.classify).toHaveBeenCalledWith({
      groupCode: "GENERAL",
      reason: "Уточнено оператором",
    });
  });

  it("offers an explicit recovery action while commands are fail-closed", async () => {
    const value = controller();
    value.reconciling.value = true;
    const wrapper = mount(SupportCaseDesk, {
      props: {
        controller: value as never,
        classificationOptions: [{ code: "PAYMENTS", label: "Платежи" }],
      },
      global: { stubs },
    });

    expect(wrapper.text()).toContain("Новые действия временно недоступны");
    await wrapper.get(".case-desk-reconcile button").trigger("click");
    expect(value.retryReconcile).toHaveBeenCalledOnce();
  });

  it("separates classification authority from priority authority", async () => {
    const value = controller();
    value.exactCase.value = {
      ...value.exactCase.value,
      allowedActions: ["RAISE_PRIORITY"],
    };
    const wrapper = mount(SupportCaseDesk, {
      props: {
        controller: value as never,
        classificationOptions: [{ code: "PAYMENTS", label: "Платежи" }],
      },
      global: { stubs },
    });

    expect(wrapper.text()).toContain("Изменить приоритет");
    wrapper.vm.requestClassification();
    await nextTick();
    const selects = wrapper.findAll("select");
    expect(selects.slice(0, 4).every((item) => item.attributes("disabled") !== undefined)).toBe(true);
    expect(selects[4]!.attributes("disabled")).toBeUndefined();
  });
});
