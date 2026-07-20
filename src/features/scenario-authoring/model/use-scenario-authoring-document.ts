import { ref } from 'vue'

import { createAudienceDraft, deserializeAudience, type AudienceDomainContext } from '@/features/scenario-audience/model'
import { createDeliveryPolicyDraft, deserializeDeliveryPolicy } from '@/features/scenario-delivery/model'
import { createRuleDraft, deserializeRule, type RuleDomainContext } from '@/features/scenario-rules/model'
import { normalizeScenarioActions } from '@/features/scenarios/model/scenario-graph'
import { ApiError } from '@/shared/api/http/api-error'
import { scenarioAuthoringRepository, type ScenarioCreateInput, type ScenarioDraftContent } from '@/shared/api/repository/scenario-authoring'
import type { ScenarioAction } from '@/shared/types/domain'
import { defaultLocalizationPolicy } from '@/features/scenario-localization/model'
import type { ScenarioLocalizationPolicyDto } from '@/shared/api/generated/models'

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function restoreScenarioAuthoringSource(
  value: unknown,
  ruleContext: RuleDomainContext | null,
  audienceContext: AudienceDomainContext | null,
) {
  const source = record(value)
  const rawActions = record(source.graph).actions
  const actions = Array.isArray(rawActions)
    ? normalizeScenarioActions(rawActions.flatMap((value): ScenarioAction[] => {
        const action = record(value)
        if (typeof action.type !== 'string' || typeof action.position !== 'number') return []
        return [{
          position: action.position,
          type: action.type,
          config: structuredClone(record(action.config)),
          ...(typeof action.nodeKey === 'string' ? { nodeKey: action.nodeKey } : {}),
          ...(typeof action.nextNodeKey === 'string' || action.nextNodeKey === null ? { nextNodeKey: action.nextNodeKey } : {}),
        }]
      }))
    : null
  return {
    rule: ruleContext && source.rule ? deserializeRule(source.rule, ruleContext).draft : createRuleDraft(),
    audience: audienceContext && source.audience ? deserializeAudience(source.audience, audienceContext).draft : createAudienceDraft(),
    delivery: source.deliveryPolicy ? deserializeDeliveryPolicy(source.deliveryPolicy) : createDeliveryPolicyDraft(),
    actions,
    localization: source.localization && typeof source.localization === 'object'
      ? structuredClone(source.localization) as ScenarioLocalizationPolicyDto
      : defaultLocalizationPolicy(),
  }
}

export function useScenarioAuthoringDocument() {
  const currentRevisionId = ref<string | null>(null)
  const currentDraftVersion = ref<number | null>(null)
  const authoringEditable = ref(true)
  const authoringUnavailableReason = ref<string | null>(null)
  const draftConflict = ref(false)

  function reset() {
    currentRevisionId.value = null
    currentDraftVersion.value = null
    authoringEditable.value = true
    authoringUnavailableReason.value = null
    draftConflict.value = false
  }

  async function load(projectId: string, scenarioId: string) {
    const document = await scenarioAuthoringRepository.getScenarioDocument(projectId, scenarioId)
    currentRevisionId.value = document.currentRevisionId ?? null
    currentDraftVersion.value = document.draft?.version ?? null
    authoringEditable.value = document.editable
    authoringUnavailableReason.value = document.unavailableReason ?? null
    return document
  }

  async function create(projectId: string, input: ScenarioCreateInput) {
    draftConflict.value = false
    const created = await scenarioAuthoringRepository.createScenario(projectId, input)
    currentRevisionId.value = created.currentRevisionId
    currentDraftVersion.value = created.draft.version
    return created
  }

  async function save(projectId: string, scenarioId: string, content: ScenarioDraftContent) {
    draftConflict.value = false
    try {
      const draft = await scenarioAuthoringRepository.saveScenarioDraft(projectId, scenarioId, {
        ...content,
        expectedDraftVersion: currentDraftVersion.value,
        expectedCurrentRevisionId: currentRevisionId.value,
      })
      currentDraftVersion.value = draft.version
      return draft
    } catch (cause) {
      draftConflict.value = cause instanceof ApiError && cause.code === 'SCENARIO_DRAFT_CONFLICT'
      throw cause
    }
  }

  return {
    authoringEditable,
    authoringUnavailableReason,
    create,
    currentDraftVersion,
    currentRevisionId,
    draftConflict,
    load,
    reset,
    save,
  }
}
