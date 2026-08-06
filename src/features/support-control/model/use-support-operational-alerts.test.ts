import { describe, expect, it, vi } from "vitest";
import type {
  SupportOperationalAlertDetail,
  SupportOperationalAlertPage,
} from "@/features/support-control/api/support-lead-source";
import { createSupportOperationalAlertsController } from "./use-support-operational-alerts";

function alertPage(
  ids: string[] = [],
  nextCursor: string | null = null,
): SupportOperationalAlertPage {
  return {
  computedAt: "2026-08-06T10:00:00.000Z",
  materializationState: "READY",
    items: ids.map((id) => ({
      id,
      severity: "HIGH",
      state: "NEW",
      sourceKind: "UNASSIGNED_AGED",
      firstObservedAt: "2026-08-06T09:55:00.000Z",
      lastObservedAt: "2026-08-06T10:00:00.000Z",
      occurrenceCount: 1,
      hasOwner: false,
    })),
    nextCursor,
  };
}

function alertDetail(
  ids: string[] = [],
  nextCursor: string | null = null,
): SupportOperationalAlertDetail {
  return {
    alert: alertPage(["alert-1"]).items[0]!,
    computedAt: "2026-08-06T10:00:00.000Z",
    materializationState: "READY",
    effectiveWindow: {
      from: "2026-08-06T09:00:00.000Z",
      to: "2026-08-06T10:00:00.000Z",
    },
    generation: 1,
    policyRevisionId: "policy-r1",
    nextCursor,
    timeline: ids.map((id) => ({
      id,
      eventKind: "SOURCE_OBSERVED",
      occurredAt: "2026-08-06T10:00:00.000Z",
      actorType: "SYSTEM",
      beforeVersion: null,
      afterVersion: 1,
      generation: 1,
      policyRevisionId: "policy-r1",
      reasonCode: null,
    })),
  };
}

describe("support operational alerts controller", () => {
  it("does not commit list data after the alert permission is revoked", async () => {
    let allowed = true;
    let resolve!: (value: SupportOperationalAlertPage) => void;
    const pending = new Promise<SupportOperationalAlertPage>((done) => {
      resolve = done;
    });
    const controller = createSupportOperationalAlertsController(
      { projectId: () => "project-1", canRead: () => allowed },
      {
        readAlerts: vi.fn().mockReturnValue(pending),
        readAlertDetail: vi.fn(),
      },
    );

    const load = controller.load();
    allowed = false;
    controller.reset();
    resolve(alertPage());
    await load;

    expect(controller.page.value).toBeNull();
    expect(controller.error.value).toBe("");
  });

  it("aborts an open causal timeline and ignores a late response after the pane closes", async () => {
    const abort = vi.fn();
    let resolve!: (value: SupportOperationalAlertDetail) => void;
    const pending = new Promise<SupportOperationalAlertDetail>((done) => {
      resolve = done;
    });
    const controller = createSupportOperationalAlertsController(
      { projectId: () => "project-1", canRead: () => true },
      {
        readAlerts: vi.fn().mockResolvedValue(alertPage()),
        readAlertDetail: vi.fn((_, __, ___, signal?: AbortSignal) => {
          signal?.addEventListener("abort", abort, { once: true });
          return pending;
        }),
      },
    );

    const open = controller.openDetail("alert-1");
    controller.closeDetail();
    resolve(alertDetail());
    await open;

    expect(abort).toHaveBeenCalledOnce();
    expect(controller.detail.value).toBeNull();
  });

  it("appends a server cursor page without duplicating alerts", async () => {
    const readAlerts = vi.fn((_, request?: { cursor?: string }) =>
      Promise.resolve(
        request?.cursor
          ? alertPage(["alert-1", "alert-2"])
          : alertPage(["alert-1"], "cursor-2"),
      ),
    );
    const controller = createSupportOperationalAlertsController(
      { projectId: () => "project-1", canRead: () => true },
      { readAlerts, readAlertDetail: vi.fn() },
    );

    await controller.load();
    await controller.loadMore();

    expect(controller.page.value?.items.map((item) => item.id)).toEqual([
      "alert-1",
      "alert-2",
    ]);
    expect(readAlerts).toHaveBeenLastCalledWith(
      "project-1",
      { cursor: "cursor-2" },
      expect.any(AbortSignal),
    );
  });

  it("appends a causal-history cursor page without duplicating events", async () => {
    const readAlertDetail = vi.fn((_, __, request?: { cursor?: string }) =>
      Promise.resolve(
        request?.cursor
          ? alertDetail(["event-1", "event-2"])
          : alertDetail(["event-1"], "cursor-2"),
      ),
    );
    const controller = createSupportOperationalAlertsController(
      { projectId: () => "project-1", canRead: () => true },
      { readAlerts: vi.fn(), readAlertDetail },
    );

    await controller.openDetail("alert-1");
    await controller.loadMoreDetail();

    expect(controller.detail.value?.timeline.map((event) => event.id)).toEqual([
      "event-1",
      "event-2",
    ]);
    expect(readAlertDetail).toHaveBeenLastCalledWith(
      "project-1",
      "alert-1",
      { cursor: "cursor-2" },
      expect.any(AbortSignal),
    );
  });
});
