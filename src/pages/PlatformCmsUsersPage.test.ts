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
        'platform.cms_users.update',
        'platform.cms_users.deactivate',
        'platform.cms_users.reactivate',
        'platform.cms_users.reset_credentials',
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
  })

  it('opens a separate control-plane detail and renders actions from exact Permissions', async () => {
    const wrapper = mountPage()
    await flushPromises()

    wrapper.getComponent(DataTable).vm.$emit('row-click', { data: summary })
    await flushPromises()

    expect(cmsUserManagementApi.get).toHaveBeenCalledWith(summary.id)
    expect(mocks.replace).toHaveBeenCalledWith({
      name: 'platform-cms-users',
      params: { cmsUserId: summary.id },
    })
    expect(wrapper.text()).toContain('Анна Орлова')
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
})
