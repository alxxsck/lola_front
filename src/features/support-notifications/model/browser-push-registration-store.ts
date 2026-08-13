export interface StoredBrowserPushRegistration {
  deviceId: string;
  endpoint: string;
  applicationServerKey: string;
  applicationServerKeyRevision: string | null;
  resumeAfterLogin?: boolean;
}

function key(actorId: string): string {
  return `support-browser-push-registration:v2:${actorId}`;
}

export function readStoredBrowserPushRegistration(
  actorId: string | undefined,
): StoredBrowserPushRegistration | null {
  if (!actorId) return null;
  try {
    const raw = localStorage.getItem(key(actorId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StoredBrowserPushRegistration>;
    return typeof value.deviceId === 'string' &&
      typeof value.endpoint === 'string' &&
      typeof value.applicationServerKey === 'string' &&
      (typeof value.applicationServerKeyRevision === 'string' ||
        value.applicationServerKeyRevision === null) &&
      (value.resumeAfterLogin === undefined || typeof value.resumeAfterLogin === 'boolean')
      ? (value as StoredBrowserPushRegistration)
      : null;
  } catch {
    return null;
  }
}

export function markStoredBrowserPushRegistrationForResume(actorId: string | undefined): void {
  const registration = readStoredBrowserPushRegistration(actorId);
  if (!actorId || !registration) return;
  writeStoredBrowserPushRegistration(actorId, {
    ...registration,
    resumeAfterLogin: true,
  });
}

export function writeStoredBrowserPushRegistration(
  actorId: string,
  value: StoredBrowserPushRegistration,
): void {
  try {
    localStorage.setItem(key(actorId), JSON.stringify(value));
  } catch {
    // The server registration remains authoritative when storage is unavailable.
  }
}

export function clearStoredBrowserPushRegistration(actorId: string | undefined): void {
  if (!actorId) return;
  try {
    localStorage.removeItem(key(actorId));
  } catch {
    // Best-effort local cleanup.
  }
}
