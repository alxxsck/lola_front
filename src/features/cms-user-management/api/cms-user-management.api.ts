import {
  cmsUserProvisioningProvision,
  cmsUserLifecycleDeactivate,
  cmsUserLifecycleGet,
  cmsUserLifecycleList,
  cmsUserLifecycleReactivate,
  cmsUserLifecycleResetCredentials,
  cmsUserLifecycleSuspend,
  cmsUserLifecycleUpdate,
  platformListProjects,
  platformRoleAssignmentGet,
  platformRoleAssignmentReplace,
  platformRoleList,
  platformCmsUserSessionList,
  platformCmsUserSessionRevoke,
  projectRoleList,
} from '@/shared/api/generated/lola-backend'
import type {
  CmsUserLifecycleListParams,
  CmsUserProvisioningDto,
  UpdateCmsUserProfileDto,
} from '@/shared/api/generated/models'

export type CmsUserLifecycleAction =
  | 'SUSPEND'
  | 'DEACTIVATE'
  | 'REACTIVATE'
  | 'RESET_CREDENTIALS'

const lifecycleCommands = {
  SUSPEND: cmsUserLifecycleSuspend,
  DEACTIVATE: cmsUserLifecycleDeactivate,
  REACTIVATE: cmsUserLifecycleReactivate,
  RESET_CREDENTIALS: cmsUserLifecycleResetCredentials,
} as const

export const cmsUserManagementApi = {
  projects: () => platformListProjects(),
  roles: (projectId: string) => projectRoleList(projectId),
  platformRoles: () => platformRoleList(),
  platformRoleAssignment: (cmsUserId: string) => platformRoleAssignmentGet(cmsUserId),
  sessions: (cmsUserId: string) => platformCmsUserSessionList(cmsUserId),
  revokeSession: (cmsUserId: string, sessionId: string, reason: string) =>
    platformCmsUserSessionRevoke(cmsUserId, sessionId, {
      reason: reason.trim().normalize('NFC'),
    }),
  replacePlatformRoles: (
    cmsUserId: string,
    version: number,
    roleIds: string[],
    reason: string,
  ) => platformRoleAssignmentReplace(cmsUserId, {
    version,
    roleIds,
    reason: reason.trim().normalize('NFC'),
  }),
  provision: (
    body: CmsUserProvisioningDto,
    idempotencyKey: string,
  ) => cmsUserProvisioningProvision(
    {
      ...body,
      email: body.email.trim(),
      givenName: body.givenName.trim().normalize('NFC'),
      familyName: body.familyName.trim().normalize('NFC'),
    },
    { headers: { 'Idempotency-Key': idempotencyKey } },
  ),
  list: (params: CmsUserLifecycleListParams) => cmsUserLifecycleList(params),
  get: (cmsUserId: string) => cmsUserLifecycleGet(cmsUserId),
  update: (cmsUserId: string, body: UpdateCmsUserProfileDto) =>
    cmsUserLifecycleUpdate(cmsUserId, body),
  mutate(
    cmsUserId: string,
    action: CmsUserLifecycleAction,
    version: number,
    reason: string,
  ) {
    return lifecycleCommands[action](cmsUserId, {
      version,
      reason: reason.trim().normalize('NFC'),
    })
  },
}
