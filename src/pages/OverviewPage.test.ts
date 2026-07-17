import { flushPromises, shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OverviewPage from './OverviewPage.vue'

const mocks = vi.hoisted(() => ({
  getStats: vi.fn(),
  getEventLogPage: vi.fn(),
}))

vi.mock('@/features/auth/auth.store', () => ({
  useAuthStore: () => ({
    project: { id: 'project-1', name: 'Lola', assistantName: 'Lola' },
    user: { name: 'Алексей', role: 'OWNER' },
  }),
}))

vi.mock('@/shared/api/repository', () => ({
  repository: {
    mode: 'api',
    capabilities: { presence: false },
    getStats: mocks.getStats,
    getEventLogPage: mocks.getEventLogPage,
  },
}))

describe('OverviewPage activity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getStats.mockResolvedValue({ users: 1, online: 0, events: 1, scenarios: 0, conversations: 0, ctaConversion: 0, integrationErrors: 0 })
    mocks.getEventLogPage.mockResolvedValue({ items: [], nextCursor: null })
  })

  it('fills the project feed from the event log endpoint', async () => {
    const wrapper = shallowMount(OverviewPage)
    await flushPromises()

    expect(mocks.getEventLogPage).toHaveBeenCalledWith('project-1', { limit: 6 })
    expect(wrapper.get('.section-link').attributes('to')).toBe('/event-logs')
  })
})
