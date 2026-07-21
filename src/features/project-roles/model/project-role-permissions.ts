export function canReadProjectRoles(
  platformPermissions: readonly string[],
  projectPermissions: readonly string[],
): boolean {
  return (
    platformPermissions.includes('platform.roles.read') ||
    projectPermissions.includes('project.roles.read')
  )
}

export function canManageProjectRoles(
  platformPermissions: readonly string[],
  projectPermissions: readonly string[],
): boolean {
  return (
    platformPermissions.includes('platform.roles.manage') ||
    projectPermissions.includes('project.roles.manage')
  )
}
