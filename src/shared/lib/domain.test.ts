import { describe, expect, it } from 'vitest'
import { normalizeScenarioActions } from './domain'

describe('normalizeScenarioActions', () => {
  it('replaces sparse positions with a zero-based order', () => {
    const actions = normalizeScenarioActions([
      { position: 8, type: 'SAY', config: { text: 'Привет' } },
      { position: 3, type: 'COMPLETE_SCENARIO', config: {} },
    ])
    expect(actions.map((action) => action.position)).toEqual([0, 1])
  })
})
