import { describe, expect, it, vi } from "vitest";
import type { ProfileProjectionResponseDto } from "@/shared/api/generated/models";
import { ApiError } from "@/shared/api/http/api-error";
import { createSupportUserProfileController } from "./use-support-user-profile";

function profile(endUserId: string): ProfileProjectionResponseDto {
  return {
    endUserId,
    externalUserId: "not-rendered-by-controller",
    profileVersion: "1",
    syncStatus: "VALID",
    fields: [],
    provenance: "PRODUCT_PROFILE",
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("support user profile controller", () => {
  it("does not request or expose a profile without the exact permission", async () => {
    const read = vi.fn();
    const controller = createSupportUserProfileController(
      {
        projectId: () => "project-1",
        endUserId: () => "user-1",
        canRead: () => false,
      },
      { read },
    );

    await controller.load();

    expect(read).not.toHaveBeenCalled();
    expect(controller.profile.value).toBeNull();
  });

  it("does not commit a profile after the selected user changes", async () => {
    let endUserId = "user-1";
    const pending = deferred<ProfileProjectionResponseDto>();
    const controller = createSupportUserProfileController(
      {
        projectId: () => "project-1",
        endUserId: () => endUserId,
        canRead: () => true,
      },
      { read: vi.fn().mockReturnValue(pending.promise) },
    );

    const load = controller.load();
    endUserId = "user-2";
    pending.resolve(profile("user-1"));
    await load;

    expect(controller.profile.value).toBeNull();
    expect(controller.error.value).toBe("");
  });

  it("rejects a projection that belongs to another end user", async () => {
    const controller = createSupportUserProfileController(
      {
        projectId: () => "project-1",
        endUserId: () => "user-1",
        canRead: () => true,
      },
      { read: vi.fn().mockResolvedValue(profile("user-2")) },
    );

    await controller.load();

    expect(controller.profile.value).toBeNull();
    expect(controller.error.value).toBe(
      "Профиль вернул данные другого пользователя",
    );
  });

  it("aborts the profile request and clears sensitive data on reset", async () => {
    const abort = vi.fn();
    const controller = createSupportUserProfileController(
      {
        projectId: () => "project-1",
        endUserId: () => "user-1",
        canRead: () => true,
      },
      {
        read: vi.fn((_, __, signal?: AbortSignal) => {
          signal?.addEventListener("abort", abort, { once: true });
          return new Promise<ProfileProjectionResponseDto>(() => undefined);
        }),
      },
    );

    void controller.load();
    controller.reset();

    expect(abort).toHaveBeenCalledOnce();
    expect(controller.profile.value).toBeNull();
    expect(controller.loading.value).toBe(false);
  });

  it("purges the profile and delegates permission recovery after a 403", async () => {
    const onForbidden = vi.fn();
    const controller = createSupportUserProfileController(
      {
        projectId: () => "project-1",
        endUserId: () => "user-1",
        canRead: () => true,
        onForbidden,
      },
      { read: vi.fn().mockRejectedValue(new ApiError(403, "forbidden")) },
    );

    await controller.load();

    expect(controller.profile.value).toBeNull();
    expect(controller.error.value).toBe("");
    expect(onForbidden).toHaveBeenCalledOnce();
  });
});
