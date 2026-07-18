import type { AudienceIssueResponseDto, AudienceRuleDtoRoot } from '@/shared/api/repository/scenario-authoring'
import { uid } from '@/shared/lib/format'

import type {
  AudienceCommand,
  AudienceCommandResult,
  AudienceComparisonOperator,
  AudienceDeserializeResult,
  AudienceDomainContext,
  AudienceDraft,
  AudienceDraftIssue,
  AudienceDraftNode,
  AudienceLeafDraftNode,
  AudienceLeafInput,
  AudienceLiteral,
  AudiencePathEntry,
  AudiencePathIndex,
  AudienceSerializationResult,
  AudienceSummary,
  MappedAudienceIssue,
} from './audience-types'

export const AUDIENCE_LIMITS = {
  maxDepth: 4,
  maxNodes: 100,
  maxLeaves: 50,
  maxGroupChildren: 20,
  maxLiteralArrayItems: 100,
  maxLiteralStringLength: 256,
} as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function clone<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T
}

function cloneNode(node: AudienceDraftNode): AudienceDraftNode {
  if (node.kind === 'all' || node.kind === 'any') return { ...node, children: node.children.map(cloneNode) }
  if (node.kind === 'not') return { ...node, child: cloneNode(node.child) }
  if (node.kind === 'opaque') return { ...node, source: clone(node.source) }
  return clone(node)
}

function cloneDraft(draft: AudienceDraft): AudienceDraft {
  return { version: 1, root: cloneNode(draft.root) }
}

export function createAudienceDraft(): AudienceDraft {
  return { version: 1, root: { nodeId: uid('audience_node'), kind: 'all', children: [] } }
}

function createLeaf(leaf: AudienceLeafInput, nodeId = uid('audience_node')): AudienceLeafDraftNode {
  return { ...clone(leaf), nodeId } as AudienceLeafDraftNode
}

interface NodeLocation {
  node: AudienceDraftNode
  parent?: Extract<AudienceDraftNode, { kind: 'all' | 'any' | 'not' }>
  index?: number
}

function findNode(root: AudienceDraftNode, nodeId: string): NodeLocation | undefined {
  if (root.nodeId === nodeId) return { node: root }
  if (root.kind === 'all' || root.kind === 'any') {
    for (const [index, child] of root.children.entries()) {
      if (child.nodeId === nodeId) return { node: child, parent: root, index }
      const nested = findNode(child, nodeId)
      if (nested) return nested
    }
  }
  if (root.kind === 'not') {
    if (root.child.nodeId === nodeId) return { node: root.child, parent: root }
    return findNode(root.child, nodeId)
  }
  return undefined
}

function replaceNode(draft: AudienceDraft, location: NodeLocation, replacement: AudienceDraftNode) {
  if (!location.parent) draft.root = replacement
  else if (location.parent.kind === 'not') location.parent.child = replacement
  else if (location.index !== undefined) location.parent.children[location.index] = replacement
}

function validateLimits(root: AudienceDraftNode): AudienceDraftIssue | undefined {
  let nodes = 0
  let leaves = 0
  let issue: AudienceDraftIssue | undefined
  const visit = (node: AudienceDraftNode, depth: number) => {
    if (issue) return
    nodes += 1
    if (depth > AUDIENCE_LIMITS.maxDepth) issue = { code: 'depth-limit', nodeId: node.nodeId, message: `Допустима вложенность не более ${AUDIENCE_LIMITS.maxDepth} уровней.` }
    else if (node.kind === 'all' || node.kind === 'any') {
      if (node.children.length > AUDIENCE_LIMITS.maxGroupChildren) issue = { code: 'group-limit', nodeId: node.nodeId, message: `В группе допустимо не более ${AUDIENCE_LIMITS.maxGroupChildren} условий.` }
      else node.children.forEach((child) => visit(child, depth + 1))
    } else if (node.kind === 'not') visit(node.child, depth + 1)
    else leaves += 1
  }
  visit(root, 0)
  if (issue) return issue
  if (nodes > AUDIENCE_LIMITS.maxNodes) return { code: 'node-limit', message: `В аудитории допустимо не более ${AUDIENCE_LIMITS.maxNodes} узлов.` }
  if (leaves > AUDIENCE_LIMITS.maxLeaves) return { code: 'leaf-limit', message: `В аудитории допустимо не более ${AUDIENCE_LIMITS.maxLeaves} условий.` }
  return undefined
}

