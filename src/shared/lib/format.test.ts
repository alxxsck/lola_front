import { describe, expect, it } from 'vitest'
import { slugify } from './format'

describe('slugify', () => {
  it('creates backend-compatible codes from Russian labels', () => {
    expect(slugify('Регистрация завершена')).toBe('registraciya_zavershena')
  })

  it('normalizes punctuation and whitespace', () => {
    expect(slugify('  Deposit: Succeeded! ')).toBe('deposit_succeeded')
  })
})
