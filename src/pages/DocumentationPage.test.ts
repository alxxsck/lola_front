import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import DocumentationPage from './DocumentationPage.vue';

describe('DocumentationPage', () => {
  it('lists support onboarding alongside administrator guides', () => {
    const wrapper = mount(DocumentationPage, {
      global: {
        stubs: { RouterLink: { props: ['to'], template: '<a :data-route="to.name"><slot /></a>' } },
      },
    });

    expect(wrapper.get('h1').text()).toBe('Документация Retenive');
    expect(wrapper.findAll('.guide-card')).toHaveLength(5);
    expect(wrapper.get('.guide-card').attributes('data-route')).toBe('support-operator-guide');
    expect(wrapper.text()).toContain('Работа оператора поддержки');
    expect(wrapper.text()).toContain('Работа лида поддержки');
    expect(wrapper.text()).toContain('Как работают сценарии Retenive');
    expect(wrapper.text()).toContain('Поля профиля пользователей');
    expect(wrapper.text()).toContain('Сегменты пользователей');
  });
});