export function applyAudienceCommand(draft: AudienceDraft, command: AudienceCommand, context: AudienceDomainContext): AudienceCommandResult {
  const next = cloneDraft(draft)
  const location = findNode(next.root, 'parentNodeId' in command ? command.parentNodeId : command.nodeId)
  if (!location) return { ok: false, draft, error: { code: 'node-not-found', message: 'Условие больше не найдено. Обновите редактор.', nodeId: 'nodeId' in command ? command.nodeId : command.parentNodeId } }

  let focusNodeId = location.node.nodeId
  if (command.type === 'add' || command.type === 'addGroup') {
    if (location.node.kind !== 'all' && location.node.kind !== 'any') return { ok: false, draft, error: { code: 'parent-not-group', nodeId: location.node.nodeId, message: 'Добавить условие можно только в группу.' } }
    const node: AudienceDraftNode = command.type === 'add'
      ? createLeaf(command.leaf)
      : { nodeId: uid('audience_node'), kind: command.kind ?? 'all', children: [] }
    location.node.children.push(node)
    focusNodeId = node.nodeId
  } else if (command.type === 'replaceLeaf') {
    if (location.node.kind === 'all' || location.node.kind === 'any' || location.node.kind === 'not') return { ok: false, draft, error: { code: 'not-leaf', nodeId: location.node.nodeId, message: 'Группу нельзя заменить отдельным условием.' } }
    const node = createLeaf(command.leaf, location.node.nodeId)
    replaceNode(next, location, node)
  } else if (command.type === 'remove') {
    if (!location.parent) return { ok: false, draft, error: { code: 'root-required', nodeId: command.nodeId, message: 'Корневую группу нельзя удалить.' } }
    if (location.parent.kind === 'not') return { ok: false, draft, error: { code: 'remove-not-child', nodeId: command.nodeId, message: 'Сначала уберите отрицание.' } }
    location.parent.children.splice(location.index ?? -1, 1)
    focusNodeId = location.parent.nodeId
  } else if (command.type === 'wrapNot') {
    const wrapper: AudienceDraftNode = { nodeId: uid('audience_node'), kind: 'not', child: location.node }
    replaceNode(next, location, wrapper)
    focusNodeId = wrapper.nodeId
  } else if (command.type === 'unwrapNot') {
    if (location.node.kind !== 'not') return { ok: false, draft, error: { code: 'not-wrapper', nodeId: command.nodeId, message: 'У выбранного условия нет отрицания.' } }
    replaceNode(next, location, location.node.child)
    focusNodeId = location.node.child.nodeId
  } else if (command.type === 'changeGroup') {
    if (location.node.kind !== 'all' && location.node.kind !== 'any') return { ok: false, draft, error: { code: 'not-group', nodeId: command.nodeId, message: 'Режим доступен только для группы.' } }
    location.node.kind = command.kind
  } else if (command.type === 'move') {
    if (!location.parent || location.parent.kind === 'not' || location.index === undefined) return { ok: false, draft, error: { code: 'move-root', nodeId: command.nodeId, message: 'Это условие нельзя переместить.' } }
    const nextIndex = command.direction === 'up' ? location.index - 1 : location.index + 1
    if (nextIndex < 0 || nextIndex >= location.parent.children.length) return { ok: false, draft, error: { code: 'move-boundary', nodeId: command.nodeId, message: 'Условие уже находится у края группы.' } }
    const [node] = location.parent.children.splice(location.index, 1)
    if (node) location.parent.children.splice(nextIndex, 0, node)
  }

  const limitIssue = validateLimits(next.root)
  if (limitIssue) return { ok: false, draft, error: limitIssue }
  const semanticIssue = command.type === 'add' || command.type === 'replaceLeaf'
    ? validateLeaf(findNode(next.root, focusNodeId)?.node, context)
    : undefined
  if (semanticIssue) return { ok: false, draft, error: semanticIssue }
  return { ok: true, draft: next, focusNodeId }
}

