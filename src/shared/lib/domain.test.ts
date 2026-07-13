import { describe, expect, it } from 'vitest'
import { buildEventExample, buildEventSchema, normalizeScenarioActions } from './domain'

describe('buildEventSchema', () => {
  it('creates a strict JSON Schema and required fields', () => {
    expect(buildEventSchema([
      { id: '1', name: 'Сумма', code: 'amount', type: 'number', required: true },
      { id: '2', name: 'Валюта', code: 'currency', type: 'string', required: false },
    ])).toEqual({
      type: 'object',
      additionalProperties: false,
      properties: {
        amount: { type: 'number', title: 'Сумма' },
        currency: { type: 'string', title: 'Валюта' },
      },
      required: ['amount'],
    })
  })
})

describe('buildEventExample', () => {
  it('creates an event ingestion payload with representative values', () => {
    expect(buildEventExample(' deposit.succeeded ', [
      { id: '1', name: 'Сумма', code: 'amount', type: 'number', required: true },
      { id: '2', name: 'Валюта', code: 'currency', type: 'string', required: true },
      { id: '3', name: 'Черновик', code: '', type: 'boolean', required: false },
    ])).toEqual({
      userId: 'customer_12345',
      externalEventId: 'event_12345',
      eventCode: 'deposit.succeeded',
      payload: {
        amount: 123.45,
        currency: 'value',
      },
    })
  })
})

describe('normalizeScenarioActions', () => {
  it('replaces sparse positions with a zero-based order', () => {
    const actions = normalizeScenarioActions([
      { position: 8, type: 'SAY', config: { text: 'Привет' } },
      { position: 3, type: 'COMPLETE_SCENARIO', config: {} },
    ])
    expect(actions.map((action) => action.position)).toEqual([0, 1])
  })
})
