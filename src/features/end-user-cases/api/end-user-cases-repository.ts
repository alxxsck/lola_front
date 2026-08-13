import {
  endUserCasePolicyGet,
  endUserCasePolicyPreview,
  endUserCasePolicyPublish,
  endUserCasePolicySaveDraft,
  endUserCasesAssignees,
  endUserCasesCancelEscalation,
  endUserCasesClaimEscalation,
  endUserCasesClassification,
  endUserCasesCloseEscalation,
  endUserCasesCostSummary,
  endUserCasesDetail,
  endUserCasesLinkMessage,
  endUserCasesList,
  endUserCasesListEscalations,
  endUserCasesMessages,
  endUserCasesMerge,
  endUserCasesReleaseEscalation,
  endUserCasesRequestEscalation,
  endUserCasesSummary,
  endUserCasesSplit,
  endUserCasesTimeline,
  endUserCasesTransferEscalation,
  endUserCasesUnlinkMessage,
  endUserCasesWorkflow,
} from '@/shared/api/generated/retenive-backend';
import type {
  CancelEndUserCaseEscalationDto,
  ClassifyEndUserCaseDto,
  CloseEndUserCaseEscalationDto,
  EndUserCaseCommandResponseDto,
  EndUserCaseAssigneesResponseDto,
  EndUserCaseCostSummaryResponseDto,
  EndUserCaseDetailResponseDto,
  EndUserCaseEscalationCommandResponseDto,
  EndUserCaseEscalationsResponseDto,
  EndUserCasePolicyPreviewResponseDto,
  EndUserCasePolicyResponseDto,
  EndUserCasePolicyRevisionResponseDto,
  EndUserCasesPageResponseDto,
  LinkEndUserCaseMessageDto,
  MergeEndUserCasesDto,
  MergeEndUserCasesResponseDto,
  PreviewEndUserCasePolicyDto,
  PublishEndUserCasePolicyDto,
  RequestEndUserCaseEscalationDto,
  SaveEndUserCasePolicyDraftDto,
  SplitEndUserCaseDto,
  SplitEndUserCaseResponseDto,
  TransferEndUserCaseEscalationDto,
  UnlinkEndUserCaseMessageDto,
  UpdateEndUserCaseWorkflowDto,
  VersionedEndUserCaseEscalationDto,
} from '@/shared/api/generated/models';
import { ApiError } from '@/shared/api/http/api-error';
import {
  endUserCaseListParams,
  type EndUserCaseFilters,
  type EndUserCaseMessages,
  type EndUserCaseSummary,
  type EndUserCaseTimeline,
} from '../model/end-user-case';
import { isMockMode } from '@/shared/config/data-mode';
import { mockEndUserCasesRepository } from './mock-end-user-cases-repository';

export interface EndUserCaseDetailBundle {
  case: EndUserCaseDetailResponseDto;
  messages: EndUserCaseMessages;
  timeline: EndUserCaseTimeline;
  escalations: EndUserCaseEscalationsResponseDto;
}

export interface AssignEndUserCaseCommand {
  expectedVersion: number;
  idempotencyKey: string;
  assignedCmsUserId: string | null;
  reason: string;
}

