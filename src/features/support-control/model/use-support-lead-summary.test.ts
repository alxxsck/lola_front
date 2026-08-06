import { describe, expect, it, vi } from "vitest";
import type { SupportLeadSummary } from "@/features/support-control/api/support-lead-source";
import { ApiError } from "@/shared/api/http/api-error";
import { createSupportLeadSummaryController } from "./use-support-lead-summary";

const summary: SupportLeadSummary = {
  computedAt: "2026-08-06T10:00:00.000Z",
  freshnessState: "READY",
  slaRolloutState: "SHADOW",
  actionableBacklog: { unassignedCount: 1, oldestUnassignedAgeMs: null },
  sla: { atRiskCount: 1, breachedCount: 0, oldestDueAgeMs: null },
  workforce: {
    availability: { AVAILABLE: 1, BUSY: 0, AWAY: 0, DRAINING: 0, OFFLINE: 0 },
    capacityGapUnits: 0,
    currentWorkloadUnits: 1,
    maximumCapacityUnits: 2,
  },
  delivery: { pendingCount: 0, outcomeUnknownCount: 0, state: "AVAILABLE" },
  projectionHealth: { deadLetterCount: 0, retryCount: 0, state: "AVAILABLE" },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("support lead summary controller", () => {
  it("does not commit a stale summary after a project switch", async () => {
    let projectId = "project-1";
    const pending = deferred<SupportLeadSummary>();
    const controller = createSupportLeadSummaryController(
      { projectId: () => projectId, canRead: () => true },
      { readSummary: vi.fn().mockReturnValue(pending.promise) },
    );

    const load = controller.load();
    projectId = "project-2";
    pending.resolve(summary);
    await load;

    expect(controller.summary.value).toBeNull();
    expect(controller.error.value).toBe("");
  });

  it("shows a safe error instead of retaining a previous project summary", async () => {
    const controller = createSupportLeadSummaryController(
      { projectId: () => "project-1", canRead: () => true },
      { readSummary: vi.fn().mockRejectedValue(new Error("forbidden")) },
    );

    await controller.load();

    expect(controller.summary.value).toBeNull();
    expect(controller.error.value).toBe(
      "Не удалось загрузить операционный обзор",
    );
  });

  it("aborts the obsolete request and purges the snapshot when access is revoked", async () => {
    let allowed = true;
    const abort = vi.fn();
    const pending = new Promise<SupportLeadSummary>(() => undefined);
    const controller = createSupportLeadSummaryController(
      { projectId: () => "project-1", canRead: () => allowed },
      {
        readSummary: vi.fn((_, signal?: AbortSignal) => {
          signal?.addEventListener("abort", abort, { once: true });
          return pending;
        }),
      },
    );

    void controller.load();
    allowed = false;
    controller.reset();

    expect(abort).toHaveBeenCalledOnce();
    expect(controller.summary.value).toBeNull();
    expect(controller.loading.value).toBe(false);
  });

  it("purges the summary and delegates permission recovery after a 403", async () => {
    const onForbidden = vi.fn();
    const controller = createSupportLeadSummaryController(
      {
        projectId: () => "project-1",
        canRead: () => true,
        onForbidden,
      },
      {
        readSummary: vi.fn().mockRejectedValue(new ApiError(403, "forbidden")),
      },
    );

    await controller.load();

    expect(controller.summary.value).toBeNull();
    expect(controller.error.value).toBe("");
    expect(onForbidden).toHaveBeenCalledOnce();
  });
});
