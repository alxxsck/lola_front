import { flushPromises, shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LivePage from './LivePage.vue'

const mocks = vi.hoisted(() => ({
  permissions: ['project.end_users.read'] as string[],
  getSessions: vi.fn(),
}))

vi.mock('@/features/auth/auth.store', () => ({
  useAuthStore: () => ({
    project: {
      id: 'project-1',
      get effectivePermissionCodes() { return mocks.permissions },
    },
  }),
}))
vi.mock('@/shared/api/repository', () => ({
  repository: {
    capabilities: { presence: true },
    getSessions: mocks.getSessions,
  },
}))

const session = {
  id: 'session-1',
  userId: 'user-1',
  externalId: 'customer-1',
  userName: 'Customer',
  device: 'Web',
  status: 'ONLINE' as const,
  startedAt: '2026-07-21T10:00:00.000Z',
  lastSeenAt: '2026-07-21T10:00:00.000Z',
}

describe('LivePage permission composition', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.permissions = ['project.end_users.read']
    mocks.getSessions.mockResolvedValue([session])
  })

  it('shows presence but no conversation or reply controls to an end-users-only reader', async () => {
    const wrapper = shallowMount(LivePage)
    await flushPromises()

    expect(mocks.getSessions).toHaveBeenCalledWith('project-1')
    expect(wrapper.find('.session-open-overlay').exists()).toBe(false)
    expect(wrapper.find('button-stub[label="Открыть диалог"]').exists()).toBe(false)
    expect(wrapper.find('button-stub[label="Действия"]').exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'UserWorkspaceDialog' }).exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'SendActionDialog' }).exists()).toBe(false)
  })

  it('enables each composed surface only when its exact authority exists', async () => {
    mocks.permissions = [
      'project.end_users.read',
      'project.conversations.read',
      'project.conversations.reply',
      'project.ui_registry.read',
    ]
    const wrapper = shallowMount(LivePage)
    await flushPromises()

    expect(wrapper.find('.session-open-overlay').exists()).toBe(true)
    expect(wrapper.find('button-stub[label="Открыть диалог"]').exists()).toBe(true)
    expect(wrapper.find('button-stub[label="Действия"]').exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'UserWorkspaceDialog' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'SendActionDialog' }).props('canReadTargets')).toBe(true)
  })
})
