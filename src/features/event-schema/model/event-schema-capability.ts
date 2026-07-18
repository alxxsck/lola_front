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

export function findCatalogFieldForDraft(
  event: Pick<ScenarioAuthoringEvent, 'fields'> | undefined,
  draft: { fieldKey?: string; wireKey: string },
): ScenarioAuthoringField | undefined {
  if (draft.fieldKey) return event?.fields.find((field) => field.fieldKey === draft.fieldKey)
  return event?.fields.find((field) => field.path === `event.payload.${draft.wireKey}`)
}

export function summarizeEventFieldCapability(
  field: ScenarioAuthoringField | undefined,
  catalogLoaded: boolean,
): EventFieldCapabilitySummary {
  if (!catalogLoaded) return { label: 'Возможности сценариев появятся после обновления', availableForScenarios: false }
  if (!field) return { label: 'Эта версия поля пока недоступна в сценариях', availableForScenarios: false }

  const currentEvent = field.capabilities.eventField.operators.length > 0
  const historyFilter = field.capabilities.aggregateFilter.operators.length > 0
  const historyAggregate = field.capabilities.aggregateMeasure.measures.length > 0
  const currentLabel = currentEvent ? 'можно сравнивать' : 'пока недоступно'
  const historyLabel = historyFilter && historyAggregate
    ? 'можно фильтровать и считать'
    : historyFilter
      ? 'можно фильтровать'
      : historyAggregate
        ? 'можно считать'
        : 'пока недоступно'

  return {
    label: `Событие запуска: ${currentLabel} · История: ${historyLabel}`,
    availableForScenarios: currentEvent || historyFilter || historyAggregate,
  }
}
