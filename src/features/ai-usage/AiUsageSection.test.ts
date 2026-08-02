import { config, flushPromises, shallowMount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AiUsageSection from "./AiUsageSection.vue";
import AiModelUsageChart from "./components/AiModelUsageChart.vue";
import AiModalityChart from "./components/AiModalityChart.vue";

config.global.stubs.ProjectSettingsSectionHeader = false;
config.global.stubs.AiModelUsageSlice = false;
config.global.stubs.AiVoiceUsageSlice = false;
config.global.stubs.AiSpeechUsageSlice = false;
config.global.stubs.AiTtsPricingContext = false;
config.global.stubs.AiModelUsageChart = false;
config.global.stubs.AiModalityChart = false;

const mocks = vi.hoisted(() => ({ fetchReport: vi.fn() }));

vi.mock("./ai-usage.api", () => ({ fetchAiUsageReport: mocks.fetchReport }));
vi.mock("@/shared/config/data-mode", () => ({ isMockMode: false }));

const summary = (patch: Record<string, unknown> = {}) => ({
  records: 0,
  inputCharacters: 0,
  providerBilledUnits: 0,
  totalTokens: 0,
  inputTokens: 0,
  cachedInputTokens: 0,
  cacheWriteInputTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  inputTextTokens: 0,
  cachedInputTextTokens: 0,
  outputTextTokens: 0,
  inputAudioTokens: 0,
  cachedInputAudioTokens: 0,
  outputAudioTokens: 0,
  inputImageTokens: 0,
  cachedInputImageTokens: 0,
  outputImageTokens: 0,
  durationSeconds: 0,
  estimatedCost: "0",
  billedCost: "0",
  providerReportedCost: "0",
  estimatedFallbackCost: "0",
  effectiveCost: "0",
  ...patch,
});

const baseReport = () => ({
  projectId: "project-1",
  totals: {
    ...summary({
      records: 9,
      inputCharacters: 1_200,
      totalTokens: 1_500,
      inputTokens: 1_000,
      cachedInputTokens: 200,
      outputTokens: 500,
      inputTextTokens: 1_000,
      cachedInputTextTokens: 200,
      outputTextTokens: 500,
      durationSeconds: 95,
      estimatedCost: "0.098",
      billedCost: "0.12",
      providerReportedCost: "0.12",
      estimatedFallbackCost: "0.098",
      effectiveCost: "0.218",
    }),
    unpricedRecords: 0,
    providerReportedUsageRecords: 3,
    estimatedCostRecords: 6,
    providerReportedCostRecords: 3,
    estimatedRecords: 6,
    providerUnitOnlyRecords: 0,
  },
  breakdown: [
    {
      provider: "xai",
      model: "grok-4.5",
      operation: "response",
      currency: "usd",
      ...summary({
        records: 3,
        totalTokens: 1_500,
        inputTokens: 1_000,
        cachedInputTokens: 200,
        outputTokens: 500,
        inputTextTokens: 1_000,
        cachedInputTextTokens: 200,
        outputTextTokens: 500,
        billedCost: "0.12",
        providerReportedCost: "0.12",
        effectiveCost: "0.12",
      }),
    },
    {
      provider: "xai",
      model: "grok-voice-latest",
      operation: "realtime_response",
      currency: "usd",
      ...summary({
        records: 2,
        durationSeconds: 95,
        estimatedCost: "0.08",
        estimatedFallbackCost: "0.08",
        effectiveCost: "0.08",
      }),
    },
    {
      provider: "xai",
      model: null,
      operation: "speech",
      currency: "usd",
      ...summary({
        records: 4,
        inputCharacters: 1_200,
        estimatedCost: "0.018",
        estimatedFallbackCost: "0.018",
        effectiveCost: "0.018",
      }),
    },
  ],
  categories: [
    {
      category: "VOICE",
      currency: "usd",
      ...summary({
        records: 2,
        durationSeconds: 95,
        estimatedCost: "0.08",
        estimatedFallbackCost: "0.08",
        effectiveCost: "0.08",
      }),
    },
    {
      category: "SPEECH",
      currency: "usd",
      ...summary({
        records: 4,
        inputCharacters: 1_200,
        estimatedCost: "0.018",
        estimatedFallbackCost: "0.018",
        effectiveCost: "0.018",
      }),
    },
  ],
  eventQuery: {
    calls: 6,
    resultBytes: 3_300,
    estimatedAddedInputTokens: 1_119,
    linkedUsageIncludedInProviderTotals: true as const,
    linkedAiUsage: {
      records: 6,
      inputTokens: 60_000,
      outputTokens: 14_546,
      totalTokens: 74_546,
      billedCostUsd: "0.0295008",
      estimatedCostUsd: null,
    },
  },
  textToSpeechPricing: {
    current: {
      rate: "15",
      currency: "usd",
      unit: "per_million_input_characters",
      effectiveFrom: "2026-07-29T10:00:00.000Z",
    },
    sourceUrl: "https://docs.x.ai/developers/pricing",
  },
});

describe("AiUsageSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchReport.mockResolvedValue(baseReport());
  });

  it("shows the loading state while the first report is pending", async () => {
    mocks.fetchReport.mockReturnValue(new Promise(() => {}));
    const wrapper = shallowMount(AiUsageSection, {
      props: { projectId: "project-1" },
    });
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[aria-label="Загрузка статистики"]').exists()).toBe(
      true,
    );
    expect(wrapper.find(".provider-stack").exists()).toBe(false);
  });

  it("starts collapsed and expands without reloading", async () => {
    const wrapper = shallowMount(AiUsageSection, {
      props: { projectId: "project-1" },
    });
    await flushPromises();

    const toggle = wrapper.get('[aria-controls="ai-usage-content"]');
    expect(toggle.attributes("aria-expanded")).toBe("false");
    expect(mocks.fetchReport).toHaveBeenCalledTimes(1);
    await toggle.trigger("click");
    expect(toggle.attributes("aria-expanded")).toBe("true");
    expect(mocks.fetchReport).toHaveBeenCalledTimes(1);
  });

  it("shows a load error and retries", async () => {
    mocks.fetchReport
      .mockRejectedValueOnce(new Error("AI usage недоступен"))
      .mockResolvedValueOnce(baseReport());
    const wrapper = shallowMount(AiUsageSection, {
      props: { projectId: "project-1" },
      global: {
        stubs: {
          Message: { template: '<div class="message-stub"><slot /></div>' },
        },
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("AI usage недоступен");
    await wrapper.find('button-stub[label="Повторить"]').trigger("click");
    await flushPromises();
    expect(wrapper.find(".provider-stack").exists()).toBe(true);
  });

  it("renders one xAI surface with separate model, Voice and text-to-speech slices", async () => {
    const wrapper = shallowMount(AiUsageSection, {
      props: { projectId: "project-1" },
    });
    await flushPromises();

    expect(wrapper.findAll(".provider-panel")).toHaveLength(1);
    expect(wrapper.text()).toContain("xAI");
    expect(wrapper.text()).toContain("Модели Grok");
    expect(wrapper.text()).toContain("Голосовой чат");
    expect(wrapper.text()).toContain("Озвучивание текста");
    expect(wrapper.text()).not.toContain("ElevenLabs");
    expect(wrapper.text()).not.toContain("credits");
    expect(wrapper.getComponent(AiModelUsageChart).props("rows")).toHaveLength(
      1,
    );
    const ids = wrapper
      .findAll("[id]")
      .map((element) => element.attributes("id"));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("shows Event Query consumption inside the Grok panel", async () => {
    const wrapper = shallowMount(AiUsageSection, {
      props: { projectId: "project-1" },
    });
    await flushPromises();

    expect(mocks.fetchReport).toHaveBeenCalledTimes(1);
    expect(wrapper.get(".xai-panel").text()).toContain("Запросы к событиям");
    expect(wrapper.get(".event-query-usage").text()).toContain("6");
    expect(wrapper.get(".event-query-usage").text()).toContain("3,2 КБ");
    expect(wrapper.get(".event-query-usage").text()).toContain(
      "1,1\u00a0тыс. токенов",
    );
    expect(wrapper.get(".event-query-usage").text()).toContain(
      "74,5\u00a0тыс. токенов",
    );
    expect(wrapper.get(".event-query-usage").text()).toContain("0,03\u00a0$");
  });

  it("shows provider-reported and calculated xAI totals separately", async () => {
    const wrapper = shallowMount(AiUsageSection, {
      props: { projectId: "project-1" },
    });
    await flushPromises();

    expect(wrapper.get(".actual-cost").text()).toContain("0,12 $");
    expect(wrapper.get(".estimated-cost").text()).toContain("0,10 $");
    expect(wrapper.get(".effective-cost").text()).toContain("0,22 $");
    expect(wrapper.get(".effective-cost").text()).not.toContain("фактически");
  });

  it("never combines mixed currencies under a fabricated USD label", async () => {
    const report = baseReport();
    report.breakdown.push({
      ...report.breakdown[0]!,
      currency: "eur",
      billedCost: "1",
      providerReportedCost: "1",
      effectiveCost: "1",
    });
    mocks.fetchReport.mockResolvedValue(report);

    const wrapper = shallowMount(AiUsageSection, {
      props: { projectId: "project-1" },
    });
    await flushPromises();

    expect(wrapper.get(".actual-cost").text()).toContain("Несколько валют");
    expect(wrapper.get(".estimated-cost").text()).toContain("Несколько валют");
    expect(wrapper.get(".effective-cost").text()).toContain("Несколько валют");
    expect(
      wrapper.findAll(".metric-switch button")[1]!.attributes(),
    ).toHaveProperty("disabled");
  });

  it("presents Voice as duration-based calculated usage without a hardcoded rate", async () => {
    const wrapper = shallowMount(AiUsageSection, {
      props: { projectId: "project-1" },
    });
    await flushPromises();

    const voice = wrapper.get(".voice-slice");
    expect(voice.text()).toContain("1 мин 35 сек");
    expect(voice.text()).toContain("2 операции");
    expect(voice.text()).toContain("0,08 $");
    expect(voice.text()).toContain("Расчёт по публичному тарифу xAI");
    expect(voice.text()).not.toContain("0,05 $");
  });

  it("presents TTS from backend characters, cost and current pricing context", async () => {
    const wrapper = shallowMount(AiUsageSection, {
      props: { projectId: "project-1" },
    });
    await flushPromises();

    const speech = wrapper.get(".speech-slice");
    expect(speech.text()).toContain("1,2 тыс.");
    expect(speech.text()).toContain("4 генерации");
    expect(speech.text()).toContain("0,02 $");
    expect(speech.text()).not.toContain("0 токен");
    expect(speech.text()).not.toContain("provider units");
    expect(speech.text()).toContain("15,00 $ за 1 000 000 входных символов");
    expect(speech.text()).toContain("29.07.2026");
    expect(speech.text()).toContain(
      "История рассчитана по ставке, действовавшей в момент каждой операции",
    );
    expect(speech.text()).toContain(
      "Если ставка xAI изменилась, сообщите администрации",
    );
    expect(speech.get("a").attributes()).toMatchObject({
      href: "https://docs.x.ai/developers/pricing",
      target: "_blank",
      rel: "noopener noreferrer",
    });
  });

  it("keeps token/cost charts scoped to Grok models", async () => {
    const wrapper = shallowMount(AiUsageSection, {
      props: { projectId: "project-1" },
    });
    await flushPromises();

    expect(wrapper.getComponent(AiModelUsageChart).props("metric")).toBe(
      "tokens",
    );
    expect(wrapper.getComponent(AiModalityChart).props("metric")).toBe(
      "tokens",
    );
    await wrapper.findAll(".metric-switch button")[1]!.trigger("click");
    expect(wrapper.getComponent(AiModelUsageChart).props("metric")).toBe(
      "cost",
    );
    expect(wrapper.getComponent(AiModalityChart).props("metric")).toBe("cost");
  });

  it("keeps the AI cases section and operation labels", async () => {
    const report = baseReport();
    report.breakdown.push({
      ...report.breakdown[0]!,
      operation: "case_router",
      records: 18,
      totalTokens: 29_670,
      inputTokens: 24_447,
      outputTokens: 5_223,
      billedCost: "0.055208",
      providerReportedCost: "0.055208",
      effectiveCost: "0.055208",
    });
    report.categories.push({
      category: "CASE_INTELLIGENCE",
      currency: "usd",
      ...summary({
        records: 18,
        totalTokens: 29_670,
        inputTokens: 24_447,
        outputTokens: 5_223,
        billedCost: "0.055208",
        providerReportedCost: "0.055208",
        effectiveCost: "0.055208",
      }),
    });
    mocks.fetchReport.mockResolvedValue(report);

    const wrapper = shallowMount(AiUsageSection, {
      props: { projectId: "project-1" },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("AI-кейсы");
    expect(wrapper.text()).toContain("Анализ и проверка обращений");
    expect(wrapper.text()).toContain("Маршрутизация");
  });

  it("rounds fractional workload latency to whole milliseconds", async () => {
    mocks.fetchReport.mockResolvedValue({
      ...baseReport(),
      workloads: [
        {
          workload: "SCENARIO_AUTHORING",
          requestedModel: "grok-4.3",
          appliedModel: null,
          reasoningEffort: "none",
          reasoningTokens: 0,
          requests: 11,
          averageLatencyMs: 973.4545454545455,
          effectiveCostUsd: "0.003684",
          isOther: false,
        },
      ],
    });

    const wrapper = shallowMount(AiUsageSection, {
      props: { projectId: "project-1" },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("973 мс");
    expect(wrapper.text()).not.toContain("973.4545454545455 мс");
  });
});
