import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cmsSecuritySettingsLogout,
  cmsSecuritySettingsLogoutAll,
  cmsSessionContextMe,
  initialAccessLogin,
  initialAccessRefresh,
  initialAccessSetupPassword,
} from '@/shared/api/generated/lola-backend'
import type {
  CmsAuthenticatedResponseDto,
  CmsSessionContextResponseDto,
  CmsSessionProjectContextDto,
  PasswordEstablishedResponseDto,
  PasswordSetupRequiredResponseDto,
} from '@/shared/api/generated/models'
import { clearAuthSession, getAccessToken, storeAccessToken } from '@/shared/api/http/auth-session'
import { authApi } from './auth.api'

vi.mock('@/shared/api/generated/lola-backend', () => ({
  cmsSecuritySettingsLogout: vi.fn(),
  cmsSecuritySettingsLogoutAll: vi.fn(),
  cmsSessionContextMe: vi.fn(),
  initialAccessLogin: vi.fn(),
  initialAccessRefresh: vi.fn(),
  initialAccessSetupPassword: vi.fn(),
}))

const authenticatedResponse = {
  kind: 'AUTHENTICATED',
  accessToken: 'access',
  expiresIn: 60,
  refreshExpiresIn: 120,
  tokenType: 'Bearer',
  user: {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'viewer@example.com',
    displayName: 'Viewer',
  },
} satisfies CmsAuthenticatedResponseDto

function project(
  id: string,
  name: string,
  roleKeys = ['PROJECT_VIEWER'],
  effectivePermissionCodes = ['project.read'],
): CmsSessionProjectContextDto {
  return {
    id,
    name,
    slug: id,
    status: 'ACTIVE',
    publicKey: `public-${id}`,
    serverKeyPrefix: `server-${id}`,
    organizationId: 'organization-1',
    defaultLocale: 'ru',
    supportedLocales: ['ru'],
    assistantName: 'Lola',
    systemPrompt: '',
    voiceInstructions: '',
    settings: {},
    createdAt: '2026-07-21T10:00:00.000Z',
    updatedAt: '2026-07-21T10:00:00.000Z',
    membershipId: `membership-${id}`,
    membershipStatus: 'ACTIVE',
    membershipVersion: 1,
    roleKeys,
    effectivePermissionCodes,
  }
}

function sessionContext(
  projects: CmsSessionProjectContextDto[],
  platformPermissionCodes: string[] = [],
): CmsSessionContextResponseDto {
  return {
    user: authenticatedResponse.user,
    platformPermissionCodes,
    projects,
  }
}

