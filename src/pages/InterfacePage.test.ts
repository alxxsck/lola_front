import { flushPromises, shallowMount } from '@vue/test-utils'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import ToggleSwitch from 'primevue/toggleswitch'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import InterfacePage from './InterfacePage.vue'

const mocks = vi.hoisted(() => ({
  permissions: ['project.ui_registry.read', 'project.ui_registry.write'] as string[],
  getElements: vi.fn(),
  updateElement: vi.fn(),
  toast: vi.fn(),
}))

const page = {
  id: 'ui-1',
  projectId: 'project-1',
  code: 'bonuses',
  name: 'Бонусы',
  kind: 'PAGE' as const,
  route: '/bonuses',
  config: {},
  enabled: true,
  aiEnabled: false,
  aiDescription: null,
  aiAliases: [],
}

vi.mock('@/features/auth/auth.store', () => ({
  useAuthStore: () => ({
    project: { id: 'project-1', get effectivePermissionCodes() { return mocks.permissions } },
  }),
}))
vi.mock('@/shared/api/repository', () => ({
  repository: {
    getElements: mocks.getElements,
    updateElement: mocks.updateElement,
    createElement: vi.fn(),
    deleteElement: vi.fn(),
  },
}))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { kind: 'page' } }),
  useRouter: () => ({ replace: vi.fn() }),
}))
vi.mock('primevue/useconfirm', () => ({
  useConfirm: () => ({ require: vi.fn() }),
}))
vi.mock('primevue/usetoast', () => ({
  useToast: () => ({ add: mocks.toast }),
}))
vi.mock('@/shared/lib/use-unsaved-changes-guard', () => ({
  useUnsavedChangesGuard: () => ({ confirmDiscard: () => true }),
}))

function mountPage() {
  return shallowMount(InterfacePage, {
    global: {
      stubs: {
        Dialog: {
          props: ['visible'],
          template: '<div v-if="visible"><slot /><slot name="footer" /></div>',
        },
        Message: { template: '<div class="message-stub"><slot /></div>' },
      },
    },
  })
}

describe('InterfacePage AI target exposure', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.permissions = ['project.ui_registry.read', 'project.ui_registry.write']
    mocks.getElements.mockResolvedValue([{ ...page }])
    mocks.updateElement.mockImplementation(
      async (_projectId: string, _id: string, patch: object) => ({
        ...page,
        ...patch,
      }),
    )
  })

  it('requires description and audit reason before exposing a bound target to AI', async () => {
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.find('button-stub[label="Изменить"]').trigger('click')
    const aiToggle = wrapper
      .findAllComponents(ToggleSwitch)
      .find((item) => item.attributes('aria-label') === 'Разрешить Lola')!
    aiToggle.vm.$emit('update:modelValue', true)
    await wrapper.vm.$nextTick()
    await wrapper.get('#element-form').trigger('submit')

    expect(wrapper.text()).toContain(
      'Описание для Lola должно содержать от 20 до 1000 символов',
    )
    expect(mocks.updateElement).not.toHaveBeenCalled()

    wrapper
      .findAllComponents(Textarea)
      .find((item) => item.attributes('id') === 'ai-target-description')!
      .vm.$emit(
        'update:modelValue',
        'Страница, где пользователь просматривает доступные бонусы.',
      )
    wrapper
      .findAllComponents(InputText)
      .find((item) => item.attributes('id') === 'ai-target-aliases')!
      .vm.$emit('update:modelValue', 'награды, rewards')
    wrapper
      .findAllComponents(InputText)
      .find((item) => item.attributes('id') === 'ai-target-audit-reason')!
      .vm.$emit('update:modelValue', 'Expose bonuses target for OPEN_PAGE')
    await wrapper.vm.$nextTick()
    await wrapper.get('#element-form').trigger('submit')
    await flushPromises()

    expect(mocks.updateElement).toHaveBeenCalledWith('project-1', 'ui-1', {
      aiEnabled: true,
      aiDescription:
        'Страница, где пользователь просматривает доступные бонусы.',
      aiAliases: ['награды', 'rewards'],
      auditReason: 'Expose bonuses target for OPEN_PAGE',
    })
  })

  it('removes every mutation control without the write Permission', async () => {
    mocks.permissions = ['project.ui_registry.read']
    const wrapper = mountPage()
    await flushPromises()

    const enabledToggle = wrapper
      .findAllComponents(ToggleSwitch)
      .find((item) => item.attributes('aria-label') === 'Включить Бонусы')!
    expect(enabledToggle.attributes('disabled')).toBe('true')
    expect(wrapper.find('button-stub[label="Добавить элемент"]').exists()).toBe(false)
    expect(wrapper.find('button-stub[label="Изменить"]').exists()).toBe(false)
    expect(wrapper.find('button-stub[icon="pi pi-trash"]').exists()).toBe(false)
    enabledToggle.vm.$emit('update:modelValue', false)
    await flushPromises()
    expect(mocks.updateElement).not.toHaveBeenCalled()
  })

  it('requires an exposed target to be disabled through the audited editor flow', async () => {
    mocks.getElements.mockResolvedValue([
      {
        ...page,
        aiEnabled: true,
        aiDescription: 'Страница с доступными пользователю бонусами.',
      },
    ])
    const wrapper = mountPage()
    await flushPromises()

    const activeToggle = wrapper
      .findAllComponents(ToggleSwitch)
      .find((item) => item.attributes('aria-label') === 'Включить Бонусы')!
    expect(activeToggle.attributes('disabled')).toBe('true')
  })
})
