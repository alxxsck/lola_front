import type { BrowserPushSubscriptionResponseDto } from '@/shared/api/generated/models';

export interface TrackedSupportNotificationRegistrationInput {
  endpoint: string;
  p256dh: string;
  auth: string;
  expectedVersion?: number;
  idempotencyKey: string;
}

export interface QuarantinedSupportNotificationRegistration {
  input: TrackedSupportNotificationRegistrationInput;
  receipt: BrowserPushSubscriptionResponseDto | null;
}

interface TrackedRegistration {
  actorId: string;
  input: TrackedSupportNotificationRegistrationInput;
  controller: AbortController;
  promise: Promise<BrowserPushSubscriptionResponseDto>;
  receipt: BrowserPushSubscriptionResponseDto | null;
  settled: boolean;
}

let browserLifecycle: Promise<void> = Promise.resolve();
const registrations = new Map<string, TrackedRegistration>();

function registrationKey(actorId: string, idempotencyKey: string): string {
  return `${actorId}\u0000${idempotencyKey}`;
}

export function runSupportNotificationBrowserLifecycle<T>(operation: () => Promise<T>): Promise<T> {
  const result = browserLifecycle.then(operation);
  browserLifecycle = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export async function runSupportNotificationBrowserLifecycleUntil(
  operation: () => Promise<unknown>,
  signal: AbortSignal,
): Promise<void> {
  const settled = runSupportNotificationBrowserLifecycle(operation).then(
    () => undefined,
    () => undefined,
  );
  if (signal.aborted) return;
  await Promise.race([
    settled,
    new Promise<void>((resolve) =>
      signal.addEventListener('abort', () => resolve(), { once: true }),
    ),
  ]);
}

export function trackSupportNotificationRegistration(
  actorId: string,
  input: TrackedSupportNotificationRegistrationInput,
  operation: (signal: AbortSignal) => Promise<BrowserPushSubscriptionResponseDto>,
): Promise<BrowserPushSubscriptionResponseDto> {
  const key = registrationKey(actorId, input.idempotencyKey);
  const existing = registrations.get(key);
  if (existing && (!existing.settled || existing.receipt)) return existing.promise;
  const tracked = existing ?? ({ actorId, input } as TrackedRegistration);
  tracked.input = input;
  tracked.controller = new AbortController();
  tracked.receipt = null;
  tracked.settled = false;
  tracked.promise = operation(tracked.controller.signal).then(
    (receipt) => {
      tracked.receipt = receipt;
      tracked.settled = true;
      return receipt;
    },
    (cause: unknown) => {
      tracked.settled = true;
      throw cause;
    },
  );
  if (!existing) registrations.set(key, tracked);
  return tracked.promise;
}

export function releaseSupportNotificationRegistration(
  actorId: string,
  idempotencyKey: string,
): void {
  registrations.delete(registrationKey(actorId, idempotencyKey));
}

export async function quarantineSupportNotificationRegistrations(
  actorId: string | undefined,
  signal: AbortSignal,
): Promise<QuarantinedSupportNotificationRegistration[]> {
  if (!actorId) return [];
  const tracked = [...registrations.entries()].filter(([, item]) => item.actorId === actorId);
  tracked.forEach(([, item]) => item.controller.abort());
  const settled = Promise.allSettled(tracked.map(([, item]) => item.promise));
  if (!signal.aborted) {
    await Promise.race([
      settled,
      new Promise<void>((resolve) =>
        signal.addEventListener('abort', () => resolve(), { once: true }),
      ),
    ]);
  }
  tracked.forEach(([key]) => registrations.delete(key));
  return tracked.map(([, item]) => ({ input: item.input, receipt: item.receipt }));
}
