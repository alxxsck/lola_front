import { Position, type Edge, type Node } from '@vue-flow/core'
import type { ScenarioAction } from '@/shared/types/domain'
import {
  graphTransitionId,
  type GraphTransition,
} from './scenario-graph'

export interface ScenarioGraphSize {
  width: number
  height: number
}

export interface ScenarioGraphPoint {
  x: number
  y: number
}

export interface ScenarioGraphLabelMetrics {
  fontSize: number
  paddingX: number
  paddingY: number
}

export interface ScenarioGraphViewportOptions {
  fitViewOnInit: boolean
  minZoom: number
  compactMinZoom: number
  maxZoom: number
  backgroundGap: number
}

export interface ScenarioGraphLayoutOptions {
  node: ScenarioGraphSize
  trigger: ScenarioGraphSize
  port: ScenarioGraphSize
  label: ScenarioGraphLabelMetrics
  gaps: {
    column: number
    row: number
    branchLane: number
  }
  origin: {
    trigger: ScenarioGraphPoint
    actions: ScenarioGraphPoint
  }
}

type ScenarioGraphViewOverrides = {
  node?: Partial<ScenarioGraphSize>
  trigger?: Partial<ScenarioGraphSize>
  port?: Partial<ScenarioGraphSize>
  label?: Partial<ScenarioGraphLabelMetrics>
  gaps?: Partial<ScenarioGraphLayoutOptions['gaps']>
  origin?: {
    trigger?: Partial<ScenarioGraphPoint>
    actions?: Partial<ScenarioGraphPoint>
  }
  viewport?: Partial<ScenarioGraphViewportOptions>
}

export interface ScenarioGraphActionPresentation extends Record<string, unknown> {
  label: string
  nodeKey: string
  icon: string
  executor: string
  summary: string
  issueCount: number
}

export type ScenarioGraphNodeKind = 'action' | 'decision' | 'wait' | 'terminal'

export interface ScenarioGraphNodePresentation {
  kind: ScenarioGraphNodeKind
  kindLabel: string
  icon: string
}

export interface ScenarioGraphNodeData extends ScenarioGraphActionPresentation {
  kind: ScenarioGraphNodeKind
  kindLabel: string
  ports: ScenarioGraphPort[]
  portSize: ScenarioGraphSize
}

export interface ScenarioGraphPort {
  id: string
  label?: string
  position: number
}

export interface ScenarioGraphEdgeData extends Record<string, unknown> {
  branchId: string
  kind: GraphTransition['kind'] | 'trigger'
  label?: string
  routeIndex: number
  routeCount: number
  laneGap: number
  labelMetrics: ScenarioGraphLabelMetrics
  routePoints?: ScenarioGraphPoint[]
  labelPosition?: ScenarioGraphPoint
}

export interface ScenarioGraphViewModelInput {
  actions: ScenarioAction[]
  transitions: GraphTransition[]
  triggerLabel: string
  presentAction: (action: ScenarioAction) => ScenarioGraphActionPresentation
}

export interface ScenarioGraphViewModel {
  nodes: Node[]
  edges: Edge<ScenarioGraphEdgeData>[]
  layout: ScenarioGraphLayoutOptions
  viewport: ScenarioGraphViewportOptions
}

export const DEFAULT_SCENARIO_GRAPH_LAYOUT: Readonly<ScenarioGraphLayoutOptions> = {
  node: { width: 228, height: 120 },
  trigger: { width: 205, height: 44 },
  port: { width: 9, height: 9 },
  label: { fontSize: 11, paddingX: 6, paddingY: 4 },
  gaps: { column: 52, row: 70, branchLane: 24 },
  origin: {
    trigger: { x: 332, y: 24 },
    actions: { x: 320, y: 180 },
  },
}

export const DEFAULT_SCENARIO_GRAPH_VIEWPORT: Readonly<ScenarioGraphViewportOptions> = {
  fitViewOnInit: false,
  minZoom: 0.25,
  compactMinZoom: 0.05,
  maxZoom: 1.6,
  backgroundGap: 22,
}

