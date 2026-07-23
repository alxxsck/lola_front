import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "@/features/auth/auth.store";
import {
  hasProjectPermission,
  PROJECT_SETTINGS_SURFACE_READ_PERMISSIONS,
} from "@/features/auth/permission-access";
import { canReadProjectMemberships } from "@/features/project-memberships/model/project-membership-permissions";
import { canReadProjectRoles } from "@/features/project-roles/model/project-role-permissions";
import {
  captureEmailActionCapability,
  clearEmailActionCapability,
  type EmailActionKind,
} from "@/features/email-identity/email-action-capability";
import AppShell from "@/widgets/layout/AppShell.vue";
import { registerMfaRequirementHandler } from "@/shared/api/http/axios-instance";

export const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    {
      path: "/login",
      name: "login",
      component: () => import("@/pages/LoginPage.vue"),
      meta: { public: true },
    },
    {
      path: "/password/setup",
      name: "password-setup",
      component: () => import("@/pages/PasswordSetupPage.vue"),
      meta: { public: true },
    },
    {
      path: "/auth/mfa",
      name: "mfa",
      component: () => import("@/pages/MfaPage.vue"),
      meta: { public: true },
    },
    {
      path: "/forgot-password",
      name: "forgot-password",
      component: () => import("@/pages/ForgotPasswordPage.vue"),
      meta: { public: true, skipAuthRestore: true },
    },
    {
      path: "/auth/initial-access",
      name: "email-initial-access",
      component: () => import("@/pages/EmailActionLandingPage.vue"),
      props: { action: "initial-access" },
      meta: { public: true, emailAction: "initial-access" },
    },
    {
      path: "/auth/email-verification",
      name: "email-verification",
      component: () => import("@/pages/EmailActionLandingPage.vue"),
      props: { action: "verification" },
      meta: { public: true, emailAction: "verification" },
    },
    {
      path: "/auth/email-change",
      name: "email-change",
      component: () => import("@/pages/EmailActionLandingPage.vue"),
      props: { action: "email-change" },
      meta: { public: true, emailAction: "email-change" },
    },
    {
      path: "/auth/password-reset",
      name: "password-reset",
      component: () => import("@/pages/PasswordResetPage.vue"),
      meta: { public: true, emailAction: "password-reset" },
    },
    {
      path: "/",
      component: AppShell,
      children: [
        { path: "", redirect: "/overview" },
        {
          path: "overview",
          name: "overview",
          component: () => import("@/pages/OverviewPage.vue"),
        },
        {
          path: "settings/security",
          name: "security-settings",
          component: () => import("@/pages/SecuritySettingsPage.vue"),
        },
        {
          path: "settings/integrations",
          name: "project-integrations",
          component: () => import("@/pages/ProjectIntegrationsPage.vue"),
          meta: { projectPermission: "project.notifications.read" },
        },
        {
          path: "platform/cms-users/:cmsUserId?",
          name: "platform-cms-users",
          component: () => import("@/pages/PlatformCmsUsersPage.vue"),
          meta: { platformPermission: "platform.cms_users.read" },
        },
        {
          path: "project",
          name: "project",
          component: () => import("@/pages/ProjectPage.vue"),
          meta: {
            projectPermissionsAny: [
              ...PROJECT_SETTINGS_SURFACE_READ_PERMISSIONS,
            ],
          },
        },
        {
          path: "project/memberships",
          name: "project-memberships",
          component: () => import("@/pages/ProjectMembershipsPage.vue"),
          meta: { projectMembershipAccess: true },
        },
        {
          path: "project/roles",
          name: "project-roles",
          component: () => import("@/pages/ProjectRolesPage.vue"),
          meta: { projectRoleAccess: true },
        },
        {
          path: "profile-fields",
          name: "project-user-attributes",
          component: () => import("@/pages/ProjectUserAttributesPage.vue"),
          meta: { projectPermission: "project.profile_contract.read" },
        },
        {
          path: "profile-fields/integration",
          name: "profile-fields-integration",
          component: () => import("@/pages/ProfileIntegrationPage.vue"),
          meta: { projectPermission: "project.profile_contract.read" },
        },
        {
          path: "profile-fields/new",
          name: "profile-field-create",
          component: () => import("@/pages/ProfileFieldEditorPage.vue"),
          meta: { projectPermission: "project.profile_contract.write" },
        },
        {
          path: "profile-fields/:definitionId",
          name: "profile-field-edit",
          component: () => import("@/pages/ProfileFieldEditorPage.vue"),
          meta: { projectPermission: "project.profile_contract.write" },
        },
        {
          path: "project/user-attributes",
          redirect: "/profile-fields",
        },
        {
          path: "knowledge",
          name: "knowledge",
          component: () => import("@/pages/KnowledgePage.vue"),
          meta: { projectPermission: "project.knowledge.read" },
        },
        {
          path: "interface/:kind?",
          name: "interface",
          component: () => import("@/pages/InterfacePage.vue"),
          meta: { projectPermission: "project.ui_registry.read" },
        },
        {
          path: "events",
          name: "events",
          component: () => import("@/pages/EventsPage.vue"),
          meta: { projectPermission: "project.event_catalog.read" },
        },
        {
          path: "events/:definitionKeyId",
          name: "event-definition-workspace",
          component: () => import("@/pages/EventDefinitionWorkspacePage.vue"),
          meta: { projectPermission: "project.event_catalog.read" },
        },
        {
          path: "event-logs",
          name: "event-logs",
          component: () => import("@/pages/EventLogsPage.vue"),
          meta: { projectPermission: "project.event_logs.read" },
        },
        {
          path: "actions",
          name: "actions",
          component: () => import("@/pages/ActionsPage.vue"),
          meta: { projectPermission: "project.actions.read" },
        },
        {
          path: "ai-proposals",
          name: "ai-proposals",
          component: () => import("@/pages/AIProposalsPage.vue"),
          meta: { projectPermission: "project.ai_proposals.read" },
        },
        {
          path: "ai-proposals/:proposalId",
          name: "ai-proposal-detail",
          component: () => import("@/pages/AIProposalsPage.vue"),
          meta: { projectPermission: "project.ai_proposals.read" },
        },
        {
          path: "docs",
          name: "documentation",
          component: () => import("@/pages/DocumentationPage.vue"),
        },
        {
          path: "docs/scenarios",
          name: "scenario-guide",
          component: () => import("@/pages/ScenarioGuidePage.vue"),
        },
        {
          path: "docs/profile-fields",
          name: "profile-fields-guide",
          component: () => import("@/pages/ProfileFieldsGuidePage.vue"),
        },
        {
          path: "docs/segments",
          name: "segments-guide",
          component: () => import("@/pages/SegmentsGuidePage.vue"),
        },
        {
          path: "scenarios",
          name: "scenarios",
          component: () => import("@/pages/ScenariosPage.vue"),
          meta: { projectPermission: "project.scenarios.read" },
        },
        {
          path: "scenarios/new",
          name: "scenario-create",
          component: () => import("@/pages/ScenarioEditorPage.vue"),
          meta: { projectPermission: "project.scenarios.write" },
        },
        {
          path: "scenarios/:scenarioId",
          name: "scenario-edit",
          component: () => import("@/pages/ScenarioEditorPage.vue"),
          meta: { projectPermission: "project.scenarios.read" },
        },
        {
          path: "segments",
          name: "segments",
          component: () => import("@/pages/SegmentsPage.vue"),
          meta: { projectPermission: "project.segments.read" },
        },
        {
          path: "segments/new",
          name: "segment-create",
          component: () => import("@/pages/SegmentsPage.vue"),
          meta: { projectPermission: "project.segments.write" },
        },
        {
          path: "segments/:segmentId",
          name: "segment-detail",
          component: () => import("@/pages/SegmentsPage.vue"),
          meta: { projectPermission: "project.segments.read" },
        },
        {
          path: "segments/:segmentId/revisions/new",
          name: "segment-revision-create",
          component: () => import("@/pages/SegmentsPage.vue"),
          meta: { projectPermission: "project.segments.write" },
        },
        {
          path: "segments/:segmentId/revisions/:segmentRevisionId",
          name: "segment-revision-detail",
          component: () => import("@/pages/SegmentsPage.vue"),
          meta: { projectPermission: "project.segments.read" },
        },
        {
          path: "users/:endUserId?",
          name: "users",
          component: () => import("@/pages/UsersPage.vue"),
          meta: { projectPermission: "project.profiles.read" },
        },
        {
          path: "live",
          name: "live",
          component: () => import("@/pages/LivePage.vue"),
          meta: { projectPermission: "project.end_users.read" },
        },
        {
          path: "operations",
          name: "operations",
          component: () => import("@/pages/OperationsPage.vue"),
          meta: {
            projectPermissionsAny: [
              "project.event_logs.read",
              "project.scenario_runs.read",
              "project.audit.read",
            ],
          },
        },
      ],
    },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});

