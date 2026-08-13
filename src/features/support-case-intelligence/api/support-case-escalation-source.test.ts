import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  caseIntelligenceCompileEscalation,
  caseIntelligenceCurrent,
  caseIntelligenceDiscardEscalationDraft,
  caseIntelligenceDryRunEscalation,
  caseIntelligenceProjectSafetyPolicy,
  caseIntelligencePublishEscalation,
  caseIntelligenceSaveEscalationDraft,
} from '@/shared/api/generated/retenive-backend';
import {
  createDefaultEscalationPolicy,
  createSimulationStep,
  cloneEscalation,
} from '../model/support-case-escalation-policy';
import {
  apiSupportCaseEscalationSource,
  mockSupportCaseEscalationSource,
} from './support-case-escalation-source';

vi.mock('@/shared/api/generated/retenive-backend', () => ({
  caseIntelligenceCompileEscalation: vi.fn(),
  caseIntelligenceCurrent: vi.fn(),
  caseIntelligenceDiscardEscalationDraft: vi.fn(),
  caseIntelligenceDryRunEscalation: vi.fn(),
  caseIntelligenceLookupCommand: vi.fn(),
  caseIntelligenceProjectSafetyPolicy: vi.fn(),
  caseIntelligencePublishEscalation: vi.fn(),
  caseIntelligenceSaveEscalationDraft: vi.fn(),
}));

