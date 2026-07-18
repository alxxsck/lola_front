import Ajv from 'ajv'
import type { ErrorObject } from 'ajv'

import { uid } from '@/shared/lib/format'

export const eventSchemaFieldTypes = ['string', 'number', 'integer', 'boolean', 'object', 'array'] as const

export type EventSchemaFieldType = typeof eventSchemaFieldTypes[number]

export interface EventSchemaFieldDraft {
  id: string
  wireKey: string
  title?: string
  description?: string
  type?: EventSchemaFieldType
  required: boolean
  enumValues?: unknown[]
  minimum?: number
  maximum?: number
  fieldKey?: string
  semanticType?: string
  unit?: string
  sensitive?: boolean
  visuallyEditable: boolean
  unsupportedReason?: string
  source: unknown
}

export interface EventSchemaDraft {
  source: Record<string, unknown>
  fields: EventSchemaFieldDraft[]
  additionalProperties?: unknown
  hasProperties: boolean
  hasRequired: boolean
  hasAdditionalProperties: boolean
  unmappedRequired: string[]
}

export interface EventSchemaDraftIssue {
  fieldId?: string
  message: string
}

export interface EventSchemaSampleIssue {
  path: string
  expected: string
  actual: string
  explanation: string
}

export type EventSchemaChange =
  | EventSchemaFieldChange<'added' | 'removed' | 'renamed'>
  | EventSchemaFieldChange<'type-changed'> & { beforeType?: EventSchemaFieldType; afterType?: EventSchemaFieldType }
  | EventSchemaFieldChange<'field-key-changed'> & { beforeFieldKey?: string; afterFieldKey?: string }

interface EventSchemaFieldChange<Kind extends string> {
  kind: Kind
  fieldKey?: string
  beforeWireKey?: string
  afterWireKey?: string
}

const unsupportedKeywords = ['$ref', 'allOf', 'anyOf', 'oneOf', 'not', 'if', 'then', 'else']

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function cloneValue<T>(value: T): T {
  if (Array.isArray(value)) return value.map(cloneValue) as T
  if (!isRecord(value)) return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)])) as T
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined
}

function fieldType(value: unknown): EventSchemaFieldType | undefined {
  return eventSchemaFieldTypes.find((type) => type === value)
}

function unsupportedReason(schema: unknown): string | undefined {
  if (!isRecord(schema)) return 'Boolean JSON Schema доступна только в расширенном режиме.'
  const keyword = unsupportedKeywords.find((key) => key in schema)
  if (keyword) return `Конструкция ${keyword} доступна только в расширенном режиме.`
  const type = fieldType(schema.type)
  if (!type) return 'Поле без поддерживаемого простого type доступно только в расширенном режиме.'
  if (type === 'array' && !isRecord(schema.items)) return 'Array без object items доступен только в расширенном режиме.'
  return undefined
}

export function parseEventSchema(schema: Record<string, unknown>): EventSchemaDraft {
  const properties = isRecord(schema.properties) ? schema.properties : {}
  const required = new Set(Array.isArray(schema.required) ? schema.required.filter((value): value is string => typeof value === 'string') : [])
  const propertyKeys = new Set(Object.keys(properties))

  return {
    source: cloneValue(schema),
    fields: Object.entries(properties).map(([wireKey, source]) => {
      const reason = unsupportedReason(source)
      const definition = isRecord(source) ? source : {}
      const stableKey = optionalString(definition['x-lola-field-key'])

      return {
        id: stableKey ?? `${wireKey}_${uid('schema').slice(-8)}`,
        wireKey,
        title: optionalString(definition.title),
        description: optionalString(definition.description),
        type: fieldType(definition.type),
        required: required.has(wireKey),
        enumValues: Array.isArray(definition.enum) ? cloneValue(definition.enum) : undefined,
        minimum: optionalNumber(definition.minimum),
        maximum: optionalNumber(definition.maximum),
        fieldKey: stableKey,
        semanticType: optionalString(definition['x-lola-semantic-type']),
        unit: optionalString(definition['x-lola-unit']),
        sensitive: typeof definition['x-lola-sensitive'] === 'boolean' ? definition['x-lola-sensitive'] : undefined,
        visuallyEditable: !reason,
        unsupportedReason: reason,
        source: cloneValue(source),
      }
    }),
    additionalProperties: cloneValue(schema.additionalProperties),
    hasProperties: Object.hasOwn(schema, 'properties'),
    hasRequired: Object.hasOwn(schema, 'required'),
    hasAdditionalProperties: Object.hasOwn(schema, 'additionalProperties'),
    unmappedRequired: [...required].filter((wireKey) => !propertyKeys.has(wireKey)),
  }
}

