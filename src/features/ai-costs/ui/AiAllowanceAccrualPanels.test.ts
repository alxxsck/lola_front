import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/http/api-error";
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

  it("selects an event instead of asking for event and revision UUIDs", async () => {
    const wrapper = mount(AiAllowanceAccrualRulesPanel, {
      props: { projectId: "project-1", canRead: true, canManage: true },
      global: {
        stubs: {
          Dialog: {
            props: ["visible"],
            template: "<div v-if='visible'><slot /></div>",
          },
        },
      },
    });
    await flushPromises();
    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Создать правило"))!
      .trigger("click");

    const form = wrapper.get("form.form");
    expect(
      form.findComponent({ name: "EventDefinitionSelect" }).exists(),
    ).toBe(true);
    expect(form.text()).not.toContain("ID типа события");
    expect(form.text()).not.toContain("ID разрешённых версий");
    expect(form.text()).toContain("текущая опубликованная версия");
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

  it("shows integration events in accrual rules and history", async () => {
    mocks.listReceipts.mockResolvedValue({
      items: [
        {
          id: "receipt-1",
          evaluatedAt: "2026-08-04T12:00:00.000Z",
          endUserId: "user-1",
          status: "GRANTED",
          rewardUsd: "1.00",
          rejectionReason: null,
          grantId: "grant-1",
          ruleRevision: {
            rule: { name: "Бонус за событие", key: "EVENT_BONUS" },
            revisionNumber: 1,
          },
          eventLog: {
            id: "event-1",
            source: "INTEGRATION",
            eventDefinitionKey: { name: "Депозит", code: "DEPOSIT" },
          },
        },
      ],
      pageInfo: { hasMore: false, nextCursor: null },
    });
    const receipts = mount(AiAllowanceAccrualReceiptsPanel, {
      props: { projectId: "project-1" },
    });
    const rules = mount(AiAllowanceAccrualRulesPanel, {
      props: { projectId: "project-1", canRead: true, canManage: true },
      global: {
        stubs: {
          Dialog: {
            props: ["visible"],
            template: "<div v-if='visible'><slot /></div>",
          },
        },
      },
    });
    await flushPromises();
    await rules
      .findAll("button")
      .find((button) => button.text().includes("Создать правило"))!
      .trigger("click");

    expect(receipts.text()).toContain("Интеграция");
    expect(rules.text()).toContain("Интеграция");
  });

  it("requires a fresh login for an accrual-rule revision without replaying it", async () => {
    mocks.putRule.mockRejectedValue(
      new ApiError(
        428,
        "unsafe backend text",
        undefined,
        "step-up-request",
        "REAUTHENTICATION_REQUIRED",
      ),
    );
    const wrapper = mount(AiAllowanceAccrualRulesPanel, {
      props: { projectId: "project-1", canRead: true, canManage: true },
      global: {
        stubs: {
          Dialog: {
            props: ["visible"],
            template: "<div v-if='visible'><slot /></div>",
          },
        },
      },
    });
    await flushPromises();
    const form = await openValidRule(wrapper);
    await form.trigger("submit");
    await flushPromises();

    expect(wrapper.text()).toContain("не будут повторены автоматически");
    expect(wrapper.text()).not.toContain("unsafe backend text");
    await wrapper.get('[data-testid="allowance-fresh-login"]').trigger("click");
    expect(wrapper.emitted("fresh-login")).toEqual([[]]);
    expect(mocks.putRule).toHaveBeenCalledOnce();
  });

  it("ignores a late rule failure from the previous Project", async () => {
    const pending = deferredReject();
    mocks.putRule.mockReturnValue(pending.promise);
    const wrapper = mount(AiAllowanceAccrualRulesPanel, {
      props: { projectId: "project-1", canRead: true, canManage: true },
      global: {
        stubs: {
          Dialog: {
            props: ["visible"],
            template: "<div v-if='visible'><slot /></div>",
          },
        },
      },
    });
    await flushPromises();
    const form = await openValidRule(wrapper);

    void form.trigger("submit");
    await flushPromises();
    expect(mocks.putRule).toHaveBeenCalledOnce();
    await wrapper.setProps({ projectId: "project-2" });
    pending.reject(new Error("previous Project rule detail"));
    await flushPromises();

    expect(wrapper.text()).not.toContain("previous Project rule detail");
  });

  it("does not let a pre-revocation rule failure overwrite a new draft", async () => {
    const pending = deferredReject();
    mocks.putRule.mockReturnValue(pending.promise);
    const wrapper = mount(AiAllowanceAccrualRulesPanel, {
      props: { projectId: "project-1", canRead: true, canManage: true },
      global: {
        stubs: {
          Dialog: {
            props: ["visible"],
            template: "<div v-if='visible'><slot /></div>",
          },
        },
      },
    });
    await flushPromises();
    const previousForm = await openValidRule(wrapper);
    void previousForm.trigger("submit");
    await flushPromises();
    expect(mocks.putRule).toHaveBeenCalledOnce();

    await wrapper.setProps({ canManage: false });
    await wrapper.setProps({ canManage: true });
    await openValidRule(wrapper);
    pending.reject(new Error("pre-revocation rule detail"));
    await flushPromises();

    expect(wrapper.find("form.form").exists()).toBe(true);
    expect(wrapper.text()).not.toContain("pre-revocation rule detail");
  });

  it("finishes a pending rules read across manage revoke and regrant", async () => {
    let resolveRules!: (value: {
      items: never[];
      pageInfo: { hasMore: false; nextCursor: null };
      revisionHistoryLimit: number;
    }) => void;
    mocks.listRules.mockReturnValue(
      new Promise((resolve) => {
        resolveRules = resolve;
      }),
    );
    const wrapper = mount(AiAllowanceAccrualRulesPanel, {
      props: { projectId: "project-1", canRead: true, canManage: true },
    });

    await wrapper.setProps({ canManage: false });
    await wrapper.setProps({ canManage: true });
    resolveRules({
      items: [],
      pageInfo: { hasMore: false, nextCursor: null },
      revisionHistoryLimit: 20,
    });
    await flushPromises();

    expect(wrapper.text()).toContain("Правил пока нет");
    expect(wrapper.text()).toContain("Создать правило");
  });
});

async function openValidRule(wrapper: ReturnType<typeof mount>) {
  await wrapper
    .findAll("button")
    .find((button) => button.text().includes("Создать правило"))!
    .trigger("click");
  const form = wrapper.get("form.form");
  const inputs = form.findAll("input");
  await inputs[0]!.setValue("WELCOME_BONUS");
  await inputs[1]!.setValue("Welcome bonus");
  form.findComponent({ name: "EventDefinitionSelect" }).vm.$emit("select", {
    definitionKeyId: "11111111-1111-4111-8111-111111111111",
    currentRevisionId: "22222222-2222-4222-8222-222222222222",
    name: "Welcome bonus",
    code: "WELCOME_BONUS",
  });
  await flushPromises();
  const moneyInputs = form.findAll('input[placeholder="0,00"]');
  await moneyInputs[0]!.setValue("1");
  await moneyInputs[1]!.setValue("2");
  await moneyInputs[2]!.setValue("10");
  await form.findAll("textarea").at(-1)!.setValue("Protected accrual rule");
  return form;
}

function deferredReject() {
  let reject!: (cause: unknown) => void;
  const promise = new Promise<never>((_resolve, rejectPromise) => {
    reject = rejectPromise;
  });
  return { promise, reject };
}
