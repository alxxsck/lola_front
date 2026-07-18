import {
  AggregateFilterDtoOperator,
  ConditionCatalogFieldResponseDtoAggregationsItem,
  EventAggregateRuleNodeDtoMeasure,
  EventFieldRuleNodeDtoOperator,
  RuleCompareDtoOperator,
} from '@/shared/api/generated/models'
import type {
  ConditionCatalogEventResponseDto,
  ConditionCatalogFieldResponseDto,
  ConditionCatalogResponseDto,
} from '@/shared/api/generated/models'

type AggregateMeasure = EventAggregateRuleNodeDtoMeasure
type AggregateFilterOperator = AggregateFilterDtoOperator
type EventFieldOperator = EventFieldRuleNodeDtoOperator
type CompareOperator = RuleCompareDtoOperator
type FieldAggregateMeasure = Extract<AggregateMeasure, 'sum' | 'min' | 'max'>
export type ScenarioAggregateValueType = 'boolean' | 'integer' | 'datetime' | 'field'

export interface ScenarioAggregateMeasureCapability {
  measure: AggregateMeasure
  field: 'none' | 'required'
  resultType: ScenarioAggregateValueType
  compareValueType: ScenarioAggregateValueType
  compareOperators: CompareOperator[]
}

export type ScenarioAuthoringField = Omit<ConditionCatalogFieldResponseDto, 'aggregations' | 'operators'> & {
  capabilities: {
    eventField: { operators: EventFieldOperator[] }
    aggregateFilter: { operators: AggregateFilterOperator[] }
    aggregateMeasure: { measures: FieldAggregateMeasure[] }
  }
}

export type ScenarioAuthoringEvent = Omit<ConditionCatalogEventResponseDto, 'fields'> & {
  fields: ScenarioAuthoringField[]
  aggregateMeasures: ScenarioAggregateMeasureCapability[]
}

export type ScenarioAuthoringContract = Omit<ConditionCatalogResponseDto, 'events'> & {
  events: ScenarioAuthoringEvent[]
}

const allCompareOperators = Object.values(RuleCompareDtoOperator)
const eventFieldOperators = new Set<string>(Object.values(EventFieldRuleNodeDtoOperator))
const aggregateFilterOperators = new Set<string>(Object.values(AggregateFilterDtoOperator))
const fieldAggregateMeasures = new Set<string>([
  EventAggregateRuleNodeDtoMeasure.sum,
  EventAggregateRuleNodeDtoMeasure.min,
  EventAggregateRuleNodeDtoMeasure.max,
])

// BE-FE-08A: generated AST enums define general measures while catalog fields define context-specific capabilities.
const aggregateMeasures: Array<Omit<ScenarioAggregateMeasureCapability, 'compareOperators'> & { compareOperators?: CompareOperator[] }> = [
  { measure: EventAggregateRuleNodeDtoMeasure.exists, field: 'none', resultType: 'boolean', compareValueType: 'boolean', compareOperators: [RuleCompareDtoOperator.eq, RuleCompareDtoOperator.neq] },
  { measure: EventAggregateRuleNodeDtoMeasure.count, field: 'none', resultType: 'integer', compareValueType: 'integer' },
  { measure: EventAggregateRuleNodeDtoMeasure.first, field: 'none', resultType: 'datetime', compareValueType: 'datetime' },
  { measure: EventAggregateRuleNodeDtoMeasure.last, field: 'none', resultType: 'datetime', compareValueType: 'datetime' },
  { measure: EventAggregateRuleNodeDtoMeasure.sum, field: 'required', resultType: 'field', compareValueType: 'field' },
  { measure: EventAggregateRuleNodeDtoMeasure.min, field: 'required', resultType: 'field', compareValueType: 'field' },
  { measure: EventAggregateRuleNodeDtoMeasure.max, field: 'required', resultType: 'field', compareValueType: 'field' },
]

function adaptField(field: ConditionCatalogFieldResponseDto): ScenarioAuthoringField {
  const { aggregations, operators, ...definition } = field

  return {
    ...definition,
    capabilities: {
      eventField: {
        operators: operators.filter((operator): operator is EventFieldOperator => eventFieldOperators.has(operator)),
      },
      aggregateFilter: {
        operators: operators.filter((operator): operator is AggregateFilterOperator => aggregateFilterOperators.has(operator)),
      },
      aggregateMeasure: {
        measures: aggregations.filter((measure): measure is FieldAggregateMeasure => fieldAggregateMeasures.has(measure)),
      },
    },
  }
}

function adaptedMeasures(): ScenarioAggregateMeasureCapability[] {
  return aggregateMeasures.map((capability) => ({
    ...capability,
    compareOperators: [...(capability.compareOperators ?? allCompareOperators)],
  }))
}

export function adaptScenarioAuthoringContract(catalog: ConditionCatalogResponseDto): ScenarioAuthoringContract {
  const hasDistinctCount = catalog.events.some((event) => event.fields.some((field) => (
    field.aggregations.includes(ConditionCatalogFieldResponseDtoAggregationsItem.distinct_count)
  )))

  if (hasDistinctCount && import.meta.env.DEV) {
    console.warn('[Scenario Authoring] BE-FE-09: distinct_count was removed from the normalized authoring contract')
  }

  return {
    ...catalog,
    events: catalog.events.map((event) => ({
      ...event,
      fields: event.fields.map(adaptField),
      aggregateMeasures: adaptedMeasures(),
    })),
  }
}
