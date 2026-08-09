import { describe, expect, it } from 'vitest'
import { scenarioGraphWorkspaceEnabledFromEnv } from './features'

describe('feature rollout switches', () => {
  it.each([
    { value: undefined, expected: true },
    { value: '', expected: true },
    { value: 'true', expected: true },
    { value: 'false', expected: false },
  ])('resolves the scenario graph workspace flag from $value', ({ value, expected }) => {
    expect(scenarioGraphWorkspaceEnabledFromEnv(value)).toBe(expected)
  })
})
