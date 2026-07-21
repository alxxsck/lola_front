import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "@/features/auth/auth.store";
import { canReviewAIProposals } from "@/features/ai-proposals/model/ai-proposal-presentation";
import { canReadProjectMemberships } from "@/features/project-memberships/model/project-membership-permissions";
import { canReadProjectRoles } from "@/features/project-roles/model/project-role-permissions";
import {
  captureEmailActionCapability,
  clearEmailActionCapability,
  type EmailActionKind,
} from "@/features/email-identity/email-action-capability";
import AppShell from "@/widgets/layout/AppShell.vue";

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
          path: "platform/cms-users/:cmsUserId?",
          name: "platform-cms-users",
          component: () => import("@/pages/PlatformCmsUsersPage.vue"),
          meta: { platformPermission: "platform.cms_users.read" },
        },
        {
          path: "project",
          name: "project",
          component: () => import("@/pages/ProjectPage.vue"),
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
        },
        {
          path: "profile-fields/integration",
          name: "profile-fields-integration",
          component: () => import("@/pages/ProfileIntegrationPage.vue"),
        },
        {
          path: "profile-fields/new",
          name: "profile-field-create",
          component: () => import("@/pages/ProfileFieldEditorPage.vue"),
        },
        {
          path: "profile-fields/:definitionId",
          name: "profile-field-edit",
          component: () => import("@/pages/ProfileFieldEditorPage.vue"),
        },
        {
          path: "project/user-attributes",
          redirect: "/profile-fields",
        },
        {
          path: "knowledge",
          name: "knowledge",
          component: () => import("@/pages/KnowledgePage.vue"),
        },
        {
          path: "interface/:kind?",
          name: "interface",
          component: () => import("@/pages/InterfacePage.vue"),
        },
        {
          path: "events",
          name: "events",
          component: () => import("@/pages/EventsPage.vue"),
        },
        {
          path: "events/:definitionKeyId",
          name: "event-definition-workspace",
          component: () => import("@/pages/EventDefinitionWorkspacePage.vue"),
        },
        {
          path: "event-logs",
          name: "event-logs",
          component: () => import("@/pages/EventLogsPage.vue"),
        },
        {
          path: "actions",
          name: "actions",
          component: () => import("@/pages/ActionsPage.vue"),
        },
        {
          path: "ai-proposals",
          name: "ai-proposals",
          component: () => import("@/pages/AIProposalsPage.vue"),
          meta: { proposalAccess: true },
        },
        {
          path: "ai-proposals/:proposalId",
          name: "ai-proposal-detail",
          component: () => import("@/pages/AIProposalsPage.vue"),
          meta: { proposalAccess: true },
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
        },
        {
          path: "scenarios/new",
          name: "scenario-create",
          component: () => import("@/pages/ScenarioEditorPage.vue"),
        },
        {
          path: "scenarios/:scenarioId",
          name: "scenario-edit",
          component: () => import("@/pages/ScenarioEditorPage.vue"),
        },
        {
          path: "segments",
          name: "segments",
          component: () => import("@/pages/SegmentsPage.vue"),
        },
        {
          path: "segments/new",
          name: "segment-create",
          component: () => import("@/pages/SegmentsPage.vue"),
        },
        {
          path: "segments/:segmentId",
          name: "segment-detail",
          component: () => import("@/pages/SegmentsPage.vue"),
        },
        {
          path: "segments/:segmentId/revisions/new",
          name: "segment-revision-create",
          component: () => import("@/pages/SegmentsPage.vue"),
        },
        {
          path: "segments/:segmentId/revisions/:segmentRevisionId",
          name: "segment-revision-detail",
          component: () => import("@/pages/SegmentsPage.vue"),
        },
        {
          path: "users/:endUserId?",
          name: "users",
          component: () => import("@/pages/UsersPage.vue"),
        },
        {
          path: "live",
          name: "live",
          component: () => import("@/pages/LivePage.vue"),
        },
        {
          path: "operations",
          name: "operations",
          component: () => import("@/pages/OperationsPage.vue"),
        },
      ],
    },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});

router.beforeEach(async (to) => {
  const emailAction = to.meta.emailAction
  if (isEmailAction(emailAction)) {
    if (to.hash) {
      captureEmailActionCapability(emailAction, to.hash)
      return { path: to.path, query: to.query, hash: '', replace: true }
    }
    return true
  }
  const auth = useAuthStore();
  await auth.restore();
  if (to.name === "password-setup" && !auth.requiresPasswordSetup)
    return { name: "login" };
  if (!to.meta.public && !auth.isAuthenticated)
    return { name: "login", query: { redirect: to.fullPath } };
  if (
    typeof to.meta.platformPermission === "string" &&
    !auth.user?.platformPermissionCodes?.includes(to.meta.platformPermission)
  )
    return { name: "overview" };
  if (
    to.meta.projectMembershipAccess &&
    (!auth.project ||
      !canReadProjectMemberships(
        auth.user?.platformPermissionCodes ?? [],
        auth.project.effectivePermissionCodes ?? [],
      ))
  )
    return { name: "overview" };
  if (
    to.meta.projectRoleAccess &&
    (!auth.project ||
      !canReadProjectRoles(
        auth.user?.platformPermissionCodes ?? [],
        auth.project.effectivePermissionCodes ?? [],
      ))
  )
    return { name: "overview" };
  if (to.name === "login" && auth.isAuthenticated) return { name: "overview" };
  if (to.meta.proposalAccess && !canReviewAIProposals(auth.user?.role))
    return { name: "overview" };
});

router.afterEach((to, from) => {
  const previousAction = from.meta.emailAction
  if (isEmailAction(previousAction) && previousAction !== to.meta.emailAction) {
    clearEmailActionCapability(previousAction)
  }
})

function isEmailAction(value: unknown): value is EmailActionKind {
  return value === 'initial-access' || value === 'verification' || value === 'email-change'
}
