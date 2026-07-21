import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { securitySettingsApi } from '@/features/security-settings/security-settings.api'
import SecuritySettingsPage from './SecuritySettingsPage.vue'

vi.mock('@/features/security-settings/security-settings.api', () => ({
  securitySettingsApi: {
    listSessions: vi.fn(),
    revokeSession: vi.fn(),
    revokeOtherSessions: vi.fn(),
    changePassword: vi.fn(),
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

async function mountPage() {
  const pinia = createPinia()
  setActivePinia(pinia)
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
    const inputs = wrapper.findAll('input')
    await inputs[0]!.setValue('old password')
    await inputs[1]!.setValue('new secure passphrase')
    await inputs[2]!.setValue('different passphrase')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.text()).toContain('Новый пароль и подтверждение не совпадают.')
    expect(securitySettingsApi.changePassword).not.toHaveBeenCalled()

    await inputs[2]!.setValue('new secure passphrase')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(securitySettingsApi.changePassword).toHaveBeenCalledWith({
      currentPassword: 'old password',
      newPassword: 'new secure passphrase',
      passwordConfirmation: 'new secure passphrase',
    })
    expect(wrapper.text()).toContain('Пароль изменён. Остальные сессии завершены.')
  })
})
