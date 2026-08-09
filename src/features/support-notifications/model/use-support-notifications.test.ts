import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupportNotificationsSource } from "../api/support-notifications-source";
import type { BrowserPushAdapter, BrowserPushState } from "./browser-push-adapter";
import { createSupportNotificationsController } from "./use-support-notifications";
import { writeStoredBrowserPushRegistration } from "./browser-push-registration-store";

beforeEach(() => localStorage.clear());

function setup() {
  const source: SupportNotificationsSource = {
    readAdmission: vi.fn().mockResolvedValue({
      rolloutState: "ATTENTION_ENABLED",
      rolloutRevision: "0123456789abcdef",
      evaluatedAt: "2026-08-09T10:00:00.000Z",
      activeSubscriptionCount: 0,
      capabilities: {
        assignedToMe: "AVAILABLE",
        attention: "AVAILABLE",
        deviceRegistration: "AVAILABLE",
        deepLinkResolve: "AVAILABLE",
      },
      applicationServerKey: "public-key",
      applicationServerKeyRevision: "fedcba9876543210",
    }),
    readPreferences: vi.fn().mockResolvedValue([
      {
        topic: "SUPPORT_CASE_ATTENTION",
        channel: "BROWSER_PUSH",
        subscribed: false,
        source: "DEFAULT",
        version: null,
      },
      {
        topic: "SUPPORT_CASE_ASSIGNED_TO_ME",
        channel: "BROWSER_PUSH",
        subscribed: true,
        source: "DEFAULT",
        version: null,
      },
    ]),
    updatePreference: vi.fn().mockImplementation(async (_projectId, input) => [
      {
        topic: input.topic,
        channel: "BROWSER_PUSH",
        subscribed: input.subscribed,
        source: "EXPLICIT",
        version: 1,
      },
    ]),
    listDevices: vi.fn().mockResolvedValue([]),
    registerDevice: vi.fn().mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000027",
      userAgentClass: "Chrome · macOS",
      status: "ACTIVE",
      version: 1,
      createdAt: "2026-08-09T10:00:00.000Z",
      lastSeenAt: "2026-08-09T10:00:00.000Z",
      revokedAt: null,
    }),
    revokeDevice: vi.fn(),
    resolveDeepLink: vi.fn(),
  };
  let nextBrowserState: BrowserPushState = {
    permission: "DEFAULT",
    locallySubscribed: false,
    requiresInstalledApp: false,
    endpoint: null,
    applicationServerKey: null,
  };
  const browser: BrowserPushAdapter = {
    state: vi.fn(async () => nextBrowserState),
    subscribe: vi.fn(async (publicKey) => {
      nextBrowserState = {
        permission: "GRANTED",
        locallySubscribed: true,
        requiresInstalledApp: false,
        endpoint: "https://push.example.test/device",
        applicationServerKey: publicKey,
      };
      return {
        endpoint: "https://push.example.test/device",
        p256dh: "p256dh-material",
        auth: "auth-material",
      };
    }),
    unsubscribe: vi.fn(async () => {
      nextBrowserState = {
        permission: "GRANTED",
        locallySubscribed: false,
        requiresInstalledApp: false,
        endpoint: null,
        applicationServerKey: null,
      };
    }),
  };
  const context = {
    projectId: vi.fn(() => "project-1" as string | undefined),
    actorId: vi.fn(() => "operator-1" as string | undefined),
    canRead: vi.fn(() => true),
    onForbidden: vi.fn(),
  };
  return {
    source,
    browser,
    setBrowserState(value: typeof nextBrowserState) {
      nextBrowserState = value;
    },
    context,
    controller: createSupportNotificationsController(context, source, browser),
  };
}

