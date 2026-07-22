import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/browser";
import { startRegistration } from "@simplewebauthn/browser";
import {
  iamMfaCompleteAuthentication,
  iamMfaCompleteEnrollment,
  iamMfaCompleteRecovery,
  iamMfaEnrollmentOptions,
  iamMfaManagementBeginPasskeyEnrollment,
  iamMfaManagementRemovePasskey,
  iamMfaManagementRotateRecoveryCodes,
  iamMfaManagementSummary,
} from "@/shared/api/generated/lola-backend";
import type {
  IamMfaAuthenticatedResponseDto,
  IamMfaAuthenticationCompleteRequestDtoCredential,
  IamMfaEnrollmentCompleteRequestDtoCredential,
  IamMfaEnrollmentCompleteResponseDto,
  IamMfaEnrollmentOptionsResponseDto,
  IamMfaFactorSummaryResponseDto,
  IamMfaPasskeySummaryDto,
  IamMfaRecoveryEnrollmentOptionsResponseDto,
} from "@/shared/api/generated/models";

export type MfaEnrollmentOptions =
  | IamMfaEnrollmentOptionsResponseDto
  | IamMfaRecoveryEnrollmentOptionsResponseDto;
export type MfaEnrolledResponse = IamMfaEnrollmentCompleteResponseDto;
export type MfaAuthenticatedResponse = IamMfaAuthenticatedResponseDto;
export type MfaPasskeySummary = IamMfaPasskeySummaryDto;
export type MfaSummary = IamMfaFactorSummaryResponseDto;

export const mfaApi = {
  enrollmentOptions(ceremonyToken: string) {
    return iamMfaEnrollmentOptions({ ceremonyToken });
  },

  completeEnrollment(
    ceremonyToken: string,
    credential: RegistrationResponseJSON,
    label?: string,
  ) {
    return iamMfaCompleteEnrollment({
      ceremonyToken,
      credential:
        credential as unknown as IamMfaEnrollmentCompleteRequestDtoCredential,
      ...(label ? { label } : {}),
    });
  },

  completeAuthentication(
    ceremonyToken: string,
    credential: AuthenticationResponseJSON,
  ) {
    return iamMfaCompleteAuthentication({
      ceremonyToken,
      credential:
        credential as unknown as IamMfaAuthenticationCompleteRequestDtoCredential,
    });
  },

  completeRecovery(ceremonyToken: string, recoveryCode: string) {
    return iamMfaCompleteRecovery({ ceremonyToken, recoveryCode });
  },

  summary() {
    return iamMfaManagementSummary();
  },

  beginManagedEnrollment() {
    return iamMfaManagementBeginPasskeyEnrollment();
  },

  removePasskey(passkeyId: string) {
    return iamMfaManagementRemovePasskey(passkeyId);
  },

  rotateRecoveryCodes() {
    return iamMfaManagementRotateRecoveryCodes();
  },
};

export const mfaManagementApi = {
  summary: mfaApi.summary,

  async addPasskey(label?: string) {
    const options = await mfaApi.beginManagedEnrollment();
    const credential = await startRegistration({
      optionsJSON:
        options.publicKey as unknown as PublicKeyCredentialCreationOptionsJSON,
    });
    return mfaApi.completeEnrollment(options.ceremonyToken, credential, label);
  },

  removePasskey: mfaApi.removePasskey,
  rotateRecoveryCodes: mfaApi.rotateRecoveryCodes,
};

export type MfaAuthenticationOptions = PublicKeyCredentialRequestOptionsJSON;
