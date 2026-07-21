import { flushPromises, shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import UserWorkspaceDialog from '@/features/end-user-workspace/UserWorkspaceDialog.vue'
import LivePage from './LivePage.vue'

const mocks = vi.hoisted(() => ({ getSessions: vi.fn() }))
vi.mock('@/features/auth/auth.store', () => ({
  useAuthStore: () => ({ project: { id: 'project-1' } }),
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
  userName: 'Анна',
  device: 'Web',
  status: 'ONLINE' as const,
  startedAt: '2026-07-20T12:00:00.000Z',
  lastSeenAt: '2026-07-20T13:00:00.000Z',
  connectionCount: 1,
}

describe('страница активных сессий', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSessions.mockResolvedValue([session])
  })

  it('открывает общий workspace доступной кнопкой диалога', async () => {
    const wrapper = shallowMount(LivePage)
    await flushPromises()

    await wrapper.get('.session-open-overlay').trigger('click')

    expect(wrapper.getComponent(UserWorkspaceDialog).props()).toMatchObject({
      visible: true,
      projectId: 'project-1',
      endUserId: 'user-1',
      externalUserId: 'customer-1',
    })
  })

  it('оставляет отдельное меню действий и не открывает его вместо диалога', async () => {
    const wrapper = shallowMount(LivePage)
    await flushPromises()
    const actions = wrapper.get('button-stub[label="Действия"]')
    await actions.trigger('click')
    await flushPromises()
    expect(wrapper.getComponent(UserWorkspaceDialog).props('visible')).toBe(
      false,
    )
  })
})
