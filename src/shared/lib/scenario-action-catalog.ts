import type {
  ActionConfigPropertySchema,
  ActionConfigSchema,
  ActionControl,
  ActionUiField,
  ActionUiOption,
  EntityKind,
  JsonValue,
  ScenarioAction,
  ScenarioActionCatalogItem,
} from '@/shared/types/domain'
import type { ScenarioLocalizationCatalogResponseDto } from '@/shared/api/generated/models'

const controls = new Set<ActionControl>([
  'text', 'textarea', 'number', 'select', 'target', 'event', 'json', 'boolean',
  'goal-builder', 'duration', 'node',
])
const entityKinds = new Set<EntityKind>(['BUTTON', 'MODAL', 'PAGE', 'ELEMENT', 'HANDLER'])
const schemaTypes = new Set(['string', 'number', 'integer', 'boolean', 'object', 'array'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function requiredString(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${path} must be a non-empty string`)
  return value
}

function nullableString(value: unknown, path: string): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') throw new Error(`${path} must be a string or null`)
  return value
}

function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${path} must be a boolean`)
  return value
}

function parseSchemaProperty(value: unknown, path: string): ActionConfigPropertySchema {
  if (!isRecord(value)) throw new Error(`${path} must be an object`)
  const type = typeof value.type === 'string' && schemaTypes.has(value.type) ? value.type : undefined
  if (value.enum !== undefined && (!Array.isArray(value.enum) || value.enum.some((item) => !isJsonValue(item)))) {
    throw new Error(`${path}.enum must contain JSON values`)
  }
  if (value.default !== undefined && !isJsonValue(value.default)) throw new Error(`${path}.default must be a JSON value`)
  for (const keyword of ['minLength', 'maxLength', 'minimum', 'maximum', 'minItems', 'maxItems'] as const) {
    if (value[keyword] !== undefined && (typeof value[keyword] !== 'number' || !Number.isFinite(value[keyword]))) {
      throw new Error(`${path}.${keyword} must be a finite number`)
    }
  }
  if (value.pattern !== undefined && typeof value.pattern !== 'string') throw new Error(`${path}.pattern must be a string`)
  if (value.items !== undefined && !isRecord(value.items)) throw new Error(`${path}.items must be a schema object`)
  if (value.properties !== undefined && !isRecord(value.properties)) throw new Error(`${path}.properties must be an object`)
  const properties = value.properties === undefined ? undefined : Object.fromEntries(
    Object.entries(value.properties as Record<string, unknown>).map(([key, property]) => [key, parseSchemaProperty(property, `${path}.properties.${key}`)]),
  )
  const required = value.required
  if (required !== undefined && (!Array.isArray(required) || required.some((key) => typeof key !== 'string' || !properties || !(key in properties)))) {
    throw new Error(`${path}.required must reference declared properties`)
  }
  const additionalProperties = value.additionalProperties
  if (additionalProperties !== undefined && typeof additionalProperties !== 'boolean' && !isRecord(additionalProperties)) {
    throw new Error(`${path}.additionalProperties must be a boolean or schema object`)
  }
  return {
    ...value,
    type,
    items: value.items === undefined ? undefined : parseSchemaProperty(value.items, `${path}.items`),
    properties,
    required: required as string[] | undefined,
    additionalProperties: isRecord(additionalProperties)
      ? parseSchemaProperty(additionalProperties, `${path}.additionalProperties`)
      : additionalProperties,
  } as ActionConfigPropertySchema
}

function parseConfigSchema(value: unknown): ActionConfigSchema {
  if (!isRecord(value) || value.type !== 'object' || !isRecord(value.properties)) {
    throw new Error('scenarioActionCatalogItem.configSchema must describe an object with properties')
  }
  const properties = Object.fromEntries(Object.entries(value.properties).map(([key, property]) => [
    key,
    parseSchemaProperty(property, `scenarioActionCatalogItem.configSchema.properties.${key}`),
  ]))
  const required = value.required === undefined ? [] : value.required
  if (!Array.isArray(required) || required.some((key) => typeof key !== 'string' || !(key in properties))) {
    throw new Error('scenarioActionCatalogItem.configSchema.required must reference declared properties')
  }
  if (value.additionalProperties !== undefined && typeof value.additionalProperties !== 'boolean' && !isRecord(value.additionalProperties)) {
    throw new Error('scenarioActionCatalogItem.configSchema.additionalProperties must be a boolean or schema object')
  }
  const additionalProperties = isRecord(value.additionalProperties)
    ? parseSchemaProperty(value.additionalProperties, 'scenarioActionCatalogItem.configSchema.additionalProperties')
    : value.additionalProperties
  return { ...value, type: 'object', properties, required, additionalProperties } as ActionConfigSchema
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(isJsonValue)
  return isRecord(value) && Object.values(value).every(isJsonValue)
}

function parseOption(value: unknown, path: string): ActionUiOption {
  if (isJsonValue(value) && (!isRecord(value) || !('label' in value) || !('value' in value))) return value
  if (!isRecord(value) || typeof value.label !== 'string' || !isJsonValue(value.value)) {
    throw new Error(`${path} must be a JSON value or a label/value option`)
  }
  return { label: value.label, value: value.value }
}

function parseUiField(value: unknown, properties: ActionConfigSchema['properties'], path: string): ActionUiField {
  if (!isRecord(value)) throw new Error(`${path} must be an object`)
  const key = requiredString(value.key, `${path}.key`)
  if (!(key in properties)) throw new Error(`${path}.key must reference a config property`)
  const control = value.control
  if (typeof control !== 'string' || !controls.has(control as ActionControl)) throw new Error(`${path}.control is unsupported`)
  const targetKinds = value.targetKinds === undefined ? undefined : value.targetKinds
  if (targetKinds !== undefined && (!Array.isArray(targetKinds) || targetKinds.some((kind) => typeof kind !== 'string' || !entityKinds.has(kind as EntityKind)))) {
    throw new Error(`${path}.targetKinds is invalid`)
  }
  if (control === 'target' && (!targetKinds || !targetKinds.length)) throw new Error(`${path}.targetKinds is required`)
  if (value.visibleWhen !== undefined && (!isRecord(value.visibleWhen) || Object.keys(value.visibleWhen).some((fieldKey) => !(fieldKey in properties)))) {
    throw new Error(`${path}.visibleWhen is invalid`)
  }
  if (value.options !== undefined && !Array.isArray(value.options)) throw new Error(`${path}.options must be an array`)
  for (const flag of ['allowCustom', 'supportsTemplates'] as const) {
    if (value[flag] !== undefined && typeof value[flag] !== 'boolean') throw new Error(`${path}.${flag} must be a boolean`)
  }
  return {
    ...value,
    key,
    label: requiredString(value.label, `${path}.label`),
    control: control as ActionControl,
    options: value.options?.map((option, index) => parseOption(option, `${path}.options.${index}`)),
    targetKinds: targetKinds as EntityKind[] | undefined,
    visibleWhen: value.visibleWhen as Record<string, unknown> | undefined,
  }
}

function parseUiSchema(value: unknown, configSchema: ActionConfigSchema) {
  if (!isRecord(value) || !Array.isArray(value.fields)) throw new Error('scenarioActionCatalogItem.uiSchema.fields must be an array')
  const fields = value.fields.map((field, index) => parseUiField(field, configSchema.properties, `scenarioActionCatalogItem.uiSchema.fields.${index}`))
  const keys = fields.map((field) => field.key)
  if (new Set(keys).size !== keys.length) throw new Error('scenarioActionCatalogItem.uiSchema contains duplicate fields')
  const missing = Object.keys(configSchema.properties).filter((key) => !keys.includes(key))
  if (missing.length) throw new Error(`scenarioActionCatalogItem.uiSchema is missing fields: ${missing.join(', ')}`)
  return { ...value, fields }
}

export function parseScenarioActionCatalogItem(value: unknown): ScenarioActionCatalogItem {
  if (!isRecord(value)) throw new Error('scenarioActionCatalogItem must be an object')
  const configSchema = parseConfigSchema(value.configSchema)
  const executor = value.executor
  if (executor !== 'SERVER' && executor !== 'FRONTEND') throw new Error('scenarioActionCatalogItem.executor is unsupported')
  return {
    id: requiredString(value.id, 'scenarioActionCatalogItem.id'),
    type: requiredString(value.type, 'scenarioActionCatalogItem.type'),
    name: requiredString(value.name, 'scenarioActionCatalogItem.name'),
    description: nullableString(value.description, 'scenarioActionCatalogItem.description'),
    executor,
    configSchema,
    uiSchema: parseUiSchema(value.uiSchema, configSchema),
    enabled: booleanValue(value.enabled, 'scenarioActionCatalogItem.enabled'),
  }
}

function cloneJson<T>(value: T): T {
  if (Array.isArray(value)) return value.map(cloneJson) as T
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneJson(item)])) as T
  return value
}

