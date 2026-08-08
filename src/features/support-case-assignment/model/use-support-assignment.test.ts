import { nextTick, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/http/api-error";
import type { SupportWorkspaceSelection } from "@/features/support-workspace/api/support-workspace-source";
import {
  SupportAssignmentIntegrityError,
  type SupportAssignmentSnapshot,
  type SupportAssignmentSource,
} from "@/features/support-case-assignment/api/support-assignment-source";
import { createSupportAssignmentController } from "./use-support-assignment";

function selection(
  overrides: Partial<SupportWorkspaceSelection> = {},
): SupportWorkspaceSelection {
  return {
    checkpoint: "checkpoint-1",
    capabilitiesRevision: "capabilities-1",
    actionRevisions: { caseVersion: 9, assignmentVersion: null },
    classificationOptions: [],
    capabilities: {
      assignCase: false,
      claimAssignment: true,
      escalateCase: false,
      manageCase: true,
      releaseAssignment: false,
      reply: true,
      replyWithoutTranslation: false,
      suspendAi: false,
      transferAssignment: false,
    },
    endUser: {
      id: "end-user-1",
      externalId: "external-1",
      isGuest: false,
      createdAt: "2026-08-08T09:00:00.000Z",
      lastSeenAt: "2026-08-08T10:00:00.000Z",
    },
    case: {
      id: "case-1",
      title: "Возврат",
      status: "OPEN",
      priority: "NORMAL",
      groupCode: "PAYMENTS",
      projectSequence: "42",
      attentionRequired: false,
      lastActivityAt: "2026-08-08T10:00:00.000Z",
      updatedAt: "2026-08-08T10:00:00.000Z",
      version: 9,
      latestRevisionId: null,
      assignee: null,
      assignment: null,
    },
    conversation: null,
    messages: {
      items: [],
      nextCursor: null,
      newerCursor: null,
      anchorOrdinal: null,
    },
    ...overrides,
  };
}

function snapshot(
  overrides: Partial<SupportAssignmentSnapshot> = {},
): SupportAssignmentSnapshot {
  return {
    caseId: "case-1",
    caseVersion: 9,
    caseReadToken: '"sc1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"',
    assignmentState: "UNASSIGNED",
    currentAssignment: null,
    workforceRevision: { id: "workforce-1", number: 4 },
    actions: { claim: true, assign: false, assignWithOverride: false, release: false, transfer: false, transferWithOverride: false },
    teams: [
      {
        id: "team-1",
        code: "PAYMENTS",
        name: "Платежи",
        actions: { claim: true, assign: false, assignWithOverride: false, transfer: false, transferWithOverride: false },
        operators: [],
      },
    ],
    ...overrides,
  };
}

function assignedSelection(): SupportWorkspaceSelection {
  const value = selection();
  return {
    ...value,
    actionRevisions: { caseVersion: 9, assignmentVersion: 3 },
    capabilities: {
      ...value.capabilities,
      claimAssignment: false,
      releaseAssignment: true,
      transferAssignment: true,
    },
    case: {
      ...value.case!,
      assignee: { id: "operator-1", displayName: "Анна" },
      assignment: {
        id: "assignment-1",
        state: "ASSIGNED",
        operatorId: "operator-1",
        operatorName: "Анна",
        teamName: "Платежи",
        version: 3,
        actionEtag: '"sa1.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"',
      },
    },
  };
}

function assignedSnapshot(): SupportAssignmentSnapshot {
  return snapshot({
    assignmentState: "ASSIGNED",
    currentAssignment: {
      id: "assignment-1",
      version: 3,
      actionEtag: '"sa1.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"',
    },
    actions: { claim: false, assign: false, assignWithOverride: false, release: true, transfer: true, transferWithOverride: false },
    teams: [
      {
        id: "team-2",
        code: "VIP",
        name: "VIP",
        actions: { claim: false, assign: false, assignWithOverride: false, transfer: true, transferWithOverride: false },
        operators: [
          {
            id: "operator-2",
            displayName: "Максим",
            availableCapacityUnits: 300,
            effectiveAvailability: "AVAILABLE",
            requiredOverrides: [],
            actions: { claim: false, assign: false, assignWithOverride: false, transfer: true, transferWithOverride: false },
          },
        ],
      },
    ],
  });
}

function source(
  overrides: Partial<SupportAssignmentSource> = {},
): SupportAssignmentSource {
  return {
    readCase: vi.fn().mockResolvedValue(snapshot()),
    execute: vi.fn(),
    listOffers: vi.fn().mockResolvedValue([]),
    actOnOffer: vi.fn(),
    ...overrides,
  };
}

describe("support assignment controller", () => {
  it("exposes claim only when session, workspace and Case candidate authorities agree", async () => {
    const current = ref(selection());
    const controller = createSupportAssignmentController(
      source(),
      {
        projectId: () => "project-1",
        selection: () => current.value,
        canManageOwn: () => true,
        canOverride: () => false,
        canReceiveOffers: () => false,
      },
    );

    await controller.loadCase();
    expect(controller.canClaim.value).toBe(true);

    current.value = selection({
      capabilities: {
        ...current.value.capabilities,
        claimAssignment: false,
      },
    });
    expect(controller.canClaim.value).toBe(false);
  });

  it("replays an unknown claim outcome with the exact captured snapshot and idempotency key", async () => {
    const execute = vi
      .fn()
      .mockRejectedValueOnce(new Error("connection lost"))
      .mockResolvedValueOnce({
        intent: "CLAIM_CASE_ASSIGNMENT",
        caseId: "case-1",
        assignmentId: "assignment-1",
        caseVersion: 10,
        assignmentVersion: 1,
      });
    const onChanged = vi.fn();
    const controller = createSupportAssignmentController(
      source({ execute }),
      {
        projectId: () => "project-1",
        selection: () => selection(),
        canManageOwn: () => true,
        canOverride: () => false,
        canReceiveOffers: () => false,
        createIdempotencyKey: () => "assignment-intent-1",
        onChanged,
      },
    );

    await controller.loadCase();
    controller.setDraft({ kind: "CLAIM", teamId: "team-1" });
    await controller.submit();
    await controller.retryUnknownOutcome();

    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[1]?.slice(0, 3)).toEqual(
      execute.mock.calls[0]?.slice(0, 3),
    );
    expect(execute.mock.calls[0]?.[2]).toBe("assignment-intent-1");
    expect(controller.unknownOutcome.value).toBe(false);
    expect(controller.draft.value).toBeNull();
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("preserves the operator draft and reconciles authoritative state on 409", async () => {
    const holder: {
      controller?: ReturnType<typeof createSupportAssignmentController>;
    } = {};
    const onChanged = vi.fn(async () => {
      holder.controller?.resetCase();
    });
    const readCase = vi
      .fn()
      .mockResolvedValueOnce(snapshot())
      .mockResolvedValueOnce(
        snapshot({
          caseVersion: 10,
          assignmentState: "ASSIGNED",
          actions: {
            claim: false,
            assign: false,
            assignWithOverride: false,
            release: false,
            transfer: false,
            transferWithOverride: false,
          },
          teams: [],
        }),
      );
    const controller = createSupportAssignmentController(
      source({
        readCase,
        execute: vi
          .fn()
          .mockRejectedValue(
            new ApiError(409, "stale", undefined, undefined, "CASE_VERSION_CONFLICT"),
          ),
      }),
      {
        projectId: () => "project-1",
        selection: () => selection(),
        canManageOwn: () => true,
        canOverride: () => false,
        canReceiveOffers: () => false,
        onChanged,
      },
    );
    holder.controller = controller;

    await controller.loadCase();
    controller.setDraft({ kind: "CLAIM", teamId: "team-1" });
    await controller.submit();

    expect(controller.draft.value).toEqual({
      kind: "CLAIM",
      teamId: "team-1",
    });
    expect(controller.unknownOutcome.value).toBe(false);
    expect(controller.canRetry.value).toBe(false);
    expect(controller.error.value).toContain("изменилось");
    expect(onChanged).toHaveBeenCalledOnce();
    expect(readCase).toHaveBeenCalledTimes(2);
  });

  it("transfers only through the selected server-authorized target", async () => {
    const execute = vi.fn().mockResolvedValue({
      intent: "TRANSFER_CASE_ASSIGNMENT",
      caseId: "case-1",
      assignmentId: "assignment-2",
      caseVersion: 10,
      assignmentVersion: 1,
    });
    const controller = createSupportAssignmentController(
      source({
        readCase: vi.fn().mockResolvedValue(assignedSnapshot()),
        execute,
      }),
      {
        projectId: () => "project-1",
        selection: assignedSelection,
        canManageOwn: () => true,
        canOverride: () => true,
        canReceiveOffers: () => false,
        createIdempotencyKey: () => "assignment-intent-2",
      },
    );

    await controller.loadCase();
    expect(controller.canRelease.value).toBe(true);
    expect(controller.canTransfer.value).toBe(true);
    controller.setDraft({
      kind: "TRANSFER",
      teamId: "team-2",
      operatorId: "operator-2",
      reasonCode: "SKILL_HANDOFF",
      reasonNote: "Нужна экспертиза VIP",
    });
    await controller.submit();

    expect(execute).toHaveBeenCalledWith(
      "project-1",
      {
        kind: "TRANSFER",
        snapshot: assignedSnapshot(),
        teamId: "team-2",
        operatorId: "operator-2",
        reasonCode: "SKILL_HANDOFF",
        reasonNote: "Нужна экспертиза VIP",
      },
      "assignment-intent-2",
      expect.any(AbortSignal),
    );
  });

  it("removes an expired own offer even when the private refresh fails", async () => {
    const offer = {
      assignmentId: "offer-assignment-1",
      caseId: "case-2",
      assignmentVersion: 6,
      expiresAt: "2026-08-08T12:00:00.000Z",
      actionEtag: '"so1.k.ddddddddddddddddddddddddddddddddddddddddddd"',
      offerToken: "opaque-routing-offer-token",
    };
    const listOffers = vi
      .fn()
      .mockResolvedValueOnce([offer])
      .mockRejectedValueOnce(new Error("refresh failed"));
    const controller = createSupportAssignmentController(
      source({
        listOffers,
        actOnOffer: vi.fn().mockRejectedValue(
          new ApiError(
            409,
            "expired",
            undefined,
            undefined,
            "SUPPORT_OFFER_EXPIRED",
          ),
        ),
      }),
      {
        projectId: () => "project-1",
        selection: () => selection(),
        canManageOwn: () => true,
        canOverride: () => false,
        canReceiveOffers: () => true,
      },
    );

    await controller.loadOffers();
    await controller.actOnOffer("offer-assignment-1", "ACCEPT");

    expect(controller.offers.value).toEqual([]);
    expect(controller.offerUnknownOutcome.value).toBe(false);
    expect(controller.offerError.value).toContain("не актуально");
    expect(listOffers).toHaveBeenCalledTimes(2);
  });

  it("purges the Case action surface after assignment permission is revoked", async () => {
    const onForbidden = vi.fn();
    const controller = createSupportAssignmentController(
      source({
        readCase: vi
          .fn()
          .mockRejectedValue(
            new ApiError(403, "revoked", undefined, undefined, "NOT_FOUND_OR_FORBIDDEN"),
          ),
      }),
      {
        projectId: () => "project-1",
        selection: () => selection(),
        canManageOwn: () => true,
        canOverride: () => false,
        canReceiveOffers: () => false,
        onForbidden,
      },
    );
    controller.setDraft({ kind: "CLAIM", teamId: "team-1" });

    await controller.loadCase();

    expect(controller.caseSnapshot.value).toBeNull();
    expect(controller.draft.value).toBeNull();
    expect(controller.canClaim.value).toBe(false);
    expect(onForbidden).toHaveBeenCalledOnce();
  });

  it("does not replay a known successful assignment when reconciliation fails", async () => {
    const execute = vi.fn().mockResolvedValue({
      intent: "CLAIM_CASE_ASSIGNMENT",
      caseId: "case-1",
      assignmentId: "assignment-1",
      caseVersion: 10,
      assignmentVersion: 1,
    });
    const controller = createSupportAssignmentController(source({ execute }), {
      projectId: () => "project-1",
      selection: () => selection(),
      canManageOwn: () => true,
      canOverride: () => false,
      canReceiveOffers: () => false,
      onChanged: vi.fn().mockRejectedValue(new Error("refresh failed")),
    });

    await controller.loadCase();
    controller.setDraft({ kind: "CLAIM", teamId: "team-1" });
    await controller.submit();

    expect(execute).toHaveBeenCalledOnce();
    expect(controller.draft.value).toBeNull();
    expect(controller.unknownOutcome.value).toBe(false);
    expect(controller.canRetry.value).toBe(false);
    expect(controller.error.value).toContain("выполнено");
  });

  it("purges a revoked mutation and never offers an idempotent replay", async () => {
    const onForbidden = vi.fn();
    const controller = createSupportAssignmentController(
      source({
        execute: vi.fn().mockRejectedValue(
          new ApiError(
            403,
            "revoked",
            undefined,
            undefined,
            "NOT_FOUND_OR_FORBIDDEN",
          ),
        ),
      }),
      {
        projectId: () => "project-1",
        selection: () => selection(),
        canManageOwn: () => true,
        canOverride: () => false,
        canReceiveOffers: () => false,
        onForbidden,
      },
    );

    await controller.loadCase();
    controller.setDraft({ kind: "CLAIM", teamId: "team-1" });
    await controller.submit();

    expect(controller.caseSnapshot.value).toBeNull();
    expect(controller.draft.value).toBeNull();
    expect(controller.unknownOutcome.value).toBe(false);
    expect(onForbidden).toHaveBeenCalledOnce();
  });

  it("keeps a successful offer final when the follow-up reconcile fails", async () => {
    const offer = {
      assignmentId: "offer-assignment-1",
      caseId: "case-2",
      assignmentVersion: 6,
      expiresAt: "2026-08-08T12:00:00.000Z",
      actionEtag: '"so1.k.ddddddddddddddddddddddddddddddddddddddddddd"',
      offerToken: "opaque-routing-offer-token",
    };
    const controller = createSupportAssignmentController(
      source({
        listOffers: vi.fn().mockResolvedValueOnce([offer]).mockRejectedValueOnce(
          new Error("refresh failed"),
        ),
        actOnOffer: vi.fn().mockResolvedValue({
          assignmentId: offer.assignmentId,
          caseVersion: 10,
          outcome: "ACCEPTED",
        }),
      }),
      {
        projectId: () => "project-1",
        selection: () => selection(),
        canManageOwn: () => true,
        canOverride: () => false,
        canReceiveOffers: () => true,
        onChanged: vi.fn().mockRejectedValue(new Error("reconcile failed")),
      },
    );

    await controller.loadOffers();
    await controller.actOnOffer(offer.assignmentId, "ACCEPT");

    expect(controller.offers.value).toEqual([]);
    expect(controller.offerUnknownOutcome.value).toBe(false);
    expect(controller.offerCanRetry.value).toBe(false);
    expect(controller.offerError.value).toContain("выполнено");
  });

  it("blocks an unknown-outcome replay after the exact Case authority changes", async () => {
    const current = ref(selection());
    const execute = vi.fn().mockRejectedValue(new Error("connection lost"));
    const controller = createSupportAssignmentController(source({ execute }), {
      projectId: () => "project-1",
      selection: () => current.value,
      canManageOwn: () => true,
      canOverride: () => false,
      canReceiveOffers: () => false,
    });

    await controller.loadCase();
    controller.setDraft({ kind: "CLAIM", teamId: "team-1" });
    await controller.submit();
    current.value = selection({
      capabilities: {
        ...current.value.capabilities,
        claimAssignment: false,
      },
    });
    await controller.retryUnknownOutcome();

    expect(execute).toHaveBeenCalledOnce();
    expect(controller.unknownOutcome.value).toBe(false);
    expect(controller.canRetry.value).toBe(false);
    expect(controller.error.value).toContain("заблокирован");
  });

  it("reactively purges an unknown replay when the server candidate action is revoked", async () => {
    const execute = vi.fn().mockRejectedValue(new Error("connection lost"));
    const controller = createSupportAssignmentController(source({ execute }), {
      projectId: () => "project-1",
      selection: () => selection(),
      canManageOwn: () => true,
      canOverride: () => false,
      canReceiveOffers: () => false,
    });

    await controller.loadCase();
    controller.setDraft({ kind: "CLAIM", teamId: "team-1" });
    await controller.submit();
    expect(controller.canRetry.value).toBe(true);

    controller.caseSnapshot.value = snapshot({
      actions: { claim: false, assign: false, assignWithOverride: false, release: false, transfer: false, transferWithOverride: false },
      teams: [],
    });
    await nextTick();

    expect(controller.canRetry.value).toBe(false);
    expect(controller.unknownOutcome.value).toBe(false);
    expect(controller.error.value).toContain("заблокирован");
    expect(execute).toHaveBeenCalledOnce();
  });

  it("purges an expired unknown offer replay without another operator click", async () => {
    const offer = {
      assignmentId: "offer-assignment-1",
      caseId: "case-2",
      assignmentVersion: 6,
      expiresAt: "2099-08-08T12:00:00.000Z",
      actionEtag: '"so1.k.ddddddddddddddddddddddddddddddddddddddddddd"',
      offerToken: "opaque-routing-offer-token",
    };
    const actOnOffer = vi.fn().mockRejectedValue(new Error("connection lost"));
    const controller = createSupportAssignmentController(
      source({
        listOffers: vi.fn().mockResolvedValue([offer]),
        actOnOffer,
      }),
      {
        projectId: () => "project-1",
        selection: () => selection(),
        canManageOwn: () => true,
        canOverride: () => false,
        canReceiveOffers: () => true,
      },
    );

    await controller.loadOffers();
    await controller.actOnOffer(offer.assignmentId, "ACCEPT");
    expect(controller.offerCanRetry.value).toBe(true);

    controller.expireOffers(Date.parse("2100-01-01T00:00:00.000Z"));
    await nextTick();

    expect(controller.offers.value).toEqual([]);
    expect(controller.offerUnknownOutcome.value).toBe(false);
    expect(controller.offerCanRetry.value).toBe(false);
    expect(controller.offerError.value).toContain("истёк");
    expect(actOnOffer).toHaveBeenCalledOnce();
  });

  it("never replays a command after a receipt integrity failure", async () => {
    const execute = vi.fn().mockRejectedValue(
      new SupportAssignmentIntegrityError(),
    );
    const controller = createSupportAssignmentController(source({ execute }), {
      projectId: () => "project-1",
      selection: () => selection(),
      canManageOwn: () => true,
      canOverride: () => false,
      canReceiveOffers: () => false,
    });

    await controller.loadCase();
    controller.setDraft({ kind: "CLAIM", teamId: "team-1" });
    await controller.submit();
    await controller.retryUnknownOutcome();

    expect(execute).toHaveBeenCalledOnce();
    expect(controller.unknownOutcome.value).toBe(false);
    expect(controller.canRetry.value).toBe(false);
    expect(controller.error.value).toContain("повтор заблокирован");
  });
});
