import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/shared/api/http/api-error'
import type {
  CreateProjectRoleDto,
  ProjectPermissionCatalogResponseDto,
  ProjectRoleListResponseDto,
  ProjectRoleResponseDto,
} from '@/shared/api/generated/models'
import { canManageProjectRoles, canReadProjectRoles } from './project-role-permissions'
import { useProjectRoles, type ProjectRoleClient } from './use-project-roles'

const projectId = '00000000-0000-4000-8000-000000000010'
const roleId = '00000000-0000-4000-8000-000000000020'

const role = (overrides: Partial<ProjectRoleResponseDto> = {}): ProjectRoleResponseDto => ({
  id: roleId,
  projectId,
  key: 'SUPPORT_READER',
  name: 'Support reader',
  description: 'Reads support queues',
  managed: false,
  status: 'ACTIVE',
  permissionCodes: ['project.members.read'],
  assignedMembershipCount: 2,
  assignedMembershipCountCapped: false,
  version: 3,
  createdAt: '2026-07-21T10:00:00.000Z',
  updatedAt: '2026-07-21T10:00:00.000Z',
  ...overrides,
})

const catalog: ProjectPermissionCatalogResponseDto = {
  groups: [
    {
      scope: 'PROJECT',
      category: 'members',
      risk: 'LOW',
      permissions: [
        {
          code: 'project.members.read',
          scope: 'PROJECT',
          category: 'members',
          risk: 'LOW',
          label: 'Read members',
          description: 'Read memberships',
          labelTranslations: {},
          descriptionTranslations: {},
        },
      ],
    },
  ],
}

function client(): ProjectRoleClient {
  return {
    permissions: vi.fn().mockResolvedValue(catalog),
    list: vi.fn().mockResolvedValue({ items: [role()] } satisfies ProjectRoleListResponseDto),
    get: vi.fn().mockResolvedValue(role()),
    create: vi.fn(),
    update: vi.fn(),
    reassign: vi.fn(),
    archive: vi.fn(),
  }
}