export function createActionConfig(definition: ScenarioActionCatalogItem): Record<string, unknown> {
  return Object.fromEntries(Object.entries(definition.configSchema.properties)
    .filter(([, schema]) => schema.default !== undefined)
    .map(([key, schema]) => [key, cloneJson(schema.default)]))
}

export function isActionFieldVisible(field: ActionUiField, config: Record<string, unknown>): boolean {
  return Object.entries(field.visibleWhen ?? {}).every(([key, expected]) => config[key] === expected)
}

export function actionFieldOptions(field: ActionUiField, property?: ActionConfigPropertySchema): ActionUiOption[] {
  return field.options ?? property?.enum ?? []
}

export function sanitizeActionConfig(definition: ScenarioActionCatalogItem, config: Record<string, unknown>): Record<string, unknown> {
  const visibleKeys = new Set(definition.uiSchema.fields.filter((field) => isActionFieldVisible(field, config)).map((field) => field.key))
  const entries = Object.entries(config).filter(([key, value]) => value !== undefined && (
    (key in definition.configSchema.properties && visibleKeys.has(key)) || definition.configSchema.additionalProperties === true || isRecord(definition.configSchema.additionalProperties)
  ))
  return cloneJson(Object.fromEntries(entries))
}

function typeError(schema: ActionConfigPropertySchema, value: unknown): string {
  if (!schema.type) return ''
  if (schema.type === 'array') return Array.isArray(value) ? '' : 'должно быть списком'
  if (schema.type === 'object') return isRecord(value) ? '' : 'должно быть объектом'
  if (schema.type === 'integer') return typeof value === 'number' && Number.isInteger(value) ? '' : 'должно быть целым числом'
  return typeof value === schema.type ? '' : `должно иметь тип ${schema.type}`
}

