import { publicEmailActionHttp } from '@/features/email-identity/email-action-http'

export interface PasswordRecoveryRequested {
  accepted: true
}

export interface PasswordResetCompleted {
  kind: 'PASSWORD_RESET_COMPLETED'
  next: 'LOGIN'
}

export interface PasswordResetInput {
  token: string
  newPassword: string
  passwordConfirmation: string
}

export const passwordRecoveryApi = {
  async request(email: string): Promise<PasswordRecoveryRequested> {
    return (await publicEmailActionHttp.post<PasswordRecoveryRequested>(
      '/api/v1/auth/password-reset/requests',
      { email },
    )).data
  },

  async complete(input: PasswordResetInput): Promise<PasswordResetCompleted> {
    return (await publicEmailActionHttp.post<PasswordResetCompleted>(
      '/api/v1/auth/password-reset/complete',
      input,
    )).data
  },
}
