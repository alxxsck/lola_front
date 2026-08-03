import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import { cmsSessionContextMe } from "@/shared/api/generated/lola-backend";
import {
  clearAuthSession,
  coordinateAuthSessionMutation,
  getAccessToken,
} from "@/shared/api/http/auth-session";
import { mfaApi } from "./mfa.api";
import { authApi, type MfaChallenge } from "./auth.api";

vi.mock("@simplewebauthn/browser", () => ({
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
}));

vi.mock("./mfa.api", () => ({
  mfaApi: {
    enrollmentOptions: vi.fn(),
    completeEnrollment: vi.fn(),
    completeAuthentication: vi.fn(),
    completeRecovery: vi.fn(),
  },
}));

vi.mock("@/shared/api/generated/lola-backend", () => ({
  cmsSecuritySettingsLogout: vi.fn(),
  cmsSecuritySettingsLogoutAll: vi.fn(),
  cmsSessionContextMe: vi.fn(),
  initialAccessLogin: vi.fn(),
  initialAccessRefresh: vi.fn(),
  initialAccessSetupPassword: vi.fn(),
}));

const enrollmentOptions = {
  kind: "MFA_RECOVERY_ENROLLMENT_REQUIRED" as const,
  ceremonyToken: "lmf_replacement",
  expiresAt: "2099-07-21T21:10:00.000Z",
  publicKey: { challenge: "replacement-challenge" },
  reason: "RECOVERY" as const,
};

