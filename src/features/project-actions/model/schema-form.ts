import type { JsonValue } from '@/shared/types/domain'

export type ProjectActionFormFieldKind = 'text' | 'textarea' | 'number' | 'boolean' | 'select' | 'multi-select'

export interface ProjectActionFormField {
  key: string
  label: string
  description?: string
  kind: ProjectActionFormFieldKind
  required: boolean
  options?: JsonValue[]
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  minItems?: number
  maxItems?: number
  integer?: boolean
}

export interface ProjectActionFormIssue {
  code: 'SCHEMA_ROOT_UNSUPPORTED' | 'SCHEMA_ADDITIONAL_PROPERTIES_UNSUPPORTED' | 'SCHEMA_FIELD_FORBIDDEN' | 'SCHEMA_CONTROL_UNSUPPORTED'
  field?: string
  message: string
}

export interface ProjectActionForm {
  fields: ProjectActionFormField[]
  issues: ProjectActionFormIssue[]
  blocked: boolean
}

export interface ProjectActionConfigurationIssue {
  field: string
  code:
    | 'CONFIGURATION_REQUIRED'
    | 'CONFIGURATION_TYPE'
    | 'CONFIGURATION_INTEGER'
    | 'CONFIGURATION_MINIMUM'
    | 'CONFIGURATION_MAXIMUM'
    | 'CONFIGURATION_MIN_LENGTH'
    | 'CONFIGURATION_MAX_LENGTH'
    | 'CONFIGURATION_MIN_ITEMS'
    | 'CONFIGURATION_MAX_ITEMS'
    | 'CONFIGURATION_ENUM'
    | 'CONFIGURATION_UNKNOWN_FIELD'
  message: string
}

const FORBIDDEN_FIELD = /(?:^|[_-])(handler|command|method|url|uri|token|secret|script|selector|route|modalname)(?:$|[_-])/i

export function buildProjectActionForm(schemaValue: unknown, uiSchemaValue: unknown): ProjectActionForm {
  const issues: ProjectActionFormIssue[] = []
  const fields: ProjectActionFormField[] = []
  if (!isRecord(schemaValue) || schemaValue.type !== 'object' || !isRecord(schemaValue.properties)) {
    return {
      fields,
      issues: [{ code: 'SCHEMA_ROOT_UNSUPPORTED', message: 'Backend вернул неподдерживаемую корневую схему конфигурации.' }],
      blocked: true,
    }
  }
  if (schemaValue.additionalProperties !== false) {
    issues.push({
      code: 'SCHEMA_ADDITIONAL_PROPERTIES_UNSUPPORTED',
      message: 'Свободные поля конфигурации не поддерживаются безопасным редактором.',
    })
  }

  const required = new Set(Array.isArray(schemaValue.required) ? schemaValue.required.filter(isString) : [])
  const uiFields = uiFieldMap(uiSchemaValue)
  for (const [key, property] of Object.entries(schemaValue.properties)) {
    if (FORBIDDEN_FIELD.test(normalizeFieldKey(key))) {
      issues.push({
        code: 'SCHEMA_FIELD_FORBIDDEN',
        field: key,
        message: `Поле ${key} относится к server-owned данным и не может редактироваться в CMS.`,
      })
      continue
    }
    const field = toFormField(key, property, uiFields.get(key), required.has(key))
    if (!field) {
      issues.push({
        code: 'SCHEMA_CONTROL_UNSUPPORTED',
        field: key,
        message: `Для поля ${key} нет безопасного поддерживаемого контрола.`,
      })
      continue
    }
    fields.push(field)
  }

  return { fields, issues, blocked: issues.length > 0 }
}

function toFormField(
  key: string,
  value: unknown,
  ui: Record<string, unknown> | undefined,
  required: boolean,
): ProjectActionFormField | null {
  if (!isRecord(value)) return null
  const common = {
    key,
    label: isString(ui?.label) ? ui.label : isString(value.title) ? value.title : humanize(key),
    ...(isString(value.description) ? { description: value.description } : {}),
    required,
  }
  const options = stringValues(value.enum)

  if (value.type === 'string') {
    if (value.enum !== undefined && !options) return null
    if (options) return { ...common, kind: 'select', options }
    return {
      ...common,
      kind: ui?.control === 'textarea' ? 'textarea' : 'text',
      ...numberBounds(value, ['minLength', 'maxLength']),
    }
  }
  if (value.type === 'number' || value.type === 'integer') {
    return { ...common, kind: 'number', integer: value.type === 'integer', ...numberBounds(value, ['minimum', 'maximum']) }
  }
  if (value.type === 'boolean') return { ...common, kind: 'boolean' }
  if (value.type === 'array' && isRecord(value.items)) {
    const itemOptions = stringValues(value.items.enum)
    if (value.items.enum !== undefined && !itemOptions) return null
    if (!itemOptions || value.items.type !== 'string') return null
    return {
      ...common,
      kind: 'multi-select',
      options: itemOptions,
      ...numberBounds(value, ['minItems', 'maxItems']),
    }
  }
  return null
}

