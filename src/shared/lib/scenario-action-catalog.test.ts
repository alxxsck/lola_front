import { describe, expect, it } from 'vitest'
import { demoScenarioActionCatalog } from '@/shared/api/mock-data'
import {
  actionFieldOptions,
  createActionConfig,
  isActionFieldVisible,
  parseScenarioActionCatalogItem,
  sanitizeActionConfig,
  validateActionConfig,
  validateScenarioActionConfig,
} from './scenario-action-catalog'

const rawDefinition = {
  id: 'catalog-item-1', type: 'SHOW_CTA', name: 'Показать кнопку',
  description: null, executor: 'FRONTEND',
  configSchema: {
    type: 'object', additionalProperties: false, required: ['label', 'action'],
    properties: {
      label: { type: 'string', minLength: 2 },
      action: { type: 'string', enum: ['none', 'open_page'] },
      pageId: { type: 'string' },
      timeoutMs: { type: 'integer', minimum: 1000, default: 30000 },
    },
  },
  uiSchema: { fields: [
    { key: 'label', label: 'Текст', control: 'text', supportsTemplates: true },
    { key: 'action', label: 'Действие', control: 'select' },
    { key: 'pageId', label: 'Страница', control: 'target', targetKinds: ['PAGE'], visibleWhen: { action: 'open_page' } },
    { key: 'timeoutMs', label: 'Таймаут', control: 'number' },
  ] },
  enabled: true,
}

