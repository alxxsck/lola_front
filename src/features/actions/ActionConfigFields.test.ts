import { shallowMount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ActionConfigFields from './ActionConfigFields.vue'
import type { ScenarioActionDefinition } from '@/shared/types/domain'

const definition: ScenarioActionDefinition = {
  id: 'speak-text',
  projectId: 'project-1',
  type: 'SPEAK_TEXT',
  name: 'Озвучить текст',
  description: null,
  executor: 'FRONTEND',
  serverHandler: null,
  commandType: 'speak_text',
  configSchema: {
    type: 'object',
    properties: { waitForCompletion: { type: 'boolean', default: true } },
    required: [],
  },
  uiSchema: {
    fields: [{
      key: 'waitForCompletion',
      label: 'Дождаться окончания воспроизведения',
      control: 'boolean',
    }],
  },
  enabled: true,
  builtIn: true,
  createdAt: '2026-07-13T00:00:00.000Z',
  updatedAt: '2026-07-13T00:00:00.000Z',
}

describe('ActionConfigFields', () => {
  it('shows a boolean schema default when an existing action omits the field', () => {
    const wrapper = shallowMount(ActionConfigFields, {
      props: { definition, modelValue: {} },
    })

    expect(wrapper.find('toggle-switch-stub').attributes('model-value')).toBe('true')
  })

  it('keeps an explicitly disabled boolean value', () => {
    const wrapper = shallowMount(ActionConfigFields, {
      props: { definition, modelValue: { waitForCompletion: false } },
    })

    expect(wrapper.find('toggle-switch-stub').attributes('model-value')).toBe('false')
  })
})
