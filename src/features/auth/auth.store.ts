import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { authApi, type AuthContext } from './auth.api'
import { registerUnauthorizedHandler } from '@/shared/api/http/axios-instance'
import { storeSelectedProjectId } from '@/shared/api/http/auth-session'
import { ApiError } from '@/shared/api/http/api-error'
import type { CmsUser, Project } from '@/shared/types/domain'

export type AuthPhase =
  | 'ANONYMOUS'
  | 'LOGIN_PENDING'
  | 'SETUP_REQUIRED'
  | 'SETUP_PENDING'
  | 'ANONYMOUS_WITH_SETUP_SUCCESS'
  | 'AUTHENTICATED'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<CmsUser | null>(null)
  const project = ref<Project | null>(null)
  const projects = ref<Project[]>([])
  const phase = ref<AuthPhase>('ANONYMOUS')
  const setupToken = ref<string | null>(null)
  const restored = ref(false)
  const restoring = ref(false)
  let restorePromise: Promise<void> | null = null
  let setupAttemptId = 0
  const isAuthenticated = computed(() => phase.value === 'AUTHENTICATED' && Boolean(user.value))
  const requiresPasswordSetup = computed(() => phase.value === 'SETUP_REQUIRED' || phase.value === 'SETUP_PENDING')
  const requiresProjectSelection = computed(() => Boolean(user.value && projects.value.length > 1 && !project.value))

  function clearLocalState() {
    user.value = null
    project.value = null
    projects.value = []
  }

  function resetAuthentication() {
    setupAttemptId += 1
    setupToken.value = null
    clearLocalState()
    phase.value = 'ANONYMOUS'
  }

  function applyContext(context: AuthContext) {
    user.value = context.user
    projects.value = context.projects
    const selectedId = context.projects.length === 1 ? context.projects[0]?.id : context.selectedProjectId
    project.value = context.projects.find((item) => item.id === selectedId) ?? null
    if (project.value && user.value) user.value = { ...user.value, role: project.value.memberRole }
    if (project.value) storeSelectedProjectId(project.value.id)
  }

  async function restore() {
    if (restored.value) return
    if (restorePromise) return restorePromise
    restorePromise = (async () => {
      restoring.value = true
      try {
        const context = await authApi.restore()
        if (context) {
          applyContext(context)
          phase.value = 'AUTHENTICATED'
        }
      } catch {
        clearLocalState()
        phase.value = 'ANONYMOUS'
      } finally {
        restored.value = true
        restoring.value = false
        restorePromise = null
      }
    })()
    return restorePromise
  }

  async function refreshContext() {
    if (phase.value !== 'AUTHENTICATED') return
    try {
      applyContext(await authApi.refreshContext())
    } catch (cause) {
      resetAuthentication()
      throw cause
    }
  }

  async function login(login: string, password: string) {
    phase.value = 'LOGIN_PENDING'
    setupToken.value = null
    try {
      const result = await authApi.login(login, password)
      if (result.kind === 'PASSWORD_SETUP_REQUIRED') {
        clearLocalState()
        setupToken.value = result.setupToken
        phase.value = 'SETUP_REQUIRED'
        return result.kind
      }
      applyContext(result.context)
      phase.value = 'AUTHENTICATED'
      return result.kind
    } catch (cause) {
      clearLocalState()
      phase.value = 'ANONYMOUS'
      throw cause
    }
  }

  async function completePasswordSetup(newPassword: string, passwordConfirmation: string) {
    const token = setupToken.value
    if (!token) throw new Error('Сессия установки пароля недоступна. Войдите ещё раз.')
    const attemptId = ++setupAttemptId
    phase.value = 'SETUP_PENDING'
    try {
      const result = await authApi.completePasswordSetup(token, newPassword, passwordConfirmation)
      if (attemptId === setupAttemptId && setupToken.value === token) {
        setupToken.value = null
        phase.value = 'ANONYMOUS_WITH_SETUP_SUCCESS'
      }
      return result.kind
    } catch (cause) {
      if (attemptId === setupAttemptId && setupToken.value === token) {
        if (cause instanceof ApiError && cause.code === 'PASSWORD_SETUP_TOKEN_INVALID') resetAuthentication()
        else phase.value = 'SETUP_REQUIRED'
      }
      throw cause
    }
  }

  function cancelPasswordSetup() {
    resetAuthentication()
  }

  function selectProject(projectId: string) {
    const selected = projects.value.find((item) => item.id === projectId)
    if (!selected) throw new Error('Проект недоступен текущему пользователю')
    project.value = selected
    if (user.value) user.value = { ...user.value, role: selected.memberRole }
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
      resetAuthentication()
    }
  }

  registerUnauthorizedHandler(resetAuthentication)

  return {
    user,
    project,
    projects,
    phase,
    setupToken,
    restored,
    restoring,
    isAuthenticated,
    requiresPasswordSetup,
    requiresProjectSelection,
    restore,
    refreshContext,
    login,
    completePasswordSetup,
    cancelPasswordSetup,
    logout,
    selectProject,
    updateProject,
    mode: authApi.mode,
  }
})
