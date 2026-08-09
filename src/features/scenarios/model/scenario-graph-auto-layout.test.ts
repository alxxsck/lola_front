import { performance } from 'node:perf_hooks'
import ELK from 'elkjs/lib/elk.bundled.js'
import { describe, expect, it } from 'vitest'
import type { ScenarioAction } from '@/shared/types/domain'
import {
  auditBranchSwapFixture,
  choiceTimeoutParallelFixture,
  largeGraphFixture,
  nestedQuestionsFixture,
  splitJoinFixture,
} from '@/features/scenarios/testing/scenario-graph-fixtures'
import { graphTransitions } from './scenario-graph'
import {
  layoutScenarioGraphViewModel,
  type ScenarioGraphLayoutEngine,
} from './scenario-graph-auto-layout'
import { buildScenarioGraphViewModel } from './scenario-graph-view-model'
import type { ScenarioGraphPoint, ScenarioGraphViewModel } from './scenario-graph-view-model'

const presentAction = (action: ScenarioAction) => ({
  label: action.type,
  nodeKey: action.nodeKey ?? '',
  icon: 'pi pi-bolt',
  executor: 'SERVER',
  summary: action.nodeKey ?? '',
  issueCount: 0,
})
const engine = new ELK()

function layout(
  viewModel: ReturnType<typeof build>,
  overrideEngine: ScenarioGraphLayoutEngine = engine,
) {
  return layoutScenarioGraphViewModel(viewModel, { engine: overrideEngine })
}

function build(actions: ScenarioAction[]) {
  return buildScenarioGraphViewModel({
    actions,
    transitions: graphTransitions(actions, {
      requestedLocale: 'ru',
      defaultLocale: 'ru',
    }),
    triggerLabel: 'Старт',
    presentAction,
  })
}

function expectEdgesFlowDown(model: Awaited<ReturnType<typeof layoutScenarioGraphViewModel>>['viewModel']) {
  const nodes = new Map(model.nodes.map((node) => [node.id, node]))
  for (const edge of model.edges) {
    const source = nodes.get(edge.source)
    const target = nodes.get(edge.target)
    expect(source, edge.id).toBeDefined()
    expect(target, edge.id).toBeDefined()
    expect(target!.position.y, edge.id).toBeGreaterThan(source!.position.y)
  }
}

function samePoint(left: ScenarioGraphPoint, right: ScenarioGraphPoint) {
  return left.x === right.x && left.y === right.y
}

function segmentCrosses(
  [leftStart, leftEnd]: [ScenarioGraphPoint, ScenarioGraphPoint],
  [rightStart, rightEnd]: [ScenarioGraphPoint, ScenarioGraphPoint],
) {
  const leftVertical = leftStart.x === leftEnd.x
  const rightVertical = rightStart.x === rightEnd.x
  const allowedSharedEndpoint = (point: ScenarioGraphPoint) =>
    (samePoint(point, leftStart) || samePoint(point, leftEnd))
    && (samePoint(point, rightStart) || samePoint(point, rightEnd))
  const between = (value: number, start: number, end: number) =>
    value >= Math.min(start, end) && value <= Math.max(start, end)

  if (leftVertical === rightVertical) {
    const sameAxis = leftVertical
      ? leftStart.x === rightStart.x
      : leftStart.y === rightStart.y
    if (!sameAxis) return false
    const leftRange = leftVertical
      ? [leftStart.y, leftEnd.y]
      : [leftStart.x, leftEnd.x]
    const rightRange = rightVertical
      ? [rightStart.y, rightEnd.y]
      : [rightStart.x, rightEnd.x]
    const overlapStart = Math.max(Math.min(...leftRange), Math.min(...rightRange))
    const overlapEnd = Math.min(Math.max(...leftRange), Math.max(...rightRange))
    if (overlapStart > overlapEnd) return false
    if (overlapStart < overlapEnd) return true
    const point = leftVertical
      ? { x: leftStart.x, y: overlapStart }
      : { x: overlapStart, y: leftStart.y }
    return !allowedSharedEndpoint(point)
  }

  const vertical = leftVertical ? [leftStart, leftEnd] : [rightStart, rightEnd]
  const horizontal = leftVertical ? [rightStart, rightEnd] : [leftStart, leftEnd]
  const point = { x: vertical[0]!.x, y: horizontal[0]!.y }
  if (!between(point.y, vertical[0]!.y, vertical[1]!.y)
    || !between(point.x, horizontal[0]!.x, horizontal[1]!.x)) return false
  return !allowedSharedEndpoint(point)
}

function routeCrossings(edges: ScenarioGraphViewModel['edges']) {
  return edges.flatMap((left, index) => edges.slice(index + 1).flatMap((right) => {
    const leftPoints = left.data?.routePoints ?? []
    const rightPoints = right.data?.routePoints ?? []
    const crossing = leftPoints.slice(1).some((leftPoint, leftIndex) =>
      rightPoints.slice(1).some((rightPoint, rightIndex) => segmentCrosses(
        [leftPoints[leftIndex]!, leftPoint],
        [rightPoints[rightIndex]!, rightPoint],
      )))
    return crossing ? [[left.id, right.id] as const] : []
  }))
}

