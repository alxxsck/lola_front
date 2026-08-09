import { beforeEach, describe, expect, it, vi } from "vitest";
import { runLogoutCleanups } from "@/features/auth/logout-cleanup";
import { writeStoredBrowserPushRegistration } from "./browser-push-registration-store";
import {
  runSupportNotificationBrowserLifecycle,
  trackSupportNotificationRegistration,
} from "./support-notification-browser-lifecycle";

const generated = vi.hoisted(() => ({
  list: vi.fn(),
  register: vi.fn(),
  revoke: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock("@/shared/api/generated/retenive-backend", () => ({
  personalBrowserPushListSubscriptions: generated.list,
  personalBrowserPushRegisterSubscription: generated.register,
  personalBrowserPushRevokeSubscription: generated.revoke,
}));

vi.mock("./browser-push-adapter", () => ({
  createBrowserPushAdapter: () => ({ unsubscribe: generated.unsubscribe }),
}));

import { registerSupportNotificationLogoutCleanup } from "./support-notification-logout";

describe("support notification logout cleanup", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    generated.unsubscribe.mockResolvedValue(undefined);
    generated.list.mockResolvedValue({ items: [] });
    generated.register.mockRejectedValue(new Error("registration unavailable"));
  });

  it("revokes the actor-scoped device with the captured logout token and unsubscribes locally", async () => {
    const device = {
      id: "00000000-0000-4000-8000-000000000027",
      userAgentClass: "Chrome · macOS",
      status: "ACTIVE" as const,
      version: 5,
      createdAt: "2026-08-09T10:00:00.000Z",
      lastSeenAt: "2026-08-09T10:00:00.000Z",
      revokedAt: null,
    };
    generated.list.mockResolvedValue({ items: [device] });
    generated.revoke.mockResolvedValue({ ...device, status: "REVOKED", version: 6 });
    writeStoredBrowserPushRegistration("operator-1", {
      deviceId: device.id,
      endpoint: "https://push.example.test/device",
      applicationServerKey: "public-key",
      applicationServerKeyRevision: "revision-1",
    });
    const unregister = registerSupportNotificationLogoutCleanup();

    await runLogoutCleanups("operator-1", "captured-access-token");
    unregister();

    expect(generated.list).toHaveBeenCalledWith(
      expect.objectContaining({ _authTeardownAccessToken: "captured-access-token" }),
    );
    expect(generated.revoke).toHaveBeenCalledWith(
      device.id,
      { expectedVersion: 5 },
      expect.objectContaining({
        _authTeardownAccessToken: "captured-access-token",
        headers: { "Idempotency-Key": expect.any(String) },
      }),
    );
    expect(generated.unsubscribe).toHaveBeenCalledOnce();
    expect(localStorage.getItem("support-browser-push-registration:v2:operator-1")).toBeNull();
  });

  it("waits for an in-flight registration and serializes the final local unsubscribe", async () => {
    const device = {
      id: "00000000-0000-4000-8000-000000000027",
      userAgentClass: "Chrome · macOS",
      status: "ACTIVE" as const,
      version: 5,
      createdAt: "2026-08-09T10:00:00.000Z",
      lastSeenAt: "2026-08-09T10:00:00.000Z",
      revokedAt: null,
    };
    let resolveRegistration!: (value: typeof device) => void;
    let resolveBrowserSubscribe!: () => void;
    const pendingRegistration = trackSupportNotificationRegistration(
      "operator-1",
      {
        endpoint: "https://push.example.test/device",
        p256dh: "p256dh",
        auth: "auth",
        idempotencyKey: "register-1",
      },
      () => new Promise((resolve) => (resolveRegistration = resolve)),
    );
    const pendingBrowserSubscribe = runSupportNotificationBrowserLifecycle(
      () => new Promise<void>((resolve) => (resolveBrowserSubscribe = resolve)),
    );
    generated.list.mockResolvedValue({ items: [] });
    generated.revoke.mockResolvedValue({ ...device, status: "REVOKED", version: 6 });
    const unregister = registerSupportNotificationLogoutCleanup();

    const cleanup = runLogoutCleanups("operator-1", "captured-access-token");
    await Promise.resolve();
    expect(generated.list).not.toHaveBeenCalled();

    resolveRegistration(device);
    await pendingRegistration;
    await vi.waitFor(() => expect(generated.revoke).toHaveBeenCalledOnce());
    expect(generated.unsubscribe).not.toHaveBeenCalled();

    resolveBrowserSubscribe();
    await pendingBrowserSubscribe;
    await cleanup;
    unregister();

    expect(generated.unsubscribe).toHaveBeenCalledOnce();
    expect(localStorage.getItem("support-browser-push-registration:v2:operator-1")).toBeNull();
  });

  it("bounds a never-settling registration and still purges the local subscription", async () => {
    vi.useFakeTimers();
    trackSupportNotificationRegistration(
      "operator-1",
      {
        endpoint: "https://push.example.test/device",
        p256dh: "p256dh",
        auth: "auth",
        idempotencyKey: "register-never-settles",
      },
      () => new Promise(() => undefined),
    );
    writeStoredBrowserPushRegistration("operator-1", {
      deviceId: "00000000-0000-4000-8000-000000000027",
      endpoint: "https://push.example.test/device",
      applicationServerKey: "public-key",
      applicationServerKeyRevision: "revision-1",
    });
    const unregister = registerSupportNotificationLogoutCleanup();

    const cleanup = runLogoutCleanups("operator-1", "captured-access-token");
    await vi.advanceTimersByTimeAsync(1_500);
    await cleanup;
    unregister();
    vi.useRealTimers();

    expect(generated.unsubscribe).toHaveBeenCalledOnce();
    expect(localStorage.getItem("support-browser-push-registration:v2:operator-1")).toBeNull();
  });

  it("does not let a never-settling browser operation block logout", async () => {
    vi.useFakeTimers();
    let resolveBrowserOperation!: () => void;
    const pendingBrowserOperation = runSupportNotificationBrowserLifecycle(
      () => new Promise<void>((resolve) => (resolveBrowserOperation = resolve)),
    );
    writeStoredBrowserPushRegistration("operator-1", {
      deviceId: "00000000-0000-4000-8000-000000000027",
      endpoint: "https://push.example.test/device",
      applicationServerKey: "public-key",
      applicationServerKeyRevision: "revision-1",
    });
    const unregister = registerSupportNotificationLogoutCleanup();

    const cleanup = runLogoutCleanups("operator-1", "captured-access-token");
    await vi.advanceTimersByTimeAsync(1_500);
    await cleanup;

    expect(generated.unsubscribe).not.toHaveBeenCalled();
    expect(localStorage.getItem("support-browser-push-registration:v2:operator-1")).toBeNull();

    resolveBrowserOperation();
    await pendingBrowserOperation;
    vi.useRealTimers();
    await vi.waitFor(() => expect(generated.unsubscribe).toHaveBeenCalledOnce());
    unregister();
  });
});