function propertyError(schema: ActionConfigPropertySchema, value: unknown, allowLocalized = false): string {
  if (allowLocalized && schema.type === 'string' && isRecord(value)) {
    if (!Object.keys(value).length) return 'не содержит ни одного языкового варианта'
    for (const text of Object.values(value)) {
      if (typeof text !== 'string') return 'содержит перевод не строкового типа'
      const error = propertyError(schema, text)
      if (error) return error
    }
    return ''
  }
  const invalidType = typeError(schema, value)
  if (invalidType) return invalidType
  if (schema.enum && !schema.enum.some((option) => Object.is(option, value))) return 'содержит недопустимое значение'
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) return `должно содержать минимум ${schema.minLength} симв.`
    if (schema.maxLength !== undefined && value.length > schema.maxLength) return `должно содержать максимум ${schema.maxLength} симв.`
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) return `должно быть не меньше ${schema.minimum}`
    if (schema.maximum !== undefined && value > schema.maximum) return `должно быть не больше ${schema.maximum}`
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) return `должно содержать минимум ${schema.minItems} знач.`
    if (schema.maxItems !== undefined && value.length > schema.maxItems) return `должно содержать максимум ${schema.maxItems} знач.`
    if (schema.items) {
      for (const item of value) {
        const error = propertyError(schema.items, item)
        if (error) return `содержит значение, которое ${error}`
      }
    }
  }
  if (isRecord(value) && schema.properties) {
    const missing = schema.required?.find((key) => value[key] === undefined || value[key] === null || value[key] === '')
    if (missing) return `не содержит обязательное поле ${missing}`
    for (const [key, nestedSchema] of Object.entries(schema.properties)) {
      if (value[key] === undefined) continue
      const error = propertyError(nestedSchema, value[key])
      if (error) return `поле ${key} ${error}`
    }
    if (schema.additionalProperties === false) {
      const allowed = new Set(Object.keys(schema.properties))
      if (Object.keys(value).some((key) => !allowed.has(key))) return 'содержит лишние поля'
    }
  }
  return ''
}

