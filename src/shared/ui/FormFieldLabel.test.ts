import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import FormFieldLabel from './FormFieldLabel.vue';

describe('FormFieldLabel', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

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
  });

  it('renders the focused tooltip at the document root instead of inside clipping ancestors', async () => {
    const clippingHost = document.createElement('div');
    clippingHost.style.overflow = 'hidden';
    document.body.appendChild(clippingHost);
    const wrapper = mount(FormFieldLabel, {
      attachTo: clippingHost,
      props: {
        text: 'Код причины',
        help: 'Попадает в отчёты и объясняет, почему обращение передали.',
      },
    });

    const help = wrapper.get('[data-testid="field-help"]');
    await help.trigger('focus');

    const tooltip = document.body.querySelector<HTMLElement>('[role="tooltip"]');
    expect(document.body.contains(tooltip)).toBe(true);
    expect(clippingHost.contains(tooltip)).toBe(false);
    expect(tooltip?.textContent).toContain('почему обращение передали');
    expect(help.attributes('aria-describedby')).toBe(tooltip?.id);

    await help.trigger('blur');
    expect(document.body.querySelector('[role="tooltip"]')).toBeNull();
  });
});
