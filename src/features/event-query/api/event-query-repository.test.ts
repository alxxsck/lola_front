import { beforeEach, describe, expect, it, vi } from 'vitest';
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
} from '@/shared/api/generated/retenive-backend';
import { eventQueryRepository } from './event-query-repository';

vi.mock('@/shared/api/generated/retenive-backend', () => ({
  caseVerificationEstimate: vi.fn(),
  caseVerificationGet: vi.fn(),
  caseVerificationStart: vi.fn(),
  eventQueryPolicyApplyItem: vi.fn(),
  eventQueryPolicyApplyProject: vi.fn(),
  eventQueryPolicyGet: vi.fn(),
  eventQueryPolicyGetItem: vi.fn(),
  eventQueryPolicyListItems: vi.fn(),
  eventQueryPolicyListRequests: vi.fn(),
  eventQueryPolicyPreview: vi.fn(),
}));

describe('event query repository', () => {
  beforeEach(() => vi.clearAllMocks());

  it('delegates atomic Project apply to the generated operation', async () => {
    vi.mocked(eventQueryPolicyGet).mockResolvedValue({} as never);
    vi.mocked(eventQueryPolicyApplyProject).mockResolvedValue({} as never);

    await eventQueryRepository.getPolicy('project-1');
    await eventQueryRepository.applyProject('project-1', {
      concurrencyToken: 'eq-project-v1.token',
      masterEnabled: true,
    });

    expect(eventQueryPolicyGet).toHaveBeenCalledWith('project-1');
    expect(eventQueryPolicyApplyProject).toHaveBeenCalledWith('project-1', {
      concurrencyToken: 'eq-project-v1.token',
      masterEnabled: true,
    });
  });

  it('delegates atomic per-Event apply and catalog reads', async () => {
    vi.mocked(eventQueryPolicyListItems).mockResolvedValue({} as never);
    vi.mocked(eventQueryPolicyGetItem).mockResolvedValue({} as never);
    vi.mocked(eventQueryPolicyApplyItem).mockResolvedValue({} as never);
    vi.mocked(eventQueryPolicyListRequests).mockResolvedValue({} as never);

    await eventQueryRepository.listItems('project-1', {
      audience: 'INTERNAL_AI',
      effective: true,
    });
    await eventQueryRepository.getItem('project-1', 'definition-1');
    await eventQueryRepository.applyItem('project-1', 'definition-1', {
      concurrencyToken: 'eq-item-v1.token',
      enabled: true,
      endUserConversationEnabled: false,
      descriptionForAI: 'Депозит',
      allowedModes: ['SUMMARY'],
      safeFields: [],
      maxInteractiveLookbackHours: 168,
      maxVerificationLookbackHours: 720,
    });
    await eventQueryRepository.listRequests('project-1', {
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-31T00:00:00.000Z',
      endUserId: 'user-1',
    });

    expect(eventQueryPolicyListItems).toHaveBeenCalledWith('project-1', {
      audience: 'INTERNAL_AI',
      effective: true,
    });
    expect(eventQueryPolicyApplyItem).toHaveBeenCalledWith(
      'project-1',
      'definition-1',
      expect.objectContaining({
        concurrencyToken: 'eq-item-v1.token',
        enabled: true,
        endUserConversationEnabled: false,
      }),
    );
  });

  it('keeps trusted case scope in route parameters and sends a fresh idempotency key in the body', async () => {
    const input = {
      idempotencyKey: '00000000-0000-4000-8000-000000000001',
      queries: [
        {
          key: 'goal',
          query: {
            eventCodes: ['deposit.completed'],
            mode: 'SUMMARY' as const,
            timeRange: { kind: 'LAST_24_HOURS' as const },
          },
        },
      ],
      predicate: { operator: 'EVENT_EXISTS' as const, queryKey: 'goal' },
    };
    vi.mocked(caseVerificationStart).mockResolvedValue({
      id: 'run-1',
    } as never);

    await eventQueryRepository.startCaseVerification('project-1', 'case-1', input);

    expect(caseVerificationStart).toHaveBeenCalledWith('project-1', 'case-1', input);
    expect(JSON.stringify(input)).not.toContain('endUserId');
    expect(JSON.stringify(input)).not.toContain('projectId');
  });

  it('uses typed generated operations for preview, estimate and run reads', async () => {
    vi.mocked(eventQueryPolicyPreview).mockResolvedValue({
      status: 'OK',
    } as never);
    vi.mocked(caseVerificationEstimate).mockResolvedValue({
      complete: true,
    } as never);
    vi.mocked(caseVerificationGet).mockResolvedValue({ id: 'run-1' } as never);

    const preview = {
      endUserId: '00000000-0000-4000-8000-000000000001',
      query: {
        eventCodes: ['game.started'],
        mode: 'LATEST' as const,
        timeRange: { kind: 'LAST_7_DAYS' as const },
      },
    };
    await eventQueryRepository.preview('project-1', preview);
    await eventQueryRepository.estimateCaseVerification('project-1', 'case-1', {
      queries: [],
      predicate: {},
    } as never);
    await eventQueryRepository.getCaseVerification('project-1', 'case-1', 'run-1');

    expect(eventQueryPolicyPreview).toHaveBeenCalledWith('project-1', preview);
    expect(caseVerificationEstimate).toHaveBeenCalledWith(
      'project-1',
      'case-1',
      expect.any(Object),
    );
    expect(caseVerificationGet).toHaveBeenCalledWith('project-1', 'case-1', 'run-1');
  });
});
