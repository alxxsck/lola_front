import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import FormFieldLabel from './FormFieldLabel.vue';

describe('FormFieldLabel', () => {
  it('keeps the label concise and exposes the explanation on hover or focus', () => {
    const wrapper = mount(FormFieldLabel, {
      props: {
        text: 'Код причины',
        help: 'Попадает в отчёты и объясняет, почему обращение передали.',
      },
    });

    expect(wrapper.text()).toBe('Код причины');
    const help = wrapper.get('[data-testid="field-help"]');
    expect(help.attributes('tabindex')).toBe('0');
    expect(help.attributes('aria-label')).toContain('Попадает в отчёты');
    expect(help.attributes('data-help')).toContain('почему обращение передали');
  });
});
