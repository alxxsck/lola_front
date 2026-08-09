import { readonly, shallowRef } from "vue";
import type { SupportWorkspaceAdmissionResponseDto } from "@/shared/api/generated/models";
import {
  supportWorkspaceShellSource,
  type SupportWorkspaceShellSource,
} from "../api/support-workspace-shell-source";

export interface SupportWorkspaceShellScope {
  actorId: string;
  projectId: string;
  effectivePermissionCodes: readonly string[];
}

interface SupportWorkspaceShellAdmissionState {
  status: "IDLE" | "LOADING" | "READY" | "ERROR";
  scope: SupportWorkspaceShellScope | null;
  admission: SupportWorkspaceAdmissionResponseDto | null;
  error: string;
}

const state = shallowRef<SupportWorkspaceShellAdmissionState>({
  status: "IDLE",
  scope: null,
  admission: null,
  error: "",
});
export const supportWorkspaceShellAdmissionState = readonly(state);

let generation = 0;
let pending:
  | {
      key: string;
      controller: AbortController;
      promise: Promise<SupportWorkspaceAdmissionResponseDto | null>;
    }
  | undefined;

export async function ensureSupportWorkspaceShellAdmission(
  scope: SupportWorkspaceShellScope,
  source: SupportWorkspaceShellSource = supportWorkspaceShellSource,
): Promise<SupportWorkspaceAdmissionResponseDto | null> {
  const key = scopeKey(scope);
  if (pending?.key === key) return pending.promise;

  pending?.controller.abort();
  const controller = new AbortController();
  const requestGeneration = ++generation;
  state.value = {
    status: "LOADING",
    scope: cloneScope(scope),
    admission: null,
    error: "",
  };
  const promise = source
    .readAdmission(scope.projectId, controller.signal)
    .then((admission) => {
      if (requestGeneration !== generation || scopeKeyOfState() !== key) {
        return null;
      }
      state.value = {
        status: "READY",
        scope: cloneScope(scope),
        admission,
        error: "",
      };
      return admission;
    })
    .catch((cause: unknown) => {
      if (requestGeneration !== generation || scopeKeyOfState() !== key) {
        return null;
      }
      state.value = {
        status: "ERROR",
        scope: cloneScope(scope),
        admission: null,
        error:
          cause instanceof Error
            ? cause.message
            : "Не удалось проверить доступность Support Workspace",
      };
      return null;
    })
    .finally(() => {
      if (pending?.promise === promise) pending = undefined;
    });
  pending = { key, controller, promise };
  return promise;
}

export function clearSupportWorkspaceShellAdmission(): void {
  generation += 1;
  pending?.controller.abort();
  pending = undefined;
  state.value = {
    status: "IDLE",
    scope: null,
    admission: null,
    error: "",
  };
}

function scopeKey(scope: SupportWorkspaceShellScope): string {
  return [
    scope.actorId,
    scope.projectId,
    [...scope.effectivePermissionCodes].sort().join(","),
  ].join("\u0000");
}

function scopeKeyOfState(): string | null {
  return state.value.scope ? scopeKey(state.value.scope) : null;
}

function cloneScope(
  scope: SupportWorkspaceShellScope,
): SupportWorkspaceShellScope {
  return {
    actorId: scope.actorId,
    projectId: scope.projectId,
    effectivePermissionCodes: [...scope.effectivePermissionCodes],
  };
}
