import { describe, expect, it } from 'vitest';
import { supportAnalyticsDrilldownTarget } from './support-analytics-drilldown';

describe('supportAnalyticsDrilldownTarget', () => {
  it('maps only server-authorized subject capabilities to local detail routes', () => {
    expect(
      supportAnalyticsDrilldownTarget({
        capability: 'SUPPORT_CASE_DETAIL',
        id: 'case-1',
        kind: 'CASE',
        occurredAt: '2026-08-12T10:00:00.000Z',
        state: 'OPEN',
      }),
    ).toEqual({ name: 'support-inbox-case', params: { caseId: 'case-1' } });
    expect(
      supportAnalyticsDrilldownTarget({
        capability: 'SUPPORT_QUALITY_REVIEW_DETAIL',
        id: 'review-1',
        kind: 'REVIEW',
        occurredAt: '2026-08-12T10:00:00.000Z',
        state: 'SUBMITTED',
      }),
    ).toEqual({
      name: 'support-quality-review',
      params: { reviewId: 'review-1' },
    });
  });
});
