import { flushPromises, shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProjectRolesPage from './ProjectRolesPage.vue'
import { projectRoleApi } from '@/features/project-roles/api/project-role.api'
import { ApiError } from '@/shared/api/http/api-error'

const projectId = '00000000-0000-4000-8000-000000000010'
const roleId = '00000000-0000-4000-8000-000000000020'

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  auth: {
    user: {
      id: 'user-1',
      email: 'owner@example.com',
      name: 'Owner',
      platformPermissionCodes: [] as string[],
    },
    project: {
      id: '00000000-0000-4000-8000-000000000010',
      effectivePermissionCodes: ['project.roles.read', 'project.roles.manage'],
    } as { id: string; effectivePermissionCodes: string[] } | null,
    refreshContext: vi.fn(),
    logout: vi.fn(),
  },
}))

vi.mock('vue-router', () => ({ useRouter: () => ({ replace: mocks.replace }) }))
vi.mock('@/features/auth/auth.store', () => ({ useAuthStore: () => mocks.auth }))
vi.mock('@/features/project-roles/api/project-role.api', () => ({
  projectRoleApi: {
    permissions: vi.fn(),
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    reassign: vi.fn(),
    archive: vi.fn(),
  },
}))

const role = (managed = false) => ({
  id: roleId,
  projectId,
  key: managed ? 'PROJECT_ADMIN' : 'SUPPORT_READER',
  name: managed ? 'Project Admin' : 'Support reader',
  description: 'Reads support queues',
  managed,
  status: 'ACTIVE' as const,
  permissionCodes: ['project.roles.read'],
  assignedMembershipCount: 2,
  assignedMembershipCountCapped: false,
  version: 3,
  createdAt: '2026-07-21T10:00:00.000Z',
  updatedAt: '2026-07-21T10:00:00.000Z',
})

function mountPage() {
  return shallowMount(ProjectRolesPage, {
    global: {
      stubs: {
        Button: {
          inheritAttrs: false,
          props: ['label', 'disabled'],
          emits: ['click'],
          template: '<button v-bind="$attrs" :disabled="disabled" @click="$emit(\'click\')">{{ label }}</button>',
        },
        Dialog: {
          props: ['visible'],
          template: '<section v-if="visible"><slot /><slot name="footer" /></section>',
        },
        InputText: {
          inheritAttrs: false,
          props: ['modelValue'],
          emits: ['update:modelValue'],
          template: '<input v-bind="$attrs" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)">',
        },
        Message: { template: '<div><slot /></div>' },
        MultiSelect: true,
        Tag: { props: ['value'], template: '<span>{{ value }}</span>' },
        Textarea: {
          inheritAttrs: false,
          props: ['modelValue'],
          emits: ['update:modelValue'],
          template: '<textarea v-bind="$attrs" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
        },
      },
    },
  })
}

