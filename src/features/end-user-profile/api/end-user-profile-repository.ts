import {
  adminEndUserProfilesList,
  adminEndUserProfilesProfile,
} from "@/shared/api/generated/lola-backend";
import type { AdminEndUserProfilesListParams } from "@/shared/api/generated/models";
import { normalizeApiError } from "@/shared/api/http/api-error";

async function call<Response>(
  request: () => Promise<Response>,
): Promise<Response> {
  try {
    return await request();
  } catch (cause) {
    throw normalizeApiError(cause);
  }
}

export const endUserProfileRepository = {
  list: (projectId: string, params?: AdminEndUserProfilesListParams) =>
    call(() => adminEndUserProfilesList(projectId, params)),
  profile: (projectId: string, endUserId: string) =>
    call(() => adminEndUserProfilesProfile(projectId, endUserId)),
};