describe("createSupportNotificationsController", () => {
  it("keeps browser permission, preference and backend device as separate state", async () => {
    const { controller } = setup();
    await controller.load();

    expect(controller.preference("SUPPORT_CASE_ASSIGNED_TO_ME")?.subscribed).toBe(true);
    expect(controller.browserState.value.permission).toBe("DEFAULT");
    expect(controller.browserReady.value).toBe(false);
  });

  it("registers only from an explicit connect command and sends an idempotency key", async () => {
    const { controller, source, browser } = setup();
    await controller.load();
    await controller.connectBrowser();

    expect(browser.subscribe).toHaveBeenCalledWith("public-key");
    expect(source.registerDevice).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "https://push.example.test/device",
        idempotencyKey: expect.any(String),
      }),
      expect.anything(),
    );
  });

  it("recognizes the exact active browser registration immediately after connect", async () => {
    const { controller, source, browser, context } = setup();
    const registered = await vi.mocked(source.registerDevice).getMockImplementation()!({
      endpoint: "unused",
      p256dh: "unused",
      auth: "unused",
      idempotencyKey: "unused",
    });
    vi.mocked(source.listDevices)
      .mockResolvedValueOnce([])
      .mockResolvedValue([registered]);

    await controller.load();
    expect(controller.currentDeviceId.value).toBeNull();
    await controller.connectBrowser();

    expect(controller.currentDeviceId.value).toBe(registered.id);
    expect(controller.browserReady.value).toBe(true);

    const reloaded = createSupportNotificationsController(context, source, browser);
    await reloaded.load();

    expect(reloaded.currentDeviceId.value).toBe(registered.id);
    expect(reloaded.browserReady.value).toBe(true);
  });

  it("does not allow opt-in through a DISABLE_ONLY capability", async () => {
    const { controller, source } = setup();
    vi.mocked(source.readAdmission).mockResolvedValueOnce({
      ...(await vi.mocked(source.readAdmission)("project-1")),
      capabilities: {
        assignedToMe: "DISABLE_ONLY",
        attention: "UNAVAILABLE",
        deviceRegistration: "UNAVAILABLE",
        deepLinkResolve: "UNAVAILABLE",
      },
    });
    await controller.load();

    expect(controller.canSet("SUPPORT_CASE_ASSIGNED_TO_ME", true)).toBe(false);
    expect(controller.canSet("SUPPORT_CASE_ASSIGNED_TO_ME", false)).toBe(true);
    expect(controller.canSet("SUPPORT_CASE_ATTENTION", false)).toBe(false);
  });

  it("merges a partial preference receipt without dropping the other topic", async () => {
    const { controller } = setup();
    await controller.load();

    await controller.setPreference("SUPPORT_CASE_ATTENTION", true);

    expect(controller.preference("SUPPORT_CASE_ATTENTION")?.subscribed).toBe(true);
    expect(controller.preference("SUPPORT_CASE_ASSIGNED_TO_ME")?.subscribed).toBe(true);
  });

  it("replays an ambiguous registration with the same idempotency key", async () => {
    const { controller, source } = setup();
    vi.mocked(source.registerDevice).mockRejectedValueOnce(new Error("timeout"));
    await controller.load();

    await controller.connectBrowser();
    await controller.connectBrowser();

    const calls = vi.mocked(source.registerDevice).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[1]?.[0].idempotencyKey).toBe(calls[0]?.[0].idempotencyKey);
  });

  it("starts a clean registration intent after the actor or Project scope changes", async () => {
    const { controller, source, browser, context } = setup();
    const registered = {
      id: "00000000-0000-4000-8000-000000000028",
      userAgentClass: "Chrome · macOS",
      status: "ACTIVE" as const,
      version: 1,
      createdAt: "2026-08-09T10:00:00.000Z",
      lastSeenAt: "2026-08-09T10:00:00.000Z",
      revokedAt: null,
    };
    let resolveOld!: (value: typeof registered) => void;
    vi.mocked(source.registerDevice)
      .mockReturnValueOnce(new Promise((resolve) => (resolveOld = resolve)))
      .mockResolvedValue(registered);
    vi.mocked(source.listDevices).mockResolvedValue([registered]);
    await controller.load();

    const staleConnect = controller.connectBrowser();
    await vi.waitFor(() => expect(source.registerDevice).toHaveBeenCalledOnce());
    const oldIdempotencyKey = vi.mocked(source.registerDevice).mock.calls[0]?.[0].idempotencyKey;

    context.projectId.mockReturnValue("project-2");
    context.actorId.mockReturnValue("operator-2");
    await controller.load();
    expect(controller.deviceBusy.value).toBe(false);
    expect(browser.unsubscribe).toHaveBeenCalledOnce();
    expect(controller.browserState.value.locallySubscribed).toBe(false);
    await controller.connectBrowser();

    const calls = vi.mocked(source.registerDevice).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[1]?.[0].idempotencyKey).not.toBe(oldIdempotencyKey);
    expect(controller.currentDeviceId.value).toBe(registered.id);

    resolveOld(registered);
    await staleConnect;
    expect(controller.currentDeviceId.value).toBe(registered.id);
  });

  it("reconnects a revoked current device when PushManager reuses the same endpoint", async () => {
    const { controller, source, setBrowserState } = setup();
    const active = {
      id: "00000000-0000-4000-8000-000000000027",
      userAgentClass: "Chrome · macOS",
      status: "ACTIVE" as const,
      version: 4,
      createdAt: "2026-08-08T10:00:00.000Z",
      lastSeenAt: "2026-08-09T09:00:00.000Z",
      revokedAt: null,
    };
    const revoked = {
      ...active,
      status: "REVOKED" as const,
      version: 5,
      revokedAt: "2026-08-09T10:00:00.000Z",
    };
    const reactivated = {
      ...active,
      version: 6,
      lastSeenAt: "2026-08-09T10:01:00.000Z",
    };
    writeStoredBrowserPushRegistration("operator-1", {
      deviceId: active.id,
      endpoint: "https://push.example.test/device",
      applicationServerKey: "public-key",
      applicationServerKeyRevision: "fedcba9876543210",
    });
    setBrowserState({
      permission: "GRANTED",
      locallySubscribed: true,
      requiresInstalledApp: false,
      endpoint: "https://push.example.test/device",
      applicationServerKey: "public-key",
    });
    vi.mocked(source.listDevices)
      .mockResolvedValueOnce([active])
      .mockResolvedValue([reactivated]);
    vi.mocked(source.revokeDevice).mockResolvedValue(revoked);
    vi.mocked(source.registerDevice).mockResolvedValue(reactivated);
    await controller.load();

    await controller.revokeDevice(active);
    expect(controller.currentDeviceId.value).toBeNull();
    expect(controller.browserState.value.locallySubscribed).toBe(false);

    await controller.connectBrowser();

    expect(source.registerDevice).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "https://push.example.test/device",
        expectedVersion: revoked.version,
      }),
      expect.anything(),
    );
    expect(controller.currentDeviceId.value).toBe(reactivated.id);
    expect(controller.browserReady.value).toBe(true);
  });

  it("keeps a server-revoked device inactive until an explicit reconnect", async () => {
    const { controller, source, setBrowserState } = setup();
    const revoked = {
      id: "00000000-0000-4000-8000-000000000027",
      userAgentClass: "Chrome · macOS",
      status: "REVOKED" as const,
      version: 5,
      createdAt: "2026-08-08T10:00:00.000Z",
      lastSeenAt: "2026-08-09T09:00:00.000Z",
      revokedAt: "2026-08-09T10:00:00.000Z",
    };
    const reactivated = {
      ...revoked,
      status: "ACTIVE" as const,
      version: 6,
      revokedAt: null,
    };
    writeStoredBrowserPushRegistration("operator-1", {
      deviceId: revoked.id,
      endpoint: "https://push.example.test/device",
      applicationServerKey: "public-key",
      applicationServerKeyRevision: "fedcba9876543210",
    });
    setBrowserState({
      permission: "GRANTED",
      locallySubscribed: true,
      requiresInstalledApp: false,
      endpoint: "https://push.example.test/device",
      applicationServerKey: "public-key",
    });
    vi.mocked(source.listDevices)
      .mockResolvedValueOnce([revoked])
      .mockResolvedValue([reactivated]);
    vi.mocked(source.registerDevice).mockResolvedValue(reactivated);

    await controller.load();

    expect(source.registerDevice).not.toHaveBeenCalled();
    expect(controller.currentDeviceId.value).toBeNull();
    expect(controller.browserReady.value).toBe(false);

    await controller.connectBrowser();

    expect(source.registerDevice).toHaveBeenCalledWith(
      expect.objectContaining({ expectedVersion: revoked.version }),
      expect.anything(),
    );
    expect(controller.currentDeviceId.value).toBe(reactivated.id);
  });

  it("rotates a stale browser registration and retires the old active device", async () => {
    const { controller, source, setBrowserState } = setup();
    const oldDevice = {
      id: "00000000-0000-4000-8000-000000000026",
      userAgentClass: "Chrome · macOS",
      status: "ACTIVE" as const,
      version: 3,
      createdAt: "2026-08-08T10:00:00.000Z",
      lastSeenAt: "2026-08-09T09:00:00.000Z",
      revokedAt: null,
    };
    const newDevice = {
      id: "00000000-0000-4000-8000-000000000027",
      userAgentClass: "Chrome · macOS",
      status: "ACTIVE" as const,
      version: 1,
      createdAt: "2026-08-09T10:00:00.000Z",
      lastSeenAt: "2026-08-09T10:00:00.000Z",
      revokedAt: null,
    };
    vi.mocked(source.listDevices)
      .mockResolvedValueOnce([oldDevice])
      .mockResolvedValueOnce([oldDevice, newDevice]);
    vi.mocked(source.revokeDevice).mockResolvedValue({
      ...oldDevice,
      status: "REVOKED",
      version: 4,
      revokedAt: "2026-08-09T10:01:00.000Z",
    });
    writeStoredBrowserPushRegistration("operator-1", {
      deviceId: oldDevice.id,
      endpoint: "https://push.example.test/old",
      applicationServerKey: "old-key",
      applicationServerKeyRevision: "old-revision",
    });
    setBrowserState({
      permission: "GRANTED",
      locallySubscribed: true,
      requiresInstalledApp: false,
      endpoint: "https://push.example.test/rotated",
      applicationServerKey: "public-key",
    });

    await controller.load();

    expect(source.revokeDevice).toHaveBeenCalledWith(
      oldDevice,
      expect.any(String),
    );
    expect(source.registerDevice).toHaveBeenCalledOnce();
  });

  it("version-updates a same-endpoint VAPID rotation without retiring it first", async () => {
    const { controller, source, setBrowserState } = setup();
    const currentDevice = {
      id: "00000000-0000-4000-8000-000000000026",
      userAgentClass: "Chrome · macOS",
      status: "ACTIVE" as const,
      version: 7,
      createdAt: "2026-08-08T10:00:00.000Z",
      lastSeenAt: "2026-08-09T09:00:00.000Z",
      revokedAt: null,
    };
    vi.mocked(source.listDevices).mockResolvedValue([currentDevice]);
    vi.mocked(source.registerDevice).mockResolvedValue({ ...currentDevice, version: 8 });
    writeStoredBrowserPushRegistration("operator-1", {
      deviceId: currentDevice.id,
      endpoint: "https://push.example.test/device",
      applicationServerKey: "public-key",
      applicationServerKeyRevision: "old-revision",
    });
    setBrowserState({
      permission: "GRANTED",
      locallySubscribed: true,
      requiresInstalledApp: false,
      endpoint: "https://push.example.test/device",
      applicationServerKey: "public-key",
    });

    await controller.load();

    expect(source.revokeDevice).not.toHaveBeenCalled();
    expect(source.registerDevice).toHaveBeenCalledWith(
      expect.objectContaining({ expectedVersion: 7 }),
      expect.anything(),
    );
  });

  it("does not publish an old actor response after an in-place session change", async () => {
    const { controller, source, context } = setup();
    let resolveOld!: (value: Awaited<ReturnType<SupportNotificationsSource["readAdmission"]>>) => void;
    const oldAdmission = new Promise<Awaited<ReturnType<SupportNotificationsSource["readAdmission"]>>>(
      (resolve) => (resolveOld = resolve),
    );
    const readyAdmission = await vi.mocked(source.readAdmission)("project-1");
    vi.mocked(source.readAdmission)
      .mockReturnValueOnce(oldAdmission)
      .mockResolvedValueOnce({ ...readyAdmission, rolloutState: "ASSIGNMENT_ONLY" });

    const stale = controller.load();
    context.actorId.mockReturnValue("operator-2");
    await controller.load();
    resolveOld({ ...readyAdmission, rolloutState: "DISABLED" });
    await stale;

    expect(controller.admission.value?.rolloutState).toBe("ASSIGNMENT_ONLY");
  });
});
