import { describe, expect, it, vi } from "vitest";
import { createSupportLeadAssignmentBatchController } from "./use-support-lead-assignment-batch";
import type { SupportAssignmentSnapshot } from "@/features/support-case-assignment/api/support-assignment-source";

function snapshot(
  caseId: string,
  overrides: Array<"AVAILABILITY" | "CAPACITY" | "RESERVATION"> = [],
): SupportAssignmentSnapshot {
  const ordinary = overrides.length === 0;
  return {
    caseId,
    caseVersion: 2,
    caseReadToken: `sc1.${caseId}`,
    assignmentState: "UNASSIGNED" as const,
    currentAssignment: null,
    workforceRevision: { id: "workforce-1", number: 1 },
    actions: {
      claim: false,
      assign: ordinary,
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
          assign: ordinary,
          assignWithOverride: true,
          transfer: false,
          transferWithOverride: false,
        },
        operators: [
          {
            id: "operator-1",
            displayName: "Анна",
            availableCapacityUnits: ordinary ? 100 : 0,
            effectiveAvailability: ordinary ? "AVAILABLE" : "OFFLINE",
            requiredOverrides: overrides,
            actions: {
              claim: false,
              assign: ordinary,
              assignWithOverride: true,
              transfer: false,
              transferWithOverride: false,
            },
          },
        ],
      },
    ],
  };
}

describe("support Lead assignment batch controller", () => {
  it("keeps exact per-item success and failure outcomes visible", async () => {
    const source = {
      readCase: vi.fn((_, caseId) => Promise.resolve(snapshot(caseId))),
      execute: vi.fn(),
      lookupOutcome: vi.fn(),
      executeBatch: vi.fn().mockResolvedValue({
        batchId: "batch-1",
        status: "COMPLETED",
        outcome: "PARTIAL",
        itemCount: 2,
        processedCount: 2,
        succeededCount: 1,
        failedCount: 1,
        items: [
          { clientItemId: "item-1", caseId: "case-1", status: "SUCCEEDED" },
          {
            clientItemId: "item-2",
            caseId: "case-2",
            status: "FAILED",
            error: { code: "OPERATOR_CAPACITY_EXCEEDED" },
          },
        ],
      }),
      lookupBatchOutcome: vi.fn(),
      readAudit: vi.fn(),
    };
    const changed = vi.fn();
    const controller = createSupportLeadAssignmentBatchController(source, {
      projectId: () => "project-1",
      canOverride: () => true,
      canForce: () => true,
      onChanged: changed,
      createIdempotencyKey: () => "batch-key-1",
    });
    await controller.prepare(["case-1", "case-2"]);
    controller.reasonNote.value = "Балансировка очереди перед сменой";

    await controller.submit();

    expect(source.executeBatch).toHaveBeenCalledWith(
      "project-1",
      expect.arrayContaining([
        expect.objectContaining({ caseId: "case-1", force: false }),
        expect.objectContaining({ caseId: "case-2", force: false }),
      ]),
      "batch-key-1",
      expect.any(AbortSignal),
    );
    expect(controller.result.value?.outcome).toBe("PARTIAL");
    expect(controller.result.value?.items[1]?.error?.code).toBe(
      "OPERATOR_CAPACITY_EXCEEDED",
    );
    expect(changed).toHaveBeenCalledOnce();
  });

  it("derives force bypasses from each server-owned candidate row", async () => {
    const source = {
      readCase: vi.fn().mockResolvedValue(snapshot("case-1", ["AVAILABILITY", "CAPACITY"])),
      execute: vi.fn(),
      lookupOutcome: vi.fn(),
      executeBatch: vi.fn().mockResolvedValue({
        batchId: "batch-1",
        status: "COMPLETED",
        outcome: "SUCCEEDED",
        itemCount: 1,
        processedCount: 1,
        succeededCount: 1,
        failedCount: 0,
        items: [{ clientItemId: "item-1", caseId: "case-1", status: "SUCCEEDED" }],
      }),
      lookupBatchOutcome: vi.fn(),
      readAudit: vi.fn(),
    };
    const controller = createSupportLeadAssignmentBatchController(source, {
      projectId: () => "project-1",
      canOverride: () => true,
      canForce: () => true,
      createIdempotencyKey: () => "batch-key-2",
    });
    await controller.prepare(["case-1"]);
    controller.reasonNote.value = "Критический поток обращений";

    await controller.submit();

    expect(source.executeBatch).toHaveBeenCalledWith(
      "project-1",
      [
        expect.objectContaining({
          force: true,
          bypassAvailability: true,
          bypassCapacity: true,
          reasonCode: "INCIDENT_RESPONSE",
        }),
      ],
      "batch-key-2",
      expect.any(AbortSignal),
    );
  });
});
