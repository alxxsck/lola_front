import { describe, expect, it } from 'vitest'
import {
  SCENARIO_ACTION_CANVAS_MIN_WIDTH,
  SCENARIO_ACTION_INSPECTOR_MIN_WIDTH,
  SCENARIO_ACTION_OUTLINE_WIDTH,
  clampScenarioActionInspectorWidth,
  scenarioActionInspectorMaxWidth,
} from './scenario-action-workspace'

describe('scenario action workspace', () => {
  it.each([
    { workspace: 1080, expected: 520 },
    { workspace: 950, expected: 410 },
    { workspace: 860, expected: 320 },
  ])('keeps outline and a working canvas visible within a $workspace px workspace', ({ workspace, expected }) => {
    const inspector = scenarioActionInspectorMaxWidth(workspace)

    expect(inspector).toBe(expected)
    expect(
      SCENARIO_ACTION_OUTLINE_WIDTH
      + SCENARIO_ACTION_CANVAS_MIN_WIDTH
      + inspector,
    ).toBeLessThanOrEqual(workspace)
    expect(inspector).toBeGreaterThanOrEqual(SCENARIO_ACTION_INSPECTOR_MIN_WIDTH)
  })

  it.each([
    { width: 280, min: 320, max: 410, expected: 320 },
    { width: 365.6, min: 320, max: 410, expected: 366 },
    { width: 520, min: 320, max: 410, expected: 410 },
  ])('clamps $width to the active inspector range', ({ width, min, max, expected }) => {
    expect(clampScenarioActionInspectorWidth(width, min, max)).toBe(expected)
  })
})
