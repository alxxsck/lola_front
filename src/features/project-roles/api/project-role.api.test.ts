import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  projectPermissionList,
  projectRoleArchive,
  projectRoleCreate,
  projectRoleGet,
  projectRoleList,
  projectRoleReassign,
  projectRoleUpdate,
} from '@/shared/api/generated/lola-backend'
import { projectRoleApi } from './project-role.api'

vi.mock('@/shared/api/generated/lola-backend', () => ({
  projectPermissionList: vi.fn(),
  projectRoleArchive: vi.fn(),
  projectRoleCreate: vi.fn(),
  projectRoleGet: vi.fn(),
  projectRoleList: vi.fn(),
  projectRoleReassign: vi.fn(),
  projectRoleUpdate: vi.fn(),
}))

describe('Project Role API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const operation of [
      projectPermissionList,
      projectRoleArchive,
      projectRoleCreate,
      projectRoleGet,
      projectRoleList,
      projectRoleReassign,
      projectRoleUpdate,
    ]) {
      vi.mocked(operation).mockResolvedValue({} as never)
    }
  })

  it('uses the generated project-scoped read operations', async () => {
    await projectRoleApi.permissions('project-1')
    await projectRoleApi.list('project-1')
    await projectRoleApi.get('project-1', 'role-1')

    expect(projectPermissionList).toHaveBeenCalledWith('project-1')
    expect(projectRoleList).toHaveBeenCalledWith('project-1')
    expect(projectRoleGet).toHaveBeenCalledWith('project-1', 'role-1')
  })

  it('normalizes audit reasons and preserves optimistic impact bindings', async () => {
    await projectRoleApi.update('project-1', 'role-1', {
      version: 4,
      expectedAssignedMembershipCount: 2,
      expectedAssignedMembershipCountCapped: false,
      permissionCodes: ['project.roles.read'],
      reason: '  Approved role update  ',
    })
    await projectRoleApi.reassign('project-1', 'role-1', {
      version: 5,
      expectedAssignedMembershipCount: 2,
      expectedAssignedMembershipCountCapped: false,
      replacementRoleIds: ['role-2'],
      reason: '  Approved reassignment  ',
    })
    await projectRoleApi.archive('project-1', 'role-1', {
      version: 6,
      expectedAssignedMembershipCount: 0,
      expectedAssignedMembershipCountCapped: false,
      reason: '  Approved retirement  ',
    })

    expect(projectRoleUpdate).toHaveBeenCalledWith('project-1', 'role-1', {
      version: 4,
      expectedAssignedMembershipCount: 2,
      expectedAssignedMembershipCountCapped: false,
      permissionCodes: ['project.roles.read'],
      reason: 'Approved role update',
    })
    expect(projectRoleReassign).toHaveBeenCalledWith('project-1', 'role-1', {
      version: 5,
      expectedAssignedMembershipCount: 2,
      expectedAssignedMembershipCountCapped: false,
      replacementRoleIds: ['role-2'],
      reason: 'Approved reassignment',
    })
    expect(projectRoleArchive).toHaveBeenCalledWith('project-1', 'role-1', {
      version: 6,
      expectedAssignedMembershipCount: 0,
      expectedAssignedMembershipCountCapped: false,
      reason: 'Approved retirement',
    })
  })
})