describe('scenario action catalog schema helpers', () => {
  it('accepts the specialized controls used by WAIT_FOR_GOAL', () => {
    expect(parseScenarioActionCatalogItem({
      id: 'wait-goal', type: 'WAIT_FOR_GOAL', name: 'Ждать цель', description: null,
      executor: 'SERVER', enabled: true,
      configSchema: {
        type: 'object', additionalProperties: false,
        properties: {
          goal: { type: 'object' }, timeoutMs: { type: 'integer', minimum: 1_000, maximum: 7_776_000_000 },
          onGoal: { type: 'string' }, onTimeout: { type: 'string' },
        },
        required: ['goal', 'timeoutMs', 'onGoal', 'onTimeout'],
      },
      uiSchema: { fields: [
        { key: 'goal', label: 'Цель', control: 'goal-builder' },
        { key: 'timeoutMs', label: 'Срок ожидания', control: 'duration' },
        { key: 'onGoal', label: 'Если цель достигнута', control: 'node' },
        { key: 'onTimeout', label: 'Если срок истёк', control: 'node' },
      ] },
    }).uiSchema.fields.map((field) => field.control)).toEqual(['goal-builder', 'duration', 'node', 'node'])
  })

  it('parses Project Action revision JSON blobs into a strict catalog item', () => {
    const definition = parseScenarioActionCatalogItem(rawDefinition)
    expect(definition.uiSchema.fields[2]).toMatchObject({ control: 'target', targetKinds: ['PAGE'] })
    expect(actionFieldOptions(definition.uiSchema.fields[1]!, definition.configSchema.properties.action))
      .toEqual(['none', 'open_page'])
  })

  it('rejects UI fields that do not match the backend config schema', () => {
    expect(() => parseScenarioActionCatalogItem({
      ...rawDefinition,
      uiSchema: { fields: [...rawDefinition.uiSchema.fields, { key: 'unknown', label: 'Unknown', control: 'text' }] },
    })).toThrow('must reference a config property')
  })

  it('uses schema defaults and removes hidden or unknown config values', () => {
    const definition = parseScenarioActionCatalogItem(rawDefinition)
    expect(createActionConfig(definition)).toEqual({ timeoutMs: 30000 })
    expect(isActionFieldVisible(definition.uiSchema.fields[2]!, { action: 'none' })).toBe(false)
    expect(sanitizeActionConfig(definition, {
      label: 'Открыть', action: 'none', pageId: 'hidden-page', timeoutMs: 30000, localDraft: true,
    })).toEqual({ label: 'Открыть', action: 'none', timeoutMs: 30000 })
  })

  it('validates required, conditional target and numeric constraints generically', () => {
    const definition = parseScenarioActionCatalogItem(rawDefinition)
    expect(validateActionConfig(definition, { action: 'none', timeoutMs: 30000 })).toBe('Текст: обязательное поле')
    expect(validateActionConfig(definition, { label: 'Go', action: 'open_page', timeoutMs: 30000 })).toBe('Страница: обязательное поле')
    expect(validateActionConfig(definition, { label: 'Go', action: 'none', timeoutMs: 10 })).toBe('Таймаут: должно быть не меньше 1000')
    expect(validateActionConfig(definition, { label: 'Go', action: 'none', timeoutMs: 30000 })).toBe('')
    expect(validateScenarioActionConfig({ position: 0, type: 'SHOW_CTA', config: {} }, { ...definition, enabled: false }))
      .toBe('Действие Показать кнопку отключено')
  })

  it('accepts locale maps only for fields marked localizable by the catalog', () => {
    const definition = parseScenarioActionCatalogItem(rawDefinition)
    const localization = {
      version: 1 as const,
      enabled: true,
      attributeKey: 'language',
      attributeContractRevision: 1,
      defaultLocale: 'en',
      locales: [{ code: 'en', language: 'en', default: true }, { code: 'es', language: 'es', default: false }],
      policyModes: ['ALL_PROJECT_LOCALES' as const, 'SELECTED_LOCALES' as const],
      localizedValueSchemaVersion: 1 as const,
      paths: [{ actionType: 'SHOW_CTA', path: 'config.label', maxLength: 200 }],
    }
    expect(validateScenarioActionConfig(
      { position: 0, type: 'SHOW_CTA', config: { label: { en: 'Open', es: 'Abrir' }, action: 'none', timeoutMs: 30000 } },
      definition,
      localization,
    )).toBe('')
  })

  it('describes and validates the non-blocking voice conversation action', () => {
    const definition = demoScenarioActionCatalog.find((item) => item.type === 'START_VOICE_CONVERSATION')

    expect(definition).toMatchObject({
      name: 'Начать голосовой диалог',
      executor: 'SERVER',
      enabled: true,
      configSchema: { required: ['text'] },
    })
    expect(definition?.uiSchema.fields.map((field) => field.key)).toEqual(['text', 'voice', 'onUnavailable'])
    expect(validateActionConfig(definition!, {})).toBe('Первая голосовая реплика Lola: обязательное поле')
    expect(validateActionConfig(definition!, { text: 'Привет!', voice: 'eve', onUnavailable: 'continue' })).toBe('')
    expect(validateActionConfig(definition!, { text: 'Привет!', voice: 'marin' })).toBe('Голос: содержит недопустимое значение')
    expect(validateActionConfig(definition!, { text: 'Привет!', onUnavailable: 'stop' })).toBe('Если голос недоступен: содержит недопустимое значение')
  })

  it('describes both SPEAK_TEXT playback modes and defaults to waiting', () => {
    const definition = demoScenarioActionCatalog.find((item) => item.type === 'SPEAK_TEXT')

    expect(definition).toMatchObject({
      executor: 'FRONTEND',
      configSchema: {
        properties: { waitForCompletion: { type: 'boolean', default: true } },
        required: ['text'],
      },
    })
    expect(definition?.uiSchema.fields.map((field) => field.key))
      .toEqual(['text', 'voice', 'waitForCompletion', 'timeoutMs'])
    expect(createActionConfig(definition!)).toEqual({ waitForCompletion: true })
    expect(validateActionConfig(definition!, { text: 'Привет!', waitForCompletion: true })).toBe('')
    expect(validateActionConfig(definition!, { text: 'Привет!', waitForCompletion: false })).toBe('')
    expect(validateActionConfig(definition!, { text: 'Привет!', waitForCompletion: 'false' }))
      .toBe('Дождаться окончания воспроизведения: должно иметь тип boolean')
  })
})