function opaqueNode(source: unknown): AudienceDraftNode {
  return { nodeId: uid('audience_node'), kind: 'opaque', source: clone(source), ...(isRecord(source) && typeof source.kind === 'string' ? { reportedKind: source.kind } : {}) }
}

function parseNode(source: unknown, issues: AudienceDraftIssue[]): AudienceDraftNode {
  if (!isRecord(source) || typeof source.kind !== 'string') {
    const node = opaqueNode(source)
    issues.push({ code: 'unsupported-node', nodeId: node.nodeId, message: 'Формат условия аудитории пока не поддерживается.' })
    return node
  }
  if ((source.kind === 'all' || source.kind === 'any') && Array.isArray(source.children)) return { nodeId: uid('audience_node'), kind: source.kind, children: source.children.map((child) => parseNode(child, issues)) }
  if (source.kind === 'not' && Object.hasOwn(source, 'child')) return { nodeId: uid('audience_node'), kind: 'not', child: parseNode(source.child, issues) }
  if ((source.kind === 'locale' || source.kind === 'language' || source.kind === 'country') && typeof source.operator === 'string') {
    const common = { nodeId: uid('audience_node'), operator: source.operator as AudienceComparisonOperator, ...(Object.hasOwn(source, 'value') ? { value: clone(source.value) as string | string[] } : {}) }
    if (source.kind === 'locale') return { ...common, kind: 'locale' }
    if (source.kind === 'language') return { ...common, kind: 'language' }
    return { ...common, kind: 'country' }
  }
  if (source.kind === 'userAttribute' && typeof source.definitionId === 'string' && typeof source.operator === 'string') return { nodeId: uid('audience_node'), kind: 'userAttribute', definitionId: source.definitionId, operator: source.operator as AudienceComparisonOperator, ...(Object.hasOwn(source, 'value') ? { value: clone(source.value) as AudienceLiteral } : {}) }
  if (source.kind === 'segmentMembership' && typeof source.segmentId === 'string' && typeof source.segmentRevisionId === 'string' && (source.operator === 'is_member' || source.operator === 'is_not_member')) return { nodeId: uid('audience_node'), kind: 'segmentMembership', segmentId: source.segmentId, segmentRevisionId: source.segmentRevisionId, operator: source.operator }
  const node = opaqueNode(source)
  issues.push({ code: 'unsupported-node', nodeId: node.nodeId, message: `Условие «${node.kind === 'opaque' ? node.reportedKind ?? 'неизвестное' : 'неизвестное'}» нельзя изменить в этой версии CMS.` })
  return node
}

export function deserializeAudience(input: unknown, context: AudienceDomainContext): AudienceDeserializeResult {
  const issues: AudienceDraftIssue[] = []
  if (!isRecord(input) || input.version !== 1 || !Object.hasOwn(input, 'root')) {
    const root = opaqueNode(input)
    return { draft: { version: 1, root }, issues: [{ code: 'unsupported-rule', nodeId: root.nodeId, message: 'Версия Audience Rule не поддерживается.' }] }
  }
  const draft: AudienceDraft = { version: 1, root: parseNode(input.root, issues) }
  return { draft, issues: [...issues, ...collectAudienceIssues(draft, context).filter((issue) => !issues.some((known) => known.nodeId === issue.nodeId && known.code === issue.code))] }
}

