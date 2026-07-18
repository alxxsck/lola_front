import type {
  ActivityDayStreakRuleNodeDto,
  AggregateFilterDto,
  AllRuleNodeDto,
  AnyRuleNodeDto,
  EventAggregateRuleNodeDto,
  EventFieldRuleNodeDto,
  NotRuleNodeDto,
  ScenarioRuleDtoRoot,
} from '@/shared/api/generated/models'
import { uid } from '@/shared/lib/format'

import type {
  DraftIssue,
  RuleDeserializeResult,
  RuleDomainContext,
  RuleDraftNode,
  RulePathEntry,
  RuleSerializationResult,
} from './rule-types'
import { collectRuleDraftIssues } from './rule-validation'
import { cloneRuleValue } from './rule-value'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function clone<T>(value: T): T {
  return cloneRuleValue(value)
}

function opaqueNode(source: unknown): RuleDraftNode {
  return {
    nodeId: uid('rule_node'),
    kind: 'opaque',
    source: clone(source),
    ...(isRecord(source) && typeof source.kind === 'string' ? { reportedKind: source.kind } : {}),
  }
}

function parseNode(source: unknown, issues: DraftIssue[]): RuleDraftNode {
  if (!isRecord(source) || typeof source.kind !== 'string') {
    const node = opaqueNode(source)
    issues.push({ code: 'unsupported-node', nodeId: node.nodeId, message: 'Узел правила имеет неподдерживаемый формат. Удалите или замените его.' })
    return node
  }

  if ((source.kind === 'all' || source.kind === 'any') && Array.isArray(source.children)) {
    return {
      nodeId: uid('rule_node'),
      kind: source.kind,
      children: source.children.map((child) => parseNode(child, issues)),
    }
  }
  if (source.kind === 'not' && Object.hasOwn(source, 'child')) {
    return { nodeId: uid('rule_node'), kind: 'not', child: parseNode(source.child, issues) }
  }
  if (
    source.kind === 'eventField' &&
    typeof source.eventCode === 'string' &&
    typeof source.fieldKey === 'string' &&
    typeof source.operator === 'string'
  ) {
    return {
      nodeId: uid('rule_node'),
      kind: 'eventField',
      eventCode: source.eventCode,
      fieldKey: source.fieldKey,
      operator: source.operator as EventFieldRuleNodeDto['operator'],
      ...(Object.hasOwn(source, 'value') ? { value: clone(source.value) as EventFieldRuleNodeDto['value'] } : {}),
    }
  }
  if (source.kind === 'activityDayStreak' && isRecord(source.compare) && typeof source.compare.operator === 'string' && typeof source.compare.value === 'number') {
    return {
      nodeId: uid('rule_node'),
      kind: 'activityDayStreak',
      compare: { operator: source.compare.operator as ActivityDayStreakRuleNodeDto['compare']['operator'], value: source.compare.value },
    }
  }
  if (
    source.kind === 'eventAggregate' &&
    typeof source.eventCode === 'string' &&
    typeof source.measure === 'string' &&
    Array.isArray(source.filters ?? []) &&
    isRecord(source.window) &&
    typeof source.window.kind === 'string' &&
    isRecord(source.compare) &&
    typeof source.compare.operator === 'string' &&
    (typeof source.compare.value === 'string' || typeof source.compare.value === 'number' || typeof source.compare.value === 'boolean')
  ) {
    const filters = (source.filters ?? []) as unknown[]
    if (filters.every((filter) => isRecord(filter) && typeof filter.fieldKey === 'string' && typeof filter.operator === 'string')) {
      return {
        nodeId: uid('rule_node'),
        kind: 'eventAggregate',
        eventCode: source.eventCode,
        measure: source.measure as EventAggregateRuleNodeDto['measure'],
        ...(typeof source.fieldKey === 'string' ? { fieldKey: source.fieldKey } : {}),
        filters: filters.map((filter) => {
          const value = filter as Record<string, unknown>
          return {
            filterId: uid('rule_filter'),
            fieldKey: value.fieldKey as string,
            operator: value.operator as AggregateFilterDto['operator'],
            ...(Object.hasOwn(value, 'value') ? { value: clone(value.value) as AggregateFilterDto['value'] } : {}),
          }
        }),
        window: clone(source.window) as unknown as EventAggregateRuleNodeDto['window'],
        compare: clone(source.compare) as unknown as EventAggregateRuleNodeDto['compare'],
      }
    }
  }

  const node = opaqueNode(source)
  issues.push({ code: 'unsupported-node', nodeId: node.nodeId, message: `Условие «${node.kind === 'opaque' ? (node.reportedKind ?? 'неизвестное') : 'неизвестное'}» пока не поддерживается. Замените его, чтобы опубликовать правило.` })
  return node
}

