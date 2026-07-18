import { uid } from '@/shared/lib/format'

import { RULE_LIMITS } from './rule-contract'
import type {
  NewRuleNode,
  RuleCommand,
  RuleCommandError,
  RuleCommandResult,
  RuleDomainContext,
  RuleDraft,
  RuleDraftNode,
  RuleLeafInput,
} from './rule-types'
import { cloneRuleValue } from './rule-value'

type ParentLocation =
  | { kind: 'root' }
  | { kind: 'group'; parent: Extract<RuleDraftNode, { kind: 'all' | 'any' }>; index: number }
  | { kind: 'not'; parent: Extract<RuleDraftNode, { kind: 'not' }> }

interface NodeLocation {
  node: RuleDraftNode
  parent: ParentLocation
}

function cloneValue<T>(value: T): T {
  return cloneRuleValue(value)
}

function cloneNode(node: RuleDraftNode): RuleDraftNode {
  if (node.kind === 'all' || node.kind === 'any') return { ...node, children: node.children.map(cloneNode) }
  if (node.kind === 'not') return { ...node, child: cloneNode(node.child) }
  if (node.kind === 'opaque') return { ...node, source: cloneValue(node.source) }
  if (node.kind === 'incomplete') return { ...node, leaf: cloneValue(node.leaf) }
  if (node.kind === 'eventAggregate') {
    return {
      ...node,
      filters: node.filters.map((filter) => ({ ...filter, ...(filter.value !== undefined ? { value: cloneValue(filter.value) } : {}) })),
      window: { ...node.window },
      compare: { ...node.compare },
    }
  }
  if (node.kind === 'eventField') return { ...node, ...(node.value !== undefined ? { value: cloneValue(node.value) } : {}) }
  if (node.kind === 'activityDayStreak') return { ...node, compare: { ...node.compare } }
  return { ...node }
}

function cloneDraft(draft: RuleDraft): RuleDraft {
  return { version: 1, root: cloneNode(draft.root) }
}

function findNode(root: RuleDraftNode, nodeId: string): NodeLocation | undefined {
  if (root.nodeId === nodeId) return { node: root, parent: { kind: 'root' } }
  const visit = (node: RuleDraftNode): NodeLocation | undefined => {
    if (node.kind === 'all' || node.kind === 'any') {
      for (const [index, child] of node.children.entries()) {
        if (child.nodeId === nodeId) return { node: child, parent: { kind: 'group', parent: node, index } }
        const nested = visit(child)
        if (nested) return nested
      }
    }
    if (node.kind === 'not') {
      if (node.child.nodeId === nodeId) return { node: node.child, parent: { kind: 'not', parent: node } }
      return visit(node.child)
    }
    return undefined
  }
  return visit(root)
}

function containsNode(node: RuleDraftNode, nodeId: string): boolean {
  if (node.nodeId === nodeId) return true
  if (node.kind === 'all' || node.kind === 'any') return node.children.some((child) => containsNode(child, nodeId))
  if (node.kind === 'not') return containsNode(node.child, nodeId)
  return false
}

function normalizeLeaf(input: RuleLeafInput, context: RuleDomainContext, nodeId = uid('rule_node')): RuleDraftNode {
  if (input.kind === 'eventField') {
    return {
      ...cloneValue(input),
      nodeId,
      eventCode: context.triggerEventCode,
    }
  }
  if (input.kind === 'eventAggregate') {
    return {
      ...cloneValue(input),
      nodeId,
      filters: input.filters.map((filter) => ({ ...cloneValue(filter), filterId: filter.filterId ?? uid('rule_filter') })),
    }
  }
  return { ...cloneValue(input), nodeId }
}

function createNode(input: NewRuleNode, context: RuleDomainContext): RuleDraftNode {
  if (input.kind === 'empty') return { nodeId: uid('rule_node'), kind: 'empty' }
  if (input.kind === 'all' || input.kind === 'any') return { nodeId: uid('rule_node'), kind: input.kind, children: [] }
  if (input.kind === 'incomplete') return { nodeId: uid('rule_node'), kind: 'incomplete', leaf: cloneValue(input.leaf) }
  return normalizeLeaf(input, context)
}

function replaceAt(draft: RuleDraft, location: NodeLocation, replacement: RuleDraftNode) {
  if (location.parent.kind === 'root') draft.root = replacement
  else if (location.parent.kind === 'group') location.parent.parent.children[location.parent.index] = replacement
  else location.parent.parent.child = replacement
}

function commandFailure(draft: RuleDraft, error: RuleCommandError): RuleCommandResult {
  return { ok: false, draft, error }
}

function missingNode(draft: RuleDraft, nodeId: string): RuleCommandResult {
  return commandFailure(draft, { code: 'node-not-found', nodeId, message: 'Условие больше не найдено. Обновите редактор и повторите действие.' })
}

