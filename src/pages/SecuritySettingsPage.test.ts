import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/features/auth/auth.store'
import { securitySettingsApi } from '@/features/security-settings/security-settings.api'
import { emailIdentityApi } from '@/features/email-identity/email-identity.api'
import SecuritySettingsPage from './SecuritySettingsPage.vue'
import { mfaManagementApi } from '@/features/auth/mfa.api'

vi.mock('@/features/security-settings/security-settings.api', () => ({
  securitySettingsApi: {
    listSessions: vi.fn(),
    revokeSession: vi.fn(),
    revokeOtherSessions: vi.fn(),
    changePassword: vi.fn(),
  },
}))

vi.mock('@/features/email-identity/email-identity.api', () => ({
  emailIdentityApi: {
    requestVerification: vi.fn(),
    requestEmailChange: vi.fn(),
    cancelEmailChange: vi.fn(),
  },
}))

vi.mock('@/features/auth/mfa.api', () => ({
  mfaManagementApi: {
    summary: vi.fn(),
    addPasskey: vi.fn(),
    removePasskey: vi.fn(),
    rotateRecoveryCodes: vi.fn(),
  },
}))

const sessions = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    current: true,
    device: 'Chrome',
    createdAt: '2026-07-21T10:00:00.000Z',
    lastSeenAt: '2026-07-21T10:05:00.000Z',
    expiresAt: '2026-07-22T10:00:00.000Z',
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    current: false,
    device: 'Firefox',
    createdAt: '2026-07-21T09:00:00.000Z',
    lastSeenAt: '2026-07-21T09:05:00.000Z',
    expiresAt: '2026-07-22T09:00:00.000Z',
  },
]

const InputTextStub = {
  inheritAttrs: false,
  props: ['modelValue', 'type'],
  emits: ['update:modelValue'],
  template: '<input v-bind="$attrs" :type="type" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)">',
}

async function mountPage(identity: {
  email?: string
  emailVerifiedAt?: string | null
  pendingEmail?: string | null
  emailVerificationRetryAfterSeconds?: number
} = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().$patch({
    restored: true,
    phase: 'AUTHENTICATED',
    user: {
      id: 'operator-1',
      email: identity.email ?? 'operator@example.com',
      name: 'Ольга Оператор',
      emailVerifiedAt: identity.emailVerifiedAt ?? null,
      pendingEmail: identity.pendingEmail ?? null,
      emailVerificationRetryAfterSeconds: identity.emailVerificationRetryAfterSeconds ?? 0,
    },
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/settings/security', component: SecuritySettingsPage },
      { path: '/login', component: { template: '<div>Login</div>' } },
    ],
  })
  await router.push('/settings/security')
  await router.isReady()
  const wrapper = mount(SecuritySettingsPage, {
    global: {
      plugins: [pinia, router],
      stubs: {
        InputText: InputTextStub,
        Button: {
          props: ['label', 'disabled', 'loading', 'ariaLabel'],
          emits: ['click'],
          template: '<button type="button" :disabled="disabled || loading" :aria-label="ariaLabel" @click="$emit(\'click\')">{{ label }}</button>',
        },
        Message: { template: '<div><slot /></div>' },
      },
    },
  })
  await flushPromises()
  return wrapper
}

