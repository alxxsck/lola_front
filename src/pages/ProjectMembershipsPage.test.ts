import { flushPromises, shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProjectMembershipsPage from './ProjectMembershipsPage.vue'
import { projectMembershipApi } from '@/features/project-memberships/api/project-membership.api'
import { ApiError } from '@/shared/api/http/api-error'

const projectId = '00000000-0000-4000-8000-000000000010'
const currentUserId = '00000000-0000-4000-8000-000000000020'
const roleId = '00000000-0000-4000-8000-000000000030'

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  auth: {
    user: {
      id: '00000000-0000-4000-8000-000000000020',
      email: 'owner@example.com',
      name: 'Owner',
      platformPermissionCodes: [
        'platform.memberships.read',
        'platform.memberships.manage',
      ],
    },
    project: {
      id: '00000000-0000-4000-8000-000000000010',
      effectivePermissionCodes: [
        'project.members.read',
        'project.members.manage',
      ],
    } as { id: string; effectivePermissionCodes: string[] } | null,
    refreshContext: vi.fn(),
    logout: vi.fn(),
  },
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ replace: mocks.replace }),
}))
vi.mock('@/features/auth/auth.store', () => ({
  useAuthStore: () => mocks.auth,
}))
vi.mock('@/features/project-memberships/api/project-membership.api', () => ({
  projectMembershipApi: {
    list: vi.fn(),
    roles: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}))

const createdMembership = {
  id: 'membership-1',
  projectId,
  cmsUser: {
    id: currentUserId,
    email: 'owner@example.com',
    givenName: 'Olga',
    familyName: 'Owner',
    displayName: 'Olga Owner',
    status: 'ACTIVE' as const,
    emailVerified: true,
    lastLoginAt: null,
  },
  status: 'ACTIVE' as const,
  version: 1,
  roles: [
    {
      id: roleId,
      key: 'PROJECT_ADMIN',
      name: 'Project Admin',
      managed: true,
      version: 1,
    },
  ],
  effectivePermissionCodes: ['project.members.read'],
  createdAt: '2026-07-21T10:00:00.000Z',
  updatedAt: '2026-07-21T10:00:00.000Z',
  removedAt: null,
}

function mountPage() {
  return shallowMount(ProjectMembershipsPage, {
    global: {
      stubs: {
        Button: {
          inheritAttrs: false,
          props: ['label', 'disabled'],
          emits: ['click'],
          template:
            '<button v-bind="$attrs" :disabled="disabled" @click="$emit(\'click\')"><slot />{{ label }}</button>',
        },
        Column: true,
        DataTable: {
          props: ['value'],
          template: '<div data-testid="membership-count">{{ value.length }}</div>',
        },
        Dialog: {
          props: ['visible'],
          template:
            '<section v-if="visible"><slot /><slot name="footer" /></section>',
        },
        InputText: {
          inheritAttrs: false,
          props: ['modelValue'],
          emits: ['update:modelValue'],
          template:
            '<input v-bind="$attrs" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)">',
        },
        Message: { template: '<div><slot /></div>' },
        MultiSelect: {
          inheritAttrs: false,
          props: ['modelValue'],
          emits: ['update:modelValue'],
          template:
            '<button v-bind="$attrs" type="button" @click="$emit(\'update:modelValue\', [\'00000000-0000-4000-8000-000000000030\'])">Выбрать роль</button>',
        },
        Select: true,
        Skeleton: true,
        Tag: true,
        Textarea: {
          inheritAttrs: false,
          props: ['modelValue'],
          emits: ['update:modelValue'],
          template:
            '<textarea v-bind="$attrs" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
        },
      },
    },
  })
}

async function submitSelfMutation(wrapper: ReturnType<typeof mountPage>) {
  await wrapper.get('[data-testid="add-membership"]').trigger('click')
  await wrapper.get('[data-testid="cms-user-id"]').setValue(currentUserId)
  await wrapper.get('[data-testid="membership-roles"]').trigger('click')
  await wrapper
    .get('[data-testid="membership-reason"]')
    .setValue('  Назначение подтверждено владельцем  ')
  await wrapper.get('[data-testid="submit-membership"]').trigger('click')
  await flushPromises()
}

describe('Project Memberships page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth.user.platformPermissionCodes = [
      'platform.memberships.read',
      'platform.memberships.manage',
    ]
    mocks.auth.project = {
      id: projectId,
      effectivePermissionCodes: [
        'project.members.read',
        'project.members.manage',
      ],
    }
    vi.mocked(projectMembershipApi.list).mockResolvedValue({
      items: [],
      nextCursor: null,
    })
    vi.mocked(projectMembershipApi.roles).mockResolvedValue({
      items: [
        {
          id: roleId,
          key: 'PROJECT_ADMIN',
          name: 'Project Admin',
          description: 'Manages the Project',
          managed: true,
          permissionCodes: ['project.members.read'],
          version: 1,
        },
      ],
    })
    vi.mocked(projectMembershipApi.create).mockResolvedValue(createdMembership)
    mocks.auth.refreshContext.mockResolvedValue(undefined)
    mocks.auth.logout.mockResolvedValue(undefined)
  })

  it('keeps attach Platform-only even when Project membership management is available', async () => {
    mocks.auth.user.platformPermissionCodes = []
    const wrapper = mountPage()
    await flushPromises()

    expect(projectMembershipApi.list).toHaveBeenCalledWith(projectId, {
      limit: 50,
    })
    expect(wrapper.find('[data-testid="add-membership"]').exists()).toBe(false)
  })

  it('creates through the generated contract and refreshes self authority after commit', async () => {
    const wrapper = mountPage()
    await flushPromises()
    await submitSelfMutation(wrapper)

    expect(projectMembershipApi.create).toHaveBeenCalledWith(projectId, {
      cmsUserId: currentUserId,
      roleIds: [roleId],
      reason: 'Назначение подтверждено владельцем',
    })
    expect(mocks.auth.refreshContext).toHaveBeenCalledOnce()
  })

  it('formats email verification and last login for the member table', async () => {
    const wrapper = mountPage()
    await flushPromises()
    const page = wrapper.vm as unknown as {
      emailVerificationLabel(verified: boolean): string
      lastLoginLabel(value: string | null): string
    }

    expect(page.emailVerificationLabel(true)).toBe('Email подтверждён')
    expect(page.emailVerificationLabel(false)).toBe('Email не подтверждён')
    expect(page.lastLoginLabel(null)).toBe('Последний вход: ещё не было')
    expect(page.lastLoginLabel('2026-07-21T10:00:00.000Z')).toContain(
      'Последний вход:',
    )
  })

  it('clears cached identities and redirects after a successful self-removal refresh', async () => {
    vi.mocked(projectMembershipApi.list).mockResolvedValue({
      items: [createdMembership],
      nextCursor: null,
    })
    mocks.auth.refreshContext.mockImplementation(async () => {
      mocks.auth.project = null
    })
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.get('[data-testid="membership-count"]').text()).toBe('1')

    await submitSelfMutation(wrapper)

    expect(wrapper.get('[data-testid="membership-count"]').text()).toBe('0')
    expect(mocks.replace).toHaveBeenCalledWith({ name: 'overview' })
  })

  it('clears cached identities and redirects after a successful self-downgrade removes read access', async () => {
    vi.mocked(projectMembershipApi.list).mockResolvedValue({
      items: [createdMembership],
      nextCursor: null,
    })
    mocks.auth.refreshContext.mockImplementation(async () => {
      mocks.auth.user.platformPermissionCodes = []
      mocks.auth.project = {
        id: projectId,
        effectivePermissionCodes: ['project.members.manage'],
      }
    })
    const wrapper = mountPage()
    await flushPromises()

    await submitSelfMutation(wrapper)

    expect(wrapper.get('[data-testid="membership-count"]').text()).toBe('0')
    expect(mocks.replace).toHaveBeenCalledWith({ name: 'overview' })
  })

  it('offers a fresh login after step-up denial without replaying the membership mutation', async () => {
    vi.mocked(projectMembershipApi.create).mockRejectedValue(
      new ApiError(401, 'unsafe backend text', undefined, 'step-up-request', 'MFA_REQUIRED'),
    )
    const wrapper = mountPage()
    await flushPromises()
    await submitSelfMutation(wrapper)

    expect(wrapper.text()).toContain('Требуется свежий вход с MFA')
    expect(wrapper.text()).not.toContain('unsafe backend text')
    expect(projectMembershipApi.create).toHaveBeenCalledOnce()

    await wrapper.get('[data-testid="membership-step-up"]').trigger('click')
    await flushPromises()
    expect(mocks.auth.logout).toHaveBeenCalledOnce()
    expect(mocks.replace).toHaveBeenCalledWith({
      name: 'login',
      query: { redirect: '/project/memberships' },
    })
    expect(projectMembershipApi.create).toHaveBeenCalledOnce()
  })
})
