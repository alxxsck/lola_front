import { registerLogoutCleanup } from "@/features/auth/logout-cleanup";
import {
  markStoredBrowserPushRegistrationForResume,
  readStoredBrowserPushRegistration,
} from "@/features/support-notifications/model/browser-push-registration-store";
import {
  quarantineSupportNotificationRegistrations,
} from "@/features/support-notifications/model/support-notification-browser-lifecycle";
import {
  personalBrowserPushListSubscriptions,
  personalBrowserPushRegisterSubscription,
  personalBrowserPushRevokeSubscription,
} from "@/shared/api/generated/retenive-backend";
import { authTeardownRequestOptions } from "@/shared/api/http/axios-instance";

export function registerSupportNotificationLogoutCleanup(): () => void {
  return registerLogoutCleanup(async (actorId, accessToken) => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 1_500);
    try {
      const registrations = await quarantineSupportNotificationRegistrations(
        actorId,
        controller.signal,
      );
      const stored = readStoredBrowserPushRegistration(actorId);
      markStoredBrowserPushRegistrationForResume(actorId);
      const receipts = registrations.flatMap((registration) =>
        registration.receipt ? [registration.receipt] : [],
      );
      for (const registration of registrations) {
        if (registration.receipt || !accessToken || controller.signal.aborted) continue;
        const { idempotencyKey, ...body } = registration.input;
        try {
          receipts.push(
            await personalBrowserPushRegisterSubscription(body, {
              ...authTeardownRequestOptions(accessToken),
              signal: controller.signal,
              headers: { "Idempotency-Key": idempotencyKey },
            }),
          );
        } catch {
          // The bounded device list below is the final best-effort reconciliation.
        }
      }
      const candidates = new Map(
        receipts
          .filter((item) => item.status === "ACTIVE")
          .map((item) => [item.id, item]),
      );
      if (stored && accessToken) {
        const devices = (
          await personalBrowserPushListSubscriptions({
            ...authTeardownRequestOptions(accessToken),
            signal: controller.signal,
          })
        ).items;
        const device = devices.find(
          (item) => item.id === stored.deviceId && item.status === "ACTIVE",
        );
        if (device) candidates.set(device.id, device);
      }
      if (accessToken) {
        for (const device of candidates.values())
          await personalBrowserPushRevokeSubscription(
            device.id,
            { expectedVersion: device.version },
            {
              ...authTeardownRequestOptions(accessToken),
              signal: controller.signal,
              headers: { "Idempotency-Key": crypto.randomUUID() },
            },
          );
      }
    } catch {
      // Logout must continue even if the server cannot confirm cleanup.
    } finally {
      window.clearTimeout(timeout);
    }
  });
}
