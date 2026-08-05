import {
  cmsSecuritySettingsLogout,
  cmsSecuritySettingsLogoutAll,
  cmsSessionContextMe,
  initialAccessLogin,
  initialAccessRefresh,
  initialAccessSetupPassword,
} from "@/shared/api/generated/retenive-backend";
import type {
  CmsAuthenticatedResponseDto,
  CmsAuthenticatedUserResponseDto,
  CmsSessionProjectContextDto,
} from "@/shared/api/generated/models";
import { demoProject } from "@/shared/api/mock-data";
import {
  authTeardownRequestOptions,
  beginAuthTeardown,
  endAuthTeardown,
  registerRefreshHandler,
} from "@/shared/api/http/axios-instance";
import {
  clearAuthSession,
  clearLocalAuthSession,
  coordinateAuthSessionMutation,
  coordinateAccessTokenRefresh,
  getAccessToken,
  getSelectedProjectId,
  storeAccessToken,
} from "@/shared/api/http/auth-session";
import { isMockMode } from "@/shared/config/data-mode";
import { isInteractiveLoginRequired } from "./interactive-login-requirement";
import type { AuthProject, CmsUser } from "@/shared/types/domain";
import { PROJECT_PERMISSION_CODES } from "./permission-access";
import {
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
} from "@simplewebauthn/browser";
import {
  mfaApi,
  type MfaAuthenticationOptions,
  type MfaEnrolledResponse,
  type MfaEnrollmentOptions,
} from "./mfa.api";

const DEMO_SESSION_KEY = "retenive-cms-demo-auth-v1";
const DEMO_KNOWLEDGE_PREFIX = "retenive-cms-demo-knowledge-v1:";
const TRANSLATION_JOB_PREFIX = "retenive:translation-jobs:";
const pendingEnrollmentOptions = new Map<string, MfaEnrollmentOptions>();
type AuthenticationOperationGuard = () => boolean;

export class AuthenticationOperationCancelledError extends Error {
  constructor() {
    super("Вход был отменён. Начните авторизацию заново.");
    this.name = "AuthenticationOperationCancelledError";
  }
}

function assertAuthenticationOperationCurrent(
  isCurrent: AuthenticationOperationGuard,
): void {
  if (!isCurrent()) throw new AuthenticationOperationCancelledError();
}

function validPendingEnrollment(key: string): MfaEnrollmentOptions | undefined {
  const pending = pendingEnrollmentOptions.get(key);
  if (!pending) return undefined;
  if (Date.parse(pending.expiresAt) <= Date.now()) {
    pendingEnrollmentOptions.delete(key);
    return undefined;
  }
  return pending;
}

function clearPendingMfaCeremonies(): void {
  pendingEnrollmentOptions.clear();
}

function clearDemoSession() {
  sessionStorage.removeItem(DEMO_SESSION_KEY);
  for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
    const key = sessionStorage.key(index);
    if (
      key?.startsWith(DEMO_KNOWLEDGE_PREFIX) ||
      key?.startsWith(TRANSLATION_JOB_PREFIX)
    )
      sessionStorage.removeItem(key);
  }
}

export interface AuthContext {
  user: CmsUser;
  projects: AuthProject[];
  selectedProjectId?: string;
}

export type AuthLoginResult =
  | { kind: "AUTHENTICATED"; context: AuthContext }
  | { kind: "PASSWORD_SETUP_REQUIRED"; setupToken: string; expiresAt: string }
  | MfaChallenge;

export type MfaChallenge =
  | {
      kind: "MFA_ENROLLMENT_REQUIRED";
      ceremonyToken: string;
      expiresAt: string;
    }
  | {
      kind: "MFA_REQUIRED";
      ceremonyToken: string;
      expiresAt: string;
      publicKey: MfaAuthenticationOptions;
      recoveryAvailable: boolean;
    };

export type MfaCompletionResult =
  { kind: "AUTHENTICATED"; context: AuthContext } | MfaEnrolledResponse;

export interface PasswordSetupResult {
  kind: "PASSWORD_ESTABLISHED";
  status: "ACTIVE";
  nextAction: "LOGIN";
}

function mapUser(
  user: CmsAuthenticatedUserResponseDto,
  platformPermissionCodes: string[],
): CmsUser {
  const emailIdentity = user as CmsAuthenticatedUserResponseDto & {
    emailVerifiedAt?: string | null;
    pendingEmail?: string | null;
    emailVerificationRetryAfterSeconds?: number;
  };
  return {
    id: user.id,
    email: user.email,
    name: user.displayName,
    ...("emailVerifiedAt" in emailIdentity
      ? {
          emailVerifiedAt: emailIdentity.emailVerifiedAt ?? null,
          pendingEmail: emailIdentity.pendingEmail ?? null,
          emailVerificationRetryAfterSeconds:
            emailIdentity.emailVerificationRetryAfterSeconds ?? 0,
        }
      : {}),
    platformPermissionCodes,
  };
}

