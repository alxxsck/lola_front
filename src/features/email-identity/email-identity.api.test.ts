import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axiosInstance } from '@/shared/api/http/axios-instance'
import { publicEmailActionHttp } from './email-action-http'
import { emailIdentityApi } from './email-identity.api'

vi.mock('@/shared/api/http/axios-instance', () => ({
  axiosInstance: {
    post: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('./email-action-http', () => ({
  publicEmailActionHttp: {
    post: vi.fn(),
  },
}))

describe('email identity API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each([
    ['initial-access', '/api/v1/auth/email-invitations/consume', { kind: 'PASSWORD_SETUP_REQUIRED', setupToken: 'lps_setup', expiresAt: '2026-07-22T10:00:00.000Z' }],
    ['verification', '/api/v1/auth/email-verifications/consume', { verified: true }],
    ['email-change', '/api/v1/auth/email-change/consume', { changed: true }],
  ] as const)('consumes %s only through an explicit public POST body', async (action, path, response) => {
    vi.mocked(publicEmailActionHttp.post).mockResolvedValue({ data: response })
    const token = `${action}-secret-capability`

    await expect(emailIdentityApi.consume(action, token)).resolves.toEqual(response)

    expect(publicEmailActionHttp.post).toHaveBeenCalledWith(path, { token })
    expect(path).not.toContain(token)
  })

  it('requests verification and a password-proved two-phase email change', async () => {
    vi.mocked(axiosInstance.post)
      .mockResolvedValueOnce({ data: { accepted: true, retryAfterSeconds: 45 } })
      .mockResolvedValueOnce({
        data: { accepted: true, pendingEmail: 'new@example.com', retryAfterSeconds: 60 },
      })

    await expect(emailIdentityApi.requestVerification()).resolves.toEqual({
      accepted: true,
      retryAfterSeconds: 45,
    })
    await expect(emailIdentityApi.requestEmailChange({
      newEmail: 'new@example.com',
      currentPassword: 'current password',
    })).resolves.toEqual({
      accepted: true,
      pendingEmail: 'new@example.com',
      retryAfterSeconds: 60,
    })

    expect(axiosInstance.post).toHaveBeenNthCalledWith(1, '/api/v1/auth/me/email-verification')
    expect(axiosInstance.post).toHaveBeenNthCalledWith(2, '/api/v1/auth/me/email-change', {
      newEmail: 'new@example.com',
      currentPassword: 'current password',
    })
  })

  it('cancels a pending email change through the dedicated DELETE action', async () => {
    vi.mocked(axiosInstance.delete).mockResolvedValue({ data: { success: true } })

    await expect(emailIdentityApi.cancelEmailChange()).resolves.toEqual({ success: true })

    expect(axiosInstance.delete).toHaveBeenCalledWith('/api/v1/auth/me/email-change')
  })
})
