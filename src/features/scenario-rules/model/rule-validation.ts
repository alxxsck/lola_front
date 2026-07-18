import { validateRuleLimits } from './rule-commands'
import { RULE_LIMITS } from './rule-contract'
import type {
  DraftIssue,
  EventAggregateRuleDraftNode,
  EventFieldRuleDraftNode,
  RuleDomainContext,
  RuleDraft,
  RuleDraftNode,
  RuleLiteral,
} from './rule-types'

function issue(code: string, nodeId: string, message: string, fieldPath?: string): DraftIssue {
  return { code, nodeId, message, ...(fieldPath ? { fieldPath } : {}) }
}

function scalarValues(value: RuleLiteral | undefined, arrayRequired: boolean): Array<string | number | boolean> | undefined {
  if (arrayRequired) return Array.isArray(value) ? value : undefined
  if (value === undefined || Array.isArray(value)) return undefined
  return [value]
}

function valuesMatchField(value: RuleLiteral | undefined, valueType: string, allowedValues: unknown[] | undefined, arrayRequired: boolean): boolean {
  const values = scalarValues(value, arrayRequired)
  if (!values?.length || values.length > RULE_LIMITS.maxLiteralArrayItems) return false
  if (valueType === 'number' || valueType === 'integer') {
    return values.every((item) => typeof item === 'number' && Number.isFinite(item) && (valueType !== 'integer' || Number.isSafeInteger(item)))
  }
  if (valueType === 'boolean') return values.every((item) => typeof item === 'boolean')
  return values.every((item) => typeof item === 'string' && item.length <= RULE_LIMITS.maxLiteralStringLength && (!allowedValues || allowedValues.includes(item)))
}

function validateEventField(node: EventFieldRuleDraftNode, context: RuleDomainContext): DraftIssue[] {
  const issues: DraftIssue[] = []
  if (node.eventCode !== context.triggerEventCode) {
    issues.push(issue('trigger-event-mismatch', node.nodeId, 'Поле должно относиться к событию запуска. Выберите поле события запуска заново.', 'eventCode'))
  }
  const event = context.contract.events.find((candidate) => candidate.definitionId === context.triggerEventDefinitionId && candidate.code === context.triggerEventCode)
  const field = event?.fields.find((candidate) => candidate.fieldKey === node.fieldKey)
  if (!field) {
    issues.push(issue('field-unavailable', node.nodeId, 'Поле больше недоступно в каталоге события запуска. Выберите другое поле.', 'fieldKey'))
    return issues
  }
  if (!field.capabilities.eventField.operators.includes(node.operator)) {
    issues.push(issue('operator-unavailable', node.nodeId, 'Это сравнение больше недоступно для выбранного поля. Выберите другое сравнение.', 'operator'))
  }
  if (node.operator === 'exists' || node.operator === 'not_exists') {
    if (node.value !== undefined) issues.push(issue('unexpected-value', node.nodeId, 'Для проверки наличия значение не нужно. Уберите значение.', 'value'))
  } else if (!valuesMatchField(node.value, field.valueType, field.allowedValues, node.operator === 'in')) {
    issues.push(issue('value-invalid', node.nodeId, 'Значение не соответствует типу или допустимым вариантам поля. Исправьте значение.', 'value'))
  }
  return issues
}

function decimalString(value: unknown): boolean {
  return typeof value === 'string' && /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value)
}

