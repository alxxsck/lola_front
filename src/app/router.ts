import {
  createRouter,
  createWebHistory,
  type RouterScrollBehavior,
} from "vue-router";
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
import { safeInternalRedirect } from "@/features/auth/post-authentication-redirect";
import {
  canReadSupportControl,
  canManagePersonalSupportNotifications,
  canReadSupportWorkspace,
} from "@/features/support-workspace/model/support-workspace-access";
import { captureSupportNotificationCapability } from "@/features/support-notifications/model/support-notification-capability";
import { ensureSupportWorkspaceShellAdmission } from "@/features/support-workspace/model/support-workspace-shell-admission";
import {
  canonicalSupportLocation,
  isCanonicalSupportWorkspaceAdmission,
  legacySupportLocation,
  type LegacySupportEntryPoint,
  type SupportWorkspaceTarget,
} from "@/features/support-workspace/model/support-workspace-entry-point";

const AI_LEDGER_ROUTE_GROUPS = new Map([
  ["ai-analyses", "analyses"],
  ["ai-analysis-detail", "analyses"],
  ["ai-operations", "operations"],
  ["ai-operation-detail", "operations"],
]);

export const appScrollBehavior: RouterScrollBehavior = (
  to,
  from,
  savedPosition,
) => {
  if (savedPosition) return savedPosition;

  const targetGroup = AI_LEDGER_ROUTE_GROUPS.get(String(to.name ?? ""));
  if (
    targetGroup &&
    targetGroup === AI_LEDGER_ROUTE_GROUPS.get(String(from.name ?? ""))
  ) {
    return false;
  }

  return { top: 0 };
};

