import { describe, expect, it } from 'vitest'

import type {
  ScenarioAuthoringContract,
  ScenarioAuthoringEvent,
} from '@/shared/api/repository/scenario-authoring'

import { createRuleDraft } from './rule-draft'
import {
  applyRuleQuickStartRecipe,
  createRuleQuickStartRecipes,
} from './rule-recipes'
import type { RuleDomainContext } from './rule-types'

function event(code: string, name: string): ScenarioAuthoringEvent {
  return {
    code,
    definitionId: `definition-${code}`,
    definitionKeyId: `key-${code}`,
    name,
    schemaVersion: 1,
    aggregateMeasures: [{
      measure: 'count',
      field: 'none',
      resultType: 'integer',
      compareValueType: 'integer',
      compareOperators: ['eq', 'gte'],
    }],
    fields: [],
  }
}

function context(events: ScenarioAuthoringEvent[]): RuleDomainContext {
  const contract: ScenarioAuthoringContract = {
    projectId: 'project-1',
    revision: 'catalog-1',
    version: 1,
    events,
  }
  return {
    triggerEventDefinitionId: events[0]?.definitionId ?? 'trigger',
    triggerEventCode: events[0]?.code ?? 'trigger',
    mode: 'initialEligibility',
    contract,
  }
}

describe('rule quick-start recipes', () => {
  it('atomically creates a group for registration without a successful deposit', () => {
    const ruleContext = context([
      event('registration.completed', 'Регистрация завершена'),
      event('deposit.failed', 'Ошибка депозита'),
      event('deposit.succeeded', 'Успешный депозит'),
    ])
    const recipe = createRuleQuickStartRecipes(ruleContext)
      .find(({ id }) => id === 'registration-no-deposit-5m')!
    const draft = createRuleDraft()
    const result = applyRuleQuickStartRecipe(
      draft,
      draft.root.nodeId,
      recipe,
      ruleContext,
    )

    expect(result).toMatchObject({
      ok: true,
      draft: {
        root: {
          kind: 'all',
          children: [{
            kind: 'all',
            children: [
              { kind: 'eventAggregate', eventCode: 'registration.completed' },
              { kind: 'eventAggregate', eventCode: 'deposit.succeeded' },
            ],
          }],
        },
      },
    })
  })

  it('disables the compound recipe when the catalog has no registration event', () => {
    const ruleContext = context([
      event('deposit.succeeded', 'Успешный депозит'),
    ])

    expect(createRuleQuickStartRecipes(ruleContext)
      .find(({ id }) => id === 'registration-no-deposit-5m'))
      .toMatchObject({ nodes: undefined })
  })

  it('does not mistake a failed deposit for the positive deposit outcome', () => {
    const ruleContext = context([
      event('registration.completed', 'Регистрация завершена'),
      event('deposit.failed', 'Ошибка депозита'),
      event('deposit.created', 'Депозит создан'),
      event('deposit.succeeded', 'Успешный депозит'),
    ])

    expect(createRuleQuickStartRecipes(ruleContext)
      .find(({ id }) => id === 'registration-no-deposit-5m')?.nodes?.[1])
      .toMatchObject({ kind: 'eventAggregate', eventCode: 'deposit.succeeded' })
  })
})
