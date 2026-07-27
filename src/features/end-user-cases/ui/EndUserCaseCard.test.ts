import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import EndUserCaseCard from "./EndUserCaseCard.vue";

const item = {
  id: "case-1",
  projectSequence: "48",
  version: 2,
  type: "PROBLEM_RESOLUTION",
  groupCode: "PAYMENTS",
  suggestedGroup: null,
  title: '<script>alert("x")</script> Не поступил депозит',
  goal: "Получить депозит",
  summary: "Платёж проверяется.",
  status: "WAITING_ADMIN",
  availableStatuses: ["IN_PROGRESS"],
  resolution: { assessment: "NOT_ASSESSED", source: null, confidence: null },
  impact: "HIGH",
  urgency: "HIGH",
  priority: "URGENT",
  prioritySource: "PLATFORM_RULE",
  initialTone: "CONCERNED",
  currentTone: "FRUSTRATED",
  toneTrend: "WORSENING",
  primaryLanguage: "ru",
  languages: ["ru"],
  endUser: { id: "user-1", externalId: "customer-42" },
  assignee: null,
  messageCount: 8,
  proposalCount: 1,
  firstObservedAt: "2026-07-26T09:00:00.000Z",
  lastActivityAt: "2026-07-26T10:00:00.000Z",
  waitingSince: "2026-07-26T09:30:00.000Z",
  resolvedAt: null,
  reopenedAt: null,
  aggregationDirtyAt: null,
  nextAggregationAt: null,
  degradedReason: null,
  createdAt: "2026-07-26T09:00:00.000Z",
  updatedAt: "2026-07-26T10:00:00.000Z",
} as const;

describe("EndUserCaseCard", () => {
  it("renders safe triage context without relying on color", () => {
    const wrapper = mount(EndUserCaseCard, {
      props: { item: item as never },
    });
    expect(wrapper.text()).toContain("Срочно");
    expect(wrapper.text()).toContain("Нужен администратор");
    expect(wrapper.text()).toContain("1 предложение");
    expect(wrapper.find("script").exists()).toBe(false);
    expect(wrapper.text()).toContain('<script>alert("x")</script>');
  });

  it("exposes selection and degraded freshness without inventing absent context", async () => {
    const wrapper = mount(EndUserCaseCard, {
      props: {
        item: {
          ...item,
          summary: "",
          proposalCount: 0,
          endUserRecontactCount: 2,
          toneTrend: "STABLE",
          degradedReason: "BUDGET",
        } as never,
        selected: true,
      },
    });
    expect(wrapper.classes()).toContain("selected");
    expect(wrapper.classes()).toContain("degraded");
    expect(wrapper.text()).toContain("Получить депозит");
    expect(wrapper.text()).not.toContain("предложение");
    expect(wrapper.text()).toContain("Возвратов: 2");
    expect(wrapper.text()).not.toContain("Настроение ухудшается");
    expect(wrapper.text()).toContain("Данные обновляются с задержкой");
    await wrapper.trigger("click");
    expect(wrapper.emitted("select")).toHaveLength(1);
  });
});