export const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: appScrollBehavior,
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
          meta: {
            projectPermissionsAny: [
              "project.notifications.read",
              "project.integrations.read",
            ],
          },
        },
        {
          path: "platform/cms-users/:cmsUserId?",
          name: "platform-cms-users",
          component: () => import("@/pages/PlatformCmsUsersPage.vue"),
          meta: { platformPermission: "platform.cms_users.read" },
        },
        {
          path: "platform/notification-operations",
          name: "platform-notification-operations",
          component: () =>
            import("@/pages/PlatformNotificationOperationsPage.vue"),
          meta: {
            platformPermission: "platform.notifications.operations.read",
          },
        },
        {
          path: "platform/ai-pricing",
          name: "platform-ai-pricing",
          component: () => import("@/pages/PlatformAiPricingPage.vue"),
          meta: { platformPermission: "platform.ai_pricing.read" },
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
          component: () => import("@/pages/ProjectLogsPage.vue"),
          meta: {
            projectPermissionsAny: [
              "project.event_logs.read",
              "project.integration_activity.read",
            ],
          },
        },
        {
          path: "actions",
          name: "actions",
          component: () => import("@/pages/ActionsPage.vue"),
          meta: { projectPermission: "project.actions.read" },
        },
        {
          path: "cases",
          name: "end-user-cases",
          component: () => import("@/pages/SupportLegacyLauncherPage.vue"),
          props: { entryPoint: "CASES" },
          meta: {
            projectPermission: "project.cases.read",
            legacySupportEntryPoint: "CASES",
          },
        },
        {
          path: "cases/settings",
          name: "end-user-case-settings",
          component: () => import("@/pages/EndUserCaseSettingsPage.vue"),
          meta: { projectPermission: "project.cases.settings.manage" },
        },
        {
          path: "cases/:caseId",
          name: "end-user-case-detail",
          component: () => import("@/pages/SupportLegacyLauncherPage.vue"),
          props: (route) => ({
            entryPoint: "CASES",
            selectionKind: routeValue(route.params.caseId) ? "CASE" : undefined,
            selectionId: routeValue(route.params.caseId),
          }),
          meta: {
            projectPermission: "project.cases.read",
            legacySupportEntryPoint: "CASES",
          },
        },
        {
          path: "support/inbox",
          name: "support-inbox",
          component: () => import("@/pages/SupportWorkspacePage.vue"),
          meta: {
            supportWorkspaceAccess: true,
            supportWorkspaceTarget: "CONVERSATIONS",
            supportWorkspacePresentation: true,
          },
        },
        {
          path: "support/inbox/cases/:caseId",
          name: "support-inbox-case",
          component: () => import("@/pages/SupportWorkspacePage.vue"),
          meta: {
            supportWorkspaceAccess: true,
            supportWorkspaceTarget: "CASES",
            supportWorkspacePresentation: true,
          },
        },
        {
          path: "support/inbox/conversations/:conversationId",
          name: "support-inbox-conversation",
          component: () => import("@/pages/SupportWorkspacePage.vue"),
          meta: {
            supportWorkspaceAccess: true,
            supportWorkspaceTarget: "CONVERSATIONS",
            supportWorkspacePresentation: true,
          },
        },
        {
          path: "support/control",
          name: "support-control",
          component: () => import("@/pages/SupportControlPage.vue"),
          meta: { supportLeadControlAccess: true },
        },
        {
          path: "support/settings/macros",
          name: "support-macro-settings",
          component: () => import("@/pages/SupportMacroSettingsPage.vue"),
          meta: { projectPermission: "project.support.macros.manage" },
        },
        {
          path: "support/settings/notifications",
          name: "support-notification-settings",
          component: () => import("@/pages/SupportNotificationSettingsPage.vue"),
          meta: { supportNotificationSettingsAccess: true },
        },
        {
          path: "support/settings/audit-rollout",
          name: "support-workspace-rollout",
          component: () => import("@/pages/SupportWorkspaceRolloutPage.vue"),
          meta: {
            projectPermission: "project.support.workspace.rollout.manage",
          },
        },
        {
          path: "support/settings/integrations",
          name: "support-external-settings",
          component: () => import("@/pages/SupportExternalSettingsPage.vue"),
          meta: {
            projectPermission: "project.support.external_work.manage",
          },
        },
        {
          path: "support/external-work",
          name: "support-external-work",
          component: () => import("@/pages/SupportExternalWorkPage.vue"),
          meta: {
            projectPermissionsAny: [
              "project.support.external_work.inbox_read",
              "project.support.external_work.read_linked",
            ],
          },
        },
        {
          path: "support/notifications/open",
          name: "support-notification-open",
          component: () => import("@/pages/SupportNotificationOpenPage.vue"),
        },
        {
          path: "ai-analyses",
          name: "ai-analyses",
          component: () => import("@/pages/AIAnalysesPage.vue"),
          meta: { projectPermission: "project.ai_analyses.read" },
        },
        {
          path: "ai-analyses/:analysisId",
          name: "ai-analysis-detail",
          component: () => import("@/pages/AIAnalysesPage.vue"),
          meta: { projectPermission: "project.ai_analyses.read" },
        },
        {
          path: "ai-operations",
          name: "ai-operations",
          component: () => import("@/pages/AIOperationsPage.vue"),
          meta: { projectPermission: "project.ai_operations.read" },
        },
        {
          path: "ai-operations/:operationId",
          name: "ai-operation-detail",
          component: () => import("@/pages/AIOperationsPage.vue"),
          meta: { projectPermission: "project.ai_operations.read" },
        },
        {
          path: "ai-costs",
          name: "ai-costs",
          component: () => import("@/pages/AICostsPage.vue"),
          meta: {
            projectPermissionsAny: [
              "project.ai_costs.read",
              "project.ai_allowance.read",
              "project.ai_allowance.manage",
              "project.ai_allowance.grant",
              "project.ai_allowance.reconcile",
              "project.ai_allowance.accrual_rules.read",
              "project.ai_allowance.accrual_rules.manage",
              "project.ai_allowance.accrual_receipts.read",
            ],
          },
        },
        {
          path: "telegram/broadcasts",
          name: "telegram-broadcasts",
          component: () => import("@/pages/TelegramBroadcastsPage.vue"),
          meta: {
            projectPermission: "project.telegram.broadcasts.read",
          },
        },
        {
          path: "telegram/broadcasts/:broadcastId",
          name: "telegram-broadcast-detail",
          component: () => import("@/pages/TelegramBroadcastDetailPage.vue"),
          meta: {
            projectPermission: "project.telegram.broadcasts.read",
          },
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
          path: "docs/support-operator",
          name: "support-operator-guide",
          component: () => import("@/pages/SupportOperatorGuidePage.vue"),
        },
        {
          path: "docs/support-lead",
          name: "support-lead-guide",
          component: () => import("@/pages/SupportLeadGuidePage.vue"),
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
              "project.scenario_runs.read",
              "project.audit.read",
              "project.integration_api_requests.read",
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
  if (to.name === "support-notification-open" && to.hash) {
    captureSupportNotificationCapability(to.hash);
    return { path: to.path, query: to.query, hash: "", replace: true };
  }
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
  ) {
    const redirect = safeInternalRedirect(to.query.redirect);
    return {
      name: "login",
      ...(redirect ? { query: { redirect } } : {}),
    };
  }
  if (auth.mfaChallenge && to.name !== "mfa") {
    const redirect = safeInternalRedirect(to.query.redirect);
    return {
      name: "mfa",
      ...(redirect ? { query: { redirect } } : {}),
    };
  }
  if (!to.meta.public && !auth.isAuthenticated)
    return { name: "login", query: { redirect: to.fullPath } };
  if (
    (to.meta.supportWorkspaceAccess ||
      to.meta.legacySupportEntryPoint ||
      to.name === "ai-analysis-detail" ||
      to.name === "ai-operation-detail" ||
      to.name === "ai-costs" ||
      to.name === "users" ||
      to.name === "support-workspace-rollout" ||
      to.name === "support-external-settings" ||
      to.name === "support-external-work") &&
    typeof to.query.projectId === "string"
  ) {
    const target = auth.projects.find(
      (project) => project.id === to.query.projectId,
    );
    if (!target) return auth.authenticatedLandingPath;
    if (auth.project?.id !== target.id) auth.selectProject(target.id);
  }
  if (to.name === "overview" && auth.isAuthenticated && !auth.project)
    return auth.authenticatedLandingPath;
  const projectPermissions = auth.project?.effectivePermissionCodes ?? [];
  const actorId = auth.user?.id;
  const projectId = auth.project?.id;
  const legacyEntryPoint = to.meta
    .legacySupportEntryPoint as LegacySupportEntryPoint | undefined;
  if (legacyEntryPoint && actorId && projectId) {
    const target: SupportWorkspaceTarget =
      legacyEntryPoint === "CASES" ? "CASES" : "CONVERSATIONS";
    const hasTargetPermission =
      target === "CASES"
        ? hasProjectPermission(projectPermissions, "project.cases.read")
        : hasProjectPermission(projectPermissions, "project.conversations.read");
    if (hasTargetPermission) {
      const admission = await ensureSupportWorkspaceShellAdmission({
        actorId,
        projectId,
        effectivePermissionCodes: projectPermissions,
      });
      if (isCanonicalSupportWorkspaceAdmission(admission, target)) {
        return canonicalSupportLocation({
          entryPoint: legacyEntryPoint,
          caseId: routeValue(to.params.caseId),
          endUserId:
            routeValue(to.params.endUserId) ?? routeValue(to.query.endUserId),
          conversationId: routeValue(to.query.conversationId),
          query: to.query,
        });
      }
    }
  }
  if (
    to.meta.supportWorkspaceAccess &&
    (!auth.project || !actorId || !canReadSupportWorkspace(projectPermissions))
  ) {
    return auth.authenticatedLandingPath;
  }
  if (to.meta.supportWorkspaceAccess && auth.project && actorId) {
    const target = supportWorkspaceTarget(to);
    const hasTargetPermission =
      target === "CASES"
        ? hasProjectPermission(projectPermissions, "project.cases.read")
        : hasProjectPermission(projectPermissions, "project.conversations.read");
    if (!hasTargetPermission) return auth.authenticatedLandingPath;
    const admission = await ensureSupportWorkspaceShellAdmission({
      actorId,
      projectId: auth.project.id,
      effectivePermissionCodes: projectPermissions,
    });
    if (!isCanonicalSupportWorkspaceAdmission(admission, target)) {
      return legacySupportLocation({
        target,
        caseId: routeValue(to.params.caseId),
        conversationId: routeValue(to.params.conversationId),
        query: to.query,
      });
    }
  }
  if (
    to.meta.supportLeadControlAccess &&
    (!auth.project ||
      !canReadSupportControl(auth.project.effectivePermissionCodes ?? []))
  )
    return auth.authenticatedLandingPath;
  if (
    to.meta.supportNotificationSettingsAccess &&
    (!auth.project ||
      !canManagePersonalSupportNotifications(
        auth.project.effectivePermissionCodes ?? [],
      ))
  )
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
  if (
    to.name === "login" &&
    auth.isAuthenticated &&
    !auth.requiresProjectSelection
  )
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

function routeValue(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function supportWorkspaceTarget(to: {
  name?: unknown;
  meta: Record<string, unknown>;
  query: Record<string, unknown>;
}): SupportWorkspaceTarget {
  if (to.name === "support-inbox" && routeValue(to.query.mode) === "cases") {
    return "CASES";
  }
  return (to.meta.supportWorkspaceTarget ??
    "CONVERSATIONS") as SupportWorkspaceTarget;
}
