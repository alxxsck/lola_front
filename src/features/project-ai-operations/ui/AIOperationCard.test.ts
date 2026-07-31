import { shallowMount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import AIOperationCard from "./AIOperationCard.vue";

const item = {
  operationId: "operation-1",
  projectSequence: "42",
  rootCorrelationId: "root-1",
  category: "AI_ANALYSIS" as const,
  status: "SUCCEEDED" as const,
  title: "Депозиты",
  sourceKind: "AI_ANALYSIS_RUN",
  sourceId: "run-1",
  initiator: {
    type: "CMS_USER" as const,
    id: "admin-1",
    displayName: "Анна",
  },
  chargedAccount: "PROJECT_BUDGET" as const,
  responsibleCmsUserId: "admin-1",
  responsibleCmsUserDisplayName: "Анна",
  chargedEndUserId: null,
  subjectSummary: { availability: "EXACT" as const, count: 3 },
  usageRecords: 2,
  cost: {
    providerReportedCost: "0.25",
    estimatedFallbackCost: "0",
    effectiveCost: "0.25",
    state: "KNOWN" as const,
    unknownUsageRecords: 0,
    reservedCostUsdTicks: "0",
  },
  dbWorkUnits: "20",
  limitationCodes: [],
  startedAt: "2026-07-31T08:00:00.000Z",
};

describe("AIOperationCard", () => {
  it("shows initiator, responsible admin and charged account as separate facts", () => {
    const wrapper = shallowMount(AIOperationCard, {
      props: {
        item,
        projectId: "project-1",
        canReadCost: true,
      },
      global: {
        stubs: {
          RouterLink: {
            name: "RouterLink",
            template: "<a><slot /></a>",
          },
        },
      },
    });

    expect(wrapper.text()).toContain("Инициатор");
    expect(wrapper.text()).toContain("Ответственный");
    expect(wrapper.text()).toContain("Бюджет проекта");
    expect(wrapper.text()).toContain("admin-1");
    expect(wrapper.text()).toContain("3 чел.");
    expect(wrapper.text()).toContain("$0.25");
    expect(wrapper.findComponent({ name: "RouterLink" }).exists()).toBe(true);
  });

  it("does not render monetary cost without permission and keeps safe detail available", () => {
    const wrapper = shallowMount(AIOperationCard, {
      props: {
        item,
        projectId: "project-1",
        canReadCost: false,
      },
      global: {
        stubs: {
          RouterLink: {
            name: "RouterLink",
            template: "<a><slot /></a>",
          },
        },
      },
    });

    expect(wrapper.text()).toContain("Стоимость ограничена");
    expect(wrapper.text()).not.toContain("$0.25");
    expect(wrapper.findComponent({ name: "RouterLink" }).exists()).toBe(true);
    expect(
      wrapper.findComponent({ name: "RouterLink" }).attributes("aria-label"),
    ).toContain("42");
  });
});
