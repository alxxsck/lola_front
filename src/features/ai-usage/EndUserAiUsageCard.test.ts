import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EndUserAiUsageCard from "./EndUserAiUsageCard.vue";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  requests: vi.fn(),
}));

vi.mock("./end-user-ai-usage.api", () => ({
  fetchEndUserAiUsageReport: mocks.fetch,
}));
vi.mock("@/features/event-query/api/event-query-repository", () => ({
  eventQueryRepository: { listRequests: mocks.requests },
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
    records: 28,
    totalTokens: 12_500,
    inputTokens: 9_500,
    outputTokens: 3_000,
    inputCharacters: 880,
    providerBilledUnits: 0,
    durationSeconds: 40,
    providerReportedCost: 0.12,
    estimatedFallbackCost: 0.03,
    effectiveCost: 0.15,
    providerReportedCostRecords: 27,
    estimatedRecords: 1,
    providerUnitOnlyRecords: 0,
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
      providerBilledUnits: 0,
      durationSeconds: 0,
      providerReportedCost: 0,
      estimatedFallbackCost: 0.0132,
      effectiveCost: 0.0132,
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
  textToSpeechPricing: {
    current: {
      rate: "15",
      currency: "usd" as const,
      unit: "per_million_input_characters" as const,
      effectiveFrom: "2026-07-29T10:00:00.000Z",
    },
    sourceUrl: "https://docs.x.ai/developers/pricing",
  },
};

describe("End User AI consumption card", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetch.mockResolvedValue(report);
    mocks.requests.mockResolvedValue({
      items: [
        {
          id: "request-1",
          createdAt: "2026-07-24T12:00:00.000Z",
          endUserId: "user-1",
          origin: "INTERACTIVE_TEXT",
          audience: "END_USER_CONVERSATION",
          mode: "SUMMARY",
          eventCodes: ["deposit.completed"],
          queryShape: { mode: "SUMMARY" },
          policyRevisionId: null,
          range: null,
          snapshotReceivedAt: "2026-07-24T12:00:00.000Z",
          status: "COMPLETED",
          rejectionCode: null,
          scannedRows: 2,
          returnedRows: 1,
          resultBytes: 96,
          estimatedAddedInputTokens: 24,
          durationMs: 18,
          attribution: {},
          linkedAiUsage: {
            records: 1,
            totalTokens: 840,
            inputTokens: 710,
            outputTokens: 130,
            billedCostUsd: null,
            estimatedCostUsd: null,
          },
        },
      ],
      pageInfo: { hasMore: false, nextCursor: null },
    });
  });

  it("loads a Project-local report with factual, calculated and operation totals", async () => {
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
    expect(wrapper.text()).toContain("Фактически по данным xAI");
    expect(wrapper.text()).toContain("Расчёт по тарифу");
    expect(wrapper.text()).toContain("Операции AI и речи");
    expect(wrapper.text()).not.toContain("ElevenLabs");
    expect(wrapper.text()).toContain("Чат с Lola");
    expect(wrapper.text()).toContain("Озвучивание текста");
    expect(wrapper.text()).toContain("Анализ и проверка обращений");
    expect(wrapper.text()).toContain("Europe/Madrid");
    expect(wrapper.text()).toContain("Запросы пользователя к событиям");
    expect(wrapper.text()).toContain("deposit.completed");
    expect(wrapper.text()).toContain("840 токенов");
    expect(mocks.requests).toHaveBeenCalledWith("project-1", {
      from: report.range.from,
      to: report.range.to,
      endUserId: "user-1",
      audience: "END_USER_CONVERSATION",
      limit: 20,
    });
  });

  it("shows speech characters, generations and calculated cost without token or provider-unit copy", async () => {
    const wrapper = mount(EndUserAiUsageCard, {
      props: { projectId: "project-1", endUserId: "user-1" },
    });
    await flushPromises();

    const speech = wrapper.get('[data-usage-category="SPEECH"]');
    expect(speech.text()).toContain("Озвучивание текста");
    expect(speech.text()).toContain("880 символов");
    expect(speech.text()).toContain("1 генерация");
    expect(speech.text()).toContain("0,0132 $");
    expect(speech.text()).toContain("расчёт");
    expect(speech.text()).not.toMatch(/0 токен|единиц|provider/i);
  });

  it("explains immutable historical pricing without exposing platform controls", async () => {
    const wrapper = mount(EndUserAiUsageCard, {
      props: { projectId: "project-1", endUserId: "user-1" },
    });
    await flushPromises();

    const pricing = wrapper.get('[data-testid="end-user-tts-pricing"]');
    expect(pricing.text()).toContain("15,00 $ за 1 000 000 входных символов");
    expect(pricing.text()).toContain("29.07.2026");
    expect(pricing.text()).toContain(
      "История рассчитана по ставке, действовавшей в момент каждой операции",
    );
    expect(pricing.text()).toContain(
      "Если ставка xAI изменилась, сообщите администрации",
    );
    expect(pricing.get("a").attributes()).toMatchObject({
      href: "https://docs.x.ai/developers/pricing",
      target: "_blank",
      rel: "noopener noreferrer",
    });
    expect(pricing.find("button").exists()).toBe(false);
  });

  it("does not render an empty speech row or pricing note without speech usage", async () => {
    mocks.fetch.mockResolvedValueOnce({
      ...report,
      categories: report.categories.filter(
        (category) => category.category !== "SPEECH",
      ),
    });
    const wrapper = mount(EndUserAiUsageCard, {
      props: { projectId: "project-1", endUserId: "user-1" },
    });
    await flushPromises();

    expect(wrapper.find('[data-usage-category="SPEECH"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="end-user-tts-pricing"]').exists()).toBe(
      false,
    );
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
