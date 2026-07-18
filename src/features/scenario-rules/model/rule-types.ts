import type {
  ActivityDayStreakCompareDto,
  AggregateFilterDtoOperator,
  EventAggregateRuleNodeDtoMeasure,
  EventFieldRuleNodeDtoOperator,
  EventFieldRuleNodeDtoValue,
  LastRuleWindowDto,
  RuleCompareDto,
  ScenarioRuleDto,
  ScenarioRuleIssueResponseDto,
  SinceTriggerRuleWindowDto,
} from '@/shared/api/generated/models'
import type { ScenarioAuthoringContract } from '@/shared/api/repository/scenario-authoring'

export type RuleNodeId = string
export type RuleLiteral = EventFieldRuleNodeDtoValue
export type RuleAuthoringMode = 'initialEligibility' | 'recheckEligibility'
export type RuleLeafKind = 'eventField' | 'eventAggregate' | 'activityDayStreak'

export interface RuleDomainContext {
  triggerEventDefinitionId: string
  triggerEventCode: string
  mode: RuleAuthoringMode
  contract: ScenarioAuthoringContract
}

interface RuleDraftNodeBase {
  nodeId: RuleNodeId
}

export interface EmptyRuleDraftNode extends RuleDraftNodeBase {
  kind: 'empty'
}

export interface EventFieldRuleDraftNode extends RuleDraftNodeBase {
  kind: 'eventField'
  eventCode: string
  fieldKey: string
  operator: EventFieldRuleNodeDtoOperator
  value?: RuleLiteral
}

export interface RuleAggregateFilterDraft {
  filterId: string
  fieldKey: string
  operator: AggregateFilterDtoOperator
  value?: RuleLiteral
}

export type RuleAggregateFilterInput = Omit<RuleAggregateFilterDraft, 'filterId'> & { filterId?: string }

export interface EventAggregateRuleDraftNode extends RuleDraftNodeBase {
  kind: 'eventAggregate'
  eventCode: string
  measure: EventAggregateRuleNodeDtoMeasure
  fieldKey?: string
  filters: RuleAggregateFilterDraft[]
  window: LastRuleWindowDto | SinceTriggerRuleWindowDto
  compare: RuleCompareDto
}

export interface ActivityDayStreakRuleDraftNode extends RuleDraftNodeBase {
  kind: 'activityDayStreak'
  compare: ActivityDayStreakCompareDto
}

export type RuleLeafDraftNode = EventFieldRuleDraftNode | EventAggregateRuleDraftNode | ActivityDayStreakRuleDraftNode

export type RuleLeafInput =
  | Omit<EventFieldRuleDraftNode, 'nodeId'>
  | (Omit<EventAggregateRuleDraftNode, 'nodeId' | 'filters'> & { filters: RuleAggregateFilterInput[] })
  | Omit<ActivityDayStreakRuleDraftNode, 'nodeId'>

export type PartialRuleLeaf =
  | { kind: 'eventField'; eventCode?: string; fieldKey?: string; operator?: EventFieldRuleNodeDtoOperator; value?: RuleLiteral }
  | { kind: 'eventAggregate'; eventCode?: string; measure?: EventAggregateRuleNodeDtoMeasure; fieldKey?: string; filters?: RuleAggregateFilterInput[]; window?: LastRuleWindowDto | SinceTriggerRuleWindowDto; compare?: Partial<RuleCompareDto> }
  | { kind: 'activityDayStreak'; compare?: Partial<ActivityDayStreakCompareDto> }

export interface IncompleteRuleDraftNode extends RuleDraftNodeBase {
  kind: 'incomplete'
  leaf: PartialRuleLeaf
}

export interface OpaqueRuleDraftNode extends RuleDraftNodeBase {
  kind: 'opaque'
  source: unknown
  reportedKind?: string
}

export type RuleGroupDraftNode =
  | (RuleDraftNodeBase & { kind: 'all'; children: RuleDraftNode[] })
  | (RuleDraftNodeBase & { kind: 'any'; children: RuleDraftNode[] })

export interface NotRuleDraftNode extends RuleDraftNodeBase {
  kind: 'not'
  child: RuleDraftNode
}

export type RuleDraftNode =
  | EmptyRuleDraftNode
  | IncompleteRuleDraftNode
  | OpaqueRuleDraftNode
  | RuleGroupDraftNode
  | NotRuleDraftNode
  | RuleLeafDraftNode

export interface RuleDraft {
  version: 1
  root: RuleDraftNode
}

export type NewRuleNode =
  | { kind: 'empty' }
  | { kind: 'all' }
  | { kind: 'any' }
  | { kind: 'incomplete'; leaf: PartialRuleLeaf }
  | RuleLeafInput

export type RuleCommand =
  | { type: 'add'; parentNodeId: RuleNodeId; index?: number; node: NewRuleNode }
  | { type: 'remove'; nodeId: RuleNodeId }
  | { type: 'move'; nodeId: RuleNodeId; toParentNodeId: RuleNodeId; toIndex: number }
  | { type: 'wrap'; nodeId: RuleNodeId; wrapper: 'not' | 'all' | 'any' }
  | { type: 'unwrap'; nodeId: RuleNodeId }
  | { type: 'changeGroup'; nodeId: RuleNodeId; kind: 'all' | 'any' }
  | { type: 'replaceLeaf'; nodeId: RuleNodeId; leaf: RuleLeafInput | { kind: 'empty' } | { kind: 'incomplete'; leaf: PartialRuleLeaf } }

export interface RuleCommandError {
  code: string
  message: string
  nodeId?: RuleNodeId
  limit?: number
}

export type RuleCommandResult =
  | { ok: true; draft: RuleDraft; focusNodeId: RuleNodeId }
  | { ok: false; draft: RuleDraft; error: RuleCommandError }

export interface DraftIssue {
  code: string
  message: string
  nodeId?: RuleNodeId
  fieldPath?: string
}

export interface RulePathEntry {
  nodeId: RuleNodeId
  nodePath: string
}

export type RulePathIndex = Readonly<Record<string, RulePathEntry>>

export type RuleSerializationResult =
  | { ok: true; value: ScenarioRuleDto; pathIndex: RulePathIndex }
  | { ok: false; issues: DraftIssue[] }

export interface RuleDeserializeResult {
  draft: RuleDraft
  issues: DraftIssue[]
}

export interface MappedRuleIssue extends ScenarioRuleIssueResponseDto {
  nodeId?: RuleNodeId
  fieldPath?: string
}

export interface RuleSummary {
  text: string
  byNodeId: Readonly<Record<RuleNodeId, string>>
  status: 'empty' | 'incomplete' | 'ready' | 'unsupported'
  leaves: number
  aggregateLeaves: number
  nodes: number
  maxWindowMs: number
  totalWindowMs: number
}
