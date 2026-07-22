import { beforeEach, describe, expect, it, vi } from 'vitest'
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
import { cmsUserManagementApi } from './cms-user-management.api'

vi.mock('@/shared/api/generated/lola-backend', () => ({
  cmsUserProvisioningProvision: vi.fn(),
  cmsUserLifecycleDeactivate: vi.fn(),
  cmsUserLifecycleGet: vi.fn(),
  cmsUserLifecycleList: vi.fn(),
  cmsUserLifecycleReactivate: vi.fn(),
  cmsUserLifecycleResetCredentials: vi.fn(),
  cmsUserLifecycleSuspend: vi.fn(),
  cmsUserLifecycleUpdate: vi.fn(),
  platformListProjects: vi.fn(),
  platformRoleAssignmentGet: vi.fn(),
  platformRoleAssignmentReplace: vi.fn(),
  platformRoleList: vi.fn(),
  platformCmsUserSessionList: vi.fn(),
  platformCmsUserSessionRevoke: vi.fn(),
  projectRoleList: vi.fn(),
}))

describe('CMS User management API', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uses bounded cursor pagination and the server status filter', async () => {
    vi.mocked(cmsUserLifecycleList).mockResolvedValue({ items: [], nextCursor: null })

    await cmsUserManagementApi.list({ limit: 50, cursor: 'next', status: 'SUSPENDED' })

    expect(cmsUserLifecycleList).toHaveBeenCalledWith({
      limit: 50,
      cursor: 'next',
      status: 'SUSPENDED',
    })
  })

  it('passes the optimistic version and normalized reason to lifecycle commands', async () => {
    vi.mocked(cmsUserLifecycleSuspend).mockResolvedValue({} as never)
    vi.mocked(cmsUserLifecycleDeactivate).mockResolvedValue({} as never)
    vi.mocked(cmsUserLifecycleReactivate).mockResolvedValue({} as never)
    vi.mocked(cmsUserLifecycleResetCredentials).mockResolvedValue({} as never)

    for (const action of ['SUSPEND', 'DEACTIVATE', 'REACTIVATE', 'RESET_CREDENTIALS'] as const) {
      await cmsUserManagementApi.mutate('user-1', action, 7, '  Проверено службой безопасности  ')
    }

    const body = { version: 7, reason: 'Проверено службой безопасности' }
    expect(cmsUserLifecycleSuspend).toHaveBeenCalledWith('user-1', body)
    expect(cmsUserLifecycleDeactivate).toHaveBeenCalledWith('user-1', body)
    expect(cmsUserLifecycleReactivate).toHaveBeenCalledWith('user-1', body)
    expect(cmsUserLifecycleResetCredentials).toHaveBeenCalledWith('user-1', body)
  })

  it('keeps detail and safe profile update on generated contracts', async () => {
    vi.mocked(cmsUserLifecycleGet).mockResolvedValue({} as never)
    vi.mocked(cmsUserLifecycleUpdate).mockResolvedValue({} as never)

    await cmsUserManagementApi.get('user-1')
    await cmsUserManagementApi.update('user-1', {
      givenName: 'Анна',
      familyName: 'Орлова',
      version: 3,
    })

    expect(cmsUserLifecycleGet).toHaveBeenCalledWith('user-1')
    expect(cmsUserLifecycleUpdate).toHaveBeenCalledWith('user-1', {
      givenName: 'Анна',
      familyName: 'Орлова',
      version: 3,
    })
  })

  it('provisions once with a stable caller-owned idempotency key', async () => {
    vi.mocked(cmsUserProvisioningProvision).mockResolvedValue({} as never)
    await cmsUserManagementApi.provision(
      {
        email: '  ANNA@Example.COM ',
        givenName: '  Анна ',
        familyName: ' Орлова  ',
        deliveryMode: 'RETURN_ONCE',
        projectAssignments: [{ projectId: 'project-1', roleIds: ['role-1'] }],
      },
      'provision-attempt-1',
    )

    expect(cmsUserProvisioningProvision).toHaveBeenCalledWith(
      {
        email: 'ANNA@Example.COM',
        givenName: 'Анна',
        familyName: 'Орлова',
        deliveryMode: 'RETURN_ONCE',
        projectAssignments: [{ projectId: 'project-1', roleIds: ['role-1'] }],
      },
      { headers: { 'Idempotency-Key': 'provision-attempt-1' } },
    )
  })

  it('loads the platform project and exact assignable role catalogs', async () => {
    vi.mocked(platformListProjects).mockResolvedValue([] as never)
    vi.mocked(projectRoleList).mockResolvedValue({ items: [] })

    await cmsUserManagementApi.projects()
    await cmsUserManagementApi.roles('project-1')

    expect(platformListProjects).toHaveBeenCalledWith()
    expect(projectRoleList).toHaveBeenCalledWith('project-1')
  })

  it('loads and replaces a CMS User platform-role assignment through generated operations', async () => {
    vi.mocked(platformRoleList).mockResolvedValue({ items: [] })
    vi.mocked(platformRoleAssignmentGet).mockResolvedValue({} as never)
    vi.mocked(platformRoleAssignmentReplace).mockResolvedValue({} as never)

    await cmsUserManagementApi.platformRoles()
    await cmsUserManagementApi.platformRoleAssignment('user-1')
    await cmsUserManagementApi.replacePlatformRoles(
      'user-1',
      4,
      ['role-2', 'role-1'],
      '  Одобрено службой безопасности  ',
    )

    expect(platformRoleList).toHaveBeenCalledWith()
    expect(platformRoleAssignmentGet).toHaveBeenCalledWith('user-1')
    expect(platformRoleAssignmentReplace).toHaveBeenCalledWith('user-1', {
      version: 4,
      roleIds: ['role-2', 'role-1'],
      reason: 'Одобрено службой безопасности',
    })
  })

  it('loads the selected CMS User sessions through the platform control plane', async () => {
    vi.mocked(platformCmsUserSessionList).mockResolvedValue({ sessions: [] })

    await cmsUserManagementApi.sessions('user-1')

    expect(platformCmsUserSessionList).toHaveBeenCalledWith('user-1')
  })

  it('revokes a CMS User session with a normalized audit reason', async () => {
    vi.mocked(platformCmsUserSessionRevoke).mockResolvedValue({ success: true })

    await cmsUserManagementApi.revokeSession(
      'user-1',
      'session-1',
      '  Подтверждено службой безопасности  ',
    )

    expect(platformCmsUserSessionRevoke).toHaveBeenCalledWith(
      'user-1',
      'session-1',
      { reason: 'Подтверждено службой безопасности' },
    )
  })
})