export interface EndUserCasesRepository {
  list(
    projectId: string,
    filters: EndUserCaseFilters,
    cursor?: string,
  ): Promise<EndUserCasesPageResponseDto>;
  summary(projectId: string): Promise<EndUserCaseSummary>;
  assignees(projectId: string): Promise<EndUserCaseAssigneesResponseDto>;
  messages(projectId: string, caseId: string, cursor?: string): Promise<EndUserCaseMessages>;
  detail(projectId: string, caseId: string): Promise<EndUserCaseDetailBundle>;
  workflow(
    projectId: string,
    caseId: string,
    command: UpdateEndUserCaseWorkflowDto,
  ): Promise<EndUserCaseCommandResponseDto>;
  assign(
    projectId: string,
    caseId: string,
    command: AssignEndUserCaseCommand,
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
  requestEscalation(
    projectId: string,
    caseId: string,
    command: RequestEndUserCaseEscalationDto,
    idempotencyKey: string,
  ): Promise<EndUserCaseEscalationCommandResponseDto>;
  claimEscalation(
    projectId: string,
    caseId: string,
    escalationId: string,
    command: VersionedEndUserCaseEscalationDto,
    idempotencyKey: string,
  ): Promise<EndUserCaseEscalationCommandResponseDto>;
  releaseEscalation(
    projectId: string,
    caseId: string,
    escalationId: string,
    command: VersionedEndUserCaseEscalationDto,
    idempotencyKey: string,
  ): Promise<EndUserCaseEscalationCommandResponseDto>;
  transferEscalation(
    projectId: string,
    caseId: string,
    escalationId: string,
    command: TransferEndUserCaseEscalationDto,
    idempotencyKey: string,
  ): Promise<EndUserCaseEscalationCommandResponseDto>;
  closeEscalation(
    projectId: string,
    caseId: string,
    escalationId: string,
    command: CloseEndUserCaseEscalationDto,
    idempotencyKey: string,
  ): Promise<EndUserCaseEscalationCommandResponseDto>;
  cancelEscalation(
    projectId: string,
    caseId: string,
    escalationId: string,
    command: CancelEndUserCaseEscalationDto,
    idempotencyKey: string,
  ): Promise<EndUserCaseEscalationCommandResponseDto>;
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
  async detail(projectId, caseId) {
    const [item, messages, timeline, escalations] = await Promise.all([
      endUserCasesDetail(projectId, caseId),
      endUserCasesMessages(projectId, caseId, { limit: 100 }),
      endUserCasesTimeline(projectId, caseId),
      endUserCasesListEscalations(projectId, caseId),
    ]);
    return { case: item, messages, timeline, escalations };
  },
  messages(projectId, caseId, cursor) {
    return endUserCasesMessages(projectId, caseId, {
      limit: 100,
      ...(cursor ? { cursor } : {}),
    });
  },
  workflow: endUserCasesWorkflow,
  async assign() {
    throw new ApiError(
      410,
      'Назначение перенесено в рабочее место поддержки',
      undefined,
      undefined,
      'END_USER_CASE_ASSIGNMENT_RETIRED',
    );
  },
  classify: endUserCasesClassification,
  linkMessage: endUserCasesLinkMessage,
  unlinkMessage: endUserCasesUnlinkMessage,
  merge: endUserCasesMerge,
  split: endUserCasesSplit,
  requestEscalation(projectId, caseId, command, idempotencyKey) {
    return endUserCasesRequestEscalation(projectId, caseId, command, {
      headers: { 'Idempotency-Key': idempotencyKey },
    });
  },
  claimEscalation(projectId, caseId, escalationId, command, idempotencyKey) {
    return endUserCasesClaimEscalation(projectId, caseId, escalationId, command, {
      headers: { 'Idempotency-Key': idempotencyKey },
    });
  },
  releaseEscalation(projectId, caseId, escalationId, command, idempotencyKey) {
    return endUserCasesReleaseEscalation(projectId, caseId, escalationId, command, {
      headers: { 'Idempotency-Key': idempotencyKey },
    });
  },
  transferEscalation(projectId, caseId, escalationId, command, idempotencyKey) {
    return endUserCasesTransferEscalation(projectId, caseId, escalationId, command, {
      headers: { 'Idempotency-Key': idempotencyKey },
    });
  },
  closeEscalation(projectId, caseId, escalationId, command, idempotencyKey) {
    return endUserCasesCloseEscalation(projectId, caseId, escalationId, command, {
      headers: { 'Idempotency-Key': idempotencyKey },
    });
  },
  cancelEscalation(projectId, caseId, escalationId, command, idempotencyKey) {
    return endUserCasesCancelEscalation(projectId, caseId, escalationId, command, {
      headers: { 'Idempotency-Key': idempotencyKey },
    });
  },
  cost: endUserCasesCostSummary,
  policy: endUserCasePolicyGet,
  previewPolicy: endUserCasePolicyPreview,
  savePolicy: endUserCasePolicySaveDraft,
  publishPolicy: endUserCasePolicyPublish,
};

export const endUserCasesRepository = isMockMode
  ? mockEndUserCasesRepository
  : apiEndUserCasesRepository;
