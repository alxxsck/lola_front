import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import AIProposalCard from "./AIProposalCard.vue";
import type { AIProposalListItem } from "../model/ai-proposal";

const proposal: AIProposalListItem = {
  id: "proposal-1",
  projectSequence: "12",
  kind: "ADMIN_ATTENTION",
  workflowStatus: "OPEN",
  decisionMode: "ACKNOWLEDGE",
  priority: "HIGH",
  title: '<script>alert("x")</script> Нужна помощь',
  summary: "<img src=x onerror=alert(1)> Просьба клиента",
  sourceType: "VOICE",
  endUser: { id: "user-1", externalId: "customer-1" },
  version: 1,
  isRead: false,
  createdAt: "2026-07-19T18:00:00.000Z",
  updatedAt: "2026-07-19T18:00:00.000Z",
};

describe("AIProposalCard", () => {
  it("renders safe localized status, source and priority labels", () => {
    const wrapper = mount(AIProposalCard, { props: { proposal } });

    expect(wrapper.text()).toContain("Голос");
    expect(wrapper.text()).toContain("Высокий приоритет");
    expect(wrapper.text()).toContain("Требует решения");
    expect(wrapper.classes()).toContain("needs-action");
    expect(wrapper.find("script").exists()).toBe(false);
    expect(wrapper.find("img").exists()).toBe(false);
    expect(wrapper.get("button").attributes("aria-label")).toContain(
      "Непрочитанное предложение",
    );
  });
});
