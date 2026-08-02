import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/http/api-error";
import AiAllowanceJournalPanel from "./AiAllowanceJournalPanel.vue";
import AiAllowanceLimitsPanel from "./AiAllowanceLimitsPanel.vue";

const mocks = vi.hoisted(() => ({
  projectPolicy: vi.fn(),
  planRevisions: vi.fn(),
  journal: vi.fn(),
  putDefaultPlan: vi.fn(),
  putPlan: vi.fn(),
  putCohortAssignment: vi.fn(),
  reconcile: vi.fn(),
  reconciliationQueue: vi.fn(),
  resolveAttempt: vi.fn(),
  endUserBalance: vi.fn(),
  correct: vi.fn(),
}));
vi.mock("../api/ai-allowance-repository", () => ({
  aiAllowanceRepository: {
    projectPolicy: mocks.projectPolicy,
    planRevisions: mocks.planRevisions,
    journal: mocks.journal,
    putDefaultPlan: mocks.putDefaultPlan,
    putPlan: mocks.putPlan,
    putCohortAssignment: mocks.putCohortAssignment,
    reconcile: mocks.reconcile,
    reconciliationQueue: mocks.reconciliationQueue,
    resolveAttempt: mocks.resolveAttempt,
    endUserBalance: mocks.endUserBalance,
    correct: mocks.correct,
  },
}));

