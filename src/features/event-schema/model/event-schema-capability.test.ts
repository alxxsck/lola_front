import { describe, expect, it } from 'vitest'

import type { ScenarioAuthoringEvent } from '@/shared/api/repository/scenario-authoring'
import { findCatalogEventForDefinition, findCatalogFieldForDraft, summarizeEventFieldCapability } from './event-schema-capability'

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

  it('never inherits capabilities by path when stable field identities disagree', () => {
    const field = {
      fieldKey: 'deposit.amount',
      label: 'Amount',
      path: 'event.payload.amount',
      required: true,
      valueType: 'number',
      control: { type: 'number' as const },
      allowedValues: [],
      semanticType: 'money',
      sensitive: false,
      capabilities: {
        eventField: { operators: ['eq' as const] },
        aggregateFilter: { operators: ['eq' as const] },
        aggregateMeasure: { measures: ['sum' as const] },
      },
    }
    const event = { ...catalogEvent('current-revision'), fields: [field] }

    expect(findCatalogFieldForDraft(event, { fieldKey: 'other.amount', wireKey: 'amount' })).toBeUndefined()
    expect(findCatalogFieldForDraft(event, { wireKey: 'amount' })).toBe(field)
  })

  it('explains current-event and history capabilities as separate contexts', () => {
    const event = catalogEvent('current-revision')
    const field = {
      fieldKey: 'deposit.currency',
      label: 'Currency',
      path: 'event.payload.currency',
      required: true,
      valueType: 'string',
      control: { type: 'select' as const, options: ['EUR'] },
      allowedValues: ['EUR'],
      semanticType: 'currency',
      sensitive: false,
      capabilities: {
        eventField: { operators: ['eq' as const] },
        aggregateFilter: { operators: [] },
        aggregateMeasure: { measures: [] },
      },
    }
    event.fields = [field]

    expect(summarizeEventFieldCapability(field, true).label).toBe('Событие запуска: можно сравнивать · История: пока недоступно')
  })
})
