import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  projectMembershipAssignableRoles,
  projectMembershipCreate,
  projectMembershipGet,
  projectMembershipList,
  projectMembershipRemove,
  projectMembershipUpdate,
} from '@/shared/api/generated/lola-backend'
import { projectMembershipApi } from './project-membership.api'

vi.mock('@/shared/api/generated/lola-backend', () => ({
  projectMembershipAssignableRoles: vi.fn(),
  projectMembershipCreate: vi.fn(),
  projectMembershipGet: vi.fn(),
  projectMembershipList: vi.fn(),
  projectMembershipRemove: vi.fn(),
  projectMembershipUpdate: vi.fn(),
}))

describe('Project Membership API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(projectMembershipList).mockResolvedValue({
      items: [],
      nextCursor: null,
    })
    vi.mocked(projectMembershipAssignableRoles).mockResolvedValue({ items: [] })
    vi.mocked(projectMembershipCreate).mockResolvedValue({} as never)
    vi.mocked(projectMembershipGet).mockResolvedValue({} as never)
    vi.mocked(projectMembershipUpdate).mockResolvedValue({} as never)
    vi.mocked(projectMembershipRemove).mockResolvedValue({} as never)
  })

  it('keeps the Project and status-bound opaque cursor on generated read contracts', async () => {
    await projectMembershipApi.list('project-1', {
      limit: 50,
      cursor: 'opaque-cursor',
      status: 'REMOVED',
    })
    await projectMembershipApi.roles('project-1')
    await projectMembershipApi.get('project-1', 'membership-1')

    expect(projectMembershipList).toHaveBeenCalledWith('project-1', {
      limit: 50,
      cursor: 'opaque-cursor',
      status: 'REMOVED',
    })
    expect(projectMembershipAssignableRoles).toHaveBeenCalledWith('project-1')
    expect(projectMembershipGet).toHaveBeenCalledWith(
      'project-1',
      'membership-1',
    )
  })

  it('passes role IDs, optimistic version and normalized audit reason without losing Unicode', async () => {
    await projectMembershipApi.create('project-1', {
      cmsUserId: 'user-1',
      roleIds: ['role-1'],
      reason: '  Назначен администратором  ',
    })
    await projectMembershipApi.update('project-1', 'membership-1', {
      version: 7,
      roleIds: ['role-2'],
      reason: '  Изменение подтверждено  ',
    })
    await projectMembershipApi.remove('project-1', 'membership-1', {
      version: 8,
      reason: '  Доступ более не требуется  ',
    })

    expect(projectMembershipCreate).toHaveBeenCalledWith('project-1', {
      cmsUserId: 'user-1',
      roleIds: ['role-1'],
      reason: 'Назначен администратором',
    })
    expect(projectMembershipUpdate).toHaveBeenCalledWith(
      'project-1',
      'membership-1',
      {
        version: 7,
        roleIds: ['role-2'],
        reason: 'Изменение подтверждено',
      },
    )
    expect(projectMembershipRemove).toHaveBeenCalledWith(
      'project-1',
      'membership-1',
      {
        version: 8,
        reason: 'Доступ более не требуется',
      },
    )
  })
})
