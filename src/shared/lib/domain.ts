import type { EventField, ScenarioAction } from '@/shared/types/domain'

export function buildEventSchema(fields: EventField[]): Record<string, unknown> {
  const completed = fields.filter((field) => field.code.trim())
  return {
    type: 'object',
    additionalProperties: false,
    properties: Object.fromEntries(completed.map((field) => [field.code.trim(), {
      type: field.type,
      title: field.name.trim() || field.code.trim(),
    }])),
    required: completed.filter((field) => field.required).map((field) => field.code.trim()),
  }
}

export function buildEventExample(eventCode: string, fields: EventField[]): Record<string, unknown> {
  return {
    userId: 'customer_12345',
    externalEventId: 'event_12345',
    eventCode: eventCode.trim(),
    payload: Object.fromEntries(fields.filter((field) => field.code.trim()).map((field) => [field.code.trim(), exampleValue(field.type)])),
  }
}

function exampleValue(type: EventField['type']): unknown {
  switch (type) {
    case 'number': return 123.45
    case 'integer': return 123
    case 'boolean': return true
    case 'object': return {}
    case 'array': return []
    default: return 'value'
  }
}

export function normalizeScenarioActions(actions: ScenarioAction[]): ScenarioAction[] {
  return actions.map((action, position) => ({ ...action, position }))
}
