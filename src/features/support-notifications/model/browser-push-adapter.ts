import { dataMode } from "@/shared/config/data-mode";
import type { BrowserSubscriptionMaterial } from "@/features/support-notifications/api/support-notifications-source";

export type BrowserNotificationPermission =
  | "UNSUPPORTED"
  | "DEFAULT"
  | "DENIED"
  | "GRANTED";

export interface BrowserPushState {
  permission: BrowserNotificationPermission;
  locallySubscribed: boolean;
  requiresInstalledApp: boolean;
  endpoint: string | null;
  applicationServerKey: string | null;
  permissionRecoveryPath?: string | null;
  unsupportedMessage?: string | null;
}

export interface BrowserPushAdapter {
  state(): Promise<BrowserPushState>;
  subscribe(applicationServerKey: string): Promise<BrowserSubscriptionMaterial>;
  unsubscribe(): Promise<void>;
  onSubscriptionChange?(handler: () => void): () => void;
}

const registrationPath = "/support-push-sw.js";

function isIos(): boolean {
  return /iPad|iPhone|iPod/u.test(navigator.userAgent) ||
    (/Macintosh/u.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function permission(): BrowserNotificationPermission {
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window))
    return "UNSUPPORTED";
  return Notification.permission === "granted"
    ? "GRANTED"
    : Notification.permission === "denied"
      ? "DENIED"
      : "DEFAULT";
}

function permissionRecoveryPath(): string {
  if (isIos())
    return "iOS/iPadOS: «Настройки» → «Уведомления» → Retenive CMS → «Разрешить уведомления».";
  if (/Firefox/u.test(navigator.userAgent))
    return "Firefox: значок разрешений слева от адреса → «Уведомления» → «Разрешить».";
  if (/Safari/u.test(navigator.userAgent) && !/Chrome|Chromium|CriOS|Edg/u.test(navigator.userAgent))
    return "Safari: «Настройки» → «Веб-сайты» → «Уведомления» → Retenive CMS → «Разрешить».";
  return "Chrome/Edge: значок настроек сайта слева от адреса → «Уведомления» → «Разрешить».";
}

function unsupportedMessage(): string {
  if (isIos())
    return "На iOS/iPadOS обновите систему до версии с веб-уведомлениями и откройте установленный Retenive CMS с экрана «Домой».";
  return "Этот браузер или режим не поддерживает веб-уведомления. Обновите браузер или откройте Retenive CMS в актуальном Chrome, Edge, Firefox или Safari.";
}

function base64Url(bytes: ArrayBuffer): string {
  const value = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(value).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/gu, "");
}

function applicationServerKey(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/gu, "+").replace(/_/gu, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export const webBrowserPushAdapter: BrowserPushAdapter = {
  async state() {
    const current = permission();
    if (current === "UNSUPPORTED") {
      return {
        permission: current,
        locallySubscribed: false,
        requiresInstalledApp: isIos() && !isStandalone(),
        endpoint: null,
        applicationServerKey: null,
        permissionRecoveryPath: null,
        unsupportedMessage: unsupportedMessage(),
      };
    }
    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager.getSubscription();
    return {
      permission: current,
      locallySubscribed: Boolean(subscription),
      requiresInstalledApp: isIos() && !isStandalone(),
      endpoint: subscription?.endpoint ?? null,
      applicationServerKey: subscription?.options.applicationServerKey
        ? base64Url(subscription.options.applicationServerKey)
        : null,
      permissionRecoveryPath: current === "DENIED" ? permissionRecoveryPath() : null,
      unsupportedMessage: null,
    };
  },
  async subscribe(publicKey) {
    if (permission() === "UNSUPPORTED") throw new Error("BROWSER_PUSH_UNSUPPORTED");
    if (isIos() && !isStandalone()) throw new Error("BROWSER_PUSH_INSTALL_REQUIRED");
    const nextPermission =
      Notification.permission === "default"
        ? await Notification.requestPermission()
        : Notification.permission;
    if (nextPermission !== "granted") throw new Error("BROWSER_PUSH_PERMISSION_DENIED");
    const registration = await navigator.serviceWorker.register(registrationPath, { scope: "/" });
    await navigator.serviceWorker.ready;
    let existing = await registration.pushManager.getSubscription();
    if (
      existing?.options.applicationServerKey &&
      base64Url(existing.options.applicationServerKey) !== publicKey
    ) {
      await existing.unsubscribe();
      existing = null;
    }
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey(publicKey),
      }));
    const key = subscription.getKey("p256dh");
    const auth = subscription.getKey("auth");
    if (!key || !auth) throw new Error("BROWSER_PUSH_KEYS_UNAVAILABLE");
    return { endpoint: subscription.endpoint, p256dh: base64Url(key), auth: base64Url(auth) };
  },
  async unsubscribe() {
    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager.getSubscription();
    await subscription?.unsubscribe();
  },
  onSubscriptionChange(handler) {
    const listener = (event: MessageEvent) => {
      if (event.data?.type === "RETENIVE_SUPPORT_PUSH_SUBSCRIPTION_CHANGED") handler();
    };
    navigator.serviceWorker.addEventListener("message", listener);
    return () => navigator.serviceWorker.removeEventListener("message", listener);
  },
};

interface MockBrowserPushState {
  granted: boolean;
  subscribed: boolean;
  endpoint: string | null;
  applicationServerKey: string | null;
}

const mockStateKey = "support-browser-push-mock:v1";
let mockState: MockBrowserPushState = {
  granted: false,
  subscribed: false,
  endpoint: null,
  applicationServerKey: null,
};

function readMockState(): MockBrowserPushState {
  try {
    const raw = sessionStorage.getItem(mockStateKey);
    if (!raw) return mockState;
    const value = JSON.parse(raw) as Partial<MockBrowserPushState>;
    if (
      typeof value.granted === "boolean" &&
      typeof value.subscribed === "boolean" &&
      (typeof value.endpoint === "string" || value.endpoint === null) &&
      (typeof value.applicationServerKey === "string" || value.applicationServerKey === null)
    )
      mockState = value as MockBrowserPushState;
  } catch {
    // In-memory mock state remains usable when session storage is unavailable.
  }
  return mockState;
}

function writeMockState(value: MockBrowserPushState): void {
  mockState = value;
  try {
    sessionStorage.setItem(mockStateKey, JSON.stringify(value));
  } catch {
    // In-memory mock state remains usable when session storage is unavailable.
  }
}

const mockAdapter: BrowserPushAdapter = {
  async state() {
    const current = readMockState();
    return {
      permission: current.granted ? "GRANTED" : "DEFAULT",
      locallySubscribed: current.subscribed,
      requiresInstalledApp: false,
      endpoint: current.subscribed ? current.endpoint : null,
      applicationServerKey: current.subscribed ? current.applicationServerKey : null,
    };
  },
  async subscribe(publicKey) {
    const endpoint = `https://push.example.test/${crypto.randomUUID()}`;
    writeMockState({
      granted: true,
      subscribed: true,
      endpoint,
      applicationServerKey: publicKey,
    });
    return {
      endpoint,
      p256dh: "mock-p256dh-key-material",
      auth: "mock-auth-material",
    };
  },
  async unsubscribe() {
    const current = readMockState();
    writeMockState({
      ...current,
      subscribed: false,
      endpoint: null,
      applicationServerKey: null,
    });
  },
  onSubscriptionChange() {
    return () => undefined;
  },
};

export function createBrowserPushAdapter(): BrowserPushAdapter {
  return dataMode === "mock" ? mockAdapter : webBrowserPushAdapter;
}