function aggregateCompareMatches(node: EventAggregateRuleDraftNode, fieldValueType?: string, semanticType?: string): boolean {
  const value = node.compare.value
  if (typeof value === 'string' && value.length > RULE_LIMITS.maxLiteralStringLength) return false
  if (node.measure === 'exists') return typeof value === 'boolean'
  if (node.measure === 'first' || node.measure === 'last') return typeof value === 'string' && Number.isFinite(Date.parse(value))
  if (node.measure === 'count') return (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) || (decimalString(value) && !String(value).includes('.') && Number(value) >= 0)
  if (semanticType?.startsWith('money')) return decimalString(value) && (semanticType !== 'money_minor' || !String(value).includes('.'))
  if (fieldValueType === 'number' || fieldValueType === 'integer') return (typeof value === 'number' && Number.isFinite(value)) || decimalString(value)
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function validateAggregate(node: EventAggregateRuleDraftNode, context: RuleDomainContext): DraftIssue[] {
  const issues: DraftIssue[] = []
  const event = context.contract.events.find((candidate) => candidate.code === node.eventCode)
  if (!event) return [issue('event-unavailable', node.nodeId, 'Событие истории больше недоступно в каталоге. Выберите другое событие.', 'eventCode')]
  const measure = event.aggregateMeasures.find((candidate) => candidate.measure === node.measure)
  if (!measure) issues.push(issue('measure-unavailable', node.nodeId, 'Этот способ расчёта недоступен для выбранного события. Выберите другой.', 'measure'))
  const field = node.fieldKey ? event.fields.find((candidate) => candidate.fieldKey === node.fieldKey) : undefined
  if (measure?.field === 'required' && !field) {
    issues.push(issue('aggregate-field-required', node.nodeId, 'Для этого расчёта нужно выбрать числовое поле.', 'fieldKey'))
  } else if (field && !field.capabilities.aggregateMeasure.measures.includes(node.measure as 'sum' | 'min' | 'max')) {
    issues.push(issue('aggregate-field-unavailable', node.nodeId, 'Выбранное поле нельзя использовать для этого расчёта. Выберите другое поле.', 'fieldKey'))
  }

  node.filters.forEach((filter, index) => {
    const filterField = event.fields.find((candidate) => candidate.fieldKey === filter.fieldKey)
    const prefix = `filters.${index}`
    if (!filterField) {
      issues.push(issue('filter-field-unavailable', node.nodeId, 'Поле фильтра больше недоступно. Выберите другое поле.', `${prefix}.fieldKey`))
      return
    }
    if (!filterField.capabilities.aggregateFilter.operators.includes(filter.operator)) {
      issues.push(issue('filter-operator-unavailable', node.nodeId, 'Это сравнение недоступно для поля фильтра. Выберите другое.', `${prefix}.operator`))
    }
    if (filter.operator === 'exists') {
      if (filter.value !== undefined) issues.push(issue('unexpected-value', node.nodeId, 'Для проверки наличия значение не нужно. Уберите значение.', `${prefix}.value`))
    } else if (!valuesMatchField(filter.value, filterField.valueType, filterField.allowedValues, filter.operator === 'in')) {
      issues.push(issue('filter-value-invalid', node.nodeId, 'Значение фильтра не соответствует выбранному полю. Исправьте значение.', `${prefix}.value`))
    }
  })

  if (node.window.kind === 'sinceTrigger') {
    if (context.mode === 'initialEligibility') issues.push(issue('since-trigger-unavailable', node.nodeId, 'Период от события запуска доступен только при повторной проверке. Выберите конечный период.', 'window'))
  } else if (!Number.isInteger(node.window.durationMs) || node.window.durationMs < 1 || node.window.durationMs > RULE_LIMITS.maxWindowMs) {
    issues.push(issue('window-invalid', node.nodeId, 'Период истории должен быть от 1 миллисекунды до 90 дней.', 'window.durationMs'))
  }
  if (node.window.boundary !== undefined && node.window.boundary !== 'beforeTrigger') {
    issues.push(issue('window-boundary-invalid', node.nodeId, 'История должна заканчиваться перед событием запуска.', 'window.boundary'))
  }
  if (measure && !measure.compareOperators.includes(node.compare.operator)) {
    issues.push(issue('compare-operator-unavailable', node.nodeId, 'Это сравнение недоступно для результата расчёта. Выберите другое.', 'compare.operator'))
  }
  if (!aggregateCompareMatches(node, field?.valueType, field?.semanticType ?? undefined)) {
    issues.push(issue('compare-value-invalid', node.nodeId, 'Порог не соответствует результату расчёта. Исправьте значение.', 'compare.value'))
  }
  if (field?.semanticType?.startsWith('money')) {
    const currencyFilters = node.filters.filter((filter) => {
      const filterField = event.fields.find((candidate) => candidate.fieldKey === filter.fieldKey)
      return filterField?.semanticType === 'currency'
    })
    if (currencyFilters.length !== 1 || currencyFilters[0]?.operator !== 'eq') {
      issues.push(issue('money-currency-required', node.nodeId, 'Для суммы денег добавьте ровно один фильтр валюты с условием «равно».', 'filters'))
    }
  }
  return issues
}

function collectNodeIssues(node: RuleDraftNode, context: RuleDomainContext): DraftIssue[] {
  if (node.kind === 'empty') return [issue('empty-node', node.nodeId, 'Выберите условие или удалите пустую строку.')]
  if (node.kind === 'incomplete') return [issue('incomplete-node', node.nodeId, 'Заполните все обязательные поля условия.')]
  if (node.kind === 'opaque') return [issue('unsupported-node', node.nodeId, 'Неподдерживаемое условие нельзя опубликовать. Удалите или замените его.')]
  if (node.kind === 'all' || node.kind === 'any') {
    return [
      ...(node.children.length ? [] : [issue('empty-group', node.nodeId, 'Добавьте в группу хотя бы одно условие.')]),
      ...node.children.flatMap((child) => collectNodeIssues(child, context)),
    ]
  }
  if (node.kind === 'not') return collectNodeIssues(node.child, context)
  if (node.kind === 'eventField') return validateEventField(node, context)
  if (node.kind === 'eventAggregate') return validateAggregate(node, context)
  const issues: DraftIssue[] = []
  if (!['eq', 'neq', 'gt', 'gte', 'lt', 'lte'].includes(node.compare.operator)) {
    issues.push(issue('streak-operator-invalid', node.nodeId, 'Выберите допустимое сравнение для активных дней.', 'compare.operator'))
  }
  if (!Number.isInteger(node.compare.value) || node.compare.value < 0 || node.compare.value > RULE_LIMITS.maxStreakDays) {
    issues.push(issue('streak-value-invalid', node.nodeId, `Укажите целое число активных дней от 0 до ${RULE_LIMITS.maxStreakDays}.`, 'compare.value'))
  }
  return issues
}

export function collectRuleDraftIssues(draft: RuleDraft, context: RuleDomainContext): DraftIssue[] {
  const limit = validateRuleLimits(draft.root)
  const issues: DraftIssue[] = [...(limit ? [limit] : []), ...collectNodeIssues(draft.root, context)]
  const seen = new Set<string>()
  return issues.filter((current) => {
    const key = `${current.code}:${current.nodeId ?? ''}:${current.fieldPath ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
