import { mount } from "@vue/test-utils";
import PrimeVue from "primevue/config";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { QueuePredicate } from "../model/routing-control-plane";
import QueuePredicateEditor from "./QueuePredicateEditor.vue";

describe("QueuePredicateEditor", () => {
  beforeAll(() => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  });
  it("renders every nested branch without flattening the recursive grammar", () => {
    const predicate: QueuePredicate = {
      kind: "AND",
      children: [
        { kind: "ID_IN", field: "ASSIGNED_TEAM_ID", values: ["team-1"] },
        {
          kind: "OR",
          children: [
            { kind: "TIME_RANGE", field: "CREATED_AT", from: "2026-08-01T00:00:00Z", to: null },
            { kind: "NOT", child: { kind: "BOOLEAN", field: "DEGRADED", value: true } },
          ],
        },
      ],
    };
    const wrapper = mount(QueuePredicateEditor, {
      props: {
        modelValue: predicate,
        teamOptions: [{ label: "Команда заботы", value: "team-1" }],
        operatorOptions: [{ label: "Анна Смирнова", value: "operator-1" }],
      },
      global: { plugins: [PrimeVue] },
    });

    expect(wrapper.findAll('[aria-label="Тип условия"]')).toHaveLength(6);
    expect(wrapper.find('[aria-label="Выбранные участники"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("Команда заботы");
    expect(wrapper.find('[aria-label="Начало диапазона"]').exists()).toBe(true);
  });
});