function scenarioGraphNodeKindLabel(kind: ScenarioGraphNodeKind) {
  if (kind === 'decision') return 'Решение'
  if (kind === 'wait') return 'Ожидание'
  if (kind === 'terminal') return 'Завершение'
  return 'Действие'
}

export function scenarioGraphNodePresentation(
  type: string,
  executor = 'SERVER',
): ScenarioGraphNodePresentation {
  const kind: ScenarioGraphNodeKind =
    type === 'ASK_CHOICE' || type === 'CONDITION'
      ? 'decision'
      : type === 'WAIT_FOR_GOAL'
        ? 'wait'
        : type === 'COMPLETE_SCENARIO' || type === 'CLOSE_CHAT'
          ? 'terminal'
          : 'action'
  return {
    kind,
    kindLabel: scenarioGraphNodeKindLabel(kind),
    icon:
      kind === 'decision'
        ? 'pi pi-directions-alt'
        : kind === 'wait'
          ? 'pi pi-clock'
          : kind === 'terminal'
            ? 'pi pi-flag-fill'
            : executor === 'FRONTEND'
              ? 'pi pi-desktop'
              : 'pi pi-server',
  }
}

function resolveLayout(
  overrides: ScenarioGraphViewOverrides,
): ScenarioGraphLayoutOptions {
  return {
    node: { ...DEFAULT_SCENARIO_GRAPH_LAYOUT.node, ...overrides.node },
    trigger: { ...DEFAULT_SCENARIO_GRAPH_LAYOUT.trigger, ...overrides.trigger },
    port: { ...DEFAULT_SCENARIO_GRAPH_LAYOUT.port, ...overrides.port },
    label: { ...DEFAULT_SCENARIO_GRAPH_LAYOUT.label, ...overrides.label },
    gaps: { ...DEFAULT_SCENARIO_GRAPH_LAYOUT.gaps, ...overrides.gaps },
    origin: {
      trigger: {
        ...DEFAULT_SCENARIO_GRAPH_LAYOUT.origin.trigger,
        ...overrides.origin?.trigger,
      },
      actions: {
        ...DEFAULT_SCENARIO_GRAPH_LAYOUT.origin.actions,
        ...overrides.origin?.actions,
      },
    },
  }
}

function resolveViewport(
  overrides: ScenarioGraphViewOverrides,
): ScenarioGraphViewportOptions {
  return { ...DEFAULT_SCENARIO_GRAPH_VIEWPORT, ...overrides.viewport }
}

function actionDepths(actions: ScenarioAction[], transitions: GraphTransition[]) {
  const ordered = [...actions].sort((left, right) => left.position - right.position)
  const keys = new Set(ordered.flatMap(({ nodeKey }) => nodeKey ? [nodeKey] : []))
  const depth = new Map<string, number>()
  ordered.forEach((action, index) => depth.set(action.nodeKey ?? '', index ? 1 : 0))

  for (const action of ordered) {
    const source = action.nodeKey ?? ''
    const sourceDepth = depth.get(source) ?? 0
    for (const transition of transitions) {
      if (transition.source !== source || !keys.has(transition.target)) continue
      depth.set(
        transition.target,
        Math.max(depth.get(transition.target) ?? 0, sourceDepth + 1),
      )
    }
  }
  return depth
}

