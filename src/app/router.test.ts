import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authApi } from '@/features/auth/auth.api'
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

  it('allows every authenticated CMS User to open personal security settings', async () => {
    const auth = useAuthStore()
    auth.$patch({
      restored: true,
      phase: 'AUTHENTICATED',
      user: { id: 'operator-1', email: 'operator@example.com', name: 'Operator' },
    })

    await router.push('/settings/security')

    expect(router.currentRoute.value.name).toBe('security-settings')
  })

  it('removes an email capability fragment and skips session restoration before rendering', async () => {
    const auth = useAuthStore()
    auth.$patch({ restored: false, phase: 'ANONYMOUS' })
    vi.mocked(authApi.restore).mockClear()
    const capability = 'lev_00000000-0000-4000-8000-000000000001.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

    await router.push(`/auth/email-verification#token=${capability}`)

    expect(router.currentRoute.value.name).toBe('email-verification')
    expect(router.currentRoute.value.hash).toBe('')
    expect(window.location.href).not.toContain(capability)
    expect(authApi.restore).not.toHaveBeenCalled()
  })

  it('sanitizes a password-reset fragment before rendering and keeps both recovery GET routes inert', async () => {
    vi.mocked(authApi.restore).mockClear()
    const capability = 'lpr_00000000-0000-4000-8000-000000000001.DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD'

    await router.push(`/auth/password-reset#token=${capability}`)

    expect(router.currentRoute.value.name).toBe('password-reset')
    expect(router.currentRoute.value.hash).toBe('')
    expect(window.location.href).not.toContain(capability)
    expect(authApi.restore).not.toHaveBeenCalled()

    await router.push('/forgot-password')
    expect(router.currentRoute.value.name).toBe('forgot-password')
    expect(authApi.restore).not.toHaveBeenCalled()
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
