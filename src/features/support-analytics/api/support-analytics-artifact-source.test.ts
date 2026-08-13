import { describe, expect, it } from 'vitest';
import type { ReportingQueryDefinitionDto } from '@/shared/api/generated/models';
import { supportAnalyticsArtifactSource } from './support-analytics-artifact-source';

const query: ReportingQueryDefinitionDto = {
  version: 1,
  datasetRevisionId: 'support-quality-r1',
  metrics: ['quality_score_average'],
  groupBy: ['OCCURRED_DAY'],
  filters: [],
  range: {
    from: '2026-08-01',
    until: '2026-08-08',
    grain: 'DAY',
    timezone: 'Europe/Madrid',
  },
  comparison: { kind: 'PREVIOUS_PERIOD' },
  limit: 100,
};

describe('supportAnalyticsArtifactSource', () => {
  it('pins one published report revision into dashboard and delivery receipts', async () => {
    const report = await supportAnalyticsArtifactSource.saveAndPublishReport(
      'project-1',
      'Quality weekly',
      'Published support quality report',
      query,
    );
    expect(
      await supportAnalyticsArtifactSource.readReport('project-1', report.savedReportId),
    ).toEqual(report);

    const dashboardReceipt = await supportAnalyticsArtifactSource.createDashboard(
      'project-1',
      'cms-user-1',
      report,
    );
    const dashboard = await supportAnalyticsArtifactSource.readDashboard(
      'project-1',
      dashboardReceipt.dashboardId,
    );
    expect(dashboard.report.savedReportRevisionId).toBe(report.savedReportRevisionId);

    await expect(
      supportAnalyticsArtifactSource.exportReport('project-1', report, 'CSV'),
    ).resolves.toMatchObject({
      kind: 'EXPORT_REQUESTED',
      lane: 'EXPORT',
      status: 'QUEUED',
    });
    await expect(
      supportAnalyticsArtifactSource.scheduleReport('project-1', 'cms-user-1', report, {
        timezone: 'Europe/Madrid',
        localTime: '09:00',
        format: 'PDF',
      }),
    ).resolves.toMatchObject({ kind: 'SCHEDULE_CHANGED', status: 'ACTIVE' });
  });
});
