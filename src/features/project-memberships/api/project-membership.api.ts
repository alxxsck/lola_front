import {
  managedProjectRoleList,
  projectMembershipCreate,
  projectMembershipGet,
  projectMembershipList,
  projectMembershipRemove,
  projectMembershipUpdate,
} from '@/shared/api/generated/lola-backend'
import type {
  CreateProjectMembershipDto,
  ProjectMembershipListParams,
  RemoveProjectMembershipDto,
  UpdateProjectMembershipDto,
} from '@/shared/api/generated/models'

const reason = (value: string) => value.trim().normalize('NFC')

export const projectMembershipApi = {
  list: (projectId: string, params: ProjectMembershipListParams) =>
    projectMembershipList(projectId, params),
  roles: (projectId: string) => managedProjectRoleList(projectId),
  get: (projectId: string, membershipId: string) =>
    projectMembershipGet(projectId, membershipId),
  create: (projectId: string, body: CreateProjectMembershipDto) =>
    projectMembershipCreate(projectId, {
      ...body,
      reason: reason(body.reason),
    }),
  update: (
    projectId: string,
    membershipId: string,
    body: UpdateProjectMembershipDto,
  ) =>
    projectMembershipUpdate(projectId, membershipId, {
      ...body,
      reason: reason(body.reason),
    }),
  remove: (
    projectId: string,
    membershipId: string,
    body: RemoveProjectMembershipDto,
  ) =>
    projectMembershipRemove(projectId, membershipId, {
      ...body,
      reason: reason(body.reason),
    }),
}
