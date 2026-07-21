import {
  cmsUserLifecycleDeactivate,
  cmsUserLifecycleGet,
  cmsUserLifecycleList,
  cmsUserLifecycleReactivate,
  cmsUserLifecycleResetCredentials,
  cmsUserLifecycleSuspend,
  cmsUserLifecycleUpdate,
} from '@/shared/api/generated/lola-backend'
import type {
  CmsUserLifecycleListParams,
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
