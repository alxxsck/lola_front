import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AiAllowanceUserDialog from "./AiAllowanceUserDialog.vue";

const mocks = vi.hoisted(() => ({
  balance: vi.fn(),
  policy: vi.fn(),
  grant: vi.fn(),
  assignment: vi.fn(),
}));
vi.mock("../api/ai-allowance-repository", () => ({
  aiAllowanceRepository: {
    endUserBalance: mocks.balance,
    projectPolicy: mocks.policy,
    createGrant: mocks.grant,
    putEndUserAssignment: mocks.assignment,
  },
}));

describe("AiAllowanceUserDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.balance.mockResolvedValue({
      account: {
        projectId: "project-1",
        endUserId: "user-1",
        currency: "USD",
        availableUsd: "3.000000000001",
        reservedUsd: "1.000000000000",
        settledUsd: "2.000000000000",
        unknownHeldUsd: "0.000000000000",
        overageUsd: "0.000000000000",
        version: "1",
      },
      currentPeriod: null,
      currentPeriodSpend: null,
      pendingBaseAllocationUsd: "3.000000000001",
      activeGrants: [],
      grantsPageInfo: { hasMore: false, nextCursor: null },
      endUserAssignment: null,
    });
    mocks.policy.mockResolvedValue({
      policy: null,
      plans: [],
      defaultAssignment: null,
      runtimeGates: {
        hardEnforcementApproved: false,
        emergencyDisabled: false,
      },
    });
    mocks.grant.mockResolvedValue({ replayed: false });
  });

  it("shows exact balance and hides grant/assignment controls without permissions", async () => {
    const wrapper = mountDialog({ canGrant: false, canManage: false });
    await flushPromises();
    expect(wrapper.text()).toContain("3,00 $");
    expect(wrapper.text()).not.toContain("Начислить квоту");
    expect(wrapper.text()).not.toContain("Назначить план");
  });

  it("keeps the generated idempotency key while rejecting an over-precision grant", async () => {
    const wrapper = mountDialog({ canGrant: true, canManage: false });
    await flushPromises();
    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Начислить квоту"))!
      .trigger("click");
    const inputs = wrapper.findAll("input");
    await inputs[0]!.setValue("0.1234567890123");
    await wrapper.find("textarea").setValue("Manual loyalty reward");
    const originalKey = inputs.at(-1)!.element.value;
    await wrapper.find("form").trigger("submit");
    expect(wrapper.text()).toContain("decimal-строкой");
    expect(inputs.at(-1)!.element.value).toBe(originalKey);
    expect(mocks.grant).not.toHaveBeenCalled();
  });
});

function mountDialog(permission: { canGrant: boolean; canManage: boolean }) {
  return mount(AiAllowanceUserDialog, {
    props: {
      visible: true,
      projectId: "project-1",
      endUserId: "user-1",
      identity: "external-1",
      ...permission,
    },
    global: {
      stubs: {
        Dialog: {
          props: ["visible"],
          template: "<div><slot /><slot name='footer' /></div>",
        },
      },
    },
  });
}
