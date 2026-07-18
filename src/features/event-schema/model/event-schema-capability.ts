import type { ScenarioAuthoringContract, ScenarioAuthoringEvent, ScenarioAuthoringField } from '@/shared/api/repository/scenario-authoring'

export interface EventFieldCapabilitySummary {
  label: string
  availableForScenarios: boolean
}

export function findCatalogEventForDefinition(
  contract: Pick<ScenarioAuthoringContract, 'events'> | null,
  definitionId: string | undefined,
): ScenarioAuthoringEvent | undefined {
  if (!definitionId) return undefined
  return contract?.events.find((event) => event.definitionId === definitionId)
}

export function summarizeEventFieldCapability(
  field: ScenarioAuthoringField | undefined,
  catalogLoaded: boolean,
): EventFieldCapabilitySummary {
  if (!catalogLoaded) return { label: 'Catalog ещё не загружен', availableForScenarios: false }
  if (!field) return { label: 'Пока нельзя использовать в сценариях: revision или поле отсутствует в текущем catalog', availableForScenarios: false }

  const filterable = field.capabilities.eventField.operators.length > 0
    || field.capabilities.aggregateFilter.operators.length > 0
  const aggregatable = field.capabilities.aggregateMeasure.measures.length > 0

  if (filterable && aggregatable) return { label: 'Можно фильтровать и агрегировать', availableForScenarios: true }
  if (filterable) return { label: 'Можно фильтровать', availableForScenarios: true }
  if (aggregatable) return { label: 'Можно агрегировать', availableForScenarios: true }
  return { label: 'Пока нельзя использовать в сценариях: catalog не разрешает операции', availableForScenarios: false }
}
