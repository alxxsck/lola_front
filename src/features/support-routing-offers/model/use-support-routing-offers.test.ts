import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/http/api-error";
import type {
  SupportRoutingOffer,
  SupportRoutingOfferAction,
  SupportRoutingOfferSource,
} from "@/features/support-routing-offers/api/support-routing-offer-source";
import { createSupportRoutingOffersController } from "./use-support-routing-offers";

function offer(
  overrides: Partial<SupportRoutingOffer> = {},
): SupportRoutingOffer {
  return {
    assignmentId: "assignment-1",
    caseId: "case-1",
    assignmentVersion: 3,
    actionEtag: '"so1.current.signature"',
    offerToken: "private-offer-token",
    expiresAt: "2026-08-06T10:15:00.000Z",
    ...overrides,
  };
}

function source(
  overrides: Partial<SupportRoutingOfferSource> = {},
): SupportRoutingOfferSource {
  return {
    list: vi.fn().mockResolvedValue([offer()]),
    act: vi.fn().mockResolvedValue({
      assignmentId: "assignment-1",
      assignmentVersion: 4,
      assignmentRootVersion: 5,
      caseVersion: 8,
      outcome: "ACCEPTED",
    }),
    ...overrides,
  };
}

describe("support routing offers controller", () => {
  it("does not commit an in-flight offer response after its authority is revoked", async () => {
    let allowed = true;
    let resolveList: ((value: SupportRoutingOffer[]) => void) | undefined;
    const controller = createSupportRoutingOffersController(
      {
        projectId: () => "project-1",
        canManage: () => allowed,
      },
      source({
        list: vi.fn(
          () =>
            new Promise<SupportRoutingOffer[]>((resolve) => {
              resolveList = resolve;
            }),
        ),
      }),
    );

    const loading = controller.load();
    allowed = false;
    resolveList?.([offer()]);
    await loading;

    expect(controller.offers.value).toEqual([]);
  });

  it("replays an unknown outcome with the identical operator-bound action intent", async () => {
    const act = vi
      .fn()
      .mockRejectedValueOnce(new Error("connection lost"))
      .mockResolvedValueOnce({
        assignmentId: "assignment-1",
        assignmentVersion: 4,
        assignmentRootVersion: 5,
        caseVersion: 8,
        outcome: "ACCEPTED",
      });
    const controller = createSupportRoutingOffersController(
      {
        projectId: () => "project-1",
        canManage: () => true,
        createIdempotencyKey: () => "offer-action-1",
      },
      source({
        list: vi.fn().mockResolvedValueOnce([offer()]).mockResolvedValueOnce([]),
        act,
      }),
    );

    await controller.load();
    await controller.act("assignment-1", "ACCEPT");
    await controller.retryUnknownOutcome();

    expect(act).toHaveBeenCalledTimes(2);
    expect(act.mock.calls[0]?.slice(0, 2)).toEqual([
      "project-1",
      {
        offer: offer(),
        kind: "ACCEPT",
        idempotencyKey: "offer-action-1",
      } satisfies SupportRoutingOfferAction,
    ]);
    expect(act.mock.calls[1]?.[1]).toEqual(act.mock.calls[0]?.[1]);
    expect(controller.offers.value).toEqual([]);
    expect(controller.unknownOutcome.value).toBe(false);
  });

  it("purges private offers and refreshes authority after a concealed denial", async () => {
    const onForbidden = vi.fn();
    const controller = createSupportRoutingOffersController(
      {
        projectId: () => "project-1",
        canManage: () => true,
        onForbidden,
      },
      source({ list: vi.fn().mockRejectedValue(new ApiError(404, "hidden")) }),
    );

    await controller.load();

    expect(controller.offers.value).toEqual([]);
    expect(controller.error.value).toBe("");
    expect(onForbidden).toHaveBeenCalledOnce();
  });

  it("reconciles a stale offer instead of treating its outcome as unknown", async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce([offer()])
      .mockResolvedValueOnce([]);
    const controller = createSupportRoutingOffersController(
      {
        projectId: () => "project-1",
        canManage: () => true,
        createIdempotencyKey: () => "offer-action-1",
      },
      source({ list, act: vi.fn().mockRejectedValue(new ApiError(409, "stale")) }),
    );

    await controller.load();
    await controller.act("assignment-1", "DECLINE");

    expect(list).toHaveBeenCalledTimes(2);
    expect(controller.offers.value).toEqual([]);
    expect(controller.unknownOutcome.value).toBe(false);
    expect(controller.error.value).toContain("Предложение уже изменилось");
  });

  it("reconciles a stale private capability instead of permanently removing own-offer access", async () => {
    const onForbidden = vi.fn();
    const refreshedOffer = offer({
      assignmentVersion: 4,
      actionEtag: '"so1.next.signature"',
      offerToken: "next-private-offer-token",
    });
    const controller = createSupportRoutingOffersController(
      {
        projectId: () => "project-1",
        canManage: () => true,
        onForbidden,
        createIdempotencyKey: () => "offer-action-1",
      },
      source({
        list: vi
          .fn()
          .mockResolvedValueOnce([offer()])
          .mockResolvedValueOnce([refreshedOffer]),
        act: vi.fn().mockRejectedValue(new ApiError(404, "stale offer")),
      }),
    );

    await controller.load();
    await controller.act("assignment-1", "ACCEPT");

    expect(controller.offers.value).toEqual([refreshedOffer]);
    expect(controller.unknownOutcome.value).toBe(false);
    expect(controller.error.value).toContain("Предложение больше не актуально");
    expect(onForbidden).not.toHaveBeenCalled();
  });

  it("keeps a confirmed action known when refreshing the surrounding workspace fails", async () => {
    const onChanged = vi.fn().mockRejectedValue(new Error("context unavailable"));
    const controller = createSupportRoutingOffersController(
      {
        projectId: () => "project-1",
        canManage: () => true,
        onChanged,
        createIdempotencyKey: () => "offer-action-1",
      },
      source({
        list: vi.fn().mockResolvedValueOnce([offer()]).mockResolvedValueOnce([]),
      }),
    );

    await controller.load();
    await controller.act("assignment-1", "ACCEPT");

    expect(controller.offers.value).toEqual([]);
    expect(controller.lastOutcome.value).toBe("ACCEPT");
    expect(controller.unknownOutcome.value).toBe(false);
    expect(controller.canRetry.value).toBe(false);
    expect(controller.error.value).toContain("Действие уже выполнено");
  });

  it("does not submit an action while an authoritative own-offer refresh is in flight", async () => {
    let resolveRefresh: ((value: SupportRoutingOffer[]) => void) | undefined;
    const act = vi.fn();
    const list = vi
      .fn()
      .mockResolvedValueOnce([offer()])
      .mockImplementationOnce(
        () =>
          new Promise<SupportRoutingOffer[]>((resolve) => {
            resolveRefresh = resolve;
          }),
      );
    const controller = createSupportRoutingOffersController(
      {
        projectId: () => "project-1",
        canManage: () => true,
      },
      source({ list, act }),
    );

    await controller.load();
    const refresh = controller.load();
    await controller.act("assignment-1", "DECLINE");
    resolveRefresh?.([offer()]);
    await refresh;

    expect(act).not.toHaveBeenCalled();
    expect(controller.offers.value).toEqual([offer()]);
  });

  it("does not submit another action while a private intent awaits reconciliation", async () => {
    const act = vi.fn().mockRejectedValue(new Error("connection lost"));
    const controller = createSupportRoutingOffersController(
      {
        projectId: () => "project-1",
        canManage: () => true,
        createIdempotencyKey: () => "offer-action-1",
      },
      source({ act }),
    );

    await controller.load();
    await controller.act("assignment-1", "ACCEPT");
    await controller.act("assignment-1", "DECLINE");

    expect(act).toHaveBeenCalledOnce();
    expect(controller.canRetry.value).toBe(true);
  });
});
