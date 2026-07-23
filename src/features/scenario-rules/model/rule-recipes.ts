import { applyRuleCommand } from './rule-commands'
import type {
  RuleCommandResult,
  RuleDomainContext,
  RuleDraft,
  RuleLeafInput,
} from './rule-types'

export interface RuleQuickStartRecipe {
  id: string
  icon: string
  label: string
  description: string
  nodes?: RuleLeafInput[]
}

const MINUTE_MS = 60_000
const DAY_MS = 86_400_000

function eventText(event: RuleDomainContext['contract']['events'][number]) {
  return `${event.code} ${event.name}`
}

function countEvents(context: RuleDomainContext, operator: 'eq' | 'gte') {
  return context.contract.events.filter((event) =>
    event.aggregateMeasures.some((measure) =>
      measure.measure === 'count' && measure.compareOperators.includes(operator)))
}

function countNode(
  eventCode: string,
  durationMs: number,
  operator: 'eq' | 'gte',
  value: number,
): RuleLeafInput {
  return {
    kind: 'eventAggregate',
    eventCode,
    measure: 'count',
    filters: [],
    window: { kind: 'last', durationMs, boundary: 'beforeTrigger' },
    compare: { operator, value },
  }
}

export function createRuleQuickStartRecipes(context: RuleDomainContext): RuleQuickStartRecipe[] {
  const countedEvents = countEvents(context, 'gte')
  const countedEvent = countedEvents[0]
  const absenceEvents = countEvents(context, 'eq')
  const depositEvents = absenceEvents.filter((event) => /deposit|депозит/i.test(eventText(event)))
  const depositEvent = depositEvents.find((event) => /succeed|success|успеш/i.test(eventText(event)))
    ?? depositEvents.find((event) => !/fail|error|ошиб|отклон/i.test(eventText(event)))
    ?? depositEvents[0]
  const registrationEvent = countedEvents.find((event) => /registr|регистра/i.test(eventText(event)))
  const sumCandidate = context.contract.events.flatMap((event) =>
    event.fields
      .filter((field) => field.capabilities.aggregateMeasure.measures.includes('sum'))
      .map((field) => ({
        event,
        field,
        currencyField: event.fields.find((candidate) =>
          candidate.semanticType === 'currency'
          && candidate.capabilities.aggregateFilter.operators.includes('eq')
          && candidate.allowedValues?.length),
      })))
    .filter(({ field, currencyField }) => !field.semanticType?.startsWith('money') || currencyField)
    .find(({ event }) =>
      event.aggregateMeasures.some((measure) =>
        measure.measure === 'sum' && measure.compareOperators.includes('gte')))
  const filterCandidate = countedEvents.flatMap((event) =>
    event.fields
      .filter((field) =>
        field.capabilities.aggregateFilter.operators.includes('eq')
        && field.allowedValues?.length)
      .map((field) => ({ event, field, value: field.allowedValues![0]! })))[0]

  return [
    {
      id: 'history-7d',
      icon: 'pi pi-history',
      label: 'Событие было за 7 дней',
      description: countedEvent?.name ?? 'Нет подходящего события в каталоге',
      nodes: countedEvent ? [countNode(countedEvent.code, 7 * DAY_MS, 'gte', 1)] : undefined,
    },
    {
      id: 'streak',
      icon: 'pi pi-calendar',
      label: 'Активен 3 дня подряд',
      description: 'Три последовательных активных дня',
      nodes: [{
        kind: 'activityDayStreak',
        compare: { operator: 'gte', value: 3 },
      }],
    },
    {
      id: 'registration-no-deposit-5m',
      icon: 'pi pi-clock',
      label: 'Регистрация без депозита 5 минут',
      description: registrationEvent && depositEvent
        ? `${registrationEvent.name} была, ${depositEvent.name.toLocaleLowerCase('ru-RU')} не было`
        : 'Нужны события регистрации и успешного депозита',
      nodes: registrationEvent && depositEvent ? [
        countNode(registrationEvent.code, 5 * MINUTE_MS, 'gte', 1),
        countNode(depositEvent.code, 5 * MINUTE_MS, 'eq', 0),
      ] : undefined,
    },
    {
      id: 'frequent-24h',
      icon: 'pi pi-bolt',
      label: '3 события за сутки',
      description: countedEvent?.name ?? 'Нет подходящего события в каталоге',
      nodes: countedEvent ? [countNode(countedEvent.code, DAY_MS, 'gte', 3)] : undefined,
    },
    {
      id: 'sum-30d',
      icon: 'pi pi-chart-line',
      label: 'Сумма за 30 дней ≥ 100',
      description: sumCandidate
        ? `${sumCandidate.event.name} · ${sumCandidate.field.label}`
        : 'Нет поля с поддержкой суммы',
      nodes: sumCandidate ? [{
        kind: 'eventAggregate',
        eventCode: sumCandidate.event.code,
        measure: 'sum',
        fieldKey: sumCandidate.field.fieldKey,
        filters: sumCandidate.currencyField ? [{
          fieldKey: sumCandidate.currencyField.fieldKey,
          operator: 'eq',
          value: sumCandidate.currencyField.allowedValues![0]!,
        }] : [],
        window: { kind: 'last', durationMs: 30 * DAY_MS, boundary: 'beforeTrigger' },
        compare: { operator: 'gte', value: '100' },
      }] : undefined,
    },
    {
      id: 'filtered-30d',
      icon: 'pi pi-filter',
      label: 'Событие со значением за 30 дней',
      description: filterCandidate
        ? `${filterCandidate.event.name} · ${filterCandidate.field.label}: ${String(filterCandidate.value)}`
        : 'Нет поля с готовыми значениями',
      nodes: filterCandidate ? [{
        kind: 'eventAggregate',
        eventCode: filterCandidate.event.code,
        measure: 'count',
        filters: [{
          fieldKey: filterCandidate.field.fieldKey,
          operator: 'eq',
          value: filterCandidate.value,
        }],
        window: { kind: 'last', durationMs: 30 * DAY_MS, boundary: 'beforeTrigger' },
        compare: { operator: 'gte', value: 1 },
      }] : undefined,
    },
  ]
}

export function applyRuleQuickStartRecipe(
  draft: RuleDraft,
  parentNodeId: string,
  recipe: RuleQuickStartRecipe,
  context: RuleDomainContext,
): RuleCommandResult {
  if (!recipe.nodes?.length) {
    return {
      ok: false,
      draft,
      error: {
        code: 'recipe-unavailable',
        message: 'Для этого примера в каталоге проекта не хватает совместимых данных.',
      },
    }
  }
  if (recipe.nodes.length === 1) {
    return applyRuleCommand(draft, {
      type: 'add',
      parentNodeId,
      node: recipe.nodes[0]!,
    }, context)
  }

  const group = applyRuleCommand(draft, {
    type: 'add',
    parentNodeId,
    node: { kind: 'all' },
  }, context)
  if (!group.ok) return group

  let nextDraft = group.draft
  for (const node of recipe.nodes) {
    const result = applyRuleCommand(nextDraft, {
      type: 'add',
      parentNodeId: group.focusNodeId,
      node,
    }, context)
    if (!result.ok) return { ...result, draft }
    nextDraft = result.draft
  }
  return { ok: true, draft: nextDraft, focusNodeId: group.focusNodeId }
}
