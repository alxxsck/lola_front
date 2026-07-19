import {
  attributeContractPublish,
  attributeContractRevision,
  attributeContractRevisions,
  attributeContractSaveDraft,
  attributeContractValidate,
  attributeContractWorkspace,
  attributeDefinitionImpact,
  profileHealthHealth,
} from "@/shared/api/generated/lola-backend";
import type {
  AttributeContractRevisionsParams,
  ProfileHealthHealthParams,
  PublishAttributeContractDto,
  SaveAttributeContractDraftDto,
} from "@/shared/api/generated/models";
import { normalizeApiError } from "@/shared/api/http/api-error";

async function call<Response>(
  request: () => Promise<Response>,
): Promise<Response> {
  try {
    return await request();
  } catch (cause) {
    throw normalizeApiError(cause);
  }
}

export const attributeContractRepository = {
  workspace: (projectId: string) =>
    call(() => attributeContractWorkspace(projectId)),
  saveDraft: (projectId: string, body: SaveAttributeContractDraftDto) =>
    call(() => attributeContractSaveDraft(projectId, body)),
  validate: (projectId: string, expectedDraftVersion: number) =>
    call(() => attributeContractValidate(projectId, { expectedDraftVersion })),
  publish: (projectId: string, body: PublishAttributeContractDto) =>
    call(() => attributeContractPublish(projectId, body)),
  revisions: (projectId: string, params?: AttributeContractRevisionsParams) =>
    call(() => attributeContractRevisions(projectId, params)),
  revision: (projectId: string, revisionId: string) =>
    call(() => attributeContractRevision(projectId, revisionId)),
  impact: (projectId: string, definitionId: string) =>
    call(() => attributeDefinitionImpact(projectId, definitionId)),
  health: (projectId: string, params?: ProfileHealthHealthParams) =>
    call(() => profileHealthHealth(projectId, params)),
};
