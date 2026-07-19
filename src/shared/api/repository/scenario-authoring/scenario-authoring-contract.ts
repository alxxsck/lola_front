import {
  AggregateFilterDtoOperator,
  EventAggregateRuleNodeDtoMeasure,
  EventFieldRuleNodeDtoOperator,
  RuleCompareDtoOperator,
} from '@/shared/api/generated/models'
import type {
  ConditionCatalogEventResponseDto,
  ConditionCatalogFieldResponseDto,
  ConditionCatalogResponseDto,
  ScenarioLocalizationCatalogResponseDto,
  ScenarioTranslationCatalogResponseDto,
} from '@/shared/api/generated/models'

type AggregateMeasure = EventAggregateRuleNodeDtoMeasure
type AggregateFilterOperator = AggregateFilterDtoOperator
type EventFieldOperator = EventFieldRuleNodeDtoOperator
type CompareOperator = RuleCompareDtoOperator
type FieldAggregateMeasure = Extract<AggregateMeasure, 'sum' | 'min' | 'max' | 'first' | 'last'>
export type ScenarioAggregateValueType = 'boolean' | 'integer' | 'datetime' | 'field'

export interface ScenarioAggregateMeasureCapability {
  measure: AggregateMeasure
  field: 'none' | 'required'
  resultType: ScenarioAggregateValueType
  compareValueType: ScenarioAggregateValueType
  compareOperators: CompareOperator[]
}

export type ScenarioAuthoringField = Omit<ConditionCatalogFieldResponseDto, 'aggregations' | 'operators' | 'capabilities' | 'display'> & {
  display?: ConditionCatalogFieldResponseDto['display']
  capabilities: {
    eventField: { operators: EventFieldOperator[] }
    aggregateFilter: { operators: AggregateFilterOperator[] }
    aggregateMeasure: { measures: FieldAggregateMeasure[]; resultType?: string }
  }
}

export type ScenarioAuthoringEvent = Omit<ConditionCatalogEventResponseDto, 'fields' | 'capabilities'> & {
  fields: ScenarioAuthoringField[]
  aggregateMeasures: ScenarioAggregateMeasureCapability[]
}

export type ScenarioAuthoringContract = Omit<ConditionCatalogResponseDto, 'events' | 'localization' | 'translation'> & {
  events: ScenarioAuthoringEvent[]
  localization?: ScenarioLocalizationCatalogResponseDto
  translation?: ScenarioTranslationCatalogResponseDto
}

type CompatibleCatalog = Omit<ConditionCatalogResponseDto, 'localization' | 'translation'> &
  Partial<Pick<ConditionCatalogResponseDto, 'localization' | 'translation'>>

const allCompareOperators = Object.values(RuleCompareDtoOperator)
const eventFieldOperators = new Set<string>(Object.values(EventFieldRuleNodeDtoOperator))
const aggregateFilterOperators = new Set<string>(Object.values(AggregateFilterDtoOperator))
const fieldAggregateMeasures = new Set<string>(Object.values(EventAggregateRuleNodeDtoMeasure)
  .filter((measure) => measure !== EventAggregateRuleNodeDtoMeasure.exists && measure !== EventAggregateRuleNodeDtoMeasure.count))

function adaptField(field: ConditionCatalogFieldResponseDto): ScenarioAuthoringField {
  const { aggregations, operators, capabilities, ...definition } = field
  if (!Array.isArray(aggregations) || !Array.isArray(operators)) throw new Error(`Invalid catalog field ${field.fieldKey}`)

  return {
    ...definition,
    capabilities: {
      eventField: {
        operators: capabilities.currentEvent.operators.filter((operator): operator is EventFieldOperator => eventFieldOperators.has(operator)),
      },
      aggregateFilter: {
        operators: capabilities.aggregateFilter.operators.filter((operator): operator is AggregateFilterOperator => aggregateFilterOperators.has(operator)),
      },
      aggregateMeasure: {
        measures: capabilities.aggregateMeasure.measures.filter((measure): measure is FieldAggregateMeasure => fieldAggregateMeasures.has(measure)),
        resultType: capabilities.aggregateMeasure.resultType,
      },
    },
  }
}

function adaptedMeasures(event: ConditionCatalogEventResponseDto): ScenarioAggregateMeasureCapability[] {
  const eventMeasures: ScenarioAggregateMeasureCapability[] = event.capabilities.eventMeasures.map((capability) => ({
    measure: capability.measure,
    field: 'none',
    resultType: capability.resultType,
    compareValueType: capability.resultType,
    compareOperators: capability.resultType === 'boolean'
      ? [RuleCompareDtoOperator.eq, RuleCompareDtoOperator.neq]
      : [...allCompareOperators],
  }))
  const fieldMeasures = new Set(event.fields.flatMap((field) => field.capabilities.aggregateMeasure.measures))
  return [
    ...eventMeasures,
    ...[...fieldMeasures].filter((measure): measure is FieldAggregateMeasure => fieldAggregateMeasures.has(measure)).map((measure) => ({
      measure,
      field: 'required' as const,
      resultType: 'field' as const,
      compareValueType: 'field' as const,
      compareOperators: [...allCompareOperators],
    })),
  ]
}

export function adaptScenarioAuthoringContract(catalog: CompatibleCatalog): ScenarioAuthoringContract {
  return {
    ...catalog,
    events: catalog.events.map((event) => ({
      code: event.code,
      definitionId: event.definitionId,
      definitionKeyId: event.definitionKeyId,
      description: event.description,
      name: event.name,
      schemaVersion: event.schemaVersion,
      fields: event.fields.map(adaptField),
      aggregateMeasures: adaptedMeasures(event),
    })),
  }
}
