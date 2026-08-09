import type { Node } from '@vue-flow/core'
import { describe, expect, it } from 'vitest'
import { graphTransitions } from './scenario-graph'
import {
  buildScenarioGraphViewModel,
  scenarioGraphNodePresentation,
  type ScenarioGraphViewModel,
} from './scenario-graph-view-model'
import {
  auditBranchSwapFixture,
  choiceTimeoutParallelFixture,
  scenarioGraphFixtures,
} from '@/features/scenarios/testing/scenario-graph-fixtures'
import type { ScenarioAction } from '@/shared/types/domain'

const presentAction = (action: ScenarioAction) => ({
  label: action.type,
  nodeKey: action.nodeKey ?? '',
  icon: 'pi pi-bolt',
  executor: 'SERVER',
  summary: action.nodeKey ?? '',
  issueCount: 0,
})

function build(actions: ScenarioAction[]) {
  return buildScenarioGraphViewModel({
    actions,
    transitions: graphTransitions(actions, {
      requestedLocale: 'ru',
      defaultLocale: 'ru',
    }),
    triggerLabel: 'Регистрация завершена',
    presentAction,
  })
}

function actionNodeSize(model: ScenarioGraphViewModel, node: Node) {
  return node.id === 'trigger'
    ? model.layout.trigger
    : model.layout.node
}

function overlappingPairs(model: ScenarioGraphViewModel) {
  return model.nodes.flatMap((left, index) => model.nodes.slice(index + 1).flatMap((right) => {
    const leftSize = actionNodeSize(model, left)
    const rightSize = actionNodeSize(model, right)
    const overlaps = left.position.x < right.position.x + rightSize.width
      && left.position.x + leftSize.width > right.position.x
      && left.position.y < right.position.y + rightSize.height
      && left.position.y + leftSize.height > right.position.y
    return overlaps ? [[left.id, right.id] as const] : []
  }))
}

function invalidRoutes(model: ScenarioGraphViewModel) {
  const nodeIds = new Set(model.nodes.map(({ id }) => id))
  return model.edges.filter((edge) => (
    !nodeIds.has(edge.source)
    || !nodeIds.has(edge.target)
    || !Number.isFinite(model.nodes.find(({ id }) => id === edge.source)?.position.x)
    || !Number.isFinite(model.nodes.find(({ id }) => id === edge.target)?.position.y)
  ))
}

function hasBranchOrderViolation(model: ScenarioGraphViewModel, source: string) {
  const xByNode = new Map(model.nodes.map((node) => [node.id, node.position.x]))
  const positions = model.edges
    .filter((edge) => edge.source === source)
    .map((edge) => xByNode.get(edge.target) ?? Number.POSITIVE_INFINITY)
  return positions.some((position, index) => index > 0 && position < positions[index - 1]!)
}

