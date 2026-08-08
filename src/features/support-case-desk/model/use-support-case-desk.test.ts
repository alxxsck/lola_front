import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/http/api-error";
import type { EndUserCaseDetailBundle } from "@/features/end-user-cases/api/end-user-cases-repository";
import {
  mockEndUserCasesRepository,
  resetMockEndUserCases,
} from "@/features/end-user-cases/api/mock-end-user-cases-repository";
import {
  createSupportCaseDeskController,
  type SupportCaseDeskSource,
} from "./use-support-case-desk";

const makeBundle = (version = 4): EndUserCaseDetailBundle =>
  ({
    case: {
      id: "case-1",
      version,
      projectSequence: "42",
      title: "Не поступил депозит",
      goal: "Вернуть деньги",
      summary: "Провайдер проверяет перевод",
      status: "IN_PROGRESS",
      availableStatuses: ["WAITING_END_USER", "RESOLVED"],
      allowedActions: [
        "SET_STATUS_WAITING_END_USER",
        "SET_STATUS_RESOLVED",
        "CHANGE_CLASSIFICATION",
        "RAISE_PRIORITY",
        "LOWER_PRIORITY_TO_FLOOR",
        "REQUEST_ESCALATION",
      ],
      classification: {
        source: "AI",
        confidence: 0.91,
        evidence: [{ id: "message-1", kind: "MESSAGE" }],
      },
      groupCode: "PAYMENTS",
      type: "PROBLEM_RESOLUTION",
      impact: "HIGH",
      urgency: "HIGH",
      priority: "HIGH",
      priorityPolicy: {
        effectiveFloor: "NORMAL",
        overrideActive: false,
        policyRevisionId: "policy-7",
        policyVersion: 7,
        reasons: ["Финансовая операция"],
        source: "PLATFORM_RULE",
      },
      priorityReasons: ["Средства не зачислены"],
      prioritySource: "PLATFORM_RULE",
      requiresSpecialist: false,
      resolution: {
        assessment: "LIKELY_UNRESOLVED",
        source: "AI_INFERENCE",
        confidence: "0.8",
      },
      initialTone: "CONCERNED",
      currentTone: "CALM",
      toneTrend: "IMPROVING",
      primaryLanguage: "ru",
      languages: ["ru"],
      channels: ["TEXT"],
      endUser: { id: "user-1", externalId: "player-1" },
      messageCount: 2,
      endUserRecontactCount: 0,
      firstObservedAt: "2026-08-08T08:00:00.000Z",
      lastActivityAt: "2026-08-08T09:00:00.000Z",
      createdAt: "2026-08-08T08:00:00.000Z",
      updatedAt: "2026-08-08T09:00:00.000Z",
    },
    messages: { items: [], nextCursor: null },
    timeline: {
      events: [
        {
          id: "event-1",
          type: "CORRECTED",
          caseVersion: version,
          projectSequence: "42",
          actor: { type: "CMS_USER", cmsUserId: "cms-1" },
          reason: "Уточнено после проверки",
          previous: { groupCode: "GENERAL" },
          next: { groupCode: "PAYMENTS" },
          createdAt: "2026-08-08T09:00:00.000Z",
        },
      ],
      revisions: [],
    },
    escalations: { items: [] },
  }) as EndUserCaseDetailBundle;

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const bundleFor = (caseId: string, version = 4): EndUserCaseDetailBundle => {
  const value = makeBundle(version);
  value.case.id = caseId;
  return value;
};

function source(bundle = makeBundle()) {
  return {
    detail: vi.fn().mockResolvedValue(bundle),
    workflow: vi.fn().mockResolvedValue({
      id: "case-1",
      version: bundle.case.version,
      status: bundle.case.status,
    }),
    classify: vi.fn().mockResolvedValue({
      id: "case-1",
      version: bundle.case.version,
      status: bundle.case.status,
    }),
    requestEscalation: vi.fn().mockResolvedValue({
      caseVersion: bundle.case.version,
      escalation: { caseId: "case-1" },
    }),
  } satisfies SupportCaseDeskSource;
}

