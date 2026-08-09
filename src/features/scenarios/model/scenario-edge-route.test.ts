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

  it('uses ELK bend points while anchoring the route to live handles', () => {
    const route = buildScenarioEdgeRoute({
      sourceX: 100,
      sourceY: 140,
      targetX: 340,
      targetY: 420,
      routeIndex: 0,
      routeCount: 1,
      laneGap: 24,
      layoutPoints: [
        { x: 96, y: 132 },
        { x: 96, y: 260 },
        { x: 344, y: 260 },
        { x: 344, y: 428 },
      ],
      labelPosition: { x: 220, y: 248 },
    })

    expect(route.path).toBe('M 100 140 L 100 260 L 96 260 L 344 260 L 344 420 L 340 420')
    expect(route.labelX).toBe(220)
    expect(route.labelY).toBe(248)
  })
})
