import { describe, expect, it } from 'vitest'

import type { ScenarioAuthoringEvent } from '@/shared/api/repository/scenario-authoring'
import { findCatalogEventForDefinition } from './event-schema-capability'

function catalogEvent(definitionId: string): ScenarioAuthoringEvent {
  return {
    code: 'deposit.succeeded',
    definitionId,
    definitionKeyId: 'deposit-key',
    name: 'Deposit',
    schemaVersion: definitionId === 'current-revision' ? 2 : 1,
    fields: [],
    aggregateMeasures: [],
  }
}

describe('event schema catalog capabilities', () => {
  it('binds capabilities by exact definition revision instead of shared event code', () => {
    const contract = { events: [catalogEvent('current-revision')] }

    expect(findCatalogEventForDefinition(contract, 'current-revision')?.definitionId).toBe('current-revision')
    expect(findCatalogEventForDefinition(contract, 'old-revision')).toBeUndefined()
  })
})
