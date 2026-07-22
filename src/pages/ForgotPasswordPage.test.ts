import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { passwordRecoveryApi } from '@/features/password-recovery/password-recovery.api'
import ForgotPasswordPage from './ForgotPasswordPage.vue'

vi.mock('@/features/password-recovery/password-recovery.api', () => ({
  passwordRecoveryApi: { request: vi.fn() },
}))

const InputTextStub = {
  inheritAttrs: false,
  props: ['id', 'modelValue', 'type', 'autocomplete'],
  emits: ['update:modelValue'],
  template: '<input v-bind="$attrs" :id="id" :type="type" :autocomplete="autocomplete" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)">',
}

async function mountPage() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/forgot-password', name: 'forgot-password', component: ForgotPasswordPage },
      { path: '/login', name: 'login', component: { template: '<div>Login</div>' } },
    ],
  })
  await router.push('/forgot-password')
  await router.isReady()
  const wrapper = mount(ForgotPasswordPage, {
    attachTo: document.body,
    global: {
      plugins: [router],
      stubs: {
        InputText: InputTextStub,
        Button: {
          props: ['label', 'disabled', 'loading'],
          template: '<button v-bind="$attrs" :disabled="disabled || loading">{{ label }}<slot /></button>',
        },
        Message: { template: '<div role="status"><slot /></div>' },
      },
    },
  })
  return { router, wrapper }
}

describe('forgot password request page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(passwordRecoveryApi.request).mockResolvedValue({ accepted: true })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it.each(['known@example.com', 'unknown@example.com'])(
    'shows the same enumeration-neutral success state for %s',
    async (email) => {
      const { wrapper } = await mountPage()
      await wrapper.get('#recovery-email').setValue(email)

      await wrapper.get('form').trigger('submit')
      await flushPromises()

      expect(passwordRecoveryApi.request).toHaveBeenCalledWith(email)
      expect(wrapper.text()).toContain('Если аккаунт подходит для восстановления, письмо отправлено.')
      expect(wrapper.text()).not.toContain(email)
      expect(wrapper.find('form').exists()).toBe(false)
    },
  )

  it('uses an email-autocomplete input and never prevents paste', async () => {
    const { wrapper } = await mountPage()
    const input = wrapper.get('#recovery-email')

    expect(input.attributes('type')).toBe('email')
    expect(input.attributes('autocomplete')).toBe('email')
    expect(input.attributes('onpaste')).toBeUndefined()
  })

  it('does not echo an operational backend error or the submitted identity', async () => {
    const email = 'private@example.com'
    vi.mocked(passwordRecoveryApi.request).mockRejectedValue(new Error(`provider failed for ${email}`))
    const { wrapper } = await mountPage()
    await wrapper.get('#recovery-email').setValue(email)

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('Не удалось отправить запрос. Попробуйте ещё раз.')
    expect(wrapper.text()).not.toContain('provider failed')
    expect(wrapper.text()).not.toContain(email)
  })
})
