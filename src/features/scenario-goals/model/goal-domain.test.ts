import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'

import type { ScenarioAuthoringContract } from '@/shared/api/repository/scenario-authoring'

import { createGoalDraft, goalDraftFromConfig, serializeGoalDraft, summarizeGoalDraft, validateGoalDraft } from './goal-domain'

const contract: ScenarioAuthoringContract = {
  projectId: 'project-1', revision: 'catalog-1', version: 1,
  events: [{
    code: 'deposit.succeeded', definitionId: 'deposit-revision-1', definitionKeyId: 'deposit-key', name: 'Успешный депозит', schemaVersion: 1,
    aggregateMeasures: [],
    fields: [{
      fieldKey: 'deposit.amount', label: 'Сумма', path: 'event.payload.amount', required: true,
      valueType: 'number', semanticType: 'money_major', unit: 'EUR', control: { type: 'number' },
      capabilities: { eventField: { operators: ['eq', 'gte'] }, aggregateFilter: { operators: ['eq'] }, aggregateMeasure: { measures: ['sum'] } },
    }, {
      fieldKey: 'deposit.currency', label: 'Валюта', path: 'event.payload.currency', required: true,
      valueType: 'string', semanticType: 'currency', control: { type: 'select', options: ['EUR', 'USD'] }, allowedValues: ['EUR', 'USD'],
      capabilities: { eventField: { operators: ['eq'] }, aggregateFilter: { operators: ['eq', 'in'] }, aggregateMeasure: { measures: [] } },
    }],
  }],
}

describe('WAIT_FOR_GOAL domain', () => {
  it('serializes the registration to two-day deposit Goal/Timeout worked example', () => {
    const draft = createGoalDraft()
    Object.assign(draft, {
      eventCode: 'deposit.succeeded', measure: 'sum', numericFieldKey: 'deposit.amount',
      filters: [{ fieldKey: 'deposit.currency', operator: 'eq', value: 'EUR' }],
      compare: { operator: 'gte', value: '500.25' }, timeoutMs: 172_800_000,
      onGoal: 'deposit_done', onTimeout: 'deposit_missing',
    })

    expect(serializeGoalDraft(draft, contract)).toEqual({ ok: true, value: {
      goal: {
        version: 1, eventCode: 'deposit.succeeded', measure: 'sum', numericFieldKey: 'deposit.amount',
        filters: [{ fieldKey: 'deposit.currency', operator: 'eq', value: 'EUR' }],
        compare: { operator: 'gte', value: '500.25' },
      },
      timeoutMs: 172_800_000, onGoal: 'deposit_done', onTimeout: 'deposit_missing',
    } })
    expect(summarizeGoalDraft(draft, contract)).toContain('Успешный депозит')
    expect(summarizeGoalDraft(draft, contract)).toContain('2 дня')
    expect(summarizeGoalDraft(draft, contract)).toContain('Валюта равно EUR')
    expect(summarizeGoalDraft(draft, contract)).toContain('если цель достигнута → deposit_done')
    expect(summarizeGoalDraft(draft, contract)).toContain('если срок истёк → deposit_missing')
  })

  it('rejects infinite waits, missing branches and money sums without one currency equality filter', () => {
    const draft = createGoalDraft()
    Object.assign(draft, {
      eventCode: 'deposit.succeeded', measure: 'sum', numericFieldKey: 'deposit.amount',
      filters: [], compare: { operator: 'gte', value: '500' }, timeoutMs: 0,
    })

    const result = serializeGoalDraft(draft, contract)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'currency-required', 'deadline-invalid', 'goal-branch-required', 'timeout-branch-required',
    ]))
  })

  it('restores a persisted config for document-level validation', () => {
    const draft = goalDraftFromConfig({
      goal: { eventCode: 'deposit.succeeded', measure: 'count', filters: [], compare: { operator: 'gte', value: '2' } },
      timeoutMs: 10_000,
      onGoal: 'done',
      onTimeout: 'timeout',
    })

    expect(draft).toMatchObject({ eventCode: 'deposit.succeeded', measure: 'count', timeoutMs: 10_000, onGoal: 'done', onTimeout: 'timeout' })
  })

  it('restores scalar arrays from reactive Scenario config', () => {
    const config = reactive({
      goal: { eventCode: 'deposit.succeeded', measure: 'count', filters: [{ fieldKey: 'deposit.currency', operator: 'in', value: ['EUR', 'USD'] }], compare: { operator: 'gte', value: '2' } },
      timeoutMs: 10_000, onGoal: 'done', onTimeout: 'timeout',
    })

    expect(goalDraftFromConfig(config).filters[0]?.value).toEqual(['EUR', 'USD'])
  })

  it('rejects scalar values for in and arrays for scalar operators', () => {
    const base = {
      ...createGoalDraft(), eventCode: 'deposit.succeeded', onGoal: 'done', onTimeout: 'timeout',
    }
    const scalarIn = validateGoalDraft({ ...base, filters: [{ fieldKey: 'deposit.currency', operator: 'in', value: 'EUR' }] }, contract)
    const arrayEq = validateGoalDraft({ ...base, filters: [{ fieldKey: 'deposit.currency', operator: 'eq', value: ['EUR'] }] }, contract)

    expect(scalarIn.map((item) => item.code)).toContain('filter-value-invalid')
    expect(arrayEq.map((item) => item.code)).toContain('filter-value-invalid')
  })
})
