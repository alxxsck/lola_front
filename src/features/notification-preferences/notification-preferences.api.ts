import {
  notificationPreferencesGetEmailCaseEscalations,
  notificationPreferencesSetEmailCaseEscalations,
} from '@/shared/api/generated/lola-backend'
import type { EmailCaseEscalationPreferenceResponseDto } from '@/shared/api/generated/models'

export const notificationPreferencesApi = {
  getEmailCaseEscalations(): Promise<EmailCaseEscalationPreferenceResponseDto> {
    return notificationPreferencesGetEmailCaseEscalations()
  },

  setEmailCaseEscalations(subscribed: boolean): Promise<EmailCaseEscalationPreferenceResponseDto> {
    return notificationPreferencesSetEmailCaseEscalations({ subscribed })
  },
}
