import { shallowMount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import UiElementPicker from '@/features/interface/UiElementPicker.vue';
import ProjectActionSchemaForm from './ProjectActionSchemaForm.vue';

describe('ProjectActionSchemaForm', () => {
  it('uses the interface catalog for target controls and updates configuration', async () => {
    const wrapper = shallowMount(ProjectActionSchemaForm, {
      props: {
        schema: {
          type: 'object',
          properties: { pageCode: { type: 'string' } },
          required: ['pageCode'],
          additionalProperties: false,
        },
        uiSchema: {
          fields: [
            {
              key: 'pageCode',
              label: 'Страница',
              control: 'target',
              targetKinds: ['PAGE'],
            },
          ],
        },
        modelValue: {},
        elements: [
          {
            id: 'page-home',
            projectId: 'project-1',
            code: 'home',
            name: 'Главная',
            kind: 'PAGE',
            route: '/home',
            config: {},
            enabled: true,
            aiEnabled: true,
            aiDescription: 'Главная страница',
            aiAliases: [],
          },
        ],
      },
    });

    const picker = wrapper.getComponent(UiElementPicker);
    expect(picker.props('allowedKinds')).toEqual(['PAGE']);
    expect(picker.classes()).toContain('schema-target-picker');
    expect(wrapper.find('input-text-stub').exists()).toBe(false);

    await picker.vm.$emit('update:modelValue', 'home');
    expect(wrapper.emitted('update:modelValue')).toEqual([[{ pageCode: 'home' }]]);
  });

  it('blocks an unavailable target catalog and exposes retry', async () => {
    const wrapper = shallowMount(ProjectActionSchemaForm, {
      props: {
        schema: {
          type: 'object',
          properties: { pageCode: { type: 'string' } },
          required: ['pageCode'],
          additionalProperties: false,
        },
        uiSchema: {
          fields: [
            {
              key: 'pageCode',
              label: 'Страница',
              control: 'target',
              targetKinds: ['PAGE'],
            },
          ],
        },
        modelValue: {},
        elementsError: 'Не удалось загрузить каталог интерфейса.',
      },
      global: {
        stubs: { Message: { template: '<div><slot /></div>' } },
      },
    });

    expect(wrapper.getComponent(UiElementPicker).props('disabled')).toBe(true);
    await wrapper.get('button-stub[label="Повторить"]').trigger('click');
    expect(wrapper.emitted('retry-elements')).toEqual([[]]);
  });
});
