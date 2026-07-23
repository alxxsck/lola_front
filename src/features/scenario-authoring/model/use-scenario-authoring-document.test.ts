import { describe, expect, it, vi } from 'vitest'

import {
  restoreScenarioAuthoringSource,
  useScenarioAuthoringDocument,
} from './use-scenario-authoring-document'

const mocks = vi.hoisted(() => ({ create: vi.fn(), get: vi.fn(), save: vi.fn() }))
vi.mock('@/shared/api/repository/scenario-authoring', () => ({
  scenarioAuthoringRepository: {
    createScenario: mocks.create,
    getScenarioDocument: mocks.get,
    saveScenarioDraft: mocks.save,
  },
}))

describe('useScenarioAuthoringDocument', () => {
  it('rejects an authoring source whose graph has no durable nodeKey', () => {
    expect(() => restoreScenarioAuthoringSource({
      graph: {
        actions: [{ position: 0, type: 'SAY', config: { text: 'Hi' } }],
      },
    }, null, null)).toThrow('nodeKey')
  })

  it('adopts the Scenario identity and concurrency versions returned by atomic creation', async () => {
    mocks.create.mockResolvedValue({
      scenarioId: 'scenario-1', currentRevisionId: null, draft: { version: 1 },
    })
    const document = useScenarioAuthoringDocument()
    const request = {
      scenario: {
        code: 'welcome', name: 'Welcome', triggerEventDefinitionRevisionId: 'event-revision-1',
      },
      draft: {
        catalogRevision: 'catalog-1', deliveryPolicy: { kind: 'IMMEDIATE' as const }, graph: { actions: [] },
      },
    }

    await expect(document.create('project-1', request)).resolves.toMatchObject({ scenarioId: 'scenario-1' })
    expect(mocks.create).toHaveBeenCalledWith('project-1', request)
    expect(document.currentRevisionId.value).toBeNull()
    expect(document.currentDraftVersion.value).toBe(1)
  })

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
