import type { Edge } from '@vue-flow/core';
import { describe, expect, it } from 'vitest';
import {
  SCENARIO_GRAPH_MINIMAP_THRESHOLD,
  scenarioGraphBranchNodeIds,
  scenarioGraphShowsMinimap,
  scenarioGraphViewportDuration,
} from './scenario-graph-navigation';

describe('scenario graph navigation', () => {
  const edges = [
    { id: 'a-b', source: 'a', target: 'b' },
    { id: 'a-c', source: 'a', target: 'c' },
    { id: 'b-d', source: 'b', target: 'd' },
    { id: 'c-d', source: 'c', target: 'd' },
    { id: 'd-b', source: 'd', target: 'b' },
    { id: 'outside-a', source: 'outside', target: 'a' },
  ] as Edge[];

  it('returns the selected node and every reachable descendant once', () => {
    expect(scenarioGraphBranchNodeIds('a', edges)).toEqual(['a', 'b', 'c', 'd']);
    expect(scenarioGraphBranchNodeIds('c', edges)).toEqual(['c', 'd', 'b']);
  });

  it('does not invent a branch without a selected action', () => {
    expect(scenarioGraphBranchNodeIds(null, edges)).toEqual([]);
  });

  it('shows the minimap only above the documented large-graph threshold', () => {
    expect(SCENARIO_GRAPH_MINIMAP_THRESHOLD).toBe(20);
    expect(scenarioGraphShowsMinimap(20)).toBe(false);
    expect(scenarioGraphShowsMinimap(21)).toBe(true);
  });

  it('removes viewport animation when reduced motion is requested', () => {
    expect(scenarioGraphViewportDuration(false)).toBe(240);
    expect(scenarioGraphViewportDuration(true)).toBe(0);
  });
});
