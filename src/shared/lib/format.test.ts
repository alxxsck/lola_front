import { describe, expect, it } from 'vitest'
import { formatAuditActor, slugify } from './format'

describe('slugify', () => {
  it('creates backend-compatible codes from Russian labels', () => {
    expect(slugify('Регистрация завершена')).toBe('registraciya_zavershena')
  })

  it('normalizes punctuation and whitespace', () => {
    expect(slugify('  Deposit: Succeeded! ')).toBe('deposit_succeeded')
  })
})

describe('formatAuditActor', () => {
  it('uses one consistent label for CMS users across integration cards', () => {
    expect(formatAuditActor('CMS_USER', 'operator-1')).toBe(
      'Администратор · operator-1',
    )
  })

  it('keeps unknown actor types readable', () => {
    expect(formatAuditActor('SERVICE', 'worker-1')).toBe('Оператор · worker-1')
  })
})
