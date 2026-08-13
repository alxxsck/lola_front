import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import ScenarioActionChangeDialog from './ScenarioActionChangeDialog.vue';

const global = {
  stubs: {
    Dialog: {
      props: ['visible'],
      emits: ['update:visible'],
      template:
        '<section v-if="visible" role="dialog"><slot /><footer><slot name="footer" /></footer></section>',
    },
    Button: {
      props: ['label', 'disabled'],
      emits: ['click'],
      template: '<button :disabled="disabled" @click="$emit(\'click\')">{{ label }}</button>',
    },
  },
};

describe('ScenarioActionChangeDialog', () => {
  it('previews destructive type replacement and applies only after confirmation', async () => {
    const wrapper = mount(ScenarioActionChangeDialog, {
      props: {
        visible: true,
        preview: {
          kind: 'type-replacement',
          currentName: 'Вопрос с вариантами',
          targetName: 'Сообщение',
          targetType: 'SAY',
          sourceFingerprint: 'before',
          plan: {
            replacement: {
              position: 0,
              nodeKey: 'question',
              nextNodeKey: null,
              type: 'SAY',
              config: {},
            },
            preservedConfigKeys: [],
            removedConfigKeys: ['message', 'options'],
            requiredConfigKeys: [],
            transitionImpact: 'reset-required',
            removedTransitionCount: 2,
          },
        },
      },
      global,
    });

    expect(wrapper.find('.change-route span').text()).toBe('Вопрос с вариантами');
    expect(wrapper.find('.change-route strong').text()).toBe('Сообщение');
    expect(wrapper.text()).toContain('2 перехода будут сброшены');
    expect(wrapper.text()).toContain('message, options');
    expect(wrapper.emitted('apply')).toBeUndefined();

    await wrapper.get('button:last-child').trigger('click');
    expect(wrapper.emitted('apply')).toHaveLength(1);
  });

  it('shows unreachable nodes for an entry-point plan and keeps cancel non-mutating', async () => {
    const wrapper = mount(ScenarioActionChangeDialog, {
      props: {
        visible: true,
        preview: {
          kind: 'entry-point',
          currentNodeKey: 'open_form',
          targetNodeKey: 'open_chat',
          sourceFingerprint: 'before',
          plan: {
            status: 'ready',
            actions: [],
            unreachableNodeKeys: ['open_form'],
            removedIncomingTransitions: [
              { source: 'open_form', target: 'open_chat', branchId: 'next', kind: 'default' },
            ],
          },
        },
      },
      global,
    });

    expect(wrapper.find('.change-route span').text()).toBe('open_form');
    expect(wrapper.find('.change-route strong').text()).toBe('open_chat');
    expect(wrapper.text()).toContain('Будут удалены из черновика как недостижимые: open_form');
    await wrapper.get('button:first-child').trigger('click');
    expect(wrapper.emitted('cancel')).toHaveLength(1);
    expect(wrapper.emitted('apply')).toBeUndefined();
  });

  it('renders a precise blocker and disables apply', () => {
    const wrapper = mount(ScenarioActionChangeDialog, {
      props: {
        visible: true,
        preview: {
          kind: 'entry-point',
          currentNodeKey: 'question',
          targetNodeKey: 'answer',
          sourceFingerprint: 'before',
          plan: {
            status: 'blocked',
            reason:
              'На «answer» ведёт обязательная ветка «Да» из «question». Сначала переназначьте эту ветку.',
          },
        },
      },
      global,
    });

    expect(wrapper.text()).toContain('обязательная ветка «Да»');
    expect(wrapper.get('button:last-child').attributes()).toHaveProperty('disabled');
  });
});
