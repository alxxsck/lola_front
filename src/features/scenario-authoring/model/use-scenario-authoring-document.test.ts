import { describe, expect, it, vi } from 'vitest'

import { useScenarioAuthoringDocument } from './use-scenario-authoring-document'

const mocks = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn() }))
vi.mock('@/shared/api/repository/scenario-authoring', () => ({
  scenarioAuthoringRepository: { getScenarioDocument: mocks.get, saveScenarioDraft: mocks.save },
}))

describe('useScenarioAuthoringDocument', () => {
  it('owns observed draft/head versions and injects them into optimistic writes', async () => {
    mocks.get.mockResolvedValue({
      currentRevisionId: 'revision-4', editable: true, unavailableReason: null,
      draft: { version: 7 }, source: undefined,
    })
    mocks.save.mockResolvedValue({ version: 8 })
    const document = useScenarioAuthoringDocument()

    await document.load('project-1', 'scenario-1')
    await document.save('project-1', 'scenario-1', {
      catalogRevision: 'catalog-2', deliveryPolicy: { kind: 'IMMEDIATE' }, graph: { actions: [] },
    })

    expect(mocks.save).toHaveBeenCalledWith('project-1', 'scenario-1', expect.objectContaining({
      expectedCurrentRevisionId: 'revision-4', expectedDraftVersion: 7,
    }))
    expect(document.currentDraftVersion.value).toBe(8)
  })
})
