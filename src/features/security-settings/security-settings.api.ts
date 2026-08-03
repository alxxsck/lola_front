import {
  cmsSecuritySettingsChangePassword,
  cmsSecuritySettingsList,
  cmsSecuritySettingsRevoke,
  cmsSecuritySettingsRevokeOthers,
} from "@/shared/api/generated/lola-backend";
import type {
  CmsPasswordChangeRequestDto,
  CmsSessionSummaryDto,
} from "@/shared/api/generated/models";
import {
  coordinateAuthSessionMutation,
  getAuthSessionGeneration,
  storeAccessToken,
} from "@/shared/api/http/auth-session";
import { isInteractiveLoginRequired } from "@/features/auth/interactive-login-requirement";

export const securitySettingsApi = {
  async listSessions(): Promise<CmsSessionSummaryDto[]> {
    return (await cmsSecuritySettingsList()).sessions;
  },

  revokeSession(sessionId: string) {
    return cmsSecuritySettingsRevoke(sessionId);
  },

  revokeOtherSessions() {
    return cmsSecuritySettingsRevokeOthers();
  },

  async changePassword(input: CmsPasswordChangeRequestDto): Promise<void> {
    await coordinateAuthSessionMutation(async () => {
      const startingGeneration = getAuthSessionGeneration();
      const response = await cmsSecuritySettingsChangePassword(input);
      if (
        isInteractiveLoginRequired() ||
        getAuthSessionGeneration() !== startingGeneration
      )
        return;
      storeAccessToken(response);
    });
  },
};
