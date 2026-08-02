import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/http/api-error";
import AiAllowanceUserDialog from "./AiAllowanceUserDialog.vue";

const mocks = vi.hoisted(() => ({
  balance: vi.fn(),
  policy: vi.fn(),
  revisions: vi.fn(),
  grant: vi.fn(),
  assignment: vi.fn(),
}));
vi.mock("../api/ai-allowance-repository", () => ({
  aiAllowanceRepository: {
    endUserBalance: mocks.balance,
    projectPolicy: mocks.policy,
    planRevisions: mocks.revisions,
    createGrant: mocks.grant,
    putEndUserAssignment: mocks.assignment,
  },
}));

describe("AiAllowanceUserDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.balance.mockResolvedValue({
      projectPolicyVersion: "7",
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
      projectPolicyVersion: "7",
      localization: { defaultLocale: "ru", supportedLocales: ["ru"] },
      policy: null,
      plans: [],
      plansPageInfo: { hasMore: false, nextCursor: null },
      defaultAssignment: null,
      runtimeGates: {
        hardEnforcementApproved: false,
        emergencyDisabled: false,
      },
    });
    mocks.grant.mockResolvedValue({ replayed: false });
    mocks.revisions.mockResolvedValue({
      projectPolicyVersion: "7",
      plan: activePlan(),
      revisions: [],
      pageInfo: { hasMore: false, nextCursor: null },
    });
    mocks.assignment.mockResolvedValue({
      projectPolicyVersion: "8",
      replayed: false,
    });
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

  it("does not invent an effective project assignment that the API did not return", async () => {
    const wrapper = mountDialog({
      canGrant: false,
      canManage: false,
      canReconcile: false,
    });
    await flushPromises();

    expect(wrapper.text()).toContain(
      "источник группового плана API пока не сообщает",
    );
    expect(wrapper.text()).not.toContain(
      "Используется проектный план по умолчанию",
    );
  });

  it("opens the requested grant workflow after loading the current balance", async () => {
    const wrapper = mountDialog(
      {
        canGrant: true,
        canManage: false,
        canReconcile: false,
      },
      "grant",
    );
    await flushPromises();

    expect(wrapper.get("form").text()).toContain("Ручное начисление");
    expect(wrapper.findAll("input").at(-1)!.element.value).not.toBe("");
  });

  it("notifies its owner only after a successful grant and refreshed balance", async () => {
    const wrapper = mountDialog(
      {
        canGrant: true,
        canManage: false,
        canReconcile: false,
      },
      "grant",
    );
    await flushPromises();

    await wrapper.findAll("input")[0]!.setValue("1.25");
    await wrapper.get("textarea").setValue("Loyalty reward");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(mocks.grant).toHaveBeenCalledOnce();
    expect(mocks.balance).toHaveBeenCalledTimes(2);
    expect(wrapper.emitted("changed")).toEqual([[]]);
  });

  it("previews a grant and keeps an auditable receipt including safe replay", async () => {
    mocks.balance
      .mockResolvedValueOnce({
        ...balanceView("project-1", "user-1", "before", false),
        account: {
          ...balanceView("project-1", "user-1", "before", false).account,
          availableUsd: "3.000000000000",
        },
      })
      .mockResolvedValueOnce({
        ...balanceView("project-1", "user-1", "after", false),
        account: {
          ...balanceView("project-1", "user-1", "after", false).account,
          availableUsd: "2.000000000000",
        },
      });
    mocks.grant.mockResolvedValue({
      grant: {
        id: "grant-replayed-1",
        amountUsd: "1.250000000000",
        validFrom: "2026-08-02T10:00:00.000Z",
        expiresAt: "2026-08-03T10:00:00.000Z",
        reason: "Customer loyalty reward",
        actorType: "ADMIN",
        actorId: "admin-1",
      },
      account: { availableUsd: "4.250000000000" },
      replayed: true,
    });
    const wrapper = mountDialog(
      {
        canGrant: true,
        canManage: false,
        canReconcile: false,
      },
      "grant",
    );
    await flushPromises();

    await wrapper.findAll("input")[0]!.setValue("1.25");
    expect(wrapper.text()).toContain(
      "Предварительно доступно после начисления",
    );
    expect(wrapper.text()).toContain("4,25 $");
    expect(wrapper.get("select").text()).toContain("До конца текущего периода");
    expect(wrapper.get("select").text()).toContain("24 часа");
    expect(wrapper.get("select").text()).toContain("Выбранная дата");
    await wrapper.get("textarea").setValue("Customer loyalty reward");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    const receipt = wrapper.get('[data-testid="grant-receipt"]');
    expect(receipt.text()).toContain("grant-replayed-1");
    expect(receipt.text()).toContain("Доступно после команды: 4,25 $");
    expect(receipt.text()).toContain("При открытии формы было 3,00 $");
    expect(receipt.text()).not.toContain("Доступно после команды: 2,00 $");
    expect(receipt.text()).toContain("ADMIN:admin-1");
    expect(receipt.text()).toContain("дубликат не создан");
  });

  it("requires an operationally useful grant reason", async () => {
    const wrapper = mountDialog(
      {
        canGrant: true,
        canManage: false,
        canReconcile: false,
      },
      "grant",
    );
    await flushPromises();

    await wrapper.findAll("input")[0]!.setValue("1");
    await wrapper.get("textarea").setValue("short");
    await wrapper.get("form").trigger("submit");

    expect(wrapper.text()).toContain("от 10 до 500 символов");
    expect(mocks.grant).not.toHaveBeenCalled();
  });

  it("switches expiry to custom when the operator edits the start date", async () => {
    const wrapper = mountDialog(
      {
        canGrant: true,
        canManage: false,
        canReconcile: false,
      },
      "grant",
    );
    await flushPromises();
    const dateInputs = wrapper.findAll('input[type="datetime-local"]');

    expect(wrapper.get("select").element.value).toBe("24H");
    expect(dateInputs[1]!.attributes("readonly")).toBeDefined();
    await dateInputs[0]!.setValue("2026-08-03T12:00");

    expect(wrapper.get("select").element.value).toBe("CUSTOM");
    expect(dateInputs[1]!.attributes("readonly")).toBeUndefined();
  });

  it("shows responsibility and cap rules from the current plan revision", async () => {
    const revision = {
      id: "revision-1",
      planId: "11111111-1111-4111-8111-111111111111",
      revisionNumber: 1,
      periodKind: "DAY" as const,
      recurringAmountUsd: "5.000000000000",
      dailyCapUsd: null,
      effectiveFrom: "2026-08-01T00:00:00.000Z",
      changeReason: "Initial plan",
      createdAt: "2026-08-01T00:00:00.000Z",
      categoryRules: [
        {
          category: "VOICE" as const,
          responsibility: "PROJECT_SPONSORED" as const,
          capUsd: "2.000000000000",
        },
      ],
    };
    mocks.balance.mockResolvedValue({
      ...balanceView("project-1", "user-1", "current grant", false),
      currentPeriod: {
        id: "period-1",
        kind: "DAY",
        timezone: "Europe/Madrid",
        startsAt: "2026-08-02T22:00:00.000Z",
        endsAt: "2026-08-03T22:00:00.000Z",
        baseAllocatedUsd: "5.000000000000",
        status: "OPEN",
        planRevision: revision,
      },
    });
    mocks.policy.mockResolvedValue({
      ...policyView("7"),
      policy: {
        projectId: "project-1",
        enforcementMode: "SOFT",
        timezone: "Europe/Madrid",
        warningContent: {},
        lowThresholdMode: "PERCENT",
        lowThresholdValue: "10",
        exhaustedContent: {},
        showEndUserExactUsd: true,
        version: "7",
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
      },
      plans: [{ ...activePlan(), revisions: [revision] }],
    });

    const wrapper = mountDialog({
      canGrant: false,
      canManage: false,
      canReconcile: false,
    });
    await flushPromises();

    expect(wrapper.text()).toContain("Правила категорий текущего периода");
    expect(wrapper.text()).toContain("VOICE");
    expect(wrapper.text()).toContain("Оплачивает проект");
    expect(wrapper.text()).toContain("2,00 $");
    expect(wrapper.text()).toContain("Europe/Madrid");
  });

  it("uses the exact pinned revision embedded in the balance without pagination", async () => {
    const targetRevision = {
      id: "old-revision",
      planId: "11111111-1111-4111-8111-111111111111",
      revisionNumber: 1,
      periodKind: "DAY" as const,
      recurringAmountUsd: "5.000000000000",
      dailyCapUsd: null,
      effectiveFrom: "2025-01-01T00:00:00.000Z",
      changeReason: "Pinned legacy period",
      createdAt: "2025-01-01T00:00:00.000Z",
      categoryRules: [
        {
          category: "CHAT" as const,
          responsibility: "END_USER_ALLOWANCE" as const,
          capUsd: "1.000000000000",
        },
      ],
    };
    mocks.balance.mockResolvedValue({
      ...balanceView("project-1", "user-1", "current grant", false),
      currentPeriod: {
        id: "period-old",
        kind: "DAY",
        timezone: "UTC",
        startsAt: "2026-08-01T00:00:00.000Z",
        endsAt: "2026-08-02T00:00:00.000Z",
        baseAllocatedUsd: "5.000000000000",
        status: "OPEN",
        planRevision: targetRevision,
      },
    });
    mocks.policy.mockResolvedValue({
      ...policyView("7"),
      plans: [
        {
          ...activePlan(),
          revisions: [],
          revisionsPageInfo: {
            hasMore: true,
            nextCursor: "older-revisions",
          },
        },
      ],
    });
    const wrapper = mountDialog({
      canGrant: false,
      canManage: false,
      canReconcile: false,
    });
    await flushPromises();

    expect(mocks.revisions).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("CHAT");
    expect(wrapper.text()).toContain("Квота пользователя");
  });

  it("shows an observation period when no plan revision is pinned", async () => {
    mocks.balance.mockResolvedValue({
      ...balanceView("project-1", "user-1", "observed", false),
      currentPeriod: {
        id: "period-observation",
        kind: "DAY",
        timezone: "UTC",
        startsAt: "2026-08-01T00:00:00.000Z",
        endsAt: "2026-08-02T00:00:00.000Z",
        baseAllocatedUsd: "0.000000000000",
        status: "OPEN",
        planRevision: null,
      },
    });

    const wrapper = mountDialog({
      canGrant: false,
      canManage: false,
      canReconcile: false,
    });
    await flushPromises();

    expect(wrapper.find('[data-testid="category-rules-unavailable"]').exists()).toBe(
      true,
    );
    expect(wrapper.text()).toContain(
      "Наблюдательный период работает без закреплённого плана",
    );
    expect(wrapper.text()).not.toContain("Сервис временно недоступен");
  });

  it("replaces pinned category rules directly from a refreshed balance", async () => {
    const oldRevision = {
      id: "revision-old",
      planId: "11111111-1111-4111-8111-111111111111",
      revisionNumber: 1,
      periodKind: "DAY" as const,
      recurringAmountUsd: "5.000000000000",
      dailyCapUsd: null,
      effectiveFrom: "2026-08-01T00:00:00.000Z",
      changeReason: "Old rules",
      createdAt: "2026-08-01T00:00:00.000Z",
      categoryRules: [
        {
          category: "VOICE" as const,
          responsibility: "PROJECT_SPONSORED" as const,
          capUsd: "2.000000000000",
        },
      ],
    };
    const newRevision = {
      ...oldRevision,
      id: "revision-new",
      revisionNumber: 2,
      categoryRules: [],
    };
    const period = (revision: typeof oldRevision) => ({
      id: `period-${revision.id}`,
      kind: "DAY" as const,
      timezone: "UTC",
      startsAt: "2026-08-02T00:00:00.000Z",
      endsAt: "2026-08-03T00:00:00.000Z",
      baseAllocatedUsd: "5.000000000000",
      status: "OPEN" as const,
      planRevision: revision,
    });
    mocks.balance
      .mockResolvedValueOnce({
        ...balanceView("project-1", "user-1", "old", false),
        currentPeriod: period(oldRevision),
      })
      .mockResolvedValueOnce({
        ...balanceView("project-1", "user-1", "new", false),
        currentPeriod: period(newRevision),
      });
    mocks.policy
      .mockResolvedValueOnce({
        ...policyView("7"),
        plans: [{ ...activePlan(), revisions: [oldRevision] }],
      })
      .mockResolvedValueOnce({
        ...policyView("7"),
        plans: [
          {
            ...activePlan(),
            revisions: [],
            revisionsPageInfo: {
              hasMore: true,
              nextCursor: "new-revision-page",
            },
          },
        ],
      });
    const wrapper = mountDialog({
      canGrant: false,
      canManage: false,
      canReconcile: false,
    });
    await flushPromises();
    expect(wrapper.text()).toContain("VOICE");

    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Обновить правила"))!
      .trigger("click");
    await flushPromises();

    expect(wrapper.text()).not.toContain("VOICE");
    expect(wrapper.text()).not.toContain("Pinned revision unavailable");
    expect(mocks.revisions).not.toHaveBeenCalled();
  });

  it("zeroizes the loaded balance and closes when read permission is revoked", async () => {
    const wrapper = mountDialog({
      canGrant: true,
      canManage: true,
      canReconcile: true,
    });
    await flushPromises();
    expect(wrapper.text()).toContain("3,00 $");
    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Начислить квоту"))!
      .trigger("click");
    expect(wrapper.find("form").exists()).toBe(true);

    await wrapper.setProps({ canRead: false });

    expect(wrapper.text()).not.toContain("3,00 $");
    expect(wrapper.text()).not.toContain("external-1");
    expect(wrapper.find("form").exists()).toBe(false);
    expect(wrapper.emitted("update:visible")).toEqual([[false]]);
    expect(mocks.grant).not.toHaveBeenCalled();
    expect(mocks.assignment).not.toHaveBeenCalled();
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

  it("rejects a grants page whose account or policy version does not match the loaded user", async () => {
    mocks.balance.mockImplementation(
      (
        projectId: string,
        endUserId: string,
        query?: { grantCursor?: string },
      ) =>
        Promise.resolve(
          query?.grantCursor
            ? {
                ...balanceView("project-2", "user-2", "foreign grant", false),
                projectPolicyVersion: "5",
              }
            : balanceView(projectId, endUserId, "current grant", true),
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
    await flushPromises();

    expect(wrapper.text()).toContain("current grant");
    expect(wrapper.text()).not.toContain("foreign grant");
  });

  it("sends the current project policy version with an end-user assignment", async () => {
    mocks.balance.mockResolvedValue({
      ...balanceView("project-1", "user-1", "current grant", false),
      projectPolicyVersion: "9007199254740993",
    });
    mocks.policy.mockResolvedValue({
      projectPolicyVersion: "9007199254740993",
      policy: null,
      plans: [activePlan()],
      plansPageInfo: { hasMore: false, nextCursor: null },
      defaultAssignment: null,
      runtimeGates: {
        hardEnforcementApproved: false,
        emergencyDisabled: false,
      },
    });
    const wrapper = mountDialog({
      canGrant: false,
      canManage: true,
      canReconcile: false,
    });
    await flushPromises();

    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Назначить план"))!
      .trigger("click");
    const form = wrapper.get("form");
    await form.get("textarea").setValue("Assign current loyalty plan");
    await form.trigger("submit");
    await flushPromises();

    expect(mocks.assignment).toHaveBeenCalledWith(
      "project-1",
      "user-1",
      expect.objectContaining({
        expectedProjectPolicyVersion: "9007199254740993",
        planId: "11111111-1111-4111-8111-111111111111",
      }),
      expect.any(String),
    );
  });

  it("loads the next plan page from the end-user assignment selector", async () => {
    mocks.balance.mockResolvedValue({
      ...balanceView("project-1", "user-1", "current grant", false),
      projectPolicyVersion: "7",
    });
    mocks.policy
      .mockResolvedValueOnce({
        ...policyView("7"),
        plansPageInfo: { hasMore: true, nextCursor: "plans-page-2" },
      })
      .mockResolvedValueOnce({
        ...policyView("7"),
        plans: [activePlan("Enterprise")],
      });
    const wrapper = mountDialog({
      canGrant: false,
      canManage: true,
      canReconcile: false,
    });
    await flushPromises();

    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Назначить план"))!
      .trigger("click");
    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Показать остальные планы"))!
      .trigger("click");
    await flushPromises();

    expect(mocks.policy).toHaveBeenNthCalledWith(2, "project-1", {
      planCursor: "plans-page-2",
      planLimit: 50,
      revisionLimit: 1,
    });
    expect(wrapper.get("select").text()).toContain("Enterprise");
  });

  it("fails closed when a later plan page has a different policy version", async () => {
    mocks.policy
      .mockResolvedValueOnce({
        ...policyView("7"),
        plansPageInfo: { hasMore: true, nextCursor: "plans-page-2" },
      })
      .mockResolvedValueOnce({
        ...policyView("8"),
        plans: [activePlan("Enterprise")],
      });
    const wrapper = mountDialog({
      canGrant: false,
      canManage: true,
      canReconcile: false,
    });
    await flushPromises();
    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Назначить план"))!
      .trigger("click");
    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Показать остальные планы"))!
      .trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain(
      "Конфигурация планов изменилась во время загрузки",
    );
    expect(wrapper.get("select").text()).not.toContain("Enterprise");
    await wrapper.get("form").trigger("submit");
    expect(mocks.assignment).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain(
      "Сначала загрузите актуальную конфигурацию",
    );
  });

  it("does not expose assignment controls from mixed policy generations", async () => {
    mocks.balance
      .mockResolvedValueOnce({
        ...balanceView("project-1", "user-1", "current grant", false),
        projectPolicyVersion: "7",
      })
      .mockResolvedValue({
        ...balanceView("project-1", "user-1", "current grant", false),
        projectPolicyVersion: "8",
      });
    mocks.policy.mockResolvedValue(policyView("8"));
    const wrapper = mountDialog({
      canGrant: false,
      canManage: true,
      canReconcile: false,
    });
    await flushPromises();

    expect(wrapper.text()).toContain("разных версиях");
    expect(wrapper.text()).not.toContain("Назначить план");

    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Повторить"))!
      .trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Назначить план");
  });

  it("keeps an assignment form intact after an OCC conflict", async () => {
    mocks.balance
      .mockResolvedValueOnce({
        ...balanceView("project-1", "user-1", "current grant", false),
        projectPolicyVersion: "7",
      })
      .mockResolvedValue({
        ...balanceView("project-1", "user-1", "current grant", false),
        projectPolicyVersion: "8",
      });
    mocks.policy
      .mockResolvedValueOnce(policyView("7"))
      .mockResolvedValue(policyView("8"));
    mocks.assignment
      .mockRejectedValueOnce(
        new ApiError(
          409,
          "Conflict",
          undefined,
          undefined,
          "AI_ALLOWANCE_CONFIGURATION_VERSION_CONFLICT",
        ),
      )
      .mockResolvedValue({ projectPolicyVersion: "9", replayed: false });
    const wrapper = mountDialog({
      canGrant: false,
      canManage: true,
      canReconcile: false,
    });
    await flushPromises();
    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Назначить план"))!
      .trigger("click");
    const form = wrapper.get("form");
    await form.get("textarea").setValue("Keep this assignment draft");
    await form.trigger("submit");
    await flushPromises();

    expect(wrapper.find("form").exists()).toBe(true);
    expect(wrapper.get("textarea").element.value).toBe(
      "Keep this assignment draft",
    );
    expect(wrapper.text()).toContain("Конфигурация лимитов уже изменилась");

    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Загрузить актуальную версию"))!
      .trigger("click");
    await flushPromises();
    expect(wrapper.get("textarea").element.value).toBe(
      "Keep this assignment draft",
    );
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(mocks.assignment).toHaveBeenLastCalledWith(
      "project-1",
      "user-1",
      expect.objectContaining({ expectedProjectPolicyVersion: "8" }),
      expect.any(String),
    );
  });

  it("keeps the OCC conflict active when refreshing the draft fails", async () => {
    mocks.policy
      .mockResolvedValueOnce(policyView("7"))
      .mockRejectedValueOnce(new Error("Refresh unavailable"));
    mocks.assignment.mockRejectedValueOnce(
      new ApiError(
        409,
        "Conflict",
        undefined,
        undefined,
        "AI_ALLOWANCE_CONFIGURATION_VERSION_CONFLICT",
      ),
    );
    const wrapper = mountDialog({
      canGrant: false,
      canManage: true,
      canReconcile: false,
    });
    await flushPromises();
    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Назначить план"))!
      .trigger("click");
    await wrapper.get("textarea").setValue("Keep failed refresh draft");
    const originalIdempotencyKey = wrapper.findAll("input").at(-1)!.element
      .value;
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Загрузить актуальную версию"))!
      .trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Refresh unavailable");
    expect(wrapper.text()).toContain("Загрузить актуальную версию");
    expect(wrapper.get("textarea").element.value).toBe(
      "Keep failed refresh draft",
    );
    expect(wrapper.findAll("input").at(-1)!.element.value).toBe(
      originalIdempotencyKey,
    );

    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(mocks.assignment).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain(
      "Сначала загрузите актуальную конфигурацию",
    );
  });
});

function policyView(projectPolicyVersion: string) {
  return {
    projectPolicyVersion,
    policy: null,
    plans: [activePlan()],
    plansPageInfo: { hasMore: false, nextCursor: null },
    defaultAssignment: null,
    runtimeGates: {
      hardEnforcementApproved: false,
      emergencyDisabled: false,
    },
  } as const;
}

function activePlan(name = "VIP") {
  return {
    id:
      name === "VIP"
        ? "11111111-1111-4111-8111-111111111111"
        : "22222222-2222-4222-8222-222222222222",
    key: name.toUpperCase(),
    name,
    status: "ACTIVE",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    revisions: [],
    revisionsPageInfo: { hasMore: false, nextCursor: null },
  } as const;
}

function balanceView(
  projectId: string,
  endUserId: string,
  grantReason: string,
  hasMore: boolean,
) {
  return {
    projectPolicyVersion: "7",
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

function mountDialog(
  permission: {
    canGrant: boolean;
    canManage: boolean;
    canReconcile: boolean;
  },
  initialMode: "summary" | "grant" | "assignment" = "summary",
) {
  return mount(AiAllowanceUserDialog, {
    props: {
      visible: true,
      projectId: "project-1",
      endUserId: "user-1",
      identity: "external-1",
      initialMode,
      canRead: true,
      ...permission,
    },
    global: {
      stubs: {
        Dialog: {
          props: ["visible", "header"],
          template:
            "<div v-if='visible'>{{ header }}<slot /><slot name='footer' /></div>",
        },
      },
    },
  });
}
