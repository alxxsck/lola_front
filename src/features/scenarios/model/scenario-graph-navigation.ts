import type { Edge } from '@vue-flow/core';

export const SCENARIO_GRAPH_MINIMAP_THRESHOLD = 20;

export function scenarioGraphViewportDuration(
  reducedMotion = typeof window !== 'undefined' &&
    Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches),
) {
  return reducedMotion ? 0 : 240;
}

export function scenarioGraphShowsMinimap(actionCount: number) {
  return actionCount > SCENARIO_GRAPH_MINIMAP_THRESHOLD;
}

export function scenarioGraphBranchNodeIds(
  selectedNodeId: string | null | undefined,
  edges: Edge[],
) {
  if (!selectedNodeId) return [];
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    const targets = outgoing.get(edge.source) ?? [];
    targets.push(edge.target);
    outgoing.set(edge.source, targets);
  }
  const visited = new Set<string>();
  const pending = [selectedNodeId];
  while (pending.length) {
    const current = pending.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    pending.push(...(outgoing.get(current) ?? []));
  }
  return [...visited];
}
