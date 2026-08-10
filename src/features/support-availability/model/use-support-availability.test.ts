import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/http/api-error";
import type {
  SupportAvailabilitySnapshot,
  SupportAvailabilitySource,
} from "@/features/support-availability/api/support-availability-source";
import { createSupportAvailabilityController } from "./use-support-availability";

function snapshot(
  overrides: Partial<SupportAvailabilitySnapshot> = {},
): SupportAvailabilitySnapshot {
  return {
    operatorId: "operator-1",
    projectId: "project-1",
    declaredState: "AVAILABLE",
    effectiveState: "AVAILABLE",
    acceptsNewWork: true,
    effectiveUntil: null,
    leaseRenewedAt: "2026-08-06T10:00:00.000Z",
    leaseUntil: null,
    reasonCode: "SHIFT_START",
    source: "SELF",
    transitionedAt: "2026-08-06T10:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

function source(
  overrides: Partial<SupportAvailabilitySource> = {},
): SupportAvailabilitySource {
  return {
    read: vi.fn().mockResolvedValue(snapshot()),
    renewOwn: vi.fn().mockResolvedValue(snapshot()),
    setOwn: vi.fn().mockResolvedValue(snapshot({ version: 2 })),
    ...overrides,
  };
}

describe("support availability controller", () => {
  it("renews an active lease immediately and periodically while the workspace is active", async () => {
    vi.useFakeTimers();
    const renewOwn = vi.fn().mockResolvedValue(
      snapshot({
        leaseRenewedAt: "2026-08-06T10:00:45.000Z",
        leaseUntil: "2026-08-06T10:02:45.000Z",
      }),
    );
    const controller = createSupportAvailabilityController(
      {
        projectId: () => "project-1",
        operatorId: () => "operator-1",
        canRead: () => true,
        canManage: () => true,
      },
      source({ renewOwn }),
    );

    await controller.load();
    controller.startHeartbeat();
    await vi.waitFor(() => expect(renewOwn).toHaveBeenCalledTimes(1));
    expect(renewOwn).toHaveBeenLastCalledWith(
      "project-1",
      "operator-1",
      1,
      expect.any(AbortSignal),
    );

    await vi.advanceTimersByTimeAsync(45_000);
    expect(renewOwn).toHaveBeenCalledTimes(2);

    controller.reset();
    await vi.advanceTimersByTimeAsync(45_000);
    expect(renewOwn).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("restores a manually declared AVAILABLE state after a legacy lease expiry", async () => {
    const renewOwn = vi.fn().mockResolvedValue(snapshot({ version: 3 }));
    const controller = createSupportAvailabilityController(
      {
        projectId: () => "project-1",
        operatorId: () => "operator-1",
        canRead: () => true,
        canManage: () => true,
      },
      source({
        read: vi.fn().mockResolvedValue(
          snapshot({
            declaredState: "AVAILABLE",
            effectiveState: "OFFLINE",
            acceptsNewWork: false,
            leaseRenewedAt: null,
            leaseUntil: null,
            reasonCode: "LEASE_EXPIRED",
            source: "LEASE_EXPIRY",
            version: 2,
          }),
        ),
        renewOwn,
      }),
    );

    await controller.load();
    controller.startHeartbeat();
    await vi.waitFor(() => expect(renewOwn).toHaveBeenCalledOnce());

    expect(controller.availability.value?.effectiveState).toBe("AVAILABLE");
  });

  it("does not commit an availability snapshot for another operator", async () => {
    const controller = createSupportAvailabilityController(
      {
        projectId: () => "project-1",
        operatorId: () => "operator-1",
        canRead: () => true,
        canManage: () => true,
      },
      source({
        read: vi.fn().mockResolvedValue(snapshot({ operatorId: "operator-2" })),
      }),
    );

    await controller.load();

    expect(controller.availability.value).toBeNull();
    expect(controller.error.value).toBe(
      "Статус доступности вернул данные другого сотрудника",
    );
  });

  it("aborts an in-flight read and purges the snapshot on access revoke", () => {
    const abort = vi.fn();
    const controller = createSupportAvailabilityController(
      {
        projectId: () => "project-1",
        operatorId: () => "operator-1",
        canRead: () => true,
        canManage: () => true,
      },
      source({
        read: vi.fn((_, __, signal?: AbortSignal) => {
          signal?.addEventListener("abort", abort, { once: true });
          return new Promise<SupportAvailabilitySnapshot>(() => undefined);
        }),
      }),
    );

    void controller.load();
    controller.reset();

    expect(abort).toHaveBeenCalledOnce();
    expect(controller.availability.value).toBeNull();
  });

  it("replays an unknown outcome with the exact same idempotency intent", async () => {
    const setOwn = vi
      .fn()
      .mockRejectedValueOnce(new Error("network lost"))
      .mockResolvedValueOnce(
        snapshot({
          declaredState: "BUSY",
          effectiveState: "BUSY",
          acceptsNewWork: false,
          version: 2,
        }),
      );
    const controller = createSupportAvailabilityController(
      {
        projectId: () => "project-1",
        operatorId: () => "operator-1",
        canRead: () => true,
        canManage: () => true,
        createIdempotencyKey: () => "availability-intent-1",
      },
      source({ setOwn }),
    );

    await controller.load();
    await controller.change({ state: "BUSY", reasonCode: "FOCUS" });

    expect(controller.error.value).toBe(
      "Не удалось подтвердить изменение статуса. Попробуйте сохранить ещё раз — дублирования не будет.",
    );
    expect(controller.error.value).not.toMatch(/idempotent|intent/iu);

    await controller.retryUnknownOutcome();

    expect(setOwn).toHaveBeenCalledTimes(2);
    expect(setOwn.mock.calls[0]?.slice(0, 3)).toEqual([
      "project-1",
      "operator-1",
      {
        state: "BUSY",
        reasonCode: "FOCUS",
        expectedVersion: 1,
        idempotencyKey: "availability-intent-1",
      },
    ]);
    expect(setOwn.mock.calls[1]?.[2]).toEqual(setOwn.mock.calls[0]?.[2]);
    expect(controller.availability.value?.effectiveState).toBe("BUSY");
    expect(controller.unknownOutcome.value).toBe(false);
  });

  it("purges the local availability snapshot after a forbidden mutation", async () => {
    const onForbidden = vi.fn();
    const controller = createSupportAvailabilityController(
      {
        projectId: () => "project-1",
        operatorId: () => "operator-1",
        canRead: () => true,
        canManage: () => true,
        onForbidden,
        createIdempotencyKey: () => "availability-intent-1",
      },
      source({
        setOwn: vi.fn().mockRejectedValue(new ApiError(403, "forbidden")),
      }),
    );

    await controller.load();
    await controller.change({ state: "OFFLINE", reasonCode: "SHIFT_END" });

    expect(controller.availability.value).toBeNull();
    expect(controller.error.value).toBe("");
    expect(onForbidden).toHaveBeenCalledOnce();
  });

  it("keeps a rejected validation draft editable instead of marking its outcome unknown", async () => {
    const controller = createSupportAvailabilityController(
      {
        projectId: () => "project-1",
        operatorId: () => "operator-1",
        canRead: () => true,
        canManage: () => true,
        createIdempotencyKey: () => "availability-intent-1",
      },
      source({
        setOwn: vi.fn().mockRejectedValue(new ApiError(400, "invalid")),
      }),
    );

    await controller.load();
    await controller.change({
      state: "AWAY",
      reasonCode: "BREAK",
      hardDurationSeconds: 900,
    });

    expect(controller.unknownOutcome.value).toBe(false);
    expect(controller.needsReconcile.value).toBe(false);
    expect(controller.draft.value).toEqual({
      state: "AWAY",
      reasonCode: "BREAK",
      hardDurationSeconds: 900,
    });
    expect(controller.error.value).toContain("Проверьте статус");
  });

  it("does not submit a state-incompatible self reason", async () => {
    const setOwn = vi.fn();
    const controller = createSupportAvailabilityController(
      {
        projectId: () => "project-1",
        operatorId: () => "operator-1",
        canRead: () => true,
        canManage: () => true,
        createIdempotencyKey: () => "availability-intent-1",
      },
      source({ setOwn }),
    );

    await controller.load();
    await controller.change({ state: "BUSY", reasonCode: "LEAD_INTERVENTION" });

    expect(setOwn).not.toHaveBeenCalled();
    expect(controller.error.value).toContain("Проверьте статус");
  });

  it("keeps the draft on a conflict and retries it only after a fresh version", async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce(snapshot())
      .mockResolvedValueOnce(
        snapshot({ version: 2, declaredState: "BUSY", effectiveState: "BUSY" }),
      );
    const createIdempotencyKey = vi
      .fn()
      .mockReturnValueOnce("availability-intent-1")
      .mockReturnValueOnce("availability-intent-2");
    const setOwn = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(409, "conflict"))
      .mockResolvedValueOnce(
        snapshot({
          version: 3,
          declaredState: "AWAY",
          effectiveState: "AWAY",
          acceptsNewWork: false,
        }),
      );
    const controller = createSupportAvailabilityController(
      {
        projectId: () => "project-1",
        operatorId: () => "operator-1",
        canRead: () => true,
        canManage: () => true,
        createIdempotencyKey,
      },
      source({ read, setOwn }),
    );

    await controller.load();
    await controller.change({
      state: "AWAY",
      reasonCode: "BREAK",
      reasonNote: "Перерыв",
      hardDurationSeconds: 900,
    });
    await controller.retryAfterReconcile();
    expect(setOwn).toHaveBeenCalledTimes(1);

    await controller.load();
    expect(controller.canRetryAfterReconcile.value).toBe(true);
    await controller.retryAfterReconcile();

    expect(setOwn).toHaveBeenCalledTimes(2);
    expect(setOwn.mock.calls[1]?.[2]).toEqual({
      state: "AWAY",
      reasonCode: "BREAK",
      reasonNote: "Перерыв",
      hardDurationSeconds: 900,
      expectedVersion: 2,
      idempotencyKey: "availability-intent-2",
    });
    expect(controller.draft.value).toBeNull();
  });

  it("purges a cached snapshot after concealed target loss", async () => {
    const onForbidden = vi.fn();
    const read = vi
      .fn()
      .mockResolvedValueOnce(snapshot())
      .mockRejectedValueOnce(new ApiError(404, "NOT_FOUND_OR_FORBIDDEN"));
    const controller = createSupportAvailabilityController(
      {
        projectId: () => "project-1",
        operatorId: () => "operator-1",
        canRead: () => true,
        canManage: () => true,
        onForbidden,
      },
      source({ read }),
    );

    await controller.load();
    await controller.load();

    expect(controller.availability.value).toBeNull();
    expect(onForbidden).toHaveBeenCalledOnce();
  });
});
