import { shallowMount } from '@vue/test-utils';
import type { NodeProps } from '@vue-flow/core';
import { describe, expect, it } from 'vitest';
import ScenarioFlowNode from './ScenarioFlowNode.vue';

describe('ScenarioFlowNode', () => {
  it('renders semantic source handles in domain order', () => {
    const wrapper = shallowMount(ScenarioFlowNode, {
      props: {
        id: 'question',
        type: 'scenario',
        selected: false,
        connectable: false,
        position: { x: 0, y: 0 },
        dimensions: { width: 228, height: 120 },
        dragging: false,
        resizing: false,
        zIndex: 0,
        events: {} as NodeProps['events'],
        data: {
          label: 'Задать вопрос',
          nodeKey: 'question',
          icon: 'pi pi-question-circle',
          executor: 'SERVER',
          summary: 'Продолжить?',
          issueCount: 0,
          kind: 'decision',
          kindLabel: 'Решение',
          portSize: { width: 9, height: 9 },
          ports: [
            { id: 'choice:yes', label: 'Да', position: 25 },
            { id: 'choice:no', label: 'Нет', position: 50 },
            { id: 'timeout', label: 'Тайм-аут', position: 75 },
          ],
        },
      },
      global: {
        stubs: {
          Handle: {
            props: ['id', 'type', 'position'],
            template: '<span class="handle-stub" :data-id="id" :data-type="type" />',
          },
        },
      },
    });

    expect(
      wrapper.findAll('.handle-stub').map((handle) => ({
        id: handle.attributes('data-id'),
        type: handle.attributes('data-type'),
      })),
    ).toEqual([
      { id: 'target', type: 'target' },
      { id: 'choice:yes', type: 'source' },
      { id: 'choice:no', type: 'source' },
      { id: 'timeout', type: 'source' },
    ]);
  });

  it('renders the node kind as text and styling instead of relying on color or system code', () => {
    const wrapper = shallowMount(ScenarioFlowNode, {
      props: {
        id: 'wait',
        type: 'scenario',
        selected: true,
        connectable: false,
        position: { x: 0, y: 0 },
        dimensions: { width: 228, height: 120 },
        dragging: false,
        resizing: false,
        zIndex: 0,
        events: {} as NodeProps['events'],
        data: {
          label: 'Ждать оплату',
          nodeKey: 'wait_for_payment',
          icon: 'pi pi-clock',
          executor: 'SERVER',
          summary: 'До 24 часов',
          issueCount: 0,
          kind: 'wait',
          kindLabel: 'Ожидание',
          portSize: { width: 9, height: 9 },
          ports: [],
        },
      },
      global: { stubs: { Handle: true } },
    });

    expect(wrapper.get('.flow-node').classes()).toContain('kind-wait');
    expect(wrapper.get('.node-kind').text()).toBe('Ожидание');
    expect(wrapper.get('.node-title').text()).toBe('Ждать оплату');
    expect(wrapper.get('.node-key').text()).toBe('wait_for_payment');
  });
});
