import { describe, expect, it } from 'vitest'
import { buildScenarioEdgeRoute } from './scenario-edge-route'

describe('scenario edge route', () => {
  it('keeps canonical three-way parallel paths and label lanes distinct', () => {
    const routes = [0, 1, 2].map((routeIndex) => buildScenarioEdgeRoute({
      sourceX: 840 + routeIndex * 60,
      sourceY: 300,
      targetX: 900,
      targetY: 430,
      routeIndex,
      routeCount: 3,
      laneGap: 24,
    }))

    expect(new Set(routes.map(({ path }) => path))).toHaveLength(3)
    expect(routes.map(({ labelY }) => labelY)).toEqual([316, 340, 364])
    expect(routes.map(({ labelX }) => labelX)).toEqual([840, 900, 960])
    expect(routes.every(({ labelY }) => labelY < 430)).toBe(true)
  })

  it('returns the same route for the same semantic lane input', () => {
    const input = {
      sourceX: 800,
      sourceY: 250,
      targetX: 940,
      targetY: 520,
      routeIndex: 1,
      routeCount: 3,
      laneGap: 24,
    }
    expect(buildScenarioEdgeRoute(input)).toEqual(buildScenarioEdgeRoute(input))
  })
})
