import { createPinia, setActivePinia } from "pinia";
import {
  AxiosError,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authApi } from "@/features/auth/auth.api";
import { useAuthStore } from "@/features/auth/auth.store";
import { axiosInstance } from "@/shared/api/http/axios-instance";
import { router } from "./router";

vi.mock("@/features/auth/auth.api", () => ({
  authApi: {
    mode: "api",
    cancelMfa: vi.fn(),
    login: vi.fn(),
    restore: vi.fn().mockResolvedValue(null),
    logout: vi.fn(),
    logoutAll: vi.fn(),
    completePasswordSetup: vi.fn(),
    completeMfaPasskey: vi.fn(),
    completeMfaRecovery: vi.fn(),
    refreshContext: vi.fn(),
  },
}));

describe("authentication routes", () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    await router.replace("/login");
  });

  it("allows the memory-bound setup state to enter the dedicated route", async () => {
    const auth = useAuthStore();
    auth.$patch({ phase: "SETUP_REQUIRED", setupToken: "lps_setup-secret" });

    await router.push("/password/setup");

    expect(router.currentRoute.value.name).toBe("password-setup");
  });

  it("returns a reload or direct setup URL to login when the memory capability is absent", async () => {
    await router.push("/password/setup");

    expect(router.currentRoute.value.name).toBe("login");
  });

  it("allows only an in-memory MFA ceremony to enter the dedicated route", async () => {
    const auth = useAuthStore();
    auth.$patch({
      phase: "MFA_REQUIRED",
      mfaChallenge: {
        kind: "MFA_REQUIRED",
        ceremonyToken: "lmf_memory-only",
        expiresAt: "2026-07-21T21:10:00.000Z",
        publicKey: { challenge: "challenge" },
        recoveryAvailable: true,
      },
    });

    await router.push("/auth/mfa");
    expect(router.currentRoute.value.name).toBe("mfa");

    auth.cancelMfa();
    await router.push("/overview");
    await router.push("/auth/mfa");
    expect(router.currentRoute.value.name).toBe("login");
  });

  it("hands an active session requiring MFA back to login without replaying the protected request", async () => {
    const auth = useAuthStore();
    const project = {
      id: "project-1",
      name: "Project One",
      slug: "project-one",
      status: "ACTIVE" as const,
      publicKey: "public",
      defaultLocale: "ru",
      supportedLocales: ["ru"],
      assistantName: "Lola",
      systemPrompt: "",
      voiceInstructions: "",
      settings: {},
      effectivePermissionCodes: ["project.settings.read"],
    };
    auth.$patch({
      restored: true,
      phase: "AUTHENTICATED",
      user: {
        id: "operator-1",
        email: "operator@example.com",
        name: "Operator",
      },
      project,
      projects: [project],
    });
    await router.push("/project");
    let attempts = 0;
    axiosInstance.defaults.adapter = async (config) => {
      attempts += 1;
      const response: AxiosResponse = {
        data: {
          code: "MFA_ENROLLMENT_REQUIRED",
          message: "Platform Operator MFA is required",
        },
        status: 428,
        statusText: "Precondition Required",
        headers: {},
        config: config as InternalAxiosRequestConfig,
      };
      throw new AxiosError(
        "Request failed",
        "ERR_BAD_REQUEST",
        config,
        undefined,
        response,
      );
    };

    await expect(
      axiosInstance.get("/api/v1/admin/projects/project-1/settings"),
    ).rejects.toMatchObject({ status: 428, code: "MFA_ENROLLMENT_REQUIRED" });
    await vi.waitFor(() =>
      expect(router.currentRoute.value.name).toBe("login"),
    );

    expect(router.currentRoute.value.query).toMatchObject({
      redirect: "/project",
      mfa: "MFA_ENROLLMENT_REQUIRED",
    });
    expect(auth.phase).toBe("ANONYMOUS");
    expect(auth.mfaChallenge).toBeNull();
    expect(attempts).toBe(1);
  });

  it("allows the CMS User control plane only with the exact read Permission", async () => {
    const auth = useAuthStore();
    auth.$patch({
      restored: true,
      phase: "AUTHENTICATED",
      user: {
        id: "operator-1",
        email: "operator@example.com",
        name: "Operator",
        platformPermissionCodes: ["platform.cms_users.read"],
      },
    });

    await router.push("/platform/cms-users");
    expect(router.currentRoute.value.name).toBe("platform-cms-users");

    auth.user!.platformPermissionCodes = [];
    await router.push("/platform/cms-users/user-1");
    expect(router.currentRoute.value.name).toBe("security-settings");
  });

  it("allows every authenticated CMS User to open personal security settings", async () => {
    const auth = useAuthStore();
    auth.$patch({
      restored: true,
      phase: "AUTHENTICATED",
      user: {
        id: "operator-1",
        email: "operator@example.com",
        name: "Operator",
      },
    });

    await router.push("/settings/security");

    expect(router.currentRoute.value.name).toBe("security-settings");
  });

  it("guards Project integrations with the dedicated notification read Permission", async () => {
    const auth = useAuthStore();
    const project = {
      id: "project-1",
      name: "Project One",
      slug: "project-one",
      status: "ACTIVE" as const,
      publicKey: "public",
      defaultLocale: "ru",
      supportedLocales: ["ru"],
      assistantName: "Lola",
      systemPrompt: "",
      voiceInstructions: "",
      settings: {},
      effectivePermissionCodes: ["project.notifications.read"],
    };
    auth.$patch({
      restored: true,
      phase: "AUTHENTICATED",
      user: {
        id: "operator-1",
        email: "operator@example.com",
        name: "Operator",
      },
      project,
      projects: [project],
    });

    await router.push("/settings/integrations");
    expect(router.currentRoute.value.name).toBe("project-integrations");

    auth.project!.effectivePermissionCodes = ["project.settings.read"];
    await router.push("/overview");
    await router.push("/settings/integrations");
    expect(router.currentRoute.value.name).toBe("overview");
  });

  it("selects the Project encoded by an AI Proposal deep link before checking access", async () => {
    const auth = useAuthStore();
    const makeProject = (id: string, permissions: string[]) => ({
      id,
      name: id,
      slug: id,
      status: "ACTIVE" as const,
      publicKey: `public-${id}`,
      defaultLocale: "ru",
      supportedLocales: ["ru"],
      assistantName: "Lola",
      systemPrompt: "",
      voiceInstructions: "",
      settings: {},
      effectivePermissionCodes: permissions,
    });
    const current = makeProject("project-1", []);
    const target = makeProject("project-2", ["project.ai_proposals.read"]);
    auth.$patch({
      restored: true,
      phase: "AUTHENTICATED",
      user: {
        id: "operator-1",
        email: "operator@example.com",
        name: "Operator",
      },
      project: current,
      projects: [current, target],
    });

    await router.push("/ai-proposals/proposal-1?projectId=project-2");

    expect(router.currentRoute.value.name).toBe("ai-proposal-detail");
    expect(auth.project?.id).toBe("project-2");
  });

  it("removes an email capability fragment and skips session restoration before rendering", async () => {
    const auth = useAuthStore();
    auth.$patch({ restored: false, phase: "ANONYMOUS" });
    vi.mocked(authApi.restore).mockClear();
    const capability =
      "lev_00000000-0000-4000-8000-000000000001.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

    await router.push(`/auth/email-verification#token=${capability}`);

    expect(router.currentRoute.value.name).toBe("email-verification");
    expect(router.currentRoute.value.hash).toBe("");
    expect(window.location.href).not.toContain(capability);
    expect(authApi.restore).not.toHaveBeenCalled();
  });

  it("sanitizes a password-reset fragment before rendering and keeps both recovery GET routes inert", async () => {
    vi.mocked(authApi.restore).mockClear();
    const capability =
      "lpr_00000000-0000-4000-8000-000000000001.DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD";

    await router.push(`/auth/password-reset#token=${capability}`);

    expect(router.currentRoute.value.name).toBe("password-reset");
    expect(router.currentRoute.value.hash).toBe("");
    expect(window.location.href).not.toContain(capability);
    expect(authApi.restore).not.toHaveBeenCalled();

    await router.push("/forgot-password");
    expect(router.currentRoute.value.name).toBe("forgot-password");
    expect(authApi.restore).not.toHaveBeenCalled();
  });

  it("allows Project Memberships only through the exact Platform-or-selected-Project read Permission", async () => {
    const auth = useAuthStore();
    const project = {
      id: "project-1",
      name: "Project One",
      slug: "project-one",
      status: "ACTIVE" as const,
      publicKey: "public",
      defaultLocale: "ru",
      supportedLocales: ["ru"],
      assistantName: "Lola",
      systemPrompt: "",
      voiceInstructions: "",
      settings: {},
      effectivePermissionCodes: ["project.members.read"],
    };
    auth.$patch({
      restored: true,
      phase: "AUTHENTICATED",
      user: {
        id: "operator-1",
        email: "operator@example.com",
        name: "Operator",
      },
      project,
      projects: [project],
    });

    await router.push("/project/memberships");
    expect(router.currentRoute.value.name).toBe("project-memberships");

    auth.project!.effectivePermissionCodes = ["project.roles.read"];
    auth.user!.platformPermissionCodes = ["platform.memberships.read"];
    await router.push("/overview");
    await router.push("/project/memberships");
    expect(router.currentRoute.value.name).toBe("project-memberships");

    auth.user!.platformPermissionCodes = ["platform.projects.read"];
    await router.push("/overview");
    await router.push("/project/memberships");
    expect(router.currentRoute.value.name).toBe("overview");
  });

  it("allows Project Roles only through the exact Platform-or-selected-Project role read Permission", async () => {
    const auth = useAuthStore();
    const project = {
      id: "project-1",
      name: "Project One",
      slug: "project-one",
      status: "ACTIVE" as const,
      publicKey: "public",
      defaultLocale: "ru",
      supportedLocales: ["ru"],
      assistantName: "Lola",
      systemPrompt: "",
      voiceInstructions: "",
      settings: {},
      effectivePermissionCodes: ["project.roles.read"],
    };
    auth.$patch({
      restored: true,
      phase: "AUTHENTICATED",
      user: {
        id: "operator-1",
        email: "operator@example.com",
        name: "Operator",
      },
      project,
      projects: [project],
    });

    await router.push("/project/roles");
    expect(router.currentRoute.value.name).toBe("project-roles");

    auth.project!.effectivePermissionCodes = ["project.members.read"];
    auth.user!.platformPermissionCodes = ["platform.roles.read"];
    await router.push("/overview");
    await router.push("/project/roles");
    expect(router.currentRoute.value.name).toBe("project-roles");

    auth.user!.platformPermissionCodes = ["platform.projects.read"];
    await router.push("/overview");
    await router.push("/project/roles");
    expect(router.currentRoute.value.name).toBe("overview");
  });

  it("guards authoring routes with the exact selected-Project Permission and no role fallback", async () => {
    const auth = useAuthStore();
    const project = {
      id: "project-1",
      name: "Project One",
      slug: "project-one",
      status: "ACTIVE" as const,
      publicKey: "public",
      defaultLocale: "ru",
      supportedLocales: ["ru"],
      assistantName: "Lola",
      systemPrompt: "",
      voiceInstructions: "",
      settings: {},
      effectivePermissionCodes: ["project.knowledge.read"],
    };
    auth.$patch({
      restored: true,
      phase: "AUTHENTICATED",
      user: {
        id: "operator-1",
        email: "operator@example.com",
        name: "Operator",
      },
      project,
      projects: [project],
    });

    await router.push("/knowledge");
    expect(router.currentRoute.value.name).toBe("knowledge");

    auth.project!.effectivePermissionCodes = [];
    await router.push("/overview");
    await router.push("/knowledge");
    expect(router.currentRoute.value.name).toBe("overview");
  });

  it.each([
    "project.settings.read",
    "project.profile_contract.read",
    "project.speech.read",
    "project.ai_usage.read",
  ])(
    "allows the composite Project settings surface through independent %s authority",
    async (permission) => {
      const auth = useAuthStore();
      const project = {
        id: "project-1",
        name: "Project One",
        slug: "project-one",
        status: "ACTIVE" as const,
        publicKey: "public",
        defaultLocale: "ru",
        supportedLocales: ["ru"],
        assistantName: "Lola",
        systemPrompt: "",
        voiceInstructions: "",
        settings: {},
        effectivePermissionCodes: [permission],
      };
      auth.$patch({
        restored: true,
        phase: "AUTHENTICATED",
        user: {
          id: "operator-1",
          email: "operator@example.com",
          name: "Operator",
        },
        project,
        projects: [project],
      });

      await router.push("/project");

      expect(router.currentRoute.value.name).toBe("project");
    },
  );

  it("rejects the composite Project settings surface without any section read Permission", async () => {
    const auth = useAuthStore();
    const project = {
      id: "project-1",
      name: "Project One",
      slug: "project-one",
      status: "ACTIVE" as const,
      publicKey: "public",
      defaultLocale: "ru",
      supportedLocales: ["ru"],
      assistantName: "Lola",
      systemPrompt: "",
      voiceInstructions: "",
      settings: {},
      effectivePermissionCodes: ["project.knowledge.read"],
    };
    auth.$patch({
      restored: true,
      phase: "AUTHENTICATED",
      user: {
        id: "operator-1",
        email: "operator@example.com",
        name: "Operator",
      },
      project,
      projects: [project],
    });

    await router.push("/project");

    expect(router.currentRoute.value.name).toBe("overview");
  });

  it("separates profile-list and live-presence route authority", async () => {
    const auth = useAuthStore();
    const project = {
      id: "project-1",
      name: "Project One",
      slug: "project-one",
      status: "ACTIVE" as const,
      publicKey: "public",
      defaultLocale: "ru",
      supportedLocales: ["ru"],
      assistantName: "Lola",
      systemPrompt: "",
      voiceInstructions: "",
      settings: {},
      effectivePermissionCodes: ["project.profiles.read"],
    };
    auth.$patch({
      restored: true,
      phase: "AUTHENTICATED",
      user: {
        id: "operator-1",
        email: "operator@example.com",
        name: "Operator",
      },
      project,
      projects: [project],
    });

    await router.push("/users");
    expect(router.currentRoute.value.name).toBe("users");
    await router.push("/live");
    expect(router.currentRoute.value.name).toBe("overview");

    auth.project!.effectivePermissionCodes = ["project.end_users.read"];
    await router.push("/live");
    expect(router.currentRoute.value.name).toBe("live");
    await router.push("/users");
    expect(router.currentRoute.value.name).toBe("overview");
  });
});
