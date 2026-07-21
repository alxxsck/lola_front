import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  captureEmailActionCapability,
  clearEmailActionCapability,
  hasEmailActionCapability,
} from '@/features/email-identity/email-action-capability'
import { passwordRecoveryApi } from '@/features/password-recovery/password-recovery.api'
import { useAuthStore } from '@/features/auth/auth.store'
import { ApiError } from '@/shared/api/http/api-error'
import PasswordResetPage from './PasswordResetPage.vue'

vi.mock('@/features/password-recovery/password-recovery.api', () => ({
  passwordRecoveryApi: { complete: vi.fn() },
}))

const InputTextStub = {
  inheritAttrs: false,
  props: ['id', 'modelValue', 'type', 'autocomplete'],
  emits: ['update:modelValue'],
  template: '<input v-bind="$attrs" :id="id" :type="type" :autocomplete="autocomplete" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)">',
}

async function mountPage(token?: string) {
  const pinia = createPinia()
  setActivePinia(pinia)
  if (token) captureEmailActionCapability('password-reset', `#token=${token}`)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/auth/password-reset', name: 'password-reset', component: PasswordResetPage },
      { path: '/login', name: 'login', component: { template: '<div>Login</div>' } },
    ],
  })
  await router.push('/auth/password-reset')
  await router.isReady()
  const wrapper = mount(PasswordResetPage, {
    attachTo: document.body,
    global: {
      plugins: [pinia, router],
      stubs: {
        InputText: InputTextStub,
        Button: {
          props: ['label', 'disabled', 'loading'],
          template: '<button v-bind="$attrs" :disabled="disabled || loading">{{ label }}<slot /></button>',
        },
        Message: { template: '<div role="alert" aria-live="assertive"><slot /></div>' },
      },
    },
  })
  return { router, wrapper }
}

describe('password reset landing page', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    sessionStorage.clear()
    localStorage.clear()
    clearEmailActionCapability('password-reset')
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('keeps GET inert and offers paste-friendly new-password fields', async () => {
    const token = 'lpr_reset-capability'
    const { wrapper } = await mountPage(token)

    expect(passwordRecoveryApi.complete).not.toHaveBeenCalled()
    expect(wrapper.findAll('input[type="password"]')).toHaveLength(2)
    expect(wrapper.findAll('input[type="password"]').map((input) => input.attributes('autocomplete')))
      .toEqual(['new-password', 'new-password'])
    expect(wrapper.html()).not.toContain(token)
    expect(JSON.stringify(Object.values(sessionStorage))).not.toContain(token)
    expect(JSON.stringify(Object.values(localStorage))).not.toContain(token)
  })

  it('does not consume the memory capability when confirmation mismatches', async () => {
    const { wrapper } = await mountPage('lpr_reset-capability')
    await wrapper.get('#reset-new-password').setValue('correct horse battery staple')
    await wrapper.get('#reset-password-confirmation').setValue('different horse battery staple')

    await wrapper.get('form').trigger('submit')

    expect(wrapper.text()).toContain('Пароли не совпадают')
    expect(passwordRecoveryApi.complete).not.toHaveBeenCalled()
    expect(hasEmailActionCapability('password-reset')).toBe(true)
  })

  it('completes by explicit POST, forgets secrets, and routes to ordinary login', async () => {
    const token = 'lpr_reset-capability'
    const password = 'correct horse battery staple'
    vi.mocked(passwordRecoveryApi.complete).mockResolvedValue({
      kind: 'PASSWORD_RESET_COMPLETED',
      next: 'LOGIN',
    })
    const { router, wrapper } = await mountPage(token)
    useAuthStore().$patch({
      restored: true,
      phase: 'AUTHENTICATED',
      user: { id: 'operator-1', email: 'operator@example.com', name: 'Operator' },
    })
    await wrapper.get('#reset-new-password').setValue(password)
    await wrapper.get('#reset-password-confirmation').setValue(password)

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(passwordRecoveryApi.complete).toHaveBeenCalledWith({
      token,
      newPassword: password,
      passwordConfirmation: password,
    })
    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query).toEqual({ passwordReset: 'success' })
    expect(useAuthStore().phase).toBe('ANONYMOUS')
    expect(useAuthStore().isAuthenticated).toBe(false)
    expect(useAuthStore().restored).toBe(true)
    expect(hasEmailActionCapability('password-reset')).toBe(false)
    expect(wrapper.get<HTMLInputElement>('#reset-new-password').element.value).toBe('')
    expect(wrapper.get<HTMLInputElement>('#reset-password-confirmation').element.value).toBe('')
  })

  it('shows safe password-policy feedback and retains the capability for correction', async () => {
    vi.mocked(passwordRecoveryApi.complete).mockRejectedValue(new ApiError(
      422,
      'Password rejected for lpr_secret',
      { reason: 'BLOCKLISTED' },
      undefined,
      'PASSWORD_POLICY_REJECTED',
    ))
    const { wrapper } = await mountPage('lpr_reset-capability')
    await wrapper.get('#reset-new-password').setValue('correct horse battery staple')
    await wrapper.get('#reset-password-confirmation').setValue('correct horse battery staple')

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('Этот пароль слишком распространён. Выберите другой.')
    expect(wrapper.text()).not.toContain('lpr_secret')
    expect(hasEmailActionCapability('password-reset')).toBe(true)
  })

  it('maps backend password-confirmation feedback without echoing its message', async () => {
    vi.mocked(passwordRecoveryApi.complete).mockRejectedValue(new ApiError(
      422,
      'Mismatch for lpr_secret-that-must-not-leak',
      undefined,
      undefined,
      'PASSWORD_CONFIRMATION_MISMATCH',
    ))
    const { wrapper } = await mountPage('lpr_reset-capability')
    await wrapper.get('#reset-new-password').setValue('correct horse battery staple')
    await wrapper.get('#reset-password-confirmation').setValue('correct horse battery staple')

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('Пароли не совпадают')
    expect(wrapper.text()).not.toContain('lpr_secret')
    expect(hasEmailActionCapability('password-reset')).toBe(true)
  })

  it('collapses invalid, expired, and consumed capabilities into one generic state', async () => {
    const token = 'lpr_secret-that-must-not-leak'
    vi.mocked(passwordRecoveryApi.complete).mockRejectedValue(new ApiError(
      401,
      `expired ${token}`,
      undefined,
      undefined,
      'PASSWORD_RESET_TOKEN_INVALID',
    ))
    const { wrapper } = await mountPage(token)
    await wrapper.get('#reset-new-password').setValue('correct horse battery staple')
    await wrapper.get('#reset-password-confirmation').setValue('correct horse battery staple')

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('Ссылка недействительна или уже использована. Запросите новое письмо.')
    expect(wrapper.text()).not.toContain(token)
    expect(wrapper.text()).not.toContain('expired')
    expect(hasEmailActionCapability('password-reset')).toBe(false)
  })

  it('does not call the API when the fragment capability is absent', async () => {
    const { wrapper } = await mountPage()

    expect(wrapper.text()).toContain('Ссылка недоступна')
    expect(wrapper.find('form').exists()).toBe(false)
    expect(passwordRecoveryApi.complete).not.toHaveBeenCalled()
  })
})
