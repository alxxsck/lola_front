import { flushPromises, shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import EventDefinitionHistory from './EventDefinitionHistory.vue'

const mocks = vi.hoisted(() => ({
  page: vi.fn(),
  detail: vi.fn(),
}))

vi.mock('@/shared/api/repository', () => ({
  repository: {
    getEventDefinitionRevisions: mocks.page,
    getEventDefinitionRevision: mocks.detail,
  },
}))

const event = {
  id: 'revision-2', definitionKeyId: 'event-key-1', currentRevisionId: 'revision-2', isCurrent: true,
  projectId: 'project-1', code: 'deposit.succeeded', name: 'Deposit', version: 2,
  origin: 'CUSTOM' as const, readOnly: false, payloadSchema: {}, clientIngestible: false,
  countsAsActivity: true, enabled: true,
}

describe('EventDefinitionHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.page
      .mockResolvedValueOnce({
        items: [{ ...event, pinnedScenarioRevisionCount: 3, compatibility: 'PINNED' }],
        nextCursor: 'revision-1',
      })
      .mockResolvedValueOnce({
        items: [{ ...event, id: 'revision-1', version: 1, isCurrent: false, pinnedScenarioRevisionCount: 0, compatibility: 'SUPERSEDED' }],
        nextCursor: null,
      })
    mocks.detail.mockResolvedValue({ ...event, pinnedScenarioRevisionCount: 3, compatibility: 'PINNED' })
  })

  it('loads revision history by stable definition identity, pages it and opens pinned detail', async () => {
    const wrapper = shallowMount(EventDefinitionHistory, {
      props: { projectId: 'project-1', event },
      global: { stubs: { Dialog: { template: '<div><slot /></div>' } } },
    })

    await wrapper.find('button-stub[label="История"]').trigger('click')
    await flushPromises()

    expect(mocks.page).toHaveBeenCalledWith('project-1', 'event-key-1', { limit: 25 })
    expect(wrapper.text()).toContain('3 публикации сценариев')

    await wrapper.find('[data-testid="event-revision-detail"]').trigger('click')
    await flushPromises()
    expect(mocks.detail).toHaveBeenCalledWith('project-1', 'event-key-1', 'revision-2')
    expect(wrapper.findAll('tag-stub').some((tag) => tag.attributes('value') === 'Используется публикациями')).toBe(true)

    await wrapper.find('button-stub[label="Загрузить ещё"]').trigger('click')
    await flushPromises()
    expect(mocks.page).toHaveBeenLastCalledWith('project-1', 'event-key-1', { limit: 25, cursor: 'revision-1' })
    expect(wrapper.text()).toContain('v1')
  })
})
