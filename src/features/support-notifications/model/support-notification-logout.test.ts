import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runLogoutCleanups } from '@/features/auth/logout-cleanup';
import {
  readStoredBrowserPushRegistration,
  writeStoredBrowserPushRegistration,
} from './browser-push-registration-store';
import {
  runSupportNotificationBrowserLifecycle,
  trackSupportNotificationRegistration,
} from './support-notification-browser-lifecycle';

const generated = vi.hoisted(() => ({
  list: vi.fn(),
  register: vi.fn(),
  revoke: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock('@/shared/api/generated/retenive-backend', () => ({
  personalBrowserPushListSubscriptions: generated.list,
  personalBrowserPushRegisterSubscription: generated.register,
  personalBrowserPushRevokeSubscription: generated.revoke,
}));

vi.mock('./browser-push-adapter', () => ({
  createBrowserPushAdapter: () => ({ unsubscribe: generated.unsubscribe }),
}));

import { registerSupportNotificationLogoutCleanup } from './support-notification-logout';

describe('support notification logout cleanup', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    generated.unsubscribe.mockResolvedValue(undefined);
    generated.list.mockResolvedValue({ items: [] });
    generated.register.mockRejectedValue(new Error('registration unavailable'));
  });

  it('revokes the actor-scoped device without dropping the browser push subscription', async () => {
    const device = {
      id: '00000000-0000-4000-8000-000000000027',
      userAgentClass: 'Chrome · macOS',
      status: 'ACTIVE' as const,
      version: 5,
      createdAt: '2026-08-09T10:00:00.000Z',
      lastSeenAt: '2026-08-09T10:00:00.000Z',
      revokedAt: null,
    };
    generated.list.mockResolvedValue({ items: [device] });
    generated.revoke.mockResolvedValue({ ...device, status: 'REVOKED', version: 6 });
    writeStoredBrowserPushRegistration('operator-1', {
      deviceId: device.id,
      endpoint: 'https://push.example.test/device',
      applicationServerKey: 'public-key',
      applicationServerKeyRevision: 'revision-1',
    });
    const unregister = registerSupportNotificationLogoutCleanup();

    await runLogoutCleanups('operator-1', 'captured-access-token');
    unregister();

    expect(generated.list).toHaveBeenCalledWith(
      expect.objectContaining({ _authTeardownAccessToken: 'captured-access-token' }),
    );
    expect(generated.revoke).toHaveBeenCalledWith(
      device.id,
      { expectedVersion: 5 },
      expect.objectContaining({
        _authTeardownAccessToken: 'captured-access-token',
        headers: { 'Idempotency-Key': expect.any(String) },
      }),
    );
    expect(generated.unsubscribe).not.toHaveBeenCalled();
    expect(readStoredBrowserPushRegistration('operator-1')).toMatchObject({
      deviceId: device.id,
      resumeAfterLogin: true,
    });
  });

  it('waits for an in-flight registration and revokes its receipt without touching the browser', async () => {
    const device = {
      id: '00000000-0000-4000-8000-000000000027',
      userAgentClass: 'Chrome · macOS',
      status: 'ACTIVE' as const,
      version: 5,
      createdAt: '2026-08-09T10:00:00.000Z',
      lastSeenAt: '2026-08-09T10:00:00.000Z',
      revokedAt: null,
    };
    let resolveRegistration!: (value: typeof device) => void;
    const pendingRegistration = trackSupportNotificationRegistration(
      'operator-1',
      {
        endpoint: 'https://push.example.test/device',
        p256dh: 'p256dh',
        auth: 'auth',
        idempotencyKey: 'register-1',
      },
      () => new Promise((resolve) => (resolveRegistration = resolve)),
    );
    generated.list.mockResolvedValue({ items: [] });
    generated.revoke.mockResolvedValue({ ...device, status: 'REVOKED', version: 6 });
    const unregister = registerSupportNotificationLogoutCleanup();

    const cleanup = runLogoutCleanups('operator-1', 'captured-access-token');
    await Promise.resolve();
    expect(generated.list).not.toHaveBeenCalled();

    resolveRegistration(device);
    await pendingRegistration;
    await vi.waitFor(() => expect(generated.revoke).toHaveBeenCalledOnce());
    expect(generated.unsubscribe).not.toHaveBeenCalled();

    await cleanup;
    unregister();

    expect(generated.unsubscribe).not.toHaveBeenCalled();
  });

  it('bounds a never-settling registration while preserving the browser subscription', async () => {
    vi.useFakeTimers();
    trackSupportNotificationRegistration(
      'operator-1',
      {
        endpoint: 'https://push.example.test/device',
        p256dh: 'p256dh',
        auth: 'auth',
        idempotencyKey: 'register-never-settles',
      },
      () => new Promise(() => undefined),
    );
    writeStoredBrowserPushRegistration('operator-1', {
      deviceId: '00000000-0000-4000-8000-000000000027',
      endpoint: 'https://push.example.test/device',
      applicationServerKey: 'public-key',
      applicationServerKeyRevision: 'revision-1',
    });
    const unregister = registerSupportNotificationLogoutCleanup();

    const cleanup = runLogoutCleanups('operator-1', 'captured-access-token');
    await vi.advanceTimersByTimeAsync(1_500);
    await cleanup;
    unregister();
    vi.useRealTimers();

    expect(generated.unsubscribe).not.toHaveBeenCalled();
    expect(readStoredBrowserPushRegistration('operator-1')).toMatchObject({
      resumeAfterLogin: true,
    });
  });

  it('does not let a never-settling browser operation block logout', async () => {
    let resolveBrowserOperation!: () => void;
    const pendingBrowserOperation = runSupportNotificationBrowserLifecycle(
      () => new Promise<void>((resolve) => (resolveBrowserOperation = resolve)),
    );
    writeStoredBrowserPushRegistration('operator-1', {
      deviceId: '00000000-0000-4000-8000-000000000027',
      endpoint: 'https://push.example.test/device',
      applicationServerKey: 'public-key',
      applicationServerKeyRevision: 'revision-1',
    });
    const unregister = registerSupportNotificationLogoutCleanup();

    await runLogoutCleanups('operator-1', 'captured-access-token');

    expect(generated.unsubscribe).not.toHaveBeenCalled();
    expect(readStoredBrowserPushRegistration('operator-1')).toMatchObject({
      resumeAfterLogin: true,
    });

    resolveBrowserOperation();
    await pendingBrowserOperation;
    expect(generated.unsubscribe).not.toHaveBeenCalled();
    unregister();
  });
});
