import type { ViewportTransform } from '@vue-flow/core';
import type { ScenarioGraphPoint, ScenarioGraphViewModel } from './scenario-graph-view-model';

export const SCENARIO_GRAPH_LAYOUT_VERSION = 1 as const;

export type ScenarioGraphLayoutMode = 'auto' | 'manual';

export interface ScenarioGraphLayoutNode extends ScenarioGraphPoint {
  pinned: boolean;
}

export interface ScenarioGraphLayout {
  version: typeof SCENARIO_GRAPH_LAYOUT_VERSION;
  mode: ScenarioGraphLayoutMode;
  nodes: Record<string, ScenarioGraphLayoutNode>;
  viewport?: ViewportTransform;
}

export interface ScenarioGraphLayoutScope {
  operatorId: string;
  projectId: string;
  scenarioId: string;
}

export function createAutoScenarioGraphLayout(): ScenarioGraphLayout {
  return {
    version: SCENARIO_GRAPH_LAYOUT_VERSION,
    mode: 'auto',
    nodes: {},
  };
}

export function createManualScenarioGraphLayout(
  viewModel: ScenarioGraphViewModel,
  viewport?: ViewportTransform,
): ScenarioGraphLayout {
  return {
    version: SCENARIO_GRAPH_LAYOUT_VERSION,
    mode: 'manual',
    nodes: Object.fromEntries(
      viewModel.nodes
        .filter(({ id }) => id !== 'trigger')
        .map(({ id, position }) => [id, { ...position, pinned: false }]),
    ),
    ...(viewport ? { viewport: { ...viewport } } : {}),
  };
}

export function moveScenarioGraphNode(
  layout: ScenarioGraphLayout,
  nodeId: string,
  position: ScenarioGraphPoint,
): ScenarioGraphLayout {
  if (layout.mode !== 'manual' || nodeId === 'trigger') return layout;
  return {
    ...layout,
    nodes: {
      ...layout.nodes,
      [nodeId]: { ...position, pinned: true },
    },
  };
}

export type ScenarioGraphNudgeDirection = 'up' | 'right' | 'down' | 'left';

export function nudgeScenarioGraphNode(
  layout: ScenarioGraphLayout,
  nodeId: string,
  direction: ScenarioGraphNudgeDirection,
  distance = 24,
): ScenarioGraphLayout {
  const current = layout.nodes[nodeId];
  if (layout.mode !== 'manual' || !current) return layout;
  const delta = {
    up: { x: 0, y: -distance },
    right: { x: distance, y: 0 },
    down: { x: 0, y: distance },
    left: { x: -distance, y: 0 },
  }[direction];
  return moveScenarioGraphNode(layout, nodeId, {
    x: current.x + delta.x,
    y: current.y + delta.y,
  });
}

export function updateScenarioGraphViewport(
  layout: ScenarioGraphLayout,
  viewport: ViewportTransform,
): ScenarioGraphLayout {
  return { ...layout, viewport: { ...viewport } };
}

export function renameScenarioGraphLayoutNode(
  layout: ScenarioGraphLayout,
  oldNodeId: string,
  newNodeId: string,
): ScenarioGraphLayout {
  const current = layout.nodes[oldNodeId];
  if (layout.mode !== 'manual' || !current || oldNodeId === newNodeId) return layout;
  const nodes = { ...layout.nodes };
  delete nodes[oldNodeId];
  nodes[newNodeId] = current;
  return { ...layout, nodes };
}

export function applyScenarioGraphLayout(
  viewModel: ScenarioGraphViewModel,
  layout: ScenarioGraphLayout,
): ScenarioGraphViewModel {
  if (layout.mode !== 'manual') return viewModel;
  return {
    ...viewModel,
    nodes: viewModel.nodes.map((node) => {
      const manual = layout.nodes[node.id];
      return manual ? { ...node, position: { x: manual.x, y: manual.y } } : node;
    }),
    edges: viewModel.edges.map((edge) => ({
      ...edge,
      data: {
        ...edge.data!,
        routePoints: undefined,
        labelPosition: undefined,
      },
    })),
  };
}

