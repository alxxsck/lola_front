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
      hasAuthority: computed(() => true),
      readyCount: computed(() => 0),
      prepare: vi.fn(),
      setTarget: vi.fn(),
      setReasonNote: vi.fn(),
      submit: vi.fn(),
      reconcileUnknownOutcome: vi.fn(),
      reset: vi.fn(),
    };
    const wrapper = mount(SupportLeadAssignmentBatchDesk, {
      props: { controller: controller as never, caseIds: ["case-1", "case-2"] },
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
      .get("button[aria-label='Пакетное назначение выбранных Cases']")
      .trigger("click");

    expect(wrapper.get("[role='dialog']").text()).toContain(
      "Пакет выполнен частично",
    );
    expect(wrapper.get("[role='dialog']").text()).toContain("Назначен");
    expect(wrapper.get("[role='dialog']").text()).toContain(
      "Недостаточно capacity",
    );
  });
});
