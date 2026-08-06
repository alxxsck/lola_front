import { hasProjectPermission } from "@/features/auth/permission-access";

const supportWorkspaceReadPermission = "project.conversations.read" as const;

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
