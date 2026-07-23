import { shallowMount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ActionConfigFields from './ActionConfigFields.vue'
import type { ScenarioActionCatalogItem } from '@/shared/types/domain'

const definition: ScenarioActionCatalogItem = {
  id: 'speak-text',
  type: 'SPEAK_TEXT',
  name: 'Озвучить текст',
  description: null,
  executor: 'FRONTEND',
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
    const textDefinition: ScenarioActionCatalogItem = {
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

  it('appends a template variable to localized source text without replacing it', async () => {
    const textDefinition: ScenarioActionCatalogItem = {
      ...definition,
      type: 'ASK_CHOICE',
      configSchema: {
        type: 'object',
        properties: { message: { type: 'string', maxLength: 10_000 } },
        required: ['message'],
      },
      uiSchema: {
        fields: [{
          key: 'message',
          label: 'Вопрос',
          control: 'textarea',
          supportsTemplates: true,
        }],
      },
    }
    const wrapper = shallowMount(ActionConfigFields, {
      props: {
        definition: textDefinition,
        modelValue: {
          message: {
            ru: 'Хочешь пополнить баланс?',
            en: 'Would you like to make a deposit?',
          },
        },
        templateVariables: ['{{ event.payload.currency }}'],
        localizationCatalog: {
          version: 1,
          enabled: true,
          attributeKey: 'language',
          attributeContractRevision: 1,
          defaultLocale: 'ru',
          locales: [
            { code: 'ru', language: 'ru', default: true },
            { code: 'en', language: 'en', default: false },
          ],
          policyModes: ['ALL_PROJECT_LOCALES', 'SELECTED_LOCALES'],
          localizedValueSchemaVersion: 1,
          paths: [{
            actionType: 'ASK_CHOICE',
            path: 'config.message',
            maxLength: 10_000,
          }],
        },
        translationCatalog: {
          enabled: true,
          supportedSourceLocales: ['ru'],
          supportedTargetLocales: ['en'],
          maxBatchCharacters: 50_000,
        },
      },
    })

    await wrapper.get('.variable-pills button').trigger('click')

    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual({
      message: {
        ru: 'Хочешь пополнить баланс? {{ event.payload.currency }}',
        en: 'Would you like to make a deposit?',
      },
    })

    await wrapper.setProps({
      modelValue: {
        message: {
          ru: 'Валюта:\n',
          en: 'Currency:',
        },
      },
    })
    await wrapper.get('.variable-pills button').trigger('click')

    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual({
      message: {
        ru: 'Валюта:\n{{ event.payload.currency }}',
        en: 'Currency:',
      },
    })
  })

  it('appends a template variable to scalar text without duplicating trailing whitespace', async () => {
    const textDefinition: ScenarioActionCatalogItem = {
      ...definition,
      type: 'SAY',
      configSchema: {
        type: 'object',
        properties: { text: { type: 'string', maxLength: 10_000 } },
        required: ['text'],
      },
      uiSchema: {
        fields: [{
          key: 'text',
          label: 'Текст',
          control: 'textarea',
          supportsTemplates: true,
        }],
      },
    }
    const wrapper = shallowMount(ActionConfigFields, {
      props: {
        definition: textDefinition,
        modelValue: { text: 'Валюта: ' },
        templateVariables: ['{{ event.payload.currency }}'],
      },
    })

    await wrapper.get('.variable-pills button').trigger('click')

    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual({
      text: 'Валюта: {{ event.payload.currency }}',
    })
  })

  it('explains how to enable translations when locale settings are not published', () => {
    const textDefinition: ScenarioActionCatalogItem = {
      ...definition,
      type: 'SAY',
      configSchema: {
        type: 'object',
        properties: { text: { type: 'string', maxLength: 10_000 } },
        required: ['text'],
      },
      uiSchema: {
        fields: [{ key: 'text', label: 'Сообщение от Lola', control: 'textarea' }],
      },
    }
    const wrapper = shallowMount(ActionConfigFields, {
      props: {
        definition: textDefinition,
        modelValue: { text: 'Привет' },
        localizationCatalog: {
          version: 1,
          enabled: false,
          attributeKey: null,
          attributeContractRevision: null,
          defaultLocale: '',
          locales: [],
          policyModes: ['ALL_PROJECT_LOCALES', 'SELECTED_LOCALES'],
          localizedValueSchemaVersion: 1,
          paths: [],
        },
      },
    })

    const notice = wrapper.get('[data-testid="localization-unavailable"]')
    expect(notice.text()).toContain('Переводы появятся после публикации языков проекта')
    expect(notice.get('router-link-stub').attributes('to')).toBe('/profile-fields')
  })

  it('keeps the translation setup path visible for a backward-compatible catalog without localization', () => {
    const textDefinition: ScenarioActionCatalogItem = {
      ...definition,
      type: 'SAY',
      configSchema: {
        type: 'object',
        properties: { text: { type: 'string', maxLength: 10_000 } },
        required: ['text'],
      },
      uiSchema: {
        fields: [{ key: 'text', label: 'Сообщение от Lola', control: 'textarea' }],
      },
    }
    const wrapper = shallowMount(ActionConfigFields, {
      props: {
        definition: textDefinition,
        modelValue: { text: 'Привет' },
      },
    })

    expect(wrapper.get('[data-testid="localization-unavailable"]').text()).toContain('Переводы появятся после публикации языков проекта')
  })
})
