import { describe, expect, it } from 'vitest'
import { buildUserAttributeValidation, parseAllowedValues } from './user-attributes'

describe('user attribute constraints', () => {
  it('converts allowed values according to the selected type', () => {
    expect(parseAllowedValues('NUMBER', '1\n2.5')).toEqual([1, 2.5])
    expect(parseAllowedValues('BOOLEAN', 'true\nfalse')).toEqual([true, false])
    expect(parseAllowedValues('DATETIME', '2026-07-16T12:00:00Z')).toEqual(['2026-07-16T12:00:00Z'])
  })

  it('rejects contradictory string and number ranges', () => {
    expect(() => buildUserAttributeValidation({ type: 'STRING', minLength: 5, maxLength: 2, minimum: null, maximum: null, allowedValues: '' })).toThrow('Минимальная длина')
    expect(() => buildUserAttributeValidation({ type: 'NUMBER', minLength: null, maxLength: null, minimum: 10, maximum: 1, allowedValues: '' })).toThrow('Минимум')
  })

  it('rejects invalid RFC 3339 enum values', () => {
    expect(() => parseAllowedValues('DATETIME', '2026-07-16')).toThrow('RFC 3339')
  })
})