describe("support case desk controller", () => {
  it("loads the exact Case projection and its causal activity", async () => {
    const api = source();
    const controller = createSupportCaseDeskController(api, {
      projectId: () => "project-1",
      caseId: () => "case-1",
      canRead: () => true,
    });

    await controller.load();

    expect(api.detail).toHaveBeenCalledWith("project-1", "case-1");
    expect(controller.detail.value?.case.allowedActions).toContain(
      "CHANGE_CLASSIFICATION",
    );
    expect(controller.detail.value?.timeline.events[0]?.reason).toBe(
      "Уточнено после проверки",
    );
  });

  it("sends an allowed workflow transition with the exact version and reloads", async () => {
    const api = source();
    const changed = vi.fn().mockResolvedValue(undefined);
    const controller = createSupportCaseDeskController(api, {
      projectId: () => "project-1",
      caseId: () => "case-1",
      canRead: () => true,
      onProjectionChanged: changed,
    });
    await controller.load();

    await controller.transition("WAITING_END_USER", "Ждём выписку клиента");

    expect(api.workflow).toHaveBeenCalledWith(
      "project-1",
      "case-1",
      expect.objectContaining({
        expectedVersion: 4,
        status: "WAITING_END_USER",
        reason: "Ждём выписку клиента",
        idempotencyKey: expect.any(String),
      }),
    );
    expect(api.detail).toHaveBeenCalledTimes(2);
    expect(changed).toHaveBeenCalledOnce();
  });

  it("fails closed for transitions not present in allowedActions", async () => {
    const api = source();
    const controller = createSupportCaseDeskController(api, {
      projectId: () => "project-1",
      caseId: () => "case-1",
      canRead: () => true,
    });
    await controller.load();

    await expect(
      controller.transition("CANCELLED", "Проверено оператором"),
    ).rejects.toThrow("недоступно");
    expect(api.workflow).not.toHaveBeenCalled();
  });

  it("uses classification authority and enforces the server priority floor", async () => {
    const api = source();
    const controller = createSupportCaseDeskController(api, {
      projectId: () => "project-1",
      caseId: () => "case-1",
      canRead: () => true,
    });
    await controller.load();

    await expect(
      controller.classify({ priority: "LOW", reason: "Ручная проверка" }),
    ).rejects.toThrow("ниже серверного порога");
    await controller.classify({
      groupCode: "PAYMENTS_CARDS",
      priority: "URGENT",
      reason: "Подтверждена блокировка карты",
    });

    expect(api.classify).toHaveBeenCalledWith(
      "project-1",
      "case-1",
      expect.objectContaining({
        expectedVersion: 4,
        groupCode: "PAYMENTS_CARDS",
        priority: "URGENT",
        reason: "Подтверждена блокировка карты",
      }),
    );
  });

  it("surfaces a typed 409, refreshes authority and keeps the operator draft external", async () => {
    const api = source();
    api.workflow.mockRejectedValueOnce(
      new ApiError(
        409,
        "Case changed",
        {
          currentVersion: 5,
          currentCase: {
            id: "case-1",
            version: 5,
            status: "IN_PROGRESS",
            assignedCmsUserId: null,
          },
        },
        "request-1",
        "CASE_VERSION_CONFLICT",
      ),
    );
    const controller = createSupportCaseDeskController(api, {
      projectId: () => "project-1",
      caseId: () => "case-1",
      canRead: () => true,
    });
    await controller.load();

    await expect(
      controller.transition("RESOLVED", "Пользователь подтвердил"),
    ).rejects.toThrow("Case changed");

    expect(controller.conflict.value?.currentVersion).toBe(5);
    expect(api.detail).toHaveBeenCalledTimes(2);
  });

  it("never combines an exact Case from the previous project with a new route scope", async () => {
    let projectId = "project-1";
    let caseId = "case-1";
    const api = source();
    const controller = createSupportCaseDeskController(api, {
      projectId: () => projectId,
      caseId: () => caseId,
      canRead: () => true,
    });
    await controller.load();

    projectId = "project-2";
    caseId = "case-2";

    await expect(
      controller.transition("RESOLVED", "Новый маршрут"),
    ).rejects.toThrow("Актуальное состояние");
    expect(api.workflow).not.toHaveBeenCalled();
  });

  it("fences a stale mutation after reset and does not overwrite the new scope", async () => {
    let projectId = "project-1";
    let caseId = "case-1";
    const command = deferred<unknown>();
    const api = source(bundleFor("case-1"));
    api.workflow.mockImplementationOnce(() => command.promise);
    api.detail
      .mockResolvedValueOnce(bundleFor("case-1"))
      .mockResolvedValueOnce(bundleFor("case-2", 9))
      .mockResolvedValueOnce(bundleFor("case-1", 5));
    const changed = vi.fn();
    const controller = createSupportCaseDeskController(api, {
      projectId: () => projectId,
      caseId: () => caseId,
      canRead: () => true,
      onProjectionChanged: changed,
    });
    await controller.load();
    const stale = controller.transition("RESOLVED", "Старый маршрут");

    projectId = "project-2";
    caseId = "case-2";
    controller.reset();
    await controller.load();
    command.resolve({
      id: "case-1",
      version: 5,
      status: "RESOLVED",
    });
    await stale;

    expect(controller.exactCase.value?.id).toBe("case-2");
    expect(controller.exactCase.value?.version).toBe(9);
    expect(controller.error.value).toBeNull();
    expect(controller.mutating.value).toBe(false);
    expect(changed).not.toHaveBeenCalled();
  });

  it("keeps an accepted intent fail-closed until exact reconciliation succeeds", async () => {
    const api = source();
    api.detail
      .mockResolvedValueOnce(makeBundle(4))
      .mockRejectedValueOnce(new Error("refresh unavailable"))
      .mockResolvedValueOnce(makeBundle(5));
    const controller = createSupportCaseDeskController(api, {
      projectId: () => "project-1",
      caseId: () => "case-1",
      canRead: () => true,
    });
    await controller.load();

    await expect(
      controller.transition("RESOLVED", "Пользователь подтвердил"),
    ).rejects.toThrow("refresh unavailable");

    expect(controller.reconciling.value).toBe(true);
    expect(controller.exactCase.value?.allowedActions).toEqual([]);
    expect(api.workflow).toHaveBeenCalledOnce();

    await controller.retryReconcile();

    expect(controller.reconciling.value).toBe(false);
    expect(controller.exactCase.value?.version).toBe(5);
    expect(api.workflow).toHaveBeenCalledOnce();
  });

  it("does not accept a lagging exact GET below the successful receipt version", async () => {
    const api = source();
    api.workflow.mockResolvedValueOnce({
      id: "case-1",
      version: 5,
      status: "RESOLVED",
    });
    api.detail
      .mockResolvedValueOnce(makeBundle(4))
      .mockResolvedValueOnce(makeBundle(4))
      .mockResolvedValueOnce(makeBundle(5));
    const controller = createSupportCaseDeskController(api, {
      projectId: () => "project-1",
      caseId: () => "case-1",
      canRead: () => true,
    });
    await controller.load();

    await expect(
      controller.transition("RESOLVED", "Пользователь подтвердил"),
    ).rejects.toThrow("версия кейса ещё не доступна");
    expect(controller.reconciling.value).toBe(true);
    expect(controller.exactCase.value?.allowedActions).toEqual([]);

    await controller.load();
    expect(controller.exactCase.value?.version).toBe(5);
    expect(controller.reconciling.value).toBe(false);
  });

  it("treats a transport failure as an unknown outcome and blocks other commands", async () => {
    const api = source();
    api.workflow.mockRejectedValueOnce(new ApiError(0, "Connection lost"));
    const controller = createSupportCaseDeskController(api, {
      projectId: () => "project-1",
      caseId: () => "case-1",
      canRead: () => true,
    });
    await controller.load();

    await expect(
      controller.transition("RESOLVED", "Пользователь подтвердил"),
    ).rejects.toThrow("Connection lost");
    expect(controller.reconciliationReason.value).toBe("UNKNOWN");
    expect(controller.exactCase.value?.allowedActions).toEqual([]);
    await expect(
      controller.classify({ priority: "URGENT", reason: "Другая команда" }),
    ).rejects.toThrow("Актуальное состояние");

    await controller.retryReconcile();
    expect(controller.reconciling.value).toBe(false);
    expect(api.workflow).toHaveBeenCalledTimes(2);
    expect(api.workflow.mock.calls[1]?.[2].idempotencyKey).toBe(
      api.workflow.mock.calls[0]?.[2].idempotencyKey,
    );
  });

  it("turns a typed 409 from same-key replay into conflict reconciliation", async () => {
    const api = source();
    api.workflow
      .mockRejectedValueOnce(new ApiError(0, "Connection lost"))
      .mockRejectedValueOnce(
        new ApiError(409, "Case changed", {
          currentVersion: 5,
          currentCase: {
            id: "case-1",
            version: 5,
            status: "WAITING_END_USER",
            assignedCmsUserId: null,
          },
        }),
      );
    api.detail
      .mockResolvedValueOnce(makeBundle(4))
      .mockResolvedValueOnce(makeBundle(5));
    const controller = createSupportCaseDeskController(api, {
      projectId: () => "project-1",
      caseId: () => "case-1",
      canRead: () => true,
    });
    await controller.load();
    await expect(
      controller.transition("RESOLVED", "Пользователь подтвердил"),
    ).rejects.toThrow("Connection lost");

    await expect(controller.retryReconcile()).rejects.toThrow("Case changed");

    expect(controller.conflict.value?.currentVersion).toBe(5);
    expect(controller.reconciling.value).toBe(false);
    expect(api.workflow.mock.calls[1]?.[2].idempotencyKey).toBe(
      api.workflow.mock.calls[0]?.[2].idempotencyKey,
    );
  });

  it("retires a definitively rejected same-key replay and reloads authority", async () => {
    const api = source();
    api.workflow
      .mockRejectedValueOnce(new ApiError(0, "Connection lost"))
      .mockRejectedValueOnce(new ApiError(400, "Invalid transition"));
    api.detail
      .mockResolvedValueOnce(makeBundle(4))
      .mockResolvedValueOnce(makeBundle(5));
    const controller = createSupportCaseDeskController(api, {
      projectId: () => "project-1",
      caseId: () => "case-1",
      canRead: () => true,
    });
    await controller.load();
    await expect(
      controller.transition("RESOLVED", "Пользователь подтвердил"),
    ).rejects.toThrow("Connection lost");

    await expect(controller.retryReconcile()).rejects.toThrow(
      "Invalid transition",
    );

    expect(controller.exactCase.value?.version).toBe(5);
    expect(controller.reconciling.value).toBe(false);
  });

  it("fences a slow background load when a mutation starts", async () => {
    const staleLoad = deferred<EndUserCaseDetailBundle>();
    const api = source();
    api.workflow.mockResolvedValueOnce({
      id: "case-1",
      version: 5,
      status: "RESOLVED",
    });
    api.detail
      .mockResolvedValueOnce(makeBundle(4))
      .mockImplementationOnce(() => staleLoad.promise)
      .mockResolvedValueOnce(makeBundle(5));
    const controller = createSupportCaseDeskController(api, {
      projectId: () => "project-1",
      caseId: () => "case-1",
      canRead: () => true,
    });
    await controller.load();
    const background = controller.load();

    await controller.transition("RESOLVED", "Подтверждено");
    staleLoad.resolve(makeBundle(4));
    await background;

    expect(controller.exactCase.value?.version).toBe(5);
    expect(controller.reconciling.value).toBe(false);
  });

  it("rejects an escalation receipt scoped to another Case", async () => {
    const api = source();
    api.requestEscalation.mockResolvedValueOnce({
      caseVersion: 5,
      escalation: { caseId: "case-2" },
    });
    const controller = createSupportCaseDeskController(api, {
      projectId: () => "project-1",
      caseId: () => "case-1",
      canRead: () => true,
    });
    await controller.load();

    await expect(
      controller.escalate("PAYMENT_REVIEW", "Проверить платёж"),
    ).rejects.toThrow("некорректное подтверждение");
    expect(controller.reconciling.value).toBe(true);
    expect(controller.reconciliationReason.value).toBe("UNKNOWN");
  });

  it("preserves an in-flight intent across a same-scope reset", async () => {
    const command = deferred<unknown>();
    const api = source();
    api.workflow.mockImplementationOnce(() => command.promise);
    api.detail
      .mockResolvedValueOnce(makeBundle(4))
      .mockResolvedValueOnce(makeBundle(5));
    const controller = createSupportCaseDeskController(api, {
      projectId: () => "project-1",
      caseId: () => "case-1",
      canRead: () => true,
    });
    await controller.load();
    const mutation = controller.transition("RESOLVED", "Готово");

    controller.reset();
    expect(controller.reconciling.value).toBe(true);
    command.resolve({ id: "case-1", version: 5, status: "RESOLVED" });
    await mutation;

    expect(controller.exactCase.value?.version).toBe(5);
    expect(controller.reconciling.value).toBe(false);
  });

  it("does not let a stale accepted A intent overwrite B reconciliation", async () => {
    let projectId = "project-a";
    let caseId = "case-a";
    const commandA = deferred<unknown>();
    const commandB = deferred<unknown>();
    const api = source(bundleFor("case-a"));
    api.workflow
      .mockImplementationOnce(() => commandA.promise)
      .mockImplementationOnce(() => commandB.promise);
    api.detail
      .mockResolvedValueOnce(bundleFor("case-a", 4))
      .mockResolvedValueOnce(bundleFor("case-b", 9))
      .mockResolvedValueOnce(bundleFor("case-b", 10));
    const controller = createSupportCaseDeskController(api, {
      projectId: () => projectId,
      caseId: () => caseId,
      canRead: () => true,
    });
    await controller.load();
    const mutationA = controller.transition("RESOLVED", "A завершён");

    projectId = "project-b";
    caseId = "case-b";
    controller.reset();
    await controller.load();
    const mutationB = controller.transition("RESOLVED", "B завершён");

    commandA.resolve({ id: "case-a", version: 5, status: "RESOLVED" });
    await mutationA;
    commandB.resolve({ id: "case-b", version: 10, status: "RESOLVED" });
    await mutationB;

    expect(controller.exactCase.value?.id).toBe("case-b");
    expect(controller.exactCase.value?.version).toBe(10);
    expect(controller.reconciling.value).toBe(false);
  });

  it("applies the typed 409 receipt and remains fail-closed when its reload fails", async () => {
    const api = source();
    api.workflow.mockRejectedValueOnce(
      new ApiError(
        409,
        "Case changed",
        {
          currentVersion: 5,
          currentCase: {
            id: "case-1",
            version: 5,
            status: "WAITING_END_USER",
            assignedCmsUserId: null,
          },
        },
        "request-2",
        "CASE_VERSION_CONFLICT",
      ),
    );
    api.detail
      .mockResolvedValueOnce(makeBundle(4))
      .mockRejectedValueOnce(new Error("conflict refresh unavailable"))
      .mockResolvedValueOnce(makeBundle(5));
    const controller = createSupportCaseDeskController(api, {
      projectId: () => "project-1",
      caseId: () => "case-1",
      canRead: () => true,
    });
    await controller.load();

    await expect(
      controller.transition("RESOLVED", "Пользователь подтвердил"),
    ).rejects.toThrow("Case changed");

    expect(controller.exactCase.value).toMatchObject({
      version: 5,
      status: "WAITING_END_USER",
      allowedActions: [],
    });
    expect(controller.reconciling.value).toBe(true);
    await expect(
      controller.transition("RESOLVED", "Повтор"),
    ).rejects.toThrow("Актуальное состояние");

    await controller.retryReconcile();
    expect(controller.reconciling.value).toBe(false);
  });

  it.each([403, 404])("purges private Case state and refreshes authority on %s", async (status) => {
    const api = source();
    const onForbidden = vi.fn();
    const controller = createSupportCaseDeskController(api, {
      projectId: () => "project-1",
      caseId: () => "case-1",
      canRead: () => true,
      onForbidden,
    });
    await controller.load();
    api.workflow.mockRejectedValueOnce(new ApiError(status, "Case unavailable"));

    await expect(
      controller.transition("RESOLVED", "Завершено"),
    ).rejects.toThrow("Case unavailable");

    expect(controller.detail.value).toBeNull();
    expect(onForbidden).toHaveBeenCalledOnce();
  });

  it("requests escalation only through server authority and exact Case version", async () => {
    const api = source();
    const controller = createSupportCaseDeskController(api, {
      projectId: () => "project-1",
      caseId: () => "case-1",
      canRead: () => true,
    });
    await controller.load();

    await controller.escalate("PAYMENT_REVIEW", "Нужна проверка провайдера");

    expect(api.requestEscalation).toHaveBeenCalledWith(
      "project-1",
      "case-1",
      {
        expectedCaseVersion: 4,
        reasonCode: "PAYMENT_REVIEW",
        summary: "Нужна проверка провайдера",
      },
      expect.any(String),
    );
  });

  it("keeps the mock operator flow contract-complete for live UI verification", async () => {
    resetMockEndUserCases();
    const controller = createSupportCaseDeskController(
      mockEndUserCasesRepository,
      {
        projectId: () => "project-demo",
        caseId: () => "case-demo-deposit",
        canRead: () => true,
      },
    );

    await controller.load();
    expect(controller.exactCase.value?.allowedActions).toContain(
      "CHANGE_CLASSIFICATION",
    );
    expect(controller.exactCase.value?.priorityPolicy.policyVersion).toBe(7);

    await controller.classify({
      groupCode: "PAYMENTS_CARDS",
      reason: "Проверено по данным провайдера",
    });

    expect(controller.exactCase.value?.groupCode).toBe("PAYMENTS_CARDS");
    expect(controller.detail.value?.timeline.events.at(-1)).toMatchObject({
      type: "CORRECTED",
      reason: "Проверено по данным провайдера",
      actor: { type: "CMS_USER", cmsUserId: "cms-1" },
    });

    await controller.transition("RESOLVED", "Пользователь подтвердил решение");
    expect(controller.detail.value?.timeline.events.at(-1)).toMatchObject({
      type: "STATUS_CHANGED",
      previous: { status: "WAITING_SYSTEM" },
      next: { status: "RESOLVED" },
    });
  });
});
