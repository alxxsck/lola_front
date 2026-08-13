import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axiosInstance } from '@/shared/api/http/axios-instance';
vi.mock('@/shared/api/http/axios-instance', () => ({
  axiosInstance: { get: vi.fn(), put: vi.fn() },
}));
import { aiAllowanceAccrualRepository } from './ai-allowance-accrual-repository';
describe('aiAllowanceAccrualRepository', () => {
  beforeEach(() => vi.clearAllMocks());
  it('keeps rule revisions exact and sends an idempotent revision mutation', async () => {
    vi.mocked(axiosInstance.get).mockResolvedValue({
      data: {
        items: [
          {
            id: 'rule-1',
            key: 'DEPOSIT',
            name: 'Deposit reward',
            lifecycle: 'ACTIVE',
            createdAt: '2026-08-01T00:00:00.000Z',
            updatedAt: '2026-08-01T00:00:00.000Z',
            revisions: [
              {
                id: 'revision-1',
                revisionNumber: 1,
                name: 'Deposit reward',
                lifecycle: 'ACTIVE',
                eventDefinitionKeyId: '11111111-1111-4111-8111-111111111111',
                allowedSources: ['INTEGRATION'],
                timezone: 'Europe/Madrid',
                rewardUsd: '1.000000000001',
                perEndUserDailyCapUsd: '3.000000000000',
                projectDailyCapUsd: '100.000000000000',
                grantTtlSeconds: 86400,
                cooldownSeconds: 300,
                effectiveFrom: '2026-08-01T00:00:00.000Z',
                effectiveUntil: null,
                configurationDigest: 'a'.repeat(64),
                changeReason: 'Create reward',
                createdByActorType: 'CMS_USER',
                createdByActorId: 'admin-1',
                createdAt: '2026-08-01T00:00:00.000Z',
                eventDefinitionKey: {
                  code: 'deposit.completed',
                  name: 'Deposit',
                  lifecycle: 'ACTIVE',
                },
                eventRevisionBindings: [
                  {
                    eventDefinitionRevisionId: '22222222-2222-4222-8222-222222222222',
                    eventDefinitionRevision: { version: 2 },
                  },
                ],
              },
            ],
          },
        ],
        pageInfo: { hasMore: false, nextCursor: null },
        revisionHistoryLimit: 20,
      },
    });
    vi.mocked(axiosInstance.put).mockResolvedValue({
      data: { replayed: false },
    });
    const result = await aiAllowanceAccrualRepository.listRules('project-1');
    expect(result.items[0]?.revisions[0]?.rewardUsd).toBe('1.000000000001');
    const revision = result.items[0]!.revisions[0]!;
    const input = {
      name: 'Deposit reward',
      lifecycle: 'PAUSED' as const,
      eventDefinitionKeyId: revision.eventDefinitionKeyId,
      eventDefinitionRevisionIds: revision.eventRevisionBindings.map(
        (binding) => binding.eventDefinitionRevisionId,
      ),
      allowedSources: revision.allowedSources,
      timezone: revision.timezone,
      rewardUsd: revision.rewardUsd,
      perEndUserDailyCapUsd: revision.perEndUserDailyCapUsd,
      projectDailyCapUsd: revision.projectDailyCapUsd,
      grantTtlSeconds: revision.grantTtlSeconds,
      cooldownSeconds: revision.cooldownSeconds,
      effectiveFrom: revision.effectiveFrom,
      reason: 'Pause reward safely',
    };
    await aiAllowanceAccrualRepository.putRule('project-1', 'DEPOSIT', input, 'rule-idem');
    expect(axiosInstance.put).toHaveBeenCalledWith(
      '/api/v1/admin/projects/project-1/ai-allowance/accrual-rules/DEPOSIT',
      input,
      { headers: { 'Idempotency-Key': 'rule-idem' } },
    );
  });

  it('loads a filtered receipt cursor page with exact reward and provenance', async () => {
    vi.mocked(axiosInstance.get).mockResolvedValue({
      data: {
        items: [
          {
            id: '33333333-3333-4333-8333-333333333333',
            endUserId: '44444444-4444-4444-8444-444444444444',
            status: 'GRANTED',
            rejectionReason: null,
            rewardUsd: '1.000000000001',
            evaluatedAt: '2026-08-02T10:00:03.000Z',
            occurredAt: '2026-08-02T10:00:00.000Z',
            grantId: '55555555-5555-4555-8555-555555555555',
            ruleRevision: {
              revisionNumber: 3,
              rule: { key: 'DEPOSIT', name: 'Deposit reward' },
            },
            eventLog: {
              id: '66666666-6666-4666-8666-666666666666',
              source: 'INTEGRATION',
              occurredAt: '2026-08-02T10:00:00.000Z',
              eventDefinitionKey: {
                code: 'deposit.completed',
                name: 'Deposit',
              },
            },
          },
        ],
        pageInfo: {
          hasMore: true,
          nextCursor: '33333333-3333-4333-8333-333333333333',
        },
      },
    });

    const result = await aiAllowanceAccrualRepository.listReceipts('project-1', {
      limit: 50,
      endUserId: '44444444-4444-4444-8444-444444444444',
      status: 'GRANTED',
    });

    expect(result.items[0]).toMatchObject({
      rewardUsd: '1.000000000001',
      grantId: '55555555-5555-4555-8555-555555555555',
      eventLog: { source: 'INTEGRATION' },
    });
    expect(axiosInstance.get).toHaveBeenCalledWith(
      '/api/v1/admin/projects/project-1/ai-allowance/accrual-receipts',
      {
        params: {
          limit: 50,
          endUserId: '44444444-4444-4444-8444-444444444444',
          status: 'GRANTED',
        },
      },
    );
  });
});
