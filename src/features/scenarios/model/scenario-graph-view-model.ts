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
  maxZoom: number
  backgroundGap: number
}

export interface ScenarioGraphLayoutOptions {
  node: ScenarioGraphSize
  trigger: ScenarioGraphSize
  label: ScenarioGraphLabelMetrics
  gaps: {
    column: number
    row: number
  }
  origin: {
    trigger: ScenarioGraphPoint
    actions: ScenarioGraphPoint
  }
}

type ScenarioGraphViewOverrides = {
  node?: Partial<ScenarioGraphSize>
  trigger?: Partial<ScenarioGraphSize>
  label?: Partial<ScenarioGraphLabelMetrics>
  gaps?: Partial<ScenarioGraphLayoutOptions['gaps']>
  origin?: {
    trigger?: Partial<ScenarioGraphPoint>
    actions?: Partial<ScenarioGraphPoint>
  }
  viewport?: Partial<ScenarioGraphViewportOptions>
}

export interface ScenarioGraphNodeData extends Record<string, unknown> {
  label: string
  nodeKey: string
  icon: string
  executor: string
  summary: string
  issueCount: number
}

export type ScenarioGraphActionPresentation = ScenarioGraphNodeData

export interface ScenarioGraphEdgeData extends Record<string, unknown> {
  branchId: string
  kind: GraphTransition['kind'] | 'trigger'
  label?: string
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
  label: { fontSize: 11, paddingX: 6, paddingY: 4 },
  gaps: { column: 52, row: 70 },
  origin: {
    trigger: { x: 332, y: 24 },
    actions: { x: 320, y: 180 },
  },
}

export const DEFAULT_SCENARIO_GRAPH_VIEWPORT: Readonly<ScenarioGraphViewportOptions> = {
  fitViewOnInit: true,
  minZoom: 0.25,
  maxZoom: 1.6,
  backgroundGap: 22,
}

function resolveLayout(
  overrides: ScenarioGraphViewOverrides,
): ScenarioGraphLayoutOptions {
  return {
    node: { ...DEFAULT_SCENARIO_GRAPH_LAYOUT.node, ...overrides.node },
    trigger: { ...DEFAULT_SCENARIO_GRAPH_LAYOUT.trigger, ...overrides.trigger },
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
  const rowStep = layout.node.height + layout.gaps.row

  for (const [level, levelActions] of [...levels.entries()].sort(([left], [right]) => left - right)) {
    const totalWidth = (levelActions.length - 1) * columnStep
    levelActions.forEach((action, column) => {
      const data = input.presentAction(action)
      nodes.push({
        id: action.nodeKey ?? `step_${action.position}`,
        type: 'scenario',
        position: {
          x: layout.origin.actions.x - totalWidth / 2 + column * columnStep,
          y: layout.origin.actions.y + level * rowStep,
        },
        style: {
          width: `${layout.node.width}px`,
          height: `${layout.node.height}px`,
          overflow: 'hidden',
        },
        data,
      })
    })
  }

  const edges: Edge<ScenarioGraphEdgeData>[] = ordered[0]?.nodeKey
    ? [{
        id: 'trigger-edge',
        source: 'trigger',
        target: ordered[0].nodeKey,
        type: 'smoothstep',
        animated: true,
        data: { branchId: 'trigger', kind: 'trigger' },
      }]
    : []

  for (const transition of input.transitions) {
    edges.push({
      id: graphTransitionId(transition),
      source: transition.source,
      target: transition.target,
      label: transition.label,
      type: 'smoothstep',
      animated: transition.kind === 'default',
      data: {
        branchId: transition.branchId,
        kind: transition.kind,
        label: transition.label,
      },
      style: {
        stroke: transition.kind === 'timeout'
          ? 'var(--status-danger)'
          : transition.kind === 'fallback'
            ? 'var(--graph-edge)'
            : 'var(--graph-selection)',
        strokeWidth: 2,
      },
      labelStyle: {
        fill: 'var(--text-secondary)',
        fontSize: layout.label.fontSize,
        fontWeight: 600,
      },
      labelBgPadding: [layout.label.paddingX, layout.label.paddingY],
      labelBgStyle: { fill: 'var(--graph-node)', fillOpacity: 0.92 },
    })
  }

  return { nodes, edges, layout, viewport }
}
