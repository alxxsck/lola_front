import { beforeEach, describe, expect, it, vi } from "vitest";
import { axiosInstance } from "@/shared/api/http/axios-instance";

vi.mock("@/shared/api/http/axios-instance", () => ({
  axiosInstance: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));

import { aiAllowanceRepository } from "./ai-allowance-repository";

const policyResponse = {
  projectPolicyVersion: "2",
  localization: {
    defaultLocale: "en",
    supportedLocales: ["en", "es", "pt-BR"],
  },
  policy: {
    projectId: "project-1",
    enforcementMode: "SOFT",
    timezone: "Europe/Madrid",
    warningContent: {},
    lowThresholdMode: "PERCENT",
    lowThresholdValue: "10.000000000000",
    exhaustedContent: {},
    showEndUserExactUsd: false,
    version: "2",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z",
  },
  plans: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      projectId: "project-1",
      key: "project-default",
      name: "Project default",
      status: "ACTIVE",
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-02T00:00:00.000Z",
      revisions: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          projectId: "project-1",
          planId: "11111111-1111-4111-8111-111111111111",
          revisionNumber: 2,
          periodKind: "DAY",
          recurringAmountUsd: "5.000000000001",
          dailyCapUsd: null,
          effectiveFrom: "2026-08-02T00:00:00.000Z",
          changeReason: "New daily budget",
          createdAt: "2026-08-02T00:00:00.000Z",
          categoryRules: [],
        },
      ],
      revisionsPageInfo: { hasMore: false, nextCursor: null },
    },
  ],
  plansPageInfo: { hasMore: false, nextCursor: null },
  defaultAssignment: null,
  runtimeGates: { hardEnforcementApproved: true, emergencyDisabled: false },
};

