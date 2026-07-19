import { describe, expect, it } from 'vitest'
import { buildProjectActionForm, validateProjectActionConfiguration } from './schema-form'

describe('Project Action schema form adapter', () => {
  it('exposes only supported bounded controls from a closed backend schema', () => {
    const form = buildProjectActionForm({
      type: 'object',
      properties: {
        pageCodes: {
          type: 'array',
          items: { type: 'string', enum: ['home', 'bonuses'] },
          minItems: 1,
          maxItems: 2,
        },
        timeoutMs: { type: 'integer', minimum: 100, maximum: 5000 },
      },
      required: ['pageCodes'],
      additionalProperties: false,
    }, {
      fields: [
        { key: 'pageCodes', label: 'Страницы', control: 'select' },
        { key: 'timeoutMs', label: 'Таймаут', control: 'number' },
      ],
    })

    expect(form.issues).toEqual([])
    expect(form.fields).toEqual([
      expect.objectContaining({ key: 'pageCodes', kind: 'multi-select', required: true, options: ['home', 'bonuses'] }),
      expect.objectContaining({ key: 'timeoutMs', kind: 'number', minimum: 100, maximum: 5000 }),
    ])
  })

  it('blocks unsupported and security-sensitive schema fields', () => {
    const form = buildProjectActionForm({
      type: 'object',
      properties: {
        url: { type: 'string' },
        advanced: { type: 'object', additionalProperties: true },
      },
      required: [],
      additionalProperties: true,
    }, { fields: [] })

    expect(form.fields).toEqual([])
    expect(form.issues.map((issue) => issue.code)).toEqual([
      'SCHEMA_ADDITIONAL_PROPERTIES_UNSUPPORTED',
      'SCHEMA_FIELD_FORBIDDEN',
      'SCHEMA_CONTROL_UNSUPPORTED',
    ])
    expect(form.blocked).toBe(true)
  })

  it('blocks enums whose values do not match the declared scalar type', () => {
    const form = buildProjectActionForm({
      type: 'object',
      properties: { target: { type: 'string', enum: ['bonuses', 42] } },
      required: [],
      additionalProperties: false,
    }, { fields: [] })

    expect(form.blocked).toBe(true)
    expect(form.issues).toEqual([
      expect.objectContaining({ code: 'SCHEMA_CONTROL_UNSUPPORTED', field: 'target' }),
    ])
  })

  it('validates required fields, bounds, enum membership and unknown configuration keys', () => {
    const form = buildProjectActionForm({
      type: 'object',
      properties: {
        target: { type: 'string', enum: ['home', 'bonuses'] },
        retries: { type: 'integer', minimum: 1, maximum: 3 },
        tags: { type: 'array', items: { type: 'string', enum: ['vip', 'new'] }, minItems: 1, maxItems: 2 },
      },
      required: ['target', 'tags'],
      additionalProperties: false,
    }, { fields: [] })

    expect(validateProjectActionConfiguration(form, {
      retries: 1.5,
      tags: ['vip', 'unknown', 'new'],
      serverOwned: true,
    }).map((issue) => issue.code)).toEqual([
      'CONFIGURATION_REQUIRED',
      'CONFIGURATION_INTEGER',
      'CONFIGURATION_MAX_ITEMS',
      'CONFIGURATION_ENUM',
      'CONFIGURATION_UNKNOWN_FIELD',
    ])
    expect(validateProjectActionConfiguration(form, {
      target: 'bonuses',
      retries: 2,
      tags: ['vip'],
    })).toEqual([])
  })
})
