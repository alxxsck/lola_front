import { describe, expect, it } from 'vitest';
import { supportQualitySource } from './support-quality-source';

describe('supportQualitySource', () => {
  it('offers bounded calibration candidates and a pinned review bootstrap', async () => {
    const candidates = await supportQualitySource.listCalibrationCandidates('project-1');
    expect(candidates.items[0]).toMatchObject({
      caseTitle: 'Задержка ответа по доставке',
      conversationTitle: 'Доставка заказа',
    });

    const bootstrap = await supportQualitySource.readCalibrationBootstrap(
      'project-1',
      'calibration-01',
    );
    expect(bootstrap.scorecard.sections[0]?.criteria[0]).toMatchObject({
      code: 'GREETING',
      label: 'Приветствие и тон',
    });
    expect(bootstrap.evidenceOptions[0]).toMatchObject({
      ordinal: 12,
      role: 'ADMIN',
    });
  });

  it('moves a claimed draft through save and submit with OCC versions', async () => {
    const tasks = await supportQualitySource.listTasks('project-1');
    const ready = tasks.items.find(({ state }) => state === 'READY')!;
    const claimed = await supportQualitySource.claimTask('project-1', ready);
    expect(claimed).toMatchObject({ state: 'CLAIMED', version: 2 });

    const draft = await supportQualitySource.readReview('project-1', 'review-001');
    const saved = await supportQualitySource.saveDraft('project-1', draft.id, draft.version, {
      summary: 'Конкретная обратная связь',
      scores: draft.scores.map((item) => ({
        itemCode: item.itemCode,
        applicable: item.applicable,
        score: item.score ?? undefined,
      })),
      evidence: draft.evidence.map((item) => ({
        messageId: item.messageId,
        rationale: item.rationale ?? undefined,
      })),
    });
    expect(saved.version).toBe(draft.version + 1);
    const submitted = await supportQualitySource.submit('project-1', draft.id, saved.version);
    expect(submitted).toMatchObject({
      state: 'SUBMITTED',
      version: saved.version + 1,
    });
  });

  it('keeps disputes separate from the immutable submitted score', async () => {
    const before = await supportQualitySource.readReview('project-1', 'review-002');
    const dispute = await supportQualitySource.dispute(
      'project-1',
      before.id,
      before.version,
      'Нужно пересмотреть критерий точности',
    );
    const after = await supportQualitySource.readReview('project-1', before.id);
    expect(dispute.state).toBe('OPEN');
    expect(after.totalScore).toBe(before.totalScore);
    expect(after.disputes).toContainEqual(dispute);
  });

  it('creates an independent calibration draft without exposing a peer review', async () => {
    const before = await supportQualitySource.readCalibration('project-1', 'calibration-01');
    expect(before.participants).toContainEqual({
      reviewerCmsUserId: 'cms_1',
      state: 'INVITED',
      reviewId: null,
    });
    expect(before.participants).toContainEqual({
      reviewerCmsUserId: 'reviewer-second',
      state: 'SUBMITTED',
      reviewId: null,
    });

    const created = await supportQualitySource.createCalibrationReview(
      'project-1',
      'calibration-01',
      {
        scores: [
          { itemCode: 'GREETING', applicable: true, score: 4 },
          { itemCode: 'CLARITY', applicable: true, score: 8 },
          { itemCode: 'ACCURACY', applicable: true, score: 9 },
        ],
        evidence: [{ messageId: 'message-calibration', rationale: 'Ответ для независимой оценки' }],
      },
    );

    expect(created).toMatchObject({ kind: 'CALIBRATION', state: 'DRAFT' });
    const ownDraft = await supportQualitySource.readReview('project-1', created.id);
    expect(ownDraft.scores.map(({ score }) => score)).toEqual([4, 8, 9]);
    const after = await supportQualitySource.readCalibration('project-1', 'calibration-01');
    expect(after.participants[0]).toMatchObject({
      reviewerCmsUserId: 'cms_1',
      state: 'DRAFT',
      reviewId: created.id,
    });
    expect(after.peerReviewsVisible).toBe(false);
    expect(after.baselineReviewId).toBeNull();
  });
});
