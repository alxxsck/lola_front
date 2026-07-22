import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/shared/api/http/api-error'
import type {
  AssignableProjectRoleDto,
  ProjectMembershipListResponseDto,
  ProjectMembershipResponseDto,
} from '@/shared/api/generated/models'
import {
  canAttachExistingCmsUser,
  canManageProjectMemberships,
  canReadProjectMemberships,
} from './project-membership-permissions'
import {
  useProjectMemberships,
  type ProjectMembershipClient,
} from './use-project-memberships'

const projectId = '00000000-0000-4000-8000-000000000010'
const membershipId = '00000000-0000-4000-8000-000000000020'
const cmsUserId = '00000000-0000-4000-8000-000000000030'

const role = (
  overrides: Partial<AssignableProjectRoleDto> = {},
): AssignableProjectRoleDto => ({
  id: '00000000-0000-4000-8000-000000000040',
  key: 'PROJECT_ADMIN',
  name: 'Project Admin',
  description: 'Управляет проектом',
  managed: true,
  permissionCodes: ['project.members.read'],
  version: 1,
  ...overrides,
})

const membership = (
  overrides: Partial<ProjectMembershipResponseDto> = {},
): ProjectMembershipResponseDto => ({
  id: membershipId,
  projectId,
  cmsUser: {
    id: cmsUserId,
    email: 'anna@example.com',
    givenName: 'Анна',
    familyName: 'Орлова',
    displayName: 'Анна Орлова',
    status: 'ACTIVE',
    emailVerified: true,
    lastLoginAt: '2026-07-21T10:00:00.000Z',
  },
  status: 'ACTIVE',
  version: 3,
  roles: [
    {
      id: role().id,
      key: role().key,
      name: role().name,
      managed: true,
      version: 1,
    },
  ],
  effectivePermissionCodes: ['project.members.read'],
  createdAt: '2026-07-20T10:00:00.000Z',
  updatedAt: '2026-07-21T10:00:00.000Z',
  removedAt: null,
  ...overrides,
})

function client(): ProjectMembershipClient {
  return {
    list: vi.fn(),
    roles: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  }
}