function assignOptional(target: Record<string, unknown>, key: string, value: unknown) {
  if (value === undefined) delete target[key]
  else target[key] = cloneValue(value)
}

function serializeField(field: EventSchemaFieldDraft): unknown {
  if (!field.visuallyEditable) return cloneValue(field.source)

  const schema = isRecord(field.source) ? cloneValue(field.source) : {}
  assignOptional(schema, 'type', field.type)
  assignOptional(schema, 'title', field.title)
  assignOptional(schema, 'description', field.description)
  assignOptional(schema, 'enum', field.enumValues)
  assignOptional(schema, 'minimum', field.minimum)
  assignOptional(schema, 'maximum', field.maximum)
  assignOptional(schema, 'x-lola-field-key', field.fieldKey)
  assignOptional(schema, 'x-lola-semantic-type', field.semanticType)
  assignOptional(schema, 'x-lola-unit', field.unit)
  assignOptional(schema, 'x-lola-sensitive', field.sensitive)
  if (field.type === 'array' && !isRecord(schema.items)) schema.items = {}
  return schema
}

export function serializeEventSchema(draft: EventSchemaDraft): Record<string, unknown> {
  const schema = cloneValue(draft.source)
  const properties = Object.fromEntries(draft.fields.map((field) => [field.wireKey, serializeField(field)]))
  const required = [...new Set([
    ...draft.unmappedRequired,
    ...draft.fields.filter((field) => field.required).map((field) => field.wireKey),
  ])]

  if (draft.hasProperties || draft.fields.length) schema.properties = properties
  else delete schema.properties

  if (draft.hasRequired || required.length) schema.required = required
  else delete schema.required

  if (draft.hasAdditionalProperties || draft.additionalProperties !== undefined) {
    schema.additionalProperties = cloneValue(draft.additionalProperties)
  } else {
    delete schema.additionalProperties
  }

  return schema
}

function sampleValue(field: EventSchemaFieldDraft): unknown {
  if (field.enumValues?.length) return cloneValue(field.enumValues[0])
  switch (field.type) {
    case 'number': return field.minimum ?? 123.45
    case 'integer': return field.minimum ?? 123
    case 'boolean': return true
    case 'object': return {}
    case 'array': return []
    default: return 'value'
  }
}

export function buildEventSchemaExample(draft: EventSchemaDraft): Record<string, unknown> {
  return Object.fromEntries(draft.fields
    .filter((field) => field.wireKey.trim())
    .map((field) => [field.wireKey, sampleValue(field)]))
}

const wireKeyPattern = /^[a-z][a-z0-9_.-]*$/

export function validateEventSchemaDraft(draft: EventSchemaDraft): EventSchemaDraftIssue[] {
  const editable = draft.fields.filter((field) => field.visuallyEditable)
  const missingWireKey = editable.find((field) => !field.wireKey)
  if (missingWireKey) return [{ fieldId: missingWireKey.id, message: 'Заполните wire key каждого поля или удалите пустую строку.' }]

  const invalidWireKey = editable.find((field) => !wireKeyPattern.test(field.wireKey))
  if (invalidWireKey) return [{ fieldId: invalidWireKey.id, message: 'Wire key должны начинаться с буквы и содержать только допустимые символы.' }]

  const wireKeys = draft.fields.map((field) => field.wireKey)
  if (new Set(wireKeys).size !== wireKeys.length) return [{ message: 'Wire key не должны повторяться.' }]

  const fieldKeys = draft.fields.flatMap((field) => field.fieldKey ? [field.fieldKey] : [])
  if (new Set(fieldKeys).size !== fieldKeys.length) return [{ message: 'Stable field key не должны повторяться.' }]

  if (serializeEventSchema(draft).type !== 'object') return [{ message: 'Корневая JSON Schema события должна иметь type object.' }]
  return []
}

export function validateEventSchemaSample(draft: EventSchemaDraft, sample: unknown): EventSchemaSampleIssue[] {
  try {
    const schema = serializeEventSchema(draft)
    normalizeForBackendValidation(schema, 'payloadSchema')
    const validate = new Ajv({ allErrors: true, strict: false }).compile(schema)
    if (validate(sample)) return []
    return (validate.errors ?? []).map((issue) => sampleIssue(issue, sample))
  } catch (cause) {
    return [{
      path: '/',
      expected: 'valid JSON Schema',
      actual: 'schema compilation failed',
      explanation: cause instanceof Error ? cause.message : 'JSON Schema validation failed',
    }]
  }
}

