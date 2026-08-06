import { adminEndUserProfilesProfile } from "@/shared/api/generated/retenive-backend";
import type { ProfileProjectionResponseDto } from "@/shared/api/generated/models";
import { normalizeApiError } from "@/shared/api/http/api-error";
import { repository } from "@/shared/api/repository";
import { isMockMode } from "@/shared/config/data-mode";

export interface SupportUserProfileSource {
  read(
    projectId: string,
    endUserId: string,
    signal?: AbortSignal,
  ): Promise<ProfileProjectionResponseDto>;
}

function mockField(
  key: string,
  label: string,
  value: string | undefined,
): ProfileProjectionResponseDto["fields"][number] {
  return {
    definitionId: `mock-${key}`,
    definitionRevisionId: `mock-${key}-r1`,
    key,
    label,
    valueType: "STRING",
    lifecycle: "ACTIVE",
    classification: "INTERNAL",
    access: "ALLOWED",
    availability: value ? "AVAILABLE" : "MISSING",
    ...(value ? { value: { type: "STRING", value } } : {}),
  };
}

const apiSource: SupportUserProfileSource = {
  async read(projectId, endUserId, signal) {
    try {
      return await adminEndUserProfilesProfile(projectId, endUserId, { signal });
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
};

const mockSource: SupportUserProfileSource = {
  async read(projectId, endUserId, signal) {
    const page = await repository.getUsersPage(projectId, { limit: 100 });
    if (signal?.aborted) throw signal.reason;
    const user = page.items.find((item) => item.id === endUserId);
    if (!user) throw new Error("Support workspace end user is unavailable");
    return {
      endUserId: user.id,
      externalUserId: user.externalId,
      profileVersion: "demo",
      syncStatus: "VALID",
      fields: [
        mockField("name", "Имя", user.profile.name),
        mockField("email", "Email", user.profile.email),
        mockField("country", "Страна", user.profile.country),
        mockField("segment", "Сегмент", user.segment),
      ],
      observedAt: user.lastSeenAt,
      receivedAt: user.lastSeenAt,
      ageSeconds: Math.max(
        0,
        Math.round((Date.now() - Date.parse(user.lastSeenAt)) / 1000),
      ),
      contractRevision: 1,
      provenance: "PRODUCT_PROFILE",
    };
  },
};

export const supportUserProfileSource: SupportUserProfileSource = isMockMode
  ? mockSource
  : apiSource;
