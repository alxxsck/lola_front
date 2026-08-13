import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  caseIntelligenceCalibration,
  caseIntelligenceCurrent,
  caseIntelligenceDryRun,
  caseIntelligenceModelProfiles,
  caseIntelligencePublishDetection,
  caseIntelligenceSaveBudgetDraft,
  caseIntelligenceSaveDetectionDraft,
  caseIntelligenceValidateDetection,
} from '@/shared/api/generated/retenive-backend';
import {
  createDefaultBudgetPolicy,
  createDefaultDetectionPolicy,
} from '../model/support-case-intelligence-policy';
import { apiSupportCaseIntelligenceSource } from './support-case-intelligence-source';

vi.mock('@/shared/api/generated/retenive-backend', () => ({
  caseIntelligenceCompileDetection: vi.fn(),
  caseIntelligenceCalibration: vi.fn(),
  caseIntelligenceCurrent: vi.fn(),
  caseIntelligenceDiscardDetectionDraft: vi.fn(),
  caseIntelligenceDryRun: vi.fn(),
  caseIntelligenceLookupCommand: vi.fn(),
  caseIntelligenceModelProfiles: vi.fn(),
  caseIntelligencePublishBudget: vi.fn(),
  caseIntelligencePublishDetection: vi.fn(),
  caseIntelligenceSaveBudgetDraft: vi.fn(),
  caseIntelligenceSaveDetectionDraft: vi.fn(),
  caseIntelligenceValidateDetection: vi.fn(),
}));

describe('apiSupportCaseIntelligenceSource', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads and previews through the generated client', async () => {
    vi.mocked(caseIntelligenceCurrent).mockResolvedValue({
      allowedActions: [],
      safety: {
        state: 'READY',
        authority: 'PLATFORM',
        assistantReleaseGate: 'ALLOW',
        projectOverrideAllowed: false,
      },
    });
    vi.mocked(caseIntelligenceModelProfiles).mockResolvedValue({
      items: [],
      selectedRevisionId: null,
    });
    vi.mocked(caseIntelligenceValidateDetection).mockResolvedValue({
      valid: true,
      issues: [],
      compiledPolicyHash: 'a'.repeat(64),
    });
    vi.mocked(caseIntelligenceCalibration).mockResolvedValue({
      state: 'UNAVAILABLE',
      modelProfileRevisionId: null,
      calibratorRevisionId: null,
      datasetRevisionId: null,
      minimumSamples: null,
      maximumIntervalWidth: null,
      autoApplyThreshold: 0.9,
      cells: [],
    });
    vi.mocked(caseIntelligenceDryRun).mockResolvedValue({
      executionMode: 'NON_DISPATCHING',
      dialogMessageIds: ['11111111-1111-4111-8111-111111111111'],
      caseDecision: 'DEFER',
      matchedRuleCodes: [],
      reasonCode: 'NO_RULE_MATCH',
      messageResults: [],
      candidates: [],
      cost: {
        currency: 'USD',
        estimatedMicroUsd: '0',
        billedMicroUsd: '0',
        inputTokens: 0,
        outputTokens: 0,
        providerCalls: 0,
        basis: 'DETERMINISTIC_PREVIEW',
      },
      stages: [],
    });
    const definition = createDefaultDetectionPolicy();
    const messages = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        role: 'USER' as const,
        text: 'Нужна помощь',
        locale: 'ru-RU',
      },
    ];

    await apiSupportCaseIntelligenceSource.read('project-1');
    await apiSupportCaseIntelligenceSource.readModelProfiles('project-1');
    await apiSupportCaseIntelligenceSource.validateDetection('project-1', definition);
    await apiSupportCaseIntelligenceSource.readCalibration('project-1', definition);
    await apiSupportCaseIntelligenceSource.dryRun('project-1', definition, messages);

    expect(caseIntelligenceCurrent).toHaveBeenCalledWith('project-1', undefined);
    expect(caseIntelligenceDryRun).toHaveBeenCalledWith(
      'project-1',
      { definition, messages },
      undefined,
    );
    expect(caseIntelligenceValidateDetection).toHaveBeenCalledWith(
      'project-1',
      definition,
      undefined,
    );
    expect(caseIntelligenceCalibration).toHaveBeenCalledWith(
      'project-1',
      { definition },
      undefined,
    );
  });

  it('sends exact version, body and key and disables automatic auth replay for commands', async () => {
    vi.mocked(caseIntelligenceSaveDetectionDraft).mockResolvedValue({} as never);
    vi.mocked(caseIntelligencePublishDetection).mockResolvedValue({} as never);
    vi.mocked(caseIntelligenceSaveBudgetDraft).mockResolvedValue({} as never);
    const definition = createDefaultDetectionPolicy();
    const budget = createDefaultBudgetPolicy();

    await apiSupportCaseIntelligenceSource.saveDetectionDraft(
      'project-1',
      definition,
      7,
      'detection-key',
    );
    await apiSupportCaseIntelligenceSource.publishDetection(
      'project-1',
      'revision-8',
      8,
      'Проверено лидом',
      'publish-key',
    );
    await apiSupportCaseIntelligenceSource.saveBudgetDraft('project-1', budget, 4, 'budget-key');

    expect(caseIntelligenceSaveDetectionDraft).toHaveBeenCalledWith(
      'project-1',
      { definition, expectedVersion: 7, idempotencyKey: 'detection-key' },
      expect.objectContaining({ _noAuthRetry: true }),
    );
    expect(caseIntelligencePublishDetection).toHaveBeenCalledWith(
      'project-1',
      {
        revisionId: 'revision-8',
        expectedVersion: 8,
        reason: 'Проверено лидом',
        idempotencyKey: 'publish-key',
      },
      expect.objectContaining({ _noAuthRetry: true }),
    );
    expect(caseIntelligenceSaveBudgetDraft).toHaveBeenCalledWith(
      'project-1',
      { definition: budget, expectedVersion: 4, idempotencyKey: 'budget-key' },
      expect.objectContaining({ _noAuthRetry: true }),
    );
  });
});