function mapProject(project: CmsSessionProjectContextDto): AuthProject {
  return Object.fromEntries(
    Object.entries({
      id: project.id,
      version: project.version,
      name: project.name,
      slug: project.slug,
      status: project.status,
      publicKey: project.publicKey,
      defaultLocale: project.defaultLocale,
      supportedLocales: project.supportedLocales,
      assistantName: project.assistantName,
      systemPrompt: project.systemPrompt,
      voiceInstructions: project.voiceInstructions,
      settings: project.settings,
      organization: project.organization,
      _count: project._count,
      membershipId: project.membershipId,
      membershipStatus: project.membershipStatus,
      membershipVersion: project.membershipVersion,
      roleKeys: project.roleKeys,
      effectivePermissionCodes: project.effectivePermissionCodes,
    }).filter(([, value]) => value !== undefined),
  ) as unknown as AuthProject;
}

function rememberAccess(response: CmsAuthenticatedResponseDto): void {
  storeAccessToken(response);
}

registerRefreshHandler(async () => {
  if (isInteractiveLoginRequired())
    throw new AuthenticationOperationCancelledError();
  await coordinateAccessTokenRefresh(async () => {
    if (isInteractiveLoginRequired())
      throw new AuthenticationOperationCancelledError();
    const response = await initialAccessRefresh();
    if (isInteractiveLoginRequired())
      throw new AuthenticationOperationCancelledError();
    rememberAccess(response);
  });
});

async function loadContext(): Promise<AuthContext> {
  const response = await cmsSessionContextMe();
  const projects = response.projects.map(mapProject);
  const storedProjectId = getSelectedProjectId();
  const selectedProject =
    projects.find((project) => project.id === storedProjectId) ??
    (projects.length === 1 ? projects[0] : undefined);
  return {
    user: mapUser(response.user, response.platformPermissionCodes),
    projects,
    selectedProjectId: selectedProject?.id,
  };
}

function demoContext(login: string): AuthContext {
  return {
    user: {
      id: "cms_1",
      email: login,
      name: login.startsWith("admin@")
        ? "Алексей"
        : login.split("@")[0] || "Администратор",
    },
    projects: [
      {
        ...structuredClone(demoProject),
        roleKeys: ["PROJECT_OWNER"],
        effectivePermissionCodes: [...PROJECT_PERMISSION_CODES],
      },
    ],
    selectedProjectId: demoProject.id,
  };
}

