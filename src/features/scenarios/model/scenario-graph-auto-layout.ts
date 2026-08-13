import type { ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk-api.js';
import type { Edge, Node } from '@vue-flow/core';
import type {
  ScenarioGraphEdgeData,
  ScenarioGraphNodeData,
  ScenarioGraphPoint,
  ScenarioGraphViewModel,
} from './scenario-graph-view-model';

export interface ScenarioGraphLayoutEngine {
  layout(graph: ElkNode): Promise<ElkNode>;
  terminateWorker?: () => void;
}

export interface ScenarioGraphAutoLayoutOptions {
  engine: ScenarioGraphLayoutEngine;
  measureLabel?: ScenarioGraphLabelMeasurer;
}

export interface ScenarioGraphLabelMeasureInput {
  label: string;
  kind: ScenarioGraphEdgeData['kind'];
  metrics: ScenarioGraphEdgeData['labelMetrics'];
}

export type ScenarioGraphLabelMeasurer = (input: ScenarioGraphLabelMeasureInput) => {
  width: number;
  height: number;
};

export interface ScenarioGraphAutoLayoutResult {
  viewModel: ScenarioGraphViewModel;
  status: 'laid-out' | 'fallback';
  error?: Error;
}

export function mergeScenarioGraphPresentation(
  laidOut: ScenarioGraphViewModel,
  presentation: ScenarioGraphViewModel,
): ScenarioGraphViewModel {
  const nodesById = new Map(laidOut.nodes.map((node) => [node.id, node]));
  const edgesById = new Map(laidOut.edges.map((edge) => [edge.id, edge]));
  return {
    ...presentation,
    nodes: presentation.nodes.map((node) => {
      const positioned = nodesById.get(node.id);
      if (!positioned) return node;
      const positionedPorts = new Map(actionPorts(positioned).map((port) => [port.id, port]));
      return {
        ...node,
        position: positioned.position,
        data:
          node.type === 'scenario'
            ? {
                ...(node.data as ScenarioGraphNodeData),
                ports: actionPorts(node).map((port) => ({
                  ...port,
                  position: positionedPorts.get(port.id)?.position ?? port.position,
                })),
              }
            : node.data,
      };
    }),
    edges: presentation.edges.map((edge) => {
      const routed = edgesById.get(edge.id);
      return routed
        ? {
            ...edge,
            data: {
              ...edge.data!,
              routePoints: routed.data?.routePoints,
              labelPosition: routed.data?.labelPosition,
            },
          }
        : edge;
    }),
  };
}

function portId(nodeId: string, branchId: string) {
  return `port:${nodeId}:${branchId}`;
}

function targetPortId(nodeId: string) {
  return `port:${nodeId}:target`;
}

function actionPorts(node: Node) {
  return node.type === 'scenario' ? (node.data as ScenarioGraphNodeData).ports : [];
}

export const conservativeScenarioGraphLabelSize: ScenarioGraphLabelMeasurer = ({
  label,
  kind,
  metrics,
}) => {
  const iconWidth = ['timeout', 'goal-timeout', 'fallback', 'goal'].includes(kind)
    ? metrics.fontSize + 5
    : 0;
  return {
    width:
      Math.ceil(Array.from(label).length * metrics.fontSize * 1.05) +
      metrics.paddingX * 2 +
      iconWidth +
      2,
    height: Math.max(22, metrics.fontSize + metrics.paddingY * 2 + 2),
  };
};

function labelSize(edge: Edge<ScenarioGraphEdgeData>, measureLabel: ScenarioGraphLabelMeasurer) {
  const label = edge.data?.label;
  if (!label) return undefined;
  return measureLabel({
    label,
    kind: edge.data!.kind,
    metrics: edge.data!.labelMetrics,
  });
}

function toElkGraph(
  viewModel: ScenarioGraphViewModel,
  measureLabel: ScenarioGraphLabelMeasurer,
): ElkNode {
  const { layout } = viewModel;
  const children: ElkNode[] = viewModel.nodes.map((node) => {
    const size = node.id === 'trigger' ? layout.trigger : layout.node;
    const ports = actionPorts(node);
    return {
      id: node.id,
      width: size.width,
      height: size.height,
      layoutOptions: node.id === 'trigger' ? undefined : { 'elk.portConstraints': 'FIXED_ORDER' },
      ports:
        node.id === 'trigger'
          ? []
          : [
              {
                id: targetPortId(node.id),
                width: layout.port.width,
                height: layout.port.height,
                layoutOptions: {
                  'elk.port.side': 'NORTH',
                  'elk.port.index': '0',
                },
              },
              ...ports.map((port, index) => ({
                id: portId(node.id, port.id),
                width: layout.port.width,
                height: layout.port.height,
                layoutOptions: {
                  'elk.port.side': 'SOUTH',
                  // SOUTH ports are indexed clockwise by ELK, so reverse the numeric
                  // index to keep the domain order visually left-to-right.
                  'elk.port.index': String(ports.length - 1 - index),
                },
              })),
            ],
    };
  });
  const edges: ElkExtendedEdge[] = viewModel.edges.map((edge) => {
    const size = labelSize(edge, measureLabel);
    return {
      id: edge.id,
      sources: [edge.sourceHandle ? portId(edge.source, edge.sourceHandle) : edge.source],
      targets: [targetPortId(edge.target)],
      labels: edge.data?.label && size ? [{ text: edge.data.label, ...size }] : undefined,
    };
  });

  return {
    id: 'scenario-graph',
    children,
    edges,
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.padding': '[top=24,left=24,bottom=24,right=24]',
      'elk.spacing.nodeNode': String(layout.gaps.column),
      'elk.spacing.edgeEdge': '16',
      'elk.spacing.edgeNode': '24',
      'elk.spacing.edgeLabel': '8',
      'elk.layered.spacing.nodeNodeBetweenLayers': String(layout.gaps.row),
      'elk.layered.spacing.edgeNodeBetweenLayers': '24',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.layered.cycleBreaking.strategy': 'MODEL_ORDER',
      'elk.layered.mergeEdges': 'false',
      'elk.layered.unnecessaryBendpoints': 'true',
    },
  };
}

