import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/features/auth/auth.store'
import { securitySettingsApi } from '@/features/security-settings/security-settings.api'
import { emailIdentityApi } from '@/features/email-identity/email-identity.api'
import SecuritySettingsPage from './SecuritySettingsPage.vue'
import { mfaManagementApi } from '@/features/auth/mfa.api'
import { notificationPreferencesApi } from '@/features/notification-preferences/notification-preferences.api'

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

vi.mock('@/features/notification-preferences/notification-preferences.api', () => ({
  notificationPreferencesApi: {
    getEmailAIProposals: vi.fn(),
    setEmailAIProposals: vi.fn(),
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
    vi.mocked(notificationPreferencesApi.getEmailAIProposals).mockResolvedValue({
      topic: 'AI_PROPOSALS',
      channel: 'EMAIL',
      subscribed: false,
      effectiveStatus: 'INELIGIBLE',
      ineligibilityReason: 'EMAIL_UNVERIFIED',
      emailVersion: 0,
    })
    vi.mocked(notificationPreferencesApi.setEmailAIProposals).mockImplementation(async (subscribed) => ({
      topic: 'AI_PROPOSALS',
      channel: 'EMAIL',
      subscribed,
      effectiveStatus: subscribed ? 'SUBSCRIBED' : 'UNSUBSCRIBED',
      ineligibilityReason: null,
      emailVersion: 0,
    }))
  })

  it('keeps every settings action in a predictable responsive action area', async () => {
    const wrapper = await mountPage()

    expect(wrapper.classes()).toEqual(expect.arrayContaining(['page', 'security-page']))
    expect(wrapper.get('.security-header').classes()).toContain('page-header')
    expect(wrapper.get('h1').text()).toBe('Безопасность аккаунта')
    expect(wrapper.find('.security-header [data-testid="revoke-other-sessions"]').exists()).toBe(false)
    expect(wrapper.get('[aria-labelledby="sessions-heading"] [data-testid="revoke-other-sessions"]')).toBeDefined()
    expect(wrapper.get('.identity-summary .identity-actions [data-testid="email-verification-action"]')).toBeDefined()

    for (const selector of ['.email-change-form', '.password-form', '.passkey-add']) {
      const form = wrapper.get(selector)
      expect(form.get('.settings-form__fields')).toBeDefined()
      expect(form.get('.settings-form__actions')).toBeDefined()
    }

    const passkeyAction = wrapper.get('[data-passkey-id="passkey-1"] .item-actions button')
    const currentSessionAction = wrapper.get(`[data-session-id="${sessions[0]!.id}"] .item-actions button`)
    expect(passkeyAction.text()).toBe('Удалить')
    expect(passkeyAction.attributes('aria-label')).toBe('Удалить passkey Рабочий MacBook, номер 1')
    expect(currentSessionAction.text()).toBe('Выйти')
    expect(currentSessionAction.attributes('aria-label')).toBe('Завершить текущую сессию Chrome, номер 1')
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

    expect(wrapper.text()).toContain('Пароли не совпадают. Проверьте повтор нового пароля.')
    expect(inputs[2]!.attributes('aria-invalid')).toBe('true')
    expect(inputs[2]!.attributes('aria-describedby')).toBe('security-password-confirmation-error')
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

  it('lets each password field be revealed independently with an accessible action', async () => {
    const wrapper = await mountPage()
    const passwordForm = wrapper.get('.password-form')
    const currentPasswordInput = passwordForm.get('#security-current-password')
    const revealCurrentPassword = passwordForm.get('[aria-label="Показать текущий пароль"]')

    expect(currentPasswordInput.attributes('type')).toBe('password')
    await revealCurrentPassword.trigger('click')

    expect(currentPasswordInput.attributes('type')).toBe('text')
    expect(passwordForm.get('[aria-label="Скрыть текущий пароль"]')).toBeDefined()
    expect(passwordForm.get('[aria-label="Показать новый пароль"]')).toBeDefined()
    expect(passwordForm.get('[aria-label="Показать повтор нового пароля"]')).toBeDefined()
    expect(wrapper.get('[aria-label="Показать пароль для смены email"]')).toBeDefined()
  })

  it('associates rejected credentials with the password field that needs correction', async () => {
    vi.mocked(emailIdentityApi.requestEmailChange).mockRejectedValue({
      status: 401,
      code: 'EMAIL_CHANGE_REAUTHENTICATION_FAILED',
      message: 'invalid password',
    })
    vi.mocked(securitySettingsApi.changePassword).mockRejectedValue({
      status: 401,
      code: 'CURRENT_PASSWORD_INVALID',
      message: 'invalid password',
    })
    const wrapper = await mountPage()
    const emailForm = wrapper.get('.email-change-form')
    const emailInputs = emailForm.findAll('input')
    await emailInputs[0]!.setValue('new@example.com')
    await emailInputs[1]!.setValue('wrong password')
    await emailForm.trigger('submit')
    await flushPromises()

    expect(emailInputs[1]!.attributes('aria-invalid')).toBe('true')
    expect(emailInputs[1]!.attributes('aria-describedby')).toBe('security-email-password-error')
    expect(wrapper.get('#security-email-password-error').text()).toBe('Текущий пароль указан неверно.')

    const passwordForm = wrapper.get('.password-form')
    const passwordInputs = passwordForm.findAll('input')
    await passwordInputs[0]!.setValue('wrong password')
    await passwordInputs[1]!.setValue('new secure passphrase')
    await passwordInputs[2]!.setValue('new secure passphrase')
    await passwordForm.trigger('submit')
    await flushPromises()

    expect(passwordInputs[0]!.attributes('aria-invalid')).toBe('true')
    expect(passwordInputs[0]!.attributes('aria-describedby')).toBe('security-current-password-error')
    expect(wrapper.get('#security-current-password-error').text()).toBe('Текущий пароль указан неверно.')
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

  it('keeps AI Proposal email opt-in disabled until the current address is verified', async () => {
    const wrapper = await mountPage()

    expect(notificationPreferencesApi.getEmailAIProposals).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('Предложения Lola по email')
    expect(wrapper.text()).toContain('Сначала подтвердите текущий email')
    expect(wrapper.get('[data-testid="ai-proposal-email-toggle"]').attributes('disabled')).toBeDefined()
  })

  it('explicitly subscribes a verified CMS User without coupling consent to verification', async () => {
    vi.mocked(notificationPreferencesApi.getEmailAIProposals).mockResolvedValue({
      topic: 'AI_PROPOSALS',
      channel: 'EMAIL',
      subscribed: false,
      effectiveStatus: 'UNSUBSCRIBED',
      ineligibilityReason: null,
      emailVersion: 2,
    })
    const wrapper = await mountPage({ emailVerifiedAt: '2026-07-23T10:00:00.000Z' })

    await wrapper.get('[data-testid="ai-proposal-email-toggle"]').trigger('click')
    await flushPromises()

    expect(notificationPreferencesApi.setEmailAIProposals).toHaveBeenCalledWith(true)
    expect(wrapper.text()).toContain('Подписка включена')
  })

  it('allows explicit reconfirmation after a verified email address changes', async () => {
    vi.mocked(notificationPreferencesApi.getEmailAIProposals).mockResolvedValue({
      topic: 'AI_PROPOSALS',
      channel: 'EMAIL',
      subscribed: false,
      effectiveStatus: 'SUSPENDED',
      ineligibilityReason: 'EMAIL_CHANGED',
      emailVersion: 3,
    })
    const wrapper = await mountPage({ emailVerifiedAt: '2026-07-23T10:00:00.000Z' })

    const toggle = wrapper.get('[data-testid="ai-proposal-email-toggle"]')
    expect(toggle.attributes('disabled')).toBeUndefined()
    await toggle.trigger('click')
    await flushPromises()

    expect(notificationPreferencesApi.setEmailAIProposals).toHaveBeenCalledWith(true)
  })

  it('keeps a failed preference load non-actionable and exposes retry', async () => {
    vi.mocked(notificationPreferencesApi.getEmailAIProposals)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        topic: 'AI_PROPOSALS',
        channel: 'EMAIL',
        subscribed: false,
        effectiveStatus: 'UNSUBSCRIBED',
        ineligibilityReason: null,
        emailVersion: 2,
      })
    const wrapper = await mountPage({ emailVerifiedAt: '2026-07-23T10:00:00.000Z' })

    expect(wrapper.find('[data-testid="ai-proposal-email-toggle"]').exists()).toBe(false)
    await wrapper.get('[data-testid="ai-proposal-email-retry"]').trigger('click')
    await flushPromises()

    expect(notificationPreferencesApi.getEmailAIProposals).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-testid="ai-proposal-email-toggle"]').exists()).toBe(true)
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
