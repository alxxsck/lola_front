import { describe, expect, it } from 'vitest';
import type { ReportingCatalogDatasetDto } from '@/shared/api/generated/models';
import { CURATED_SUPPORT_VIEWS, resolveCuratedWidgets } from './support-analytics-curation';

const dataset = (datasetCode: string, metricCodes: string[]): ReportingCatalogDatasetDto => ({
  datasetCode,
  datasetRevisionId: `${datasetCode}-revision`,
  revision: 1,
  name: datasetCode,
  semanticDigest: 'a'.repeat(64),
  readiness: {
    status: 'READY' as const,
    coverageFrom: '2026-01-01T00:00:00.000Z',
    coverageUntil: '2026-08-12T00:00:00.000Z',
    dataAsOf: '2026-08-12T00:00:00.000Z',
    projectionLagMs: 1000,
    missingSourceFamilies: [],
  },
  dimensions: [{ code: 'OCCURRED_DAY', source: datasetCode }],
  metrics: metricCodes.map((code) => ({
    code,
    operation: 'SUM',
    classification: 'AGGREGATE' as const,
    exactness: 'EXACT' as const,
    minimumSample: 1,
    requiredPermissionCodes: [],
    compatibleDimensions: ['OCCURRED_DAY'],
    valueKind: 'COUNT',
  })),
});

describe('Support analytics curation', () => {
  it('keeps every route focused and below the visible-widget ceiling', () => {
    for (const view of Object.values(CURATED_SUPPORT_VIEWS)) {
      expect(view.question).toMatch(/[А-Яа-я]/);
      expect(view.widgets.length).toBeGreaterThanOrEqual(4);
      expect(view.widgets.length).toBeLessThanOrEqual(8);
      expect(new Set(view.widgets.map(({ id }) => id))).toHaveLength(view.widgets.length);
    }
  });

  it('resolves only ready, permitted metrics and keeps unavailable cards honest', () => {
    const catalog = [
      dataset('SUPPORT_CASE', ['case_event_count']),
      dataset('SUPPORT_QUALITY', ['quality_review_count']),
    ];
    catalog[1]!.metrics[0]!.requiredPermissionCodes = ['project.reporting.sensitive.read'];

    const widgets = resolveCuratedWidgets(catalog, 'overview', []);

    expect(widgets.find(({ id }) => id === 'received')?.state).toBe('READY');
    expect(widgets.find(({ id }) => id === 'verified')?.state).toBe('FORBIDDEN');
    expect(widgets.find(({ id }) => id === 'assigned')?.state).toBe('UNAVAILABLE');
  });
});
