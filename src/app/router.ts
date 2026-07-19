import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "@/features/auth/auth.store";
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
          path: "project",
          name: "project",
          component: () => import("@/pages/ProjectPage.vue"),
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
          path: "users",
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
  const auth = useAuthStore();
  await auth.restore();
  if (!to.meta.public && !auth.isAuthenticated)
    return { name: "login", query: { redirect: to.fullPath } };
  if (to.name === "login" && auth.isAuthenticated) return { name: "overview" };
});