describe('Project Membership state', () => {
  let api: ProjectMembershipClient

  beforeEach(() => {
    api = client()
    vi.mocked(api.roles).mockResolvedValue({ items: [role()] })
  })

  it('binds the opaque cursor to the selected server status and drops stale Project responses', async () => {
    let finishOld!: (value: ProjectMembershipListResponseDto) => void
    vi.mocked(api.list)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finishOld = resolve
        }),
      )
      .mockResolvedValueOnce({
        items: [membership({ id: 'new' })],
        nextCursor: 'cursor-2',
      })
      .mockResolvedValueOnce({
        items: [membership({ id: 'new' })],
        nextCursor: 'cursor-2',
      })
      .mockResolvedValueOnce({
        items: [membership({ id: 'second' })],
        nextCursor: null,
      })
    const directory = useProjectMemberships(api)

    const oldRequest = directory.load('project-old')
    await directory.load(projectId)
    finishOld({
      items: [membership({ id: 'stale' })],
      nextCursor: 'stale-cursor',
    })
    await oldRequest
    await directory.setStatus(projectId, 'REMOVED')
    await directory.load(projectId, true)

    expect(api.list).toHaveBeenNthCalledWith(3, projectId, {
      limit: 50,
      status: 'REMOVED',
    })
    expect(api.list).toHaveBeenNthCalledWith(4, projectId, {
      limit: 50,
      cursor: 'cursor-2',
      status: 'REMOVED',
    })
    expect(directory.items.value.map((item) => item.id)).toEqual([
      'new',
      'second',
    ])
  })

  it('keeps confirmed membership state unchanged while a role update is in flight', async () => {
    let finish!: (value: ProjectMembershipResponseDto) => void
    vi.mocked(api.list).mockResolvedValue({
      items: [membership()],
      nextCursor: null,
    })
    vi.mocked(api.update).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const directory = useProjectMemberships(api)
    await directory.load(projectId)

    const request = directory.update(
      projectId,
      membership(),
      [role().id],
      'Изменение роли подтверждено',
    )

    expect(directory.items.value[0]?.version).toBe(3)
    expect(directory.operation.value).toEqual({
      kind: 'SUBMITTING',
      action: 'UPDATE',
    })
    finish(membership({ version: 4 }))
    await request
    expect(directory.items.value[0]?.version).toBe(4)
  })

  it('refreshes the winner after VERSION_CONFLICT and never replays a mutation', async () => {
    vi.mocked(api.list).mockResolvedValue({
      items: [membership()],
      nextCursor: null,
    })
    vi.mocked(api.update).mockRejectedValue(
      new ApiError(409, 'unsafe', undefined, 'request-1', 'VERSION_CONFLICT'),
    )
    vi.mocked(api.get).mockResolvedValue(membership({ version: 4 }))
    const directory = useProjectMemberships(api)
    await directory.load(projectId)

    await directory.update(
      projectId,
      membership(),
      [role().id],
      'Изменение роли подтверждено',
    )

    expect(api.update).toHaveBeenCalledOnce()
    expect(api.get).toHaveBeenCalledWith(projectId, membershipId)
    expect(directory.items.value[0]?.version).toBe(4)
    expect(directory.operation.value).toEqual({ kind: 'VERSION_CONFLICT' })
  })

  it.each([
    ['LAST_PROJECT_OWNER', 'LAST_PROJECT_OWNER'],
    ['PROJECT_MEMBERSHIP_NOT_FOUND', 'NOT_FOUND'],
    ['PERMISSION_DENIED', 'PERMISSION_DENIED'],
  ] as const)(
    'maps %s to a bounded typed operation without changing the row',
    async (code, kind) => {
      vi.mocked(api.list).mockResolvedValue({
        items: [membership()],
        nextCursor: null,
      })
      vi.mocked(api.remove).mockRejectedValue(
        new ApiError(409, 'unsafe backend text', undefined, 'request-2', code),
      )
      const directory = useProjectMemberships(api)
      await directory.load(projectId)

      await directory.remove(
        projectId,
        membership(),
        'Доступ отозван владельцем',
      )

      expect(directory.operation.value).toEqual({ kind })
      expect(directory.items.value).toEqual([membership()])
    },
  )

  it.each([
    [428, undefined],
    [401, 'REAUTHENTICATION_REQUIRED'],
    [401, 'MFA_REQUIRED'],
  ] as const)(
    'requires an explicit step-up for HTTP %s / %s and never replays the membership mutation',
    async (status, code) => {
      vi.mocked(api.list).mockResolvedValue({
        items: [membership()],
        nextCursor: null,
      })
      vi.mocked(api.update).mockRejectedValue(
        new ApiError(status, 'unsafe backend text', undefined, 'step-up-request', code),
      )
      const directory = useProjectMemberships(api)
      await directory.load(projectId)

      await directory.update(
        projectId,
        membership(),
        [role().id],
        'Изменение роли подтверждено',
      )

      expect(api.update).toHaveBeenCalledOnce()
      expect(directory.items.value).toEqual([membership()])
      expect(directory.operation.value).toEqual({ kind: 'STEP_UP_REQUIRED' })
    },
  )
})

describe('Project Membership permission gates', () => {
  it('accepts only the explicit Platform-or-selected-Project Permissions', () => {
    expect(canReadProjectMemberships(['platform.memberships.read'], [])).toBe(
      true,
    )
    expect(canReadProjectMemberships([], ['project.members.read'])).toBe(true)
    expect(
      canReadProjectMemberships(
        ['platform.projects.read'],
        ['project.roles.read'],
      ),
    ).toBe(false)
    expect(
      canManageProjectMemberships(['platform.memberships.manage'], []),
    ).toBe(true)
    expect(canManageProjectMemberships([], ['project.members.manage'])).toBe(
      true,
    )
    expect(
      canManageProjectMemberships(
        ['platform.memberships.read'],
        ['project.members.read'],
      ),
    ).toBe(false)
    expect(canAttachExistingCmsUser(['platform.memberships.manage'])).toBe(true)
    expect(canAttachExistingCmsUser(['platform.memberships.read'])).toBe(false)
  })
})
