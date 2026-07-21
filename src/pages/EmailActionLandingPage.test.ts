import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/features/auth/auth.store'
import {
  captureEmailActionCapability,
  clearEmailActionCapability,
  type EmailActionKind,
} from '@/features/email-identity/email-action-capability'
import { emailIdentityApi } from '@/features/email-identity/email-identity.api'
import EmailActionLandingPage from './EmailActionLandingPage.vue'

vi.mock('@/features/email-identity/email-identity.api', () => ({
  emailIdentityApi: { consume: vi.fn() },
}))

const ButtonStub = {
  props: ['label', 'disabled', 'loading'],
  emits: ['click'],
  template: '<button :disabled="disabled || loading" @click="$emit(\'click\')">{{ label }}</button>',
}

async function mountPage(action: EmailActionKind, token?: string) {
  const pinia = createPinia()
  setActivePinia(pinia)
  if (token) captureEmailActionCapability(action, `#token=${token}`)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: `/auth/${action}`, component: EmailActionLandingPage },
      { path: '/password/setup', component: { template: '<div>Password setup</div>' } },
      { path: '/login', component: { template: '<div>Login</div>' } },
      { path: '/settings/security', component: { template: '<div>Security</div>' } },
    ],
  })
  await router.push(`/auth/${action}`)
  await router.isReady()
  const wrapper = mount(EmailActionLandingPage, {
    props: { action },
    global: {
      plugins: [pinia, router],
      stubs: { Button: ButtonStub, Message: { template: '<div><slot /></div>' } },
    },
  })
  return { wrapper, router, auth: useAuthStore() }
}

describe('EmailActionLandingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    localStorage.clear()
    clearEmailActionCapability('initial-access')
    clearEmailActionCapability('verification')
    clearEmailActionCapability('email-change')
  })

  it('waits for explicit confirmation and moves an emailed invitation into memory-only setup', async () => {
    const token = 'lia_invitation-secret'
    vi.mocked(emailIdentityApi.consume).mockResolvedValue({
      kind: 'PASSWORD_SETUP_REQUIRED',
      setupToken: 'lps_setup-capability',
      expiresAt: '2026-07-22T10:00:00.000Z',
    })
    const { wrapper, router, auth } = await mountPage('initial-access', token)

    expect(emailIdentityApi.consume).not.toHaveBeenCalled()
    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(emailIdentityApi.consume).toHaveBeenCalledWith('initial-access', token)
    expect(router.currentRoute.value.path).toBe('/password/setup')
    expect(auth.setupToken).toBe('lps_setup-capability')
    expect(JSON.stringify(Object.values(sessionStorage))).not.toContain('lps_setup-capability')
    expect(JSON.stringify(Object.values(localStorage))).not.toContain('lps_setup-capability')
  })

  it.each([
    ['verification', { verified: true }, 'Email подтверждён'],
    ['email-change', { changed: true }, 'Email изменён'],
  ] as const)('shows the safe completed state for %s', async (action, response, copy) => {
    vi.mocked(emailIdentityApi.consume).mockResolvedValue(response)
    const { wrapper } = await mountPage(action, `${action}-secret`)

    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain(copy)
    expect(wrapper.text()).not.toContain(`${action}-secret`)
  })

  it('shows one generic failure without echoing the token or backend error', async () => {
    const token = 'lev_secret-that-must-not-leak'
    vi.mocked(emailIdentityApi.consume).mockRejectedValue(new Error(`expired ${token}`))
    const { wrapper } = await mountPage('verification', token)

    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Ссылка недействительна или уже использована')
    expect(wrapper.text()).not.toContain(token)
    expect(wrapper.text()).not.toContain('expired')
  })

  it('does not call the API when the fragment capability is absent', async () => {
    const { wrapper } = await mountPage('verification')

    expect(wrapper.text()).toContain('Ссылка недоступна')
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    expect(emailIdentityApi.consume).not.toHaveBeenCalled()
  })
})
