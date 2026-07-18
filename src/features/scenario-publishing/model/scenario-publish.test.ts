import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/shared/api/http/api-error'

import { createScenarioPublishStateMachine } from './scenario-publish'

const request = {
  catalogRevision: 'catalog-1', expectedCurrentRevisionId: null, deliveryPolicy: { kind: 'IMMEDIATE' as const },
  rule: { version: 1 as const, root: { kind: 'all' as const, children: [] } },
}
const response = {
  revision: { id: 'revision-1', scenarioId: 'scenario-1', revisionNumber: 1, catalogRevision: 'catalog-1', contentHash: 'hash-1', publishedAt: '2026-07-18T10:00:00.000Z', triggerEventDefinitionRevisionId: 'event-1' },
  dependencies: { actionTypes: ['SAY'], conditionPaths: [], eventDefinitionRevisionIds: ['event-1'] },
  cost: { class: 'LOW' as const, leaves: 0, aggregateLeaves: 0, historyWindowDays: 0 },
  warnings: [], deliveryPolicy: { kind: 'IMMEDIATE' as const },
  conflictMetadata: { currentRevisionId: 'revision-1', expectedCurrentRevisionId: null },
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise })
  return { promise, resolve }
}

describe('Scenario publish state machine', () => {
  it('prevents double submit and stores the immutable revision returned by backend', async () => {
    const pending = deferred<typeof response>()
    const execute = vi.fn(() => pending.promise)
    const machine = createScenarioPublishStateMachine(execute)

    const first = machine.publish(request)
    const second = machine.publish(request)
    expect(execute).toHaveBeenCalledTimes(1)
    expect(machine.getState()).toEqual({ status: 'pending' })

    pending.resolve(response)
    await Promise.all([first, second])
    expect(machine.getState()).toEqual({ status: 'published', response, currentRevisionId: 'revision-1' })
  })

  it('preserves the exact draft request and exposes the current head after a 409', async () => {
    const conflict = new ApiError(409, 'Revision conflict', { currentRevisionId: 'revision-2', expectedCurrentRevisionId: 'revision-1' }, undefined, 'SCENARIO_REVISION_CONFLICT')
    const machine = createScenarioPublishStateMachine(vi.fn().mockRejectedValue(conflict))

    await machine.publish({ ...request, expectedCurrentRevisionId: 'revision-1' })

    expect(machine.getState()).toEqual({
      status: 'conflict', kind: 'head', error: conflict, draft: { ...request, expectedCurrentRevisionId: 'revision-1' }, currentRevisionId: 'revision-2',
    })
  })

  it('distinguishes a stale catalog and keeps the exact request for recovery', async () => {
    const conflict = new ApiError(409, 'Catalog stale', { expectedCatalogRevision: 'catalog-1', currentCatalogRevision: 'catalog-2' }, undefined, 'CATALOG_REVISION_STALE')
    const machine = createScenarioPublishStateMachine(vi.fn().mockRejectedValue(conflict))

    await machine.publish(request)

    expect(machine.getState()).toEqual({
      status: 'conflict', kind: 'catalog', error: conflict, draft: request, currentCatalogRevision: 'catalog-2',
    })
  })

  it('keeps a durable draft conflict distinct from a published head conflict', async () => {
    const conflict = new ApiError(409, 'Draft stale', { expectedDraftVersion: 1, currentDraftVersion: 2 }, undefined, 'SCENARIO_DRAFT_CONFLICT')
    const machine = createScenarioPublishStateMachine(vi.fn().mockRejectedValue(conflict))

    await machine.publish({ ...request, expectedDraftVersion: 1 })

    expect(machine.getState()).toEqual({
      status: 'conflict', kind: 'draft', error: conflict, draft: { ...request, expectedDraftVersion: 1 },
    })
  })
})
