import { hasProjectPermission } from "@/features/auth/permission-access";
const supportWorkspaceReadPermission = "project.conversations.read" as const;
const supportLeadControlReadPermission =
  "project.support.lead_control.read" as const;

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

export function canReadSupportControl(
  effectivePermissionCodes: readonly string[],
): boolean {
  return hasProjectPermission(
    effectivePermissionCodes,
    supportLeadControlReadPermission,
  );
}

/**
 * The temporary global rollout must be explicitly enabled by deployment
 * configuration. It deliberately does not read `project.settings`: that
 * projection requires a different permission and is not a typed rollout
 * contract.
 */
export function isSupportWorkspaceRolloutEnabled(value: unknown): boolean {
  return value === true;
}