describe('Project Roles page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth.user.platformPermissionCodes = []
    mocks.auth.project = {
      id: projectId,
      effectivePermissionCodes: ['project.roles.read', 'project.roles.manage'],
    }
    mocks.auth.refreshContext.mockResolvedValue(undefined)
    mocks.auth.logout.mockResolvedValue(undefined)
    vi.mocked(projectRoleApi.list).mockResolvedValue({ items: [role()] })
    vi.mocked(projectRoleApi.permissions).mockResolvedValue({
      groups: [
        {
          scope: 'PROJECT',
          category: 'roles',
          risk: 'HIGH',
          permissions: [
            {
              code: 'project.roles.read',
              scope: 'PROJECT',
              category: 'roles',
              risk: 'HIGH',
              label: 'Read roles',
              description: 'Read role library',
              labelTranslations: {},
              descriptionTranslations: {},
            },
          ],
        },
      ],
    })
    vi.mocked(projectRoleApi.create).mockResolvedValue(role())
    vi.mocked(projectRoleApi.get).mockResolvedValue(role())
    vi.mocked(projectRoleApi.update).mockResolvedValue({ ...role(), version: 4 })
  })

  it('keeps managed roles read-only even for role managers', async () => {
    vi.mocked(projectRoleApi.list).mockResolvedValue({ items: [role(true)] })
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.text()).toContain('Системная')
    expect(wrapper.text()).not.toContain('Изменить')
    expect(wrapper.text()).not.toContain('Архивировать')
  })

  it('creates from the visible server-owned delegable catalog and refreshes authority', async () => {
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.get('[data-testid="create-role"]').trigger('click')
    await wrapper.get('[data-testid="role-key"]').setValue('SUPPORT_READER')
    await wrapper.get('[data-testid="role-name"]').setValue('Support reader')
    await wrapper.get('[data-testid="role-description"]').setValue('Reads support queues')
    await wrapper.get('input[type="checkbox"]').setValue(true)
    await wrapper.get('[data-testid="role-reason"]').setValue('  Approved role creation  ')
    await wrapper.get('[data-testid="submit-role"]').trigger('click')
    await flushPromises()

    expect(projectRoleApi.create).toHaveBeenCalledWith(projectId, {
      key: 'SUPPORT_READER',
      name: 'Support reader',
      description: 'Reads support queues',
      permissionCodes: ['project.roles.read'],
      reason: 'Approved role creation',
    })
    expect(mocks.auth.refreshContext).toHaveBeenCalledOnce()
  })

  it('does not submit an update until the displayed impact is explicitly confirmed', async () => {
    const wrapper = mountPage()
    await flushPromises()
    const edit = wrapper.findAll('button').find((button) => button.text() === 'Изменить')
    expect(edit).toBeTruthy()
    await edit!.trigger('click')
    await wrapper.get('[data-testid="role-reason"]').setValue('Approved role update')
    await wrapper.get('[data-testid="submit-role"]').trigger('click')
    expect(projectRoleApi.update).not.toHaveBeenCalled()

    await wrapper.get('[data-testid="impact-confirmation"]').setValue(true)
    await wrapper.get('[data-testid="submit-role"]').trigger('click')
    await flushPromises()
    expect(projectRoleApi.update).toHaveBeenCalledOnce()
  })

  it('rebinds the open editor to the conflict winner and requires fresh impact confirmation', async () => {
    vi.mocked(projectRoleApi.update)
      .mockRejectedValueOnce(new ApiError(409, 'unsafe', undefined, 'r1', 'VERSION_CONFLICT'))
      .mockResolvedValueOnce({ ...role(), version: 5, assignedMembershipCount: 3 })
    vi.mocked(projectRoleApi.get).mockResolvedValue({
      ...role(),
      version: 4,
      assignedMembershipCount: 3,
    })
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.findAll('button').find((button) => button.text() === 'Изменить')!.trigger('click')
    await wrapper.get('[data-testid="role-reason"]').setValue('Approved role update')
    await wrapper.get('[data-testid="impact-confirmation"]').setValue(true)
    await wrapper.get('[data-testid="submit-role"]').trigger('click')
    await flushPromises()

    await wrapper.get('[data-testid="submit-role"]').trigger('click')
    expect(projectRoleApi.update).toHaveBeenCalledOnce()

    await wrapper.get('[data-testid="impact-confirmation"]').setValue(true)
    await wrapper.get('[data-testid="submit-role"]').trigger('click')
    await flushPromises()
    expect(projectRoleApi.update).toHaveBeenNthCalledWith(
      2,
      projectId,
      roleId,
      expect.objectContaining({
        version: 4,
        expectedAssignedMembershipCount: 3,
        expectedAssignedMembershipCountCapped: false,
      }),
    )
  })

  it('offers a fresh login after step-up denial without replaying the role mutation', async () => {
    vi.mocked(projectRoleApi.create).mockRejectedValue(
      new ApiError(428, 'unsafe backend text', undefined, 'step-up-request', 'MFA_REQUIRED'),
    )
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.get('[data-testid="create-role"]').trigger('click')
    await wrapper.get('[data-testid="role-key"]').setValue('SUPPORT_READER')
    await wrapper.get('[data-testid="role-name"]').setValue('Support reader')
    await wrapper.get('[data-testid="role-description"]').setValue('Reads support queues')
    await wrapper.get('input[type="checkbox"]').setValue(true)
    await wrapper.get('[data-testid="role-reason"]').setValue('Approved role creation')
    await wrapper.get('[data-testid="submit-role"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Требуется свежий вход с MFA')
    expect(wrapper.text()).not.toContain('unsafe backend text')
    expect(projectRoleApi.create).toHaveBeenCalledOnce()

    await wrapper.get('[data-testid="role-step-up"]').trigger('click')
    await flushPromises()
    expect(mocks.auth.logout).toHaveBeenCalledOnce()
    expect(mocks.replace).toHaveBeenCalledWith({
      name: 'login',
      query: { redirect: '/project/roles' },
    })
    expect(projectRoleApi.create).toHaveBeenCalledOnce()
  })
})