function laidOutPorts(node: Node, elkNode: ElkNode): ScenarioGraphNodeData | Node['data'] {
  if (node.type !== 'scenario') return node.data;
  const data = node.data as ScenarioGraphNodeData;
  const elkPorts = new Map((elkNode.ports ?? []).map((port) => [port.id, port]));
  return {
    ...data,
    ports: data.ports.map((port) => {
      const laidOut = elkPorts.get(portId(node.id, port.id));
      if (laidOut?.x === undefined || !elkNode.width) return port;
      return {
        ...port,
        position: Math.max(
          0,
          Math.min(
            100,
            Math.round(
              ((laidOut.x + (laidOut.width ?? data.portSize.width) / 2) / elkNode.width) * 100,
            ),
          ),
        ),
      };
    }),
  };
}

function routePoints(edge: ElkExtendedEdge): ScenarioGraphPoint[] | undefined {
  const section = edge.sections?.[0];
  if (!section) return undefined;
  return [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
}

function applyElkLayout(viewModel: ScenarioGraphViewModel, graph: ElkNode): ScenarioGraphViewModel {
  const nodesById = new Map((graph.children ?? []).map((node) => [node.id, node]));
  const edgesById = new Map((graph.edges ?? []).map((edge) => [edge.id, edge]));
  return {
    ...viewModel,
    nodes: viewModel.nodes.map((node) => {
      const laidOut = nodesById.get(node.id);
      if (!laidOut || laidOut.x === undefined || laidOut.y === undefined) return node;
      return {
        ...node,
        position: { x: laidOut.x, y: laidOut.y },
        data: laidOutPorts(node, laidOut),
      };
    }),
    edges: viewModel.edges.map((edge) => {
      const laidOut = edgesById.get(edge.id);
      const label = laidOut?.labels?.[0];
      return {
        ...edge,
        data: {
          ...edge.data!,
          routePoints: laidOut ? routePoints(laidOut) : undefined,
          labelPosition:
            label?.x !== undefined && label.y !== undefined
              ? {
                  x: label.x + (label.width ?? 0) / 2,
                  y: label.y + (label.height ?? 0) / 2,
                }
              : undefined,
        },
      };
    }),
  };
}

export async function layoutScenarioGraphViewModel(
  viewModel: ScenarioGraphViewModel,
  options: ScenarioGraphAutoLayoutOptions,
): Promise<ScenarioGraphAutoLayoutResult> {
  try {
    const graph = await options.engine.layout(
      toElkGraph(viewModel, options.measureLabel ?? conservativeScenarioGraphLabelSize),
    );
    return {
      status: 'laid-out',
      viewModel: applyElkLayout(viewModel, graph),
    };
  } catch (cause) {
    return {
      status: 'fallback',
      viewModel,
      error: cause instanceof Error ? cause : new Error(String(cause)),
    };
  }
}
