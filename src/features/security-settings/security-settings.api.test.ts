import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cmsSecuritySettingsChangePassword,
  cmsSecuritySettingsList,
  cmsSecuritySettingsRevoke,
  cmsSecuritySettingsRevokeOthers,
} from "@/shared/api/generated/retenive-backend";
import {
  clearAuthSession,
  coordinateAccessTokenRefresh,
  getAccessToken,
  storeAccessToken,
} from "@/shared/api/http/auth-session";
import {
  clearInteractiveLoginRequirement,
  requireInteractiveLogin,
} from "@/features/auth/interactive-login-requirement";
import { securitySettingsApi } from "./security-settings.api";

vi.mock("@/shared/api/generated/retenive-backend", () => ({
  cmsSecuritySettingsChangePassword: vi.fn(),
  cmsSecuritySettingsList: vi.fn(),
  cmsSecuritySettingsRevoke: vi.fn(),
  cmsSecuritySettingsRevokeOthers: vi.fn(),
}));

describe("security settings API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    clearAuthSession();
    clearInteractiveLoginRequirement();
  });

  it("uses the stable session family id for exact revocation", async () => {
    vi.mocked(cmsSecuritySettingsList).mockResolvedValue({
      sessions: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          current: false,
          device: "Firefox",
          createdAt: "2026-07-21T10:00:00.000Z",
          lastSeenAt: "2026-07-21T10:05:00.000Z",
          expiresAt: "2026-07-22T10:00:00.000Z",
        },
      ],
    });
    vi.mocked(cmsSecuritySettingsRevoke).mockResolvedValue({ success: true });

    const [session] = await securitySettingsApi.listSessions();
    await securitySettingsApi.revokeSession(session!.id);

    expect(cmsSecuritySettingsRevoke).toHaveBeenCalledWith(session!.id);
  });

  it("replaces only the in-memory access token after password change", async () => {
    storeAccessToken({ accessToken: "old-access-secret", expiresIn: 900 });
    vi.mocked(cmsSecuritySettingsChangePassword).mockResolvedValue({
      kind: "AUTHENTICATED",
      tokenType: "Bearer",
      accessToken: "new-access-secret",
      expiresIn: 900,
      refreshExpiresIn: 86_400,
      user: {
        id: "user-1",
        email: "operator@example.com",
        displayName: "Operator",
      },
    });

    await securitySettingsApi.changePassword({
      currentPassword: "old password",
      newPassword: "new secure passphrase",
      passwordConfirmation: "new secure passphrase",
    });

    expect(getAccessToken()).toBe("new-access-secret");
    expect(JSON.stringify(Object.values(sessionStorage))).not.toContain(
      "new-access-secret",
    );
    expect(JSON.stringify(Object.values(localStorage))).not.toContain(
      "new-access-secret",
    );
  });

  it("does not publish a password-change token after logout", async () => {
    let resolvePasswordChange!: (
      value: Awaited<ReturnType<typeof cmsSecuritySettingsChangePassword>>,
    ) => void;
    vi.mocked(cmsSecuritySettingsChangePassword).mockReturnValue(
      new Promise((resolve) => {
        resolvePasswordChange = resolve;
      }),
    );
    storeAccessToken({ accessToken: "old-access-secret", expiresIn: 900 });
    const passwordChange = securitySettingsApi.changePassword({
      currentPassword: "old password",
      newPassword: "new secure passphrase",
      passwordConfirmation: "new secure passphrase",
    });

    requireInteractiveLogin();
    clearAuthSession();
    resolvePasswordChange({
      kind: "AUTHENTICATED",
      tokenType: "Bearer",
      accessToken: "late-access-secret",
      expiresIn: 900,
      refreshExpiresIn: 86_400,
      user: {
        id: "user-1",
        email: "operator@example.com",
        displayName: "Operator",
      },
    });
    await passwordChange;

    expect(getAccessToken()).toBeNull();
  });

  it("publishes the password-change token after an overlapping token refresh", async () => {
    let resolvePasswordChange!: (
      value: Awaited<ReturnType<typeof cmsSecuritySettingsChangePassword>>,
    ) => void;
    vi.mocked(cmsSecuritySettingsChangePassword).mockReturnValue(
      new Promise((resolve) => {
        resolvePasswordChange = resolve;
      }),
    );
    storeAccessToken({ accessToken: "old-access-secret", expiresIn: 900 });
    const passwordChange = securitySettingsApi.changePassword({
      currentPassword: "old password",
      newPassword: "new secure passphrase",
      passwordConfirmation: "new secure passphrase",
    });

    storeAccessToken({ accessToken: "concurrent-refresh", expiresIn: 900 });
    resolvePasswordChange({
      kind: "AUTHENTICATED",
      tokenType: "Bearer",
      accessToken: "password-change-access",
      expiresIn: 900,
      refreshExpiresIn: 86_400,
      user: {
        id: "user-1",
        email: "operator@example.com",
        displayName: "Operator",
      },
    });
    await passwordChange;

    expect(getAccessToken()).toBe("password-change-access");
  });

  it("publishes the password-change token when the starting token expires", async () => {
    vi.useFakeTimers();
    try {
      let resolvePasswordChange!: (
        value: Awaited<ReturnType<typeof cmsSecuritySettingsChangePassword>>,
      ) => void;
      vi.mocked(cmsSecuritySettingsChangePassword).mockReturnValue(
        new Promise((resolve) => {
          resolvePasswordChange = resolve;
        }),
      );
      storeAccessToken({ accessToken: "short-access", expiresIn: 1 });
      const passwordChange = securitySettingsApi.changePassword({
        currentPassword: "old password",
        newPassword: "new secure passphrase",
        passwordConfirmation: "new secure passphrase",
      });

      await vi.advanceTimersByTimeAsync(2_000);
      expect(getAccessToken()).toBeNull();
      resolvePasswordChange({
        kind: "AUTHENTICATED",
        tokenType: "Bearer",
        accessToken: "password-change-access",
        expiresIn: 900,
        refreshExpiresIn: 86_400,
        user: {
          id: "user-1",
          email: "operator@example.com",
          displayName: "Operator",
        },
      });
      await passwordChange;

      expect(getAccessToken()).toBe("password-change-access");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not let an older refresh finish after password session replacement", async () => {
    let resolvePasswordChange!: (
      value: Awaited<ReturnType<typeof cmsSecuritySettingsChangePassword>>,
    ) => void;
    vi.mocked(cmsSecuritySettingsChangePassword).mockReturnValue(
      new Promise((resolve) => {
        resolvePasswordChange = resolve;
      }),
    );
    storeAccessToken({ accessToken: "old-access-secret", expiresIn: 900 });
    const passwordChange = securitySettingsApi.changePassword({
      currentPassword: "old password",
      newPassword: "new secure passphrase",
      passwordConfirmation: "new secure passphrase",
    });
    await vi.waitFor(() =>
      expect(cmsSecuritySettingsChangePassword).toHaveBeenCalledOnce(),
    );
    const refreshBackend = vi.fn(async () => {
      storeAccessToken({ accessToken: "post-change-refresh", expiresIn: 900 });
    });
    const refresh = coordinateAccessTokenRefresh(refreshBackend);

    expect(refreshBackend).not.toHaveBeenCalled();
    resolvePasswordChange({
      kind: "AUTHENTICATED",
      tokenType: "Bearer",
      accessToken: "password-change-access",
      expiresIn: 900,
      refreshExpiresIn: 86_400,
      user: {
        id: "user-1",
        email: "operator@example.com",
        displayName: "Operator",
      },
    });
    await passwordChange;
    await refresh;

    expect(refreshBackend).not.toHaveBeenCalled();
    expect(getAccessToken()).toBe("password-change-access");
  });

  it("revokes every other session without a request body", async () => {
    vi.mocked(cmsSecuritySettingsRevokeOthers).mockResolvedValue({
      success: true,
    });

    await securitySettingsApi.revokeOtherSessions();

    expect(cmsSecuritySettingsRevokeOthers).toHaveBeenCalledWith();
  });
});