export const authApi = {
  mode: isMockMode ? "mock" : "api",

  async login(
    login: string,
    password: string,
    isCurrent: AuthenticationOperationGuard = () => true,
  ): Promise<AuthLoginResult> {
    if (isMockMode) {
      const context = demoContext(login);
      sessionStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(context));
      return { kind: "AUTHENTICATED", context };
    }
    assertAuthenticationOperationCurrent(isCurrent);
    clearPendingMfaCeremonies();
    try {
      const response = await coordinateAuthSessionMutation(async () => {
        assertAuthenticationOperationCurrent(isCurrent);
        clearAuthSession();
        return initialAccessLogin({
          identifier: login,
          secret: password,
        });
      });
      assertAuthenticationOperationCurrent(isCurrent);
      return response as AuthLoginResult;
    } catch (cause) {
      if (isCurrent()) clearLocalAuthSession();
      throw cause;
    }
  },

  async completeMfaPasskey(
    challenge: MfaChallenge,
    label?: string,
    isCurrent: AuthenticationOperationGuard = () => true,
  ): Promise<MfaCompletionResult> {
    assertAuthenticationOperationCurrent(isCurrent);
    if (challenge.kind === "MFA_ENROLLMENT_REQUIRED") {
      const options =
        validPendingEnrollment(challenge.ceremonyToken) ??
        (await mfaApi.enrollmentOptions(challenge.ceremonyToken));
      pendingEnrollmentOptions.set(challenge.ceremonyToken, options);
      const credential = await startRegistration({
        optionsJSON:
          options.publicKey as unknown as PublicKeyCredentialCreationOptionsJSON,
      });
      assertAuthenticationOperationCurrent(isCurrent);
      const response = await coordinateAuthSessionMutation(() => {
        assertAuthenticationOperationCurrent(isCurrent);
        return mfaApi.completeEnrollment(
          options.ceremonyToken,
          credential,
          label,
        );
      });
      assertAuthenticationOperationCurrent(isCurrent);
      pendingEnrollmentOptions.delete(challenge.ceremonyToken);
      return response;
    }
    const credential = await startAuthentication({
      optionsJSON: challenge.publicKey,
    });
    assertAuthenticationOperationCurrent(isCurrent);
    await coordinateAuthSessionMutation(async () => {
      assertAuthenticationOperationCurrent(isCurrent);
      const authenticated = await mfaApi.completeAuthentication(
        challenge.ceremonyToken,
        credential,
      );
      assertAuthenticationOperationCurrent(isCurrent);
      rememberAccess(authenticated);
      return authenticated;
    });
    const context = await loadContext();
    assertAuthenticationOperationCurrent(isCurrent);
    return { kind: "AUTHENTICATED", context };
  },

  async completeMfaRecovery(
    challenge: Extract<MfaChallenge, { kind: "MFA_REQUIRED" }>,
    recoveryCode: string,
    label?: string,
    isCurrent: AuthenticationOperationGuard = () => true,
  ): Promise<MfaEnrolledResponse> {
    assertAuthenticationOperationCurrent(isCurrent);
    const options =
      validPendingEnrollment(challenge.ceremonyToken) ??
      (await mfaApi.completeRecovery(challenge.ceremonyToken, recoveryCode));
    pendingEnrollmentOptions.set(challenge.ceremonyToken, options);
    const credential = await startRegistration({
      optionsJSON:
        options.publicKey as unknown as PublicKeyCredentialCreationOptionsJSON,
    });
    assertAuthenticationOperationCurrent(isCurrent);
    const response = await coordinateAuthSessionMutation(() => {
      assertAuthenticationOperationCurrent(isCurrent);
      return mfaApi.completeEnrollment(options.ceremonyToken, credential, label);
    });
    assertAuthenticationOperationCurrent(isCurrent);
    pendingEnrollmentOptions.delete(challenge.ceremonyToken);
    return response;
  },

  cancelMfa(): void {
    clearPendingMfaCeremonies();
  },

  async restore(
    isCurrent: AuthenticationOperationGuard = () => true,
  ): Promise<AuthContext | null> {
    clearPendingMfaCeremonies();
    if (isMockMode) {
      const raw = sessionStorage.getItem(DEMO_SESSION_KEY);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as AuthContext;
      } catch {
        sessionStorage.removeItem(DEMO_SESSION_KEY);
        return null;
      }
    }
    try {
      await coordinateAccessTokenRefresh(async () => {
        assertAuthenticationOperationCurrent(isCurrent);
        const response = await initialAccessRefresh();
        assertAuthenticationOperationCurrent(isCurrent);
        rememberAccess(response);
      });
      assertAuthenticationOperationCurrent(isCurrent);
      const context = await loadContext();
      assertAuthenticationOperationCurrent(isCurrent);
      return context;
    } catch (cause) {
      if (isCurrent()) clearLocalAuthSession();
      throw cause;
    }
  },

  refreshContext(): Promise<AuthContext> {
    return loadContext();
  },

  async completePasswordSetup(
    setupToken: string,
    newPassword: string,
    passwordConfirmation: string,
  ): Promise<PasswordSetupResult> {
    const response = await initialAccessSetupPassword({
      setupToken,
      newPassword,
      passwordConfirmation,
    });
    return {
      kind: response.kind,
      status: response.status,
      nextAction: response.next,
    };
  },

  async logout(accessToken?: string | null): Promise<void> {
    clearPendingMfaCeremonies();
    if (isMockMode) {
      clearDemoSession();
      return;
    }
    beginAuthTeardown();
    try {
      await coordinateAuthSessionMutation(async () => {
        let token = accessToken ?? getAccessToken();
        try {
          token = (await initialAccessRefresh()).accessToken;
        } catch {
          // Fall back to the pre-cleanup token when the refresh cookie is unavailable.
        }
        if (!token) return;
        await cmsSecuritySettingsLogout(authTeardownRequestOptions(token));
      });
    } catch {
      // Logout remains locally authoritative when the session is already expired or offline.
    } finally {
      clearAuthSession();
      endAuthTeardown();
    }
  },

  async logoutAll(accessToken?: string | null): Promise<void> {
    clearPendingMfaCeremonies();
    if (isMockMode) {
      clearDemoSession();
      return;
    }
    beginAuthTeardown();
    try {
      await coordinateAuthSessionMutation(async () => {
        let token = accessToken ?? getAccessToken();
        try {
          token = (await initialAccessRefresh()).accessToken;
        } catch {
          // Fall back to the pre-cleanup token when the refresh cookie is unavailable.
        }
        if (!token) return;
        await cmsSecuritySettingsLogoutAll(authTeardownRequestOptions(token));
      });
    } catch {
      // Local credentials must still be removed when server-side revocation is unavailable.
    } finally {
      clearAuthSession();
      endAuthTeardown();
    }
  },
};
