import { flushPromises, shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DataTable from 'primevue/datatable'
import PlatformCmsUsersPage from './PlatformCmsUsersPage.vue'
import { cmsUserManagementApi } from '@/features/cms-user-management/api/cms-user-management.api'
import { ApiError } from '@/shared/api/http/api-error'

const summary = {
  id: '00000000-0000-4000-8000-000000000002',
  email: 'anna@example.com',
  givenName: 'Анна',
  familyName: 'Орлова',
  displayName: 'Анна Орлова',
  status: 'ACTIVE' as const,
  emailVerified: true,
  projectCount: 2,
  lastLoginAt: '2026-07-21T10:00:00.000Z',
  version: 3,
  createdAt: '2026-07-20T10:00:00.000Z',
  updatedAt: '2026-07-21T10:00:00.000Z',
}

const detail = {
  ...summary,
  platformRoleKeys: ['PLATFORM_OPERATOR'],
  platformPermissionCodes: ['platform.cms_users.read'],
  deactivatedAt: null,
  deactivationReason: null,
}

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  routeParams: {} as Record<string, string>,
  auth: {
    user: {
      id: '00000000-0000-4000-8000-000000000001',
      email: 'operator@example.com',
      name: 'Оператор',
      platformPermissionCodes: [
        'platform.cms_users.read',
        'platform.cms_users.create',
        'platform.cms_users.update',
        'platform.cms_users.deactivate',
        'platform.cms_users.reactivate',
        'platform.cms_users.reset_credentials',
        'platform.roles.read',
        'platform.roles.manage',
      ],
    },
    logout: vi.fn(),
  },
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: mocks.routeParams }),
  useRouter: () => ({ replace: mocks.replace, push: vi.fn() }),
}))
vi.mock('@/features/auth/auth.store', () => ({ useAuthStore: () => mocks.auth }))
vi.mock('@/features/cms-user-management/api/cms-user-management.api', () => ({
  cmsUserManagementApi: {
    list: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    mutate: vi.fn(),
    projects: vi.fn(),
    roles: vi.fn(),
    platformRoles: vi.fn(),
    platformRoleAssignment: vi.fn(),
    replacePlatformRoles: vi.fn(),
    sessions: vi.fn(),
    revokeSession: vi.fn(),
    provision: vi.fn(),
  },
}))

function mountPage() {
  return shallowMount(PlatformCmsUsersPage, {
    global: {
      stubs: {
        Button: {
          props: ['label', 'disabled'],
          emits: ['click'],
          template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot />{{ label }}</button>',
        },
        Column: true,
        Drawer: { props: ['visible'], template: '<aside v-if="visible"><slot name="header" /><slot /></aside>' },
        Dialog: { props: ['visible'], template: '<section v-if="visible"><slot /><slot name="footer" /></section>' },
        Message: { template: '<div><slot /></div>' },
        Select: true,
        Skeleton: true,
        Tag: true,
        Textarea: {
          props: ['modelValue'],
          emits: ['update:modelValue'],
          template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
        },
      },
    },
  })
}

