import { computed, ref } from "vue";
import { mount } from "@vue/test-utils";
import PrimeVue from "primevue/config";
import { describe, expect, it, vi } from "vitest";
import SupportLeadAssignmentBatchDesk from "./SupportLeadAssignmentBatchDesk.vue";

describe("SupportLeadAssignmentBatchDesk", () => {
  it("renders partial outcome item by item instead of collapsing it into success", async () => {
    const controller = {
      rows: ref([]),
      preparing: ref(false),
      mutating: ref(false),
      reconciling: ref(false),
      error: ref(""),
      reasonNote: ref("Балансировка очереди"),
      result: ref({
        batchId: "batch-1",
        status: "COMPLETED",
        outcome: "PARTIAL",
        itemCount: 2,
        processedCount: 2,
        succeededCount: 1,
        failedCount: 1,
        items: [
          { clientItemId: "item-1", caseId: "case-1", status: "SUCCEEDED" },
          {
            clientItemId: "item-2",
            caseId: "case-2",
            status: "FAILED",
            error: { code: "OPERATOR_CAPACITY_EXCEEDED" },
          },
        ],
      }),
      unknownOutcome: ref(false),
      hasAuthority: ref(true),
      hasForceAuthority: ref(true),
      readyCount: computed(() => 0),
      prepare: vi.fn(),
      setTarget: vi.fn(),
      setReasonNote: vi.fn(),
      submit: vi.fn(),
      reconcileUnknownOutcome: vi.fn(),
      reset: vi.fn(),
    };
    const wrapper = mount(SupportLeadAssignmentBatchDesk, {
      props: {
        controller: controller as never,
        caseIds: ["case-1", "case-2"],
        caseLabels: { "case-1": "Платёжный риск", "case-2": "SLA-риск" },
      },
      global: {
        plugins: [PrimeVue],
        stubs: {
          Dialog: {
            props: ["visible", "header"],
            template:
              '<section v-if="visible" role="dialog"><h2>{{ header }}</h2><slot /><slot name="footer" /></section>',
          },
        },
      },
    });

    await wrapper
      .get("button[aria-label='Пакетное назначение выбранных обращений']")
      .trigger("click");

    expect(wrapper.get("[role='dialog']").text()).toContain(
      "Пакет выполнен частично",
    );
    expect(wrapper.get("[role='dialog']").text()).toContain("Назначен");
    expect(wrapper.get("[role='dialog']").text()).toContain(
      "Недостаточно свободной нагрузки",
    );
    expect(wrapper.get("[role='dialog']").text()).toContain("Платёжный риск");
    expect(wrapper.get("[role='dialog']").text()).not.toContain("case-1");
    expect(wrapper.get("[role='dialog']").text()).not.toContain("item-1");
  });

  it("uses human Case labels and closes force-only rows after force revoke", async () => {
    const hasForceAuthority = ref(true);
    const controller = {
      rows: ref([
        {
          caseId: "4c02e61f-83aa-4c5f-a450-33dfc7117f7c",
          snapshot: {
            teams: [
              {
                id: "team-1",
                name: "Платежи",
                operators: [
                  {
                    id: "operator-1",
                    displayName: "Анна",
                    availableCapacityUnits: 0,
                    requiredOverrides: ["AVAILABILITY"],
                    actions: { assign: false, assignWithOverride: true },
                  },
                ],
              },
            ],
          },
          teamId: "team-1",
          operatorId: "operator-1",
          error: "",
        },
      ]),
      preparing: ref(false),
      mutating: ref(false),
      reconciling: ref(false),
      error: ref(""),
      reasonNote: ref(""),
      result: ref(null),
      unknownOutcome: ref(false),
      hasAuthority: ref(true),
      hasForceAuthority,
      readyCount: computed(() => 1),
      prepare: vi.fn(),
      setTarget: vi.fn(),
      setReasonNote: vi.fn(),
      submit: vi.fn(),
      reconcileUnknownOutcome: vi.fn(),
      reset: vi.fn(),
    };
    const wrapper = mount(SupportLeadAssignmentBatchDesk, {
      props: {
        controller: controller as never,
        caseIds: ["4c02e61f-83aa-4c5f-a450-33dfc7117f7c"],
        caseLabels: {
          "4c02e61f-83aa-4c5f-a450-33dfc7117f7c": "Платёжный риск",
        },
      },
      global: {
        plugins: [PrimeVue],
        stubs: {
          Dialog: {
            props: ["visible", "header"],
            template:
              '<section v-if="visible" role="dialog"><h2>{{ header }}</h2><slot /><slot name="footer" /></section>',
          },
          Select: {
            props: ["modelValue", "options", "optionLabel", "optionValue"],
            template:
              '<select v-bind="$attrs"><option v-for="option in options" :key="option[optionValue]">{{ option[optionLabel] }}</option></select>',
          },
          Textarea: { template: '<textarea v-bind="$attrs" />' },
        },
      },
    });

    await wrapper
      .get("button[aria-label='Пакетное назначение выбранных обращений']")
      .trigger("click");
    expect(wrapper.get("[role='dialog']").text()).toContain("Анна");
    expect(wrapper.html()).toContain("Команда для Платёжный риск");
    expect(wrapper.html()).not.toContain("4c02e61f-83aa-4c5f-a450-33dfc7117f7c");

    hasForceAuthority.value = false;
    await wrapper.vm.$nextTick();

    expect(wrapper.find("[role='dialog']").exists()).toBe(false);
    expect(controller.reset).toHaveBeenCalled();
  });
});
