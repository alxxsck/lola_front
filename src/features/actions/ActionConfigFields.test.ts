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

  it('renders catalog-marked text as a localized field and migrates a legacy scalar', () => {
    const textDefinition: ScenarioActionDefinition = {
      ...definition,
      type: 'SAY',
      configSchema: {
        type: 'object',
        properties: { text: { type: 'string', maxLength: 10_000 } },
        required: ['text'],
      },
      uiSchema: { fields: [{ key: 'text', label: 'Текст', control: 'textarea' }] },
    }
    const wrapper = shallowMount(ActionConfigFields, {
      props: {
        definition: textDefinition,
        modelValue: { text: 'Hello' },
        projectId: 'project-1',
        scenarioId: 'scenario-1',
        fieldPathPrefix: 'graph.actions.welcome.config',
        localizationCatalog: {
          version: 1,
          enabled: true,
          attributeKey: 'language',
          attributeContractRevision: 1,
          defaultLocale: 'en',
          locales: [{ code: 'en', language: 'en', default: true }, { code: 'es', language: 'es', default: false }],
          policyModes: ['ALL_PROJECT_LOCALES', 'SELECTED_LOCALES'],
          localizedValueSchemaVersion: 1,
          paths: [{ actionType: 'SAY', path: 'config.text', maxLength: 10_000 }],
        },
        translationCatalog: {
          enabled: true,
          supportedSourceLocales: ['en'],
          supportedTargetLocales: ['es'],
          maxBatchCharacters: 50_000,
        },
        localizationPolicy: { version: 1, mode: 'ALL_PROJECT_LOCALES', locales: [] },
      },
    })

    const localized = wrapper.getComponent({ name: 'LocalizedField' })
    expect(localized.props('modelValue')).toEqual({ en: 'Hello' })
    expect(localized.props('fieldPath')).toBe('graph.actions.welcome.config.text')
  })
})
