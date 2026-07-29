import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EndUserAiUsageCard from "./EndUserAiUsageCard.vue";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
}));

vi.mock("./end-user-ai-usage.api", () => ({
  fetchEndUserAiUsageReport: mocks.fetch,
}));
const report = {
  projectId: "project-1",
  endUserId: "user-1",
  window: "7d" as const,
  range: {
    from: "2026-07-18T22:00:00.000Z",
    to: "2026-07-24T18:00:00.000Z",
    timezone: "Europe/Madrid",
  },
  totals: {
    records: 6,
    totalTokens: 12_500,
    inputTokens: 9_500,
    outputTokens: 3_000,
    inputCharacters: 880,
    providerBilledUnits: 920,
    durationSeconds: 40,
    providerReportedCost: 0.12,
    estimatedFallbackCost: 0.03,
    effectiveCost: 0.15,
    providerReportedCostRecords: 3,
    estimatedRecords: 2,
    providerUnitOnlyRecords: 1,
    unpricedRecords: 0,
  },
  categories: [
    {
      category: "CHAT" as const,
      currency: "usd",
      records: 4,
      totalTokens: 10_000,
      inputTokens: 8_000,
      outputTokens: 2_000,
      inputCharacters: 0,
      providerBilledUnits: 0,
      durationSeconds: 0,
      providerReportedCost: 0.12,
      estimatedFallbackCost: 0,
      effectiveCost: 0.12,
    },
    {
      category: "SPEECH" as const,
      currency: "usd",
      records: 1,
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      inputCharacters: 880,
      providerBilledUnits: 920,
      durationSeconds: 0,
      providerReportedCost: 0,
      estimatedFallbackCost: 0,
      effectiveCost: 0,
    },
    {
      category: "CASE_INTELLIGENCE" as const,
      currency: "usd",
      records: 23,
      totalTokens: 41_099,
      inputTokens: 32_536,
      outputTokens: 8_563,
      inputCharacters: 0,
      providerBilledUnits: 0,
      durationSeconds: 0,
      providerReportedCost: 0.0890324,
      estimatedFallbackCost: 0,
      effectiveCost: 0.0890324,
    },
  ],
  eventQuery: {
    calls: 6,
    resultBytes: 3_300,
    estimatedAddedInputTokens: 1_119,
    linkedUsageIncludedInProviderTotals: true,
    linkedAiUsage: {
      records: 1,
      totalTokens: 74_546,
      inputTokens: 60_000,
      outputTokens: 14_546,
      billedCostUsd: 0.0295008,
      estimatedCostUsd: null,
    },
  },
};

describe("End User AI consumption card", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetch.mockResolvedValue(report);
  });

  it("loads a Project-local 7 day report and keeps provider, estimated and unit costs separate", async () => {
    const wrapper = mount(EndUserAiUsageCard, {
      props: { projectId: "project-1", endUserId: "user-1" },
    });
    await flushPromises();

    expect(mocks.fetch).toHaveBeenCalledWith(
      "project-1",
      "user-1",
      "7d",
      expect.any(AbortSignal),
    );
    expect(wrapper.text()).toContain("12,5");
    expect(wrapper.text()).toContain("По данным xAI");
    expect(wrapper.text()).toContain("Оценка по тарифу");
    expect(wrapper.text()).toContain("Единицы ElevenLabs");
    expect(wrapper.text()).toContain("Чат с Lola");
    expect(wrapper.text()).toContain("Озвучивание");
    expect(wrapper.text()).toContain("Анализ и проверка обращений");
    expect(wrapper.text()).toContain("Europe/Madrid");
    expect(wrapper.text()).toContain("Поиск по данным событий");
    expect(wrapper.text()).toContain("6 запросов");
    expect(wrapper.text()).toContain("3,2 КБ");
    expect(wrapper.text()).toContain("74,5\u00a0тыс.");
    expect(wrapper.text()).not.toContain("deposit.completed");
    expect(wrapper.text()).not.toContain("UNKNOWN");
    expect(wrapper.text()).not.toContain("REJECTED");
  });

  it("requests a new server window when the administrator changes the period", async () => {
    const wrapper = mount(EndUserAiUsageCard, {
      props: { projectId: "project-1", endUserId: "user-1" },
    });
    await flushPromises();
    await wrapper.get('button[data-window="today"]').trigger("click");
    await flushPromises();

    expect(mocks.fetch).toHaveBeenLastCalledWith(
      "project-1",
      "user-1",
      "today",
      expect.any(AbortSignal),
    );
  });

  it("does not leave a stale report under a failed new period", async () => {
    const wrapper = mount(EndUserAiUsageCard, {
      props: { projectId: "project-1", endUserId: "user-1" },
    });
    await flushPromises();
    mocks.fetch.mockRejectedValueOnce(new Error("Новый период недоступен"));

    await wrapper.get('button[data-window="today"]').trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Новый период недоступен");
    expect(wrapper.text()).toContain("Повторить");
    expect(wrapper.text()).not.toContain("12,5");
  });
});