const policy = {
  projectPolicyVersion: "4",
  policy: {
    projectId: "project-1",
    enforcementMode: "SOFT",
    timezone: "Europe/Madrid",
    warningContent: {},
    lowThresholdMode: "PERCENT",
    lowThresholdValue: "10.000000000000",
    exhaustedContent: {},
    showEndUserExactUsd: false,
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

function journalPage(reason: string) {
  return {
    items: [
      {
        id: `entry-${reason}`,
        entryType: "GRANT",
        costQuality: null,
        deltaAvailableUsd: "1.000000000000",
        deltaReservedUsd: "0.000000000000",
        deltaSettledUsd: "0.000000000000",
        deltaUnknownUsd: "0.000000000000",
        deltaOverageUsd: "0.000000000000",
        periodId: null,
        reservationId: null,
        grantId: null,
        usageRecordId: null,
        correctsEntryId: null,
        actorType: "SYSTEM",
        actorId: "test",
        reason,
        occurredAt: "2026-08-02T10:00:00.000Z",
        createdAt: "2026-08-02T10:00:00.000Z",
      },
    ],
    pageInfo: { hasMore: false, nextCursor: null },
  } as const;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("allowance admin panels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.projectPolicy.mockResolvedValue(policy);
    mocks.journal.mockResolvedValue({
      items: [],
      pageInfo: { hasMore: false, nextCursor: null },
    });
    mocks.reconcile.mockResolvedValue({ replayed: false });
    mocks.reconciliationQueue.mockResolvedValue({
      items: [],
      pageInfo: { hasMore: false, nextCursor: null },
    });
    mocks.resolveAttempt.mockResolvedValue({ replayed: false });
    mocks.endUserBalance.mockResolvedValue({
      account: {
        projectId: "project-1",
        endUserId: "user-1",
        currency: "USD",
        availableUsd: "3.000000000000",
        reservedUsd: "0.000000000000",
        settledUsd: "1.000000000000",
        unknownHeldUsd: "0.000000000000",
        overageUsd: "0.000000000000",
        version: "7",
      },
      currentPeriod: null,
      currentPeriodSpend: null,
      pendingBaseAllocationUsd: "0.000000000000",
      activeGrants: [],
      grantsPageInfo: { hasMore: false, nextCursor: null },
      endUserAssignment: null,
    });
    mocks.correct.mockResolvedValue({ replayed: false });
    mocks.putDefaultPlan.mockResolvedValue({
      projectPolicyVersion: "5",
      replayed: false,
    });
    mocks.putPlan.mockResolvedValue({
      projectPolicyVersion: "5",
      replayed: false,
    });
    mocks.putCohortAssignment.mockResolvedValue({
      projectPolicyVersion: "5",
      replayed: false,
    });
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

  it("shows the effective LOW threshold to read-only operators", async () => {
    const wrapper = mount(AiAllowanceLimitsPanel, {
      props: {
        projectId: "project-1",
        canRead: true,
        canManage: false,
        canReconcile: false,
      },
    });
    await flushPromises();

    expect(
      wrapper.get('[data-testid="allowance-low-threshold-summary"]').text(),
    ).toBe("10% от базового лимита");
    expect(wrapper.text()).not.toContain("Изменить базовый план");
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

  it("composes grant and policy permissions without hiding either workspace", async () => {
    const wrapper = mount(AiAllowanceLimitsPanel, {
      props: {
        projectId: "project-1",
        canRead: true,
        canManage: true,
        canGrant: true,
        canReconcile: false,
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("Ручное начисление квоты");
    expect(wrapper.text()).toContain("Лимиты расходов");
    expect(wrapper.text()).toContain("Изменить базовый план");
  });

  it("blocks HARD submission until the explicit risk confirmation", async () => {
    mocks.putDefaultPlan.mockResolvedValue({
      projectPolicyVersion: "5",
      replayed: false,
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
    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Изменить базовый план"))!
      .trigger("click");
    await wrapper.get("#allowance-enforcement").setValue("HARD");
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
        expectedProjectPolicyVersion: "4",
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

  it("edits the exact end-user USD visibility gate only through the managed policy form", async () => {
    mocks.putDefaultPlan.mockResolvedValue({
      projectPolicyVersion: "5",
      replayed: false,
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
    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Изменить базовый план"))!
      .trigger("click");
    expect(
      (wrapper.get("#show-end-user-exact-usd").element as HTMLInputElement)
        .checked,
    ).toBe(false);

    await wrapper.get("#show-end-user-exact-usd").setValue(true);
    await wrapper
      .findAll("textarea")
      .at(-1)!
      .setValue("Enable exact USD visibility");
    await wrapper.get("form.allowance-form").trigger("submit");
    await flushPromises();

    expect(mocks.putDefaultPlan).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        expectedProjectPolicyVersion: "4",
        lowThresholdMode: "PERCENT",
        lowThresholdValue: "10.000000000000",
        showEndUserExactUsd: true,
      }),
      expect.any(String),
    );
  });

  it("saves a configurable LOW threshold and rejects an invalid percentage", async () => {
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

    await wrapper.get("#allowance-low-threshold-value").setValue("101");
    await wrapper
      .findAll("textarea")
      .at(-1)!
      .setValue("Configure warning threshold");
    await wrapper.get("form.allowance-form").trigger("submit");
    expect(wrapper.text()).toContain("не больше 100 процентов");
    expect(mocks.putDefaultPlan).not.toHaveBeenCalled();

    await wrapper.get("#allowance-low-threshold-mode").setValue("ABSOLUTE_USD");
    await wrapper.get("#allowance-low-threshold-value").setValue("1.25");
    await wrapper.get("form.allowance-form").trigger("submit");
    await flushPromises();

    expect(mocks.putDefaultPlan).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        lowThresholdMode: "ABSOLUTE_USD",
        lowThresholdValue: "1.25",
      }),
      expect.any(String),
    );
  });

  it("keeps the policy draft open after an OCC conflict", async () => {
    mocks.putDefaultPlan.mockRejectedValue(
      new ApiError(
        409,
        "Conflict",
        undefined,
        undefined,
        "AI_ALLOWANCE_CONFIGURATION_VERSION_CONFLICT",
      ),
    );
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
    const form = wrapper.get("form.allowance-form");
    await form.findAll("textarea").at(-1)!.setValue("Keep policy draft");
    await form.trigger("submit");
    await flushPromises();

    expect(wrapper.find("form.allowance-form").exists()).toBe(true);
    expect(wrapper.text()).toContain("Конфигурация лимитов уже изменилась");
    expect(wrapper.text()).toContain("Загрузить актуальную версию");
    expect(wrapper.findAll("textarea").at(-1)!.element.value).toBe(
      "Keep policy draft",
    );
  });

  it("does not merge a late plans page from the previous project", async () => {
    const projectView = (
      projectId: string,
      name: string,
      hasMore: boolean,
    ) => ({
      ...policy,
      policy: { ...policy.policy, projectId },
      plans: [
        {
          ...policy.plans[0],
          id: `plan-${projectId}`,
          name,
          revisions: [
            { ...policy.plans[0].revisions[0], planId: `plan-${projectId}` },
          ],
        },
      ],
      plansPageInfo: {
        hasMore,
        nextCursor: hasMore ? `cursor-${projectId}` : null,
      },
      defaultAssignment: {
        ...policy.defaultAssignment,
        planId: `plan-${projectId}`,
      },
    });
    const stalePage = deferred<ReturnType<typeof projectView>>();
    mocks.projectPolicy.mockImplementation(
      (projectId: string, query?: { planCursor?: string }) => {
        if (projectId === "project-1" && query) return stalePage.promise;
        return Promise.resolve(
          projectId === "project-1"
            ? projectView(projectId, "Tenant one plan", true)
            : projectView(projectId, "Tenant two plan", false),
        );
      },
    );
    const wrapper = mount(AiAllowanceLimitsPanel, {
      props: {
        projectId: "project-1",
        canRead: true,
        canManage: true,
        canReconcile: false,
      },
    });
    await flushPromises();
    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Показать остальные планы"))!
      .trigger("click");

    await wrapper.setProps({ projectId: "project-2" });
    await flushPromises();
    expect(wrapper.text()).toContain("Tenant two plan");

    stalePage.resolve(projectView("project-1", "Stale tenant plan", false));
    await flushPromises();

    expect(wrapper.text()).toContain("Tenant two plan");
    expect(wrapper.text()).not.toContain("Stale tenant plan");
  });

  it("closes policy mutation forms when manage permission is revoked", async () => {
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
    expect(wrapper.find("form.allowance-form").exists()).toBe(true);

    await wrapper.setProps({ canManage: false });

    expect(wrapper.find("form.allowance-form").exists()).toBe(false);
    expect(mocks.putDefaultPlan).not.toHaveBeenCalled();
  });

  it("requires a published Segment UUID for a SEGMENT assignment", async () => {
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
      .find((button) => button.text().includes("Назначить когорте"))!
      .trigger("click");
    const form = wrapper.get("form.allowance-form");
    await form
      .get('input[placeholder="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"]')
      .setValue("vip");
    await form.get("textarea").setValue("Assign published segment");
    await form.trigger("submit");

    expect(wrapper.text()).toContain("UUID опубликованного сегмента");
    expect(mocks.putCohortAssignment).not.toHaveBeenCalled();
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

  it("does not load account version or expose corrections without reconcile permission", async () => {
    mocks.journal.mockResolvedValue(journalPage("read-only entry"));
    const wrapper = mount(AiAllowanceJournalPanel, {
      props: {
        projectId: "project-1",
        canRead: true,
        canReconcile: false,
        endUserId: "user-1",
        cursor: "",
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("read-only entry");
    expect(wrapper.text()).not.toContain("Корректировать");
    expect(mocks.endUserBalance).not.toHaveBeenCalled();
  });

  it("creates an exact optimistic correction from a journal entry", async () => {
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
      .find((button) => button.text().includes("Корректировать"))!
      .trigger("click");
    const form = wrapper.get("form.correction-form");
    await form.get('input[inputmode="decimal"]').setValue("0.1234567890123");
    await form.get("textarea").setValue("Correct audited allowance entry");
    await form.trigger("submit");
    expect(wrapper.text()).toContain("точной decimal-строкой");
    expect(mocks.correct).not.toHaveBeenCalled();

    await form.get('input[inputmode="decimal"]').setValue("1.000000000001");
    await form.get('input[type="datetime-local"]').setValue("2099-08-03T10:00");
    const key = form.get("input[readonly]").element.getAttribute("value");
    await form.trigger("submit");
    await flushPromises();
    expect(mocks.correct).toHaveBeenCalledWith(
      "project-1",
      "user-1",
      {
        correctsEntryId: "33333333-3333-4333-8333-333333333333",
        deltaAvailableUsd: "1.000000000001",
        expectedAccountVersion: "7",
        expiresAt: new Date("2099-08-03T10:00").toISOString(),
        reason: "Correct audited allowance entry",
      },
      key,
    );
    expect(wrapper.emitted("changed")).toEqual([[]]);
  });

  it("omits expiry for a negative correction and drops mutation feedback after tenant change", async () => {
    mocks.journal.mockResolvedValue({
      ...journalPage("correction target"),
      items: [
        {
          ...journalPage("correction target").items[0],
          id: "33333333-3333-4333-8333-333333333333",
        },
      ],
    });
    mocks.endUserBalance.mockImplementation(
      (projectId: string, endUserId: string) =>
        Promise.resolve({
          account: {
            projectId,
            endUserId,
            currency: "USD",
            availableUsd: "3.000000000000",
            reservedUsd: "0.000000000000",
            settledUsd: "1.000000000000",
            unknownHeldUsd: "0.000000000000",
            overageUsd: "0.000000000000",
            version: "8",
          },
          currentPeriod: null,
          currentPeriodSpend: null,
          pendingBaseAllocationUsd: "0.000000000000",
          activeGrants: [],
          grantsPageInfo: { hasMore: false, nextCursor: null },
          endUserAssignment: null,
        }),
    );
    const pending = deferred<{ replayed: boolean }>();
    mocks.correct.mockReturnValueOnce(pending.promise);
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
      .find((button) => button.text().includes("Корректировать"))!
      .trigger("click");
    const form = wrapper.get("form.correction-form");
    await form.get('input[inputmode="decimal"]').setValue("-1.000000000000");
    await form.get("textarea").setValue("Remove incorrect available allowance");
    await form.trigger("submit");

    expect(mocks.correct).toHaveBeenCalledWith(
      "project-1",
      "user-1",
      expect.not.objectContaining({ expiresAt: expect.anything() }),
      expect.any(String),
    );
    await wrapper.setProps({ projectId: "project-2", endUserId: "user-2" });
    pending.resolve({ replayed: false });
    await flushPromises();

    expect(wrapper.text()).not.toContain("Корректировка записана");
  });

  it("does not restore the previous user or cursor page when a reload fails", async () => {
    mocks.journal.mockResolvedValueOnce(journalPage("previous journal row"));
    const wrapper = mount(AiAllowanceJournalPanel, {
      props: {
        projectId: "project-1",
        canRead: true,
        canReconcile: false,
        endUserId: "user-1",
        cursor: "cursor-1",
      },
    });
    await flushPromises();
    expect(wrapper.text()).toContain("previous journal row");

    mocks.journal.mockRejectedValueOnce(new Error("new cursor failed"));
    await wrapper.setProps({
      projectId: "project-2",
      endUserId: "user-2",
      cursor: "cursor-2",
    });
    await flushPromises();

    expect(wrapper.text()).toContain("new cursor failed");
    expect(wrapper.text()).not.toContain("previous journal row");
  });

  it("ignores a late journal response from a previous full context", async () => {
    const previous = deferred<ReturnType<typeof journalPage>>();
    mocks.journal
      .mockReturnValueOnce(previous.promise)
      .mockResolvedValueOnce(journalPage("current journal row"));
    const wrapper = mount(AiAllowanceJournalPanel, {
      props: {
        projectId: "project-1",
        canRead: true,
        canReconcile: false,
        endUserId: "user-1",
        cursor: "cursor-1",
      },
    });

    await wrapper.setProps({ endUserId: "user-2", cursor: "cursor-2" });
    await flushPromises();
    previous.resolve(journalPage("stale journal row"));
    await flushPromises();

    expect(wrapper.text()).toContain("current journal row");
    expect(wrapper.text()).not.toContain("stale journal row");
  });
});
