import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/features/auth/auth.store'
import { router } from './router'

vi.mock('@/features/auth/auth.api', () => ({
  authApi: {
    mode: 'api',
    login: vi.fn(),
    restore: vi.fn().mockResolvedValue(null),
    logout: vi.fn(),
    logoutAll: vi.fn(),
    completePasswordSetup: vi.fn(),
  },
}))

describe('authentication routes', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    await router.replace('/login')
  })

  it('allows the memory-bound setup state to enter the dedicated route', async () => {
    const auth = useAuthStore()
    auth.$patch({ phase: 'SETUP_REQUIRED', setupToken: 'lps_setup-secret' })

    await router.push('/password/setup')

    expect(router.currentRoute.value.name).toBe('password-setup')
  })

  it('returns a reload or direct setup URL to login when the memory capability is absent', async () => {
    await router.push('/password/setup')

    expect(router.currentRoute.value.name).toBe('login')
  })

  it('allows the CMS User control plane only with the exact read Permission', async () => {
    const auth = useAuthStore()
    auth.$patch({
      restored: true,
      phase: 'AUTHENTICATED',
      user: {
        id: 'operator-1',
        email: 'operator@example.com',
        name: 'Operator',
        platformPermissionCodes: ['platform.cms_users.read'],
      },
    })

    await router.push('/platform/cms-users')
    expect(router.currentRoute.value.name).toBe('platform-cms-users')

    auth.user!.platformPermissionCodes = []
    await router.push('/platform/cms-users/user-1')
    expect(router.currentRoute.value.name).toBe('overview')
  })
})
