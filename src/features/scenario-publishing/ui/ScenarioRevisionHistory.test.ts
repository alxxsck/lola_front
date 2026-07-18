import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ScenarioRevisionHistory from './ScenarioRevisionHistory.vue'

const mocks = vi.hoisted(() => ({
  getScenarioDocument: vi.fn(),
  getScenarioRevision: vi.fn(),
  getScenarioRevisions: vi.fn(),
  rollbackScenario: vi.fn(),
}))

vi.mock('@/shared/api/repository/scenario-authoring', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/shared/api/repository/scenario-authoring')>(),
  scenarioAuthoringRepository: mocks,
}))

const revision = (id: string, revisionNumber: number, current = false) => ({
  id, scenarioId: 'scenario-1', revisionNumber, contentHash: `hash-${revisionNumber}`,
  catalogRevision: 'catalog-1', publishedAt: `2026-07-1${revisionNumber}T10:00:00.000Z`,
  publishedByAdminId: `admin-${revisionNumber}`, current, editable: true,
})

describe('ScenarioRevisionHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mocks.getScenarioRevisions
      .mockResolvedValueOnce({ items: [revision('revision-3', 3, true), revision('revision-2', 2)], nextCursor: 'revision-2' })
      .mockResolvedValueOnce({ items: [revision('revision-1', 1)], nextCursor: null })
    mocks.getScenarioRevision.mockResolvedValue({
      ...revision('revision-2', 2), source: { catalogRevision: 'catalog-1', deliveryPolicy: { kind: 'IMMEDIATE' }, graph: { actions: [] } }, runtime: {},
    })
    mocks.rollbackScenario.mockResolvedValue(undefined)
    mocks.getScenarioDocument.mockResolvedValue({ currentRevisionId: 'revision-4' })
  })

  it('pages immutable revisions, loads detail and creates a successor rollback from the observed head', async () => {
    const wrapper = mount(ScenarioRevisionHistory, { props: {
      projectId: 'project-1', scenarioId: 'scenario-1', currentRevisionId: 'revision-3',
    } })
    await flushPromises()

    expect(wrapper.text()).toContain('Версия №3')
    expect(wrapper.text()).toContain('admin-3')
    await wrapper.get('button[aria-label="Загрузить более ранние версии"]').trigger('click')
    await flushPromises()
    expect(mocks.getScenarioRevisions).toHaveBeenNthCalledWith(2, 'project-1', 'scenario-1', { limit: 25, cursor: 'revision-2' })
    expect(wrapper.text()).toContain('Версия №1')

    await wrapper.get('button[aria-label="Открыть версию 2"]').trigger('click')
    await flushPromises()
    expect(mocks.getScenarioRevision).toHaveBeenCalledWith('project-1', 'scenario-1', 'revision-2')
    expect(wrapper.text()).toContain('hash-2')

    await wrapper.get('button[aria-label="Откатить к версии 2"]').trigger('click')
    await flushPromises()
    expect(mocks.rollbackScenario).toHaveBeenCalledWith('project-1', 'scenario-1', 'revision-2', 'revision-3')
    expect(wrapper.emitted('head-change')?.at(-1)).toEqual(['revision-4'])
  })
})
