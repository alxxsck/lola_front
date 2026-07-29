import { describe, expect, it } from 'vitest'
import { isValidTextToSpeechRate } from './ai-pricing.model'

describe('AI pricing decimal contract', () => {
  it.each([
    '15',
    '0.000000000001',
    '999999.999999999999',
    '1000000',
    '1000000.000000000000',
  ])('accepts backend-supported rate %s', (rate) => {
    expect(isValidTextToSpeechRate(rate)).toBe(true)
  })

  it.each([
    '',
    '0',
    '0.000000000000',
    '-1',
    '1e3',
    '0.1234567890123',
    '1000000.000000000001',
    '123456789012345678901.1',
  ])('rejects unsupported rate %s', (rate) => {
    expect(isValidTextToSpeechRate(rate)).toBe(false)
  })
})
