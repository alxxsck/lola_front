import { describe, expect, it } from 'vitest'

import type { ConditionCatalogResponseDto } from '@/shared/api/generated/models'

import { adaptScenarioAuthoringContract } from './index'

const catalog = (aggregations: ConditionCatalogResponseDto['events'][number]['fields'][number]['aggregations']): ConditionCatalogResponseDto => ({
  projectId: 'project-1',
  revision: 'catalog-revision-1',
  version: 1,
  localization: { version: 1, enabled: false, attributeKey: null, attributeContractRevision: null, defaultLocale: '', locales: [], policyModes: ['ALL_PROJECT_LOCALES', 'SELECTED_LOCALES'], localizedValueSchemaVersion: 1, paths: [] },
  translation: { enabled: false, supportedSourceLocales: [], supportedTargetLocales: [], maxBatchCharacters: 50_000 },
  events: [{
    code: 'deposit.succeeded',
    definitionId: 'event-revision-1',
    definitionKeyId: 'event-key-1',
    name: 'Deposit succeeded',
    schemaVersion: 1,
    capabilities: { eventMeasures: [{ measure: 'exists', resultType: 'boolean' }, { measure: 'count', resultType: 'integer' }] },
    fields: [{
      aggregations,
      control: { type: 'number' },
      capabilities: {
        currentEvent: { operators: ['eq', 'gte', 'not_exists'] },
        aggregateFilter: { operators: ['eq'] },
        aggregateMeasure: { measures: aggregations, resultType: 'number' },
      },
      display: { scale: 0.01, precision: 2, conversion: 'MULTIPLY' },
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
    const contract = adaptScenarioAuthoringContract(catalog(['sum', 'first']))

    expect(contract.events[0]?.aggregateMeasures).toEqual([
      { measure: 'exists', field: 'none', resultType: 'boolean', compareValueType: 'boolean', compareOperators: ['eq', 'neq'] },
      { measure: 'count', field: 'none', resultType: 'integer', compareValueType: 'integer', compareOperators: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'] },
      { measure: 'sum', field: 'required', resultType: 'field', compareValueType: 'field', compareOperators: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'] },
      { measure: 'first', field: 'required', resultType: 'field', compareValueType: 'field', compareOperators: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'] },
    ])
    expect(contract.events[0]?.fields[0]?.capabilities).toEqual({
      eventField: { operators: ['eq', 'gte', 'not_exists'] },
      aggregateFilter: { operators: ['eq'] },
      aggregateMeasure: { measures: ['sum', 'first'], resultType: 'number' },
    })
    expect(contract.events[0]?.fields[0]?.display).toEqual({ scale: 0.01, precision: 2, conversion: 'MULTIPLY' })
  })
})
