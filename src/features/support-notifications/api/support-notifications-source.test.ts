import { beforeEach, describe, expect, it, vi } from "vitest";

const generated = vi.hoisted(() => ({
  readAdmission: vi.fn(),
  readPreferences: vi.fn(),
  updatePreference: vi.fn(),
  listSubscriptions: vi.fn(),
  registerSubscription: vi.fn(),
  revokeSubscription: vi.fn(),
  resolveDeepLink: vi.fn(),
}));

vi.mock("@/shared/api/generated/retenive-backend", () => ({
  personalSupportNotificationReadAdmission: generated.readAdmission,
  personalSupportNotificationReadPreferences: generated.readPreferences,
  personalSupportNotificationUpdatePreference: generated.updatePreference,
  personalBrowserPushListSubscriptions: generated.listSubscriptions,
  personalBrowserPushRegisterSubscription: generated.registerSubscription,
  personalBrowserPushRevokeSubscription: generated.revokeSubscription,
  personalSupportNotificationResolveDeepLink: generated.resolveDeepLink,
}));

import { apiSupportNotificationsSource } from "./support-notifications-source";

describe("apiSupportNotificationsSource", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends OCC and idempotency for preference updates", async () => {
    generated.updatePreference.mockResolvedValue({ items: [] });

    await apiSupportNotificationsSource.updatePreference("project-1", {
      topic: "SUPPORT_CASE_ATTENTION",
      subscribed: true,
      expectedVersion: 3,
      idempotencyKey: "preference-command-1",
    });

    expect(generated.updatePreference).toHaveBeenCalledWith(
      "project-1",
      {
        topic: "SUPPORT_CASE_ATTENTION",
        subscribed: true,
        expectedVersion: 3,
      },
      { signal: undefined, headers: { "Idempotency-Key": "preference-command-1" } },
    );
  });

  it("keeps Push secrets write-only and sends versioned revoke", async () => {
    generated.registerSubscription.mockResolvedValue({ id: "device-1" });
    generated.revokeSubscription.mockResolvedValue({ id: "device-1" });

    await apiSupportNotificationsSource.registerDevice({
      endpoint: "https://push.example.test/device",
      p256dh: "p256dh-material",
      auth: "auth-material",
      idempotencyKey: "register-command-1",
    });
    await apiSupportNotificationsSource.revokeDevice(
      { id: "device-1", version: 4 },
      "revoke-command-1",
    );

    expect(generated.registerSubscription).toHaveBeenCalledWith(
      {
        endpoint: "https://push.example.test/device",
        p256dh: "p256dh-material",
        auth: "auth-material",
      },
      { signal: undefined, headers: { "Idempotency-Key": "register-command-1" } },
    );
    expect(generated.revokeSubscription).toHaveBeenCalledWith(
      "device-1",
      { expectedVersion: 4 },
      { signal: undefined, headers: { "Idempotency-Key": "revoke-command-1" } },
    );
  });
});
