import {
  cmsAgentRequestExecute,
  cmsAgentRequestSubmit,
  projectAIAnalysisEstimate,
} from '@/shared/api/generated/retenive-backend';
import type {
  CmsAgentRequestResponseDto,
  EstimateProjectAIAnalysisDto,
  ProjectAIAnalysisEstimateResponseDto,
  SubmitCmsAgentRequestDto,
} from '@/shared/api/generated/models';
import { isMockMode } from '@/shared/config/data-mode';
import { decodeCmsAgentExecution, type CmsAgentExecution } from '../model/cms-agent-execution';

export interface CmsAgentRepository {
  estimate(
    projectId: string,
    input: EstimateProjectAIAnalysisDto,
  ): Promise<ProjectAIAnalysisEstimateResponseDto>;
  submit(projectId: string, input: SubmitCmsAgentRequestDto): Promise<CmsAgentRequestResponseDto>;
  execute(projectId: string, requestId: string): Promise<CmsAgentExecution>;
}

const apiRepository: CmsAgentRepository = {
  estimate: projectAIAnalysisEstimate,
  submit: cmsAgentRequestSubmit,
  async execute(projectId, requestId) {
    return decodeCmsAgentExecution(await cmsAgentRequestExecute(projectId, requestId));
  },
};

const mockRepository: CmsAgentRepository = {
  async estimate() {
    return {
      confirmationRequired: false,
      executionPath: 'CMS_AGENT',
      maxInputTokens: '12000',
      maxOutputTokens: '3000',
      maxProviderCalls: 2,
      model: 'grok-4.5',
      pricingVersion: 'mock-pricing-v1',
      projectPolicyRevision: 1,
      provider: 'xAI',
      reservedCostUsdTicks: '450000000',
    };
  },
  async submit(projectId, input) {
    const now = new Date().toISOString();
    return {
      requestId: crypto.randomUUID(),
      projectId,
      requestingCmsUserId: 'mock-cms-user',
      rootOperationId: crypto.randomUUID(),
      status: 'PENDING',
      text: input.text,
      contentAvailable: true,
      createdAt: now,
      updatedAt: now,
      retentionUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1_000).toISOString(),
      ...(input.endUserId ? { pinnedEndUserId: input.endUserId } : {}),
    };
  },
  async execute() {
    return {
      kind: 'ANALYSIS_QUEUED',
      analysisId: crypto.randomUUID(),
      runId: crypto.randomUUID(),
      status: 'QUEUED',
    };
  },
};

export const cmsAgentRepository = isMockMode ? mockRepository : apiRepository;
