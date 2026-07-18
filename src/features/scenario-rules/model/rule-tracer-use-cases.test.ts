import { describe, expect, it } from 'vitest'

import type { ScenarioAuthoringContract } from '@/shared/api/repository/scenario-authoring'

import { deserializeRule, serializeRuleDraft, type RuleDomainContext } from './index'

const day = 86_400_000
const contract: ScenarioAuthoringContract = {
  projectId: 'project-1', revision: 'catalog-tracer', version: 1,
  events: [{
    code: 'page.opened', definitionId: 'page-revision', definitionKeyId: 'page-key', name: 'Открыта страница', schemaVersion: 2,
    aggregateMeasures: [{ measure: 'count', field: 'none', resultType: 'integer', compareValueType: 'integer', compareOperators: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'] }],
    fields: [{ fieldKey: 'page.code', label: 'Страница', path: 'event.payload.page', required: true, valueType: 'string', allowedValues: ['promotions'], control: { type: 'select', options: ['promotions'] }, capabilities: { eventField: { operators: ['eq'] }, aggregateFilter: { operators: ['eq'] }, aggregateMeasure: { measures: [] } } }],
  }, {
    code: 'deposit.completed', definitionId: 'deposit-revision', definitionKeyId: 'deposit-key', name: 'Депозит завершён', schemaVersion: 4,
    aggregateMeasures: [
      { measure: 'count', field: 'none', resultType: 'integer', compareValueType: 'integer', compareOperators: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'] },
      { measure: 'sum', field: 'required', resultType: 'field', compareValueType: 'field', compareOperators: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'] },
    ],
    fields: [{ fieldKey: 'deposit.amount', label: 'Сумма', path: 'event.payload.amount', required: true, valueType: 'number', semanticType: 'money_major', unit: 'EUR', control: { type: 'number' }, capabilities: { eventField: { operators: ['eq', 'gte'] }, aggregateFilter: { operators: ['eq'] }, aggregateMeasure: { measures: ['sum'] } } }, { fieldKey: 'deposit.currency', label: 'Валюта', path: 'event.payload.currency', required: true, valueType: 'string', semanticType: 'currency', allowedValues: ['EUR'], control: { type: 'select', options: ['EUR'] }, capabilities: { eventField: { operators: ['eq'] }, aggregateFilter: { operators: ['eq'] }, aggregateMeasure: { measures: [] } } }],
  }],
}
const context: RuleDomainContext = { triggerEventDefinitionId: 'page-revision', triggerEventCode: 'page.opened', mode: 'initialEligibility', contract }

describe('FE-V2-06 behavioral tracer DTOs', () => {
  it('round-trips current Event, money sum, count, streak and all/any/not composition exactly', () => {
    const dto = { version: 1 as const, root: { kind: 'all' as const, children: [
      { kind: 'eventField' as const, eventCode: 'page.opened', fieldKey: 'page.code', operator: 'eq' as const, value: 'promotions' },
      { kind: 'eventAggregate' as const, eventCode: 'deposit.completed', measure: 'sum' as const, fieldKey: 'deposit.amount', filters: [{ fieldKey: 'deposit.currency', operator: 'eq' as const, value: 'EUR' }], window: { kind: 'last' as const, durationMs: 30 * day, boundary: 'beforeTrigger' as const }, compare: { operator: 'gte' as const, value: '500.25' } },
      { kind: 'any' as const, children: [
        { kind: 'eventAggregate' as const, eventCode: 'deposit.completed', measure: 'count' as const, filters: [], window: { kind: 'last' as const, durationMs: 2 * day, boundary: 'beforeTrigger' as const }, compare: { operator: 'lt' as const, value: '3' } },
        { kind: 'not' as const, child: { kind: 'activityDayStreak' as const, compare: { operator: 'lt' as const, value: 2 } } },
      ] },
    ] } }

    const parsed = deserializeRule(dto, context)
    expect(parsed.issues).toEqual([])
    expect(serializeRuleDraft(parsed.draft, context)).toMatchObject({ ok: true, value: dto })
  })

  it('accepts exact server boundaries and keeps sinceTrigger recheck-only', () => {
    const boundary = deserializeRule({ version: 1, root: { kind: 'all', children: [
      { kind: 'eventAggregate', eventCode: 'deposit.completed', measure: 'count', filters: [], window: { kind: 'last', durationMs: 90 * day, boundary: 'beforeTrigger' }, compare: { operator: 'gte', value: '0' } },
      { kind: 'activityDayStreak', compare: { operator: 'lte', value: 365 } },
    ] } }, context)
    expect(serializeRuleDraft(boundary.draft, context).ok).toBe(true)

    const recheckOnly = deserializeRule({ version: 1, root: { kind: 'eventAggregate', eventCode: 'deposit.completed', measure: 'count', filters: [], window: { kind: 'sinceTrigger', boundary: 'beforeTrigger' }, compare: { operator: 'gte', value: '1' } } }, context)
    expect(serializeRuleDraft(recheckOnly.draft, context)).toMatchObject({ ok: false, issues: [{ code: 'since-trigger-unavailable' }] })
  })
})
