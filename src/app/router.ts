import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/features/auth/auth.store'
import AppShell from '@/widgets/layout/AppShell.vue'

export const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    { path: '/login', name: 'login', component: () => import('@/pages/LoginPage.vue'), meta: { public: true } },
    {
      path: '/',
      component: AppShell,
      children: [
        { path: '', redirect: '/overview' },
        { path: 'overview', name: 'overview', component: () => import('@/pages/OverviewPage.vue') },
        { path: 'project', name: 'project', component: () => import('@/pages/ProjectPage.vue') },
        { path: 'interface/:kind?', name: 'interface', component: () => import('@/pages/InterfacePage.vue') },
        { path: 'events', name: 'events', component: () => import('@/pages/EventsPage.vue') },
        { path: 'actions', name: 'actions', component: () => import('@/pages/ActionsPage.vue') },
        { path: 'scenarios', name: 'scenarios', component: () => import('@/pages/ScenariosPage.vue') },
        { path: 'scenarios/new', name: 'scenario-create', component: () => import('@/pages/ScenarioEditorPage.vue') },
        { path: 'scenarios/:scenarioId', name: 'scenario-edit', component: () => import('@/pages/ScenarioEditorPage.vue') },
        { path: 'users', name: 'users', component: () => import('@/pages/UsersPage.vue') },
        { path: 'live', name: 'live', component: () => import('@/pages/LivePage.vue') },
        { path: 'operations', name: 'operations', component: () => import('@/pages/OperationsPage.vue') },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.restore()
  if (!to.meta.public && !auth.isAuthenticated) return { name: 'login', query: { redirect: to.fullPath } }
  if (to.name === 'login' && auth.isAuthenticated) return { name: 'overview' }
})
