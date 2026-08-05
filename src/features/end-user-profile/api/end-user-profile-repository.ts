import {
  adminEndUserProfilesHistory,
  adminEndUserProfilesList,
  adminEndUserProfilesProfile,
} from "@/shared/api/generated/retenive-backend";
import type {
  AdminEndUserProfilesHistoryParams,
  AdminEndUserProfilesListParams,
} from "@/shared/api/generated/models";
import { normalizeApiError } from "@/shared/api/http/api-error";
import { repository } from "@/shared/api/repository";
import { isMockMode } from "@/shared/config/data-mode";

export interface ResolvedEndUserIdentity {
  endUserId: string;
  externalUserId: string | null;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  history: (
    projectId: string,
    endUserId: string,
    params?: AdminEndUserProfilesHistoryParams,
  ) => call(() => adminEndUserProfilesHistory(projectId, endUserId, params)),
  async resolveIdentity(
    projectId: string,
    identity: string,
  ): Promise<ResolvedEndUserIdentity | null> {
    const normalized = identity.trim();
    if (!normalized) return null;
    if (uuidPattern.test(normalized)) {
      return { endUserId: normalized, externalUserId: null };
    }

    if (isMockMode) {
      const page = await repository.getUsersPage(projectId, { limit: 100 });
      const user = page.items.find(
        (candidate) => candidate.externalId === normalized,
      );
      return user
        ? { endUserId: user.id, externalUserId: user.externalId }
        : null;
    }

    const response = await call(() =>
      adminEndUserProfilesList(projectId, {
        externalUserId: normalized,
        limit: 2,
      }),
    );
    const user = response.items.find(
      (candidate) => candidate.externalUserId === normalized,
    );
    return user
      ? { endUserId: user.endUserId, externalUserId: user.externalUserId }
      : null;
  },
};
