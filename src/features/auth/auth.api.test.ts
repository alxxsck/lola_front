import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cmsAuthLogin, cmsAuthLogout, cmsAuthRefresh, platformListProjects, platformMembers } from '@/shared/api/generated/lola-backend'
import { getRefreshToken, storeTokens } from '@/shared/api/http/auth-session'
import { authApi } from './auth.api'

vi.mock('@/shared/api/generated/lola-backend', () => ({
  cmsAuthLogin: vi.fn(), cmsAuthLogout: vi.fn(), cmsAuthLogoutAll: vi.fn(), cmsAuthMe: vi.fn(),
  cmsAuthRefresh: vi.fn(), platformListProjects: vi.fn(), platformMembers: vi.fn(),
}))

describe('auth API logout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
  })

  it('refreshes an expired access session and revokes the rotated refresh token', async () => {
    storeTokens({ accessToken: 'expired', expiresIn: -1, refreshToken: 'old-refresh', refreshExpiresIn: 120 })
    vi.mocked(cmsAuthRefresh).mockResolvedValue({
      accessToken: 'fresh', expiresIn: 60, refreshToken: 'rotated-refresh', refreshExpiresIn: 120,
      tokenType: 'Bearer', user: {} as never,
    })
    vi.mocked(cmsAuthLogout).mockResolvedValue({ success: true })

    await authApi.logout()

    expect(cmsAuthRefresh).toHaveBeenCalledWith({ refreshToken: 'old-refresh' })
    expect(cmsAuthLogout).toHaveBeenCalledWith({ refreshToken: 'rotated-refresh' })
    expect(getRefreshToken()).toBeNull()
  })

  it('clears local credentials even when refresh cannot reach the server', async () => {
    storeTokens({ accessToken: 'expired', expiresIn: -1, refreshToken: 'old-refresh', refreshExpiresIn: 120 })
    vi.mocked(cmsAuthRefresh).mockRejectedValue(new Error('network'))

    await expect(authApi.logout()).resolves.toBeUndefined()
    expect(cmsAuthLogout).not.toHaveBeenCalled()
    expect(getRefreshToken()).toBeNull()
  })

  it('uses the selected project membership role instead of assuming ADMIN', async () => {
    vi.mocked(cmsAuthLogin).mockResolvedValue({
      accessToken: 'access', expiresIn: 60, refreshToken: 'refresh', refreshExpiresIn: 120, tokenType: 'Bearer',
      user: { id: 'admin-1', login: 'viewer', email: 'viewer@example.com', displayName: 'Viewer', createdAt: 'now' },
    })
    vi.mocked(platformListProjects).mockResolvedValue([{ id: 'project-1', name: 'Lola' } as never])
    vi.mocked(platformMembers).mockResolvedValue([{ id: 'member-1', projectId: 'project-1', adminUserId: 'admin-1', email: 'viewer@example.com', name: 'Viewer', role: 'VIEWER', createdAt: 'now', updatedAt: 'now' } as never])

    await expect(authApi.login('viewer', 'password')).resolves.toEqual(expect.objectContaining({
      user: expect.objectContaining({ role: 'VIEWER' }),
      projects: [expect.objectContaining({ id: 'project-1', memberRole: 'VIEWER' })],
    }))
    expect(platformMembers).toHaveBeenCalledWith('project-1')
  })
})