registerMfaRequirementHandler((code) => {
  const auth = useAuthStore();
  if (!auth.isAuthenticated) return;
  const redirect = router.currentRoute.value.fullPath;
  auth.requireMfaReauthentication();
  void router.replace({
    name: "login",
    query: {
      ...(redirect && redirect !== "/login" ? { redirect } : {}),
      mfa: code,
    },
  });
});

router.beforeEach(async (to) => {
  const emailAction = to.meta.emailAction;
  if (isEmailAction(emailAction)) {
    if (to.hash) {
      captureEmailActionCapability(emailAction, to.hash);
      return { path: to.path, query: to.query, hash: "", replace: true };
    }
    return true;
  }
  if (to.meta.skipAuthRestore) return true;
  const auth = useAuthStore();
  await auth.restore();
  if (to.name === "password-setup" && !auth.requiresPasswordSetup)
    return { name: "login" };
  if (
    to.name === "mfa" &&
    !auth.mfaChallenge &&
    auth.phase !== "MFA_RECOVERY_CODES"
  )
    return { name: "login" };
  if (auth.mfaChallenge && to.name !== "mfa") return { name: "mfa" };
  if (!to.meta.public && !auth.isAuthenticated)
    return { name: "login", query: { redirect: to.fullPath } };
  if (to.name === "ai-proposal-detail" && typeof to.query.projectId === "string") {
    const target = auth.projects.find((project) => project.id === to.query.projectId);
    if (!target) return auth.authenticatedLandingPath;
    if (auth.project?.id !== target.id) auth.selectProject(target.id);
  }
  if (to.name === "overview" && auth.isAuthenticated && !auth.project)
    return auth.authenticatedLandingPath;
  if (
    typeof to.meta.platformPermission === "string" &&
    !auth.user?.platformPermissionCodes?.includes(to.meta.platformPermission)
  )
    return auth.authenticatedLandingPath;
  if (
    typeof to.meta.projectPermission === "string" &&
    (!auth.project ||
      !hasProjectPermission(
        auth.project.effectivePermissionCodes ?? [],
        to.meta.projectPermission as Parameters<typeof hasProjectPermission>[1],
      ))
  )
    return auth.authenticatedLandingPath;
  if (
    Array.isArray(to.meta.projectPermissionsAny) &&
    !to.meta.projectPermissionsAny.some((permission) =>
      hasProjectPermission(
        auth.project?.effectivePermissionCodes ?? [],
        permission as Parameters<typeof hasProjectPermission>[1],
      ),
    )
  )
    return auth.authenticatedLandingPath;
  if (
    to.meta.projectMembershipAccess &&
    (!auth.project ||
      !canReadProjectMemberships(
        auth.user?.platformPermissionCodes ?? [],
        auth.project.effectivePermissionCodes ?? [],
      ))
  )
    return auth.authenticatedLandingPath;
  if (
    to.meta.projectRoleAccess &&
    (!auth.project ||
      !canReadProjectRoles(
        auth.user?.platformPermissionCodes ?? [],
        auth.project.effectivePermissionCodes ?? [],
      ))
  )
    return auth.authenticatedLandingPath;
  if (to.name === "login" && auth.isAuthenticated)
    return auth.authenticatedLandingPath;
});

router.afterEach((to, from) => {
  const previousAction = from.meta.emailAction;
  if (isEmailAction(previousAction) && previousAction !== to.meta.emailAction) {
    clearEmailActionCapability(previousAction);
  }
});

function isEmailAction(value: unknown): value is EmailActionKind {
  return (
    value === "initial-access" ||
    value === "verification" ||
    value === "email-change" ||
    value === "password-reset"
  );
}
