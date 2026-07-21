import {
  cmsAuthLogout,
  cmsAuthLogoutAll,
  cmsSessionContextMe,
  initialAccessLogin,
  initialAccessRefresh,
  initialAccessSetupPassword,
} from '@/shared/api/generated/lola-backend'
import type {
  CmsAuthenticatedResponseDto,
  CmsAuthenticatedUserResponseDto,
  CmsSessionProjectContextDto,
} from '@/shared/api/generated/models'
import { demoProject } from '@/shared/api/mock-data'
import { beginAuthTeardown, endAuthTeardown, refreshAccessToken, registerRefreshHandler } from '@/shared/api/http/axios-instance'
import { clearAuthSession, getRefreshToken, getSelectedProjectId, storeTokens } from '@/shared/api/http/auth-session'
import { isMockMode } from '@/shared/config/data-mode'
import type { CmsUser, Project } from '@/shared/types/domain'

const DEMO_SESSION_KEY = 'lola-cms-demo-auth-v1'
const DEMO_KNOWLEDGE_PREFIX = 'lola-cms-demo-knowledge-v1:'
const TRANSLATION_JOB_PREFIX = 'lola:translation-jobs:'

function clearDemoSession() {
  sessionStorage.removeItem(DEMO_SESSION_KEY)
  for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
    const key = sessionStorage.key(index)
    if (key?.startsWith(DEMO_KNOWLEDGE_PREFIX) || key?.startsWith(TRANSLATION_JOB_PREFIX)) sessionStorage.removeItem(key)
  }
}

export interface AuthContext {
  user: CmsUser
  projects: Project[]
  selectedProjectId?: string
}

export type AuthLoginResult =
  | { kind: 'AUTHENTICATED'; context: AuthContext }
  | { kind: 'PASSWORD_SETUP_REQUIRED'; setupToken: string; expiresAt: string }

export interface PasswordSetupResult {
  kind: 'PASSWORD_ESTABLISHED'
  status: 'ACTIVE'
  nextAction: 'LOGIN'
}

function mapUser(
  user: CmsAuthenticatedUserResponseDto,
  platformPermissionCodes: string[],
  role?: CmsUser['role'],
): CmsUser {
  return {
    id: user.id,
    email: user.email,
    name: user.displayName,
    role,
    platformPermissionCodes,
  }
}

function legacyRole(roleKeys: string[]): CmsUser['role'] | undefined {
  if (roleKeys.includes('PROJECT_OWNER')) return 'OWNER'
  if (roleKeys.includes('PROJECT_ADMIN')) return 'ADMIN'
  if (roleKeys.includes('CONTENT_EDITOR')) return 'EDITOR'
  if (roleKeys.includes('PROJECT_VIEWER')) return 'VIEWER'
  return undefined
}

function mapProject(project: CmsSessionProjectContextDto): Project {
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
    voiceInstructions: project.voiceInstructions,
    settings: project.settings,
    organization: project.organization,
    _count: project._count,
    memberRole: legacyRole(project.roleKeys),
    membershipId: project.membershipId,
    membershipStatus: project.membershipStatus,
    membershipVersion: project.membershipVersion,
    roleKeys: project.roleKeys,
    effectivePermissionCodes: project.effectivePermissionCodes,
  }
}

function rememberTokens(response: CmsAuthenticatedResponseDto): void {
  storeTokens(response)
}

registerRefreshHandler(async (refreshToken) => {
  rememberTokens(await initialAccessRefresh({ refreshToken }))
})

async function loadContext(): Promise<AuthContext> {
  const response = await cmsSessionContextMe()
  const projects = response.projects.map(mapProject)
  const storedProjectId = getSelectedProjectId()
  const selectedProject = projects.find((project) => project.id === storedProjectId)
    ?? (projects.length === 1 ? projects[0] : undefined)
  return {
    user: mapUser(
      response.user,
      response.platformPermissionCodes,
      selectedProject?.memberRole,
    ),
    projects,
    selectedProjectId: selectedProject?.id,
  }
}

function demoContext(login: string): AuthContext {
  return {
    user: {
      id: 'cms_1',
      email: login,
      name: login.startsWith('admin@') ? 'Алексей' : login.split('@')[0] || 'Администратор',
      role: 'OWNER',
    },
    projects: [{ ...structuredClone(demoProject), memberRole: 'OWNER' }],
    selectedProjectId: demoProject.id,
  }
}

export const authApi = {
  mode: isMockMode ? 'mock' : 'api',

  async login(login: string, password: string): Promise<AuthLoginResult> {
    if (isMockMode) {
      const context = demoContext(login)
      sessionStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(context))
      return { kind: 'AUTHENTICATED', context }
    }
    clearAuthSession()
    try {
      const response = await initialAccessLogin({ identifier: login, secret: password })
      if (response.kind === 'PASSWORD_SETUP_REQUIRED') return response
      rememberTokens(response)
      return { kind: 'AUTHENTICATED', context: await loadContext() }
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
      const response = await initialAccessRefresh({ refreshToken })
      rememberTokens(response)
      return await loadContext()
    } catch (cause) {
      clearAuthSession()
      throw cause
    }
  },

  refreshContext(): Promise<AuthContext> {
    return loadContext()
  },

  async completePasswordSetup(
    setupToken: string,
    newPassword: string,
    passwordConfirmation: string,
  ): Promise<PasswordSetupResult> {
    const response = await initialAccessSetupPassword({ setupToken, newPassword, passwordConfirmation })
    return {
      kind: response.kind,
      status: response.status,
      nextAction: response.next,
    }
  },

  async logout(): Promise<void> {
    if (isMockMode) {
      clearDemoSession()
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
      clearDemoSession()
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
