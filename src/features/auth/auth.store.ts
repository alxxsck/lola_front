import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { authApi, type AuthContext, type MfaChallenge } from "./auth.api";
import { registerUnauthorizedHandler } from "@/shared/api/http/axios-instance";
import {
  clearAuthSession,
  storeSelectedProjectId,
} from "@/shared/api/http/auth-session";
import { ApiError } from "@/shared/api/http/api-error";
import type { AuthProject, CmsUser, Project } from "@/shared/types/domain";

export type AuthPhase =
  | "ANONYMOUS"
  | "LOGIN_PENDING"
  | "SETUP_REQUIRED"
  | "SETUP_PENDING"
  | "MFA_ENROLLMENT_REQUIRED"
  | "MFA_REQUIRED"
  | "MFA_PENDING"
  | "MFA_RECOVERY_CODES"
  | "ANONYMOUS_WITH_SETUP_SUCCESS"
  | "AUTHENTICATED";

export const useAuthStore = defineStore("auth", () => {
  const user = ref<CmsUser | null>(null);
  const project = ref<AuthProject | null>(null);
  const projects = ref<AuthProject[]>([]);
  const phase = ref<AuthPhase>("ANONYMOUS");
  const setupToken = ref<string | null>(null);
  const mfaChallenge = ref<MfaChallenge | null>(null);
  const recoveryCodes = ref<string[]>([]);
  const restored = ref(false);
  const restoring = ref(false);
  let restorePromise: Promise<void> | null = null;
  let setupAttemptId = 0;
  const isAuthenticated = computed(
    () => phase.value === "AUTHENTICATED" && Boolean(user.value),
  );
  const requiresPasswordSetup = computed(
    () => phase.value === "SETUP_REQUIRED" || phase.value === "SETUP_PENDING",
  );
  const requiresProjectSelection = computed(() =>
    Boolean(user.value && projects.value.length > 1 && !project.value),
  );
  const authenticatedLandingPath = computed(() => {
    if (requiresProjectSelection.value) return "/login";
    if (project.value) return "/overview";
    if (
      user.value?.platformPermissionCodes?.includes("platform.cms_users.read")
    )
      return "/platform/cms-users";
    if (
      user.value?.platformPermissionCodes?.includes(
        "platform.notifications.operations.read",
      )
    )
      return "/platform/notification-operations";
    return "/settings/security";
  });

  function clearLocalState() {
    user.value = null;
    project.value = null;
    projects.value = [];
  }

  function resetAuthentication() {
    setupAttemptId += 1;
    setupToken.value = null;
    mfaChallenge.value = null;
    recoveryCodes.value = [];
    authApi.cancelMfa();
    clearAuthSession();
    clearLocalState();
    phase.value = "ANONYMOUS";
  }

  function applyContext(context: AuthContext) {
    user.value = context.user;
    projects.value = context.projects;
    const selectedId =
      context.projects.length === 1
        ? context.projects[0]?.id
        : context.selectedProjectId;
    project.value =
      context.projects.find((item) => item.id === selectedId) ?? null;
    if (project.value) storeSelectedProjectId(project.value.id);
  }

  async function restore() {
    if (restored.value) return;
    if (restorePromise) return restorePromise;
    restorePromise = (async () => {
      restoring.value = true;
      try {
        const context = await authApi.restore();
        if (context) {
          applyContext(context);
          phase.value = "AUTHENTICATED";
        }
      } catch {
        clearLocalState();
        phase.value = "ANONYMOUS";
      } finally {
        restored.value = true;
        restoring.value = false;
        restorePromise = null;
      }
    })();
    return restorePromise;
  }

  async function refreshContext() {
    if (phase.value !== "AUTHENTICATED") return;
    try {
      applyContext(await authApi.refreshContext());
    } catch (cause) {
      resetAuthentication();
      throw cause;
    }
  }

  async function login(login: string, password: string) {
    // An explicit credential ceremony becomes authoritative over any stale restore attempt.
    restored.value = true;
    phase.value = "LOGIN_PENDING";
    setupToken.value = null;
    mfaChallenge.value = null;
    recoveryCodes.value = [];
    try {
      const result = await authApi.login(login, password);
      if (result.kind === "PASSWORD_SETUP_REQUIRED") {
        clearLocalState();
        setupToken.value = result.setupToken;
        phase.value = "SETUP_REQUIRED";
        return result.kind;
      }
      if (
        result.kind === "MFA_ENROLLMENT_REQUIRED" ||
        result.kind === "MFA_REQUIRED"
      ) {
        clearLocalState();
        mfaChallenge.value = result;
        phase.value = result.kind;
        return result.kind;
      }
      applyContext(result.context);
      phase.value = "AUTHENTICATED";
      return result.kind;
    } catch (cause) {
      clearLocalState();
      phase.value = "ANONYMOUS";
      throw cause;
    }
  }

  async function completeMfaPasskey(label?: string) {
    const challenge = mfaChallenge.value;
    if (!challenge) throw new Error("MFA-сессия недоступна. Войдите ещё раз.");
    phase.value = "MFA_PENDING";
    try {
      const result = await authApi.completeMfaPasskey(challenge, label);
      if (result.kind === "AUTHENTICATED") {
        mfaChallenge.value = null;
        applyContext(result.context);
        phase.value = "AUTHENTICATED";
      } else {
        mfaChallenge.value = null;
        recoveryCodes.value = [...result.recoveryCodes];
        phase.value = "MFA_RECOVERY_CODES";
      }
      return result.kind;
    } catch (cause) {
      phase.value = challenge.kind;
      throw cause;
    }
  }

  async function completeMfaRecovery(recoveryCode: string, label?: string) {
    const challenge = mfaChallenge.value;
    if (!challenge || challenge.kind !== "MFA_REQUIRED") {
      throw new Error("MFA recovery-сессия недоступна. Войдите ещё раз.");
    }
    phase.value = "MFA_PENDING";
    try {
      const result = await authApi.completeMfaRecovery(
        challenge,
        recoveryCode,
        label,
      );
      mfaChallenge.value = null;
      recoveryCodes.value = [...result.recoveryCodes];
      phase.value = "MFA_RECOVERY_CODES";
      return result.kind;
    } catch (cause) {
      phase.value = challenge.kind;
      throw cause;
    }
  }

  function acknowledgeRecoveryCodes() {
    resetAuthentication();
    restored.value = true;
  }

  function cancelMfa() {
    resetAuthentication();
    restored.value = true;
  }

  function requireMfaReauthentication() {
    resetAuthentication();
    restored.value = true;
  }

  function beginEmailedPasswordSetup(token: string) {
    setupAttemptId += 1;
    clearAuthSession();
    clearLocalState();
    setupToken.value = token;
    phase.value = "SETUP_REQUIRED";
    restored.value = true;
    restoring.value = false;
  }

  async function completePasswordSetup(
    newPassword: string,
    passwordConfirmation: string,
  ) {
    const token = setupToken.value;
    if (!token)
      throw new Error("Сессия установки пароля недоступна. Войдите ещё раз.");
    const attemptId = ++setupAttemptId;
    phase.value = "SETUP_PENDING";
    try {
      const result = await authApi.completePasswordSetup(
        token,
        newPassword,
        passwordConfirmation,
      );
      if (attemptId === setupAttemptId && setupToken.value === token) {
        setupToken.value = null;
        phase.value = "ANONYMOUS_WITH_SETUP_SUCCESS";
      }
      return result.kind;
    } catch (cause) {
      if (attemptId === setupAttemptId && setupToken.value === token) {
        if (
          cause instanceof ApiError &&
          cause.code === "PASSWORD_SETUP_TOKEN_INVALID"
        )
          resetAuthentication();
        else phase.value = "SETUP_REQUIRED";
      }
      throw cause;
    }
  }

  function cancelPasswordSetup() {
    resetAuthentication();
  }

  function finishExternalPasswordReset() {
    resetAuthentication();
    restored.value = true;
  }

  function selectProject(projectId: string) {
    const selected = projects.value.find((item) => item.id === projectId);
    if (!selected) throw new Error("Проект недоступен текущему пользователю");
    project.value = selected;
    storeSelectedProjectId(selected.id);
  }

  function updateProject(next: Project) {
    const current = projects.value.find((item) => item.id === next.id);
    const projectWithAccess = {
      ...next,
      membershipId: current?.membershipId,
      membershipStatus: current?.membershipStatus,
      membershipVersion: current?.membershipVersion,
      roleKeys: current?.roleKeys,
      effectivePermissionCodes: current?.effectivePermissionCodes,
    };
    project.value = projectWithAccess;
    projects.value = projects.value.map((item) =>
      item.id === next.id ? projectWithAccess : item,
    );
  }

  async function logout(allDevices = false) {
    try {
      if (allDevices) await authApi.logoutAll();
      else await authApi.logout();
    } finally {
      resetAuthentication();
    }
  }

  registerUnauthorizedHandler(resetAuthentication);

  return {
    user,
    project,
    projects,
    phase,
    setupToken,
    mfaChallenge,
    recoveryCodes,
    restored,
    restoring,
    isAuthenticated,
    requiresPasswordSetup,
    requiresProjectSelection,
    authenticatedLandingPath,
    restore,
    refreshContext,
    login,
    beginEmailedPasswordSetup,
    completePasswordSetup,
    completeMfaPasskey,
    completeMfaRecovery,
    acknowledgeRecoveryCodes,
    cancelMfa,
    requireMfaReauthentication,
    cancelPasswordSetup,
    finishExternalPasswordReset,
    logout,
    selectProject,
    updateProject,
    mode: authApi.mode,
  };
});