describe('Platform CMS User management page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.keys(mocks.routeParams).forEach((key) => delete mocks.routeParams[key])
    vi.mocked(cmsUserManagementApi.list).mockResolvedValue({ items: [summary], nextCursor: null })
    vi.mocked(cmsUserManagementApi.get).mockResolvedValue(detail)
    vi.mocked(cmsUserManagementApi.update).mockResolvedValue(detail)
    vi.mocked(cmsUserManagementApi.projects).mockResolvedValue([
      { id: 'project-1', name: 'Lola', slug: 'lola' },
    ] as never)
    vi.mocked(cmsUserManagementApi.roles).mockResolvedValue({
      items: [{ id: 'role-1', projectId: 'project-1', name: 'Администратор' }],
    } as never)
    vi.mocked(cmsUserManagementApi.platformRoles).mockResolvedValue({
      items: [{
        id: 'platform-role-1',
        key: 'PLATFORM_OPERATOR',
        name: 'Platform operator',
        description: 'Control plane access',
        status: 'ACTIVE',
        managed: true,
        version: 1,
        permissionCodes: ['platform.cms_users.read'],
        assignedUserCount: 2,
        assignedUserCountCapped: false,
        createdAt: '2026-07-20T10:00:00.000Z',
        updatedAt: '2026-07-20T10:00:00.000Z',
      }],
    })
    vi.mocked(cmsUserManagementApi.platformRoleAssignment).mockResolvedValue({
      cmsUserId: summary.id,
      version: 3,
      roleIds: ['platform-role-1'],
      roleKeys: ['PLATFORM_OPERATOR'],
      effectivePermissionCodes: ['platform.cms_users.read'],
    })
    vi.mocked(cmsUserManagementApi.sessions).mockResolvedValue({
      sessions: [
        {
          id: 'session-1',
          current: false,
          device: 'Chrome · macOS',
          createdAt: '2026-07-21T09:00:00.000Z',
          lastSeenAt: '2026-07-21T10:00:00.000Z',
          expiresAt: '2026-07-22T09:00:00.000Z',
        },
      ],
    })
    vi.mocked(cmsUserManagementApi.revokeSession).mockResolvedValue({ success: true })
  })

  it('opens a separate control-plane detail and renders actions from exact Permissions', async () => {
    const wrapper = mountPage()
    await flushPromises()

    wrapper.getComponent(DataTable).vm.$emit('row-click', { data: summary })
    await flushPromises()

    expect(cmsUserManagementApi.get).toHaveBeenCalledWith(summary.id)
    expect(cmsUserManagementApi.sessions).toHaveBeenCalledWith(summary.id)
    expect(mocks.replace).toHaveBeenCalledWith({
      name: 'platform-cms-users',
      params: { cmsUserId: summary.id },
    })
    expect(wrapper.text()).toContain('Анна Орлова')
    expect(wrapper.text()).toContain('Chrome · macOS')
    expect(wrapper.find('[data-action="SUSPEND"]').exists()).toBe(true)
    expect(wrapper.find('[data-action="RESET_CREDENTIALS"]').exists()).toBe(true)
  })

  it('requires a normalized audit reason before a lifecycle command', async () => {
    vi.mocked(cmsUserManagementApi.mutate).mockResolvedValue({ ...detail, status: 'SUSPENDED', version: 4 })
    const wrapper = mountPage()
    await flushPromises()
    wrapper.getComponent(DataTable).vm.$emit('row-click', { data: summary })
    await flushPromises()

    await wrapper.get('[data-action="SUSPEND"]').trigger('click')
    await wrapper.get('[data-testid="submit-lifecycle"]').trigger('click')
    expect(wrapper.text()).toContain('минимум 10 символов')
    expect(cmsUserManagementApi.mutate).not.toHaveBeenCalled()

    await wrapper.get('[data-testid="audit-reason"]').setValue('  Подтверждено службой безопасности  ')
    await wrapper.get('[data-testid="submit-lifecycle"]').trigger('click')
    await flushPromises()
    expect(cmsUserManagementApi.mutate).toHaveBeenCalledWith(
      summary.id,
      'SUSPEND',
      summary.version,
      'Подтверждено службой безопасности',
    )
  })

  it('revokes another CMS User session only after an audit reason', async () => {
    const wrapper = mountPage()
    await flushPromises()
    wrapper.getComponent(DataTable).vm.$emit('row-click', { data: summary })
    await flushPromises()

    await wrapper.get('[data-testid="revoke-session-session-1"]').trigger('click')
    await wrapper.get('[data-testid="session-revoke-reason"]').setValue(
      '  Подтверждено службой безопасности  ',
    )
    await wrapper.get('[data-testid="submit-session-revoke"]').trigger('click')
    await flushPromises()

    expect(cmsUserManagementApi.revokeSession).toHaveBeenCalledWith(
      summary.id,
      'session-1',
      'Подтверждено службой безопасности',
    )
    expect(wrapper.text()).not.toContain('Chrome · macOS')
  })

  it('shows safe conflict and fresh-login states without backend text or automatic replay', async () => {
    vi.mocked(cmsUserManagementApi.mutate)
      .mockRejectedValueOnce(new ApiError(409, 'SECRET INTERNAL', undefined, undefined, 'VERSION_CONFLICT'))
      .mockRejectedValueOnce(new ApiError(428, 'SECRET INTERNAL', undefined, undefined, 'REAUTHENTICATION_REQUIRED'))
    const wrapper = mountPage()
    await flushPromises()
    wrapper.getComponent(DataTable).vm.$emit('row-click', { data: summary })
    await flushPromises()

    for (const expected of ['Данные уже изменились', 'Требуется свежий вход']) {
      await wrapper.get('[data-action="RESET_CREDENTIALS"]').trigger('click')
      await wrapper.get('[data-testid="audit-reason"]').setValue('Подтверждено службой безопасности')
      await wrapper.get('[data-testid="submit-lifecycle"]').trigger('click')
      await flushPromises()
      expect(wrapper.text()).toContain(expected)
      expect(wrapper.text()).not.toContain('SECRET INTERNAL')
    }
    expect(cmsUserManagementApi.mutate).toHaveBeenCalledTimes(2)
  })

  it('creates a CMS User with project roles and exposes a manual secret once', async () => {
    vi.mocked(cmsUserManagementApi.provision).mockResolvedValue({
      cmsUserId: 'user-new',
      status: 'PENDING_SETUP',
      replayed: false,
      deliveryMode: 'RETURN_ONCE',
      initialAccessSecret: 'lia_one_time',
      expiresAt: '2026-07-22T10:00:00.000Z',
    })
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.findAll('button').find((button) => button.text().includes('Создать CMS User'))!.trigger('click')
    await flushPromises()

    const page = wrapper.vm as unknown as {
      createForm: {
        email: string
        givenName: string
        familyName: string
        deliveryMode: 'RETURN_ONCE'
        assignments: Array<{ projectId: string; roleIds: string[] }>
      }
      selectAssignmentProject(index: number, projectId: string): Promise<void>
      submitProvisioning(): Promise<void>
    }
    page.createForm.email = 'anna@example.com'
    page.createForm.givenName = 'Анна'
    page.createForm.familyName = 'Орлова'
    page.createForm.deliveryMode = 'RETURN_ONCE'
    await page.selectAssignmentProject(0, 'project-1')
    page.createForm.assignments[0]!.roleIds = ['role-1']
    await page.submitProvisioning()
    await flushPromises()

    expect(cmsUserManagementApi.provision).toHaveBeenCalledWith(
      {
        email: 'anna@example.com',
        givenName: 'Анна',
        familyName: 'Орлова',
        deliveryMode: 'RETURN_ONCE',
        projectAssignments: [{ projectId: 'project-1', roleIds: ['role-1'] }],
      },
      expect.any(String),
    )
    const secret = wrapper.find('initial-access-secret-dialog-stub')
    expect(secret.attributes('secret')).toBe('lia_one_time')
    expect(cmsUserManagementApi.list).toHaveBeenCalledTimes(2)
  })

  it('creates a platform-only CMS User without project assignments', async () => {
    vi.mocked(cmsUserManagementApi.provision).mockResolvedValue({
      cmsUserId: 'platform-user-new',
      status: 'PENDING_SETUP',
      replayed: false,
      deliveryMode: 'EMAIL_LINK',
      expiresAt: '2026-07-22T10:00:00.000Z',
    })
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.findAll('button').find((button) => button.text().includes('Создать CMS User'))!.trigger('click')
    await flushPromises()

    const page = wrapper.vm as unknown as {
      createForm: {
        email: string
        givenName: string
        familyName: string
        assignments: Array<{ projectId: string; roleIds: string[] }>
      }
      removeAssignment(index: number): void
      submitProvisioning(): Promise<void>
    }
    page.createForm.email = 'operator@example.com'
    page.createForm.givenName = 'Ольга'
    page.createForm.familyName = 'Операторова'
    page.removeAssignment(0)
    await page.submitProvisioning()
    await flushPromises()

    expect(page.createForm.assignments).toEqual([])
    expect(cmsUserManagementApi.provision).toHaveBeenCalledWith(
      {
        email: 'operator@example.com',
        givenName: 'Ольга',
        familyName: 'Операторова',
        deliveryMode: 'EMAIL_LINK',
        projectAssignments: [],
      },
      expect.any(String),
    )
  })

  it('keeps deterministic provisioning errors retryable', async () => {
    vi.mocked(cmsUserManagementApi.provision)
      .mockRejectedValueOnce(
        new ApiError(
          409,
          'unsafe backend text',
          undefined,
          undefined,
          'EMAIL_ALREADY_IN_USE',
        ),
      )
      .mockResolvedValueOnce({
        cmsUserId: 'platform-user-new',
        status: 'PENDING_SETUP',
        replayed: false,
        deliveryMode: 'EMAIL_LINK',
        expiresAt: '2026-07-22T10:00:00.000Z',
      })
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.findAll('button').find((button) => button.text().includes('Создать CMS User'))!.trigger('click')
    await flushPromises()

    const page = wrapper.vm as unknown as {
      createForm: {
        email: string
        givenName: string
        familyName: string
        assignments: Array<{ projectId: string; roleIds: string[] }>
      }
      provisioningOutcomeUnknown: boolean
      removeAssignment(index: number): void
      submitProvisioning(): Promise<void>
    }
    page.createForm.email = 'existing@example.com'
    page.createForm.givenName = 'Анна'
    page.createForm.familyName = 'Орлова'
    page.removeAssignment(0)

    await page.submitProvisioning()
    await flushPromises()

    expect(page.provisioningOutcomeUnknown).toBe(false)
    expect(wrapper.text()).toContain('Этот email уже используется.')
    expect(wrapper.text()).not.toContain('unsafe backend text')

    await page.submitProvisioning()
    await flushPromises()
    expect(cmsUserManagementApi.provision).toHaveBeenCalledTimes(2)
  })

  it('loads and replaces platform roles with an optimistic version and audit reason', async () => {
    vi.mocked(cmsUserManagementApi.replacePlatformRoles).mockResolvedValue({
      cmsUserId: summary.id,
      version: 4,
      roleIds: [],
      roleKeys: [],
      effectivePermissionCodes: [],
    })
    const wrapper = mountPage()
    await flushPromises()
    wrapper.getComponent(DataTable).vm.$emit('row-click', { data: summary })
    await flushPromises()

    expect(cmsUserManagementApi.platformRoles).toHaveBeenCalledOnce()
    expect(cmsUserManagementApi.platformRoleAssignment).toHaveBeenCalledWith(summary.id)
    await wrapper.get('[data-testid="edit-platform-roles"]').trigger('click')
    const page = wrapper.vm as unknown as {
      selectedPlatformRoleIds: string[]
      platformRoleReason: string
      submitPlatformRoles(): Promise<void>
    }
    page.selectedPlatformRoleIds = []
    page.platformRoleReason = '  Одобрено службой безопасности  '
    await page.submitPlatformRoles()
    await flushPromises()

    expect(cmsUserManagementApi.replacePlatformRoles).toHaveBeenCalledWith(
      summary.id,
      3,
      [],
      'Одобрено службой безопасности',
    )
    expect(wrapper.text()).toContain('Роли не назначены')
  })

  it('does not replay platform-role changes after conflicts or required step-up', async () => {
    vi.mocked(cmsUserManagementApi.replacePlatformRoles)
      .mockRejectedValueOnce(new ApiError(409, 'SECRET INTERNAL', undefined, undefined, 'VERSION_CONFLICT'))
      .mockRejectedValueOnce(new ApiError(428, 'SECRET INTERNAL', undefined, undefined, 'REAUTHENTICATION_REQUIRED'))
      .mockRejectedValueOnce(new ApiError(409, 'SECRET INTERNAL', undefined, undefined, 'LAST_PLATFORM_OPERATOR'))
    const wrapper = mountPage()
    await flushPromises()
    wrapper.getComponent(DataTable).vm.$emit('row-click', { data: summary })
    await flushPromises()
    const page = wrapper.vm as unknown as {
      selectedPlatformRoleIds: string[]
      platformRoleReason: string
      submitPlatformRoles(): Promise<void>
    }

    for (const expected of [
      'Роли уже изменились',
      'Требуется свежий вход',
      'последнего активного Platform Operator',
    ]) {
      await wrapper.get('[data-testid="edit-platform-roles"]').trigger('click')
      page.selectedPlatformRoleIds = []
      page.platformRoleReason = 'Одобрено службой безопасности'
      await page.submitPlatformRoles()
      await flushPromises()
      expect(wrapper.text()).toContain(expected)
      expect(wrapper.text()).not.toContain('SECRET INTERNAL')
    }
    expect(cmsUserManagementApi.replacePlatformRoles).toHaveBeenCalledTimes(3)
  })
})
