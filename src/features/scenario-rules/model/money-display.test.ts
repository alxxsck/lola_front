import { describe, expect, it } from 'vitest'

import { backendMoneyToDisplay, displayMoneyToBackend, formatMoneyDisplay } from './money-display'

describe('money display conversion', () => {
  it('converts minor-unit backend values without floating-point drift', () => {
    expect(backendMoneyToDisplay(125, 0.01)).toBe('1.25')
    expect(displayMoneyToBackend('1.25', 0.01)).toBe('125')
    expect(displayMoneyToBackend('0.3', 0.1)).toBe('3')
  })

  it('rejects a display value that cannot be represented by the declared finite scale', () => {
    expect(displayMoneyToBackend('3', 3)).toBe('1')
    expect(displayMoneyToBackend('1', 3)).toBeNull()
  })

  it('formats the converted amount with catalog precision', () => {
    expect(formatMoneyDisplay(50_000, 0.01, 2)).toBe('500.00')
    expect(formatMoneyDisplay(12_599, 0.001, 2)).toBe('12.60')
  })
})
