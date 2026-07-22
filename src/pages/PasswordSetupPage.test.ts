import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authApi } from '@/features/auth/auth.api'
import { useAuthStore } from '@/features/auth/auth.store'
import { ApiError } from '@/shared/api/http/api-error'
import PasswordSetupPage from './PasswordSetupPage.vue'

vi.mock('@/features/auth/auth.api', () => ({
  authApi: {
    mode: 'api',
    cancelMfa: vi.fn(),
    login: vi.fn(),
    restore: vi.fn(),
    logout: vi.fn(),
    logoutAll: vi.fn(),
    completePasswordSetup: vi.fn(),
    refreshContext: vi.fn(),
  },
}))

function inputStub() {
  return {
    inheritAttrs: false,
    props: ['id', 'modelValue', 'type', 'autocomplete'],
    emits: ['update:modelValue'],
    template: '<input v-bind="$attrs" :id="id" :type="type" :autocomplete="autocomplete" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)">',
  }
}

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/password/setup', name: 'password-setup', component: PasswordSetupPage },
      { path: '/login', name: 'login', component: { template: '<div>Login</div>' } },
    ],
  })
}

async function mountPage() {
  const router = createTestRouter()
  await router.push('/password/setup')
  await router.isReady()
  const wrapper = mount(PasswordSetupPage, {
    attachTo: document.body,
    global: {
      plugins: [router],
      stubs: {
        InputText: inputStub(),
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

describe('mandatory password setup page', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(authApi.login).mockResolvedValue({
      kind: 'PASSWORD_SETUP_REQUIRED',
      setupToken: 'lps_setup-secret',
      expiresAt: '2026-07-21T10:10:00.000Z',
    })
    await useAuthStore().login('operator@example.com', 'lia_initial-secret')
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('offers paste-friendly new-password fields for the permanent credential', async () => {
    const { wrapper } = await mountPage()

    const passwordFields = wrapper.findAll('input[type="password"]')
    expect(passwordFields).toHaveLength(2)
    expect(passwordFields.map((field) => field.attributes('autocomplete'))).toEqual(['new-password', 'new-password'])
    expect(passwordFields.every((field) => field.attributes('onpaste') === undefined)).toBe(true)
    expect(wrapper.get('#new-password').attributes('aria-describedby')).toContain('password-rules')
  })

  it('keeps setup active when local password confirmation does not match', async () => {
    const { wrapper } = await mountPage()
    await wrapper.get('#new-password').setValue('a long permanent passphrase')
    await wrapper.get('#password-confirmation').setValue('a different permanent phrase')

    await wrapper.get('form').trigger('submit')

    expect(wrapper.text()).toContain('Пароли не совпадают')
    expect(authApi.completePasswordSetup).not.toHaveBeenCalled()
    expect(useAuthStore().phase).toBe('SETUP_REQUIRED')
    expect(useAuthStore().setupToken).toBe('lps_setup-secret')
    const alertContainer = wrapper.get('#password-setup-error')
    expect(alertContainer.get('[role="alert"]').attributes('aria-live')).toBe('assertive')
    expect(document.activeElement).toBe(alertContainer.element)
    expect(wrapper.get('#new-password').attributes('aria-invalid')).toBe('true')
    expect(wrapper.get('#password-confirmation').attributes('aria-describedby')).toContain('password-setup-error')
  })

  it('forgets both password fields and returns to login after successful setup', async () => {
    vi.mocked(authApi.completePasswordSetup).mockResolvedValue({
      kind: 'PASSWORD_ESTABLISHED',
      status: 'ACTIVE',
      nextAction: 'LOGIN',
    })
    const { router, wrapper } = await mountPage()
    await wrapper.get('#new-password').setValue('a long permanent passphrase')
    await wrapper.get('#password-confirmation').setValue('a long permanent passphrase')

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('login')
    expect(wrapper.get<HTMLInputElement>('#new-password').element.value).toBe('')
    expect(wrapper.get<HTMLInputElement>('#password-confirmation').element.value).toBe('')
    expect(useAuthStore().phase).toBe('ANONYMOUS_WITH_SETUP_SUCCESS')
    expect(useAuthStore().setupToken).toBeNull()
    expect(useAuthStore().isAuthenticated).toBe(false)
  })

  it('clears the setup capability when the user cancels', async () => {
    const { router, wrapper } = await mountPage()
    await wrapper.get('#new-password').setValue('a long permanent passphrase')

    await wrapper.findAll('.actions button')[0]!.trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('login')
    expect(wrapper.get<HTMLInputElement>('#new-password').element.value).toBe('')
    expect(useAuthStore().phase).toBe('ANONYMOUS')
    expect(useAuthStore().setupToken).toBeNull()
  })

  it('returns to login when the setup capability is no longer valid', async () => {
    vi.mocked(authApi.completePasswordSetup).mockRejectedValue(new ApiError(
      401,
      'Сессия установки пароля недоступна',
      undefined,
      undefined,
      'PASSWORD_SETUP_TOKEN_INVALID',
    ))
    const { router, wrapper } = await mountPage()
    await wrapper.get('#new-password').setValue('a long permanent passphrase')
    await wrapper.get('#password-confirmation').setValue('a long permanent passphrase')

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('login')
    expect(wrapper.get<HTMLInputElement>('#new-password').element.value).toBe('')
    expect(useAuthStore().phase).toBe('ANONYMOUS')
    expect(useAuthStore().setupToken).toBeNull()
  })

  it.each([
    ['MIN_LENGTH', 'Пароль должен содержать не менее 15 символов.'],
    ['MAX_LENGTH', 'Пароль превышает допустимую длину. Сократите его.'],
    ['MAX_BYTES', 'Пароль занимает слишком много места. Сократите его.'],
    ['BLOCKLISTED', 'Этот пароль слишком распространён. Выберите другой.'],
  ] as const)('shows safe password policy feedback for %s', async (reason, expectedMessage) => {
    vi.mocked(authApi.completePasswordSetup).mockRejectedValue(new ApiError(
      422,
      'Permanent password does not satisfy policy',
      { reason },
      undefined,
      'PASSWORD_POLICY_REJECTED',
    ))
    const { wrapper } = await mountPage()
    await wrapper.get('#new-password').setValue('a long permanent passphrase')
    await wrapper.get('#password-confirmation').setValue('a long permanent passphrase')

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('#password-setup-error').text()).toBe(expectedMessage)
    expect(wrapper.html()).not.toContain('Permanent password does not satisfy policy')
    expect(useAuthStore().phase).toBe('SETUP_REQUIRED')
  })

  it('blocks password setup retries for the bounded Retry-After countdown', async () => {
    vi.useFakeTimers()
    vi.mocked(authApi.completePasswordSetup).mockRejectedValue(new ApiError(
      429,
      'Authentication unavailable',
      { retryAfterSeconds: 2 },
      undefined,
      'RATE_LIMITED',
      2,
    ))
    const { wrapper } = await mountPage()
    await wrapper.get('#new-password').setValue('a long permanent passphrase')
    await wrapper.get('#password-confirmation').setValue('a long permanent passphrase')

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('#password-setup-error').text()).toContain('Повторите через 2 сек.')
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()

    await vi.advanceTimersByTimeAsync(2_000)
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeUndefined()
  })

  it('clears the setup capability when browser navigation leaves the route', async () => {
    const router = createTestRouter()
    await router.push('/login')
    await router.push('/password/setup')
    await router.isReady()
    const wrapper = mount({ template: '<RouterView />' }, {
      global: {
        plugins: [router],
        stubs: {
          InputText: inputStub(),
          Button: {
            props: ['label', 'disabled', 'loading'],
            template: '<button v-bind="$attrs" :disabled="disabled || loading">{{ label }}<slot /></button>',
          },
            Message: { template: '<div role="alert" aria-live="assertive"><slot /></div>' },
        },
      },
    })
    await flushPromises()
    await wrapper.get('#new-password').setValue('a long permanent passphrase')

    router.back()
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('login')
    expect(useAuthStore().phase).toBe('ANONYMOUS')
    expect(useAuthStore().setupToken).toBeNull()
  })
})
