import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import AIAnalysisCard from "./AIAnalysisCard.vue";

const scheduled = {
  analysisId: "analysis-1",
  complete: false,
  createdAt: "2026-07-31T07:00:00.000Z",
  createdByCmsUserId: "admin-1",
  endUserId: "end-user-1",
  eventCodes: [],
  hasLimitations: false,
  kind: "SCHEDULED_ONCE" as const,
  projectSequence: "42",
  questionPreview: "Сколько депозитов было вчера?",
  schedule: {
    dstDisambiguation: "EXACT" as const,
    localDateTime: "2026-07-31T12:00:00",
    nextRunAt: "2026-07-31T10:00:00.000Z",
    runAt: "2026-07-31T10:00:00.000Z",
    scheduleId: "schedule-1",
    scheduleSpecVersion: 1,
    scheduleType: "ONCE" as const,
    state: "ACTIVE" as const,
    timezone: "Europe/Madrid",
  },
  scopeKind: "END_USER" as const,
  state: "ACTIVE" as const,
  title: "Депозиты пользователя",
  version: 1,
};

describe("AIAnalysisCard", () => {
  it("renders a scheduled placeholder with transparent actor and subject IDs", () => {
    const wrapper = mount(AIAnalysisCard, {
      props: {
        item: scheduled,
        canReadCost: false,
        canReadCmsUsers: true,
      },
      global: {
        stubs: {
          RouterLink: {
            props: ["to"],
            template: '<a :data-to="JSON.stringify(to)"><slot /></a>',
          },
          Tag: {
            template: "<span><slot />{{ value }}</span>",
            props: ["value"],
          },
        },
      },
    });

    expect(wrapper.text()).toContain("Запланирован");
    expect(wrapper.text()).toContain("admin-1");
    expect(wrapper.text()).toContain("end-user-1");
    expect(wrapper.text()).toContain("Europe/Madrid");
    expect(wrapper.text()).not.toContain("Стоимость");
    expect(wrapper.html()).toContain("platform-cms-users");
  });

  it("shows cost attribution only with the dedicated cost permission", () => {
    const wrapper = mount(AIAnalysisCard, {
      props: {
        canReadCost: true,
        item: {
          ...scheduled,
          schedule: null,
          latestRun: {
            actualAiCostUsdTicks: "12500000000",
            analysisId: "analysis-1",
            complete: true,
            costAttributedToCmsUserId: "admin-cost",
            eventCodes: ["deposit.completed"],
            hasLimitations: false,
            limitationCodes: [],
            limitations: [],
            status: "SUCCEEDED" as const,
            version: 2,
          },
        },
      },
      global: {
        stubs: {
          RouterLink: { template: "<a><slot /></a>" },
          Tag: { template: "<span>{{ value }}</span>", props: ["value"] },
        },
      },
    });

    expect(wrapper.text()).toContain("Фактическая AI-стоимость");
    expect(wrapper.text()).toContain("$1.25");
    expect(wrapper.text()).toContain("admin-cost");
  });

  it("distinguishes reserved and pending cost without inventing an actual zero", () => {
    const wrapper = mount(AIAnalysisCard, {
      props: {
        canReadCost: true,
        item: {
          ...scheduled,
          schedule: null,
          latestRun: {
            analysisId: "analysis-1",
            budgetReconciliationPending: true,
            complete: false,
            costStatus: "ESTIMATED",
            eventCodes: [],
            hasLimitations: false,
            limitationCodes: [],
            limitations: [],
            reservedAiCostUsdTicks: "25000000000",
            status: "RUNNING" as const,
            version: 2,
          },
        },
      },
      global: {
        stubs: {
          RouterLink: { template: "<a><slot /></a>" },
          Tag: { template: "<span>{{ value }}</span>", props: ["value"] },
        },
      },
    });

    expect(wrapper.text()).toContain("Зарезервировано");
    expect(wrapper.text()).toContain("$2.5");
    expect(wrapper.text()).toContain("Сверка стоимости ожидается");
    expect(wrapper.text()).not.toContain("Фактическая AI-стоимость");
    expect(wrapper.text()).not.toContain("$0");
  });

  it("marks unknown legacy attribution instead of inventing a system actor", () => {
    const wrapper = mount(AIAnalysisCard, {
      props: {
        canReadCost: false,
        item: {
          ...scheduled,
          createdByCmsUserId: null,
          compatibility: {
            readOnly: true,
            sourceKind: "AI_REVIEW" as const,
            sourceId: "legacy-1",
            attributionStatus: "REQUESTER_UNKNOWN" as const,
            provenanceStatus: "PARTIAL" as const,
          },
        },
      },
      global: {
        stubs: {
          RouterLink: { template: "<a><slot /></a>" },
          Tag: { template: "<span>{{ value }}</span>", props: ["value"] },
        },
      },
    });

    expect(wrapper.text()).toContain("Автор неизвестен");
    expect(wrapper.text()).toContain("Исторический AI Review");
    expect(wrapper.text()).not.toContain("Системная миграция");
  });
});