export function buildScenarioGraphViewModel(
  input: ScenarioGraphViewModelInput,
  overrides: ScenarioGraphViewOverrides = {},
): ScenarioGraphViewModel {
  const layout = resolveLayout(overrides)
  const viewport = resolveViewport(overrides)
  const ordered = [...input.actions].sort((left, right) => left.position - right.position)
  const depths = actionDepths(ordered, input.transitions)
  const outgoingBySource = new Map<string, GraphTransition[]>()
  for (const transition of input.transitions) {
    outgoingBySource.set(transition.source, [
      ...(outgoingBySource.get(transition.source) ?? []),
      transition,
    ])
  }
  const levels = new Map<number, ScenarioAction[]>()
  for (const action of ordered) {
    const level = depths.get(action.nodeKey ?? '') ?? action.position
    levels.set(level, [...(levels.get(level) ?? []), action])
  }

  const nodes: Node[] = [{
    id: 'trigger',
    type: 'input',
    position: { ...layout.origin.trigger },
    style: {
      width: `${layout.trigger.width}px`,
      height: `${layout.trigger.height}px`,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    sourcePosition: Position.Bottom,
    selectable: false,
    draggable: false,
    data: { label: input.triggerLabel },
  }]
  const columnStep = layout.node.width + layout.gaps.column
  let levelY = layout.origin.actions.y

  for (const [, levelActions] of [...levels.entries()].sort(([left], [right]) => left - right)) {
    const totalWidth = (levelActions.length - 1) * columnStep
    levelActions.forEach((action, column) => {
      const outgoing = outgoingBySource.get(action.nodeKey ?? '') ?? []
      const presentation = input.presentAction(action)
      const semantics = scenarioGraphNodePresentation(action.type, presentation.executor)
      const data: ScenarioGraphNodeData = {
        ...presentation,
        ...semantics,
        portSize: layout.port,
        ports: outgoing.map((transition, index) => ({
          id: transition.branchId,
          label: transition.label,
          position: Math.round(((index + 1) / (outgoing.length + 1)) * 100),
        })),
      }
      nodes.push({
        id: action.nodeKey ?? `step_${action.position}`,
        type: 'scenario',
        position: {
          x: layout.origin.actions.x - totalWidth / 2 + column * columnStep,
          y: levelY,
        },
        style: {
          width: `${layout.node.width}px`,
          height: `${layout.node.height}px`,
          overflow: 'hidden',
        },
        data,
      })
    })
    const maxPorts = Math.max(
      1,
      ...levelActions.map((action) => outgoingBySource.get(action.nodeKey ?? '')?.length ?? 0),
    )
    levelY += layout.node.height
      + layout.gaps.row
      + (maxPorts - 1) * layout.gaps.branchLane
  }

  const edges: Edge<ScenarioGraphEdgeData>[] = ordered[0]?.nodeKey
    ? [{
        id: 'trigger-edge',
        source: 'trigger',
        target: ordered[0].nodeKey,
        targetHandle: 'target',
        type: 'smoothstep',
        animated: true,
        data: {
          branchId: 'trigger',
          kind: 'trigger',
          routeIndex: 0,
          routeCount: 1,
          laneGap: layout.gaps.branchLane,
          labelMetrics: layout.label,
        },
      }]
    : []

  for (const transition of input.transitions) {
    const outgoing = outgoingBySource.get(transition.source) ?? []
    const routeIndex = outgoing.findIndex(({ branchId }) => branchId === transition.branchId)
    edges.push({
      id: graphTransitionId(transition),
      source: transition.source,
      target: transition.target,
      label: transition.label,
      type: 'scenario',
      sourceHandle: transition.branchId,
      targetHandle: 'target',
      animated: transition.kind === 'default',
      class: `scenario-edge scenario-edge-${transition.kind}`,
      ariaLabel: transition.label
        ? `Переход «${transition.label}» из шага ${transition.source}`
        : `Переход из шага ${transition.source}`,
      data: {
        branchId: transition.branchId,
        kind: transition.kind,
        label: transition.label,
        routeIndex,
        routeCount: outgoing.length,
        laneGap: layout.gaps.branchLane,
        labelMetrics: layout.label,
      },
      style: {
        stroke: transition.kind === 'timeout'
          ? 'var(--status-danger)'
          : transition.kind === 'fallback'
            ? 'var(--graph-edge)'
            : 'var(--graph-selection)',
        strokeWidth: 2,
      },
    })
  }

  return { nodes, edges, layout, viewport }
}
