import {
  caseIntelligenceSafetyGet,
  caseIntelligenceSafetyLookup,
  caseIntelligenceSafetyPublish,
} from "@/shared/api/generated/retenive-backend";
import type {
  PlatformCaseIntelligenceSafetyStateResponseDto,
  PublishPlatformCaseIntelligenceSafetyDto,
} from "@/shared/api/generated/models";
import { normalizeApiError } from "@/shared/api/http/api-error";

export async function readPlatformCaseIntelligenceSafety(
  signal?: AbortSignal,
): Promise<PlatformCaseIntelligenceSafetyStateResponseDto | null> {
  try {
    return await caseIntelligenceSafetyGet(signal ? { signal } : undefined);
  } catch (cause) {
    const error = normalizeApiError(cause);
    if (
      error.status === 404 &&
      error.code === "CASE_INTELLIGENCE_SAFETY_NOT_CONFIGURED"
    )
      return null;
    throw error;
  }
}
export async function publishPlatformCaseIntelligenceSafety(
  payload: PublishPlatformCaseIntelligenceSafetyDto,
  signal?: AbortSignal,
): Promise<PlatformCaseIntelligenceSafetyStateResponseDto> {
  try {
    return await caseIntelligenceSafetyPublish(
      payload,
      signal ? { signal } : undefined,
    );
  } catch (cause) {
    throw normalizeApiError(cause);
  }
}

export async function lookupPlatformCaseIntelligenceSafetyCommand(
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<PlatformCaseIntelligenceSafetyStateResponseDto> {
  try {
    return await caseIntelligenceSafetyLookup(
      idempotencyKey,
      signal ? { signal } : undefined,
    );
  } catch (cause) {
    throw normalizeApiError(cause);
  }
}
