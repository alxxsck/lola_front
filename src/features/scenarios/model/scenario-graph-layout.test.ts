import { describe, expect, it } from 'vitest';
import { choiceTimeoutParallelFixture } from '@/features/scenarios/testing/scenario-graph-fixtures';
import { graphTransitions } from './scenario-graph';
import { buildScenarioGraphViewModel } from './scenario-graph-view-model';
import {
  applyScenarioGraphLayout,
  createAutoScenarioGraphLayout,
  createManualScenarioGraphLayout,
  loadScenarioGraphLayout,
  moveScenarioGraphNode,
  nudgeScenarioGraphNode,
  persistScenarioGraphLayout,
  reconcileScenarioGraphLayout,
  removeScenarioGraphLayout,
  renameScenarioGraphLayoutNode,
  scenarioGraphLayoutStorageKey,
  updateScenarioGraphViewport,
} from './scenario-graph-layout';

const presentAction = (action: (typeof choiceTimeoutParallelFixture.actions)[number]) => ({
  label: action.type,
  nodeKey: action.nodeKey ?? '',
  icon: 'pi pi-bolt',
  executor: 'SERVER',
  summary: action.nodeKey ?? '',
  issueCount: 0,
});

describe('ScenarioGraphLayout', () => {
  it('moves presentation nodes without changing the scenario domain payload', () => {
    const actions = structuredClone(choiceTimeoutParallelFixture.actions);
    const domainPayloadBefore = JSON.stringify(actions);
    const autoViewModel = buildScenarioGraphViewModel({
      actions,
      transitions: graphTransitions(actions),
      triggerLabel: 'Регистрация завершена',
      presentAction,
    });
    autoViewModel.edges[0]!.data!.routePoints = [
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ];

    const manual = createManualScenarioGraphLayout(autoViewModel, {
      x: -120,
      y: 80,
      zoom: 0.75,
    });
    const moved = moveScenarioGraphNode(manual, 'question', { x: 640, y: 280 });
    const presented = applyScenarioGraphLayout(autoViewModel, moved);

    expect(JSON.stringify(actions)).toBe(domainPayloadBefore);
    expect(moved).toMatchObject({
      version: 1,
      mode: 'manual',
      nodes: {
        question: { x: 640, y: 280, pinned: true },
      },
      viewport: { x: -120, y: 80, zoom: 0.75 },
    });
    expect(presented.nodes.find(({ id }) => id === 'question')?.position).toEqual({
      x: 640,
      y: 280,
    });
    expect(presented.edges[0]!.data!.routePoints).toBeUndefined();
    expect(presented.edges[0]!.data!.labelPosition).toBeUndefined();
  });

  it('round-trips a personal project-and-scenario scoped layout and ignores corrupt data', () => {
    const storage = new Map<string, string>();
    const adapter: Storage = {
      get length() {
        return storage.size;
      },
      clear: () => storage.clear(),
      getItem: (key) => storage.get(key) ?? null,
      key: (index) => [...storage.keys()][index] ?? null,
      removeItem: (key) => {
        storage.delete(key);
      },
      setItem: (key, value) => {
        storage.set(key, value);
      },
    };
    const scope = {
      operatorId: 'operator-1',
      projectId: 'project-1',
      scenarioId: 'scenario-1',
    };
    const layout = {
      ...createAutoScenarioGraphLayout(),
      mode: 'manual' as const,
      nodes: { intro: { x: 320, y: 240, pinned: true } },
      viewport: { x: -20, y: 45, zoom: 0.8 },
    };

    persistScenarioGraphLayout(adapter, scope, layout);

    expect(scenarioGraphLayoutStorageKey(scope)).toBe(
      'retenive:scenario-graph-layout:v1:operator-1:project-1:scenario-1',
    );
    expect(loadScenarioGraphLayout(adapter, scope)).toEqual(layout);

    storage.set(scenarioGraphLayoutStorageKey(scope), '{"version":2}');
    expect(loadScenarioGraphLayout(adapter, scope)).toEqual(createAutoScenarioGraphLayout());
    removeScenarioGraphLayout(adapter, scope);
    expect(storage.has(scenarioGraphLayoutStorageKey(scope))).toBe(false);
  });

  it('keeps existing manual nodes stable while placing new nodes incrementally', () => {
    const initialActions = structuredClone(choiceTimeoutParallelFixture.actions.slice(0, 2));
    const initialModel = buildScenarioGraphViewModel({
      actions: initialActions,
      transitions: graphTransitions(initialActions),
      triggerLabel: 'Регистрация завершена',
      presentAction,
    });
    const manual = moveScenarioGraphNode(
      createManualScenarioGraphLayout(initialModel),
      initialActions[0]!.nodeKey!,
      { x: 720, y: 360 },
    );
    const nextActions = [
      ...structuredClone(choiceTimeoutParallelFixture.actions),
      {
        position: 2,
        nodeKey: 'follow_up',
        nextNodeKey: null,
        type: 'SAY' as const,
        config: {},
      },
    ];
    const nextModel = buildScenarioGraphViewModel({
      actions: nextActions,
      transitions: graphTransitions(nextActions),
      triggerLabel: 'Регистрация завершена',
      presentAction,
    });

    const reconciled = reconcileScenarioGraphLayout(manual, nextModel);

    expect(reconciled.nodes[initialActions[0]!.nodeKey!]).toEqual({
      x: 720,
      y: 360,
      pinned: true,
    });
    expect(reconciled.nodes.follow_up!.y).toBeGreaterThan(480);
    expect(createAutoScenarioGraphLayout()).toEqual({
      version: 1,
      mode: 'auto',
      nodes: {},
    });

    const reducedModel = buildScenarioGraphViewModel({
      actions: [nextActions[0]!],
      transitions: [],
      triggerLabel: 'Регистрация завершена',
      presentAction,
    });
    const reduced = reconcileScenarioGraphLayout(reconciled, reducedModel);
    expect(reduced.nodes).toEqual({
      [nextActions[0]!.nodeKey!]: { x: 720, y: 360, pinned: true },
    });
  });

  it('offers keyboard-sized movement and stores the last viewport without mutating inputs', () => {
    const initial = {
      ...createAutoScenarioGraphLayout(),
      mode: 'manual' as const,
      nodes: { intro: { x: 100, y: 200, pinned: false } },
    };

    const nudged = nudgeScenarioGraphNode(initial, 'intro', 'left');
    const withViewport = updateScenarioGraphViewport(nudged, {
      x: -40,
      y: 24,
      zoom: 1.1,
    });

    expect(initial.nodes.intro).toEqual({ x: 100, y: 200, pinned: false });
    expect(nudged.nodes.intro).toEqual({ x: 76, y: 200, pinned: true });
    expect(withViewport.viewport).toEqual({ x: -40, y: 24, zoom: 1.1 });
  });

  it('keeps a manual position and pin when an inspector renames the node key', () => {
    const layout = {
      ...createAutoScenarioGraphLayout(),
      mode: 'manual' as const,
      nodes: {
        intro: { x: 440, y: 260, pinned: true },
        finish: { x: 440, y: 500, pinned: false },
      },
    };

    const renamed = renameScenarioGraphLayoutNode(layout, 'intro', 'welcome');

    expect(renamed.nodes).toEqual({
      welcome: { x: 440, y: 260, pinned: true },
      finish: { x: 440, y: 500, pinned: false },
    });
    expect(layout.nodes.intro).toEqual({ x: 440, y: 260, pinned: true });
  });
});
