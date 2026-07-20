import {
  scenarioAudienceArchive,
  scenarioAudienceCreate,
  scenarioAudienceDetail,
  scenarioAudienceEvaluationEvaluateUser,
  scenarioAudiencePublishRevision,
  scenarioAudienceRevision,
  scenarioAudienceSearch,
  scenarioAuthoringCatalog,
  scenarioAuthoringCreateScenario,
  scenarioAuthoringPreview,
  scenarioAuthoringPreviewGoal,
  scenarioAuthoringPublishScenario,
  scenarioAuthoringRollbackScenario,
  scenarioAuthoringSaveDraft,
  scenarioAuthoringScenarioDocument,
  scenarioAuthoringScenarioRevision,
  scenarioAuthoringScenarioRevisions,
  scenarioAuthoringValidate,
  scenarioAuthoringValidateScenarioDraft,
  scenarioRunsExplain,
} from "@/shared/api/generated/lola-backend";
import type {
  AudienceRuleDto,
  CreateScenarioAuthoringDto,
  PreviewScenarioGoalDto,
  PreviewScenarioScopeDto,
  PublishScenarioDto,
  PublishSegmentRevisionDto,
  RollbackScenarioDto,
  SaveScenarioDraftDto,
  ScenarioAudienceSearchParams,
  ScenarioAuthoringScenarioRevisionsParams,
  ScenarioRuleDto,
  ValidateScenarioDraftDto,
} from "@/shared/api/generated/models";
import { normalizeApiError } from "@/shared/api/http/api-error";

import { adaptScenarioAuthoringContract } from "./scenario-authoring-contract";

export type ScenarioPublishInput = Required<
  Pick<
    PublishScenarioDto,
    "catalogRevision" | "deliveryPolicy" | "expectedCurrentRevisionId"
  >
> &
  Pick<
    PublishScenarioDto,
    | "audience"
    | "expectedDraftVersion"
    | "localization"
    | "profileFreshness"
    | "rule"
  >;

export type ScenarioDraftContent = Omit<
  SaveScenarioDraftDto,
  "expectedCurrentRevisionId" | "expectedDraftVersion"
>;

export type ScenarioCreateInput = CreateScenarioAuthoringDto;

export interface ScenarioAuthoringRequestOptions {
  signal?: AbortSignal;
}

async function callApi<Response>(
  request: () => Promise<Response>,
): Promise<Response> {
  try {
    return await request();
  } catch (cause) {
    throw normalizeApiError(cause);
  }
}

