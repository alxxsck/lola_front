import {
  cmsAuthLogin,
  cmsAuthLogout,
  cmsAuthLogoutAll,
  cmsAuthMe,
  cmsAuthRefresh,
  platformListProjects,
} from '@/shared/api/generated/lola-backend'
import type { AdminUserResponseDto, CmsAuthResponseDto, ProjectResponseDto } from '@/shared/api/generated/models'
import { demoProject } from '@/shared/api/mock-data'
import { beginAuthTeardown, endAuthTeardown, refreshAccessToken, registerRefreshHandler } from '@/shared/api/http/axios-instance'
import { clearAuthSession, getRefreshToken, getSelectedProjectId, storeTokens } from '@/shared/api/http/auth-session'
import { isMockMode } from '@/shared/config/data-mode'
import type { CmsUser, Project } from '@/shared/types/domain'

const DEMO_SESSION_KEY = 'lola-cms-demo-auth-v1'

export interface AuthContext {
  user: CmsUser
  projects: Project[]
  selectedProjectId?: string
}

function mapUser(user: AdminUserResponseDto): CmsUser {
  return {
    id: user.id,
    email: user.email ?? user.login,
    name: user.displayName ?? user.email ?? user.login,
    role: 'ADMIN',
  }
}

function mapProject(project: ProjectResponseDto): Project {
  return {
    id: project.id,
    name: project.name,
    slug: project.slug,
    status: project.status,
    publicKey: project.publicKey,
    defaultLocale: project.defaultLocale,
    supportedLocales: project.supportedLocales,
    assistantName: project.assistantName,
    systemPrompt: project.systemPrompt,
    settings: project.settings,
    organization: project.organization,
    _count: project._count,
  }
}

function rememberTokens(response: CmsAuthResponseDto): void {
  storeTokens(response)
}

registerRefreshHandler(async (refreshToken) => {
  rememberTokens(await cmsAuthRefresh({ refreshToken }))
})

async function loadContext(user: AdminUserResponseDto): Promise<AuthContext> {
  const projects = (await platformListProjects()).map(mapProject)
  return { user: mapUser(user), projects, selectedProjectId: getSelectedProjectId() }
}

function demoContext(login: string): AuthContext {
  return {
    user: {
      id: 'cms_1',
      email: login,
      name: login.startsWith('admin@') ? 'Алексей' : login.split('@')[0] || 'Администратор',
      role: 'OWNER',
    },
    projects: [structuredClone(demoProject)],
    selectedProjectId: demoProject.id,
  }
}

export const authApi = {
  mode: isMockMode ? 'mock' : 'api',

  async login(login: string, password: string): Promise<AuthContext> {
    if (isMockMode) {
      const context = demoContext(login)
      sessionStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(context))
      return context
    }
    clearAuthSession()
    try {
      const response = await cmsAuthLogin({ login, password })
      rememberTokens(response)
      return await loadContext(response.user)
    } catch (cause) {
      clearAuthSession()
      throw cause
    }
  },

  async restore(): Promise<AuthContext | null> {
    if (isMockMode) {
      const raw = sessionStorage.getItem(DEMO_SESSION_KEY)
      if (!raw) return null
      try { return JSON.parse(raw) as AuthContext } catch { sessionStorage.removeItem(DEMO_SESSION_KEY); return null }
    }
    const refreshToken = getRefreshToken()
    if (!refreshToken) return null
    try {
      const response = await cmsAuthRefresh({ refreshToken })
      rememberTokens(response)
      return await loadContext(await cmsAuthMe())
    } catch (cause) {
      clearAuthSession()
      throw cause
    }
  },

  async logout(): Promise<void> {
    if (isMockMode) {
      sessionStorage.removeItem(DEMO_SESSION_KEY)
      return
    }
    const refreshToken = getRefreshToken()
    beginAuthTeardown()
    try {
      if (refreshToken) {
        await refreshAccessToken(refreshToken)
        const freshRefreshToken = getRefreshToken()
        if (freshRefreshToken) await cmsAuthLogout({ refreshToken: freshRefreshToken })
      }
    } catch {
      // Logout remains locally authoritative when the session is already expired or offline.
    } finally {
      clearAuthSession()
      endAuthTeardown()
    }
  },

  async logoutAll(): Promise<void> {
    if (isMockMode) {
      sessionStorage.removeItem(DEMO_SESSION_KEY)
      return
    }
    beginAuthTeardown()
    try {
      const refreshToken = getRefreshToken()
      if (refreshToken) await refreshAccessToken(refreshToken)
      await cmsAuthLogoutAll()
    } catch {
      // Local credentials must still be removed when server-side revocation is unavailable.
    } finally {
      clearAuthSession()
      endAuthTeardown()
    }
  },
}