describe('target CMS User auth API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearAuthSession()
    sessionStorage.clear()
  })

  it('keeps a Password Setup capability out of browser storage', async () => {
    const response = {
      kind: 'PASSWORD_SETUP_REQUIRED',
      setupToken: 'lps_setup-capability',
      expiresAt: '2026-07-21T10:10:00.000Z',
    } satisfies PasswordSetupRequiredResponseDto
    vi.mocked(initialAccessLogin).mockResolvedValue(response)

    await expect(authApi.login('operator@example.com', 'lia_initial-secret')).resolves.toEqual(response)

    expect(initialAccessLogin).toHaveBeenCalledWith({
      identifier: 'operator@example.com',
      secret: 'lia_initial-secret',
    })
    expect(cmsSessionContextMe).not.toHaveBeenCalled()
    expect(JSON.stringify(Object.values(sessionStorage))).not.toContain(response.setupToken)
  })

  it('loads target memberships and effective permissions from the self context', async () => {
    vi.mocked(initialAccessLogin).mockResolvedValue(authenticatedResponse)
    vi.mocked(cmsSessionContextMe).mockResolvedValue(sessionContext([
      project(
        'project-member',
        'Member Project',
        ['PROJECT_ADMIN'],
        ['project.read', 'scenario.write'],
      ),
    ]))

    await expect(authApi.login('viewer@example.com', 'permanent password')).resolves.toEqual({
      kind: 'AUTHENTICATED',
      context: {
        user: {
          id: authenticatedResponse.user.id,
          email: authenticatedResponse.user.email,
          name: authenticatedResponse.user.displayName,
          role: 'ADMIN',
          platformPermissionCodes: [],
        },
        projects: [expect.objectContaining({
          id: 'project-member',
          memberRole: 'ADMIN',
          roleKeys: ['PROJECT_ADMIN'],
          effectivePermissionCodes: ['project.read', 'scenario.write'],
        })],
        selectedProjectId: 'project-member',
      },
    })
    expect(cmsSessionContextMe).toHaveBeenCalledOnce()
  })

  it('authenticates a projectless Platform Operator without fabricating VIEWER access', async () => {
    vi.mocked(initialAccessLogin).mockResolvedValue(authenticatedResponse)
    vi.mocked(cmsSessionContextMe).mockResolvedValue(sessionContext([], [
      'platform.projects.manage',
    ]))

    const result = await authApi.login('viewer@example.com', 'permanent password')

    expect(result).toEqual({
      kind: 'AUTHENTICATED',
      context: {
        user: {
          id: authenticatedResponse.user.id,
          email: authenticatedResponse.user.email,
          name: authenticatedResponse.user.displayName,
          role: undefined,
          platformPermissionCodes: ['platform.projects.manage'],
        },
        projects: [],
        selectedProjectId: undefined,
      },
    })
  })

  it('maps the generated password setup result to the frontend state contract', async () => {
    const response = {
      kind: 'PASSWORD_ESTABLISHED',
      cmsUserId: authenticatedResponse.user.id,
      status: 'ACTIVE',
      next: 'LOGIN',
    } satisfies PasswordEstablishedResponseDto
    vi.mocked(initialAccessSetupPassword).mockResolvedValue(response)

    await expect(authApi.completePasswordSetup(
      'lps_setup-capability',
      'a long permanent passphrase',
      'a long permanent passphrase',
    )).resolves.toEqual({
      kind: 'PASSWORD_ESTABLISHED',
      status: 'ACTIVE',
      nextAction: 'LOGIN',
    })
    expect(initialAccessSetupPassword).toHaveBeenCalledWith({
      setupToken: 'lps_setup-capability',
      newPassword: 'a long permanent passphrase',
      passwordConfirmation: 'a long permanent passphrase',
    })
  })

  it('refreshes through the cookie before revoking the current server session', async () => {
    storeAccessToken({ accessToken: 'expired', expiresIn: -1 })
    vi.mocked(initialAccessRefresh).mockResolvedValue({
      ...authenticatedResponse,
      accessToken: 'fresh',
    })
    vi.mocked(cmsSecuritySettingsLogout).mockResolvedValue({ success: true })

    await authApi.logout()

    expect(initialAccessRefresh).toHaveBeenCalledWith()
    expect(cmsSecuritySettingsLogout).toHaveBeenCalledWith()
    expect(getAccessToken()).toBeNull()
  })

  it('clears local credentials even when refresh cannot reach the server', async () => {
    storeAccessToken({ accessToken: 'expired', expiresIn: -1 })
    sessionStorage.setItem('lola:translation-jobs:project-1:scenario-1', '[]')
    vi.mocked(initialAccessRefresh).mockRejectedValue(new Error('network'))

    await expect(authApi.logout()).resolves.toBeUndefined()
    expect(cmsSecuritySettingsLogout).not.toHaveBeenCalled()
    expect(getAccessToken()).toBeNull()
    expect(sessionStorage.getItem('lola:translation-jobs:project-1:scenario-1')).toBeNull()
  })

  it('revokes the current server session with a valid access token when the refresh cookie is unavailable', async () => {
    storeAccessToken({ accessToken: 'still-valid', expiresIn: 900 })
    vi.mocked(initialAccessRefresh).mockRejectedValue(new Error('refresh cookie unavailable'))
    vi.mocked(cmsSecuritySettingsLogout).mockResolvedValue({ success: true })

    await expect(authApi.logout()).resolves.toBeUndefined()

    expect(initialAccessRefresh).not.toHaveBeenCalled()
    expect(cmsSecuritySettingsLogout).toHaveBeenCalledWith()
    expect(getAccessToken()).toBeNull()
  })

  it('restores from an unreadable HttpOnly cookie without browser token state', async () => {
    vi.mocked(initialAccessRefresh).mockResolvedValue(authenticatedResponse)
    vi.mocked(cmsSessionContextMe).mockResolvedValue(sessionContext([]))

    await expect(authApi.restore()).resolves.toMatchObject({
      user: { id: authenticatedResponse.user.id },
    })

    expect(initialAccessRefresh).toHaveBeenCalledWith()
    expect(getAccessToken()).toBe('access')
    expect(JSON.stringify(Object.values(sessionStorage))).not.toContain('access')
  })

  it('uses the cookie refresh before revoking every server session', async () => {
    vi.mocked(initialAccessRefresh).mockResolvedValue(authenticatedResponse)
    vi.mocked(cmsSecuritySettingsLogoutAll).mockResolvedValue({ success: true })

    await authApi.logoutAll()

    expect(initialAccessRefresh).toHaveBeenCalledWith()
    expect(cmsSecuritySettingsLogoutAll).toHaveBeenCalledWith()
    expect(getAccessToken()).toBeNull()
  })

  it('revokes every server session with a valid access token when the refresh cookie is unavailable', async () => {
    storeAccessToken({ accessToken: 'still-valid', expiresIn: 900 })
    vi.mocked(initialAccessRefresh).mockRejectedValue(new Error('refresh cookie unavailable'))
    vi.mocked(cmsSecuritySettingsLogoutAll).mockResolvedValue({ success: true })

    await expect(authApi.logoutAll()).resolves.toBeUndefined()

    expect(initialAccessRefresh).not.toHaveBeenCalled()
    expect(cmsSecuritySettingsLogoutAll).toHaveBeenCalledWith()
    expect(getAccessToken()).toBeNull()
  })
})
