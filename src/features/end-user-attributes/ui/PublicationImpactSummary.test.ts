import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import PublicationImpactSummary from './PublicationImpactSummary.vue';

describe('PublicationImpactSummary', () => {
  it('makes a metadata or policy publication safe to understand', () => {
    const wrapper = mount(PublicationImpactSummary, {
      props: {
        changes: {
          contractChanged: false,
          contractCompatibility: 'UNCHANGED',
          lifecycleChanged: false,
          metadataChanged: true,
          policyChanged: true,
        },
      },
    });

    expect(wrapper.text()).toContain('Интеграция продукта не изменится');
    expect(wrapper.text()).toContain('Изменится интеграция продукта: нет');
    expect(wrapper.text()).toContain('Версия контракта останется прежней');
    expect(wrapper.text()).toContain('Потребуется повторная синхронизация: нет');
  });

  it('warns about a new breaking contract revision', () => {
    const wrapper = mount(PublicationImpactSummary, {
      props: {
        changes: {
          contractChanged: true,
          contractCompatibility: 'BREAKING',
          lifecycleChanged: false,
          metadataChanged: false,
          policyChanged: false,
        },
        profileResyncRequired: true,
      },
    });

    expect(wrapper.attributes('data-severity')).toBe('error');
    expect(wrapper.text()).toContain('Интеграцию продукта нужно обновить');
    expect(wrapper.text()).toContain('Изменится интеграция продукта: да');
    expect(wrapper.text()).toContain('Появится новая версия контракта');
    expect(wrapper.text()).toContain('Потребуется повторная синхронизация: да');
  });

  it('describes the first contract without an imaginary previous version', () => {
    const wrapper = mount(PublicationImpactSummary, {
      props: {
        changes: {
          contractChanged: true,
          contractCompatibility: 'INITIAL',
          lifecycleChanged: false,
          metadataChanged: false,
          policyChanged: false,
        },
      },
    });

    expect(wrapper.text()).toContain('Будет создан первый контракт');
    expect(wrapper.text()).toContain('Перехода со старой версии нет');
  });
});
