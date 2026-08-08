import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/http/api-error";
import type { SupportAssignmentSnapshot } from "@/features/support-case-assignment/api/support-assignment-source";
import { createSupportLeadAssignmentController } from "./use-support-lead-assignment";

const snapshot: SupportAssignmentSnapshot = {
  caseId: "case-1",
  caseVersion: 8,
  caseReadToken: "sc1.read-token",
  assignmentState: "UNASSIGNED",
  currentAssignment: null,
  workforceRevision: { id: "workforce-1", number: 3 },
  actions: {
    claim: false,
    assign: true,
    assignWithOverride: true,
    release: false,
    transfer: false,
    transferWithOverride: false,
  },
  teams: [
    {
      id: "team-1",
      code: "PAYMENTS",
      name: "Платежи",
      actions: {
        claim: false,
        assign: true,
        assignWithOverride: true,
        transfer: false,
        transferWithOverride: false,
      },
      operators: [
        {
          id: "operator-1",
          displayName: "Анна Смирнова",
          availableCapacityUnits: 200,
          effectiveAvailability: "AVAILABLE",
          requiredOverrides: [],
          actions: {
            claim: false,
            assign: true,
            assignWithOverride: true,
            transfer: false,
            transferWithOverride: false,
          },
        },
      ],
    },
  ],
};

function setup(overrides: Record<string, unknown> = {}) {
  const source = {
    readCase: vi.fn().mockResolvedValue(snapshot),
    execute: vi.fn().mockResolvedValue({
      intent: "ASSIGN_CASE_ASSIGNMENT",
      caseId: "case-1",
      assignmentId: "assignment-1",
      caseVersion: 9,
      assignmentVersion: 1,
      actionEtag: "sa1.etag",
    }),
    lookupOutcome: vi.fn(),
    executeBatch: vi.fn(),
    lookupBatchOutcome: vi.fn(),
    readAudit: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
  let projectId: string | undefined = "project-1";
  const changed = vi.fn();
  const controller = createSupportLeadAssignmentController(source, {
    projectId: () => projectId,
    canOverride: () => true,
    canForce: () => true,
    onChanged: changed,
    createIdempotencyKey: () => "lead-command-1",
  });
  return { controller, source, changed, setProjectId: (value?: string) => (projectId = value) };
}

describe("support Lead assignment controller", () => {
  it("assigns only an operator allowed by the authoritative Case catalog", async () => {
    const { controller, source, changed } = setup();
    await controller.open("case-1");
    controller.setDraft({
      kind: "ASSIGN",
      teamId: "team-1",
      operatorId: "operator-1",
      reasonCode: "SKILL_MATCH",
    });

    await controller.submit();

    expect(source.execute).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        kind: "ASSIGN",
        teamId: "team-1",
        operatorId: "operator-1",
      }),
      "lead-command-1",
      expect.any(AbortSignal),
    );
    expect(changed).toHaveBeenCalledWith("case-1");
  });

  it("preserves the operator draft and refreshes authority after a 409", async () => {
    const execute = vi.fn().mockRejectedValue(
      new ApiError(409, "conflict", undefined, undefined, "CASE_VERSION_CONFLICT"),
    );
    const { controller, source } = setup({ execute });
    await controller.open("case-1");
    const draft = {
      kind: "ASSIGN" as const,
      teamId: "team-1",
      operatorId: "operator-1",
      reasonCode: "LOAD_BALANCE" as const,
      reasonNote: "Сохраняем этот текст",
    };
    controller.setDraft(draft);

    await controller.submit();

    expect(source.readCase).toHaveBeenCalledTimes(2);
    expect(controller.draft.value).toEqual(draft);
    expect(controller.error.value).toContain("изменилось");
  });

  it("reconciles a transport-unknown command through outcome lookup instead of resending", async () => {
    const execute = vi.fn().mockRejectedValue(new Error("network"));
    const lookupOutcome = vi.fn().mockResolvedValue({
      intent: "ASSIGN_CASE_ASSIGNMENT",
      caseId: "case-1",
      assignmentId: "assignment-1",
      caseVersion: 9,
      assignmentVersion: 1,
      actionEtag: "sa1.etag",
    });
    const { controller, changed } = setup({ execute, lookupOutcome });
    await controller.open("case-1");
    controller.setDraft({
      kind: "ASSIGN",
      teamId: "team-1",
      operatorId: "operator-1",
      reasonCode: "LEAD_INTERVENTION",
    });

    await controller.submit();

    expect(lookupOutcome).toHaveBeenCalledWith(
      "project-1",
      "case-1",
      "lead-command-1",
      "ASSIGN_CASE_ASSIGNMENT",
      expect.any(AbortSignal),
    );
    expect(execute).toHaveBeenCalledTimes(1);
    expect(controller.unknownOutcome.value).toBe(false);
    expect(changed).toHaveBeenCalledWith("case-1");
  });

  it("purges an unknown command when a concealed 404 revokes authority", async () => {
    const forbidden = vi.fn();
    const source = {
      readCase: vi.fn().mockResolvedValue(snapshot),
      execute: vi.fn().mockRejectedValue(new Error("network")),
      lookupOutcome: vi
        .fn()
        .mockRejectedValue(
          new ApiError(404, "concealed", undefined, undefined, "NOT_FOUND_OR_FORBIDDEN"),
        ),
      executeBatch: vi.fn(),
      lookupBatchOutcome: vi.fn(),
      readAudit: vi.fn().mockResolvedValue([]),
    };
    const controller = createSupportLeadAssignmentController(source, {
      projectId: () => "project-1",
      canOverride: () => true,
      canForce: () => true,
      onForbidden: forbidden,
      createIdempotencyKey: () => "lead-command-1",
    });
    await controller.open("case-1");
    controller.setDraft({
      kind: "ASSIGN",
      teamId: "team-1",
      operatorId: "operator-1",
      reasonCode: "LEAD_INTERVENTION",
    });

    await controller.submit();

    expect(forbidden).toHaveBeenCalledOnce();
    expect(controller.unknownOutcome.value).toBe(false);
    expect(controller.draft.value).toBeNull();
  });
});
