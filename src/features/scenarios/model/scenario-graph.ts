import type { ScenarioAction, ScenarioCondition } from '@/shared/types/domain'

export const NODE_KEY_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/

export interface ChoiceOption {
  id: string
  label: string
  nextNodeKey: string
}

export interface ReminderAction {
  type: string
  config: Record<string, unknown>
}

export interface ChoiceReminder {
  afterMs: number
  actions: ReminderAction[]
}

export interface ConditionBranch {
  conditions: ScenarioCondition[]
  nextNodeKey: string
}

export interface GraphTransition {
  source: string
  target: string
  label?: string
  kind: 'default' | 'choice' | 'timeout' | 'condition' | 'fallback'
}

export interface GraphValidationIssue {
  nodeKey?: string
  message: string
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

export function toPlainScenarioAction(action: ScenarioAction): ScenarioAction {
  return JSON.parse(JSON.stringify(action)) as ScenarioAction
}

export function normalizeScenarioActions(actions: ScenarioAction[]): ScenarioAction[] {
  const ordered = [...actions].sort((left, right) => left.position - right.position)
  const legacy = ordered.every((action) => !action.nodeKey)
  return ordered.map((action, position) => ({
    ...action,
    position,
    nodeKey: action.nodeKey || `step_${position}`,
    nextNodeKey: legacy
      ? ordered[position + 1]?.nodeKey || (position + 1 < ordered.length ? `step_${position + 1}` : null)
      : action.nextNodeKey ?? null,
    config: structuredClone(action.config),
  }))
}

export function createScenarioNode(type: string, position: number, usedKeys: Iterable<string>): ScenarioAction {
  const used = new Set(usedKeys)
  const base = type === 'ASK_CHOICE' ? 'question' : type === 'CONDITION' ? 'condition' : 'step'
  let suffix = position + 1
  while (used.has(`${base}_${suffix}`)) suffix += 1
  const config: Record<string, unknown> = type === 'ASK_CHOICE'
    ? { message: '', options: [], timeoutMs: 30_000, onTimeout: '', reminders: [] }
    : type === 'CONDITION'
      ? { branches: [], fallbackNodeKey: '' }
      : {}
  return { position, nodeKey: `${base}_${suffix}`, nextNodeKey: null, type, config }
}

export function choiceOptions(action: ScenarioAction): ChoiceOption[] {
  const options = record(action.config).options
  if (!Array.isArray(options)) return []
  return options.map((option) => record(option)).map((option) => ({
    id: typeof option.id === 'string' ? option.id : '',
    label: typeof option.label === 'string' ? option.label : '',
    nextNodeKey: typeof option.nextNodeKey === 'string' ? option.nextNodeKey : '',
  }))
}

export function choiceReminders(action: ScenarioAction): ChoiceReminder[] {
  const reminders = record(action.config).reminders
  if (!Array.isArray(reminders)) return []
  return reminders.map((reminder) => record(reminder)).map((reminder) => ({
    afterMs: typeof reminder.afterMs === 'number' ? reminder.afterMs : 10_000,
    actions: Array.isArray(reminder.actions) ? reminder.actions.map((item) => record(item)).map((item) => ({
      type: typeof item.type === 'string' ? item.type : '',
      config: record(item.config),
    })) : [],
  }))
}

export function conditionBranches(action: ScenarioAction): ConditionBranch[] {
  const branches = record(action.config).branches
  if (!Array.isArray(branches)) return []
  return branches.map((branch) => record(branch)).map((branch) => ({
    conditions: Array.isArray(branch.conditions) ? branch.conditions as ScenarioCondition[] : [],
    nextNodeKey: typeof branch.nextNodeKey === 'string' ? branch.nextNodeKey : '',
  }))
}

export function graphTransitions(actions: ScenarioAction[]): GraphTransition[] {
  const transitions: GraphTransition[] = []
  actions.forEach((action) => {
    const source = action.nodeKey ?? ''
    if (action.type === 'ASK_CHOICE') {
      const options = choiceOptions(action).filter((option) => option.nextNodeKey).map((option) => ({
        source, target: option.nextNodeKey, label: option.label || option.id, kind: 'choice' as const,
      }))
      const timeout = record(action.config).onTimeout
      transitions.push(...(typeof timeout === 'string' && timeout
        ? [...options, { source, target: timeout, label: 'Timeout', kind: 'timeout' as const }]
        : options))
      return
    }
    if (action.type === 'CONDITION') {
      const branches = conditionBranches(action).filter((branch) => branch.nextNodeKey).map((branch, index) => ({
        source, target: branch.nextNodeKey, label: `Условие ${index + 1}`, kind: 'condition' as const,
      }))
      const fallback = record(action.config).fallbackNodeKey
      transitions.push(...(typeof fallback === 'string' && fallback
        ? [...branches, { source, target: fallback, label: 'Иначе', kind: 'fallback' as const }]
        : branches))
      return
    }
    if (action.nextNodeKey) transitions.push({ source, target: action.nextNodeKey, kind: 'default' })
  })
  return transitions
}

export function availableTargets(actions: ScenarioAction[], action: ScenarioAction) {
  const source = action.nodeKey ?? ''
  const outgoing = new Map<string, string[]>()
  for (const transition of graphTransitions(actions)) {
    outgoing.set(transition.source, [...(outgoing.get(transition.source) ?? []), transition.target])
  }
  const reachesSource = (start: string) => {
    const visited = new Set<string>()
    const visit = (key: string): boolean => {
      if (key === source) return true
      if (visited.has(key)) return false
      visited.add(key)
      return (outgoing.get(key) ?? []).some(visit)
    }
    return visit(start)
  }
  return actions
    .filter((candidate) => candidate.nodeKey !== source && !reachesSource(candidate.nodeKey ?? ''))
    .map((candidate) => ({ label: candidate.nodeKey ?? `Шаг ${candidate.position + 1}`, value: candidate.nodeKey ?? '' }))
}

export function sortScenarioActions(actions: ScenarioAction[]): ScenarioAction[] {
  const ordered = [...actions].sort((left, right) => left.position - right.position)
  const byKey = new Map(ordered.map((action) => [action.nodeKey ?? '', action]))
  if (byKey.size !== ordered.length || byKey.has('')) return ordered.map((action, position) => ({ ...action, position }))

  const outgoing = new Map(ordered.map((action) => [action.nodeKey!, new Set<string>()]))
  const indegree = new Map(ordered.map((action) => [action.nodeKey!, 0]))
  for (const transition of graphTransitions(ordered)) {
    if (!byKey.has(transition.target) || outgoing.get(transition.source)?.has(transition.target)) continue
    outgoing.get(transition.source)?.add(transition.target)
    indegree.set(transition.target, (indegree.get(transition.target) ?? 0) + 1)
  }

  const rank = new Map(ordered.map((action, index) => [action.nodeKey!, index]))
  const ready = ordered.filter((action) => indegree.get(action.nodeKey!) === 0)
  const result: ScenarioAction[] = []
  while (ready.length) {
    ready.sort((left, right) => rank.get(left.nodeKey!)! - rank.get(right.nodeKey!)!)
    const action = ready.shift()!
    result.push(action)
    for (const target of outgoing.get(action.nodeKey!) ?? []) {
      indegree.set(target, indegree.get(target)! - 1)
      if (indegree.get(target) === 0) ready.push(byKey.get(target)!)
    }
  }
  const validOrder = result.length === ordered.length ? result : ordered
  return validOrder.map((action, position) => ({ ...action, position }))
}

export function validateScenarioGraph(actions: ScenarioAction[]): GraphValidationIssue[] {
  if (!actions.length) return [{ message: 'Добавьте хотя бы один узел' }]
  const issues: GraphValidationIssue[] = []
  const ordered = [...actions].sort((left, right) => left.position - right.position)
  const positions = new Map(ordered.map((action) => [action.nodeKey ?? '', action.position]))
  const keys = ordered.map((action) => action.nodeKey ?? '')

  ordered.forEach((action, index) => {
    const key = action.nodeKey ?? ''
    if (action.position !== index) issues.push({ nodeKey: key, message: 'Позиции узлов должны идти непрерывно от 0' })
    if (!NODE_KEY_PATTERN.test(key)) issues.push({ nodeKey: key, message: 'Ключ: латиница в нижнем регистре, цифры, _ или -, начиная с буквы' })
    if (keys.indexOf(key) !== index) issues.push({ nodeKey: key, message: `Ключ «${key}» повторяется` })
    if (action.type === 'ASK_CHOICE') {
      const options = choiceOptions(action)
      if (!options.length) issues.push({ nodeKey: key, message: 'Добавьте вариант ответа' })
      const optionIds = options.map((option) => option.id)
      if (new Set(optionIds).size !== optionIds.length) issues.push({ nodeKey: key, message: 'ID вариантов ответа должны быть уникальны' })
      if (options.some((option) => !NODE_KEY_PATTERN.test(option.id))) issues.push({ nodeKey: key, message: 'ID варианта должен соответствовать формату ключа узла' })
      const config = record(action.config)
      if (typeof config.message !== 'string' || !config.message.trim()) issues.push({ nodeKey: key, message: 'Заполните текст вопроса' })
      if (typeof config.timeoutMs !== 'number' || config.timeoutMs < 1_000) issues.push({ nodeKey: key, message: 'Timeout должен быть не меньше 1000 мс' })
      if (typeof config.onTimeout !== 'string' || !config.onTimeout) issues.push({ nodeKey: key, message: 'Выберите переход по timeout' })
    }
    if (action.type === 'CONDITION') {
      const branches = conditionBranches(action)
      if (!branches.length) issues.push({ nodeKey: key, message: 'Добавьте минимум одну ветку условия' })
      if (branches.some((branch) => !branch.conditions.length)) issues.push({ nodeKey: key, message: 'Каждая ветка должна содержать условие' })
      if (!record(action.config).fallbackNodeKey) issues.push({ nodeKey: key, message: 'Выберите fallback-переход' })
    }
  })

  const transitions = graphTransitions(ordered)
  for (const transition of transitions) {
    if (!positions.has(transition.target)) {
      issues.push({ nodeKey: transition.source, message: `Переход ведёт в неизвестный узел «${transition.target}»` })
    } else if (positions.get(transition.target)! <= positions.get(transition.source)!) {
      issues.push({ nodeKey: transition.source, message: `Переход в «${transition.target}» должен вести только вперёд` })
    }
  }

  const reachable = new Set<string>()
  const outgoing = new Map<string, string[]>()
  for (const transition of transitions) outgoing.set(transition.source, [...(outgoing.get(transition.source) ?? []), transition.target])
  const visit = (key: string) => {
    if (reachable.has(key)) return
    reachable.add(key)
    for (const target of outgoing.get(key) ?? []) visit(target)
  }
  visit(keys[0])
  for (const key of keys) if (!reachable.has(key)) issues.push({ nodeKey: key, message: `Узел «${key}» недостижим из первого шага` })
  return issues
}

export function normalizePositions(actions: ScenarioAction[]) {
  actions.forEach((action, position) => { action.position = position })
}