describe('scenario graph view model', () => {
  it.each([
    { type: 'SAY', executor: 'SERVER', kind: 'action', label: 'Действие', icon: 'pi pi-server' },
    { type: 'OPEN_URL', executor: 'FRONTEND', kind: 'action', label: 'Действие', icon: 'pi pi-desktop' },
    { type: 'ASK_CHOICE', executor: 'SERVER', kind: 'decision', label: 'Решение', icon: 'pi pi-directions-alt' },
    { type: 'WAIT_FOR_GOAL', executor: 'SERVER', kind: 'wait', label: 'Ожидание', icon: 'pi pi-clock' },
    { type: 'COMPLETE_SCENARIO', executor: 'SERVER', kind: 'terminal', label: 'Завершение', icon: 'pi pi-flag-fill' },
  ])('keeps $type presentation consistent across canvas and outline', ({ type, executor, kind, label, icon }) => {
    expect(scenarioGraphNodePresentation(type, executor)).toEqual({
      kind,
      kindLabel: label,
      icon,
    })
  })

  it.each(scenarioGraphFixtures)('builds deterministic, non-overlapping $name coordinates and valid routes', ({ actions }) => {
    const first = build(actions)
    const second = build(structuredClone(actions))

    expect(second).toEqual(first)
    expect(overlappingPairs(first)).toEqual([])
    expect(invalidRoutes(first)).toEqual([])
  })

  it('keeps parallel branch identity and label separate from the route target', () => {
    const model = build(choiceTimeoutParallelFixture.actions)
    const question = model.nodes.find(({ id }) => id === 'question')!
    const edges = model.edges.filter(({ source }) => source === 'question')

    expect(question.data.ports).toEqual([
      { id: 'choice:yes', label: 'Да', position: 25 },
      { id: 'choice:no', label: 'Нет', position: 50 },
      { id: 'timeout', label: 'Тайм-аут', position: 75 },
    ])
    expect(edges.map(({ id }) => id)).toEqual([
      'question-choice:yes',
      'question-choice:no',
      'question-timeout',
    ])
    expect(edges.map(({ sourceHandle }) => sourceHandle)).toEqual([
      'choice:yes',
      'choice:no',
      'timeout',
    ])
    expect(edges.map(({ type }) => type)).toEqual(['scenario', 'scenario', 'scenario'])
    expect(edges.map(({ data }) => data!).map(({ branchId, kind, label }) => ({ branchId, kind, label }))).toEqual([
      { branchId: 'choice:yes', kind: 'choice', label: 'Да' },
      { branchId: 'choice:no', kind: 'choice', label: 'Нет' },
      { branchId: 'timeout', kind: 'timeout', label: 'Тайм-аут' },
    ])
    expect(edges.map(({ data }) => data!).map(({ routeIndex, routeCount }) => ({ routeIndex, routeCount }))).toEqual([
      { routeIndex: 0, routeCount: 3 },
      { routeIndex: 1, routeCount: 3 },
      { routeIndex: 2, routeCount: 3 },
    ])
    expect(new Set(edges.map(({ target }) => target))).toEqual(new Set(['finish']))
  })

  it('preserves legacy action order while retaining a detector for the audited branch swap', () => {
    const model = build(auditBranchSwapFixture.actions)
    const targetOrder = model.edges
      .filter(({ source }) => source === 'question')
      .map(({ target }) => target)
    const xByNode = new Map(model.nodes.map((node) => [node.id, node.position.x]))
    const visualOrder = model.nodes
      .filter(({ id }) => ['yes_path', 'no_path', 'timeout_path'].includes(id))
      .sort((left, right) => left.position.x - right.position.x)
      .map(({ id }) => id)

    expect(targetOrder).toEqual(['yes_path', 'no_path', 'timeout_path'])
    expect(visualOrder).toEqual(['timeout_path', 'no_path', 'yes_path'])

    const repaired = structuredClone(model)
    const sortedPositions = targetOrder
      .map((target) => xByNode.get(target)!)
      .sort((left, right) => left - right)
    targetOrder.forEach((target, index) => {
      repaired.nodes.find(({ id }) => id === target)!.position.x = sortedPositions[index]!
    })
    expect(hasBranchOrderViolation(repaired, 'question')).toBe(false)

    const corrupted = structuredClone(repaired)
    const yes = corrupted.nodes.find(({ id }) => id === 'yes_path')!
    const timeout = corrupted.nodes.find(({ id }) => id === 'timeout_path')!
    ;[yes.position.x, timeout.position.x] = [timeout.position.x, yes.position.x]
    expect(hasBranchOrderViolation(corrupted, 'question')).toBe(true)
  })

  it('keeps measurable layout dimensions and spacing behind one options interface', () => {
    const model = buildScenarioGraphViewModel({
      actions: auditBranchSwapFixture.actions,
      transitions: graphTransitions(auditBranchSwapFixture.actions),
      triggerLabel: 'Старт',
      presentAction,
    }, {
      node: { width: 240, height: 128 },
      gaps: { column: 60, row: 72 },
      label: { fontSize: 12, paddingX: 7, paddingY: 5 },
      viewport: {
        fitViewOnInit: false,
        minZoom: 0.3,
        maxZoom: 1.8,
        backgroundGap: 24,
      },
    })

    expect(model.layout.node).toEqual({ width: 240, height: 128 })
    expect(model.layout.gaps).toEqual({ column: 60, row: 72, branchLane: 24 })
    expect(model.layout.label).toEqual({ fontSize: 12, paddingX: 7, paddingY: 5 })
    expect(model.viewport).toEqual({
      fitViewOnInit: false,
      minZoom: 0.3,
      maxZoom: 1.8,
      backgroundGap: 24,
    })
    expect(model.nodes.find(({ id }) => id === 'question')?.style).toMatchObject({
      width: '240px',
      height: '128px',
    })
    expect(model.nodes.find(({ id }) => id === 'trigger')?.style).toMatchObject({
      width: `${model.layout.trigger.width}px`,
      height: `${model.layout.trigger.height}px`,
    })
    expect(model.edges.find(({ source }) => source === 'question')?.data?.labelMetrics).toEqual({
      fontSize: 12,
      paddingX: 7,
      paddingY: 5,
    })
    expect(overlappingPairs(model)).toEqual([])
  })

  it('constrains long painted labels to their measured node boxes', () => {
    const model = buildScenarioGraphViewModel({
      actions: auditBranchSwapFixture.actions,
      transitions: graphTransitions(auditBranchSwapFixture.actions),
      triggerLabel: 'Очень длинное название события, которое не должно менять размеры узла запуска',
      presentAction: (action) => ({
        ...presentAction(action),
        label: 'Очень длинное название действия, которое занимает несколько строк',
      }),
    })

    expect(model.nodes.find(({ id }) => id === 'trigger')?.style).toMatchObject({
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    })
    expect(model.nodes.find(({ id }) => id === 'question')?.style).toMatchObject({
      overflow: 'hidden',
    })
    expect(overlappingPairs(model)).toEqual([])
  })

  it('classifies action, decision, wait and terminal nodes as presentation semantics', () => {
    const actions: ScenarioAction[] = [
      { position: 0, nodeKey: 'message', type: 'SAY', config: {} },
      { position: 1, nodeKey: 'question', type: 'ASK_CHOICE', config: { options: [] } },
      { position: 2, nodeKey: 'wait', type: 'WAIT_FOR_GOAL', config: {} },
      { position: 3, nodeKey: 'finish', type: 'COMPLETE_SCENARIO', config: {} },
    ]
    const model = buildScenarioGraphViewModel({
      actions,
      transitions: [],
      triggerLabel: 'Старт',
      presentAction,
    })

    expect(model.nodes.slice(1).map(({ id, data }) => ({
      id,
      kind: data.kind,
      kindLabel: data.kindLabel,
    }))).toEqual([
      { id: 'message', kind: 'action', kindLabel: 'Действие' },
      { id: 'question', kind: 'decision', kindLabel: 'Решение' },
      { id: 'wait', kind: 'wait', kindLabel: 'Ожидание' },
      { id: 'finish', kind: 'terminal', kindLabel: 'Завершение' },
    ])
  })
})
