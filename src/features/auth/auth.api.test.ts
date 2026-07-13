import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cmsAuthLogout, cmsAuthRefresh } from '@/shared/api/generated/lola-backend'
import { getRefreshToken, storeTokens } from '@/shared/api/http/auth-session'
import { authApi } from './auth.api'

vi.mock('@/shared/api/generated/lola-backend', () => ({
  cmsAuthLogin: vi.fn(), cmsAuthLogout: vi.fn(), cmsAuthLogoutAll: vi.fn(), cmsAuthMe: vi.fn(),
  cmsAuthRefresh: vi.fn(), platformListProjects: vi.fn(),
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
})
