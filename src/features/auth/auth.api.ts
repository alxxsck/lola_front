import {
  cmsSecuritySettingsLogout,
  cmsSecuritySettingsLogoutAll,
  cmsSessionContextMe,
  initialAccessLogin,
  initialAccessRefresh,
  initialAccessSetupPassword,
} from "@/shared/api/generated/lola-backend";
import type {
  CmsAuthenticatedResponseDto,
  CmsAuthenticatedUserResponseDto,
  CmsSessionProjectContextDto,
} from "@/shared/api/generated/models";
import { demoProject } from "@/shared/api/mock-data";
import {
  beginAuthTeardown,
  endAuthTeardown,
  refreshAccessToken,
  registerRefreshHandler,
} from "@/shared/api/http/axios-instance";
import {
  clearAuthSession,
  getAccessToken,
  getSelectedProjectId,
  storeAccessToken,
} from "@/shared/api/http/auth-session";
import { isMockMode } from "@/shared/config/data-mode";
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

const DEMO_SESSION_KEY = "lola-cms-demo-auth-v1";
const DEMO_KNOWLEDGE_PREFIX = "lola-cms-demo-knowledge-v1:";
const TRANSLATION_JOB_PREFIX = "lola:translation-jobs:";
const pendingEnrollmentOptions = new Map<string, MfaEnrollmentOptions>();

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
  rememberAccess(await initialAccessRefresh());
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

  async login(login: string, password: string): Promise<AuthLoginResult> {
    if (isMockMode) {
      const context = demoContext(login);
      sessionStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(context));
      return { kind: "AUTHENTICATED", context };
    }
    clearAuthSession();
    clearPendingMfaCeremonies();
    try {
      const response = await initialAccessLogin({
        identifier: login,
        secret: password,
      });
      if (response.kind !== "AUTHENTICATED") return response as AuthLoginResult;
      rememberAccess(response);
      return { kind: "AUTHENTICATED", context: await loadContext() };
    } catch (cause) {
      clearAuthSession();
      throw cause;
    }
  },

  async completeMfaPasskey(
    challenge: MfaChallenge,
    label?: string,
  ): Promise<MfaCompletionResult> {
    if (challenge.kind === "MFA_ENROLLMENT_REQUIRED") {
      const options =
        validPendingEnrollment(challenge.ceremonyToken) ??
        (await mfaApi.enrollmentOptions(challenge.ceremonyToken));
      pendingEnrollmentOptions.set(challenge.ceremonyToken, options);
      const credential = await startRegistration({
        optionsJSON:
          options.publicKey as unknown as PublicKeyCredentialCreationOptionsJSON,
      });
      const response = await mfaApi.completeEnrollment(
        options.ceremonyToken,
        credential,
        label,
      );
      pendingEnrollmentOptions.delete(challenge.ceremonyToken);
      return response;
    }
    const credential = await startAuthentication({
      optionsJSON: challenge.publicKey,
    });
    const response = await mfaApi.completeAuthentication(
      challenge.ceremonyToken,
      credential,
    );
    rememberAccess(response);
    return { kind: "AUTHENTICATED", context: await loadContext() };
  },

  async completeMfaRecovery(
    challenge: Extract<MfaChallenge, { kind: "MFA_REQUIRED" }>,
    recoveryCode: string,
    label?: string,
  ): Promise<MfaEnrolledResponse> {
    const options =
      validPendingEnrollment(challenge.ceremonyToken) ??
      (await mfaApi.completeRecovery(challenge.ceremonyToken, recoveryCode));
    pendingEnrollmentOptions.set(challenge.ceremonyToken, options);
    const credential = await startRegistration({
      optionsJSON:
        options.publicKey as unknown as PublicKeyCredentialCreationOptionsJSON,
    });
    const response = await mfaApi.completeEnrollment(
      options.ceremonyToken,
      credential,
      label,
    );
    pendingEnrollmentOptions.delete(challenge.ceremonyToken);
    return response;
  },

  cancelMfa(): void {
    clearPendingMfaCeremonies();
  },

  async restore(): Promise<AuthContext | null> {
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
      const response = await initialAccessRefresh();
      rememberAccess(response);
      return await loadContext();
    } catch (cause) {
      clearAuthSession();
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

  async logout(): Promise<void> {
    clearPendingMfaCeremonies();
    if (isMockMode) {
      clearDemoSession();
      return;
    }
    try {
      if (!getAccessToken()) await refreshAccessToken();
      beginAuthTeardown();
      await cmsSecuritySettingsLogout();
    } catch {
      // Logout remains locally authoritative when the session is already expired or offline.
    } finally {
      clearAuthSession();
      endAuthTeardown();
    }
  },

  async logoutAll(): Promise<void> {
    clearPendingMfaCeremonies();
    if (isMockMode) {
      clearDemoSession();
      return;
    }
    try {
      if (!getAccessToken()) await refreshAccessToken();
      beginAuthTeardown();
      await cmsSecuritySettingsLogoutAll();
    } catch {
      // Local credentials must still be removed when server-side revocation is unavailable.
    } finally {
      clearAuthSession();
      endAuthTeardown();
    }
  },
};
