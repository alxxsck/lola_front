import { hasProjectPermission } from "@/features/auth/permission-access";
import type { AuthProject } from "@/shared/types/domain";

const supportWorkspaceReadPermission = "project.conversations.read" as const;
const supportWorkspaceShellFlag = "support_workspace_shell";

/**
 * Route/navigation guard only. Target-specific actions still require the
 * server projection's allowed actions once those contracts are available.
 */
export function canReadSupportWorkspace(
  effectivePermissionCodes: readonly string[],
): boolean {
  return hasProjectPermission(
    effectivePermissionCodes,
    supportWorkspaceReadPermission,
  );
}

/** Project rollout is independent from the operator's effective permissions. */
export function isSupportWorkspaceShellEnabled(
  project: Pick<AuthProject, "settings"> | null | undefined,
): boolean {
  return project?.settings?.[supportWorkspaceShellFlag] === true;
}
