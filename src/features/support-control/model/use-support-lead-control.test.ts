import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/http/api-error";
import type {
  SupportLeadActivityPage,
  SupportLeadAdmission,
  SupportLeadCapacityRiskPage,
  SupportLeadDrilldownSource,
  SupportLeadInvestigation,
} from "@/features/support-control/api/support-lead-source";
import { createSupportLeadControlController } from "./use-support-lead-control";

const admission: SupportLeadAdmission = {
  rolloutState: "ENABLED",
  readinessState: "READY",
  evaluatedAt: "2026-08-09T08:00:00.000Z",
  computedAt: "2026-08-09T08:00:00.000Z",
  projectionGeneration: 4,
  rolloutVersion: 2,
  checkpoint: "40",
  sourceHighWater: "40",
  capabilities: {
    summary: "AVAILABLE",
    caseRisks: "AVAILABLE",
    capacityRisks: "AVAILABLE",
    investigation: "AVAILABLE",
    activity: "AVAILABLE",
    realtime: "AVAILABLE",
  },
};

const capacity: SupportLeadCapacityRiskPage = {
  computedAt: "2026-08-09T08:00:00.000Z",
  freshnessState: "READY",
  state: "AVAILABLE",
  items: [],
  nextCursor: null,
};

function investigation(caseId: string): SupportLeadInvestigation {
  return {
    caseId,
    computedAt: "2026-08-09T08:00:00.000Z",
    freshnessState: "READY",
    effectiveWindow: {
      from: "2026-08-08T08:00:00.000Z",
      to: "2026-08-09T08:00:00.000Z",
    },
    evidenceSource: "PROJECTION_WITH_OWNER",
    pinned: {},
    timelineSources: {},
    actionTokens: { caseVersion: 2, caseReadToken: "read", assignmentEtag: null },
    routingFactsState: "AVAILABLE",
    routing: null,
    facts: [],
    nextCursor: null,
  };
}

const activity: SupportLeadActivityPage = {
  computedAt: "2026-08-09T08:00:00.000Z",
  freshnessState: "READY",
  effectiveWindow: {
    from: "2026-08-08T08:00:00.000Z",
    to: "2026-08-09T08:00:00.000Z",
  },
  facts: [],
  nextCursor: null,
};

function setup(overrides: Partial<SupportLeadDrilldownSource> = {}) {
  const source: SupportLeadDrilldownSource = {
    readAdmission: vi.fn().mockResolvedValue(admission),
    readCapacityRisks: vi.fn().mockResolvedValue(capacity),
    readInvestigation: vi.fn().mockImplementation((_, caseId) => investigation(caseId)),
    readActivity: vi.fn().mockResolvedValue(activity),
    ...overrides,
  };
  const context = {
    projectId: vi.fn(() => "project-1" as string | undefined),
    canRead: vi.fn(() => true),
    canReadActivity: vi.fn(() => true),
    onForbidden: vi.fn(),
    onActivityForbidden: vi.fn(),
  };
  return {
    source,
    context,
    controller: createSupportLeadControlController(context, source),
  };
}

