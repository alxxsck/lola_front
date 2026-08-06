import { hasProjectPermission } from "@/features/auth/permission-access";
const supportWorkspaceReadPermission = "project.conversations.read" as const;
const supportLeadControlReadPermission =
  "project.support.lead_control.read" as const;
const supportAvailabilityReadPermission =
  "project.support.availability.read" as const;
const supportAvailabilitySelfManagePermission =
  "project.support.availability.self_manage" as const;
const supportAssignmentSelfManagePermission =
  "project.support.assignments.self_manage" as const;
const supportRoutingReceivePermission =
  "project.support.routing.receive" as const;

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

export function canReadSupportAvailability(
  effectivePermissionCodes: readonly string[],
): boolean {
  return hasProjectPermission(
    effectivePermissionCodes,
    supportAvailabilityReadPermission,
  );
}

export function canManageOwnSupportAvailability(
  effectivePermissionCodes: readonly string[],
): boolean {
  return (
    canReadSupportAvailability(effectivePermissionCodes) &&
    hasProjectPermission(
      effectivePermissionCodes,
      supportAvailabilitySelfManagePermission,
    )
  );
}

export function canManageOwnSupportAssignments(
  effectivePermissionCodes: readonly string[],
): boolean {
  return hasProjectPermission(
    effectivePermissionCodes,
    supportAssignmentSelfManagePermission,
  );
}

export function canReceiveSupportRoutingOffers(
  effectivePermissionCodes: readonly string[],
): boolean {
  return (
    canManageOwnSupportAssignments(effectivePermissionCodes) &&
    hasProjectPermission(effectivePermissionCodes, supportRoutingReceivePermission)
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