export const scenarioAuthoringRepository = {
  async getContract(projectId: string) {
    return adaptScenarioAuthoringContract(
      await callApi(() => scenarioAuthoringCatalog(projectId)),
    );
  },

  createScenario(projectId: string, input: CreateScenarioAuthoringDto) {
    return callApi(() => scenarioAuthoringCreateScenario(projectId, input));
  },

  validateRule(
    projectId: string,
    rule: ScenarioRuleDto,
    options?: ScenarioAuthoringRequestOptions,
    audience?: AudienceRuleDto,
  ) {
    const body = audience ? { rule, audience } : { rule };
    return callApi(() =>
      options
        ? scenarioAuthoringValidate(projectId, body, options)
        : scenarioAuthoringValidate(projectId, body),
    );
  },

  previewRule(
    projectId: string,
    rule: ScenarioRuleDto,
    scope: PreviewScenarioScopeDto,
    options?: ScenarioAuthoringRequestOptions,
    audience?: AudienceRuleDto,
  ) {
    const body = audience ? { rule, scope, audience } : { rule, scope };
    return callApi(() =>
      options
        ? scenarioAuthoringPreview(projectId, body, options)
        : scenarioAuthoringPreview(projectId, body),
    );
  },

  previewGoal(
    projectId: string,
    draft: PreviewScenarioGoalDto,
    options?: ScenarioAuthoringRequestOptions,
  ) {
    return callApi(() =>
      options
        ? scenarioAuthoringPreviewGoal(projectId, draft, options)
        : scenarioAuthoringPreviewGoal(projectId, draft),
    );
  },

  getScenarioDocument(projectId: string, scenarioId: string) {
    return callApi(() =>
      scenarioAuthoringScenarioDocument(projectId, scenarioId),
    );
  },

  saveScenarioDraft(
    projectId: string,
    scenarioId: string,
    draft: SaveScenarioDraftDto,
  ) {
    return callApi(() =>
      scenarioAuthoringSaveDraft(projectId, scenarioId, draft),
    );
  },

  validateScenarioDraft(
    projectId: string,
    scenarioId: string,
    draft: ValidateScenarioDraftDto,
    options?: ScenarioAuthoringRequestOptions,
  ) {
    return callApi(() =>
      options
        ? scenarioAuthoringValidateScenarioDraft(
            projectId,
            scenarioId,
            draft,
            options,
          )
        : scenarioAuthoringValidateScenarioDraft(projectId, scenarioId, draft),
    );
  },

  getScenarioRevisions(
    projectId: string,
    scenarioId: string,
    params?: ScenarioAuthoringScenarioRevisionsParams,
  ) {
    return callApi(() =>
      scenarioAuthoringScenarioRevisions(projectId, scenarioId, params),
    );
  },

  getScenarioRevision(
    projectId: string,
    scenarioId: string,
    revisionId: string,
  ) {
    return callApi(() =>
      scenarioAuthoringScenarioRevision(projectId, scenarioId, revisionId),
    );
  },

  searchSegments(
    projectId: string,
    params?: ScenarioAudienceSearchParams,
    options?: ScenarioAuthoringRequestOptions,
  ) {
    return callApi(() =>
      options
        ? scenarioAudienceSearch(projectId, params, options)
        : scenarioAudienceSearch(projectId, params),
    );
  },

  getSegment(projectId: string, segmentId: string) {
    return callApi(() => scenarioAudienceDetail(projectId, segmentId));
  },

  getSegmentRevision(
    projectId: string,
    segmentId: string,
    segmentRevisionId: string,
  ) {
    return callApi(() =>
      scenarioAudienceRevision(projectId, segmentId, segmentRevisionId),
    );
  },

  createSegment(projectId: string, draft: PublishSegmentRevisionDto) {
    return callApi(() => scenarioAudienceCreate(projectId, draft));
  },

  publishSegmentRevision(
    projectId: string,
    segmentId: string,
    draft: PublishSegmentRevisionDto,
  ) {
    return callApi(() =>
      scenarioAudiencePublishRevision(projectId, segmentId, draft),
    );
  },

  archiveSegment(projectId: string, segmentId: string) {
    return callApi(() => scenarioAudienceArchive(projectId, segmentId));
  },

  evaluateAudienceForUser(
    projectId: string,
    endUserId: string,
    catalogRevision: string,
    rule: AudienceRuleDto,
  ) {
    return callApi(() =>
      scenarioAudienceEvaluationEvaluateUser(projectId, {
        endUserId,
        catalogRevision,
        rule,
      }),
    );
  },

  publishScenario(
    projectId: string,
    scenarioId: string,
    draft: ScenarioPublishInput,
  ) {
    return callApi(() =>
      scenarioAuthoringPublishScenario(projectId, scenarioId, draft),
    );
  },

  rollbackScenario(
    projectId: string,
    scenarioId: string,
    revisionId: string,
    expectedCurrentRevisionId: RollbackScenarioDto["expectedCurrentRevisionId"],
  ) {
    return callApi(() =>
      scenarioAuthoringRollbackScenario(projectId, scenarioId, revisionId, {
        expectedCurrentRevisionId,
      }),
    );
  },

  explainRun(projectId: string, runId: string) {
    return callApi(() => scenarioRunsExplain(projectId, runId));
  },
};
