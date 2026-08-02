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
    const wrapper = mountDialog({
      canGrant: false,
      canManage: false,
      canReconcile: false,
    });
    await flushPromises();
    expect(wrapper.text()).toContain("3,00 $");
    expect(wrapper.text()).not.toContain("Начислить квоту");
    expect(wrapper.text()).not.toContain("Назначить план");
    expect(wrapper.text()).not.toContain("Корректировать по журналу");
  });

  it("keeps the generated idempotency key while rejecting an over-precision grant", async () => {
    const wrapper = mountDialog({
      canGrant: true,
      canManage: false,
      canReconcile: false,
    });
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

  it("opens the journal correction workflow only with reconcile permission", async () => {
    const wrapper = mountDialog({
      canGrant: false,
      canManage: false,
      canReconcile: true,
    });
    await flushPromises();

    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Корректировать по журналу"))!
      .trigger("click");

    expect(wrapper.emitted("openJournal")).toEqual([["user-1"]]);
  });

  it("returns to the summary when grant permission is revoked", async () => {
    const wrapper = mountDialog({
      canGrant: true,
      canManage: false,
      canReconcile: false,
    });
    await flushPromises();
    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Начислить квоту"))!
      .trigger("click");
    expect(wrapper.find("form").exists()).toBe(true);

    await wrapper.setProps({ canGrant: false });

    expect(wrapper.find("form").exists()).toBe(false);
    expect(mocks.grant).not.toHaveBeenCalled();
  });

  it("does not merge a late grants page from the previous user context", async () => {
    const stale = deferred<ReturnType<typeof balanceView>>();
    mocks.balance.mockImplementation(
      (
        projectId: string,
        endUserId: string,
        query?: { grantCursor?: string },
      ) =>
        query?.grantCursor
          ? stale.promise
          : Promise.resolve(
              balanceView(projectId, endUserId, `${endUserId} grant`, true),
            ),
    );
    const wrapper = mountDialog({
      canGrant: false,
      canManage: false,
      canReconcile: false,
    });
    await flushPromises();
    await wrapper
      .findAll("button")
      .find((button) =>
        button.text().includes("Показать остальные начисления"),
      )!
      .trigger("click");

    await wrapper.setProps({ projectId: "project-2", endUserId: "user-2" });
    await flushPromises();
    expect(wrapper.text()).toContain("user-2 grant");

    stale.resolve(balanceView("project-1", "user-1", "stale grant", false));
    await flushPromises();

    expect(wrapper.text()).toContain("user-2 grant");
    expect(wrapper.text()).not.toContain("stale grant");
  });
});

function balanceView(
  projectId: string,
  endUserId: string,
  grantReason: string,
  hasMore: boolean,
) {
  return {
    account: {
      projectId,
      endUserId,
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
    activeGrants: [
      {
        id: `grant-${endUserId}-${grantReason}`,
        amountUsd: "1.000000000000",
        sourceType: "MANUAL",
        sourceId: "source-1",
        validFrom: "2026-08-01T00:00:00.000Z",
        expiresAt: "2026-08-03T00:00:00.000Z",
        status: "ACTIVE",
        reason: grantReason,
        actorType: "ADMIN",
        actorId: "admin-1",
        createdAt: "2026-08-01T00:00:00.000Z",
      },
    ],
    grantsPageInfo: {
      hasMore,
      nextCursor: hasMore ? `cursor-${endUserId}` : null,
    },
    endUserAssignment: null,
  } as const;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function mountDialog(permission: {
  canGrant: boolean;
  canManage: boolean;
  canReconcile: boolean;
}) {
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
