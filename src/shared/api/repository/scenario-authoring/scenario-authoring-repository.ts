import {
  scenarioAuthoringCatalog,
  scenarioAuthoringPreview,
  scenarioAuthoringPublishScenario,
  scenarioAuthoringRollbackScenario,
  scenarioAuthoringValidate,
  scenarioRunsExplain,
} from '@/shared/api/generated/lola-backend'
import type { PreviewScenarioScopeDto, PublishScenarioDto, RollbackScenarioDto, ScenarioRuleDto } from '@/shared/api/generated/models'
import { normalizeApiError } from '@/shared/api/http/api-error'

import { adaptScenarioAuthoringContract } from './scenario-authoring-contract'

async function callApi<Response>(request: () => Promise<Response>): Promise<Response> {
  try {
    return await request()
  } catch (cause) {
    throw normalizeApiError(cause)
  }
}

export const scenarioAuthoringRepository = {
  async getContract(projectId: string) {
    return adaptScenarioAuthoringContract(await callApi(() => scenarioAuthoringCatalog(projectId)))
  },

  validateRule(projectId: string, rule: ScenarioRuleDto) {
    return callApi(() => scenarioAuthoringValidate(projectId, { rule }))
  },

  previewRule(projectId: string, rule: ScenarioRuleDto, scope: PreviewScenarioScopeDto) {
    return callApi(() => scenarioAuthoringPreview(projectId, { rule, scope }))
  },

  publishScenario(projectId: string, scenarioId: string, draft: PublishScenarioDto) {
    return callApi(() => scenarioAuthoringPublishScenario(projectId, scenarioId, draft))
  },

  rollbackScenario(
    projectId: string,
    scenarioId: string,
    revisionId: string,
    expectedCurrentRevisionId: RollbackScenarioDto['expectedCurrentRevisionId'],
  ) {
    return callApi(() => scenarioAuthoringRollbackScenario(projectId, scenarioId, revisionId, { expectedCurrentRevisionId }))
  },

  explainRun(projectId: string, runId: string) {
    return callApi(() => scenarioRunsExplain(projectId, runId))
  },
}
