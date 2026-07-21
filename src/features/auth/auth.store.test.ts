import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authApi } from './auth.api'
import { useAuthStore } from './auth.store'
import { ApiError } from '@/shared/api/http/api-error'

vi.mock('./auth.api', () => ({
  authApi: {
    mode: 'api',
    login: vi.fn(),
    restore: vi.fn(),
    logout: vi.fn(),
    logoutAll: vi.fn(),
    completePasswordSetup: vi.fn(),
    refreshContext: vi.fn(),
  },
}))

describe('CMS User authentication state', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps Initial Access in memory-only password setup state without authenticating', async () => {
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem')
    vi.mocked(authApi.login).mockResolvedValue({
      kind: 'PASSWORD_SETUP_REQUIRED',
      setupToken: 'lps_setup-secret',
      expiresAt: '2026-07-21T10:10:00.000Z',
    })
    const auth = useAuthStore()

    await expect(auth.login('operator@example.com', 'lia_initial-secret')).resolves.toBe('PASSWORD_SETUP_REQUIRED')

    expect(auth.phase).toBe('SETUP_REQUIRED')
    expect(auth.setupToken).toBe('lps_setup-secret')
    expect(auth.isAuthenticated).toBe(false)
    expect(auth.user).toBeNull()
    expect(auth.project).toBeNull()
    expect(sessionStorage.getItem('lola-cms-auth-v1')).toBeNull()
    expect(JSON.stringify(storageWrite.mock.calls)).not.toContain('lps_setup-secret')
    expect(JSON.stringify(storageWrite.mock.calls)).not.toContain('lia_initial-secret')
  })

  it('authenticates a Platform Operator without requiring a Project Membership', async () => {
    vi.mocked(authApi.login).mockResolvedValue({
      kind: 'AUTHENTICATED',
      context: {
        user: { id: 'operator-1', email: 'operator@example.com', name: 'Olga', role: 'VIEWER' },
        projects: [],
      },
    })
    const auth = useAuthStore()

    await expect(auth.login('operator@example.com', 'permanent passphrase')).resolves.toBe('AUTHENTICATED')

    expect(auth.phase).toBe('AUTHENTICATED')
    expect(auth.isAuthenticated).toBe(true)
    expect(auth.user?.id).toBe('operator-1')
    expect(auth.projects).toEqual([])
    expect(auth.project).toBeNull()
    expect(auth.requiresProjectSelection).toBe(false)
  })

  it('clears the setup capability and requires an ordinary login after password setup', async () => {
    vi.mocked(authApi.login).mockResolvedValue({
      kind: 'PASSWORD_SETUP_REQUIRED',
      setupToken: 'lps_setup-secret',
      expiresAt: '2026-07-21T10:10:00.000Z',
    })
    vi.mocked(authApi.completePasswordSetup).mockResolvedValue({
      kind: 'PASSWORD_ESTABLISHED',
      status: 'ACTIVE',
      nextAction: 'LOGIN',
    })
    const auth = useAuthStore()
    await auth.login('operator@example.com', 'lia_initial-secret')

    await expect(auth.completePasswordSetup('a long permanent passphrase', 'a long permanent passphrase'))
      .resolves.toBe('PASSWORD_ESTABLISHED')

    expect(authApi.completePasswordSetup).toHaveBeenCalledWith(
      'lps_setup-secret',
      'a long permanent passphrase',
      'a long permanent passphrase',
    )
    expect(auth.phase).toBe('ANONYMOUS_WITH_SETUP_SUCCESS')
    expect(auth.setupToken).toBeNull()
    expect(auth.isAuthenticated).toBe(false)
  })

  it('restores an ordinary projectless CMS session as authenticated', async () => {
    vi.mocked(authApi.restore).mockResolvedValue({
      user: { id: 'operator-1', email: 'operator@example.com', name: 'Olga', role: 'VIEWER' },
      projects: [],
    })
    const auth = useAuthStore()

    await auth.restore()

    expect(auth.phase).toBe('AUTHENTICATED')
    expect(auth.isAuthenticated).toBe(true)
    expect(auth.project).toBeNull()
  })

  it('refreshes selected Project authority after a self-affecting membership mutation', async () => {
    const auth = useAuthStore()
    auth.$patch({
      phase: 'AUTHENTICATED',
      user: { id: 'operator-1', email: 'operator@example.com', name: 'Olga' },
      projects: [
        {
          id: 'project-1',
          name: 'Project One',
          slug: 'project-one',
          status: 'ACTIVE',
          publicKey: 'public',
          defaultLocale: 'ru',
          supportedLocales: ['ru'],
          assistantName: 'Lola',
          systemPrompt: '',
          voiceInstructions: '',
          settings: {},
          effectivePermissionCodes: ['project.members.manage'],
        },
      ],
      project: {
        id: 'project-1',
        name: 'Project One',
        slug: 'project-one',
        status: 'ACTIVE',
        publicKey: 'public',
        defaultLocale: 'ru',
        supportedLocales: ['ru'],
        assistantName: 'Lola',
        systemPrompt: '',
        voiceInstructions: '',
        settings: {},
        effectivePermissionCodes: ['project.members.manage'],
      },
    })
    vi.mocked(authApi.refreshContext).mockResolvedValue({
      user: { id: 'operator-1', email: 'operator@example.com', name: 'Olga' },
      projects: [],
    })

    await auth.refreshContext()

    expect(authApi.refreshContext).toHaveBeenCalledOnce()
    expect(auth.project).toBeNull()
    expect(auth.projects).toEqual([])
  })

  it('fails closed when refreshed self authority cannot be established', async () => {
    const auth = useAuthStore()
    auth.$patch({
      phase: 'AUTHENTICATED',
      user: { id: 'operator-1', email: 'operator@example.com', name: 'Olga' },
    })
    vi.mocked(authApi.refreshContext).mockRejectedValue(new Error('context unavailable'))

    await expect(auth.refreshContext()).rejects.toThrow('context unavailable')

    expect(auth.phase).toBe('ANONYMOUS')
    expect(auth.user).toBeNull()
    expect(auth.project).toBeNull()
  })

  it('keeps the setup capability active after a retryable password policy rejection', async () => {
    vi.mocked(authApi.login).mockResolvedValue({
      kind: 'PASSWORD_SETUP_REQUIRED',
      setupToken: 'lps_retryable',
      expiresAt: '2026-07-21T10:10:00.000Z',
    })
    vi.mocked(authApi.completePasswordSetup).mockRejectedValue(new Error('Этот пароль нельзя использовать'))
    const auth = useAuthStore()
    await auth.login('operator@example.com', 'lia_initial-secret')

    await expect(auth.completePasswordSetup('password', 'password')).rejects.toThrow('Этот пароль нельзя использовать')

    expect(auth.phase).toBe('SETUP_REQUIRED')
    expect(auth.setupToken).toBe('lps_retryable')
    expect(auth.isAuthenticated).toBe(false)
  })

  it('forgets an invalid setup capability and requires Initial Access again', async () => {
    vi.mocked(authApi.login).mockResolvedValue({
      kind: 'PASSWORD_SETUP_REQUIRED',
      setupToken: 'lps_expired',
      expiresAt: '2026-07-21T10:10:00.000Z',
    })
    vi.mocked(authApi.completePasswordSetup).mockRejectedValue(new ApiError(
      401,
      'Сессия установки пароля недоступна',
      undefined,
      undefined,
      'PASSWORD_SETUP_TOKEN_INVALID',
    ))
    const auth = useAuthStore()
    await auth.login('operator@example.com', 'lia_initial-secret')

    await expect(auth.completePasswordSetup('a long permanent passphrase', 'a long permanent passphrase'))
      .rejects.toMatchObject({ code: 'PASSWORD_SETUP_TOKEN_INVALID' })

    expect(auth.phase).toBe('ANONYMOUS')
    expect(auth.setupToken).toBeNull()
  })

  it('forgets the setup capability when the user cancels', async () => {
    vi.mocked(authApi.login).mockResolvedValue({
      kind: 'PASSWORD_SETUP_REQUIRED',
      setupToken: 'lps_cancelled',
      expiresAt: '2026-07-21T10:10:00.000Z',
    })
    const auth = useAuthStore()
    await auth.login('operator@example.com', 'lia_initial-secret')

    auth.cancelPasswordSetup()

    expect(auth.phase).toBe('ANONYMOUS')
    expect(auth.setupToken).toBeNull()
  })

  it('does not resurrect setup state when a cancelled request fails later', async () => {
    vi.mocked(authApi.login).mockResolvedValue({
      kind: 'PASSWORD_SETUP_REQUIRED',
      setupToken: 'lps_in_flight',
      expiresAt: '2026-07-21T10:10:00.000Z',
    })
    let rejectSetup!: (cause: Error) => void
    vi.mocked(authApi.completePasswordSetup).mockReturnValue(new Promise((_, reject) => {
      rejectSetup = reject
    }))
    const auth = useAuthStore()
    await auth.login('operator@example.com', 'lia_initial-secret')
    const request = auth.completePasswordSetup('a long permanent passphrase', 'a long permanent passphrase')

    auth.cancelPasswordSetup()
    rejectSetup(new Error('request failed'))
    await expect(request).rejects.toThrow('request failed')

    expect(auth.phase).toBe('ANONYMOUS')
    expect(auth.setupToken).toBeNull()
  })

  it('returns to a consistent anonymous state after logout', async () => {
    vi.mocked(authApi.login).mockResolvedValue({
      kind: 'AUTHENTICATED',
      context: {
        user: { id: 'operator-1', email: 'operator@example.com', name: 'Olga', role: 'VIEWER' },
        projects: [],
      },
    })
    vi.mocked(authApi.logout).mockResolvedValue()
    const auth = useAuthStore()
    await auth.login('operator@example.com', 'a long permanent passphrase')

    await auth.logout()

    expect(auth.phase).toBe('ANONYMOUS')
    expect(auth.isAuthenticated).toBe(false)
    expect(auth.user).toBeNull()
  })
})
