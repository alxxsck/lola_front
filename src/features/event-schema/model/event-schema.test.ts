import { describe, expect, it } from 'vitest'

import {
  buildEventSchemaExample,
  diffEventSchemas,
  parseEventSchema,
  serializeEventSchema,
  validateEventSchemaDraft,
  validateEventSchemaSample,
} from './event-schema'

describe('event schema model', () => {
  it('round-trips Lola metadata, constraints and unknown JSON Schema keywords', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      additionalProperties: { type: 'string' },
      required: ['amountMinor', 'currency'],
      'x-lola-contract-note': 'kept verbatim',
      properties: {
        amountMinor: {
          type: 'integer',
          title: 'Amount',
          description: 'Money in minor units',
          minimum: 1,
          maximum: 999_999,
          multipleOf: 1,
          'x-lola-field-key': 'deposit.amount',
          'x-lola-semantic-type': 'money',
          'x-lola-unit': 'minor',
          'x-lola-sensitive': false,
        },
        currency: {
          type: 'string',
          title: 'Currency',
          enum: ['EUR', 'USD'],
          'x-lola-field-key': 'deposit.currency',
          'x-lola-semantic-type': 'currency',
        },
      },
    }

    expect(serializeEventSchema(parseEventSchema(schema))).toEqual(schema)
  })

  it('keeps unsupported property schemas opaque instead of replacing them', () => {
    const schema = {
      type: 'object',
      properties: {
        actor: { oneOf: [{ type: 'string' }, { type: 'object' }] },
        legacy: true,
      },
    }

    const draft = parseEventSchema(schema)

    expect(draft.fields.map(({ wireKey, visuallyEditable }) => ({ wireKey, visuallyEditable }))).toEqual([
      { wireKey: 'actor', visuallyEditable: false },
      { wireKey: 'legacy', visuallyEditable: false },
    ])
    expect(serializeEventSchema(draft)).toEqual(schema)
  })

  it('preserves required keys that are intentionally absent from properties', () => {
    const schema = { type: 'object', required: ['tenantId'] }

    expect(serializeEventSchema(parseEventSchema(schema))).toEqual(schema)
  })

  it('applies visual edits without changing stable identity or unknown annotations', () => {
    const draft = parseEventSchema({
      type: 'object',
      additionalProperties: false,
      properties: {
        amount: {
          type: 'integer',
          title: 'Amount',
          'x-lola-field-key': 'deposit.amount',
          'x-product-owner': 'payments',
        },
      },
      required: ['amount'],
    })
    const amount = draft.fields[0]
    if (!amount) throw new Error('Expected amount field')

    amount.wireKey = 'amountMinor'
    amount.title = 'Amount in minor units'
    amount.minimum = 1
    amount.maximum = 500_000
    amount.semanticType = 'money'
    amount.unit = 'minor'
    amount.sensitive = true
    draft.additionalProperties = true

    expect(serializeEventSchema(draft)).toEqual({
      type: 'object',
      additionalProperties: true,
      properties: {
        amountMinor: {
          type: 'integer',
          title: 'Amount in minor units',
          minimum: 1,
          maximum: 500_000,
          'x-lola-field-key': 'deposit.amount',
          'x-lola-semantic-type': 'money',
          'x-lola-unit': 'minor',
          'x-lola-sensitive': true,
          'x-product-owner': 'payments',
        },
      },
      required: ['amountMinor'],
    })
  })

  it('builds a sample payload without converting declared units', () => {
    const draft = parseEventSchema({
      type: 'object',
      properties: {
        '': { type: 'string' },
        amountMinor: { type: 'integer', minimum: 125, 'x-lola-unit': 'minor' },
        currency: { type: 'string', enum: ['EUR', 'USD'] },
      },
    })

    expect(buildEventSchemaExample(draft)).toEqual({ amountMinor: 125, currency: 'EUR' })
  })

  it('validates pasted sample payloads with backend-compatible JSON Schema rules', () => {
    const draft = parseEventSchema({
      type: 'object',
      required: ['amountMinor', 'currency'],
      properties: {
        amountMinor: { type: 'integer', minimum: 1 },
        currency: { type: 'string', enum: ['EUR', 'USD'] },
      },
    })

    expect(validateEventSchemaSample(draft, { amountMinor: 0, currency: 'GBP', extra: true })).toEqual([
      { path: '/extra', expected: 'no additional properties', actual: 'true', explanation: 'must NOT have additional properties' },
      { path: '/amountMinor', expected: '>= 1', actual: '0', explanation: 'must be >= 1' },
      { path: '/currency', expected: 'one of ["EUR","USD"]', actual: '"GBP"', explanation: 'must be equal to one of the allowed values' },
    ])
    expect(validateEventSchemaSample(draft, { amountMinor: 125, currency: 'EUR' })).toEqual([])
  })

  it('keeps draft validation and array normalization inside the schema model', () => {
    const draft = parseEventSchema({ type: 'object', properties: { amount: { type: 'string' } } })
    const amount = draft.fields[0]
    if (!amount) throw new Error('Expected amount field')

    amount.wireKey = ' amount'
    expect(validateEventSchemaDraft(draft)).toEqual([{ fieldId: amount.id, message: 'Wire key должны начинаться с буквы и содержать только допустимые символы.' }])

    amount.wireKey = 'items'
    amount.type = 'array'
    expect(serializeEventSchema(draft)).toMatchObject({ properties: { items: { type: 'array', items: {} } } })
  })

  it('distinguishes a wire rename from changing stable field identity', () => {
    const before = {
      type: 'object',
      properties: {
        amount: { type: 'integer', 'x-lola-field-key': 'deposit.amount' },
        currency: { type: 'string', 'x-lola-field-key': 'deposit.currency' },
      },
      required: ['amount'],
    }
    const after = {
      type: 'object',
      properties: {
        amountMinor: { type: 'number', 'x-lola-field-key': 'deposit.amount' },
        currency: { type: 'string', 'x-lola-field-key': 'payment.currency' },
      },
      required: ['amountMinor'],
    }

    expect(diffEventSchemas(before, after)).toEqual([
      {
        kind: 'renamed',
        fieldKey: 'deposit.amount',
        beforeWireKey: 'amount',
        afterWireKey: 'amountMinor',
      },
      {
        kind: 'type-changed',
        fieldKey: 'deposit.amount',
        beforeWireKey: 'amount',
        afterWireKey: 'amountMinor',
        beforeType: 'integer',
        afterType: 'number',
      },
      {
        kind: 'field-key-changed',
        fieldKey: 'payment.currency',
        beforeWireKey: 'currency',
        afterWireKey: 'currency',
        beforeFieldKey: 'deposit.currency',
        afterFieldKey: 'payment.currency',
      },
    ])
  })
})
