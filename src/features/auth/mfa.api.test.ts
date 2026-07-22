import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  iamMfaCompleteAuthentication,
  iamMfaCompleteRecovery,
  iamMfaEnrollmentOptions,
} from "@/shared/api/generated/lola-backend";
import { mfaApi } from "./mfa.api";

vi.mock("@/shared/api/generated/lola-backend", () => ({
  iamMfaCompleteAuthentication: vi.fn(),
  iamMfaCompleteEnrollment: vi.fn(),
  iamMfaCompleteRecovery: vi.fn(),
  iamMfaEnrollmentOptions: vi.fn(),
  iamMfaManagementBeginPasskeyEnrollment: vi.fn(),
  iamMfaManagementRemovePasskey: vi.fn(),
  iamMfaManagementRotateRecoveryCodes: vi.fn(),
  iamMfaManagementSummary: vi.fn(),
}));

describe("MFA API contract", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the one-time login ceremony capability only in request bodies", async () => {
    vi.mocked(iamMfaEnrollmentOptions).mockResolvedValue({
      kind: "MFA_ENROLLMENT_REQUIRED",
      ceremonyToken: "lmf_next",
      expiresAt: "2026-07-21T21:10:00.000Z",
      publicKey: { challenge: "challenge" },
    });

    await mfaApi.enrollmentOptions("lmf_login");

    expect(iamMfaEnrollmentOptions).toHaveBeenCalledWith({
      ceremonyToken: "lmf_login",
    });
  });

  it("completes authentication and recovery through separate fail-closed endpoints", async () => {
    vi.mocked(iamMfaCompleteAuthentication).mockResolvedValue({
      kind: "AUTHENTICATED",
    } as never);
    vi.mocked(iamMfaCompleteRecovery).mockResolvedValue({
      kind: "MFA_ENROLLMENT_REQUIRED",
    } as never);
    const credential = {
      id: "credential",
      rawId: "raw",
      response: {},
      type: "public-key",
    } as never;

    await mfaApi.completeAuthentication("lmf_login", credential);
    await mfaApi.completeRecovery("lmf_login", "lrc_recovery-code");

    expect(iamMfaCompleteAuthentication).toHaveBeenCalledWith({
      ceremonyToken: "lmf_login",
      credential,
    });
    expect(iamMfaCompleteRecovery).toHaveBeenCalledWith({
      ceremonyToken: "lmf_login",
      recoveryCode: "lrc_recovery-code",
    });
  });
});
