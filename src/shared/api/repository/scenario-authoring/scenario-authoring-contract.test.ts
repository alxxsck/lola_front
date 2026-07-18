import { describe, expect, it, vi } from 'vitest'

import type { ConditionCatalogResponseDto } from '@/shared/api/generated/models'

import { adaptScenarioAuthoringContract } from './index'

const catalog = (aggregations: ConditionCatalogResponseDto['events'][number]['fields'][number]['aggregations']): ConditionCatalogResponseDto => ({
  projectId: 'project-1',
  revision: 'catalog-revision-1',
  version: 1,
  events: [{
    code: 'deposit.succeeded',
    definitionId: 'event-revision-1',
    definitionKeyId: 'event-key-1',
    name: 'Deposit succeeded',
    schemaVersion: 1,
    fields: [{
      aggregations,
      control: { type: 'number' },
      fieldKey: 'deposit.amount',
      label: 'Amount',
      operators: ['eq', 'gte', 'not_exists'],
      path: 'event.payload.amount',
      required: true,
      valueType: 'number',
    }],
  }],
})

describe('scenario authoring contract adapter', () => {
  it('normalizes generated measures and catalog fields into authoring contexts', () => {
    const contract = adaptScenarioAuthoringContract(catalog(['sum', 'distinct_count']))

    expect(contract.events[0]?.aggregateMeasures).toEqual([
      { measure: 'exists', field: 'none', resultType: 'boolean', compareValueType: 'boolean', compareOperators: ['eq', 'neq'] },
      { measure: 'count', field: 'none', resultType: 'integer', compareValueType: 'integer', compareOperators: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'] },
      { measure: 'first', field: 'none', resultType: 'datetime', compareValueType: 'datetime', compareOperators: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'] },
      { measure: 'last', field: 'none', resultType: 'datetime', compareValueType: 'datetime', compareOperators: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'] },
      { measure: 'sum', field: 'required', resultType: 'field', compareValueType: 'field', compareOperators: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'] },
      { measure: 'min', field: 'required', resultType: 'field', compareValueType: 'field', compareOperators: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'] },
      { measure: 'max', field: 'required', resultType: 'field', compareValueType: 'field', compareOperators: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'] },
    ])
    expect(contract.events[0]?.fields[0]?.capabilities).toEqual({
      eventField: { operators: ['eq', 'gte', 'not_exists'] },
      aggregateFilter: { operators: ['eq'] },
      aggregateMeasure: { measures: ['sum'] },
    })
  })

  it('reports the distinct_count contract defect in development', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    adaptScenarioAuthoringContract(catalog(['distinct_count']))

    expect(warning).toHaveBeenCalledWith(expect.stringContaining('BE-FE-09'))
  })
})
