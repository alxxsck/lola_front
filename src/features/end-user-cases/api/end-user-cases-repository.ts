import {
  endUserCasePolicyGet,
  endUserCasePolicyPreview,
  endUserCasePolicyPublish,
  endUserCasePolicySaveDraft,
  endUserCasesAssignment,
  endUserCasesAssignees,
  endUserCasesClassification,
  endUserCasesCostSummary,
  endUserCasesDetail,
  endUserCasesLinkMessage,
  endUserCasesList,
  endUserCasesMessages,
  endUserCasesMerge,
  endUserCasesProposals,
  endUserCasesSummary,
  endUserCasesSplit,
  endUserCasesTimeline,
  endUserCasesUnlinkMessage,
  endUserCasesWorkflow,
} from "@/shared/api/generated/lola-backend";
import type {
  AssignEndUserCaseDto,
  ClassifyEndUserCaseDto,
  EndUserCaseCommandResponseDto,
  EndUserCaseAssigneesResponseDto,
  EndUserCaseCostSummaryResponseDto,
  EndUserCasePolicyPreviewResponseDto,
  EndUserCasePolicyResponseDto,
  EndUserCasePolicyRevisionResponseDto,
  EndUserCasesPageResponseDto,
  LinkEndUserCaseMessageDto,
  MergeEndUserCasesDto,
  MergeEndUserCasesResponseDto,
  PreviewEndUserCasePolicyDto,
  PublishEndUserCasePolicyDto,
  SaveEndUserCasePolicyDraftDto,
  SplitEndUserCaseDto,
  SplitEndUserCaseResponseDto,
  UnlinkEndUserCaseMessageDto,
  UpdateEndUserCaseWorkflowDto,
} from "@/shared/api/generated/models";
import {
  endUserCaseListParams,
  type EndUserCase,
  type EndUserCaseFilters,
  type EndUserCaseMessages,
  type EndUserCaseProposals,
  type EndUserCaseSummary,
  type EndUserCaseTimeline,
} from "../model/end-user-case";
import { isMockMode } from "@/shared/config/data-mode";
import { mockEndUserCasesRepository } from "./mock-end-user-cases-repository";

export interface EndUserCaseDetailBundle {
  case: EndUserCase;
  messages: EndUserCaseMessages;
  timeline: EndUserCaseTimeline;
  proposals: EndUserCaseProposals;
}

export interface EndUserCasesRepository {
  list(
    projectId: string,
    filters: EndUserCaseFilters,
    cursor?: string,
  ): Promise<EndUserCasesPageResponseDto>;
  summary(projectId: string): Promise<EndUserCaseSummary>;
  assignees(projectId: string): Promise<EndUserCaseAssigneesResponseDto>;
  messages(
    projectId: string,
    caseId: string,
    cursor?: string,
  ): Promise<EndUserCaseMessages>;
  detail(
    projectId: string,
    caseId: string,
    options?: { includeProposals?: boolean },
  ): Promise<EndUserCaseDetailBundle>;
  workflow(
    projectId: string,
    caseId: string,
    command: UpdateEndUserCaseWorkflowDto,
  ): Promise<EndUserCaseCommandResponseDto>;
  assign(
    projectId: string,
    caseId: string,
    command: AssignEndUserCaseDto,
  ): Promise<EndUserCaseCommandResponseDto>;
  classify(
    projectId: string,
    caseId: string,
    command: ClassifyEndUserCaseDto,
  ): Promise<EndUserCaseCommandResponseDto>;
  linkMessage(
    projectId: string,
    caseId: string,
    command: LinkEndUserCaseMessageDto,
  ): Promise<EndUserCaseCommandResponseDto>;
  unlinkMessage(
    projectId: string,
    caseId: string,
    messageId: string,
    command: UnlinkEndUserCaseMessageDto,
  ): Promise<EndUserCaseCommandResponseDto>;
  merge(
    projectId: string,
    caseId: string,
    command: MergeEndUserCasesDto,
  ): Promise<MergeEndUserCasesResponseDto>;
  split(
    projectId: string,
    caseId: string,
    command: SplitEndUserCaseDto,
  ): Promise<SplitEndUserCaseResponseDto>;
  cost(projectId: string): Promise<EndUserCaseCostSummaryResponseDto>;
  policy(projectId: string): Promise<EndUserCasePolicyResponseDto>;
  previewPolicy(
    projectId: string,
    command: PreviewEndUserCasePolicyDto,
  ): Promise<EndUserCasePolicyPreviewResponseDto>;
  savePolicy(
    projectId: string,
    command: SaveEndUserCasePolicyDraftDto,
  ): Promise<EndUserCasePolicyRevisionResponseDto>;
  publishPolicy(
    projectId: string,
    command: PublishEndUserCasePolicyDto,
  ): Promise<EndUserCasePolicyRevisionResponseDto>;
}

const apiEndUserCasesRepository: EndUserCasesRepository = {
  list(projectId, filters, cursor) {
    return endUserCasesList(projectId, endUserCaseListParams(filters, cursor), {
      paramsSerializer: { indexes: null },
    });
  },
  summary: endUserCasesSummary,
  assignees: endUserCasesAssignees,
  async detail(projectId, caseId, options) {
    const [item, messages, timeline, proposals] = await Promise.all([
      endUserCasesDetail(projectId, caseId),
      endUserCasesMessages(projectId, caseId, { limit: 100 }),
      endUserCasesTimeline(projectId, caseId),
      options?.includeProposals === false
        ? Promise.resolve({ items: [] })
        : endUserCasesProposals(projectId, caseId),
    ]);
    return { case: item, messages, timeline, proposals };
  },
  messages(projectId, caseId, cursor) {
    return endUserCasesMessages(projectId, caseId, {
      limit: 100,
      ...(cursor ? { cursor } : {}),
    });
  },
  workflow: endUserCasesWorkflow,
  assign: endUserCasesAssignment,
  classify: endUserCasesClassification,
  linkMessage: endUserCasesLinkMessage,
  unlinkMessage: endUserCasesUnlinkMessage,
  merge: endUserCasesMerge,
  split: endUserCasesSplit,
  cost: endUserCasesCostSummary,
  policy: endUserCasePolicyGet,
  previewPolicy: endUserCasePolicyPreview,
  savePolicy: endUserCasePolicySaveDraft,
  publishPolicy: endUserCasePolicyPublish,
};

export const endUserCasesRepository = isMockMode
  ? mockEndUserCasesRepository
  : apiEndUserCasesRepository;
