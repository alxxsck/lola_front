import {
  projectPermissionList,
  projectRoleArchive,
  projectRoleCreate,
  projectRoleGet,
  projectRoleList,
  projectRoleReassign,
  projectRoleUpdate,
} from '@/shared/api/generated/lola-backend'
import type {
  ArchiveProjectRoleDto,
  CreateProjectRoleDto,
  ReassignProjectRoleDto,
  UpdateProjectRoleDto,
} from '@/shared/api/generated/models'

const normalizeReason = (value: string) => value.trim().normalize('NFC')

export const projectRoleApi = {
  permissions: (projectId: string) => projectPermissionList(projectId),
  list: (projectId: string) => projectRoleList(projectId),
  get: (projectId: string, roleId: string) => projectRoleGet(projectId, roleId),
  create: (projectId: string, body: CreateProjectRoleDto) =>
    projectRoleCreate(projectId, { ...body, reason: normalizeReason(body.reason) }),
  update: (projectId: string, roleId: string, body: UpdateProjectRoleDto) =>
    projectRoleUpdate(projectId, roleId, { ...body, reason: normalizeReason(body.reason) }),
  reassign: (projectId: string, roleId: string, body: ReassignProjectRoleDto) =>
    projectRoleReassign(projectId, roleId, { ...body, reason: normalizeReason(body.reason) }),
  archive: (projectId: string, roleId: string, body: ArchiveProjectRoleDto) =>
    projectRoleArchive(projectId, roleId, { ...body, reason: normalizeReason(body.reason) }),
}
