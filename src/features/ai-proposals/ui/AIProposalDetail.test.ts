import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import AIProposalDetail from "./AIProposalDetail.vue";
import type { AIProposalDetail as AIProposalDetailModel } from "../model/ai-proposal";

const proposal: AIProposalDetailModel = {
  id: "proposal-1",
  projectSequence: "12",
  kind: "ADMIN_ATTENTION",
  workflowStatus: "OPEN",
  decisionMode: "ACKNOWLEDGE",
  priority: "HIGH",
  title: "Нужна помощь",
  summary: "Пользователь просит связаться.",
  sourceType: "TEXT_CHAT",
  endUser: { id: "user-1", externalId: "customer-1" },
  conversationId: "conversation-1",
  version: 1,
  isRead: true,
  createdAt: "2026-07-19T18:00:00.000Z",
  updatedAt: "2026-07-19T18:00:00.000Z",
  content: { reasonCode: "SUPPORT_REQUEST" },
  evidence: [
    { type: "USER_MESSAGE", excerpt: "<script>bad()</script> Нужна помощь" },
  ],
};

describe("AIProposalDetail", () => {
  it("shows resolve instead of approval actions for acknowledge proposals", () => {
    const wrapper = mount(AIProposalDetail, {
      props: { proposal, loading: false, deciding: false, canDecide: true },
      global: {
        stubs: {
          Button: {
            props: ["label"],
            template: '<button type="button">{{ label }}</button>',
          },
          Message: { template: "<div><slot /></div>" },
          Skeleton: { template: "<div />" },
          RouterLink: {
            props: ["to"],
            template: '<a href="#"><slot /></a>',
          },
        },
      },
    });

    expect(wrapper.text()).toContain("Обработано");
    expect(wrapper.text()).not.toContain("Принять");
    expect(wrapper.text()).not.toContain("Отклонить");
    expect(wrapper.find("script").exists()).toBe(false);
    expect(wrapper.text()).toContain("<script>bad()</script>");
  });

  it("shows typed AI Review findings, limitations, and Event links", () => {
    const wrapper = mount(AIProposalDetail, {
      props: {
        proposal: {
          ...proposal,
          kind: "INSIGHT",
          sourceType: "BACKGROUND_AI",
          title: "AI Review",
          content: {
            findings: [
              {
                title: "Депозит отклонён",
                detail: "Три попытки завершились ошибкой.",
                eventIds: ["10000000-0000-4000-8000-000000000001"],
              },
            ],
            limitations: ["Данных о провайдере платежей нет."],
          },
          evidence: [],
        },
        loading: false,
        deciding: false,
        canDecide: true,
      },
      global: {
        stubs: {
          Button: true,
          Message: { template: "<div><slot /></div>" },
          Skeleton: { template: "<div />" },
          RouterLink: {
            props: ["to"],
            template: '<a :data-to="JSON.stringify(to)"><slot /></a>',
          },
        },
      },
    });

    expect(wrapper.text()).toContain("Депозит отклонён");
    expect(wrapper.text()).toContain("Три попытки завершились ошибкой.");
    expect(wrapper.text()).toContain("Данных о провайдере платежей нет.");
    expect(wrapper.html()).toContain("10000000-0000-4000-8000-000000000001");
    expect(wrapper.html()).toContain("event-logs");
  });
});
