import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { authApi, type AuthContext } from './auth.api'
import { registerUnauthorizedHandler } from '@/shared/api/http/axios-instance'
import { storeSelectedProjectId } from '@/shared/api/http/auth-session'
import type { CmsUser, Project } from '@/shared/types/domain'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<CmsUser | null>(null)
  const project = ref<Project | null>(null)
  const projects = ref<Project[]>([])
  const restored = ref(false)
  const restoring = ref(false)
  let restorePromise: Promise<void> | null = null
  const isAuthenticated = computed(() => Boolean(user.value && project.value))
  const requiresProjectSelection = computed(() => Boolean(user.value && projects.value.length > 1 && !project.value))

  function clearLocalState() {
    user.value = null
    project.value = null
    projects.value = []
  }

  function applyContext(context: AuthContext) {
    if (!context.projects.length) throw new Error('Для этой учётной записи нет доступных проектов')
    user.value = context.user
    projects.value = context.projects
    const selectedId = context.projects.length === 1 ? context.projects[0]?.id : context.selectedProjectId
    project.value = context.projects.find((item) => item.id === selectedId) ?? null
    if (project.value && user.value) user.value = { ...user.value, role: project.value.memberRole ?? user.value.role }
    if (project.value) storeSelectedProjectId(project.value.id)
  }

  async function restore() {
    if (restored.value) return
    if (restorePromise) return restorePromise
    restorePromise = (async () => {
      restoring.value = true
      try {
        const context = await authApi.restore()
        if (context) applyContext(context)
      } catch {
        clearLocalState()
      } finally {
        restored.value = true
        restoring.value = false
        restorePromise = null
      }
    })()
    return restorePromise
  }

  async function login(login: string, password: string) {
    applyContext(await authApi.login(login, password))
  }

  function selectProject(projectId: string) {
    const selected = projects.value.find((item) => item.id === projectId)
    if (!selected) throw new Error('Проект недоступен текущему пользователю')
    project.value = selected
    if (user.value) user.value = { ...user.value, role: selected.memberRole ?? 'VIEWER' }
    storeSelectedProjectId(selected.id)
  }

  function updateProject(next: Project) {
    const memberRole = projects.value.find((item) => item.id === next.id)?.memberRole
    const projectWithRole = { ...next, memberRole }
    project.value = projectWithRole
    projects.value = projects.value.map((item) => item.id === next.id ? projectWithRole : item)
  }

  async function logout(allDevices = false) {
    try {
      if (allDevices) await authApi.logoutAll()
      else await authApi.logout()
    } finally {
      clearLocalState()
    }
  }

  registerUnauthorizedHandler(clearLocalState)

  return {
    user,
    project,
    projects,
    restored,
    restoring,
    isAuthenticated,
    requiresProjectSelection,
    restore,
    login,
    logout,
    selectProject,
    updateProject,
    mode: authApi.mode,
  }
})
