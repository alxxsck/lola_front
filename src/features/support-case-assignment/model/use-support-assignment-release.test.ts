import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/http/api-error";
import type { SupportWorkspaceSelection } from "@/features/support-workspace/api/support-workspace-source";
import type {
  SupportAssignmentReleaseIntent,
  SupportAssignmentReleaseReceipt,
  SupportAssignmentReleaseSource,
} from "@/features/support-case-assignment/api/support-assignment-release-source";
import { createSupportAssignmentReleaseController } from "./use-support-assignment-release";

function selection(
  overrides: Partial<SupportWorkspaceSelection> = {},
): SupportWorkspaceSelection {
  return {
    checkpoint: "checkpoint-1",
    capabilitiesRevision: "revision-1",
    capabilities: {
      assignCase: false,
      claimAssignment: false,
      escalateCase: false,
      manageCase: false,
      releaseAssignment: true,
      reply: false,
      replyWithoutTranslation: false,
      suspendAi: false,
      transferAssignment: false,
    },
    endUser: {
      id: "end-user-1",
      externalId: "private-external-id",
      isGuest: false,
      createdAt: "2026-08-06T10:00:00.000Z",
      lastSeenAt: "2026-08-06T10:05:00.000Z",
    },
    case: {
      id: "case-1",
      title: "Возврат",
      status: "OPEN",
      priority: "NORMAL",
      groupCode: "billing",
      projectSequence: "42",
      attentionRequired: false,
      lastActivityAt: "2026-08-06T10:00:00.000Z",
      updatedAt: "2026-08-06T10:00:00.000Z",
      version: 7,
      assignee: { id: "operator-1", displayName: "Алина" },
      assignment: {
        id: "assignment-1",
        state: "ASSIGNED",
        operatorId: "operator-1",
        operatorName: "Алина",
        teamName: "Billing",
        version: 3,
        actionEtag: '"sa1.current.signature"',
      },
    },
    conversation: {
      id: "conversation-1",
      endUserId: "end-user-1",
      title: "Возврат",
      status: "OPEN",
      createdAt: "2026-08-06T10:00:00.000Z",
      updatedAt: "2026-08-06T10:00:00.000Z",
      messageCount: 0,
      isCurrent: true,
      currentInteractionSessionCount: 1,
      lastMessageAt: null,
    },
    messages: { items: [], nextCursor: null },
    ...overrides,
    classificationOptions: overrides.classificationOptions ?? [],
  };
}

function source(
  overrides: Partial<SupportAssignmentReleaseSource> = {},
): SupportAssignmentReleaseSource {
  return {
    release: vi.fn().mockResolvedValue({
      assignmentId: "assignment-1",
      caseId: "case-1",
      assignmentVersion: 4,
      caseVersion: 8,
    }),
    ...overrides,
  };
}