export function reconcileScenarioGraphLayout(
  layout: ScenarioGraphLayout,
  viewModel: ScenarioGraphViewModel,
): ScenarioGraphLayout {
  if (layout.mode !== 'manual') return layout;
  const actionNodes = viewModel.nodes.filter(({ id }) => id !== 'trigger');
  const activeIds = new Set(actionNodes.map(({ id }) => id));
  const nodes = Object.fromEntries(
    Object.entries(layout.nodes).filter(([id]) => activeIds.has(id)),
  );
  let nextY =
    Math.max(
      viewModel.layout.origin.actions.y,
      ...Object.values(nodes).map(({ y }) => y + viewModel.layout.node.height),
    ) + viewModel.layout.gaps.row;
  for (const node of actionNodes) {
    if (nodes[node.id]) continue;
    nodes[node.id] = {
      x: node.position.x,
      y: Math.max(node.position.y, nextY),
      pinned: false,
    };
    nextY = nodes[node.id]!.y + viewModel.layout.node.height + viewModel.layout.gaps.row;
  }
  return { ...layout, nodes };
}

export function scenarioGraphLayoutStorageKey(scope: ScenarioGraphLayoutScope): string {
  return `retenive:scenario-graph-layout:v${SCENARIO_GRAPH_LAYOUT_VERSION}:${[
    scope.operatorId,
    scope.projectId,
    scope.scenarioId,
  ]
    .map(encodeURIComponent)
    .join(':')}`;
}

export function removeScenarioGraphLayout(storage: Storage, scope: ScenarioGraphLayoutScope) {
  try {
    storage.removeItem(scenarioGraphLayoutStorageKey(scope));
  } catch {
    // A stale convenience layout must never block authoring.
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseScenarioGraphLayout(value: unknown): ScenarioGraphLayout | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.version !== SCENARIO_GRAPH_LAYOUT_VERSION ||
    (candidate.mode !== 'auto' && candidate.mode !== 'manual') ||
    !candidate.nodes ||
    typeof candidate.nodes !== 'object' ||
    Array.isArray(candidate.nodes)
  )
    return null;
  const nodes: Record<string, ScenarioGraphLayoutNode> = {};
  for (const [id, raw] of Object.entries(candidate.nodes)) {
    if (!id || !raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const node = raw as Record<string, unknown>;
    if (!isFiniteNumber(node.x) || !isFiniteNumber(node.y) || typeof node.pinned !== 'boolean') {
      return null;
    }
    nodes[id] = { x: node.x, y: node.y, pinned: node.pinned };
  }
  const rawViewport = candidate.viewport;
  const viewport =
    rawViewport && typeof rawViewport === 'object' && !Array.isArray(rawViewport)
      ? (rawViewport as Record<string, unknown>)
      : undefined;
  if (
    viewport &&
    (!isFiniteNumber(viewport.x) || !isFiniteNumber(viewport.y) || !isFiniteNumber(viewport.zoom))
  )
    return null;
  return {
    version: SCENARIO_GRAPH_LAYOUT_VERSION,
    mode: candidate.mode,
    nodes,
    ...(viewport
      ? {
          viewport: {
            x: viewport.x as number,
            y: viewport.y as number,
            zoom: viewport.zoom as number,
          },
        }
      : {}),
  };
}

export function loadScenarioGraphLayout(
  storage: Storage,
  scope: ScenarioGraphLayoutScope,
): ScenarioGraphLayout {
  try {
    const raw = storage.getItem(scenarioGraphLayoutStorageKey(scope));
    if (!raw) return createAutoScenarioGraphLayout();
    return parseScenarioGraphLayout(JSON.parse(raw)) ?? createAutoScenarioGraphLayout();
  } catch {
    return createAutoScenarioGraphLayout();
  }
}

export function persistScenarioGraphLayout(
  storage: Storage,
  scope: ScenarioGraphLayoutScope,
  layout: ScenarioGraphLayout,
) {
  try {
    storage.setItem(scenarioGraphLayoutStorageKey(scope), JSON.stringify(layout));
  } catch {
    // Layout persistence is personal convenience state and must never block authoring.
  }
}
