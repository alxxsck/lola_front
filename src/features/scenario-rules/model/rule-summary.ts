import { RULE_LIMITS } from './rule-contract'
import type { RuleDomainContext, RuleDraft, RuleDraftNode, RuleLiteral, RuleSummary } from './rule-types'

const operatorLabels: Record<string, string> = {
  eq: '=',
  neq: '≠',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  in: 'одно из',
  exists: 'заполнено',
  not_exists: 'не заполнено',
}

const streakOperatorLabels: Record<string, string> = {
  eq: 'ровно',
  neq: 'не ровно',
  gt: 'более',
  gte: 'не менее',
  lt: 'менее',
  lte: 'не более',
}

function displayValue(value: RuleLiteral | undefined): string {
  if (Array.isArray(value)) return value.map((item) => displayValue(item)).join(', ')
  if (value === true) return 'да'
  if (value === false) return 'нет'
  if (value === undefined) return 'значение не задано'
  return String(value)
}

function durationLabel(durationMs: number): string {
  const day = 86_400_000
  const hour = 3_600_000
  const minute = 60_000
  if (durationMs % day === 0) return `${durationMs / day} дней`
  if (durationMs % hour === 0) return `${durationMs / hour} часов`
  if (durationMs % minute === 0) return `${durationMs / minute} минут`
  return `${durationMs} мс`
}

function eventFieldSummary(node: Extract<RuleDraftNode, { kind: 'eventField' }>, context: RuleDomainContext): string {
  const event = context.contract.events.find((candidate) => candidate.definitionId === context.triggerEventDefinitionId && candidate.code === node.eventCode)
  const field = event?.fields.find((candidate) => candidate.fieldKey === node.fieldKey)
  const label = field?.label ?? node.fieldKey
  if (node.operator === 'exists' || node.operator === 'not_exists') return `${label} ${operatorLabels[node.operator]}`
  return `${label} ${operatorLabels[node.operator] ?? node.operator} ${displayValue(node.value)}`
}

function aggregateSummary(node: Extract<RuleDraftNode, { kind: 'eventAggregate' }>, context: RuleDomainContext): string {
  const event = context.contract.events.find((candidate) => candidate.code === node.eventCode)
  const eventLabel = event?.name ?? node.eventCode
  const field = event?.fields.find((candidate) => candidate.fieldKey === node.fieldKey)
  const subject = node.measure === 'sum'
    ? `сумма поля «${field?.label ?? node.fieldKey ?? 'не выбрано'}» события «${eventLabel}»`
    : node.measure === 'min'
      ? `минимум поля «${field?.label ?? node.fieldKey ?? 'не выбрано'}» события «${eventLabel}»`
      : node.measure === 'max'
        ? `максимум поля «${field?.label ?? node.fieldKey ?? 'не выбрано'}» события «${eventLabel}»`
        : node.measure === 'count'
          ? `количество событий «${eventLabel}»`
          : node.measure === 'exists'
            ? `наличие события «${eventLabel}»`
            : `${node.measure === 'first' ? 'первое' : 'последнее'} событие «${eventLabel}»`
  const filters = node.filters.map((filter) => {
    const filterField = event?.fields.find((candidate) => candidate.fieldKey === filter.fieldKey)
    const operator = operatorLabels[filter.operator] ?? filter.operator
    return `${filterField?.label ?? filter.fieldKey} ${operator}${filter.value === undefined ? '' : ` ${displayValue(filter.value)}`}`
  })
  const filterText = filters.length ? `, где ${filters.join(' и ')}` : ''
  const windowText = node.window.kind === 'last'
    ? ` за последние ${durationLabel(node.window.durationMs)}`
    : ' после события запуска'
  const unit = field?.unit ? ` ${field.unit}` : ''
  return `${subject}${filterText}${windowText} ${operatorLabels[node.compare.operator] ?? node.compare.operator} ${displayValue(node.compare.value)}${unit}`
}

function summarizeNode(node: RuleDraftNode, context: RuleDomainContext, byNodeId: Record<string, string>): string {
  let text: string
  if (node.kind === 'empty') text = 'условие ещё не выбрано'
  else if (node.kind === 'incomplete') text = 'условие заполнено не полностью'
  else if (node.kind === 'opaque') text = `неподдерживаемое условие${node.reportedKind ? ` «${node.reportedKind}»` : ''}`
  else if (node.kind === 'all' || node.kind === 'any') {
    const children = node.children.map((child) => summarizeNode(child, context, byNodeId))
    text = children.length ? `${node.kind === 'all' ? 'Все' : 'Хотя бы одно'}: ${children.join('; ')}` : 'Условия ещё не добавлены'
  } else if (node.kind === 'not') text = `НЕ ${summarizeNode(node.child, context, byNodeId)}`
  else if (node.kind === 'eventField') text = eventFieldSummary(node, context)
  else if (node.kind === 'eventAggregate') text = aggregateSummary(node, context)
  else text = `активен ${streakOperatorLabels[node.compare.operator] ?? node.compare.operator} ${node.compare.value} дней подряд`
  byNodeId[node.nodeId] = text
  return text
}

export function summarizeRule(draft: RuleDraft, context: RuleDomainContext): RuleSummary {
  let nodes = 0
  let leaves = 0
  let aggregateLeaves = 0
  let maxWindowMs = 0
  let totalWindowMs = 0
  let hasEmpty = false
  let hasIncomplete = false
  let hasOpaque = false

  const visit = (node: RuleDraftNode) => {
    nodes += 1
    if (node.kind === 'all' || node.kind === 'any') {
      if (!node.children.length) hasEmpty = true
      node.children.forEach(visit)
      return
    }
    if (node.kind === 'not') {
      visit(node.child)
      return
    }
    if (node.kind === 'empty') {
      hasEmpty = true
      return
    }
    leaves += 1
    if (node.kind === 'opaque') hasOpaque = true
    if (node.kind === 'incomplete') {
      hasIncomplete = true
      if (node.leaf.kind === 'eventAggregate' || node.leaf.kind === 'activityDayStreak') aggregateLeaves += 1
      return
    }
    if (node.kind === 'eventAggregate' || node.kind === 'activityDayStreak') aggregateLeaves += 1
    if (node.kind === 'eventAggregate') {
      const windowMs = node.window.kind === 'last' ? node.window.durationMs : RULE_LIMITS.maxWindowMs
      maxWindowMs = Math.max(maxWindowMs, windowMs)
      totalWindowMs += windowMs
    }
  }
  visit(draft.root)

  const byNodeId: Record<string, string> = {}
  const text = summarizeNode(draft.root, context, byNodeId)
  const status = hasOpaque ? 'unsupported' : hasIncomplete ? 'incomplete' : hasEmpty || leaves === 0 ? 'empty' : 'ready'
  return { text, byNodeId, status, leaves, aggregateLeaves, nodes, maxWindowMs, totalWindowMs }
}
