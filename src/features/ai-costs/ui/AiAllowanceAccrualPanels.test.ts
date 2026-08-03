import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AiAllowanceAccrualReceiptsPanel from "./AiAllowanceAccrualReceiptsPanel.vue";
import AiAllowanceAccrualRulesPanel from "./AiAllowanceAccrualRulesPanel.vue";

const mocks = vi.hoisted(() => ({
  listRules: vi.fn(),
  putRule: vi.fn(),
  listReceipts: vi.fn(),
}));

vi.mock("../api/ai-allowance-accrual-repository", () => ({
  aiAllowanceAccrualRepository: {
    listRules: mocks.listRules,
    putRule: mocks.putRule,
    listReceipts: mocks.listReceipts,
  },
}));

describe("allowance accrual panels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listRules.mockResolvedValue({
      items: [],
      pageInfo: { hasMore: false, nextCursor: null },
      revisionHistoryLimit: 20,
    });
    mocks.listReceipts.mockResolvedValue({
      items: [],
      pageInfo: { hasMore: false, nextCursor: null },
    });
  });

  it("describes automatic accrual rules without backend terminology", async () => {
    const wrapper = mount(AiAllowanceAccrualRulesPanel, {
      props: { projectId: "project-1", canRead: true, canManage: true },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("Автоматические начисления");
    expect(wrapper.text()).toContain("после выбранного события");
    expect(wrapper.text()).not.toContain("cap");
    expect(wrapper.text()).not.toContain("cooldown");
    expect(wrapper.text()).not.toContain("immutable");
  });

  it("labels the accrual history and its filters in Russian", async () => {
    const wrapper = mount(AiAllowanceAccrualReceiptsPanel, {
      props: { projectId: "project-1" },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("История автоматических начислений");
    expect(wrapper.text()).toContain("ID пользователя");
    expect(wrapper.text()).toContain("По выбранным фильтрам начислений нет");
    expect(wrapper.text()).not.toContain("Receipts");
    expect(wrapper.text()).not.toContain("End User");
    expect(wrapper.get("input").attributes("placeholder")).toBeTruthy();
  });
});
