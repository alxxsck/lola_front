import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/shared/api/http/api-error'
import ProjectMfaPolicySection from './ProjectMfaPolicySection.vue'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  logout: vi.fn(),
  replace: vi.fn(),
}))

vi.mock('../api/project-mfa-policy.api', () => ({
  projectMfaPolicyApi: { get: mocks.get, update: mocks.update },
}))

vi.mock('@/features/auth/auth.store', () => ({
  useAuthStore: () => ({ logout: mocks.logout }),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ replace: mocks.replace }),
}))

const optionalPolicy = {
  projectId: '00000000-0000-4000-8000-000000000001',
  mode: 'OPTIONAL' as const,
  version: 2,
  updatedAt: null,
}

function mountPolicy(editable: boolean) {
  return mount(ProjectMfaPolicySection, {
    props: { projectId: optionalPolicy.projectId, editable },
    global: {
      stubs: {
        Textarea: {
          props: ['modelValue'],
          emits: ['update:modelValue'],
          template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
        },
      },
    },
  })
}

describe('ProjectMfaPolicySection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.get.mockResolvedValue(optionalPolicy)
    mocks.update.mockResolvedValue({
      ...optionalPolicy,
      mode: 'REQUIRED',
      version: 3,
      updatedAt: '2026-07-21T12:00:00.000Z',
    })
  })

  it('loads and renders the policy read-only without write permission', async () => {
    const wrapper = mountPolicy(false)
    await flushPromises()

    expect(mocks.get).toHaveBeenCalledWith(optionalPolicy.projectId)
    expect(wrapper.text()).toContain('Необязательная MFA')
    expect(wrapper.find('[data-testid="mfa-policy-form"]').exists()).toBe(false)
  })

  it('updates through the versioned endpoint only after a valid reason', async () => {
    const wrapper = mountPolicy(true)
    await flushPromises()

    await wrapper.get('[data-testid="mfa-policy-edit"]').trigger('click')
    await wrapper.get('select').setValue('REQUIRED')
    await wrapper.get('textarea').setValue('Require MFA for support operators')
    await wrapper.get('[data-testid="mfa-policy-form"]').trigger('submit')
    await flushPromises()

    expect(mocks.update).toHaveBeenCalledWith(optionalPolicy.projectId, {
      mode: 'REQUIRED',
      expectedVersion: 2,
      reason: 'Require MFA for support operators',
    })
    expect(wrapper.text()).toContain('Обязательная MFA')
    expect(wrapper.text()).toContain('Политика MFA обновлена')
  })

  it('reloads a conflicting policy without replaying the mutation', async () => {
    mocks.update.mockRejectedValueOnce(new ApiError(409, 'Conflict', undefined, undefined, 'PROJECT_MFA_POLICY_VERSION_CONFLICT'))
    mocks.get
      .mockResolvedValueOnce(optionalPolicy)
      .mockResolvedValueOnce({ ...optionalPolicy, mode: 'REQUIRED', version: 7 })
    const wrapper = mountPolicy(true)
    await flushPromises()

    await wrapper.get('[data-testid="mfa-policy-edit"]').trigger('click')
    await wrapper.get('textarea').setValue('Document the policy concurrency update')
    await wrapper.get('[data-testid="mfa-policy-form"]').trigger('submit')
    await flushPromises()

    expect(mocks.update).toHaveBeenCalledTimes(1)
    expect(mocks.get).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('Политика уже изменилась')
  })

  it('requires a fresh login on 428 and never automatically replays', async () => {
    mocks.update.mockRejectedValueOnce(new ApiError(428, 'Fresh authentication required', undefined, undefined, 'REAUTHENTICATION_REQUIRED'))
    const wrapper = mountPolicy(true)
    await flushPromises()

    await wrapper.get('[data-testid="mfa-policy-edit"]').trigger('click')
    await wrapper.get('textarea').setValue('Require a fresh strong authentication')
    await wrapper.get('[data-testid="mfa-policy-form"]').trigger('submit')
    await flushPromises()

    expect(mocks.update).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('нужен свежий вход')
    await wrapper.get('[data-testid="mfa-policy-reauthenticate"]').trigger('click')
    await flushPromises()
    expect(mocks.logout).toHaveBeenCalledOnce()
    expect(mocks.replace).toHaveBeenCalledWith('/login')
    expect(mocks.update).toHaveBeenCalledTimes(1)
  })
})
