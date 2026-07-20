import { flushPromises, shallowMount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TranslationUsagePanel from "./TranslationUsagePanel.vue";

const mocks = vi.hoisted(() => ({ usage: vi.fn() }));
vi.mock("../api/translation-repository", () => ({
  translationRepository: { usage: mocks.usage },
}));

describe("TranslationUsagePanel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows aggregate translation usage and hard budget state", async () => {
    mocks.usage.mockResolvedValue({
      totals: {
        requests: 10,
        successes: 9,
        errors: 1,
        inputCharacters: 1000,
        outputCharacters: 800,
        billableCharacters: 1800,
        cacheHits: 2,
        estimatedCostMicros: "250000",
        estimatedSavingsMicros: "20000",
        actualCostMicros: null,
        billingCurrency: "USD",
        latencyP50Ms: 100,
        latencyP95Ms: 200,
      },
      series: [],
      targetLocales: [],
      statuses: [{ status: "FAILED", requests: 1, successes: 0, errors: 1, inputCharacters: 20, outputCharacters: 0, billableCharacters: 20, cacheHits: 0, estimatedCostMicros: "0", estimatedSavingsMicros: "0", actualCostMicros: null, billingCurrency: "USD", latencyP50Ms: null, latencyP95Ms: null }],
      budget: {
        consumedMicros: "250000",
        reservedMicros: "0",
        softLimitMicros: "200000",
        hardLimitMicros: "250000",
        softPercent: 125,
        hardPercent: 100,
        hardExhausted: true,
      },
    });
    const wrapper = shallowMount(TranslationUsagePanel, {
      props: { projectId: "project-1" },
    });
    await flushPromises();
    expect(wrapper.text()).toContain("Автоматические переводы");
    expect(wrapper.text()).toContain("1 800");
    expect(wrapper.text()).toContain("90%");
    expect(wrapper.text()).toContain("Лимит исчерпан");
    expect(wrapper.text()).toContain("Расчётная стоимость");
    expect(wrapper.text()).toContain("Не выполнено · 1");
    expect(wrapper.text()).not.toContain("FAILED");
  });

  it("shows a neutral empty state", async () => {
    mocks.usage.mockResolvedValue({
      totals: { requests: 0, successes: 0, errors: 0, inputCharacters: 0, outputCharacters: 0, billableCharacters: 0, cacheHits: 0, estimatedCostMicros: "0", estimatedSavingsMicros: "0", actualCostMicros: null, billingCurrency: "USD", latencyP50Ms: null, latencyP95Ms: null },
      series: [], targetLocales: [], statuses: [],
    });
    const wrapper = shallowMount(TranslationUsagePanel, { props: { projectId: "project-1" } });
    await flushPromises();
    expect(wrapper.text()).toContain("За выбранный период переводов не было");
  });
});
