import { beforeEach, describe, expect, it, vi } from 'vitest'
import { publicEmailActionHttp } from '@/features/email-identity/email-action-http'
import { passwordRecoveryApi } from './password-recovery.api'

vi.mock('@/features/email-identity/email-action-http', () => ({
  publicEmailActionHttp: {
    post: vi.fn(),
  },
}))

describe('password recovery API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('requests recovery through the credential-free public client', async () => {
    vi.mocked(publicEmailActionHttp.post).mockResolvedValue({ data: { accepted: true } })
    await expect(passwordRecoveryApi.request('operator@example.com')).resolves.toEqual({ accepted: true })

    expect(publicEmailActionHttp.post).toHaveBeenCalledWith(
      '/api/v1/auth/password-reset/requests',
      { email: 'operator@example.com' },
    )
  })

  it('submits the capability only in the explicit completion POST body', async () => {
    const token = 'lpr_secret-capability'
    vi.mocked(publicEmailActionHttp.post).mockResolvedValue({
      data: { kind: 'PASSWORD_RESET_COMPLETED', next: 'LOGIN' },
    })

    await expect(passwordRecoveryApi.complete({
      token,
      newPassword: 'correct horse battery staple',
      passwordConfirmation: 'correct horse battery staple',
    })).resolves.toEqual({ kind: 'PASSWORD_RESET_COMPLETED', next: 'LOGIN' })

    expect(publicEmailActionHttp.post).toHaveBeenCalledWith(
      '/api/v1/auth/password-reset/complete',
      {
        token,
        newPassword: 'correct horse battery staple',
        passwordConfirmation: 'correct horse battery staple',
      },
    )
    expect(vi.mocked(publicEmailActionHttp.post).mock.calls[0]?.[0]).not.toContain(token)
  })
})
