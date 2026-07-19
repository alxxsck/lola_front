import { describe, expect, it } from 'vitest'

import type { ScenarioAuthoringContract } from '@/shared/api/repository/scenario-authoring'

import { createRuleDraft, deserializeRule, summarizeRule, type RuleDomainContext } from './index'

const day = 86_400_000
const contract: ScenarioAuthoringContract = {
  projectId: 'project-1', revision: 'catalog-1', version: 1,
  events: [
    {
      code: 'page.opened', definitionId: 'page-1', definitionKeyId: 'page-key', name: 'Открыта страница', schemaVersion: 1,
      aggregateMeasures: [],
      fields: [{
        capabilities: { eventField: { operators: ['eq'] }, aggregateFilter: { operators: [] }, aggregateMeasure: { measures: [] } },
        control: { type: 'select', options: ['promotions'] }, allowedValues: ['promotions'], fieldKey: 'page.code', label: 'Страница', path: 'event.payload.page.code', required: true, valueType: 'string',
      }],
    },
    {
      code: 'deposit.succeeded', definitionId: 'deposit-2', definitionKeyId: 'deposit-key', name: 'Успешный депозит', schemaVersion: 2,
      aggregateMeasures: [{ measure: 'sum', field: 'required', resultType: 'field', compareValueType: 'field', compareOperators: ['gte'] }],
      fields: [
        {
          capabilities: { eventField: { operators: ['gte'] }, aggregateFilter: { operators: [] }, aggregateMeasure: { measures: ['sum'] } },
          control: { type: 'number' }, fieldKey: 'deposit.amount', label: 'Сумма', path: 'event.payload.amount', required: true, semanticType: 'money', unit: 'minor', valueType: 'number',
          display: { scale: 0.01, precision: 2, conversion: 'MULTIPLY' },
        },
      ],
    },
  ],
}
const context: RuleDomainContext = { triggerEventDefinitionId: 'page-1', triggerEventCode: 'page.opened', mode: 'initialEligibility', contract }

describe('Rule natural-language summary', () => {
  it('describes nested behavior and reports backend-aligned metrics', () => {
    const draft = deserializeRule({
      version: 1,
      root: {
        kind: 'all',
        children: [
          { kind: 'eventField', eventCode: 'page.opened', fieldKey: 'page.code', operator: 'eq', value: 'promotions' },
          {
            kind: 'not',
            child: {
              kind: 'eventAggregate', eventCode: 'deposit.succeeded', measure: 'sum', fieldKey: 'deposit.amount', filters: [],
              window: { kind: 'last', durationMs: 30 * day }, compare: { operator: 'gte', value: 50_000 },
            },
          },
          { kind: 'activityDayStreak', compare: { operator: 'gte', value: 2 } },
        ],
      },
    }, context).draft

    const summary = summarizeRule(draft, context)

    expect(summary).toMatchObject({ status: 'ready', leaves: 3, aggregateLeaves: 2, nodes: 5, maxWindowMs: 30 * day, totalWindowMs: 30 * day })
    expect(summary.text).toContain('Должны выполняться все условия:')
    expect(summary.text).toContain('Страница = promotions')
    expect(summary.text).toContain('Исключить, если: сумма поля «Сумма» события «Успешный депозит» за последние 30 дней ≥ 500.00')
    expect(summary.text).toContain('активен не менее 2 дней подряд')
    expect(Object.keys(summary.byNodeId)).toHaveLength(5)
  })

  it('makes empty, incomplete and unsupported states explicit', () => {
    expect(summarizeRule(createRuleDraft(), context)).toMatchObject({ status: 'empty', text: 'Условия ещё не добавлены' })

    const incomplete = deserializeRule({ version: 1, root: { kind: 'all', children: [{ kind: 'futureRule', value: 1 }] } }, context).draft
    const summary = summarizeRule(incomplete, context)
    expect(summary).toMatchObject({ status: 'unsupported' })
    expect(summary.text).toContain('неподдерживаемое условие')
  })
})