function isPresenceOperator(operator: string): boolean {
  return operator === 'exists' || operator === 'not_exists'
}

function validLiteral(value: unknown): boolean {
  if (typeof value === 'string') return value.length <= AUDIENCE_LIMITS.maxLiteralStringLength
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'boolean') return true
  return Array.isArray(value) && value.length > 0 && value.length <= AUDIENCE_LIMITS.maxLiteralArrayItems && value.every((item) => !Array.isArray(item) && validLiteral(item))
}

function validateLeaf(node: AudienceDraftNode | undefined, context: AudienceDomainContext): AudienceDraftIssue | undefined {
  if (!node || node.kind === 'all' || node.kind === 'any' || node.kind === 'not') return undefined
  if (node.kind === 'opaque') return { code: 'unsupported-node', nodeId: node.nodeId, message: 'Неподдерживаемое условие нужно заменить или удалить.' }
  if (node.kind === 'segmentMembership') {
    if (context.allowSegments === false) return { code: 'segment-nesting-unsupported', nodeId: node.nodeId, message: 'Сегмент нельзя включать в определение другого сегмента.' }
    const segment = context.segments.find((candidate) => candidate.segmentId === node.segmentId && candidate.currentRevision?.segmentRevisionId === node.segmentRevisionId)
    if (!segment || segment.status !== 'ACTIVE') return { code: 'segment-unavailable', nodeId: node.nodeId, fieldPath: 'segmentId', message: 'Выбранная версия сегмента недоступна. Найдите актуальный сегмент.' }
    return undefined
  }
  const operatorSource = node.kind === 'locale'
    ? context.catalog.localeSource
    : node.kind === 'language'
      ? context.catalog.languageSource
      : node.kind === 'country'
        ? context.catalog.country
        : context.catalog.attributes.find((attribute) => attribute.definitionId === node.definitionId)
  if (!operatorSource) return { code: 'attribute-unavailable', nodeId: node.nodeId, fieldPath: 'definitionId', message: 'Атрибут больше не доступен в каталоге проекта.' }
  if (!(operatorSource.operators as readonly string[]).includes(node.operator)) return { code: 'operator-unavailable', nodeId: node.nodeId, fieldPath: 'operator', message: 'Оператор больше не поддерживается выбранным источником.' }
  if (isPresenceOperator(node.operator)) return node.value === undefined ? undefined : { code: 'presence-has-value', nodeId: node.nodeId, fieldPath: 'value', message: 'Для проверки наличия значение не задаётся.' }
  if (node.value === undefined || !validLiteral(node.value)) return { code: 'value-required', nodeId: node.nodeId, fieldPath: 'value', message: 'Укажите допустимое значение.' }
  if (node.operator === 'in' && !Array.isArray(node.value)) return { code: 'in-requires-array', nodeId: node.nodeId, fieldPath: 'value', message: 'Для проверки «одно из» выберите хотя бы одно значение из списка.' }
  if (node.operator !== 'in' && Array.isArray(node.value)) return { code: 'scalar-required', nodeId: node.nodeId, fieldPath: 'value', message: 'Для выбранной проверки укажите одно значение.' }
  if (node.kind === 'locale') {
    const values = Array.isArray(node.value) ? node.value : [node.value]
    if (!values.every((value) => context.catalog.locales.some((locale) => locale.code === value))) return { code: 'locale-unavailable', nodeId: node.nodeId, fieldPath: 'value', message: 'Выберите locale из каталога проекта.' }
  }
  if (node.kind === 'language') {
    const values = Array.isArray(node.value) ? node.value : [node.value]
    if (!values.every((value) => context.catalog.locales.some((locale) => locale.language === value))) return { code: 'language-unavailable', nodeId: node.nodeId, fieldPath: 'value', message: 'Выберите язык из каталога проекта.' }
  }
  if (node.kind === 'country') {
    const values = Array.isArray(node.value) ? node.value : [node.value]
    if (!values.every((value) => /^[A-Z]{2}$/.test(value))) return { code: 'country-invalid', nodeId: node.nodeId, fieldPath: 'value', message: 'Страна задаётся двухбуквенным ISO-кодом, например ES.' }
  }
  if (node.kind === 'userAttribute') {
    const attribute = context.catalog.attributes.find((candidate) => candidate.definitionId === node.definitionId)
    if (!attribute) return { code: 'attribute-unavailable', nodeId: node.nodeId, fieldPath: 'definitionId', message: 'Атрибут больше не доступен в каталоге проекта.' }
    const values = Array.isArray(node.value) ? node.value : [node.value]
    const validType = values.every((value) => attribute.valueType === 'number' ? typeof value === 'number' : attribute.valueType === 'boolean' ? typeof value === 'boolean' : typeof value === 'string')
    if (!validType) return { code: 'attribute-value-type', nodeId: node.nodeId, fieldPath: 'value', message: 'Значение не соответствует типу атрибута.' }
    if (attribute.allowedValues?.length && !values.every((value) => attribute.allowedValues?.includes(value))) return { code: 'attribute-value-unavailable', nodeId: node.nodeId, fieldPath: 'value', message: 'Выберите значение из каталога атрибута.' }
  }
  return undefined
}