describe('Project Role state', () => {
  it('clears Project A immediately and ignores delayed A list/catalog responses after switching to B', async () => {
    const api = client()
    let finishAList!: (value: ProjectRoleListResponseDto) => void
    let finishACatalog!: (value: ProjectPermissionCatalogResponseDto) => void
    vi.mocked(api.list).mockImplementation((id) =>
      id === 'project-a'
        ? new Promise((resolve) => {
            finishAList = resolve
          })
        : Promise.resolve({ items: [role({ id: 'role-b', projectId: 'project-b', name: 'B role' })] }),
    )
    vi.mocked(api.permissions).mockImplementation((id) =>
      id === 'project-a'
        ? new Promise((resolve) => {
            finishACatalog = resolve
          })
        : Promise.resolve({ groups: [] }),
    )
    const roles = useProjectRoles(api)
    const projectA = roles.initialize('project-a')
    const projectB = roles.initialize('project-b')
    expect(roles.items.value).toEqual([])
    expect(roles.groups.value).toEqual([])
    await projectB
    expect(roles.items.value.map(({ id }) => id)).toEqual(['role-b'])

    finishAList({ items: [role({ id: 'role-a', projectId: 'project-a', name: 'A role' })] })
    finishACatalog(catalog)
    await projectA
    expect(roles.items.value.map(({ id }) => id)).toEqual(['role-b'])
    expect(roles.groups.value).toEqual([])
  })

  it('does not let a delayed Project A mutation overwrite Project B state', async () => {
    const api = client()
    vi.mocked(api.list).mockImplementation((id) =>
      Promise.resolve({
        items: [role({ id: `role-${id}`, projectId: id, name: `${id} role` })],
      }),
    )
    let finishUpdate!: (value: ProjectRoleResponseDto) => void
    vi.mocked(api.update).mockReturnValue(
      new Promise((resolve) => {
        finishUpdate = resolve
      }),
    )
    const roles = useProjectRoles(api)
    await roles.initialize('project-a')
    const mutation = roles.update(
      'project-a',
      role({ id: 'role-project-a', projectId: 'project-a' }),
      { name: 'Changed A', reason: 'Approved role update' },
    )
    await roles.initialize('project-b')
    finishUpdate(role({ id: 'role-project-a', projectId: 'project-a', version: 4 }))
    await mutation

    expect(roles.items.value.map(({ id }) => id)).toEqual(['role-project-b'])
    expect(roles.operation.value).toEqual({ kind: 'IDLE' })
  })

  it('submits the exact confirmed impact and committed version', async () => {
    const api = client()
    vi.mocked(api.update).mockResolvedValue(role({ version: 4 }))
    const roles = useProjectRoles(api)
    await roles.initialize(projectId)

    await roles.update(projectId, role(), {
      name: 'Support reader v2',
      permissionCodes: ['project.members.read'],
      reason: 'Approved support role change',
    })

    expect(api.update).toHaveBeenCalledWith(projectId, roleId, {
      version: 3,
      expectedAssignedMembershipCount: 2,
      expectedAssignedMembershipCountCapped: false,
      name: 'Support reader v2',
      permissionCodes: ['project.members.read'],
      reason: 'Approved support role change',
    })
    expect(roles.items.value[0]?.version).toBe(4)
  })

  it.each(['VERSION_CONFLICT', 'ROLE_IMPACT_CHANGED'] as const)(
    'refreshes the winning role after %s and never replays the mutation',
    async (code) => {
      const api = client()
      vi.mocked(api.update).mockRejectedValue(new ApiError(409, 'unsafe', undefined, 'r1', code))
      vi.mocked(api.get).mockResolvedValue(role({ version: 4, assignedMembershipCount: 3 }))
      const roles = useProjectRoles(api)
      await roles.initialize(projectId)

      await roles.update(projectId, role(), {
        name: 'Changed',
        permissionCodes: ['project.members.read'],
        reason: 'Approved support role change',
      })

      expect(api.update).toHaveBeenCalledOnce()
      expect(api.get).toHaveBeenCalledWith(projectId, roleId)
      expect(roles.selected.value?.version).toBe(4)
      expect(roles.operation.value.kind).toBe(code)
    },
  )

  it('requires explicit reassignment data and does not archive a role in use', async () => {
    const api = client()
    vi.mocked(api.archive).mockRejectedValue(new ApiError(409, 'unsafe', undefined, 'r2', 'ROLE_IN_USE'))
    vi.mocked(api.reassign).mockResolvedValue(role({ assignedMembershipCount: 0, version: 4 }))
    const roles = useProjectRoles(api)
    await roles.initialize(projectId)

    await roles.archive(projectId, role(), 'Approved role retirement')
    expect(roles.operation.value).toEqual({ kind: 'ROLE_IN_USE' })
    expect(api.archive).toHaveBeenCalledOnce()

    await roles.reassign(projectId, role(), ['replacement-role'], 'Approved role reassignment')
    expect(api.reassign).toHaveBeenCalledWith(projectId, roleId, {
      version: 3,
      expectedAssignedMembershipCount: 2,
      expectedAssignedMembershipCountCapped: false,
      replacementRoleIds: ['replacement-role'],
      reason: 'Approved role reassignment',
    })
  })

  it('creates only the explicit server-catalog selection', async () => {
    const api = client()
    vi.mocked(api.create).mockResolvedValue(role())
    const roles = useProjectRoles(api)
    await roles.initialize(projectId)
    const body: CreateProjectRoleDto = {
      key: 'SUPPORT_READER',
      name: 'Support reader',
      description: 'Reads support queues',
      permissionCodes: ['project.members.read'],
      reason: 'Approved role creation',
    }
    await roles.create(projectId, body)
    expect(api.create).toHaveBeenCalledWith(projectId, body)
  })
})

describe('Project Role permission gates', () => {
  it('uses only exact Platform-or-selected-Project permissions', () => {
    expect(canReadProjectRoles(['platform.roles.read'], [])).toBe(true)
    expect(canReadProjectRoles([], ['project.roles.read'])).toBe(true)
    expect(canReadProjectRoles(['platform.projects.read'], ['project.members.read'])).toBe(false)
    expect(canManageProjectRoles(['platform.roles.manage'], [])).toBe(true)
    expect(canManageProjectRoles([], ['project.roles.manage'])).toBe(true)
    expect(canManageProjectRoles(['platform.roles.read'], ['project.roles.read'])).toBe(false)
  })
})