export function deserializeRule(input: unknown, context: RuleDomainContext): RuleDeserializeResult {
  const issues: DraftIssue[] = []
  if (!isRecord(input) || input.version !== 1 || !Object.hasOwn(input, 'root')) {
    const root = opaqueNode(input)
    return {
      draft: { version: 1, root },
      issues: [{ code: 'unsupported-rule', nodeId: root.nodeId, message: 'Версия или структура правила не поддерживается. Создайте правило заново.' }],
    }
  }
  const draft = { version: 1 as const, root: parseNode(input.root, issues) }
  const semanticIssues = collectRuleDraftIssues(draft, context)
  const seen = new Set(issues.map((issue) => `${issue.code}:${issue.nodeId ?? ''}`))
  return { draft, issues: [...issues, ...semanticIssues.filter((issue) => !seen.has(`${issue.code}:${issue.nodeId ?? ''}`))] }
}

function serializeNode(node: RuleDraftNode, path: string, index: Record<string, RulePathEntry>, issues: DraftIssue[]): ScenarioRuleDtoRoot | undefined {
  index[path] = { nodeId: node.nodeId, nodePath: path }
  if (node.kind === 'empty') {
    issues.push({ code: 'empty-node', nodeId: node.nodeId, message: 'Выберите условие или удалите пустую строку.' })
    return undefined
  }
  if (node.kind === 'incomplete') {
    issues.push({ code: 'incomplete-node', nodeId: node.nodeId, message: 'Заполните все обязательные поля условия.' })
    return undefined
  }
  if (node.kind === 'opaque') {
    issues.push({ code: 'unsupported-node', nodeId: node.nodeId, message: 'Неподдерживаемое условие нельзя опубликовать. Удалите или замените его.' })
    return undefined
  }
  if (node.kind === 'all' || node.kind === 'any') {
    const children = node.children.map((child, childIndex) => serializeNode(child, `${path}.children.${childIndex}`, index, issues))
    if (children.some((child) => !child)) return undefined
    return { kind: node.kind, children } as AllRuleNodeDto | AnyRuleNodeDto
  }
  if (node.kind === 'not') {
    const child = serializeNode(node.child, `${path}.child`, index, issues)
    return child ? { kind: 'not', child } as NotRuleNodeDto : undefined
  }
  if (node.kind === 'eventField') {
    return {
      kind: 'eventField',
      eventCode: node.eventCode,
      fieldKey: node.fieldKey,
      operator: node.operator,
      ...(node.value !== undefined ? { value: clone(node.value) } : {}),
    }
  }
  if (node.kind === 'activityDayStreak') {
    return { kind: 'activityDayStreak', compare: clone(node.compare) }
  }
  return {
    kind: 'eventAggregate',
    eventCode: node.eventCode,
    measure: node.measure,
    ...(node.fieldKey ? { fieldKey: node.fieldKey } : {}),
    filters: node.filters.map((filter) => ({
      fieldKey: filter.fieldKey,
      operator: filter.operator,
      ...(filter.value !== undefined ? { value: clone(filter.value) } : {}),
    })),
    window: clone(node.window),
    compare: clone(node.compare),
  }
}

export function serializeRuleDraft(draft: import('./rule-types').RuleDraft, context: RuleDomainContext): RuleSerializationResult {
  const issues = collectRuleDraftIssues(draft, context)
  if (issues.length) return { ok: false, issues }
  const pathIndex: Record<string, RulePathEntry> = {}
  const root = serializeNode(draft.root, 'root', pathIndex, issues)
  if (!root || issues.length) return { ok: false, issues }
  return { ok: true, value: { version: 1, root }, pathIndex }
}
