import { flushPromises, shallowMount } from '@vue/test-utils'
import Button from 'primevue/button'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OverviewPage from './OverviewPage.vue'

const mocks = vi.hoisted(() => ({
  getStats: vi.fn(),
  getEventLogPage: vi.fn(),
  auth: {
    project: {
      id: 'project-1',
      name: 'Lola',
      assistantName: 'Lola',
      effectivePermissionCodes: [] as string[],
    },
    user: { name: 'Алексей' },
  },
}))

vi.mock('@/features/auth/auth.store', () => ({
  useAuthStore: () => mocks.auth,
}))

vi.mock('@/shared/api/repository', () => ({
  repository: {
    mode: 'api',
    capabilities: { presence: false },
    getStats: mocks.getStats,
    getEventLogPage: mocks.getEventLogPage,
  },
}))

function mountOverview() {
  return shallowMount(OverviewPage, {
    global: {
      stubs: {
        RouterLink: { props: ['to'], template: '<a :data-to="to"><slot /></a>' },
        Message: { template: '<div><slot /></div>' },
      },
    },
  })
}

describe('OverviewPage activity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth.project.effectivePermissionCodes = [
      'project.settings.read',
      'project.end_users.read',
      'project.conversations.read',
      'project.event_logs.read',
      'project.scenarios.read',
      'project.scenarios.write',
      'project.scenario_runs.read',
      'project.event_catalog.write',
      'project.ui_registry.write',
    ]
    mocks.getStats.mockResolvedValue({ users: 1, online: 0, events: 1, scenarios: 0, conversations: 0, ctaConversion: 0, integrationErrors: 0 })
    mocks.getEventLogPage.mockResolvedValue({ items: [], nextCursor: null })
  })

  it('fills the project feed from the event log endpoint', async () => {
    const wrapper = mountOverview()
    await flushPromises()

    expect(mocks.getEventLogPage).toHaveBeenCalledWith('project-1', { limit: 6 })
    expect(wrapper.get('.section-link').attributes('data-to')).toBe('/event-logs')
  })

  it('shows the loading and empty activity states', async () => {
    const wrapper = mountOverview()

    expect(wrapper.findAll('.activity-skeleton')).toHaveLength(4)

    await flushPromises()

    expect(wrapper.get('.empty').text()).toContain('Активность появится после первых событий')
  })

  it('shows a load error and retries the dashboard request', async () => {
    mocks.getStats.mockReset()
      .mockRejectedValueOnce(new Error('Сбой обзора'))
      .mockResolvedValue({ users: 1, online: 0, events: 1, scenarios: 0, conversations: 0, ctaConversion: 0, integrationErrors: 0 })
    const wrapper = mountOverview()
    await flushPromises()

    expect(wrapper.text()).toContain('Сбой обзора')

    await wrapper.getComponent(Button).trigger('click')
    await flushPromises()

    expect(mocks.getStats).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).not.toContain('Сбой обзора')
  })

  it('does not render dashboard links or load activity outside exact Permissions', async () => {
    mocks.auth.project.effectivePermissionCodes = ['project.knowledge.read']

    const wrapper = mountOverview()
    await flushPromises()

    expect(mocks.getStats).toHaveBeenCalledWith('project-1', ['project.knowledge.read'])
    expect(mocks.getEventLogPage).not.toHaveBeenCalled()
    expect(wrapper.findAll('[data-to="/event-logs"]')).toHaveLength(0)
    expect(wrapper.findAll('[data-to="/events"]')).toHaveLength(0)
    expect(wrapper.findAll('[data-to="/scenarios"]')).toHaveLength(0)
    expect(wrapper.findAll('[data-to="/interface"]')).toHaveLength(0)
    expect(wrapper.findAll('[data-to="/operations"]')).toHaveLength(0)
    expect(wrapper.findAll('[data-to="/project"]')).toHaveLength(0)
  })
})
