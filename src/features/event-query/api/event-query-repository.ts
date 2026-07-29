import {
  caseVerificationEstimate,
  caseVerificationGet,
  caseVerificationStart,
  eventQueryPolicyApplyItem,
  eventQueryPolicyApplyProject,
  eventQueryPolicyGet,
  eventQueryPolicyGetItem,
  eventQueryPolicyListItems,
  eventQueryPolicyListRequests,
  eventQueryPolicyPreview,
} from "@/shared/api/generated/lola-backend";
import type {
  ApplyEventQueryPolicyItemDto,
  ApplyEventQueryProjectPolicyDto,
  EstimateCaseVerificationDto,
  EventQueryPolicyListItemsParams,
  EventQueryPolicyListRequestsParams,
  PreviewEventQueryDto,
  StartCaseVerificationDto,
} from "@/shared/api/generated/models";
import { isMockMode } from "@/shared/config/data-mode";
import { mockEventQueryRepository } from "./mock-event-query-repository";

export const apiEventQueryRepository = {
  getPolicy(projectId: string) {
    return eventQueryPolicyGet(projectId);
  },

  applyProject(projectId: string, input: ApplyEventQueryProjectPolicyDto) {
    return eventQueryPolicyApplyProject(projectId, input);
  },

  listItems(projectId: string, params: EventQueryPolicyListItemsParams) {
    return eventQueryPolicyListItems(projectId, params);
  },

  getItem(projectId: string, definitionKeyId: string) {
    return eventQueryPolicyGetItem(projectId, definitionKeyId);
  },

  applyItem(
    projectId: string,
    definitionKeyId: string,
    input: ApplyEventQueryPolicyItemDto,
  ) {
    return eventQueryPolicyApplyItem(projectId, definitionKeyId, input);
  },

  preview(projectId: string, input: PreviewEventQueryDto) {
    return eventQueryPolicyPreview(projectId, input);
  },

  listRequests(projectId: string, params: EventQueryPolicyListRequestsParams) {
    return eventQueryPolicyListRequests(projectId, params);
  },

  estimateCaseVerification(
    projectId: string,
    caseId: string,
    input: EstimateCaseVerificationDto,
  ) {
    return caseVerificationEstimate(projectId, caseId, input);
  },

  startCaseVerification(
    projectId: string,
    caseId: string,
    input: StartCaseVerificationDto,
  ) {
    return caseVerificationStart(projectId, caseId, input);
  },

  getCaseVerification(projectId: string, caseId: string, runId: string) {
    return caseVerificationGet(projectId, caseId, runId);
  },
};

export type EventQueryRepository = typeof apiEventQueryRepository;

export const eventQueryRepository: EventQueryRepository = isMockMode
  ? mockEventQueryRepository
  : apiEventQueryRepository;