export function validateProjectActionConfiguration(
  form: ProjectActionForm,
  configuration: Record<string, unknown>,
): ProjectActionConfigurationIssue[] {
  if (form.blocked) return []
  const issues: ProjectActionConfigurationIssue[] = []
  const supportedFields = new Set(form.fields.map((field) => field.key))

  for (const field of form.fields) {
    const present = Object.prototype.hasOwnProperty.call(configuration, field.key)
      && configuration[field.key] !== undefined
      && configuration[field.key] !== null
    if (!present) {
      if (field.required) issues.push(valueIssue(field.key, 'CONFIGURATION_REQUIRED', `Заполните поле «${field.label}».`))
      continue
    }
    const value = configuration[field.key]
    if (field.kind === 'text' || field.kind === 'textarea' || field.kind === 'select') {
      if (typeof value !== 'string') {
        issues.push(valueIssue(field.key, 'CONFIGURATION_TYPE', `Поле «${field.label}» должно быть строкой.`))
        continue
      }
      if (field.minLength !== undefined && value.length < field.minLength) issues.push(valueIssue(field.key, 'CONFIGURATION_MIN_LENGTH', `Поле «${field.label}» короче допустимого.`))
      if (field.maxLength !== undefined && value.length > field.maxLength) issues.push(valueIssue(field.key, 'CONFIGURATION_MAX_LENGTH', `Поле «${field.label}» длиннее допустимого.`))
      if (field.options && !field.options.includes(value)) issues.push(valueIssue(field.key, 'CONFIGURATION_ENUM', `Выберите разрешённое значение поля «${field.label}».`))
      continue
    }
    if (field.kind === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        issues.push(valueIssue(field.key, 'CONFIGURATION_TYPE', `Поле «${field.label}» должно быть числом.`))
        continue
      }
      if (field.integer && !Number.isInteger(value)) issues.push(valueIssue(field.key, 'CONFIGURATION_INTEGER', `Поле «${field.label}» должно быть целым числом.`))
      if (field.minimum !== undefined && value < field.minimum) issues.push(valueIssue(field.key, 'CONFIGURATION_MINIMUM', `Поле «${field.label}» меньше допустимого.`))
      if (field.maximum !== undefined && value > field.maximum) issues.push(valueIssue(field.key, 'CONFIGURATION_MAXIMUM', `Поле «${field.label}» больше допустимого.`))
      continue
    }
    if (field.kind === 'boolean') {
      if (typeof value !== 'boolean') issues.push(valueIssue(field.key, 'CONFIGURATION_TYPE', `Поле «${field.label}» должно быть логическим значением.`))
      continue
    }
    if (!Array.isArray(value) || !value.every(isString)) {
      issues.push(valueIssue(field.key, 'CONFIGURATION_TYPE', `Поле «${field.label}» должно быть списком строк.`))
      continue
    }
    if (field.minItems !== undefined && value.length < field.minItems) issues.push(valueIssue(field.key, 'CONFIGURATION_MIN_ITEMS', `В поле «${field.label}» выбрано слишком мало значений.`))
    if (field.maxItems !== undefined && value.length > field.maxItems) issues.push(valueIssue(field.key, 'CONFIGURATION_MAX_ITEMS', `В поле «${field.label}» выбрано слишком много значений.`))
    if (field.options && value.some((item) => !field.options!.includes(item))) issues.push(valueIssue(field.key, 'CONFIGURATION_ENUM', `Поле «${field.label}» содержит неразрешённое значение.`))
  }

  for (const key of Object.keys(configuration)) {
    if (!supportedFields.has(key)) issues.push(valueIssue(key, 'CONFIGURATION_UNKNOWN_FIELD', `Поле «${key}» отсутствует в опубликованной схеме.`))
  }
  return issues
}

function valueIssue(
  field: string,
  code: ProjectActionConfigurationIssue['code'],
  message: string,
): ProjectActionConfigurationIssue {
  return { field, code, message }
}

function uiFieldMap(value: unknown): Map<string, Record<string, unknown>> {
  if (!isRecord(value) || !Array.isArray(value.fields)) return new Map()
  return new Map(value.fields.flatMap((field) =>
    isRecord(field) && isString(field.key) ? [[field.key, field] as const] : [],
  ))
}

function stringValues(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || !value.every(isString)) return undefined
  return value
}

function numberBounds<T extends readonly string[]>(value: Record<string, unknown>, keys: T): Partial<Record<T[number], number>> {
  return Object.fromEntries(keys.flatMap((key) => typeof value[key] === 'number' ? [[key, value[key]]] : [])) as Partial<Record<T[number], number>>
}

function normalizeFieldKey(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase()
}

function humanize(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/^./, (character) => character.toUpperCase())
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}