export function validateActionConfig(
  definition: ScenarioActionCatalogItem,
  config: Record<string, unknown>,
  localizedKeys = new Set<string>(),
): string {
  for (const field of definition.uiSchema.fields) {
    if (!isActionFieldVisible(field, config)) continue
    const value = config[field.key]
    const required = definition.configSchema.required.includes(field.key) || field.control === 'target'
    if (required && (value === undefined || value === null || value === '')) return `${field.label}: обязательное поле`
    if (value === undefined || value === null || value === '') continue
    const error = propertyError(
      definition.configSchema.properties[field.key] ?? {},
      value,
      localizedKeys.has(field.key),
    )
    if (error) return `${field.label}: ${error}`
  }
  return ''
}

export function validateScenarioActionConfig(
  action: ScenarioAction,
  definition?: ScenarioActionCatalogItem,
  localization?: ScenarioLocalizationCatalogResponseDto,
): string {
  if (!definition) return `Действие ${action.type} отсутствует в каталоге проекта`
  if (!definition.enabled) return `Действие ${definition.name} отключено`
  if (localization?.enabled) {
    const scalarize = (actionType: string, config: Record<string, unknown>): Record<string, unknown> => {
      const copy = cloneJson(config)
      const descriptors = localization.paths.filter((descriptor) => descriptor.actionType === actionType)
      for (const descriptor of descriptors) {
        if (descriptor.path === 'config.options[].label' && Array.isArray(copy.options)) {
          copy.options = copy.options.map((option) => {
            const item = isRecord(option) ? { ...option } : {}
            const label = isRecord(item.label) ? item.label[localization.defaultLocale] : item.label
            return { ...item, label: typeof label === 'string' ? label : '' }
          })
        } else {
          const match = descriptor.path.match(/^config\.([^.]+)$/)
          if (!match) continue
          const key = match[1]!
          const value = copy[key]
          if (isRecord(value)) copy[key] = typeof value[localization.defaultLocale] === 'string' ? value[localization.defaultLocale] : ''
        }
      }
      if (Array.isArray(copy.reminders)) {
        copy.reminders = copy.reminders.map((reminder) => {
          const item = isRecord(reminder) ? { ...reminder } : {}
          if (Array.isArray(item.actions)) {
            item.actions = item.actions.map((nested) => {
              const nestedAction = isRecord(nested) ? { ...nested } : {}
              if (typeof nestedAction.type === 'string' && isRecord(nestedAction.config)) {
                nestedAction.config = scalarize(nestedAction.type, nestedAction.config)
              }
              return nestedAction
            })
          }
          return item
        })
      }
      return copy
    }
    return validateActionConfig(definition, scalarize(action.type, action.config))
  }
  const localizedKeys = new Set(
    localization?.paths
      .filter((descriptor) => descriptor.actionType === action.type && /^config\.[^.]+$/.test(descriptor.path))
      .map((descriptor) => descriptor.path.slice('config.'.length)) ?? [],
  )
  return validateActionConfig(definition, action.config, localizedKeys)
}

export function findScenarioActionCatalogItem(
  catalog: ScenarioActionCatalogItem[],
  type: string,
): ScenarioActionCatalogItem | undefined {
  return catalog.find((item) => item.type === type)
}