function normalizeForBackendValidation(schema: Record<string, unknown>, path: string) {
  if (schema.type === 'object') {
    if (schema.properties === undefined) schema.properties = {}
    if (!isRecord(schema.properties)) throw new Error(`${path}.properties must be an object`)
    if (schema.additionalProperties === undefined) schema.additionalProperties = false
    for (const [key, child] of Object.entries(schema.properties)) {
      if (!isRecord(child)) throw new Error(`${path}.properties.${key} must be a schema object`)
      normalizeForBackendValidation(child, `${path}.properties.${key}`)
    }
  }
  if (schema.type === 'array') {
    if (!isRecord(schema.items)) throw new Error(`${path}.items is required for an array field`)
    normalizeForBackendValidation(schema.items, `${path}.items`)
  }
}

function sampleIssue(issue: ErrorObject, sample: unknown): EventSchemaSampleIssue {
  const additionalProperty = typeof issue.params.additionalProperty === 'string' ? issue.params.additionalProperty : undefined
  const missingProperty = typeof issue.params.missingProperty === 'string' ? issue.params.missingProperty : undefined
  const basePath = issue.instancePath || ''
  const path = additionalProperty
    ? `${basePath}/${additionalProperty}`
    : missingProperty
      ? `${basePath}/${missingProperty}`
      : basePath || '/'
  const actual = missingProperty ? undefined : valueAtPointer(sample, path)

  return {
    path,
    expected: expectedValue(issue),
    actual: actual === undefined ? 'missing' : JSON.stringify(actual),
    explanation: issue.message ?? 'does not match schema',
  }
}

function expectedValue(issue: ErrorObject): string {
  if (issue.keyword === 'additionalProperties') return 'no additional properties'
  if (issue.keyword === 'minimum') return `>= ${String(issue.params.limit)}`
  if (issue.keyword === 'maximum') return `<= ${String(issue.params.limit)}`
  if (issue.keyword === 'enum') return `one of ${JSON.stringify(issue.params.allowedValues)}`
  if (issue.keyword === 'type') return String(issue.params.type)
  if (issue.keyword === 'required') return 'required property'
  return JSON.stringify(issue.params)
}

function valueAtPointer(value: unknown, pointer: string): unknown {
  if (pointer === '/') return value
  return pointer.split('/').slice(1).reduce<unknown>((current, segment) => {
    if (!isRecord(current) && !Array.isArray(current)) return undefined
    const key = segment.replace(/~1/g, '/').replace(/~0/g, '~')
    return (current as Record<string, unknown>)[key]
  }, value)
}

function matchField(before: EventSchemaFieldDraft, after: EventSchemaFieldDraft[], matched: Set<string>) {
  const byStableKey = before.fieldKey
    ? after.find((field) => field.fieldKey === before.fieldKey && !matched.has(field.id))
    : undefined
  return byStableKey ?? after.find((field) => field.wireKey === before.wireKey && !matched.has(field.id))
}

export function diffEventSchemas(beforeSchema: Record<string, unknown>, afterSchema: Record<string, unknown>): EventSchemaChange[] {
  const before = parseEventSchema(beforeSchema).fields
  const after = parseEventSchema(afterSchema).fields
  const matched = new Set<string>()
  const changes: EventSchemaChange[] = []

  for (const previous of before) {
    const current = matchField(previous, after, matched)
    if (!current) {
      changes.push({ kind: 'removed', fieldKey: previous.fieldKey, beforeWireKey: previous.wireKey })
      continue
    }
    matched.add(current.id)

    if (previous.wireKey !== current.wireKey) {
      changes.push({
        kind: 'renamed',
        fieldKey: current.fieldKey ?? previous.fieldKey,
        beforeWireKey: previous.wireKey,
        afterWireKey: current.wireKey,
      })
    }
    if (previous.type !== current.type) {
      changes.push({
        kind: 'type-changed',
        fieldKey: current.fieldKey ?? previous.fieldKey,
        beforeWireKey: previous.wireKey,
        afterWireKey: current.wireKey,
        beforeType: previous.type,
        afterType: current.type,
      })
    }
    if (previous.fieldKey !== current.fieldKey) {
      changes.push({
        kind: 'field-key-changed',
        fieldKey: current.fieldKey,
        beforeWireKey: previous.wireKey,
        afterWireKey: current.wireKey,
        beforeFieldKey: previous.fieldKey,
        afterFieldKey: current.fieldKey,
      })
    }
  }

  for (const current of after) {
    if (!matched.has(current.id)) changes.push({ kind: 'added', fieldKey: current.fieldKey, afterWireKey: current.wireKey })
  }

  return changes
}