export function validateRuleLimits(root: RuleDraftNode): RuleCommandError | undefined {
  let nodes = 0
  let leaves = 0
  let aggregateLeaves = 0
  let totalWindowMs = 0
  let firstError: RuleCommandError | undefined

  const visit = (node: RuleDraftNode, depth: number) => {
    if (firstError) return
    nodes += 1
    if (depth > RULE_LIMITS.maxDepth) {
      firstError = { code: 'depth-limit', nodeId: node.nodeId, limit: RULE_LIMITS.maxDepth, message: `Допустима вложенность не более ${RULE_LIMITS.maxDepth} уровней. Переместите условие выше.` }
      return
    }
    if (node.kind === 'all' || node.kind === 'any') {
      if (node.children.length > RULE_LIMITS.maxGroupChildren) {
        firstError = { code: 'group-children-limit', nodeId: node.nodeId, limit: RULE_LIMITS.maxGroupChildren, message: `В одной группе допустимо не более ${RULE_LIMITS.maxGroupChildren} условий. Создайте дополнительную группу.` }
        return
      }
      node.children.forEach((child) => visit(child, depth + 1))
      return
    }
    if (node.kind === 'not') {
      visit(node.child, depth + 1)
      return
    }
    if (node.kind === 'eventField' || node.kind === 'eventAggregate' || node.kind === 'activityDayStreak' || node.kind === 'incomplete') leaves += 1
    const intendedKind = node.kind === 'incomplete' ? node.leaf.kind : node.kind
    if (intendedKind === 'eventAggregate' || intendedKind === 'activityDayStreak') aggregateLeaves += 1
    if (node.kind === 'eventAggregate') {
      if (node.filters.length > RULE_LIMITS.maxFilters) {
        firstError = { code: 'filter-limit', nodeId: node.nodeId, limit: RULE_LIMITS.maxFilters, message: `Для одного условия истории допустимо не более ${RULE_LIMITS.maxFilters} фильтров.` }
        return
      }
      if (node.window.kind === 'last') {
        if (node.window.durationMs > RULE_LIMITS.maxWindowMs) {
          firstError = { code: 'window-limit', nodeId: node.nodeId, limit: RULE_LIMITS.maxWindowMs, message: 'Период одного условия истории не может превышать 90 дней.' }
          return
        }
        totalWindowMs += node.window.durationMs
      } else {
        totalWindowMs += RULE_LIMITS.maxWindowMs
      }
    }
    if (node.kind === 'activityDayStreak' && node.compare.value > RULE_LIMITS.maxStreakDays) {
      firstError = { code: 'streak-limit', nodeId: node.nodeId, limit: RULE_LIMITS.maxStreakDays, message: `Серия активных дней не может превышать ${RULE_LIMITS.maxStreakDays}.` }
    }
  }
  visit(root, 0)
  if (firstError) return firstError
  if (nodes > RULE_LIMITS.maxNodes) return { code: 'node-limit', limit: RULE_LIMITS.maxNodes, message: `В правиле допустимо не более ${RULE_LIMITS.maxNodes} узлов.` }
  if (leaves > RULE_LIMITS.maxLeaves) return { code: 'leaf-limit', limit: RULE_LIMITS.maxLeaves, message: `В правиле допустимо не более ${RULE_LIMITS.maxLeaves} условий.` }
  if (aggregateLeaves > RULE_LIMITS.maxAggregateLeaves) return { code: 'aggregate-limit', limit: RULE_LIMITS.maxAggregateLeaves, message: `В правиле допустимо не более ${RULE_LIMITS.maxAggregateLeaves} условий истории и активных дней.` }
  if (totalWindowMs > RULE_LIMITS.maxTotalWindowMs) return { code: 'window-budget-limit', limit: RULE_LIMITS.maxTotalWindowMs, message: 'Суммарный период условий истории не может превышать 365 дней.' }
  return undefined
}

