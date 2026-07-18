import { describe, expect, it } from 'vitest'

import type { ScenarioAuthoringContract } from '@/shared/api/repository/scenario-authoring'

import {
  deserializeRule,
  mapBackendRuleIssues,
  serializeRuleDraft,
  type RuleDomainContext,
  type RuleDraftNode,
} from './index'

const day = 86_400_000

const contract: ScenarioAuthoringContract = {
  projectId: 'project-1', revision: 'catalog-1', version: 1,
  events: [
    {
      code: 'page.opened', definitionId: 'page-1', definitionKeyId: 'page-key', name: 'Открыта страница', schemaVersion: 1,
      aggregateMeasures: [{ measure: 'count', field: 'none', resultType: 'integer', compareValueType: 'integer', compareOperators: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'] }],
      fields: [{
        capabilities: { eventField: { operators: ['eq', 'exists', 'not_exists'] }, aggregateFilter: { operators: ['eq', 'exists'] }, aggregateMeasure: { measures: [] } },
        control: { type: 'select', options: ['promotions', 'cashier'] }, fieldKey: 'page.code', label: 'Страница', path: 'event.payload.page.code', required: true, valueType: 'string',
      }],
    },
    {
      code: 'deposit.succeeded', definitionId: 'deposit-3', definitionKeyId: 'deposit-key', name: 'Успешный депозит', schemaVersion: 3,
      aggregateMeasures: [{ measure: 'sum', field: 'required', resultType: 'field', compareValueType: 'field', compareOperators: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'] }],
      fields: [
        {
          capabilities: { eventField: { operators: ['eq', 'gt', 'gte'] }, aggregateFilter: { operators: ['eq'] }, aggregateMeasure: { measures: ['sum'] } },
          control: { type: 'number' }, fieldKey: 'deposit.amount', label: 'Сумма', path: 'event.payload.amount', required: true, semanticType: 'money_major', unit: 'EUR', valueType: 'number',
        },
        {
          capabilities: { eventField: { operators: ['eq'] }, aggregateFilter: { operators: ['eq', 'in'] }, aggregateMeasure: { measures: [] } },
          control: { type: 'select', options: ['EUR', 'USD'] }, fieldKey: 'deposit.currency', label: 'Валюта', path: 'event.payload.currency', required: true, semanticType: 'currency', valueType: 'string',
        },
      ],
    },
  ],
}

const context: RuleDomainContext = { triggerEventDefinitionId: 'page-1', triggerEventCode: 'page.opened', mode: 'initialEligibility', contract }

function firstChild(root: RuleDraftNode): RuleDraftNode {
  if (root.kind !== 'all' && root.kind !== 'any') throw new Error('Expected group')
  if (!root.children[0]) throw new Error('Expected child')
  return root.children[0]
}

const validAggregate = {
  kind: 'eventAggregate',
  eventCode: 'deposit.succeeded',
  measure: 'sum',
  fieldKey: 'deposit.amount',
  filters: [{ fieldKey: 'deposit.currency', operator: 'eq', value: 'EUR' }],
  window: { kind: 'last', durationMs: 30 * day, boundary: 'beforeTrigger' },
  compare: { operator: 'gte', value: '500' },
}

describe('Rule DTO contract', () => {
  it('serializes a catalog-compatible aggregate using stable keys and no UI metadata', () => {
    const dto = { version: 1, root: { kind: 'all', children: [validAggregate] } }
    const parsed = deserializeRule(dto, context)
    const aggregate = firstChild(parsed.draft.root)
    const result = serializeRuleDraft(parsed.draft, context)

    expect(parsed.issues).toEqual([])
    expect(aggregate.kind === 'eventAggregate' ? aggregate.filters[0]?.filterId : '').toMatch(/^rule_filter_/)
    expect(result).toMatchObject({ ok: true, value: dto })
    expect(JSON.stringify(result.ok ? result.value : null)).not.toMatch(/nodeId|filterId|label|path/)
  })

  it('keeps known stale selections editable and explains why they cannot be serialized', () => {
    const parsed = deserializeRule({
      version: 1,
      root: { kind: 'eventField', eventCode: 'other.event', fieldKey: 'removed.field', operator: 'in', value: ['x'] },
    }, context)

    expect(parsed.draft.root).toMatchObject({ kind: 'eventField', eventCode: 'other.event', fieldKey: 'removed.field', operator: 'in' })
    expect(parsed.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(['trigger-event-mismatch', 'field-unavailable']))
    expect(serializeRuleDraft(parsed.draft, context)).toMatchObject({ ok: false })
  })

  it('rejects semantically incomplete existence values, money filters and initial since-trigger windows', () => {
    const parsed = deserializeRule({
      version: 1,
      root: {
        kind: 'all',
        children: [
          { kind: 'eventField', eventCode: 'page.opened', fieldKey: 'page.code', operator: 'exists', value: 'must-not-be-sent' },
          { ...validAggregate, filters: [], window: { kind: 'sinceTrigger' } },
        ],
      },
    }, context)

    const result = serializeRuleDraft(parsed.draft, context)
    expect(result.ok ? [] : result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'unexpected-value', 'money-currency-required', 'since-trigger-unavailable',
    ]))
    expect(result.ok ? '' : result.issues.map((issue) => issue.message).join(' ')).toContain('Уберите значение')
  })

  it('maps a backend issue through the path index captured for the request', () => {
    const parsed = deserializeRule({ version: 1, root: { kind: 'all', children: [validAggregate] } }, context)
    const aggregate = firstChild(parsed.draft.root)
    const serialized = serializeRuleDraft(parsed.draft, context)
    if (!serialized.ok) throw new Error(serialized.issues[0]?.message)

    const mapped = mapBackendRuleIssues([
      { code: 'AGGREGATE_FILTER_INVALID', message: 'Filter value is invalid', path: 'rule.root.children.0.filters.0.value' },
      { code: 'RULE_TOO_EXPENSIVE', message: 'Too expensive', path: 'root' },
      { code: 'UNKNOWN_PATH', message: 'Unknown', path: 'deliveryPolicy.kind' },
    ], serialized.pathIndex)

    expect(mapped[0]).toMatchObject({ nodeId: aggregate.nodeId, fieldPath: 'filters.0.value' })
    expect(mapped[1]).toMatchObject({ nodeId: parsed.draft.root.nodeId })
    expect(mapped[1]).not.toHaveProperty('fieldPath')
    expect(mapped[2]).not.toHaveProperty('nodeId')
  })

  it('rejects imported trees that exceed server limits even when no command created them', () => {
    const parsed = deserializeRule({
      version: 1,
      root: { kind: 'all', children: Array.from({ length: 21 }, () => ({
        kind: 'eventField', eventCode: 'page.opened', fieldKey: 'page.code', operator: 'exists',
      })) },
    }, context)

    expect(serializeRuleDraft(parsed.draft, context)).toMatchObject({
      ok: false,
      issues: [{ code: 'group-children-limit', nodeId: parsed.draft.root.nodeId }],
    })
  })

  it('rejects an aggregate comparison string beyond the backend literal limit', () => {
    const parsed = deserializeRule({
      version: 1,
      root: {
        kind: 'eventAggregate', eventCode: 'page.opened', measure: 'count', filters: [],
        window: { kind: 'last', durationMs: day }, compare: { operator: 'gte', value: '1'.repeat(10_001) },
      },
    }, context)

    expect(serializeRuleDraft(parsed.draft, context)).toMatchObject({
      ok: false,
      issues: [{ code: 'compare-value-invalid', fieldPath: 'compare.value' }],
    })
  })
})
