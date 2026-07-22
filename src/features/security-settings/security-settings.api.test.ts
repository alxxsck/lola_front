import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cmsSecuritySettingsChangePassword,
  cmsSecuritySettingsList,
  cmsSecuritySettingsRevoke,
  cmsSecuritySettingsRevokeOthers,
} from '@/shared/api/generated/lola-backend'
import { clearAuthSession, getAccessToken } from '@/shared/api/http/auth-session'
import { securitySettingsApi } from './security-settings.api'

vi.mock('@/shared/api/generated/lola-backend', () => ({
  cmsSecuritySettingsChangePassword: vi.fn(),
  cmsSecuritySettingsList: vi.fn(),
  cmsSecuritySettingsRevoke: vi.fn(),
  cmsSecuritySettingsRevokeOthers: vi.fn(),
}))

describe('security settings API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    clearAuthSession()
  })

  it('uses the stable session family id for exact revocation', async () => {
    vi.mocked(cmsSecuritySettingsList).mockResolvedValue({
      sessions: [{
        id: '00000000-0000-4000-8000-000000000001',
        current: false,
        device: 'Firefox',
        createdAt: '2026-07-21T10:00:00.000Z',
        lastSeenAt: '2026-07-21T10:05:00.000Z',
        expiresAt: '2026-07-22T10:00:00.000Z',
      }],
    })
    vi.mocked(cmsSecuritySettingsRevoke).mockResolvedValue({ success: true })

    const [session] = await securitySettingsApi.listSessions()
    await securitySettingsApi.revokeSession(session!.id)

    expect(cmsSecuritySettingsRevoke).toHaveBeenCalledWith(session!.id)
  })

  it('replaces only the in-memory access token after password change', async () => {
    vi.mocked(cmsSecuritySettingsChangePassword).mockResolvedValue({
      kind: 'AUTHENTICATED',
      tokenType: 'Bearer',
      accessToken: 'new-access-secret',
      expiresIn: 900,
      refreshExpiresIn: 86_400,
      user: { id: 'user-1', email: 'operator@example.com', displayName: 'Operator' },
    })

    await securitySettingsApi.changePassword({
      currentPassword: 'old password',
      newPassword: 'new secure passphrase',
      passwordConfirmation: 'new secure passphrase',
    })

    expect(getAccessToken()).toBe('new-access-secret')
    expect(JSON.stringify(Object.values(sessionStorage))).not.toContain('new-access-secret')
    expect(JSON.stringify(Object.values(localStorage))).not.toContain('new-access-secret')
  })

  it('revokes every other session without a request body', async () => {
    vi.mocked(cmsSecuritySettingsRevokeOthers).mockResolvedValue({ success: true })

    await securitySettingsApi.revokeOtherSessions()

    expect(cmsSecuritySettingsRevokeOthers).toHaveBeenCalledWith()
  })
})
