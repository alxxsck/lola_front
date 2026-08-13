import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AIFilterToggle from './AIFilterToggle.vue';

describe('AIFilterToggle', () => {
  it('reports active filters and toggles the disclosure state', async () => {
    const wrapper = mount(AIFilterToggle, {
      props: {
        expanded: false,
        filters: { status: 'SUCCEEDED', eventCode: '', scope: null },
      },
    });

    expect(wrapper.text()).toContain('1');
    expect(wrapper.get('button').attributes('aria-expanded')).toBe('false');

    await wrapper.get('button').trigger('click');

    expect(wrapper.emitted('update:expanded')).toEqual([[true]]);
  });
});
