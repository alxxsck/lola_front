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
    refreshContext: vi.fn(),
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

  it('allows Project Memberships only through the exact Platform-or-selected-Project read Permission', async () => {
    const auth = useAuthStore()
    const project = {
      id: 'project-1',
      name: 'Project One',
      slug: 'project-one',
      status: 'ACTIVE' as const,
      publicKey: 'public',
      defaultLocale: 'ru',
      supportedLocales: ['ru'],
      assistantName: 'Lola',
      systemPrompt: '',
      voiceInstructions: '',
      settings: {},
      effectivePermissionCodes: ['project.members.read'],
    }
    auth.$patch({
      restored: true,
      phase: 'AUTHENTICATED',
      user: {
        id: 'operator-1',
        email: 'operator@example.com',
        name: 'Operator',
      },
      project,
      projects: [project],
    })

    await router.push('/project/memberships')
    expect(router.currentRoute.value.name).toBe('project-memberships')

    auth.project!.effectivePermissionCodes = ['project.roles.read']
    auth.user!.platformPermissionCodes = ['platform.memberships.read']
    await router.push('/overview')
    await router.push('/project/memberships')
    expect(router.currentRoute.value.name).toBe('project-memberships')

    auth.user!.platformPermissionCodes = ['platform.projects.read']
    await router.push('/overview')
    await router.push('/project/memberships')
    expect(router.currentRoute.value.name).toBe('overview')
  })

  it('allows Project Roles only through the exact Platform-or-selected-Project role read Permission', async () => {
    const auth = useAuthStore()
    const project = {
      id: 'project-1',
      name: 'Project One',
      slug: 'project-one',
      status: 'ACTIVE' as const,
      publicKey: 'public',
      defaultLocale: 'ru',
      supportedLocales: ['ru'],
      assistantName: 'Lola',
      systemPrompt: '',
      voiceInstructions: '',
      settings: {},
      effectivePermissionCodes: ['project.roles.read'],
    }
    auth.$patch({
      restored: true,
      phase: 'AUTHENTICATED',
      user: { id: 'operator-1', email: 'operator@example.com', name: 'Operator' },
      project,
      projects: [project],
    })

    await router.push('/project/roles')
    expect(router.currentRoute.value.name).toBe('project-roles')

    auth.project!.effectivePermissionCodes = ['project.members.read']
    auth.user!.platformPermissionCodes = ['platform.roles.read']
    await router.push('/overview')
    await router.push('/project/roles')
    expect(router.currentRoute.value.name).toBe('project-roles')

    auth.user!.platformPermissionCodes = ['platform.projects.read']
    await router.push('/overview')
    await router.push('/project/roles')
    expect(router.currentRoute.value.name).toBe('overview')
  })
})