describe("MFA enrollment retry boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authApi.cancelMfa();
  });

  it("does not consume another recovery code after browser cancellation", async () => {
    const challenge: Extract<MfaChallenge, { kind: "MFA_REQUIRED" }> = {
      kind: "MFA_REQUIRED",
      ceremonyToken: "lmf_login",
      expiresAt: "2099-07-21T21:10:00.000Z",
      publicKey: { challenge: "assertion-challenge" },
      recoveryAvailable: true,
    };
    vi.mocked(mfaApi.completeRecovery).mockResolvedValue(
      enrollmentOptions as never,
    );
    vi.mocked(startRegistration)
      .mockRejectedValueOnce(new DOMException("cancelled", "NotAllowedError"))
      .mockResolvedValueOnce({ id: "credential" } as never);
    vi.mocked(mfaApi.completeEnrollment).mockResolvedValue({
      kind: "MFA_ENROLLED",
      passkeyId: "passkey-1",
      recoveryCodes: ["lrc_replacement"],
    } as never);

    await expect(
      authApi.completeMfaRecovery(challenge, "lrc_last"),
    ).rejects.toMatchObject({
      name: "NotAllowedError",
    });
    await expect(
      authApi.completeMfaRecovery(challenge, "lrc_last"),
    ).resolves.toMatchObject({
      kind: "MFA_ENROLLED",
    });

    expect(mfaApi.completeRecovery).toHaveBeenCalledTimes(1);
    expect(mfaApi.completeEnrollment).toHaveBeenCalledTimes(1);
  });

  it("reuses exchanged initial enrollment options after browser cancellation", async () => {
    const challenge: Extract<
      MfaChallenge,
      { kind: "MFA_ENROLLMENT_REQUIRED" }
    > = {
      kind: "MFA_ENROLLMENT_REQUIRED",
      ceremonyToken: "lmf_initial",
      expiresAt: "2099-07-21T21:10:00.000Z",
    };
    vi.mocked(mfaApi.enrollmentOptions).mockResolvedValue({
      ...enrollmentOptions,
      kind: "MFA_ENROLLMENT_REQUIRED",
      ceremonyToken: "lmf_enrollment",
    } as never);
    vi.mocked(startRegistration)
      .mockRejectedValueOnce(new DOMException("cancelled", "NotAllowedError"))
      .mockResolvedValueOnce({ id: "credential" } as never);
    vi.mocked(mfaApi.completeEnrollment).mockResolvedValue({
      kind: "MFA_ENROLLED",
      passkeyId: "passkey-1",
      recoveryCodes: ["lrc_one"],
    } as never);

    await expect(authApi.completeMfaPasskey(challenge)).rejects.toMatchObject({
      name: "NotAllowedError",
    });
    await expect(authApi.completeMfaPasskey(challenge)).resolves.toMatchObject({
      kind: "MFA_ENROLLED",
    });

    expect(mfaApi.enrollmentOptions).toHaveBeenCalledTimes(1);
    expect(mfaApi.completeEnrollment).toHaveBeenCalledTimes(1);
  });

  it("serializes concurrent MFA session completions", async () => {
    const firstChallenge: Extract<
      MfaChallenge,
      { kind: "MFA_ENROLLMENT_REQUIRED" }
    > = {
      kind: "MFA_ENROLLMENT_REQUIRED",
      ceremonyToken: "lmf_first",
      expiresAt: "2099-07-21T21:10:00.000Z",
    };
    const secondChallenge = {
      ...firstChallenge,
      ceremonyToken: "lmf_second",
    };
    vi.mocked(mfaApi.enrollmentOptions)
      .mockResolvedValueOnce({
        ...enrollmentOptions,
        ceremonyToken: "lmf_first_completion",
      } as never)
      .mockResolvedValueOnce({
        ...enrollmentOptions,
        ceremonyToken: "lmf_second_completion",
      } as never);
    vi.mocked(startRegistration).mockResolvedValue({
      id: "credential",
    } as never);
    let resolveFirst!: (value: never) => void;
    vi.mocked(mfaApi.completeEnrollment)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
      )
      .mockResolvedValueOnce({
        kind: "MFA_ENROLLED",
        passkeyId: "passkey-2",
        recoveryCodes: ["lrc_two"],
      } as never);

    const first = authApi.completeMfaPasskey(firstChallenge);
    await vi.waitFor(() =>
      expect(mfaApi.completeEnrollment).toHaveBeenCalledTimes(1),
    );
    const second = authApi.completeMfaPasskey(secondChallenge);
    await Promise.resolve();

    expect(mfaApi.completeEnrollment).toHaveBeenCalledTimes(1);
    resolveFirst({
      kind: "MFA_ENROLLED",
      passkeyId: "passkey-1",
      recoveryCodes: ["lrc_one"],
    } as never);
    await first;
    await second;

    expect(mfaApi.completeEnrollment).toHaveBeenCalledTimes(2);
  });

  it("publishes an MFA token before a queued session replacement can clear it", async () => {
    const challenge: Extract<MfaChallenge, { kind: "MFA_REQUIRED" }> = {
      kind: "MFA_REQUIRED",
      ceremonyToken: "lmf_authentication",
      expiresAt: "2099-07-21T21:10:00.000Z",
      publicKey: { challenge: "assertion-challenge" },
      recoveryAvailable: false,
    };
    vi.mocked(startAuthentication).mockResolvedValue({
      id: "credential",
    } as never);
    let resolveAuthentication!: (value: never) => void;
    vi.mocked(mfaApi.completeAuthentication).mockReturnValue(
      new Promise((resolve) => {
        resolveAuthentication = resolve;
      }),
    );
    vi.mocked(cmsSessionContextMe).mockResolvedValue({
      user: {
        id: "00000000-0000-4000-8000-000000000001",
        email: "operator@example.com",
        displayName: "Operator",
        emailVerifiedAt: null,
        pendingEmail: null,
        emailVerificationRetryAfterSeconds: 0,
      },
      platformPermissionCodes: [],
      projects: [],
    } as never);
    const completion = authApi.completeMfaPasskey(challenge);
    await vi.waitFor(() =>
      expect(mfaApi.completeAuthentication).toHaveBeenCalledOnce(),
    );
    const replacement = coordinateAuthSessionMutation(async () => {
      clearAuthSession();
    });

    resolveAuthentication({
      kind: "AUTHENTICATED",
      accessToken: "mfa-access",
      expiresIn: 900,
      refreshExpiresIn: 86_400,
      tokenType: "Bearer",
      user: {
        id: "00000000-0000-4000-8000-000000000001",
        email: "operator@example.com",
        displayName: "Operator",
      },
    } as never);
    await completion;
    await replacement;

    expect(getAccessToken()).toBeNull();
  });

  it("does not call the MFA backend after a queued operation is cancelled", async () => {
    const challenge: Extract<MfaChallenge, { kind: "MFA_REQUIRED" }> = {
      kind: "MFA_REQUIRED",
      ceremonyToken: "lmf_stale_authentication",
      expiresAt: "2099-07-21T21:10:00.000Z",
      publicKey: { challenge: "assertion-challenge" },
      recoveryAvailable: false,
    };
    vi.mocked(startAuthentication).mockResolvedValue({
      id: "credential",
    } as never);
    let releaseReplacement!: () => void;
    const activeReplacement = coordinateAuthSessionMutation(
      () =>
        new Promise<void>((resolve) => {
          releaseReplacement = resolve;
        }),
    );
    await vi.waitFor(() => expect(releaseReplacement).toBeTypeOf("function"));
    let current = true;

    const completion = authApi.completeMfaPasskey(
      challenge,
      undefined,
      () => current,
    );
    await Promise.resolve();
    current = false;
    releaseReplacement();
    await activeReplacement;

    await expect(completion).rejects.toMatchObject({
      name: "AuthenticationOperationCancelledError",
    });
    expect(mfaApi.completeAuthentication).not.toHaveBeenCalled();
  });
});
