import {
  notificationPreferencesGetEmailAIProposals,
  notificationPreferencesSetEmailAIProposals,
} from '@/shared/api/generated/lola-backend'
import type { EmailAIProposalPreferenceResponseDto } from '@/shared/api/generated/models'

export const notificationPreferencesApi = {
  getEmailAIProposals(): Promise<EmailAIProposalPreferenceResponseDto> {
    return notificationPreferencesGetEmailAIProposals()
  },

  setEmailAIProposals(subscribed: boolean): Promise<EmailAIProposalPreferenceResponseDto> {
    return notificationPreferencesSetEmailAIProposals({ subscribed })
  },
}
