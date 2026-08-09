import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { webBrowserPushAdapter } from "./browser-push-adapter";

function subscription(endpoint: string, serverKey: Uint8Array) {
  return {
    endpoint,
    options: { applicationServerKey: serverKey.buffer },
    getKey: (name: string) =>
      name === "p256dh" ? new Uint8Array([1, 2, 3]).buffer : new Uint8Array([4, 5, 6]).buffer,
    unsubscribe: vi.fn().mockResolvedValue(true),
  };
}

describe("webBrowserPushAdapter", () => {
  const originalUserAgent = navigator.userAgent;
  const originalTouchPoints = navigator.maxTouchPoints;

  beforeEach(() => {
    vi.stubGlobal("PushManager", class PushManager {});
    vi.stubGlobal("Notification", { permission: "default", requestPermission: vi.fn() });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({ matches: false })),
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, "userAgent", { configurable: true, value: originalUserAgent });
    Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: originalTouchPoints });
    vi.unstubAllGlobals();
  });

  it.each(["default", "denied", "granted"])(
    "reports the browser permission state %s without requesting it",
    async (permission) => {
      vi.stubGlobal("Notification", { permission, requestPermission: vi.fn() });
      Object.defineProperty(navigator, "serviceWorker", {
        configurable: true,
        value: { getRegistration: vi.fn().mockResolvedValue(undefined) },
      });

      const state = await webBrowserPushAdapter.state();

      expect(state.permission).toBe(permission.toUpperCase());
      expect(Notification.requestPermission).not.toHaveBeenCalled();
    },
  );

  it("detects desktop-mode iPadOS and requires an installed Home Screen app", async () => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)",
    });
    Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: 5 });
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { getRegistration: vi.fn().mockResolvedValue(undefined) },
    });

    const state = await webBrowserPushAdapter.state();

    expect(state.requiresInstalledApp).toBe(true);
  });

  it("does not ask an already installed iPadOS app to be installed again when Push is unsupported", async () => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)",
    });
    Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: 5 });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({ matches: true })),
    });
    Reflect.deleteProperty(window, "PushManager");

    const state = await webBrowserPushAdapter.state();

    expect(state.permission).toBe("UNSUPPORTED");
    expect(state.requiresInstalledApp).toBe(false);
    expect(state.unsupportedMessage).toContain("обновите систему");
  });

  it("returns a browser-specific recovery path when permission is denied", async () => {
    vi.stubGlobal("Notification", { permission: "denied", requestPermission: vi.fn() });
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36",
    });
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { getRegistration: vi.fn().mockResolvedValue(undefined) },
    });

    const state = await webBrowserPushAdapter.state();

    expect(state.permission).toBe("DENIED");
    expect(state.permissionRecoveryPath).toContain("Chrome/Edge");
    expect(state.permissionRecoveryPath).toContain("значок настроек сайта");
  });

  it("unsubscribes a stale VAPID subscription before creating the rotated one", async () => {
    const old = subscription("https://push.example.test/old", new Uint8Array([1, 2, 3]));
    const next = subscription("https://push.example.test/new", new Uint8Array([4, 5, 6]));
    const pushManager = {
      getSubscription: vi.fn().mockResolvedValue(old),
      subscribe: vi.fn().mockResolvedValue(next),
    };
    const registration = { pushManager };
    vi.stubGlobal("Notification", {
      permission: "granted",
      requestPermission: vi.fn(),
    });
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        register: vi.fn().mockResolvedValue(registration),
        ready: Promise.resolve(registration),
      },
    });

    const result = await webBrowserPushAdapter.subscribe("BAUG");

    expect(old.unsubscribe).toHaveBeenCalledOnce();
    expect(pushManager.subscribe).toHaveBeenCalledOnce();
    expect(result.endpoint).toBe(next.endpoint);
  });
});
