import { flushPromises, shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProjectUserAttributesPage from './ProjectUserAttributesPage.vue'

const mocks = vi.hoisted(() => ({
  getSchema: vi.fn(),
}))

vi.mock('@/features/auth/auth.store', () => ({
  useAuthStore: () => ({ project: { id: 'project-1' }, user: { role: 'OWNER' } }),
}))

vi.mock('@/shared/api/repository', () => ({
  repository: {
    getUserAttributeSchema: mocks.getSchema,
    createUserAttributeDefinition: vi.fn(),
    updateUserAttributeDefinition: vi.fn(),
    deleteUserAttributeDefinition: vi.fn(),
  },
}))

vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require: vi.fn() }) }))
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))
vi.mock('@/shared/lib/use-unsaved-changes-guard', () => ({ useUnsavedChangesGuard: () => ({ confirmDiscard: () => true }) }))

describe('ProjectUserAttributesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSchema.mockResolvedValue({ definitions: [], currentRevision: null })
  })

  it('shows mutation controls only after the contract loaded successfully', async () => {
    const wrapper = shallowMount(ProjectUserAttributesPage)
    await flushPromises()

    expect(mocks.getSchema).toHaveBeenCalledWith('project-1')
    expect(wrapper.find('button-stub[label="Добавить поле"]').exists()).toBe(true)
  })

  it('does not present a failed load as an empty editable contract', async () => {
    mocks.getSchema.mockRejectedValue(new Error('Backend unavailable'))
    const wrapper = shallowMount(ProjectUserAttributesPage)
    await flushPromises()

    expect(wrapper.find('message-stub[severity="error"]').exists()).toBe(true)
    expect(wrapper.find('button-stub[label="Добавить поле"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Поля пользователя ещё не настроены')
  })
})
