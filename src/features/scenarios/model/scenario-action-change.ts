import type {
  ActionConfigPropertySchema,
  ScenarioAction,
  ScenarioActionCatalogItem,
} from '@/shared/types/domain'
import {
  actionConfigPropertyError,
  requiredActionConfigKeys,
} from '@/shared/lib/scenario-action-catalog'

import {
  graphTransitions,
  scenarioTransitionContract,
  type GraphTransition,
} from './scenario-graph'

export type ScenarioEntryPointChangePlan =
  | {
      status: 'ready'
      actions: ScenarioAction[]
      unreachableNodeKeys: string[]
      removedIncomingTransitions: GraphTransition[]
    }
  | { status: 'blocked'; reason: string }

export interface ScenarioActionTypeReplacementPlan {
  replacement: ScenarioAction
  preservedConfigKeys: string[]
  removedConfigKeys: string[]
  requiredConfigKeys: string[]
  transitionImpact: 'preserved' | 'reset-required' | 'none'
  removedTransitionCount: number
}

function configValueMatchesSchema(
  value: unknown,
  schema: ActionConfigPropertySchema,
  allowLocalized = false,
): boolean {
  return !actionConfigPropertyError(schema, value, allowLocalized)
}

function requiresConfiguration(value: unknown): boolean {
  return value === undefined || value === null || value === ''
}

function cloneScenarioAction(action: ScenarioAction): ScenarioAction {
  return JSON.parse(JSON.stringify(action)) as ScenarioAction
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function planScenarioEntryPointChange(
  actions: readonly ScenarioAction[],
  nodeKey: string,
): ScenarioEntryPointChangePlan {
  const ordered = [...actions]
    .sort((left, right) => left.position - right.position)
    .map(cloneScenarioAction)
  const selected = ordered.find((action) => action.nodeKey === nodeKey)
  if (!selected) return { status: 'blocked', reason: `Действие «${nodeKey}» не найдено.` }
  if (ordered[0]?.nodeKey === nodeKey) {
    return { status: 'blocked', reason: `«${nodeKey}» уже является первым действием.` }
  }

  const incoming = graphTransitions(ordered).filter((transition) => transition.target === nodeKey)
  const requiredBranch = incoming.find((transition) => transition.kind !== 'default')
  if (requiredBranch) {
    const label = requiredBranch.label ? ` «${requiredBranch.label}»` : ''
    return {
      status: 'blocked',
      reason: `На «${nodeKey}» ведёт обязательная ветка${label} из «${requiredBranch.source}». Сначала переназначьте эту ветку.`,
    }
  }

  const removedIncomingTransitions = incoming.map((transition) => ({ ...transition }))
  const incomingSources = new Set(incoming.map((transition) => transition.source))
  for (const action of ordered) {
    if (action.nodeKey && incomingSources.has(action.nodeKey)) action.nextNodeKey = null
  }

  const outgoing = new Map<string, string[]>()
  for (const transition of graphTransitions(ordered)) {
    const targets = outgoing.get(transition.source) ?? []
    targets.push(transition.target)
    outgoing.set(transition.source, targets)
  }
  const reachable = new Set<string>()
  const queue = [nodeKey]
  while (queue.length) {
    const current = queue.shift()!
    if (reachable.has(current)) continue
    reachable.add(current)
    queue.push(...(outgoing.get(current) ?? []))
  }

  const reachableActions = ordered.filter((action) => action.nodeKey && reachable.has(action.nodeKey))
  const unreachableActions = ordered.filter((action) => !action.nodeKey || !reachable.has(action.nodeKey))
  const selectedIndex = reachableActions.findIndex((action) => action.nodeKey === nodeKey)
  const actionsWithSelectedFirst = [
    reachableActions[selectedIndex]!,
    ...reachableActions.filter((_, index) => index !== selectedIndex),
  ].map((action, position) => ({ ...action, position }))

  return {
    status: 'ready',
    actions: actionsWithSelectedFirst,
    unreachableNodeKeys: unreachableActions.flatMap((action) => action.nodeKey ? [action.nodeKey] : []),
    removedIncomingTransitions,
  }
}

export function planScenarioActionTypeReplacement(
  action: ScenarioAction,
  target: ScenarioActionCatalogItem,
  targetDefaultConfig: Record<string, unknown>,
  targetLocalizedKeys = new Set<string>(),
): ScenarioActionTypeReplacementPlan {
  const currentContract = scenarioTransitionContract(action.type)
  const targetContract = scenarioTransitionContract(target.type)
  const compatibleTransitionContract = currentContract === targetContract
  const preservedConfigKeys: string[] = []
  const removedConfigKeys: string[] = []
  const config = cloneValue(targetDefaultConfig)

  for (const [key, value] of Object.entries(action.config)) {
    const property = target.configSchema.properties[key]
    if (property && configValueMatchesSchema(value, property, targetLocalizedKeys.has(key))) {
      config[key] = cloneValue(value)
      preservedConfigKeys.push(key)
    } else {
      removedConfigKeys.push(key)
    }
  }

  const outgoingCount = graphTransitions([action]).length
  const transitionImpact = outgoingCount === 0
    ? 'none'
    : compatibleTransitionContract
      ? 'preserved'
      : 'reset-required'

  return {
    replacement: {
      ...cloneScenarioAction(action),
      type: target.type,
      config,
      nextNodeKey: compatibleTransitionContract && targetContract === 'linear'
        ? action.nextNodeKey ?? null
        : null,
    },
    preservedConfigKeys,
    removedConfigKeys,
    requiredConfigKeys: requiredActionConfigKeys(target, config).filter((key) => {
      const value = config[key]
      const schema = target.configSchema.properties[key] ?? {}
      return requiresConfiguration(value)
        || !configValueMatchesSchema(value, schema, targetLocalizedKeys.has(key))
    }),
    transitionImpact,
    removedTransitionCount: transitionImpact === 'reset-required' ? outgoingCount : 0,
  }
}
