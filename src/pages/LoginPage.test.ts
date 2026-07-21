import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authApi } from '@/features/auth/auth.api'
import { ApiError } from '@/shared/api/http/api-error'
import LoginPage from './LoginPage.vue'

vi.mock('@/features/auth/auth.api', () => ({
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

const InputTextStub = {
  inheritAttrs: false,
  props: ['id', 'modelValue', 'type', 'autocomplete'],
  emits: ['update:modelValue'],
  template: '<input v-bind="$attrs" :id="id" :type="type" :autocomplete="autocomplete" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)">',
}

async function mountPage(location = '/login') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', name: 'login', component: LoginPage },
      { path: '/forgot-password', name: 'forgot-password', component: { template: '<div>Recovery</div>' } },
      { path: '/password/setup', name: 'password-setup', component: { template: '<div>Setup</div>' } },
      { path: '/overview', name: 'overview', component: { template: '<div>Overview</div>' } },
    ],
  })
  await router.push(location)
  await router.isReady()
  const wrapper = mount(LoginPage, {
    attachTo: document.body,
    global: {
      plugins: [router],
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

describe('CMS User login page', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('routes Initial Access to mandatory password setup without entering the CMS', async () => {
    vi.mocked(authApi.login).mockResolvedValue({
      kind: 'PASSWORD_SETUP_REQUIRED',
      setupToken: 'lps_setup-secret',
      expiresAt: '2026-07-21T10:10:00.000Z',
    })
    const { router, wrapper } = await mountPage()
    await wrapper.get('#login').setValue('operator@example.com')
    await wrapper.get('#password').setValue('lia_initial-secret')

    expect(wrapper.get('#login').attributes('autocomplete')).toBe('username')
    expect(wrapper.get('#password').attributes('autocomplete')).toBe('current-password')
    expect(wrapper.get('#password').attributes('onpaste')).toBeUndefined()

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('password-setup')
  })

  it('uses neutral copy for a CMS User who may not have a Project Membership', async () => {
    const { wrapper } = await mountPage()

    expect(wrapper.text()).toContain('После входа мы откроем доступное вам рабочее пространство.')
    expect(wrapper.text()).not.toContain('Доступ проверяется по участникам проекта.')
  })

  it('links to password recovery and announces a completed reset without logging in', async () => {
    const { router, wrapper } = await mountPage('/login?passwordReset=success')

    expect(wrapper.get('[data-testid="forgot-password-link"]').attributes('href')).toBe('/forgot-password')
    expect(wrapper.text()).toContain('Пароль изменён. Войдите с новым паролем.')
    expect(router.currentRoute.value.name).toBe('login')
  })

  it('announces a generic authentication error and focuses it', async () => {
    vi.mocked(authApi.login).mockRejectedValue(new ApiError(
      401,
      'Authentication failed',
      undefined,
      undefined,
      'AUTHENTICATION_FAILED',
    ))
    const { wrapper } = await mountPage()
    await wrapper.get('#login').setValue('operator@example.com')
    await wrapper.get('#password').setValue('wrong secret')

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    const alertContainer = wrapper.get('#login-error')
    expect(alertContainer.get('[role="alert"]').attributes('aria-live')).toBe('assertive')
    expect(alertContainer.text()).toBe('Неверный email или пароль.')
    expect(document.activeElement).toBe(alertContainer.element)
    expect(wrapper.get('#login').attributes('aria-invalid')).toBe('true')
    expect(wrapper.get('#password').attributes('aria-describedby')).toContain('login-error')
  })

  it('blocks retries for the bounded Retry-After countdown', async () => {
    vi.useFakeTimers()
    vi.mocked(authApi.login).mockRejectedValue(new ApiError(
      429,
      'Authentication unavailable',
      { retryAfterSeconds: 2 },
      undefined,
      'RATE_LIMITED',
      2,
    ))
    const { wrapper } = await mountPage()
    await wrapper.get('#login').setValue('operator@example.com')
    await wrapper.get('#password').setValue('wrong secret')

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('#login-error').text()).toContain('Повторите через 2 сек.')
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()

    await vi.advanceTimersByTimeAsync(1_000)
    expect(wrapper.get('#login-error').text()).toContain('Повторите через 1 сек.')

    await vi.advanceTimersByTimeAsync(1_000)
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeUndefined()
  })
})