describe('scenario graph ELK auto-layout adapter', () => {
  it('keeps audited choice lanes in semantic order without a crossing', async () => {
    const result = await layout(build(auditBranchSwapFixture.actions))
    const xByNode = new Map(result.viewModel.nodes.map((node) => [node.id, node.position.x]))
    const branchTargets = result.viewModel.edges
      .filter(({ source }) => source === 'question')
      .map(({ target }) => target)

    expect(result.status).toBe('laid-out')
    expect(branchTargets).toEqual(['yes_path', 'no_path', 'timeout_path'])
    expect(branchTargets.map((target) => xByNode.get(target))).toEqual(
      [...branchTargets].map((target) => xByNode.get(target)).sort((left, right) => left! - right!),
    )
    expect(new Set(result.viewModel.edges
      .filter(({ source }) => source === 'question')
      .map(({ data }) => JSON.stringify(data?.routePoints))
    ).size).toBe(3)
    expect(routeCrossings(result.viewModel.edges.filter(({ source }) => source === 'question')))
      .toEqual([])
    for (const edge of result.viewModel.edges) {
      const points = edge.data?.routePoints ?? []
      expect(points.length, edge.id).toBeGreaterThanOrEqual(2)
      for (let index = 1; index < points.length; index += 1) {
        const previous = points[index - 1]!
        const current = points[index]!
        expect(
          previous.x === current.x || previous.y === current.y,
          `${edge.id} has a diagonal ELK segment`,
        ).toBe(true)
      }
    }
  })

  it.each([
    ['split/join', splitJoinFixture.actions],
    ['nested choice', nestedQuestionsFixture.actions],
  ])('lays out %s in one top-to-bottom direction', async (_name, actions) => {
    const result = await layout(build(actions))

    expect(result.status).toBe('laid-out')
    expectEdgesFlowDown(result.viewModel)
  })

  it('is deterministic and lays out 40 nodes within the 750 ms budget', async () => {
    const source = build(largeGraphFixture.actions)
    const startedAt = performance.now()
    const first = await layout(source)
    const elapsed = performance.now() - startedAt
    const second = await layout(build(largeGraphFixture.actions))

    expect(first.status).toBe('laid-out')
    expect(elapsed).toBeLessThan(750)
    expect(second.viewModel.nodes.map(({ id, position }) => ({ id, position })))
      .toEqual(first.viewModel.nodes.map(({ id, position }) => ({ id, position })))
    expect(second.viewModel.edges.map(({ id, data }) => ({ id, route: data?.routePoints })))
      .toEqual(first.viewModel.edges.map(({ id, data }) => ({ id, route: data?.routePoints })))
  })

  it('returns the readable fallback view model when the layout engine fails', async () => {
    const fallback = build(splitJoinFixture.actions)
    const result = await layout(fallback, {
        layout: async () => {
          throw new Error('ELK worker failed')
        },
    })

    expect(result.status).toBe('fallback')
    expect(result.viewModel).toBe(fallback)
    expect(result.error?.message).toBe('ELK worker failed')
  })

  it('maps exact worker node, port, section and label output through the adapter seam', async () => {
    const source = build(choiceTimeoutParallelFixture.actions)
    let receivedGraph: Parameters<ScenarioGraphLayoutEngine['layout']>[0] | undefined
    const result = await layoutScenarioGraphViewModel(source, {
      measureLabel: () => ({ width: 137, height: 31 }),
      engine: {
        layout: async (graph) => {
          receivedGraph = graph
          return {
            ...graph,
            children: graph.children?.map((node, nodeIndex) => ({
              ...node,
              x: 20 + nodeIndex * 300,
              y: 30 + nodeIndex * 190,
              ports: node.ports?.map((port, portIndex) => ({
                ...port,
                x: 18 + portIndex * 54,
                y: port.layoutOptions?.['elk.port.side'] === 'NORTH'
                  ? -4.5
                  : (node.height ?? 0) - 4.5,
              })),
            })),
            edges: graph.edges?.map((edge, edgeIndex) => ({
              ...edge,
              sections: [{
                id: `${edge.id}-section`,
                startPoint: { x: 100 + edgeIndex * 20, y: 300 },
                bendPoints: [{ x: 100 + edgeIndex * 20, y: 360 }],
                endPoint: { x: 100 + edgeIndex * 20, y: 430 },
              }],
              labels: edge.labels?.map((label) => ({
                ...label,
                x: 140,
                y: 350,
              })),
            })),
          }
        },
      },
    })

    expect(receivedGraph?.edges?.find(({ id }) => id === 'question-choice:yes')?.labels)
      .toEqual([{ text: 'Да', width: 137, height: 31 }])
    expect(result.viewModel.nodes.find(({ id }) => id === 'question')?.position)
      .toEqual({ x: 320, y: 220 })
    expect(result.viewModel.nodes.find(({ id }) => id === 'question')?.data.ports)
      .toEqual([
        { id: 'choice:yes', label: 'Да', position: 34 },
        { id: 'choice:no', label: 'Нет', position: 57 },
        { id: 'timeout', label: 'Тайм-аут', position: 81 },
      ])
    expect(result.viewModel.edges.find(({ id }) => id === 'question-choice:yes')?.data)
      .toMatchObject({
        routePoints: [
          { x: 120, y: 300 },
          { x: 120, y: 360 },
          { x: 120, y: 430 },
        ],
        labelPosition: { x: 208.5, y: 365.5 },
      })
  })
})
