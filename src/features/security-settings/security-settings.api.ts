import {
  cmsSecuritySettingsChangePassword,
  cmsSecuritySettingsList,
  cmsSecuritySettingsRevoke,
  cmsSecuritySettingsRevokeOthers,
} from '@/shared/api/generated/lola-backend'
import type {
  CmsPasswordChangeRequestDto,
  CmsSessionSummaryDto,
} from '@/shared/api/generated/models'
import { storeAccessToken } from '@/shared/api/http/auth-session'

export const securitySettingsApi = {
  async listSessions(): Promise<CmsSessionSummaryDto[]> {
    return (await cmsSecuritySettingsList()).sessions
  },

  revokeSession(sessionId: string) {
    return cmsSecuritySettingsRevoke(sessionId)
  },

  revokeOtherSessions() {
    return cmsSecuritySettingsRevokeOthers()
  },

  async changePassword(input: CmsPasswordChangeRequestDto): Promise<void> {
    storeAccessToken(await cmsSecuritySettingsChangePassword(input))
  },
}