function collectAudienceIssues(draft: AudienceDraft, context: AudienceDomainContext): AudienceDraftIssue[] {
  const issues: AudienceDraftIssue[] = []
  const limitIssue = validateLimits(draft.root)
  if (limitIssue) issues.push(limitIssue)
  const visit = (node: AudienceDraftNode) => {
    if (node.kind === 'all' || node.kind === 'any') {
      if (!node.children.length) issues.push({ code: 'empty-group', nodeId: node.nodeId, message: 'Добавьте хотя бы одно условие аудитории.' })
      node.children.forEach(visit)
    } else if (node.kind === 'not') visit(node.child)
    else {
      const issue = validateLeaf(node, context)
      if (issue) issues.push(issue)
    }
  }
  visit(draft.root)
  return issues
}

function serializeNode(node: AudienceDraftNode, path: string, index: Record<string, AudiencePathEntry>): AudienceRuleDtoRoot | undefined {
  index[path] = { nodeId: node.nodeId, nodePath: path }
  if (node.kind === 'opaque') return undefined
  if (node.kind === 'all' || node.kind === 'any') return { kind: node.kind, children: node.children.map((child, childIndex) => serializeNode(child, `${path}.children.${childIndex}`, index)).filter((child): child is AudienceRuleDtoRoot => Boolean(child)) }
  if (node.kind === 'not') {
    const child = serializeNode(node.child, `${path}.child`, index)
    return child ? { kind: 'not', child } : undefined
  }
  const value = clone(node) as unknown as Record<string, unknown>
  delete value.nodeId
  return value as unknown as AudienceRuleDtoRoot
}

export function serializeAudienceDraft(draft: AudienceDraft, context: AudienceDomainContext): AudienceSerializationResult {
  const issues = collectAudienceIssues(draft, context)
  if (issues.length) return { ok: false, issues }
  const pathIndex: Record<string, AudiencePathEntry> = {}
  const root = serializeNode(draft.root, 'root', pathIndex)
  return root ? { ok: true, value: { version: 1, root }, pathIndex } : { ok: false, issues: [{ code: 'unsupported-node', nodeId: draft.root.nodeId, message: 'Неподдерживаемое условие нужно заменить или удалить.' }] }
}

function displayValue(value: AudienceLiteral | undefined): string {
  if (Array.isArray(value)) return value.map(String).join(', ')
  if (value === true) return 'да'
  if (value === false) return 'нет'
  return value === undefined ? 'не задано' : String(value)
}

