export const PLATFORM_PERMISSION_CODES = [
  "platform.projects.read",
  "platform.projects.create",
  "platform.projects.update",
  "platform.projects.archive",
  "platform.cms_users.read",
  "platform.cms_users.create",
  "platform.cms_users.update",
  "platform.cms_users.deactivate",
  "platform.cms_users.reactivate",
  "platform.cms_users.reset_credentials",
  "platform.memberships.read",
  "platform.memberships.manage",
  "platform.roles.read",
  "platform.roles.manage",
  "platform.audit.read",
  "platform.provider_billing.read",
  "platform.provider_billing.sync",
  "platform.translation_usage.read",
  "platform.notifications.operations.read",
  "platform.notifications.operations.operate",
] as const;

export const PROJECT_PERMISSION_CODES = [
  "project.settings.read",
  "project.settings.write",
  "project.credentials.rotate",
  "project.members.read",
  "project.members.manage",
  "project.roles.read",
  "project.roles.manage",
  "project.end_users.read",
  "project.end_users.write",
  "project.profiles.read",
  "project.profile_contract.read",
  "project.profile_contract.write",
  "project.profile_contract.publish",
  "project.conversations.read",
  "project.conversations.reply",
  "project.conversations.ai_suspend",
  "project.ai_proposals.read",
  "project.ai_proposals.decide",
  "project.user_memory.read",
  "project.user_memory.manage",
  "project.ai_review.read",
  "project.ai_review.run",
  "project.scenarios.read",
  "project.scenarios.write",
  "project.scenarios.publish",
  "project.segments.read",
  "project.segments.write",
  "project.event_catalog.read",
  "project.event_catalog.write",
  "project.event_catalog.publish",
  "project.event_logs.read",
  "project.scenario_runs.read",
  "project.knowledge.read",
  "project.knowledge.write",
  "project.actions.read",
  "project.actions.manage",
  "project.actions.manage_ai_exposure",
  "project.ui_registry.read",
  "project.ui_registry.write",
  "project.speech.read",
  "project.speech.write",
  "project.translation.create",
  "project.translation.read",
  "project.translation.cancel",
  "project.ai_usage.read",
  "project.notifications.read",
  "project.notifications.manage",
  "project.integrations.read",
  "project.integrations.manage",
  "project.integration_activity.read",
  "project.integration_message_content.read",
  "project.telegram.links.read",
  "project.telegram.personal_messages.send",
  "project.telegram.broadcasts.read",
  "project.telegram.broadcasts.draft",
  "project.telegram.broadcasts.approve",
  "project.telegram.broadcasts.operate",
  "project.audit.read",
] as const;

export type PlatformPermissionCode = (typeof PLATFORM_PERMISSION_CODES)[number];
export type ProjectPermissionCode = (typeof PROJECT_PERMISSION_CODES)[number];

export const PROJECT_SETTINGS_SURFACE_READ_PERMISSIONS = [
  "project.settings.read",
  "project.profile_contract.read",
  "project.speech.read",
  "project.ai_usage.read",
] as const satisfies readonly ProjectPermissionCode[];

export function hasProjectPermission(
  effectivePermissionCodes: readonly string[],
  permission: ProjectPermissionCode,
): boolean {
  return effectivePermissionCodes.includes(permission);
}

export function hasPlatformPermission(
  platformPermissionCodes: readonly string[],
  permission: PlatformPermissionCode,
): boolean {
  return platformPermissionCodes.includes(permission);
}

export function hasProjectOrPlatformPermission(
  platformPermissionCodes: readonly string[],
  effectivePermissionCodes: readonly string[],
  projectPermission: ProjectPermissionCode,
  platformPermission: PlatformPermissionCode,
): boolean {
  return (
    hasProjectPermission(effectivePermissionCodes, projectPermission) ||
    hasPlatformPermission(platformPermissionCodes, platformPermission)
  );
}
