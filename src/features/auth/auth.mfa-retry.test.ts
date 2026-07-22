import { beforeEach, describe, expect, it, vi } from "vitest";
import { startRegistration } from "@simplewebauthn/browser";
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
});
