import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AiTtsPricingContext from './AiTtsPricingContext.vue';

describe('AI TTS pricing context', () => {
  it('renders an exact backend decimal and immutable-history explanation', () => {
    const wrapper = mount(AiTtsPricingContext, {
      props: {
        pricing: {
          current: {
            rate: '999999.999999999999',
            currency: 'usd',
            unit: 'per_million_input_characters',
            effectiveFrom: '2026-07-29T10:00:00.000Z',
          },
          sourceUrl: 'https://docs.x.ai/developers/pricing',
        },
      },
    });

    expect(wrapper.text()).toContain('999 999,999999999999 $');
    expect(wrapper.text()).toContain('29.07.2026');
    expect(wrapper.text()).toContain(
      'История рассчитана по ставке, действовавшей в момент каждой операции',
    );
    expect(wrapper.text()).toContain('Если ставка xAI изменилась, сообщите администрации');
    expect(wrapper.get('a').attributes()).toMatchObject({
      href: 'https://docs.x.ai/developers/pricing',
      target: '_blank',
      rel: 'noopener noreferrer',
    });
  });

  it('explains a missing current rate without hiding the official source', () => {
    const wrapper = mount(AiTtsPricingContext, {
      props: {
        pricing: {
          current: null,
          sourceUrl: 'https://docs.x.ai/developers/pricing',
        },
      },
    });

    expect(wrapper.text()).toContain('Текущая ставка не настроена');
    expect(wrapper.get('a').attributes('href')).toBe('https://docs.x.ai/developers/pricing');
  });
});
