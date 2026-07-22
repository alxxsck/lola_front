import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/features/auth/auth.store'
import { authApi } from '@/features/auth/auth.api'
import MfaPage from './MfaPage.vue'

const replace = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ replace }) }))
vi.mock('@/features/auth/auth.api', () => ({
  authApi: {
    mode: 'api', login: vi.fn(), restore: vi.fn(), logout: vi.fn(), logoutAll: vi.fn(),
    completePasswordSetup: vi.fn(), refreshContext: vi.fn(), completeMfaPasskey: vi.fn(),
    completeMfaRecovery: vi.fn(),
    cancelMfa: vi.fn(),
  },
}))

describe('MFA page', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('does not allow recovery codes to be dismissed before explicit confirmation', async () => {
    const auth = useAuthStore()
    auth.$patch({ phase: 'MFA_RECOVERY_CODES', recoveryCodes: ['lrc_one', 'lrc_two'] })
    const wrapper = shallowMount(MfaPage)

    expect(wrapper.get('[data-testid="mfa-recovery-codes"]').text()).toContain('lrc_one')
    expect(wrapper.get('button-stub[label="Вернуться ко входу"]').attributes('disabled')).toBeDefined()
    expect(JSON.stringify(Object.values(localStorage))).not.toContain('lrc_one')
    expect(JSON.stringify(Object.values(sessionStorage))).not.toContain('lrc_one')
  })

  it('opens the platform workspace after a projectless operator completes MFA', async () => {
    vi.mocked(authApi.completeMfaPasskey).mockResolvedValue({
      kind: 'AUTHENTICATED',
      context: {
        user: {
          id: 'operator-1',
          email: 'operator@example.com',
          name: 'Operator',
          platformPermissionCodes: ['platform.cms_users.read'],
        },
        projects: [],
      },
    })
    const auth = useAuthStore()
    auth.$patch({
      phase: 'MFA_REQUIRED',
      mfaChallenge: {
        kind: 'MFA_REQUIRED',
        ceremonyToken: 'lmf_memory-only',
        expiresAt: '2026-07-21T21:10:00.000Z',
        publicKey: { challenge: 'challenge' },
        recoveryAvailable: false,
      },
    })
    const wrapper = shallowMount(MfaPage)

    await wrapper.get('[data-testid="mfa-passkey-action"]').trigger('click')
    await flushPromises()

    expect(replace).toHaveBeenCalledWith('/platform/cms-users')
  })
})
