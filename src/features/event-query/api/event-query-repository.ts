import {
  caseVerificationEstimate,
  caseVerificationGet,
  caseVerificationStart,
  eventQueryPolicyGet,
  eventQueryPolicyGetItem,
  eventQueryPolicyListItems,
  eventQueryPolicyListRequests,
  eventQueryPolicyPatchItem,
  eventQueryPolicyPatchProject,
  eventQueryPolicyPreview,
  eventQueryPolicyPublish,
  eventQueryPolicyPublishItem,
  eventQueryPolicyUsage,
  eventQueryPolicyValidateItem,
} from "@/shared/api/generated/lola-backend";
import type {
  EstimateCaseVerificationDto,
  EventQueryPolicyListItemsParams,
  EventQueryPolicyListRequestsParams,
  EventQueryPolicyUsageParams,
  PatchEventQueryPolicyItemDto,
  PatchEventQueryProjectPolicyDto,
  PreviewEventQueryDto,
  PublishEventQueryPolicyDto,
  PublishEventQueryPolicyItemDto,
  StartCaseVerificationDto,
  ValidateEventQueryPolicyItemDto,
} from "@/shared/api/generated/models";
import { isMockMode } from "@/shared/config/data-mode";
import { mockEventQueryRepository } from "./mock-event-query-repository";

export const apiEventQueryRepository = {
  getPolicy(projectId: string) {
    return eventQueryPolicyGet(projectId);
  },

  patchProject(projectId: string, input: PatchEventQueryProjectPolicyDto) {
    return eventQueryPolicyPatchProject(projectId, input);
  },

  listItems(projectId: string, params: EventQueryPolicyListItemsParams) {
    return eventQueryPolicyListItems(projectId, params);
  },

  getItem(projectId: string, definitionKeyId: string) {
    return eventQueryPolicyGetItem(projectId, definitionKeyId);
  },

  patchItem(
    projectId: string,
    definitionKeyId: string,
    input: PatchEventQueryPolicyItemDto,
  ) {
    return eventQueryPolicyPatchItem(projectId, definitionKeyId, input);
  },

  validateItem(
    projectId: string,
    definitionKeyId: string,
    input: ValidateEventQueryPolicyItemDto,
  ) {
    return eventQueryPolicyValidateItem(projectId, definitionKeyId, input);
  },

  publishItem(
    projectId: string,
    definitionKeyId: string,
    input: PublishEventQueryPolicyItemDto,
  ) {
    return eventQueryPolicyPublishItem(projectId, definitionKeyId, input);
  },

  publish(projectId: string, input: PublishEventQueryPolicyDto) {
    return eventQueryPolicyPublish(projectId, input);
  },

  preview(projectId: string, input: PreviewEventQueryDto) {
    return eventQueryPolicyPreview(projectId, input);
  },

  usage(projectId: string, params: EventQueryPolicyUsageParams) {
    return eventQueryPolicyUsage(projectId, params);
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
