import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api/http/api-error';
import {
  supportQualityCreateCalibrationReview,
  supportQualityDisputeList,
  supportQualityOpenDispute,
  supportQualityReviewBootstrap,
  supportQualityReviewEvidenceExcerpt,
  supportQualityTaskClaim,
  supportQualityTaskRelease,
  supportQualityVoidReview,
} from '@/shared/api/generated/retenive-backend';
import { supportQualityApiSource } from './support-quality-source';

vi.mock('@/shared/api/generated/retenive-backend', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/api/generated/retenive-backend')>()),
  supportQualityCreateCalibrationReview: vi.fn(),
  supportQualityTaskClaim: vi.fn(),
  supportQualityOpenDispute: vi.fn(),
  supportQualityReviewBootstrap: vi.fn(),
  supportQualityReviewEvidenceExcerpt: vi.fn(),
  supportQualityDisputeList: vi.fn(),
  supportQualityTaskRelease: vi.fn(),
  supportQualityVoidReview: vi.fn(),
}));

describe('supportQualityApiSource', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retains stable idempotency and OCC headers for exact task replay', async () => {
    const task = {
      id: 'task-1',
      projectId: 'project-1',
      caseId: 'case-1',
      conversationId: 'conversation-1',
      operatorCmsUserId: 'operator-1',
      assignedReviewerCmsUserId: null,
      scorecardRevisionId: 'scorecard-r1',
      scorecardId: 'scorecard-1',
      scorecardRevisionNumber: 1,
      defaultEvidenceMessageId: 'message-1',
      defaultScores: [{ itemCode: 'EMPATHY', applicable: true }],
      samplingPolicyRevisionId: 'policy-r1',
      populationReceiptId: 'population-1',
      selectionReasonCode: 'RANDOM_SAMPLE',
      state: 'READY' as const,
      version: 4,
    };
    vi.mocked(supportQualityTaskClaim)
      .mockRejectedValueOnce(new ApiError(503, 'Ответ неизвестен'))
      .mockResolvedValueOnce(task)
      .mockResolvedValueOnce(task);
    await expect(supportQualityApiSource.claimTask('project-1', task)).rejects.toBeInstanceOf(
      ApiError,
    );
    await supportQualityApiSource.claimTask('project-1', task);
    await supportQualityApiSource.claimTask('project-1', task);

    const first = vi.mocked(supportQualityTaskClaim).mock.calls[0]![2]!;
    const second = vi.mocked(supportQualityTaskClaim).mock.calls[1]![2]!;
    expect(first.headers).toMatchObject({ 'If-Match': '"4"' });
    expect(first.headers?.['Idempotency-Key']).toBe(second.headers?.['Idempotency-Key']);
    const third = vi.mocked(supportQualityTaskClaim).mock.calls[2]![2]!;
    expect(third.headers?.['Idempotency-Key']).not.toBe(second.headers?.['Idempotency-Key']);
  });

  it('sends review OCC on dispute admission', async () => {
    vi.mocked(supportQualityOpenDispute).mockResolvedValue({
      id: 'dispute-1',
      reviewId: 'review-1',
      openedByCmsUserId: 'operator-1',
      reason: 'Проверить критерий',
      state: 'OPEN',
      version: 1,
      resolutionNote: null,
    });
    await supportQualityApiSource.dispute('project-1', 'review-1', 7, 'Проверить критерий');
    expect(vi.mocked(supportQualityOpenDispute).mock.calls[0]![3]?.headers).toMatchObject({
      'If-Match': '"7"',
    });
  });

  it('reads a dispute page directly instead of expanding every review', async () => {
    vi.mocked(supportQualityDisputeList).mockResolvedValue({
      items: [
        {
          id: 'dispute-1',
          reviewId: 'review-1',
          operatorCmsUserId: 'operator-1',
          openedByCmsUserId: 'operator-1',
          reason: 'Проверить ясность ответа',
          resolutionNote: null,
          state: 'OPEN',
          version: 1,
          updatedAt: '2026-08-12T12:00:00.000Z',
        },
      ],
      nextCursor: 'next-page',
    });

    const page = await supportQualityApiSource.listDisputes('project-1', {
      state: 'OPEN',
      cursor: 'cursor-1',
      from: '2026-08-01',
    });

    expect(page.nextCursor).toBe('next-page');
    expect(supportQualityDisputeList).toHaveBeenCalledOnce();
    expect(supportQualityDisputeList).toHaveBeenCalledWith(
      'project-1',
      { state: 'OPEN', limit: 50, cursor: 'cursor-1', from: '2026-08-01' },
      undefined,
    );
  });

  it('uses generated bounded bootstrap and evidence operations', async () => {
    const controller = new AbortController();
    vi.mocked(supportQualityReviewBootstrap).mockResolvedValue({
      review: { id: 'review-1' },
    } as never);
    vi.mocked(supportQualityReviewEvidenceExcerpt).mockResolvedValue({
      messageId: 'message-1',
      excerpt: 'Фрагмент закреплённой версии',
    } as never);

    await supportQualityApiSource.readReviewBootstrap('project-1', 'review-1', controller.signal);
    await supportQualityApiSource.readEvidenceExcerpt(
      'project-1',
      'review-1',
      'message-1',
      controller.signal,
    );

    expect(supportQualityReviewBootstrap).toHaveBeenCalledWith('project-1', 'review-1', {
      signal: controller.signal,
    });
    expect(supportQualityReviewEvidenceExcerpt).toHaveBeenCalledWith(
      'project-1',
      'review-1',
      'message-1',
      { signal: controller.signal },
    );
  });

  it('uses OCC for release and void lifecycle commands', async () => {
    const task = {
      id: 'task-1',
      version: 3,
      state: 'CLAIMED',
    } as never;
    vi.mocked(supportQualityTaskRelease).mockResolvedValue(task);
    vi.mocked(supportQualityVoidReview).mockResolvedValue({
      id: 'review-1',
      state: 'VOID',
      version: 6,
    } as never);

    await supportQualityApiSource.releaseTask('project-1', task);
    await supportQualityApiSource.voidReview('project-1', 'review-1', 5, 'Дубликат оценки');

    expect(supportQualityTaskRelease).toHaveBeenCalledWith(
      'project-1',
      'task-1',
      expect.objectContaining({ headers: expect.objectContaining({ 'If-Match': '"3"' }) }),
    );
    expect(supportQualityVoidReview).toHaveBeenCalledWith(
      'project-1',
      'review-1',
      { reason: 'Дубликат оценки' },
      expect.objectContaining({ headers: expect.objectContaining({ 'If-Match': '"5"' }) }),
    );
  });

  it('retains the calibration review idempotency key only after an ambiguous outcome', async () => {
    const input = {
      scores: [
        { itemCode: 'EMPATHY', applicable: true, score: 5 },
        { itemCode: 'ACCURACY', applicable: true, score: 4 },
      ],
      evidence: [{ messageId: 'message-1', rationale: 'Ключевой ответ' }],
    };
    const created = {
      id: 'review-calibration-1',
      kind: 'CALIBRATION',
      state: 'DRAFT',
      version: 1,
    } as never;
    vi.mocked(supportQualityCreateCalibrationReview)
      .mockRejectedValueOnce(new ApiError(503, 'Ответ неизвестен'))
      .mockResolvedValueOnce(created)
      .mockResolvedValueOnce(created);

    await expect(
      supportQualityApiSource.createCalibrationReview('project-1', 'calibration-1', input),
    ).rejects.toBeInstanceOf(ApiError);
    await supportQualityApiSource.createCalibrationReview('project-1', 'calibration-1', input);
    await supportQualityApiSource.createCalibrationReview('project-1', 'calibration-1', input);

    const calls = vi.mocked(supportQualityCreateCalibrationReview).mock.calls;
    expect(calls[0]?.slice(0, 3)).toEqual(['project-1', 'calibration-1', input]);
    expect(calls[0]?.[3]?.headers?.['Idempotency-Key']).toBe(
      calls[1]?.[3]?.headers?.['Idempotency-Key'],
    );
    expect(calls[2]?.[3]?.headers?.['Idempotency-Key']).not.toBe(
      calls[1]?.[3]?.headers?.['Idempotency-Key'],
    );
    expect(calls[0]?.[3]?.headers).not.toHaveProperty('If-Match');
  });
});