export function applyRuleCommand(draft: RuleDraft, command: RuleCommand, context: RuleDomainContext): RuleCommandResult {
  const next = cloneDraft(draft)

  if (command.type === 'add') {
    const parent = findNode(next.root, command.parentNodeId)
    if (!parent) return missingNode(draft, command.parentNodeId)
    if (parent.node.kind !== 'all' && parent.node.kind !== 'any') {
      return commandFailure(draft, { code: 'parent-not-group', nodeId: command.parentNodeId, message: 'Добавлять условия можно только внутрь группы.' })
    }
    const index = command.index ?? parent.node.children.length
    if (!Number.isInteger(index) || index < 0 || index > parent.node.children.length) {
      return commandFailure(draft, { code: 'invalid-position', nodeId: command.parentNodeId, message: 'Не удалось определить место нового условия. Повторите действие.' })
    }
    const node = createNode(command.node, context)
    parent.node.children.splice(index, 0, node)
    const limitError = validateRuleLimits(next.root)
    return limitError ? commandFailure(draft, limitError) : { ok: true, draft: next, focusNodeId: node.nodeId }
  }

  const location = findNode(next.root, command.nodeId)
  if (!location) return missingNode(draft, command.nodeId)

  if (command.type === 'remove') {
    if (location.parent.kind === 'root') return commandFailure(draft, { code: 'root-required', nodeId: command.nodeId, message: 'Корневую группу нельзя удалить.' })
    if (location.parent.kind === 'not') return commandFailure(draft, { code: 'not-child-required', nodeId: command.nodeId, message: 'Сначала уберите отрицание, затем удалите условие.' })
    location.parent.parent.children.splice(location.parent.index, 1)
    return { ok: true, draft: next, focusNodeId: location.parent.parent.nodeId }
  }

  if (command.type === 'move') {
    if (location.parent.kind === 'root') return commandFailure(draft, { code: 'root-required', nodeId: command.nodeId, message: 'Корневую группу нельзя перемещать.' })
    if (location.parent.kind === 'not') return commandFailure(draft, { code: 'not-child-move', nodeId: command.nodeId, message: 'Перемещайте условие вместе с его отрицанием.' })
    if (containsNode(location.node, command.toParentNodeId)) {
      return commandFailure(draft, { code: 'move-cycle', nodeId: command.nodeId, message: 'Нельзя переместить группу в её собственную вложенную группу.' })
    }
    const target = findNode(next.root, command.toParentNodeId)
    if (!target) return missingNode(draft, command.toParentNodeId)
    if (target.node.kind !== 'all' && target.node.kind !== 'any') {
      return commandFailure(draft, { code: 'parent-not-group', nodeId: command.toParentNodeId, message: 'Переместить условие можно только внутрь группы.' })
    }
    if (!Number.isInteger(command.toIndex) || command.toIndex < 0 || command.toIndex > target.node.children.length) {
      return commandFailure(draft, { code: 'invalid-position', nodeId: command.toParentNodeId, message: 'Не удалось определить новое место условия.' })
    }
    const [moving] = location.parent.parent.children.splice(location.parent.index, 1)
    if (!moving) return missingNode(draft, command.nodeId)
    target.node.children.splice(command.toIndex, 0, moving)
    const limitError = validateRuleLimits(next.root)
    return limitError ? commandFailure(draft, limitError) : { ok: true, draft: next, focusNodeId: moving.nodeId }
  }

  if (command.type === 'wrap') {
    const wrapper: RuleDraftNode = command.wrapper === 'not'
      ? { nodeId: uid('rule_node'), kind: 'not', child: location.node }
      : { nodeId: uid('rule_node'), kind: command.wrapper, children: [location.node] }
    replaceAt(next, location, wrapper)
    const limitError = validateRuleLimits(next.root)
    return limitError ? commandFailure(draft, limitError) : { ok: true, draft: next, focusNodeId: wrapper.nodeId }
  }

  if (command.type === 'unwrap') {
    if (location.node.kind === 'not') {
      replaceAt(next, location, location.node.child)
      return { ok: true, draft: next, focusNodeId: location.node.child.nodeId }
    }
    if (location.parent.kind === 'root') return commandFailure(draft, { code: 'root-required', nodeId: command.nodeId, message: 'Корневую группу нельзя убрать.' })
    if (location.node.kind === 'all' || location.node.kind === 'any') {
      if (location.parent.kind !== 'group') return commandFailure(draft, { code: 'unwrap-parent', nodeId: command.nodeId, message: 'Эту группу нельзя развернуть в текущем месте.' })
      location.parent.parent.children.splice(location.parent.index, 1, ...location.node.children)
      const limitError = validateRuleLimits(next.root)
      if (limitError) return commandFailure(draft, limitError)
      return { ok: true, draft: next, focusNodeId: location.node.children[0]?.nodeId ?? location.parent.parent.nodeId }
    }
    return commandFailure(draft, { code: 'not-container', nodeId: command.nodeId, message: 'Убирать оболочку можно только у группы или отрицания.' })
  }

  if (command.type === 'changeGroup') {
    if (location.node.kind !== 'all' && location.node.kind !== 'any') {
      return commandFailure(draft, { code: 'not-group', nodeId: command.nodeId, message: 'Режим «Все / Хотя бы одно» доступен только группе.' })
    }
    location.node.kind = command.kind
    return { ok: true, draft: next, focusNodeId: location.node.nodeId }
  }

  if (location.node.kind === 'all' || location.node.kind === 'any' || location.node.kind === 'not') {
    return commandFailure(draft, { code: 'not-leaf', nodeId: command.nodeId, message: 'Группу нельзя заменить настройками отдельного условия.' })
  }
  const replacement = command.leaf.kind === 'empty'
    ? { nodeId: command.nodeId, kind: 'empty' as const }
    : command.leaf.kind === 'incomplete'
      ? { nodeId: command.nodeId, kind: 'incomplete' as const, leaf: cloneValue(command.leaf.leaf) }
      : normalizeLeaf(command.leaf, context, command.nodeId)
  replaceAt(next, location, replacement)
  const limitError = validateRuleLimits(next.root)
  return limitError ? commandFailure(draft, limitError) : { ok: true, draft: next, focusNodeId: replacement.nodeId }
}