describe('SecuritySettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(securitySettingsApi.listSessions).mockResolvedValue(structuredClone(sessions))
    vi.mocked(securitySettingsApi.revokeSession).mockResolvedValue({ success: true })
    vi.mocked(securitySettingsApi.revokeOtherSessions).mockResolvedValue({ success: true })
    vi.mocked(securitySettingsApi.changePassword).mockResolvedValue()
    vi.mocked(emailIdentityApi.requestVerification).mockResolvedValue({
      accepted: true,
      retryAfterSeconds: 45,
    })
    vi.mocked(emailIdentityApi.requestEmailChange).mockResolvedValue({
      accepted: true,
      pendingEmail: 'new@example.com',
      retryAfterSeconds: 60,
    })
    vi.mocked(emailIdentityApi.cancelEmailChange).mockResolvedValue({ success: true })
    vi.mocked(mfaManagementApi.summary).mockResolvedValue({
      passkeys: [{
        id: 'passkey-1',
        label: 'Рабочий MacBook',
        deviceType: 'multiDevice',
        backupEligible: true,
        backedUp: true,
        createdAt: '2026-07-21T08:00:00.000Z',
        lastUsedAt: '2026-07-21T10:00:00.000Z',
      }],
      recoveryCodesRemaining: 8,
    })
    vi.mocked(mfaManagementApi.addPasskey).mockResolvedValue({
      kind: 'MFA_ENROLLED', passkeyId: 'passkey-2', recoveryCodes: [],
    })
    vi.mocked(mfaManagementApi.removePasskey).mockResolvedValue({ removed: true })
    vi.mocked(mfaManagementApi.rotateRecoveryCodes).mockResolvedValue({
      recoveryCodes: ['lrc_one', 'lrc_two'],
    })
  })

  it('lists safe session metadata and revokes the selected stable family id', async () => {
    const wrapper = await mountPage()

    expect(wrapper.text()).toContain('Chrome')
    expect(wrapper.text()).toContain('Firefox')
    await wrapper.get(`[data-session-id="${sessions[1]!.id}"] button`).trigger('click')
    await flushPromises()

    expect(securitySettingsApi.revokeSession).toHaveBeenCalledWith(sessions[1]!.id)
    expect(wrapper.text()).not.toContain('Firefox')
    expect(wrapper.text()).toContain('Сессия завершена.')
  })

  it('validates confirmation locally and submits all password proof fields', async () => {
    const wrapper = await mountPage()
    const passwordForm = wrapper.get('.password-form')
    const inputs = passwordForm.findAll('input')
    await inputs[0]!.setValue('old password')
    await inputs[1]!.setValue('new secure passphrase')
    await inputs[2]!.setValue('different passphrase')
    await passwordForm.trigger('submit')

    expect(wrapper.text()).toContain('Новый пароль и подтверждение не совпадают.')
    expect(securitySettingsApi.changePassword).not.toHaveBeenCalled()

    await inputs[2]!.setValue('new secure passphrase')
    await passwordForm.trigger('submit')
    await flushPromises()

    expect(securitySettingsApi.changePassword).toHaveBeenCalledWith({
      currentPassword: 'old password',
      newPassword: 'new secure passphrase',
      passwordConfirmation: 'new secure passphrase',
    })
    expect(wrapper.text()).toContain('Пароль изменён. Остальные сессии завершены.')
  })

  it('shows the canonical email, verification badge and server resend countdown', async () => {
    const wrapper = await mountPage({ emailVerificationRetryAfterSeconds: 37 })

    expect(wrapper.text()).toContain('Ольга Оператор')
    expect(wrapper.text()).toContain('operator@example.com')
    expect(wrapper.text()).toContain('Не подтверждён')
    const resend = wrapper.get('[data-testid="email-verification-action"]')
    expect(resend.text()).toContain('Повторить через 37 с')
    expect(resend.attributes('disabled')).toBeDefined()
  })

  it('requests verification and applies the server-provided cooldown', async () => {
    const wrapper = await mountPage()

    await wrapper.get('[data-testid="email-verification-action"]').trigger('click')
    await flushPromises()

    expect(emailIdentityApi.requestVerification).toHaveBeenCalledOnce()
    expect(wrapper.get('[data-testid="email-verification-action"]').text()).toContain('Повторить через 45 с')
    expect(wrapper.text()).toContain('Письмо для подтверждения отправлено.')
  })

  it('starts, cancels and allows restarting a password-proved email change', async () => {
    const wrapper = await mountPage()
    const changeForm = wrapper.get('.email-change-form')
    const inputs = changeForm.findAll('input')
    await inputs[0]!.setValue('new@example.com')
    await inputs[1]!.setValue('current password')

    await changeForm.trigger('submit')
    await flushPromises()

    expect(emailIdentityApi.requestEmailChange).toHaveBeenCalledWith({
      newEmail: 'new@example.com',
      currentPassword: 'current password',
    })
    expect(wrapper.text()).toContain('Ожидает подтверждения: new@example.com')

    await wrapper.get('[data-testid="cancel-email-change"]').trigger('click')
    await flushPromises()

    expect(emailIdentityApi.cancelEmailChange).toHaveBeenCalledOnce()
    expect(wrapper.text()).not.toContain('Ожидает подтверждения: new@example.com')
    expect(wrapper.find('.email-change-form').exists()).toBe(true)
  })

  it('keeps a pending address canonical-safe and reveals restart only on demand', async () => {
    const wrapper = await mountPage({ pendingEmail: 'pending@example.com' })

    expect(wrapper.text()).toContain('Ожидает подтверждения: pending@example.com')
    expect(wrapper.find('.email-change-form').exists()).toBe(false)
    await wrapper.get('[data-testid="restart-email-change"]').trigger('click')

    expect(wrapper.find('.email-change-form').exists()).toBe(true)
  })

  it('lists passkeys and shows rotated recovery codes only in memory until acknowledged', async () => {
    const wrapper = await mountPage()

    expect(wrapper.text()).toContain('Рабочий MacBook')
    expect(wrapper.text()).toContain('Осталось recovery-кодов: 8')
    await wrapper.get('.recovery-summary button').trigger('click')
    await flushPromises()

    expect(mfaManagementApi.rotateRecoveryCodes).toHaveBeenCalledOnce()
    expect(wrapper.get('[data-testid="rotated-recovery-codes"]').text()).toContain('lrc_one')
    expect(wrapper.get('[data-testid="rotated-recovery-codes"] button').attributes('disabled')).toBeDefined()
    expect(JSON.stringify(Object.values(localStorage))).not.toContain('lrc_one')
    expect(JSON.stringify(Object.values(sessionStorage))).not.toContain('lrc_one')
  })

  it('keeps the last-factor backend policy visible instead of hiding the failure', async () => {
    vi.mocked(mfaManagementApi.removePasskey).mockRejectedValue({
      status: 409,
      code: 'LAST_MFA_FACTOR_REQUIRED',
      message: 'last factor',
    })
    const wrapper = await mountPage()

    await wrapper.get('[data-passkey-id="passkey-1"] button').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Нельзя удалить последний passkey.')
  })
})
