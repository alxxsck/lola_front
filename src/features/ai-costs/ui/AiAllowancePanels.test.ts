import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AiAllowanceJournalPanel from "./AiAllowanceJournalPanel.vue";
import AiAllowanceLimitsPanel from "./AiAllowanceLimitsPanel.vue";

const mocks = vi.hoisted(() => ({
  projectPolicy: vi.fn(),
  journal: vi.fn(),
  putDefaultPlan: vi.fn(),
  reconcile: vi.fn(),
}));
vi.mock("../api/ai-allowance-repository", () => ({
  aiAllowanceRepository: {
    projectPolicy: mocks.projectPolicy,
    journal: mocks.journal,
    putDefaultPlan: mocks.putDefaultPlan,
    reconcile: mocks.reconcile,
  },
}));

const policy = {
  policy: {
    projectId: "project-1",
    enforcementMode: "SOFT",
    timezone: "Europe/Madrid",
    warningContent: {},
    exhaustedContent: {},
    version: "1",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  },
  plans: [
    {
      id: "plan-1",
      key: "project-default",
      name: "Project default",
      status: "ACTIVE",
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      revisions: [
        {
          id: "revision-1",
          planId: "plan-1",
          revisionNumber: 1,
          periodKind: "DAY",
          recurringAmountUsd: "5.000000000001",
          dailyCapUsd: null,
          effectiveFrom: "2026-08-01T00:00:00.000Z",
          changeReason: "Initial limit",
          createdAt: "2026-08-01T00:00:00.000Z",
          categoryRules: [],
        },
      ],
      revisionsPageInfo: { hasMore: false, nextCursor: null },
    },
  ],
  plansPageInfo: { hasMore: false, nextCursor: null },
  defaultAssignment: {
    id: "33333333-3333-4333-8333-333333333333",
    scope: "PROJECT_DEFAULT",
    endUserId: null,
    planId: "plan-1",
    effectiveFrom: "2026-08-01T00:00:00.000Z",
    effectiveUntil: null,
    version: "1",
    reason: "Initial limit",
  },
  runtimeGates: { hardEnforcementApproved: true, emergencyDisabled: false },
} as const;

describe("allowance admin panels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.projectPolicy.mockResolvedValue(policy);
    mocks.journal.mockResolvedValue({
      items: [],
      pageInfo: { hasMore: false, nextCursor: null },
    });
    mocks.reconcile.mockResolvedValue({ replayed: false });
  });

  it("permission-gates the policy read without issuing a request", async () => {
    const wrapper = mount(AiAllowanceLimitsPanel, {
      props: {
        projectId: "project-1",
        canRead: false,
        canManage: false,
        canReconcile: false,
      },
    });
    await flushPromises();
    expect(wrapper.text()).toContain("project.ai_allowance.read");
    expect(mocks.projectPolicy).not.toHaveBeenCalled();
  });

  it("shows exact default allowance and exposes mutations only with manage permission", async () => {
    const wrapper = mount(AiAllowanceLimitsPanel, {
      props: {
        projectId: "project-1",
        canRead: true,
        canManage: true,
        canReconcile: false,
      },
    });
    await flushPromises();
    expect(wrapper.text()).toContain("5,00 $");
    expect(wrapper.get("button").text()).toContain("Изменить базовый план");
    expect(mocks.projectPolicy).toHaveBeenCalledWith("project-1");
  });

  it("blocks HARD submission until the explicit risk confirmation", async () => {
    mocks.putDefaultPlan.mockResolvedValue({ replayed: false });
    const wrapper = mount(AiAllowanceLimitsPanel, {
      props: {
        projectId: "project-1",
        canRead: true,
        canManage: true,
        canReconcile: false,
      },
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
      .find((button) => button.text().includes("Изменить базовый план"))!
      .trigger("click");
    await wrapper.findAll("select")[1]!.setValue("HARD");
    await wrapper
      .findAll("textarea")
      .at(-1)!
      .setValue("Enable approved hard limit");
    await wrapper.find("form").trigger("submit");
    expect(wrapper.text()).toContain("Подтвердите риски HARD enforcement");
    expect(mocks.putDefaultPlan).not.toHaveBeenCalled();

    await wrapper.get('input[type="checkbox"]').setValue(true);
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(mocks.putDefaultPlan).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        enforcementMode: "HARD",
        amountUsd: "5.000000000001",
      }),
      expect.any(String),
    );
  });

  it("disables HARD when runtime approval is absent or emergency disable is active", async () => {
    mocks.projectPolicy.mockResolvedValue({
      ...policy,
      runtimeGates: { hardEnforcementApproved: true, emergencyDisabled: true },
    });
    const wrapper = mount(AiAllowanceLimitsPanel, {
      props: {
        projectId: "project-1",
        canRead: true,
        canManage: true,
        canReconcile: false,
      },
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
    expect(wrapper.text()).toContain("Emergency disable активен");
    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Изменить базовый план"))!
      .trigger("click");
    expect(
      wrapper.get('option[value="HARD"]').attributes("disabled"),
    ).toBeDefined();
  });

  it("loads a user-scoped cursor page and never calls a global journal", async () => {
    mount(AiAllowanceJournalPanel, {
      props: {
        projectId: "project-1",
        canRead: true,
        canReconcile: true,
        endUserId: "user-1",
        cursor: "cursor-1",
      },
    });
    await flushPromises();
    expect(mocks.journal).toHaveBeenCalledWith("project-1", "user-1", {
      limit: 50,
      cursor: "cursor-1",
    });
  });

  it("permission-gates and submits audited reservation reconciliation with a stable key", async () => {
    mocks.journal.mockResolvedValue({
      items: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          entryType: "UNKNOWN_HELD",
          costQuality: "UNKNOWN",
          deltaAvailableUsd: "0.000000000000",
          deltaReservedUsd: "-1.000000000000",
          deltaSettledUsd: "0.000000000000",
          deltaUnknownUsd: "1.000000000000",
          deltaOverageUsd: "0.000000000000",
          periodId: null,
          reservationId: "44444444-4444-4444-8444-444444444444",
          grantId: null,
          usageRecordId: null,
          correctsEntryId: null,
          actorType: "SYSTEM",
          actorId: "reconciler",
          reason: "Provider outcome unknown",
          occurredAt: "2026-08-02T10:00:00.000Z",
          createdAt: "2026-08-02T10:00:00.000Z",
        },
      ],
      pageInfo: { hasMore: false, nextCursor: null },
    });
    const wrapper = mount(AiAllowanceJournalPanel, {
      props: {
        projectId: "project-1",
        canRead: true,
        canReconcile: true,
        endUserId: "user-1",
        cursor: "",
      },
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
      .find((button) => button.text().includes("Сверить"))!
      .trigger("click");
    await wrapper
      .find("textarea")
      .setValue("Confirmed unknown provider outcome");
    const key = wrapper.findAll("input").at(-1)!.element.value;
    await wrapper.find("form.reconcile-form").trigger("submit");
    await flushPromises();
    expect(mocks.reconcile).toHaveBeenCalledWith(
      "project-1",
      {
        reservationId: "44444444-4444-4444-8444-444444444444",
        resolution: "SETTLE_FROM_USAGE",
        reason: "Confirmed unknown provider outcome",
      },
      key,
    );
  });
});
