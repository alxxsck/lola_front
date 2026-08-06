import { ref } from "vue";
import type { ProfileProjectionResponseDto } from "@/shared/api/generated/models";
import { ApiError } from "@/shared/api/http/api-error";
import type { SupportUserProfileSource } from "@/features/support-workspace/api/support-user-profile-source";

export interface SupportUserProfileContext {
  projectId(): string | undefined;
  endUserId(): string | undefined;
  canRead(): boolean;
  onForbidden?(): void | Promise<void>;
}

/** Lazily loads one permission-gated profile projection for the active selection. */
export function createSupportUserProfileController(
  context: SupportUserProfileContext,
  source: SupportUserProfileSource,
) {
  const profile = ref<ProfileProjectionResponseDto | null>(null);
  const loading = ref(false);
  const error = ref("");
  let generation = 0;
  let requestAbort: AbortController | null = null;

  function reset(): void {
    generation += 1;
    requestAbort?.abort();
    requestAbort = null;
    profile.value = null;
    loading.value = false;
    error.value = "";
  }

  function isCurrent(
    projectId: string,
    endUserId: string,
    requestGeneration: number,
  ): boolean {
    return (
      requestGeneration === generation &&
      context.canRead() &&
      context.projectId() === projectId &&
      context.endUserId() === endUserId
    );
  }

  async function load(): Promise<void> {
    const projectId = context.projectId();
    const endUserId = context.endUserId();
    requestAbort?.abort();
    const requestGeneration = ++generation;
    const abort = new AbortController();
    requestAbort = abort;
    profile.value = null;
    error.value = "";
    if (!projectId || !endUserId || !context.canRead()) {
      loading.value = false;
      requestAbort = null;
      return;
    }

    loading.value = true;
    try {
      const result = await source.read(projectId, endUserId, abort.signal);
      if (!isCurrent(projectId, endUserId, requestGeneration)) return;
      if (result.endUserId !== endUserId) {
        error.value = "Профиль вернул данные другого пользователя";
        return;
      }
      profile.value = result;
    } catch (cause) {
      if (!isCurrent(projectId, endUserId, requestGeneration)) return;
      if (cause instanceof ApiError && cause.status === 403) {
        reset();
        await context.onForbidden?.();
        return;
      }
      error.value = "Не удалось загрузить профиль пользователя";
    } finally {
      if (requestGeneration === generation) {
        loading.value = false;
        requestAbort = null;
      }
    }
  }

  return { profile, loading, error, load, reset };
}
