import { shallowMount } from '@vue/test-utils';
import { Position, type EdgeProps } from '@vue-flow/core';
import { describe, expect, it } from 'vitest';
import ScenarioFlowEdge from './ScenarioFlowEdge.vue';
import type { ScenarioGraphEdgeData } from './model/scenario-graph-view-model';

describe('ScenarioFlowEdge', () => {
  it('renders timeout as a dashed route with an icon label chip', () => {
    const wrapper = shallowMount(ScenarioFlowEdge, {
      props: {
        id: 'question-timeout',
        source: 'question',
        target: 'finish',
        type: 'scenario',
        sourceNode: {} as EdgeProps['sourceNode'],
        targetNode: {} as EdgeProps['targetNode'],
        sourceX: 960,
        sourceY: 300,
        targetX: 900,
        targetY: 430,
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        sourceHandleId: 'timeout',
        targetHandleId: undefined,
        markerStart: '',
        markerEnd: '',
        interactionWidth: 20,
        data: {
          branchId: 'timeout',
          kind: 'timeout',
          label: 'Тайм-аут',
          routeIndex: 2,
          routeCount: 3,
          laneGap: 24,
          labelMetrics: { fontSize: 11, paddingX: 6, paddingY: 4 },
        },
        events: {} as EdgeProps<ScenarioGraphEdgeData>['events'],
      },
      global: {
        stubs: {
          BaseEdge: {
            name: 'BaseEdge',
            props: ['path', 'style'],
            template: '<span class="base-edge-stub" />',
          },
          EdgeLabelRenderer: {
            template: '<div class="edge-label-renderer-stub"><slot /></div>',
          },
        },
      },
    });

    const edge = wrapper.getComponent({ name: 'BaseEdge' });
    expect(edge.props('path')).toContain('M 960 300');
    expect(edge.props('style')).toMatchObject({ strokeDasharray: '7 5' });
    expect(wrapper.get('.scenario-edge-label-timeout').attributes('data-branch-id')).toBe(
      'timeout',
    );
    expect(wrapper.find('.scenario-edge-label-timeout .pi-clock').exists()).toBe(true);
    expect(wrapper.get('.scenario-edge-label-timeout').text()).toBe('Тайм-аут');
  });

  it('renders fallback as a dotted route with a non-color icon cue', () => {
    const wrapper = shallowMount(ScenarioFlowEdge, {
      props: {
        id: 'condition-fallback',
        source: 'condition',
        target: 'finish',
        type: 'scenario',
        sourceNode: {} as EdgeProps['sourceNode'],
        targetNode: {} as EdgeProps['targetNode'],
        sourceX: 960,
        sourceY: 300,
        targetX: 900,
        targetY: 430,
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        sourceHandleId: 'fallback',
        targetHandleId: undefined,
        markerStart: '',
        markerEnd: '',
        interactionWidth: 20,
        data: {
          branchId: 'fallback',
          kind: 'fallback',
          label: 'Иначе',
          routeIndex: 1,
          routeCount: 2,
          laneGap: 24,
          labelMetrics: { fontSize: 11, paddingX: 6, paddingY: 4 },
        },
        events: {} as EdgeProps<ScenarioGraphEdgeData>['events'],
      },
      global: {
        stubs: {
          BaseEdge: {
            name: 'BaseEdge',
            props: ['path', 'style'],
            template: '<span class="base-edge-stub" />',
          },
          EdgeLabelRenderer: {
            template: '<div class="edge-label-renderer-stub"><slot /></div>',
          },
        },
      },
    });

    const edge = wrapper.getComponent({ name: 'BaseEdge' });
    expect(edge.props('style')).toMatchObject({ strokeDasharray: '2 5' });
    expect(wrapper.get('.scenario-edge-label-fallback').attributes('data-branch-kind')).toBe(
      'fallback',
    );
    expect(wrapper.find('.scenario-edge-label-fallback .pi-ellipsis-h').exists()).toBe(true);
    expect(wrapper.get('.scenario-edge-label-fallback').text()).toBe('Иначе');
  });
});
