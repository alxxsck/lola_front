interface EventContractInput {
  name: string
  code: string
  version: number
  payloadSchema: Record<string, unknown>
}

interface ProfileContractField {
  key: string
  label: string
  valueType: string
  requirement: string
  lifecycle: string
  description?: string | null
}

interface ProfileContractInput {
  version?: number
  draft: boolean
  fields: ProfileContractField[]
}

interface MarkdownField {
  path: string
  type: string
  requirement: string
  description: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function cell(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\s*\r?\n\s*/g, ' ').trim() || '—'
}

function inlineCode(value: string) {
  const escaped = value.replace(/\|/g, '\\|')
  const longestRun = Math.max(0, ...[...escaped.matchAll(/`+/g)].map(([run]) => run.length))
  const delimiter = '`'.repeat(longestRun + 1)
  const content = escaped.startsWith('`') || escaped.endsWith('`') ? ` ${escaped} ` : escaped
  return `${delimiter}${content}${delimiter}`
}

function localRefTarget(ref: string, root: Record<string, unknown>) {
  if (!ref.startsWith('#/')) return undefined
  return ref
    .slice(2)
    .split('/')
    .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce<unknown>((value, part) => isRecord(value) ? value[part] : undefined, root)
}

function valueType(value: unknown) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value === 'object' ? 'object' : typeof value
}

function schemaType(
  schema: unknown,
  root: Record<string, unknown>,
  visitedRefs = new Set<string>(),
): string {
  if (schema === true) return 'any'
  if (schema === false) return 'never'
  if (!isRecord(schema)) return 'any'

  if (typeof schema.$ref === 'string') {
    const target = localRefTarget(schema.$ref, root)
    if (target !== undefined && !visitedRefs.has(schema.$ref)) {
      const nextRefs = new Set(visitedRefs).add(schema.$ref)
      return schemaType(target, root, nextRefs)
    }
    return `ref<${schema.$ref}>`
  }

  const declaredTypes = Array.isArray(schema.type)
    ? schema.type.filter((type): type is string => typeof type === 'string')
    : typeof schema.type === 'string'
      ? [schema.type]
      : []
  if (declaredTypes.length) {
    return declaredTypes.map((type) => {
      if (type === 'array' && schema.items !== undefined) {
        return `array<${schemaType(schema.items, root, visitedRefs)}>`
      }
      return type
    }).join(' | ')
  }

  for (const keyword of ['oneOf', 'anyOf', 'allOf'] as const) {
    if (!Array.isArray(schema[keyword])) continue
    const types = [...new Set(schema[keyword].map((variant) => schemaType(variant, root, visitedRefs)))]
    return `${keyword}<${types.join(' | ')}>`
  }

  if (Array.isArray(schema.enum)) {
    return `${[...new Set(schema.enum.map(valueType))].join(' | ')} (enum)`
  }
  if (Object.hasOwn(schema, 'const')) return valueType(schema.const)
  if (isRecord(schema.properties)) return 'object'
  if (schema.items !== undefined) return `array<${schemaType(schema.items, root, visitedRefs)}>`
  return 'any'
}

function eventPayloadFields(
  schema: unknown,
  parentPath = 'payload',
  root: Record<string, unknown> = isRecord(schema) ? schema : {},
  conditionPath?: string,
  variantConditional = false,
  visitedRefs = new Set<string>(),
): MarkdownField[] {
  if (!isRecord(schema)) return []
  if (typeof schema.$ref === 'string') {
    const target = localRefTarget(schema.$ref, root)
    if (target === undefined || visitedRefs.has(schema.$ref)) return []
    return eventPayloadFields(
      target,
      parentPath,
      root,
      conditionPath,
      variantConditional,
      new Set(visitedRefs).add(schema.$ref),
    )
  }

  const composed = (['allOf', 'anyOf', 'oneOf'] as const).flatMap((keyword) =>
    Array.isArray(schema[keyword])
      ? schema[keyword].flatMap((part) => eventPayloadFields(
          part,
          parentPath,
          root,
          conditionPath,
          variantConditional || keyword !== 'allOf',
          visitedRefs,
        ))
      : [],
  )
  if (!isRecord(schema.properties)) return mergeMarkdownFields(composed)
  const required = new Set(
    Array.isArray(schema.required)
      ? schema.required.filter((key): key is string => typeof key === 'string')
      : [],
  )

  const direct = Object.entries(schema.properties).flatMap(([key, property]) => {
    const path = `${parentPath}.${key}`
    const isRequired = required.has(key)
    const current: MarkdownField = {
      path,
      type: schemaType(property, root, visitedRefs),
      requirement: isRequired
        ? variantConditional
          ? 'обязательно в соответствующем варианте'
          : conditionPath
            ? `обязательно, если передан ${inlineCode(conditionPath)}`
            : 'обязательно'
        : 'необязательно',
      description: isRecord(property) && typeof property.description === 'string' ? property.description : '',
    }
    const nestedCondition = isRequired ? conditionPath : path
    const nested = isRecord(property) && property.type === 'array' && property.items !== undefined
      ? eventPayloadFields(property.items, `${path}[]`, root, nestedCondition, variantConditional, visitedRefs)
      : eventPayloadFields(property, path, root, nestedCondition, variantConditional, visitedRefs)
    return [current, ...nested]
  })

  return mergeMarkdownFields([...direct, ...composed])
}

function mergeMarkdownFields(fields: MarkdownField[]) {
  const merged = new Map<string, MarkdownField>()
  for (const field of fields) {
    const existing = merged.get(field.path)
    if (!existing) {
      merged.set(field.path, field)
      continue
    }
    if (existing.type !== field.type) {
      existing.type = `${existing.type} | ${field.type}`
    }
    if (existing.requirement !== field.requirement) existing.requirement = 'зависит от варианта'
    if (!existing.description) existing.description = field.description
  }
  return [...merged.values()]
}

function markdownTable(headers: string[], rows: string[][]) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n')
}

export function formatEventContractMarkdown(input: EventContractInput) {
  const fields = eventPayloadFields(input.payloadSchema, 'payload', input.payloadSchema)
  const rows = [
    [inlineCode('eventCode'), inlineCode('string'), 'обязательно', inlineCode(input.code)],
    ...fields.map((field) => [
      inlineCode(field.path),
      inlineCode(field.type),
      field.requirement,
      cell(field.description),
    ]),
  ]

  return [
    `# Событие: ${cell(input.name)}`,
    '',
    `- Event code: ${inlineCode(input.code)}`,
    `- Версия схемы: ${input.version}`,
    '',
    markdownTable(['Параметр', 'Тип', 'Обязательность', 'Описание'], rows),
  ].join('\n')
}

const profileTypes: Record<string, string> = {
  STRING: 'string',
  BOOLEAN: 'boolean',
  INTEGER: 'integer',
  DECIMAL: 'decimal string',
  DATE: 'date string',
  DATETIME: 'date-time string',
  COUNTRY_CODE: 'country code string',
  CURRENCY_CODE: 'currency code string',
}

const profileRequirements: Record<string, string> = {
  OPTIONAL: 'необязательно',
  REQUIRED_WARN: 'желательно (если нет — предупреждение)',
  REQUIRED_ENFORCED: 'обязательно (строго)',
}

export function formatProfileContractMarkdown(input: ProfileContractInput) {
  const rows = input.fields.map((field) => {
    const description = field.description?.trim()
    return [
      inlineCode(field.key),
      inlineCode(profileTypes[field.valueType] ?? field.valueType.toLowerCase()),
      profileRequirements[field.requirement] ?? field.requirement.toLowerCase(),
      cell(description ? `${field.label} — ${description}` : field.label),
    ]
  })

  const state = input.draft
    ? [
        '- Состояние: текущий черновик (ещё не опубликован)',
        ...(input.version === undefined ? [] : [`- Действующая версия: ${input.version}`]),
      ]
    : [`- Версия контракта: ${input.version ?? '—'}`]

  return [
    '# Поля профиля пользователей',
    '',
    ...state,
    '',
    markdownTable(['Поле', 'Тип', 'Обязательность', 'Описание'], rows),
  ].join('\n')
}