describe("support assignment release controller", () => {
  it("replays an unknown outcome with the exact captured version, ETag and idempotency key", async () => {
    const current = selection();
    const release = vi
      .fn()
      .mockRejectedValueOnce(new Error("connection lost"))
      .mockResolvedValueOnce({
        assignmentId: "assignment-1",
        caseId: "case-1",
        assignmentVersion: 4,
        caseVersion: 8,
      });
    const changed = vi.fn();
    const controller = createSupportAssignmentReleaseController(
      {
        projectId: () => "project-1",
        selection: () => current,
        canRelease: () => true,
        onChanged: changed,
        createIdempotencyKey: () => "release-attempt-1",
      },
      source({ release }),
    );

    await controller.release({ reasonCode: "SHIFT_END", reasonNote: "Очередь" });
    await controller.retryUnknownOutcome();

    const expectedIntent: SupportAssignmentReleaseIntent = {
      caseId: "case-1",
      assignmentId: "assignment-1",
      expectedAssignmentVersion: 3,
      actionEtag: '"sa1.current.signature"',
      reasonCode: "SHIFT_END",
      reasonNote: "Очередь",
    };
    expect(release).toHaveBeenCalledTimes(2);
    expect(release.mock.calls[0]?.slice(0, 3)).toEqual([
      "project-1",
      expectedIntent,
      "release-attempt-1",
    ]);
    expect(release.mock.calls[1]?.slice(0, 3)).toEqual(
      release.mock.calls[0]?.slice(0, 3),
    );
    expect(changed).toHaveBeenCalledOnce();
    expect(controller.unknownOutcome.value).toBe(false);
    expect(controller.completed.value).toBe(true);
    expect(current.case?.assignment?.actionEtag).toBe('"sa1.current.signature"');
  });

  it("does not commit an in-flight release after its per-Case capability is revoked", async () => {
    let current = selection();
    let resolveRelease:
      | ((value: SupportAssignmentReleaseReceipt) => void)
      | undefined;
    const controller = createSupportAssignmentReleaseController(
      {
        projectId: () => "project-1",
        selection: () => current,
        canRelease: () => true,
      },
      source({
        release: vi.fn(
          () =>
            new Promise<SupportAssignmentReleaseReceipt>((resolve) => {
              resolveRelease = resolve;
            }),
        ),
      }),
    );

    const action = controller.release({ reasonCode: "WORK_RETURNED" });
    current = selection({
      capabilities: { ...current.capabilities, releaseAssignment: false },
    });
    resolveRelease?.({
      assignmentId: "assignment-1",
      caseId: "case-1",
      assignmentVersion: 4,
      caseVersion: 8,
    });
    await action;

    expect(controller.completed.value).toBe(false);
    expect(controller.error.value).toBe("");
    expect(controller.unknownOutcome.value).toBe(false);
  });

  it("reconciles a stale assignment instead of offering a replay", async () => {
    const current = selection();
    const changed = vi.fn();
    const controller = createSupportAssignmentReleaseController(
      {
        projectId: () => "project-1",
        selection: () => current,
        canRelease: () => true,
        onChanged: changed,
      },
      source({ release: vi.fn().mockRejectedValue(new ApiError(409, "stale")) }),
    );

    await controller.release({ reasonCode: "WORK_RETURNED" });

    expect(changed).toHaveBeenCalledOnce();
    expect(controller.unknownOutcome.value).toBe(false);
    expect(controller.canRetry.value).toBe(false);
    expect(controller.error.value).toContain("Назначение уже изменилось");
  });

  it("purges the action intent and refreshes authority after a concealed denial", async () => {
    const current = selection();
    const onForbidden = vi.fn();
    const controller = createSupportAssignmentReleaseController(
      {
        projectId: () => "project-1",
        selection: () => current,
        canRelease: () => true,
        onForbidden,
      },
      source({ release: vi.fn().mockRejectedValue(new ApiError(403, "hidden")) }),
    );

    await controller.release({ reasonCode: "WORK_RETURNED" });

    expect(onForbidden).toHaveBeenCalledOnce();
    expect(controller.completed.value).toBe(false);
    expect(controller.error.value).toBe("");
    expect(controller.unknownOutcome.value).toBe(false);
    expect(controller.canRetry.value).toBe(false);
  });

  it("keeps a confirmed release known when context refresh fails", async () => {
    const current = selection();
    const release = vi.fn().mockResolvedValue({
      assignmentId: "assignment-1",
      caseId: "case-1",
      assignmentVersion: 4,
      caseVersion: 8,
    });
    const controller = createSupportAssignmentReleaseController(
      {
        projectId: () => "project-1",
        selection: () => current,
        canRelease: () => true,
        onChanged: vi.fn().mockRejectedValue(new Error("selection unavailable")),
      },
      source({ release }),
    );

    await controller.release({ reasonCode: "OTHER", reasonNote: "Переработка" });
    await controller.release({ reasonCode: "WORK_RETURNED" });

    expect(release).toHaveBeenCalledOnce();
    expect(controller.completed.value).toBe(true);
    expect(controller.unknownOutcome.value).toBe(false);
    expect(controller.canRetry.value).toBe(false);
    expect(controller.error.value).toContain("Назначение уже снято");
  });

  it("reconciles an invalid receipt without treating it as replayable transport uncertainty", async () => {
    const current = selection();
    const changed = vi.fn();
    const controller = createSupportAssignmentReleaseController(
      {
        projectId: () => "project-1",
        selection: () => current,
        canRelease: () => true,
        onChanged: changed,
      },
      source({
        release: vi.fn().mockResolvedValue({
          assignmentId: "another-assignment",
          caseId: "another-case",
          assignmentVersion: 4,
          caseVersion: 8,
        }),
      }),
    );

    await controller.release({ reasonCode: "WORK_RETURNED" });

    expect(changed).toHaveBeenCalledOnce();
    expect(controller.completed.value).toBe(false);
    expect(controller.unknownOutcome.value).toBe(false);
    expect(controller.canRetry.value).toBe(false);
    expect(controller.error.value).toContain("некорректный результат");
  });

  it("does not derive release authority from a Case without the server capability", async () => {
    const current = selection({
      capabilities: { ...selection().capabilities, releaseAssignment: false },
    });
    const release = vi.fn();
    const controller = createSupportAssignmentReleaseController(
      {
        projectId: () => "project-1",
        selection: () => current,
        canRelease: () => true,
      },
      source({ release }),
    );

    await controller.release({ reasonCode: "WORK_RETURNED" });

    expect(release).not.toHaveBeenCalled();
  });

  it("requires the current session assignment permission as well as the per-Case capability", async () => {
    const current = selection();
    const release = vi.fn();
    const controller = createSupportAssignmentReleaseController(
      {
        projectId: () => "project-1",
        selection: () => current,
        canRelease: () => false,
      },
      source({ release }),
    );

    await controller.release({ reasonCode: "WORK_RETURNED" });

    expect(release).not.toHaveBeenCalled();
  });
});