describe("aiAllowanceRepository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("validates the project policy graph and preserves exact money", async () => {
    vi.mocked(axiosInstance.get).mockResolvedValue({ data: policyResponse });

    const result = await aiAllowanceRepository.projectPolicy("project-1");

    expect(result.plans[0]?.revisions[0]?.recurringAmountUsd).toBe(
      "5.000000000001",
    );
    expect(result.policy?.showEndUserExactUsd).toBe(false);
    expect(result.policy?.lowThresholdMode).toBe("PERCENT");
    expect(result.policy?.lowThresholdValue).toBe("10.000000000000");
    expect(axiosInstance.get).toHaveBeenCalledWith(
      "/api/v1/admin/projects/project-1/ai-allowance",
    );
  });

  it("accepts and preserves arbitrary Project Locale allowance copy", async () => {
    vi.mocked(axiosInstance.get).mockResolvedValue({
      data: {
        ...policyResponse,
        policy: {
          ...policyResponse.policy,
          warningContent: {
            message: "Fallback",
            variants: { es: "Presupuesto bajo", "pt-BR": "Orçamento baixo" },
          },
          exhaustedContent: {
            en: "Allowance exhausted",
            es: "Presupuesto agotado",
          },
        },
      },
    });

    const result = await aiAllowanceRepository.projectPolicy("project-1");

    expect(result.localization).toEqual(policyResponse.localization);
    expect(result.policy?.warningContent.variants).toEqual({
      es: "Presupuesto bajo",
      "pt-BR": "Orçamento baixo",
    });
    expect(result.policy?.exhaustedContent.variants).toEqual({
      en: "Allowance exhausted",
      es: "Presupuesto agotado",
    });
  });

  it.each([
    ["PERCENT", "0.000000000000"],
    ["PERCENT", "100.000000000001"],
    ["ABSOLUTE_USD", "0"],
  ] as const)(
    "fails closed for invalid LOW threshold %s %s",
    async (lowThresholdMode, lowThresholdValue) => {
      vi.mocked(axiosInstance.get).mockResolvedValue({
        data: {
          ...policyResponse,
          policy: {
            ...policyResponse.policy,
            lowThresholdMode,
            lowThresholdValue,
          },
        },
      });

      await expect(
        aiAllowanceRepository.projectPolicy("project-1"),
      ).rejects.toThrow("некорректные данные");
    },
  );

  it("loads exact balance and cursor journal entries with signed deltas", async () => {
    vi.mocked(axiosInstance.get)
      .mockResolvedValueOnce({
        data: {
          projectPolicyVersion: "2",
          account: {
            projectId: "project-1",
            endUserId: "user-1",
            currency: "USD",
            availableUsd: "3.900000000001",
            reservedUsd: "0.100000000001",
            settledUsd: "1.000000000000",
            unknownHeldUsd: "0.000000000000",
            overageUsd: "0.000000000000",
            version: "4",
          },
          currentPeriod: null,
          currentPeriodSpend: null,
          pendingBaseAllocationUsd: "5.000000000000",
          activeGrants: [],
          grantsPageInfo: { hasMore: false, nextCursor: null },
          endUserAssignment: null,
        },
      })
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              id: "33333333-3333-4333-8333-333333333333",
              projectId: "project-1",
              endUserId: "user-1",
              currency: "USD",
              periodId: null,
              reservationId: null,
              grantId: null,
              usageRecordId: null,
              entryType: "SETTLED",
              costQuality: "EXACT_PROVIDER_COST",
              deltaAvailableUsd: "-0.100000000001",
              deltaReservedUsd: "0.000000000000",
              deltaSettledUsd: "0.100000000001",
              deltaUnknownUsd: "0.000000000000",
              deltaOverageUsd: "0.000000000000",
              actorType: "SYSTEM",
              actorId: "usage",
              reason: "Provider settlement",
              idempotencyKeyHash: "a".repeat(64),
              payloadHash: "b".repeat(64),
              correctsEntryId: null,
              occurredAt: "2026-08-02T10:00:00.000Z",
              createdAt: "2026-08-02T10:00:00.000Z",
            },
          ],
          pageInfo: {
            hasMore: true,
            nextCursor: "33333333-3333-4333-8333-333333333333",
          },
        },
      });

    const balance = await aiAllowanceRepository.endUserBalance(
      "project-1",
      "user-1",
    );
    const journal = await aiAllowanceRepository.journal("project-1", "user-1", {
      limit: 50,
    });

    expect(balance.account.availableUsd).toBe("3.900000000001");
    expect(journal.items[0]?.deltaAvailableUsd).toBe("-0.100000000001");
    expect(journal.pageInfo.nextCursor).toBe(journal.items[0]?.id);
  });

  it("accepts assignment plan summaries and the pinned period revision with category rules", async () => {
    const planSummary = {
      id: "11111111-1111-4111-8111-111111111111",
      projectId: "project-1",
      key: "vip",
      name: "VIP",
      status: "ACTIVE",
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-02T00:00:00.000Z",
    };
    const assignment = {
      id: "66666666-6666-4666-8666-666666666666",
      projectId: "project-1",
      scope: "END_USER",
      segmentOrLevelId: null,
      endUserId: "user-1",
      planId: planSummary.id,
      priority: null,
      effectiveFrom: "2026-08-01T00:00:00.000Z",
      effectiveUntil: null,
      version: "1",
      reason: "VIP assignment",
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      plan: planSummary,
    };
    const revisionSummary = { ...policyResponse.plans[0]!.revisions[0] };
    vi.mocked(axiosInstance.get).mockResolvedValue({
      data: {
        projectPolicyVersion: "2",
        account: {
          projectId: "project-1",
          endUserId: "user-1",
          currency: "USD",
          availableUsd: "5.000000000000",
          reservedUsd: "0.000000000000",
          settledUsd: "0.000000000000",
          unknownHeldUsd: "0.000000000000",
          overageUsd: "0.000000000000",
          version: "1",
        },
        currentPeriod: {
          id: "77777777-7777-4777-8777-777777777777",
          kind: "DAY",
          timezone: "UTC",
          startsAt: "2026-08-02T00:00:00.000Z",
          endsAt: "2026-08-03T00:00:00.000Z",
          baseAllocatedUsd: "5.000000000000",
          status: "OPEN",
          planRevision: revisionSummary,
        },
        currentPeriodSpend: {
          reservedUsd: "0.000000000000",
          settledUsd: "0.000000000000",
          unknownHeldUsd: "0.000000000000",
          overageUsd: "0.000000000000",
        },
        pendingBaseAllocationUsd: "0.000000000000",
        activeGrants: [],
        grantsPageInfo: { hasMore: false, nextCursor: null },
        endUserAssignment: assignment,
      },
    });

    const result = await aiAllowanceRepository.endUserBalance(
      "project-1",
      "user-1",
    );

    expect(result.endUserAssignment?.plan?.name).toBe("VIP");
    const pinnedRevision = result.currentPeriod?.planRevision;
    expect(pinnedRevision).not.toBeNull();
    if (!pinnedRevision) throw new Error("Expected a pinned plan revision");
    expect(pinnedRevision.recurringAmountUsd).toBe("5.000000000001");
    expect(pinnedRevision.categoryRules).toEqual([]);
  });

  it("accepts a non-hard observation period without an assignment revision", async () => {
    vi.mocked(axiosInstance.get).mockResolvedValue({
      data: {
        projectPolicyVersion: "2",
        account: {
          projectId: "project-1",
          endUserId: "user-1",
          currency: "USD",
          availableUsd: "0.000000000000",
          reservedUsd: "0.000000000000",
          settledUsd: "0.100000000000",
          unknownHeldUsd: "0.000000000000",
          overageUsd: "0.100000000000",
          version: "1",
        },
        currentPeriod: {
          id: "77777777-7777-4777-8777-777777777777",
          kind: "DAY",
          timezone: "UTC",
          startsAt: "2026-08-02T00:00:00.000Z",
          endsAt: "2026-08-03T00:00:00.000Z",
          baseAllocatedUsd: "0.000000000000",
          status: "OPEN",
          planRevision: null,
        },
        currentPeriodSpend: {
          reservedUsd: "0.000000000000",
          settledUsd: "0.100000000000",
          unknownHeldUsd: "0.000000000000",
          overageUsd: "0.100000000000",
        },
        pendingBaseAllocationUsd: "0.000000000000",
        activeGrants: [],
        grantsPageInfo: { hasMore: false, nextCursor: null },
        endUserAssignment: null,
      },
    });

    const result = await aiAllowanceRepository.endUserBalance(
      "project-1",
      "user-1",
    );

    expect(result.currentPeriod?.planRevision).toBeNull();
    expect(result.currentPeriodSpend?.overageUsd).toBe("0.100000000000");
  });

  it("sends exact mutation payloads with a stable Idempotency-Key", async () => {
    vi.mocked(axiosInstance.post).mockResolvedValue({
      data: { replayed: false },
    });
    const payload = {
      amountUsd: "2.500000000001" as const,
      validFrom: "2026-08-02T10:00:00.000Z",
      expiresAt: "2026-08-03T10:00:00.000Z",
      reason: "Manual loyalty reward",
    };

    await aiAllowanceRepository.createGrant(
      "project-1",
      "user-1",
      payload,
      "grant-key-1",
    );

    expect(axiosInstance.post).toHaveBeenCalledWith(
      "/api/v1/admin/projects/project-1/end-users/user-1/ai-allowance/grants",
      payload,
      { headers: { "Idempotency-Key": "grant-key-1" } },
    );
  });

  it("uses the published PUT paths for default-plan revisions and user assignments", async () => {
    vi.mocked(axiosInstance.put).mockResolvedValue({
      data: { projectPolicyVersion: "3", replayed: false },
    });
    const defaultPlan = {
      expectedProjectPolicyVersion: "2",
      amountUsd: "5.000000000001" as const,
      period: "DAY" as const,
      timezone: "Europe/Madrid",
      enforcementMode: "SOFT" as const,
      lowThresholdMode: "PERCENT" as const,
      lowThresholdValue: "10.000000000000" as const,
      showEndUserExactUsd: false,
      categoryRules: [],
      reason: "Daily project allowance",
    };
    const assignment = {
      expectedProjectPolicyVersion: "3",
      planId: "11111111-1111-4111-8111-111111111111",
      effectiveFrom: "2026-08-02T10:00:00.000Z",
      reason: "VIP assignment",
    };

    await aiAllowanceRepository.putDefaultPlan(
      "project-1",
      defaultPlan,
      "default-key",
    );
    await aiAllowanceRepository.putEndUserAssignment(
      "project-1",
      "user-1",
      assignment,
      "assignment-key",
    );

    expect(axiosInstance.put).toHaveBeenNthCalledWith(
      1,
      "/api/v1/admin/projects/project-1/ai-allowance/default-plan",
      defaultPlan,
      { headers: { "Idempotency-Key": "default-key" } },
    );
    expect(axiosInstance.put).toHaveBeenNthCalledWith(
      2,
      "/api/v1/admin/projects/project-1/end-users/user-1/ai-allowance/assignment",
      assignment,
      { headers: { "Idempotency-Key": "assignment-key" } },
    );
  });

  it("uses audited endpoints for named plan revisions and ranked cohort assignments", async () => {
    vi.mocked(axiosInstance.put).mockResolvedValue({
      data: { projectPolicyVersion: "3", replayed: false },
    });
    const plan = {
      expectedProjectPolicyVersion: "2",
      name: "VIP",
      amountUsd: "20.000000000000" as const,
      period: "MONTH" as const,
      dailyCapUsd: "2.000000000000" as const,
      categoryRules: [
        {
          category: "CHAT" as const,
          responsibility: "END_USER_ALLOWANCE" as const,
        },
      ],
      reason: "Create VIP plan",
    };
    const assignment = {
      expectedProjectPolicyVersion: "3",
      planId: "11111111-1111-4111-8111-111111111111",
      priority: 500,
      effectiveFrom: "2026-08-02T10:00:00.000Z",
      reason: "VIP segment",
    };
    await aiAllowanceRepository.putPlan("project-1", "VIP", plan, "plan-key");
    await aiAllowanceRepository.putCohortAssignment(
      "project-1",
      "SEGMENT",
      "vip",
      assignment,
      "cohort-key",
    );
    expect(axiosInstance.put).toHaveBeenNthCalledWith(
      1,
      "/api/v1/admin/projects/project-1/ai-allowance/plans/VIP",
      plan,
      { headers: { "Idempotency-Key": "plan-key" } },
    );
    expect(axiosInstance.put).toHaveBeenNthCalledWith(
      2,
      "/api/v1/admin/projects/project-1/ai-allowance/assignments/SEGMENT/vip",
      assignment,
      { headers: { "Idempotency-Key": "cohort-key" } },
    );
  });

  it("reconciles a reservation through the project-scoped audited endpoint", async () => {
    vi.mocked(axiosInstance.post).mockResolvedValue({
      data: { replayed: false },
    });
    const input = {
      reservationId: "44444444-4444-4444-8444-444444444444",
      resolution: "HOLD_UNKNOWN" as const,
      reason: "Provider outcome is still unknown",
    };

    await aiAllowanceRepository.reconcile("project-1", input, "reconcile-key");

    expect(axiosInstance.post).toHaveBeenCalledWith(
      "/api/v1/admin/projects/project-1/ai-allowance/reconcile",
      input,
      { headers: { "Idempotency-Key": "reconcile-key" } },
    );
  });

  it("loads the bounded reconciliation queue and sends attempt and correction commands exactly", async () => {
    vi.mocked(axiosInstance.get).mockResolvedValue({
      data: {
        items: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            endUserId: "22222222-2222-4222-8222-222222222222",
            aiOperationId: "33333333-3333-4333-8333-333333333333",
            modelAttemptId: "44444444-4444-4444-8444-444444444444",
            usageGroupId: "group-1",
            category: "CHAT",
            status: "UNKNOWN_HELD",
            quotedUpperBoundUsd: "1.000000000001",
            reservedUsd: "0.000000000000",
            settledUsd: "0.000000000000",
            unknownHeldUsd: "1.000000000001",
            overageUsd: "0.000000000000",
            costQuality: "UNKNOWN",
            usageRecordId: null,
            outcomeReason: "Provider outcome is unknown",
            reservedAt: "2026-08-01T10:00:00.000Z",
            terminalAt: "2026-08-01T10:01:00.000Z",
          },
        ],
        pageInfo: {
          hasMore: true,
          nextCursor: "11111111-1111-4111-8111-111111111111",
        },
      },
    });
    vi.mocked(axiosInstance.post).mockResolvedValue({
      data: { replayed: false },
    });

    const page = await aiAllowanceRepository.reconciliationQueue("project-1", {
      limit: 50,
      cursor: "cursor-1",
      status: "UNKNOWN_HELD",
    });
    await aiAllowanceRepository.resolveAttempt(
      "project-1",
      page.items[0]!.modelAttemptId,
      {
        resolution: "HOLD_UNKNOWN",
        reason: "Provider outcome remains unknown",
      },
      "resolve-key",
    );
    await aiAllowanceRepository.correct(
      "project-1",
      page.items[0]!.endUserId,
      {
        correctsEntryId: "55555555-5555-4555-8555-555555555555",
        deltaAvailableUsd: "1.000000000001" as never,
        expectedAccountVersion: "7",
        expiresAt: "2099-08-02T10:00:00.000Z",
        reason: "Correct an audited allowance entry",
      },
      "correction-key",
    );

    expect(axiosInstance.get).toHaveBeenCalledWith(
      "/api/v1/admin/projects/project-1/ai-allowance/reconciliation",
      {
        params: {
          limit: 50,
          cursor: "cursor-1",
          status: "UNKNOWN_HELD",
        },
      },
    );
    expect(axiosInstance.post).toHaveBeenNthCalledWith(
      1,
      "/api/v1/admin/projects/project-1/ai-allowance/attempts/44444444-4444-4444-8444-444444444444/resolve",
      {
        resolution: "HOLD_UNKNOWN",
        reason: "Provider outcome remains unknown",
      },
      { headers: { "Idempotency-Key": "resolve-key" } },
    );
    expect(axiosInstance.post).toHaveBeenNthCalledWith(
      2,
      "/api/v1/admin/projects/project-1/end-users/22222222-2222-4222-8222-222222222222/ai-allowance/corrections",
      expect.objectContaining({
        deltaAvailableUsd: "1.000000000001",
        expectedAccountVersion: "7",
      }),
      { headers: { "Idempotency-Key": "correction-key" } },
    );
  });

  it("rejects numeric money and malformed signed journal deltas", async () => {
    vi.mocked(axiosInstance.get).mockResolvedValueOnce({
      data: {
        ...policyResponse,
        plans: [
          {
            ...policyResponse.plans[0],
            revisions: [
              {
                ...policyResponse.plans[0]!.revisions[0],
                recurringAmountUsd: 5,
              },
            ],
          },
        ],
      },
    });
    await expect(
      aiAllowanceRepository.projectPolicy("project-1"),
    ).rejects.toThrow("некорректные данные");

    vi.mocked(axiosInstance.get).mockResolvedValueOnce({
      data: {
        items: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            deltaAvailableUsd: "--1",
          },
        ],
        pageInfo: { hasMore: false, nextCursor: null },
      },
    });
    await expect(
      aiAllowanceRepository.journal("project-1", "user-1", { limit: 50 }),
    ).rejects.toThrow("некорректные данные");
  });

  it("rejects a policy response without the published runtime gates", async () => {
    const legacy: Record<string, unknown> = { ...policyResponse };
    delete legacy.runtimeGates;
    vi.mocked(axiosInstance.get).mockResolvedValue({ data: legacy });
    await expect(
      aiAllowanceRepository.projectPolicy("project-1"),
    ).rejects.toThrow("некорректные данные");
  });

  it.each([undefined, -1, "01", "1.0", "184467440737095516160"])(
    "fails closed for a malformed project policy version: %s",
    async (projectPolicyVersion) => {
      vi.mocked(axiosInstance.get).mockResolvedValue({
        data: { ...policyResponse, projectPolicyVersion },
      });

      await expect(
        aiAllowanceRepository.projectPolicy("project-1"),
      ).rejects.toThrow("некорректные данные");
    },
  );

  it("fails closed when a configuration mutation omits its next version", async () => {
    vi.mocked(axiosInstance.put).mockResolvedValue({
      data: { replayed: false },
    });

    await expect(
      aiAllowanceRepository.putDefaultPlan(
        "project-1",
        {
          expectedProjectPolicyVersion: "2",
          amountUsd: "5.000000000001",
          period: "DAY",
          timezone: "UTC",
          enforcementMode: "SOFT",
          lowThresholdMode: "PERCENT",
          lowThresholdValue: "10.000000000000",
          showEndUserExactUsd: false,
          categoryRules: [],
          reason: "Update daily allowance",
        },
        "default-key",
      ),
    ).rejects.toThrow("некорректные данные");
  });

  it("recovers a legacy replay version through a mandatory fresh policy read", async () => {
    vi.mocked(axiosInstance.put).mockResolvedValue({
      data: { replayed: true },
    });
    vi.mocked(axiosInstance.get).mockResolvedValue({
      data: { ...policyResponse, projectPolicyVersion: "9" },
    });

    const result = await aiAllowanceRepository.putDefaultPlan(
      "project-1",
      {
        expectedProjectPolicyVersion: "8",
        amountUsd: "5.000000000001",
        period: "DAY",
        timezone: "UTC",
        enforcementMode: "SOFT",
        lowThresholdMode: "PERCENT",
        lowThresholdValue: "10.000000000000",
        showEndUserExactUsd: false,
        categoryRules: [],
        reason: "Replay daily allowance update",
      },
      "legacy-replay-key",
    );

    expect(result).toEqual({ projectPolicyVersion: "9", replayed: true });
    expect(axiosInstance.get).toHaveBeenCalledWith(
      "/api/v1/admin/projects/project-1/ai-allowance",
    );
  });

  it("fails closed for an explicitly replayed mutation with a malformed version", async () => {
    vi.mocked(axiosInstance.put).mockResolvedValue({
      data: { projectPolicyVersion: "01", replayed: true },
    });

    await expect(
      aiAllowanceRepository.putDefaultPlan(
        "project-1",
        {
          expectedProjectPolicyVersion: "0",
          amountUsd: "5.000000000001",
          period: "DAY",
          timezone: "UTC",
          enforcementMode: "SOFT",
          lowThresholdMode: "PERCENT",
          lowThresholdValue: "10.000000000000",
          showEndUserExactUsd: false,
          categoryRules: [],
          reason: "Reject malformed replay version",
        },
        "malformed-replay-key",
      ),
    ).rejects.toThrow("некорректные данные");
    expect(axiosInstance.get).not.toHaveBeenCalled();
  });

  it("consumes plan and grant pagination cursors through published endpoints", async () => {
    vi.mocked(axiosInstance.get)
      .mockResolvedValueOnce({
        data: {
          projectPolicyVersion: "2",
          plan: policyResponse.plans[0],
          revisions: policyResponse.plans[0]!.revisions,
          pageInfo: { hasMore: false, nextCursor: null },
        },
      })
      .mockResolvedValueOnce({
        data: {
          projectPolicyVersion: "2",
          account: {
            projectId: "project-1",
            endUserId: "user-1",
            currency: "USD",
            availableUsd: "0",
            reservedUsd: "0",
            settledUsd: "0",
            unknownHeldUsd: "0",
            overageUsd: "0",
            version: "1",
          },
          currentPeriod: null,
          currentPeriodSpend: null,
          pendingBaseAllocationUsd: "0",
          activeGrants: [],
          grantsPageInfo: { hasMore: false, nextCursor: null },
          endUserAssignment: null,
        },
      });

    await aiAllowanceRepository.planRevisions("project-1", "project-default", {
      limit: 20,
      cursor: "revision-cursor",
    });
    await aiAllowanceRepository.endUserBalance("project-1", "user-1", {
      grantLimit: 50,
      grantCursor: "grant-cursor",
    });

    expect(axiosInstance.get).toHaveBeenNthCalledWith(
      1,
      "/api/v1/admin/projects/project-1/ai-allowance/plans/project-default/revisions",
      { params: { limit: 20, cursor: "revision-cursor" } },
    );
    expect(axiosInstance.get).toHaveBeenNthCalledWith(
      2,
      "/api/v1/admin/projects/project-1/end-users/user-1/ai-allowance",
      { params: { grantLimit: 50, grantCursor: "grant-cursor" } },
    );
  });
});
