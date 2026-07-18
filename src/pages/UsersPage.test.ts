import { flushPromises, shallowMount } from '@vue/test-utils'
import DataTable from 'primevue/datatable'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EndUser } from '@/shared/types/domain'
import UsersPage from './UsersPage.vue'

const user: EndUser = {
  id: 'user-1',
  projectId: 'project-1',
  externalId: 'customer-1',
  isGuest: false,
  locale: 'ru',
  profile: { name: 'Анна' },
  attributes: {},
  preferences: {},
  lastSeenAt: '2026-07-16T10:00:00.000Z',
  createdAt: '2026-07-15T10:00:00.000Z',
}

const mocks = vi.hoisted(() => ({
  getUsersPage: vi.fn(),
  getSessions: vi.fn(),
  getEventLogPage: vi.fn(),
  getConversations: vi.fn(),
}))

vi.mock('@/features/auth/auth.store', () => ({
  useAuthStore: () => ({ project: { id: 'project-1' } }),
}))

vi.mock('@/shared/api/repository', () => ({
  repository: {
    capabilities: { presence: true, conversations: true, adminMessaging: false },
    getUsersPage: mocks.getUsersPage,
    getSessions: mocks.getSessions,
    getEventLogPage: mocks.getEventLogPage,
    getConversations: mocks.getConversations,
  },
}))

describe('UsersPage activity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUsersPage.mockResolvedValue({ items: [user], nextCursor: null })
    mocks.getSessions.mockResolvedValue([])
    mocks.getEventLogPage.mockResolvedValue({ items: [], nextCursor: null })
    mocks.getConversations.mockResolvedValue({ items: [], nextCursor: null })
  })

  it('requests only the opened user logs instead of loading activity with the table', async () => {
    const wrapper = shallowMount(UsersPage)
    await flushPromises()

    expect(mocks.getEventLogPage).not.toHaveBeenCalled()

    wrapper.getComponent(DataTable).vm.$emit('row-click', { data: user })
    await flushPromises()

    expect(mocks.getEventLogPage).toHaveBeenCalledTimes(1)
    expect(mocks.getEventLogPage).toHaveBeenCalledWith('project-1', {
      externalUserId: 'customer-1',
      limit: 25,
    })
  })

  it('loads users with an opaque cursor and appends the next page', async () => {
    mocks.getUsersPage
      .mockResolvedValueOnce({ items: [user], nextCursor: 'opaque-user-cursor' })
      .mockResolvedValueOnce({ items: [{ ...user, id: 'user-2', externalId: 'customer-2' }], nextCursor: null })
    const wrapper = shallowMount(UsersPage)
    await flushPromises()

    expect(mocks.getUsersPage).toHaveBeenCalledWith('project-1', { limit: 50 })
    await wrapper.find('button-stub[label="Загрузить ещё пользователей"]').trigger('click')
    await flushPromises()

    expect(mocks.getUsersPage).toHaveBeenLastCalledWith('project-1', { limit: 50, cursor: 'opaque-user-cursor' })
    expect(wrapper.text()).toContain('2 пользователей')
  })
})
