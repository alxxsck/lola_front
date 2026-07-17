import { flushPromises, shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OperationsPage from './OperationsPage.vue'

const mocks = vi.hoisted(() => ({
  getEventLogs: vi.fn(),
  getScenarioRuns: vi.fn(),
  getAuditLogs: vi.fn(),
}))

vi.mock('@/features/auth/auth.store', () => ({
  useAuthStore: () => ({ project: { id: 'project-1' } }),
}))

vi.mock('@/shared/api/repository', () => ({
  repository: {
    mode: 'api',
    getEventLogs: mocks.getEventLogs,
    getScenarioRuns: mocks.getScenarioRuns,
    getAuditLogs: mocks.getAuditLogs,
  },
}))

describe('OperationsPage event pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getEventLogs.mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 12, total: 37, totalPages: 4, hasNextPage: true, hasPreviousPage: false },
    })
    mocks.getScenarioRuns.mockResolvedValue([])
    mocks.getAuditLogs.mockResolvedValue([])
  })

  it('loads numbered event pages and exposes the server total to the paginator', async () => {
    const wrapper = shallowMount(OperationsPage)
    await flushPromises()

    expect(mocks.getEventLogs).toHaveBeenCalledWith('project-1', { page: 1, limit: 12 })
    const table = wrapper.findComponent('data-table-stub') as unknown as {
      attributes: (name?: string) => string | Record<string, string>
      vm: { $emit: (event: string, value: unknown) => void }
    }
    expect(table.attributes()).toHaveProperty('lazy')
    expect(table.attributes('total-records')).toBe('37')
    expect(table.attributes('current-page-report-template')).toContain('{totalRecords}')

    table.vm.$emit('page', { page: 2, rows: 12 })
    await flushPromises()

    expect(mocks.getEventLogs).toHaveBeenLastCalledWith('project-1', { page: 3, limit: 12 })
  })

  it('resets to page one and sends filters to the backend', async () => {
    vi.useFakeTimers()
    const wrapper = shallowMount(OperationsPage)
    await flushPromises()

    const search = wrapper.findComponent('input-text-stub') as unknown as { vm: { $emit: (event: string, value: unknown) => void } }
    const status = wrapper.findComponent('select-stub') as unknown as { vm: { $emit: (event: string, value: unknown) => void } }
    search.vm.$emit('update:modelValue', ' deposit ')
    status.vm.$emit('update:modelValue', 'FAILED')
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()

    expect(mocks.getEventLogs).toHaveBeenLastCalledWith('project-1', {
      page: 1,
      limit: 12,
      search: 'deposit',
      status: 'FAILED',
    })

    const tabs = wrapper.findAll('.section-tabs button')
    await tabs[1]!.trigger('click')
    await tabs[0]!.trigger('click')
    await vi.advanceTimersByTimeAsync(0)
    await flushPromises()

    expect(mocks.getEventLogs).toHaveBeenLastCalledWith('project-1', { page: 1, limit: 12 })
    vi.useRealTimers()
  })
})
