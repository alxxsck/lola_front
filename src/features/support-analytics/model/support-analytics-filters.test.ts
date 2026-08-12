import { describe, expect, it } from 'vitest';
import {
  compatibleSupportAnalyticsFilters,
  parseSupportAnalyticsFilterValue,
} from './support-analytics-filters';

describe('support analytics filters', () => {
  it('normalizes duplicate comma values into one bounded canonical set', () => {
    expect(parseSupportAnalyticsFilterValue(' team-a, team-b,team-a, ')).toEqual([
      'team-a',
      'team-b',
    ]);
  });

  it('sends only dimensions explicitly compatible with the selected metric', () => {
    const filters = compatibleSupportAnalyticsFilters(
      {
        datasetCode: 'SUPPORT_QUALITY',
        datasetRevisionId: 'revision',
        revision: 1,
        semanticDigest: 'a'.repeat(64),
        name: 'Качество',
        readiness: { status: 'READY', missingSourceFamilies: [] },
        dimensions: [
          { code: 'TEAM', source: 'FACT' },
          { code: 'QUALITY_ITEM', source: 'FACT' },
          { code: 'LOCALE', source: 'FACT' },
        ],
        metrics: [],
      },
      {
        code: 'quality_review_count',
        operation: 'COUNT',
        minimumSample: 5,
        valueKind: 'INTEGER',
        exactness: 'EXACT',
        classification: 'AGGREGATE',
        compatibleDimensions: ['TEAM', 'LOCALE'],
        requiredPermissionCodes: [],
      },
      {
        TEAM: ['team-a', 'team-b'],
        QUALITY_ITEM: ['clarity'],
        LOCALE: ['ru-RU'],
      },
    );
    expect(filters).toEqual([
      { dimension: 'TEAM', operator: 'IN', value: ['team-a', 'team-b'] },
      { dimension: 'LOCALE', operator: 'EQUALS', value: 'ru-RU' },
    ]);
  });
});
