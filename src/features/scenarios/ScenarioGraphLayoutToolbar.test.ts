import { shallowMount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ScenarioGraphLayoutToolbar from './ScenarioGraphLayoutToolbar.vue';

const mountToolbar = (props: Record<string, unknown> = {}) =>
  shallowMount(ScenarioGraphLayoutToolbar, {
    props: {
      mode: 'auto',
      canArrange: true,
      layouting: false,
      layoutFailed: false,
      selectedNodeLabel: '',
      ...props,
    },
    global: {
      stubs: { Panel: { template: '<div><slot /></div>' } },
    },
  });

describe('ScenarioGraphLayoutToolbar', () => {
  it('switches between auto and manual presentation modes', async () => {
    const wrapper = mountToolbar();

    expect(wrapper.get('[data-layout-mode="auto"]').attributes('aria-pressed')).toBe('true');
    await wrapper.get('[data-layout-mode="manual"]').trigger('click');
    expect(wrapper.emitted('modeChange')).toEqual([['manual']]);

    await wrapper.setProps({ mode: 'manual', selectedNodeLabel: 'Приветствие' });
    expect(wrapper.get('[data-layout-mode="manual"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.text()).toContain('Только для вас');
  });

  it('provides button-and-keyboard alternatives to drag for the selected node', async () => {
    const wrapper = mountToolbar({ mode: 'manual', selectedNodeLabel: 'Приветствие' });

    const left = wrapper.get('[aria-label="Сдвинуть узел «Приветствие» влево"]');
    await left.trigger('click');
    expect(wrapper.emitted('nudge')).toEqual([['left']]);

    await wrapper.get('[aria-label="Выровнять схему автоматически"]').trigger('click');
    expect(wrapper.emitted('autoLayout')).toHaveLength(1);
  });

  it('disables manual arrangement in read-only mode while keeping auto-layout available', () => {
    const wrapper = mountToolbar({ canArrange: false });

    expect(wrapper.get('[data-layout-mode="manual"]').attributes('disabled')).toBeDefined();
    expect(
      wrapper.get('[aria-label="Выровнять схему автоматически"]').attributes('disabled'),
    ).toBeUndefined();
  });
});