const operatorLabels: Record<string, string> = { eq: 'равно', neq: 'не равно', gt: 'больше', gte: 'не меньше', lt: 'меньше', lte: 'не больше', in: 'одна из', exists: 'заполнено', not_exists: 'не заполнено' }

function leafSummary(node: AudienceLeafDraftNode, context: AudienceDomainContext): string {
  if (node.kind === 'segmentMembership') {
    const segment = context.segments.find((candidate) => candidate.segmentId === node.segmentId)
    const revision = segment?.currentRevision?.segmentRevisionId === node.segmentRevisionId ? segment.currentRevision.revision : '?'
    return `${node.operator === 'is_member' ? 'входит' : 'не входит'} в сегмент «${segment?.name ?? node.segmentId}» (версия ${revision})`
  }
  const label = node.kind === 'locale' ? 'locale' : node.kind === 'language' ? 'язык' : node.kind === 'country' ? 'страна' : context.catalog.attributes.find((attribute) => attribute.definitionId === node.definitionId)?.label ?? node.definitionId
  if (node.operator === 'exists' || node.operator === 'not_exists') return `${label} — ${operatorLabels[node.operator]}`
  return `${label} — ${operatorLabels[node.operator] ?? node.operator} ${displayValue(node.value)}`
}

export function summarizeAudience(draft: AudienceDraft, context: AudienceDomainContext): AudienceSummary {
  let nodes = 0
  let leaves = 0
  let segmentLeaves = 0
  let sensitiveLeaves = 0
  let hasOpaque = false
  const byNodeId: Record<string, string> = {}
  const render = (node: AudienceDraftNode): string => {
    nodes += 1
    let text: string
    if (node.kind === 'all' || node.kind === 'any') {
      const children = node.children.map(render)
      text = children.length ? `${node.kind === 'all' ? 'Все' : 'Хотя бы одно'}: ${children.join('; ')}` : 'Аудитория не ограничена'
    } else if (node.kind === 'not') text = `НЕ ${render(node.child)}`
    else if (node.kind === 'opaque') {
      hasOpaque = true
      leaves += 1
      text = `неподдерживаемое условие «${node.reportedKind ?? 'неизвестное'}»`
    } else {
      leaves += 1
      if (node.kind === 'segmentMembership') segmentLeaves += 1
      if (node.kind === 'userAttribute' && context.catalog.attributes.find((attribute) => attribute.definitionId === node.definitionId)?.sensitive) sensitiveLeaves += 1
      text = leafSummary(node, context)
    }
    byNodeId[node.nodeId] = text
    return text
  }
  const text = render(draft.root)
  const pristineEmpty = (draft.root.kind === 'all' || draft.root.kind === 'any') && draft.root.children.length === 0
  const invalid = collectAudienceIssues(draft, context).some((issue) => issue.code !== 'empty-group' || !pristineEmpty)
  const status = hasOpaque ? 'unsupported' : invalid ? 'invalid' : pristineEmpty || leaves === 0 ? 'empty' : 'ready'
  return { text, byNodeId, status, nodes, leaves, segmentLeaves, sensitiveLeaves }
}

export function mapAudienceIssues(issues: AudienceIssueResponseDto[], index: AudiencePathIndex): MappedAudienceIssue[] {
  return issues.map((issue) => {
    const normalizedPath = issue.path.startsWith('audience.') ? issue.path.slice('audience.'.length) : issue.path
    const segments = normalizedPath.split('.')
    let entry: AudiencePathEntry | undefined
    let nodePath = normalizedPath
    while (segments.length) {
      const candidate = segments.join('.')
      if (index[candidate]) {
        entry = index[candidate]
        nodePath = candidate
        break
      }
      segments.pop()
    }
    return { ...issue, ...(entry ? { nodeId: entry.nodeId, fieldPath: normalizedPath === nodePath ? undefined : normalizedPath.slice(nodePath.length + 1) } : {}) }
  })
}
