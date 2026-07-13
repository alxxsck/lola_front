import { describe, expect, it } from 'vitest'
import {
  actionFieldOptions,
  createActionConfig,
  isActionFieldVisible,
  parseActionDefinition,
  sanitizeActionConfig,
  validateActionConfig,
  validateScenarioActionConfig,
} from './action-definition'

const rawDefinition = {
  id: 'definition-1', projectId: 'project-1', type: 'SHOW_CTA', name: 'Показать кнопку',
  description: null, executor: 'FRONTEND', serverHandler: null, commandType: 'SHOW_CTA',
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
  enabled: true, builtIn: true, createdAt: '2026-07-12T10:00:00.000Z', updatedAt: '2026-07-12T10:00:00.000Z',
}

describe('action definition schema helpers', () => {
  it('parses the backend JSON blobs into a strict domain definition', () => {
    const definition = parseActionDefinition(rawDefinition)
    expect(definition.uiSchema.fields[2]).toMatchObject({ control: 'target', targetKinds: ['PAGE'] })
    expect(actionFieldOptions(definition.uiSchema.fields[1]!, definition.configSchema.properties.action))
      .toEqual(['none', 'open_page'])
  })

  it('rejects UI fields that do not match the backend config schema', () => {
    expect(() => parseActionDefinition({
      ...rawDefinition,
      uiSchema: { fields: [...rawDefinition.uiSchema.fields, { key: 'unknown', label: 'Unknown', control: 'text' }] },
    })).toThrow('must reference a config property')
  })

  it('uses schema defaults and removes hidden or unknown config values', () => {
    const definition = parseActionDefinition(rawDefinition)
    expect(createActionConfig(definition)).toEqual({ timeoutMs: 30000 })
    expect(isActionFieldVisible(definition.uiSchema.fields[2]!, { action: 'none' })).toBe(false)
    expect(sanitizeActionConfig(definition, {
      label: 'Открыть', action: 'none', pageId: 'hidden-page', timeoutMs: 30000, localDraft: true,
    })).toEqual({ label: 'Открыть', action: 'none', timeoutMs: 30000 })
  })

  it('validates required, conditional target and numeric constraints generically', () => {
    const definition = parseActionDefinition(rawDefinition)
    expect(validateActionConfig(definition, { action: 'none', timeoutMs: 30000 })).toBe('Текст: обязательное поле')
    expect(validateActionConfig(definition, { label: 'Go', action: 'open_page', timeoutMs: 30000 })).toBe('Страница: обязательное поле')
    expect(validateActionConfig(definition, { label: 'Go', action: 'none', timeoutMs: 10 })).toBe('Таймаут: должно быть не меньше 1000')
    expect(validateActionConfig(definition, { label: 'Go', action: 'none', timeoutMs: 30000 })).toBe('')
    expect(validateScenarioActionConfig({ position: 0, type: 'SHOW_CTA', config: {} }, { ...definition, enabled: false }))
      .toBe('Действие Показать кнопку отключено')
  })
})