describe("createSupportLeadControlController", () => {
  it("uses admission as the first gate and does not read disabled aggregates", async () => {
    const disabled = { ...admission, rolloutState: "DISABLED" as const };
    const { controller, source } = setup({
      readAdmission: vi.fn().mockResolvedValue(disabled),
    });

    await controller.load();

    expect(controller.admission.value?.rolloutState).toBe("DISABLED");
    expect(source.readCapacityRisks).not.toHaveBeenCalled();
  });

  it("purges concealed admission data before notifying the authority owner", async () => {
    const { controller, context } = setup({
      readAdmission: vi.fn().mockRejectedValue(new ApiError(404, "NOT_FOUND", "hidden")),
    });

    await controller.load();

    expect(controller.admission.value).toBeNull();
    expect(controller.capacity.value).toBeNull();
    expect(context.onForbidden).toHaveBeenCalledOnce();
  });

  it("keeps investigation visible when only protected Activity is revoked", async () => {
    const { controller, context } = setup({
      readActivity: vi.fn().mockRejectedValue(new ApiError(403, "FORBIDDEN", "denied")),
    });
    await controller.load();

    await controller.selectCase("case-1");

    expect(controller.investigation.value?.caseId).toBe("case-1");
    expect(controller.activity.value).toBeNull();
    expect(context.onActivityForbidden).toHaveBeenCalledOnce();
    expect(context.onForbidden).not.toHaveBeenCalled();
  });

  it("reuses the exact server window when loading the next investigation page", async () => {
    const first = { ...investigation("case-1"), nextCursor: "cursor-2" };
    const readInvestigation = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce({ ...first, nextCursor: null });
    const { controller } = setup({ readInvestigation });
    await controller.load();
    await controller.selectCase("case-1");

    await controller.loadMoreInvestigation();

    expect(readInvestigation).toHaveBeenLastCalledWith(
      "project-1",
      "case-1",
      {
        cursor: "cursor-2",
        limit: 100,
        from: first.effectiveWindow?.from,
        to: first.effectiveWindow?.to,
      },
      expect.any(AbortSignal),
    );
  });

  it("loads investigation and Activity pages concurrently without cancelling either lane", async () => {
    const firstInvestigation = { ...investigation("case-1"), nextCursor: "investigation-2" };
    const firstActivity = { ...activity, nextCursor: "activity-2" };
    let resolveInvestigation!: (value: SupportLeadInvestigation) => void;
    let resolveActivity!: (value: SupportLeadActivityPage) => void;
    const nextInvestigation = new Promise<SupportLeadInvestigation>((resolve) => {
      resolveInvestigation = resolve;
    });
    const nextActivity = new Promise<SupportLeadActivityPage>((resolve) => {
      resolveActivity = resolve;
    });
    const readInvestigation = vi
      .fn()
      .mockResolvedValueOnce(firstInvestigation)
      .mockReturnValueOnce(nextInvestigation);
    const readActivity = vi
      .fn()
      .mockResolvedValueOnce(firstActivity)
      .mockReturnValueOnce(nextActivity);
    const { controller } = setup({ readInvestigation, readActivity });
    await controller.load();
    await controller.selectCase("case-1");

    const investigationRequest = controller.loadMoreInvestigation();
    const activityRequest = controller.loadMoreActivity();
    expect(controller.loadingInvestigation.value).toBe(true);
    expect(controller.loadingActivity.value).toBe(true);

    resolveActivity({ ...firstActivity, nextCursor: null });
    await activityRequest;
    expect(controller.loadingActivity.value).toBe(false);
    expect(controller.loadingInvestigation.value).toBe(true);

    resolveInvestigation({ ...firstInvestigation, nextCursor: null });
    await investigationRequest;
    expect(controller.loadingInvestigation.value).toBe(false);
    expect(controller.investigation.value?.nextCursor).toBeNull();
    expect(controller.activity.value?.nextCursor).toBeNull();
  });

  it("purges an open Case when a refreshed admission disables investigation", async () => {
    const readAdmission = vi
      .fn()
      .mockResolvedValueOnce(admission)
      .mockResolvedValueOnce({
        ...admission,
        rolloutState: "DISABLED",
        readinessState: "NOT_PROVISIONED",
        capabilities: { ...admission.capabilities, investigation: "UNAVAILABLE" },
      });
    const { controller } = setup({ readAdmission });
    await controller.load();
    await controller.selectCase("case-1");
    expect(controller.investigation.value?.caseId).toBe("case-1");

    await controller.load();

    expect(controller.selectedCaseId.value).toBeNull();
    expect(controller.investigation.value).toBeNull();
    expect(controller.activity.value).toBeNull();
  });

  it("purges Activity without closing the readable investigation", async () => {
    const { controller } = setup();
    await controller.load();
    await controller.selectCase("case-1");

    controller.resetActivity();

    expect(controller.investigation.value?.caseId).toBe("case-1");
    expect(controller.activity.value).toBeNull();
  });
});
