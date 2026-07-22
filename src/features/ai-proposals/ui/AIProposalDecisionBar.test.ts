import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type { AIProposalDetail } from "../model/ai-proposal";
import AIProposalDecisionBar from "./AIProposalDecisionBar.vue";

const proposal: AIProposalDetail = {
  id: "proposal-1",
  projectSequence: "12",
  kind: "ADMIN_ATTENTION",
  workflowStatus: "ACCEPTED",
  decisionMode: "APPROVE_REJECT",
  priority: "HIGH",
  title: "Нужна помощь",
  summary: "Пользователь просит связаться.",
  sourceType: "TEXT_CHAT",
  version: 2,
  isRead: true,
  createdAt: "2026-07-19T18:00:00.000Z",
  updatedAt: "2026-07-19T18:01:00.000Z",
  content: {},
  evidence: [],
};

describe("AIProposalDecisionBar", () => {
  it("does not present an accepted proposal as successfully completed", () => {
    const wrapper = mount(AIProposalDecisionBar, {
      props: { proposal, deciding: false, canDecide: false },
    });

    expect(wrapper.text()).toContain("Принято администратором");
    expect(wrapper.text()).toContain("Исполнение отслеживается отдельно");
    expect(wrapper.text()).not.toContain("Предложение обработано");
    expect(wrapper.classes()).not.toContain("decision-succeeded");
  });
});
