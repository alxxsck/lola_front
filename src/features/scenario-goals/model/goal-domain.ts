import type { ScenarioAuthoringContract, ScenarioGoalDto } from '@/shared/api/repository/scenario-authoring'

export type GoalMeasure = 'count' | 'sum'
export type GoalFilterOperator = 'eq' | 'neq' | 'in' | 'exists'
export type GoalCompareOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'

export interface GoalFilterDraft {
  fieldKey: string
  operator: GoalFilterOperator
  value?: string | number | boolean | Array<string | number | boolean>
}

export interface GoalDraft {
  eventCode: string
  measure: GoalMeasure
  numericFieldKey?: string
  filters: GoalFilterDraft[]
  compare: { operator: GoalCompareOperator; value: string }
  timeoutMs: number
  onGoal: string
  onTimeout: string
}

export interface GoalDraftIssue {
  code: string
  message: string
  field: string
}

export type GoalSerializationResult =
  | { ok: true; value: { goal: ScenarioGoalDto; timeoutMs: number; onGoal: string; onTimeout: string } }
  | { ok: false; issues: GoalDraftIssue[] }

const MIN_TIMEOUT_MS = 1_000
const MAX_TIMEOUT_MS = 90 * 86_400_000
const decimalPattern = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/

export function createGoalDraft(): GoalDraft {
  return {
    eventCode: '', measure: 'count', filters: [], compare: { operator: 'gte', value: '1' },
    timeoutMs: 86_400_000, onGoal: '', onTimeout: '',
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function cloneFilterValue(value: unknown): GoalFilterDraft['value'] {
  if (Array.isArray(value)) return value.filter((item): item is string | number | boolean => ['string', 'number', 'boolean'].includes(typeof item)).map((item) => item)
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : undefined
}

export function goalDraftFromConfig(value: Record<string, unknown>): GoalDraft {
  const draft = createGoalDraft()
  const goal = record(value.goal)
  if (typeof goal.eventCode === 'string') draft.eventCode = goal.eventCode
  if (goal.measure === 'count' || goal.measure === 'sum') draft.measure = goal.measure
  if (typeof goal.numericFieldKey === 'string') draft.numericFieldKey = goal.numericFieldKey
  if (Array.isArray(goal.filters)) {
    draft.filters = goal.filters.map(record).map((filter) => ({
      fieldKey: typeof filter.fieldKey === 'string' ? filter.fieldKey : '',
      operator: ['eq', 'neq', 'in', 'exists'].includes(String(filter.operator)) ? filter.operator as GoalFilterOperator : 'eq',
      ...(filter.value === undefined ? {} : { value: cloneFilterValue(filter.value) }),
    }))
  }
  const compare = record(goal.compare)
  if (['eq', 'neq', 'gt', 'gte', 'lt', 'lte'].includes(String(compare.operator))) draft.compare.operator = compare.operator as GoalCompareOperator
  if (typeof compare.value === 'string' || typeof compare.value === 'number') draft.compare.value = String(compare.value)
  if (typeof value.timeoutMs === 'number') draft.timeoutMs = value.timeoutMs
  if (typeof value.onGoal === 'string') draft.onGoal = value.onGoal
  if (typeof value.onTimeout === 'string') draft.onTimeout = value.onTimeout
  return draft
}

function issue(code: string, message: string, field: string): GoalDraftIssue {
  return { code, message, field }
}

function scalarValueMatches(value: GoalFilterDraft['value'], valueType: string, allowedValues?: unknown[]): boolean {
  if (Array.isArray(value)) return false
  if (valueType === 'number') return typeof value === 'number' && Number.isFinite(value)
  if (valueType === 'integer') return typeof value === 'number' && Number.isSafeInteger(value)
  if (valueType === 'boolean') return typeof value === 'boolean'
  return typeof value === 'string' && (!allowedValues || allowedValues.includes(value))
}

function valueMatches(value: GoalFilterDraft['value'], valueType: string, allowedValues: unknown[] | undefined, operator: GoalFilterOperator): boolean {
  if (operator === 'in') return Array.isArray(value) && value.length > 0 && value.every((item) => scalarValueMatches(item, valueType, allowedValues))
  return scalarValueMatches(value, valueType, allowedValues)
}

export function goalFilterOperatorLabel(operator: GoalFilterOperator): string {
  return { eq: 'равно', neq: 'не равно', in: 'одно из', exists: 'заполнено' }[operator]
}

export function validateGoalDraft(draft: GoalDraft, contract: ScenarioAuthoringContract): GoalDraftIssue[] {
  const issues: GoalDraftIssue[] = []
  const event = contract.events.find((candidate) => candidate.code === draft.eventCode)
  if (!event) return [issue('event-required', 'Выберите опубликованное событие цели.', 'eventCode')]

  const numericField = draft.numericFieldKey
    ? event.fields.find((field) => field.fieldKey === draft.numericFieldKey)
    : undefined
  if (draft.measure === 'sum' && (!numericField || !numericField.capabilities.aggregateMeasure.measures.includes('sum'))) {
    issues.push(issue('numeric-field-required', 'Для суммы выберите доступное числовое поле.', 'numericFieldKey'))
  }
  if (draft.filters.length > 20) issues.push(issue('filters-limit', 'Для цели допустимо не более 20 фильтров.', 'filters'))
  draft.filters.forEach((filter, index) => {
    const field = event.fields.find((candidate) => candidate.fieldKey === filter.fieldKey)
    if (!field) {
      issues.push(issue('filter-field-required', 'Выберите поле фильтра.', `filters.${index}.fieldKey`))
      return
    }
    if (!field.capabilities.aggregateFilter.operators.includes(filter.operator)) {
      issues.push(issue('filter-operator-invalid', 'Выбранное сравнение недоступно для поля.', `filters.${index}.operator`))
    }
    if (filter.operator === 'exists') {
      if (filter.value !== undefined) issues.push(issue('filter-value-unexpected', 'Для проверки наличия значение не требуется.', `filters.${index}.value`))
    } else if (!valueMatches(filter.value, field.valueType, field.allowedValues, filter.operator)) {
      issues.push(issue('filter-value-invalid', 'Значение не соответствует типу поля.', `filters.${index}.value`))
    }
  })

  if (draft.measure === 'sum' && numericField?.semanticType?.startsWith('money')) {
    const currencyFilters = draft.filters.filter((filter) => {
      const field = event.fields.find((candidate) => candidate.fieldKey === filter.fieldKey)
      return field?.semanticType === 'currency' && filter.operator === 'eq' && typeof filter.value === 'string'
    })
    if (currencyFilters.length !== 1) {
      issues.push(issue('currency-required', 'Для денежной суммы добавьте ровно один фильтр валюты «равно».', 'filters'))
    }
  }
  if (!decimalPattern.test(draft.compare.value)) issues.push(issue('threshold-invalid', 'Укажите точное конечное число.', 'compare.value'))
  if (!Number.isInteger(draft.timeoutMs) || draft.timeoutMs < MIN_TIMEOUT_MS || draft.timeoutMs > MAX_TIMEOUT_MS) {
    issues.push(issue('deadline-invalid', 'Срок цели должен быть от 1 секунды до 90 дней.', 'timeoutMs'))
  }
  if (!draft.onGoal) issues.push(issue('goal-branch-required', 'Выберите действие при достижении цели.', 'onGoal'))
  if (!draft.onTimeout) issues.push(issue('timeout-branch-required', 'Выберите действие по истечении срока.', 'onTimeout'))
  return issues
}

export function serializeGoalDraft(draft: GoalDraft, contract: ScenarioAuthoringContract): GoalSerializationResult {
  const issues = validateGoalDraft(draft, contract)
  if (issues.length) return { ok: false, issues }
  const goal: ScenarioGoalDto = {
    version: 1,
    eventCode: draft.eventCode,
    measure: draft.measure,
    ...(draft.measure === 'sum' ? { numericFieldKey: draft.numericFieldKey } : {}),
    filters: draft.filters.map((filter) => ({
      fieldKey: filter.fieldKey,
      operator: filter.operator,
      ...(filter.value === undefined ? {} : { value: filter.value }),
    })),
    compare: { ...draft.compare },
  }
  return {
    ok: true,
    value: {
      goal,
      timeoutMs: draft.timeoutMs,
      onGoal: draft.onGoal,
      onTimeout: draft.onTimeout,
    },
  }
}

function durationLabel(durationMs: number): string {
  if (durationMs % 86_400_000 === 0) {
    const days = durationMs / 86_400_000
    const suffix = days % 10 === 1 && days % 100 !== 11 ? 'день' : [2, 3, 4].includes(days % 10) && ![12, 13, 14].includes(days % 100) ? 'дня' : 'дней'
    return `${days} ${suffix}`
  }
  if (durationMs % 3_600_000 === 0) return `${durationMs / 3_600_000} ч.`
  if (durationMs % 60_000 === 0) return `${durationMs / 60_000} мин.`
  return `${Math.round(durationMs / 1_000)} сек.`
}

export function summarizeGoalDraft(draft: GoalDraft, contract: ScenarioAuthoringContract): string {
  const event = contract.events.find((candidate) => candidate.code === draft.eventCode)
  const numericField = event?.fields.find((field) => field.fieldKey === draft.numericFieldKey)
  const measure = draft.measure === 'sum' ? `сумма поля «${numericField?.label ?? draft.numericFieldKey ?? 'не выбрано'}»` : 'количество событий'
  const compare = { eq: 'равно', neq: 'не равно', gt: 'больше', gte: 'не меньше', lt: 'меньше', lte: 'не больше' }[draft.compare.operator]
  const filters = draft.filters.map((filter) => {
    const field = event?.fields.find((candidate) => candidate.fieldKey === filter.fieldKey)
    const value = Array.isArray(filter.value) ? filter.value.join(', ') : filter.value
    return `${field?.label || filter.fieldKey || 'Поле'} ${goalFilterOperatorLabel(filter.operator)}${filter.operator === 'exists' ? '' : ` ${String(value ?? '—')}`}`
  })
  return [
    `${event?.name ?? (draft.eventCode || 'Событие не выбрано')}: ${measure} ${compare} ${draft.compare.value}`,
    ...(filters.length ? [`фильтры: ${filters.join('; ')}`] : []),
    `срок цели ${durationLabel(draft.timeoutMs)}`,
    `если цель достигнута → ${draft.onGoal || 'ветка не выбрана'}`,
    `если срок истёк → ${draft.onTimeout || 'ветка не выбрана'}`,
  ].join('; ')
}