describe('apiSupportCaseEscalationSource', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses generated read, locked Safety and non-dispatching dry-run operations', async () => {
    vi.mocked(caseIntelligenceCurrent).mockResolvedValue({
      allowedActions: [],
      safety: {
        state: 'READY',
        authority: 'PLATFORM',
        assistantReleaseGate: 'ALLOW',
        projectOverrideAllowed: false,
      },
    } as never);
    vi.mocked(caseIntelligenceProjectSafetyPolicy).mockResolvedValue({
      revisionId: 'safety-v4',
      authority: 'PLATFORM',
      projectOverrideAllowed: false,
      locales: ['ru-RU'],
      channels: ['TEXT'],
      classes: [],
    } as never);
    vi.mocked(caseIntelligenceCompileEscalation).mockResolvedValue({
      compiledPolicyHash: 'a'.repeat(64),
    } as never);
    vi.mocked(caseIntelligenceDryRunEscalation).mockResolvedValue({
      executionMode: 'NON_DISPATCHING',
      steps: [],
    } as never);
    const definition = createDefaultEscalationPolicy();
    const steps = [createSimulationStep('EXPLICIT_HUMAN_REQUEST', 0)];

    await apiSupportCaseEscalationSource.read('project-1');
    await apiSupportCaseEscalationSource.readSafety('project-1');
    await apiSupportCaseEscalationSource.compile('project-1', definition);
    await apiSupportCaseEscalationSource.dryRun('project-1', definition, steps);

    expect(caseIntelligenceProjectSafetyPolicy).toHaveBeenCalledWith('project-1', undefined);
    expect(caseIntelligenceCompileEscalation).toHaveBeenCalledWith(
      'project-1',
      definition,
      undefined,
    );
    expect(caseIntelligenceDryRunEscalation).toHaveBeenCalledWith(
      'project-1',
      { definition, steps },
      undefined,
    );
  });

  it('sends exact version, idempotency key and disables automatic auth replay', async () => {
    vi.mocked(caseIntelligenceSaveEscalationDraft).mockResolvedValue({} as never);
    vi.mocked(caseIntelligenceDiscardEscalationDraft).mockResolvedValue({} as never);
    vi.mocked(caseIntelligencePublishEscalation).mockResolvedValue({} as never);
    const definition = createDefaultEscalationPolicy();

    await apiSupportCaseEscalationSource.saveDraft('project-1', definition, 4, 'save-key');
    await apiSupportCaseEscalationSource.discardDraft(
      'project-1',
      5,
      'Исправляем правила',
      'discard-key',
    );
    await apiSupportCaseEscalationSource.publish(
      'project-1',
      'revision-6',
      6,
      'Проверено лидом',
      'publish-key',
    );

    expect(caseIntelligenceSaveEscalationDraft).toHaveBeenCalledWith(
      'project-1',
      { definition, expectedVersion: 4, idempotencyKey: 'save-key' },
      expect.objectContaining({ _noAuthRetry: true }),
    );
    expect(caseIntelligenceDiscardEscalationDraft).toHaveBeenCalledWith(
      'project-1',
      {
        expectedVersion: 5,
        reason: 'Исправляем правила',
        idempotencyKey: 'discard-key',
      },
      expect.objectContaining({ _noAuthRetry: true }),
    );
    expect(caseIntelligencePublishEscalation).toHaveBeenCalledWith(
      'project-1',
      {
        revisionId: 'revision-6',
        expectedVersion: 6,
        reason: 'Проверено лидом',
        idempotencyKey: 'publish-key',
      },
      expect.objectContaining({ _noAuthRetry: true }),
    );
  });

  it('mirrors attempt and outcome conflict semantics in the mock simulator', async () => {
    const definition = createDefaultEscalationPolicy();
    const first = createSimulationStep('NO_MATCH', 0);
    const changedOutcome = cloneEscalation(first);
    changedOutcome.stepId = 'STEP_2';
    changedOutcome.outcomeId = crypto.randomUUID();
    const reusedOutcome = cloneEscalation(first);
    reusedOutcome.stepId = 'STEP_3';
    reusedOutcome.attemptId = crypto.randomUUID();

    const attemptConflict = await mockSupportCaseEscalationSource.dryRun('project-1', definition, [
      first,
      changedOutcome,
    ]);
    const outcomeConflict = await mockSupportCaseEscalationSource.dryRun('project-1', definition, [
      first,
      reusedOutcome,
    ]);

    expect(attemptConflict.steps[1]).toMatchObject({
      disposition: 'CONFLICT',
      action: 'NONE',
      reasonCode: 'CASE_INTELLIGENCE_SIMULATION_IDEMPOTENCY_CONFLICT',
      replayOfStep: 0,
    });
    expect(outcomeConflict.steps[1]).toMatchObject({
      disposition: 'CONFLICT',
      action: 'NONE',
      reasonCode: 'CASE_INTELLIGENCE_SIMULATION_OUTCOME_CONFLICT',
      replayOfStep: 0,
    });
  });

  it('mirrors pending, failed and class-specific Safety consequences', async () => {
    const definition = createDefaultEscalationPolicy();
    const pending = createSimulationStep('NO_MATCH', 0);
    pending.safetyState = 'PENDING';
    const failed = createSimulationStep('NO_MATCH', 1);
    failed.safetyState = 'FAILED';
    const responsibleGaming = createSimulationStep('NO_MATCH', 2);
    responsibleGaming.safetyState = 'URGENT';
    responsibleGaming.safetyRiskClass = 'RESPONSIBLE_GAMING_CRISIS';

    const [pendingResult, failedResult, responsibleGamingResult] = await Promise.all(
      [pending, failed, responsibleGaming].map((step) =>
        mockSupportCaseEscalationSource.dryRun('project-1', definition, [step]),
      ),
    );
    const result = {
      steps: [pendingResult.steps[0], failedResult.steps[0], responsibleGamingResult.steps[0]],
    };

    expect(result.steps[0]).toMatchObject({
      safety: {
        consequences: [],
        retryScheduled: true,
        operationalAlertRequired: false,
      },
      effects: ['SAFETY_RETRY_SCHEDULED'],
    });
    expect(result.steps[1]).toMatchObject({
      safety: {
        consequences: [],
        retryScheduled: true,
        operationalAlertRequired: true,
      },
      effects: ['SAFETY_RETRY_SCHEDULED', 'SAFETY_OPERATIONAL_ALERT'],
    });
    expect(result.steps[2]).toMatchObject({
      action: 'ESCALATE',
      reasonCode: 'CASE_INTELLIGENCE_SAFETY_CASE_ESCALATION',
      ordinaryReasonCode: 'CASE_INTELLIGENCE_NO_MATCH_RECORDED',
      after: { status: 'ESCALATED' },
      routingAdmission: 'ROUTABLE',
      safety: {
        severity: 'HIGH',
        consequences: ['SAFE_RESPONSE', 'SAFETY_OCCURRENCE', 'CASE_ESCALATION'],
        retryScheduled: false,
        operationalAlertRequired: false,
      },
    });
    expect(result.steps[2].effects).toContain('STATE_ESCALATED');
    expect(result.steps[2].effects).not.toContain('SAFETY_OPERATIONAL_ALERT');
  });

  it('rejects a simulator reference removed from the current definition', async () => {
    const definition = createDefaultEscalationPolicy();
    const step = createSimulationStep('EXPLICIT_HUMAN_REQUEST', 0);
    step.ruleCode = 'REMOVED_RULE';

    await expect(
      mockSupportCaseEscalationSource.dryRun('project-1', definition, [step]),
    ).rejects.toMatchObject({
      status: 400,
      code: 'CASE_INTELLIGENCE_SIMULATION_STEP_SHAPE_INVALID',
    });
  });

  it('enforces offer deadlines before accept, decline and timeout', async () => {
    const definition = createDefaultEscalationPolicy();
    definition.ambiguousHumanTermRules = [
      {
        code: 'HUMAN_TERM_RU',
        locales: ['ru-RU'],
        phrases: ['оператор'],
        action: 'OFFER',
      },
    ];
    const steps = (
      responseKind: 'OFFER_ACCEPTED' | 'OFFER_DECLINED' | 'OFFER_TIMEOUT',
      delayMinutes: number,
    ) => {
      const offer = createSimulationStep('AMBIGUOUS_HUMAN_TERM', 0);
      offer.ruleCode = 'HUMAN_TERM_RU';
      const response = createSimulationStep(responseKind, 1);
      response.observedAt = new Date(
        new Date(offer.observedAt).getTime() + delayMinutes * 60_000,
      ).toISOString();
      return [offer, response];
    };

    const earlyTimeout = await mockSupportCaseEscalationSource.dryRun(
      'project-1',
      definition,
      steps('OFFER_TIMEOUT', 1),
    );
    const dueTimeout = await mockSupportCaseEscalationSource.dryRun(
      'project-1',
      definition,
      steps('OFFER_TIMEOUT', 6),
    );
    const expiredAccept = await mockSupportCaseEscalationSource.dryRun(
      'project-1',
      definition,
      steps('OFFER_ACCEPTED', 6),
    );
    const cooldownSteps = steps('OFFER_DECLINED', 1);
    const nextOffer = createSimulationStep('AMBIGUOUS_HUMAN_TERM', 2);
    nextOffer.ruleCode = 'HUMAN_TERM_RU';
    nextOffer.observedAt = new Date(
      new Date(cooldownSteps[0].observedAt).getTime() + 17 * 60_000,
    ).toISOString();
    const afterCooldown = await mockSupportCaseEscalationSource.dryRun('project-1', definition, [
      ...cooldownSteps,
      nextOffer,
    ]);
    const reverseTime = steps('OFFER_DECLINED', 1);
    reverseTime[1].observedAt = new Date(
      new Date(reverseTime[0].observedAt).getTime() - 60_000,
    ).toISOString();
    const nonMonotonic = await mockSupportCaseEscalationSource.dryRun(
      'project-1',
      definition,
      reverseTime,
    );

    expect(earlyTimeout.steps[1]).toMatchObject({
      disposition: 'BLOCKED',
      reasonCode: 'CASE_INTELLIGENCE_ESCALATION_OFFER_TIMEOUT_NOT_DUE',
      after: { status: 'OFFERED' },
    });
    expect(dueTimeout.steps[1]).toMatchObject({
      disposition: 'APPLIED',
      reasonCode: 'CASE_INTELLIGENCE_OFFER_TIMEOUT',
      after: { status: 'COOLDOWN' },
    });
    expect(expiredAccept.steps[1]).toMatchObject({
      disposition: 'BLOCKED',
      reasonCode: 'CASE_INTELLIGENCE_ESCALATION_OFFER_EXPIRED',
      after: { status: 'OFFERED' },
    });
    expect(afterCooldown.steps[2]).toMatchObject({
      before: { status: 'OPEN' },
      after: { status: 'OFFERED' },
      disposition: 'APPLIED',
    });
    expect(nonMonotonic.steps[1]).toMatchObject({
      disposition: 'BLOCKED',
      reasonCode: 'CASE_INTELLIGENCE_SIMULATION_TIME_NOT_MONOTONIC',
      before: { status: 'OFFERED' },
      after: { status: 'OFFERED' },
      effects: [],
    });
  });
});
