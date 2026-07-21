export function canReadProjectMemberships(
  platformPermissions: readonly string[],
  projectPermissions: readonly string[],
): boolean {
  return (
    platformPermissions.includes('platform.memberships.read') ||
    projectPermissions.includes('project.members.read')
  )
}

export function canManageProjectMemberships(
  platformPermissions: readonly string[],
  projectPermissions: readonly string[],
): boolean {
  return (
    platformPermissions.includes('platform.memberships.manage') ||
    projectPermissions.includes('project.members.manage')
  )
}

export function canAttachExistingCmsUser(
  platformPermissions: readonly string[],
): boolean {
  return platformPermissions.includes('platform.memberships.manage')
}
