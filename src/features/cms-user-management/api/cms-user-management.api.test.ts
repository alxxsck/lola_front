import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cmsUserLifecycleDeactivate,
  cmsUserLifecycleGet,
  cmsUserLifecycleList,
  cmsUserLifecycleReactivate,
  cmsUserLifecycleResetCredentials,
  cmsUserLifecycleSuspend,
  cmsUserLifecycleUpdate,
} from '@/shared/api/generated/lola-backend'
import { cmsUserManagementApi } from './cms-user-management.api'

vi.mock('@/shared/api/generated/lola-backend', () => ({
  cmsUserLifecycleDeactivate: vi.fn(),
  cmsUserLifecycleGet: vi.fn(),
  cmsUserLifecycleList: vi.fn(),
  cmsUserLifecycleReactivate: vi.fn(),
  cmsUserLifecycleResetCredentials: vi.fn(),
  cmsUserLifecycleSuspend: vi.fn(),
  cmsUserLifecycleUpdate: vi.fn(),
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
})
