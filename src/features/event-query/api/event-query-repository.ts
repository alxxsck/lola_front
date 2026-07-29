import {
  caseVerificationEstimate,
  caseVerificationGet,
  caseVerificationStart,
  eventQueryPolicyGet,
  eventQueryPolicyPreview,
  eventQueryPolicyPublish,
  eventQueryPolicySaveDraft,
  eventQueryPolicyUsage,
  eventQueryPolicyValidate,
} from "@/shared/api/generated/lola-backend";
import type {
  EstimateCaseVerificationDto,
  EventQueryPolicyUsageParams,
  PreviewEventQueryDto,
  PublishEventQueryPolicyDto,
  SaveEventQueryPolicyDraftDto,
  StartCaseVerificationDto,
  ValidateEventQueryPolicyDto,
} from "@/shared/api/generated/models";
import { isMockMode } from "@/shared/config/data-mode";
import { mockEventQueryRepository } from "./mock-event-query-repository";

export const apiEventQueryRepository = {
  getPolicy(projectId: string) {
    return eventQueryPolicyGet(projectId);
  },

  saveDraft(projectId: string, input: SaveEventQueryPolicyDraftDto) {
    return eventQueryPolicySaveDraft(projectId, input);
  },

  validate(projectId: string, input: ValidateEventQueryPolicyDto) {
    return eventQueryPolicyValidate(projectId, input);
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
