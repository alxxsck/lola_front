import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ScenarioActionInspectorDock from './ScenarioActionInspectorDock.vue';

describe('ScenarioActionInspectorDock', () => {
  it('exposes an accessible keyboard resize contract and clamps the emitted width', async () => {
    const wrapper = mount(ScenarioActionInspectorDock, {
      props: { width: 380, minWidth: 320, maxWidth: 520 },
      slots: { default: '<div class="inspector-content">Настройки</div>' },
    });
    const separator = wrapper.get('[role="separator"]');

    expect(separator.attributes()).toMatchObject({
      'aria-label': 'Изменить ширину инспектора',
      'aria-valuemin': '320',
      'aria-valuemax': '520',
      'aria-valuenow': '380',
    });
    expect((separator.element as HTMLElement).tabIndex).toBe(0);

    await separator.trigger('keydown', { key: 'ArrowLeft' });
    await wrapper.setProps({ width: 404 });
    await separator.trigger('keydown', { key: 'End' });
    await wrapper.setProps({ width: 520 });
    await separator.trigger('keydown', { key: 'ArrowRight' });
    await wrapper.setProps({ width: 496 });
    await separator.trigger('keydown', { key: 'Home' });
    await wrapper.setProps({ width: 320 });
    await separator.trigger('keydown', { key: 'ArrowLeft' });

    expect(wrapper.emitted('resize')?.map(([width]) => width)).toEqual([404, 520, 496, 320, 344]);
  });

  it('turns a pointer drag on the separator into a clamped width and stops after release', async () => {
    const wrapper = mount(ScenarioActionInspectorDock, {
      props: { width: 380, minWidth: 320, maxWidth: 520 },
    });
    wrapper
      .get('[role="separator"]')
      .element.dispatchEvent(
        new MouseEvent('pointerdown', { button: 0, clientX: 500, bubbles: true }),
      );
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 450 }));
    window.dispatchEvent(new MouseEvent('pointerup'));
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 300 }));

    expect(wrapper.emitted('resize')?.map(([width]) => width)).toEqual([430]);
  });
});
