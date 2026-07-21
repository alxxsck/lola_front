import { axiosInstance } from '@/shared/api/http/axios-instance'
import type { EmailActionKind } from './email-action-capability'
import { publicEmailActionHttp } from './email-action-http'

export interface InvitationConsumed {
  kind: 'PASSWORD_SETUP_REQUIRED'
  setupToken: string
  expiresAt: string
}

export type EmailActionConsumeResult = InvitationConsumed | { verified: true } | { changed: true }

export interface EmailVerificationRequested {
  accepted: true
  retryAfterSeconds: number
}

export interface EmailChangeRequested extends EmailVerificationRequested {
  pendingEmail: string
}

export interface EmailChangeRequest {
  newEmail: string
  currentPassword: string
}

const consumePath: Record<EmailActionKind, string> = {
  'initial-access': '/api/v1/auth/email-invitations/consume',
  verification: '/api/v1/auth/email-verifications/consume',
  'email-change': '/api/v1/auth/email-change/consume',
}

export const emailIdentityApi = {
  async consume(action: EmailActionKind, token: string): Promise<EmailActionConsumeResult> {
    return (await publicEmailActionHttp.post<EmailActionConsumeResult>(consumePath[action], { token })).data
  },

  async requestVerification(): Promise<EmailVerificationRequested> {
    return (await axiosInstance.post<EmailVerificationRequested>('/api/v1/auth/me/email-verification')).data
  },

  async requestEmailChange(input: EmailChangeRequest): Promise<EmailChangeRequested> {
    return (await axiosInstance.post<EmailChangeRequested>('/api/v1/auth/me/email-change', input)).data
  },

  async cancelEmailChange(): Promise<{ success: true }> {
    return (await axiosInstance.delete<{ success: true }>('/api/v1/auth/me/email-change')).data
  },
}
