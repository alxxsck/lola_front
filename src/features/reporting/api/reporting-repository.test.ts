import { beforeEach, describe, expect, it } from 'vitest';
import {
  createMockReportingRepository,
  resetMockReportingRepository,
} from './reporting-repository';
import { reportingDatasetFixtures } from './reporting-fixtures';

describe('Reporting repository', () => {
  beforeEach(() => resetMockReportingRepository());

  it('lists authority-filtered artifacts without executing widget queries', async () => {
    const repository = createMockReportingRepository();

    const catalog = await repository.listArtifacts('project-1', {
      kind: 'DASHBOARD',
      search: '',
      collection: null,
    });

    expect(catalog.items.every((artifact) => artifact.kind === 'DASHBOARD')).toBe(true);
    expect(catalog.counts).toEqual({ dashboards: 2, savedReports: 4 });
    expect(catalog.items.every((artifact) => artifact.lifecycle !== 'ARCHIVED')).toBe(true);
  });

  it('publishes an immutable Saved Report revision', async () => {
    const repository = createMockReportingRepository();
    const draft = await repository.saveSavedReportDraft('project-1', {
      title: 'Новый отчёт',
      space: 'PERSONAL',
      collection: 'Без коллекции',
      visualization: 'KPI',
      query: {
        definitionRevisionId: 'query-new-draft',
        datasetId: 'events-product',
        metric: 'unique_users',
        population: { mode: 'EVENT_TIME' },
        dateRange: 'LAST_30_DAYS',
        grain: 'DAY',
        filters: [],
      },
    });

    const published = await repository.publishSavedReport('project-1', draft.id, draft.version);

    expect(published.lifecycle).toBe('PUBLISHED');
    expect(published.publishedRevision).toBe(1);
    expect(published.version).toBe(draft.version + 1);
    expect(published.chartRevision).toBe(1);
  });

  it('isolates mutations by Project and branches edits from published revisions', async () => {
    const repository = createMockReportingRepository();
    const original = await repository.getSavedReport('project-1', 'report-active-users');
    const draft = await repository.saveSavedReportDraft('project-1', {
      id: original.id,
      expectedVersion: original.version,
      title: 'Локальная правка',
      space: original.space,
      collection: original.collection,
      visualization: original.visualization,
      query: original.query,
    });

    expect(draft.id).not.toBe(original.id);
    expect(draft.sourceArtifactId).toBe(original.id);
    expect(await repository.getSavedReport('project-1', original.id)).toEqual(original);
    expect(await repository.getSavedReport('project-2', original.id)).toEqual(original);
  });

  it('returns a typed result and Resource Receipt through the query seam', async () => {
    const repository = createMockReportingRepository();

    const result = await repository.runQuery(
      'project-1',
      {
        definitionRevisionId: 'query-active-users-r2',
        datasetId: 'events-product',
        metric: 'unique_users',
        population: { mode: 'EVENT_TIME' },
        dateRange: 'LAST_30_DAYS',
        grain: 'DAY',
        filters: [],
      },
      new AbortController().signal,
    );

    expect(result.status).toBe('complete');
    expect(result.receipt).toMatchObject({
      timezone: 'Europe/Madrid',
      exactness: 'EXACT',
    });
    expect(result.data?.kind).toBe('TIME_SERIES');
  });

  it('opens a data-free Dashboard shell and activates only the requested Widget', async () => {
    const repository = createMockReportingRepository();
    const dashboard = await repository.getDashboard('project-1', 'dashboard-product-pulse');

    expect(dashboard.pages[0]?.widgets[0]).toMatchObject({
      title: 'Активные пользователи',
      visualization: 'LINE',
      savedReportId: 'report-active-users',
    });

    const result = await repository.runDashboardWidget(
      'project-1',
      {
        dashboardId: dashboard.id,
        dashboardRevisionId: dashboard.dashboardRevisionId,
        pageId: 'overview',
        widgetId: 'widget-active',
        periodDays: 7,
      },
      new AbortController().signal,
    );

    expect(result.status).toBe('complete');
    expect(result.receipt?.periodLabel).toBe('3–9 авг 2026 · 7 полных дней');
  });

  it('keeps Profile and Segment populations explicitly current-state', async () => {
    const repository = createMockReportingRepository();
    const datasets = await repository.listDatasets('project-1');

    expect(datasets.find((dataset) => dataset.owner === 'PROFILE')).toMatchObject({
      currentStateDisclosure: 'Текущее состояние на момент запроса',
    });
    expect(datasets.find((dataset) => dataset.owner === 'SEGMENT')).toMatchObject({
      currentStateDisclosure: 'Состав пересчитывается по текущему профилю',
    });

    const result = await repository.runQuery(
      'project-1',
      {
        definitionRevisionId: 'query-profile-current-r1',
        datasetId: 'profiles-current',
        metric: 'profile_count',
        population: { mode: 'CURRENT_PROFILE' },
        dateRange: null,
        grain: null,
        filters: [],
      },
      new AbortController().signal,
    );
    expect(result.summary).toContain('текущий момент');
    expect(result.receipt?.periodLabel).toBe('Текущее состояние');
  });

  it('rejects an event-time fallback for current Profile data', async () => {
    const repository = createMockReportingRepository();
    await expect(
      repository.runQuery(
        'project-1',
        {
          definitionRevisionId: 'query-invalid',
          datasetId: 'profiles-current',
          metric: 'profile_count',
          population: { mode: 'EVENT_TIME' },
          dateRange: 'LAST_30_DAYS',
          grain: 'DAY',
          filters: [],
        },
        new AbortController().signal,
      ),
    ).rejects.toThrow('NO_TEMPORAL_HISTORY');
  });

  it('enforces governed field readiness and cardinality with stable codes', async () => {
    const repository = createMockReportingRepository();
    const baseQuery = {
      definitionRevisionId: 'query-governance-test',
      datasetId: 'events-product',
      metric: 'unique_users',
      population: { mode: 'EVENT_TIME' as const },
      dateRange: 'LAST_30_DAYS' as const,
      grain: 'DAY' as const,
      filters: [],
    };

    await expect(
      repository.runQuery(
        'project-1',
        { ...baseQuery, breakdown: 'event_name' },
        new AbortController().signal,
      ),
    ).rejects.toThrow('DIMENSION_TOO_HIGH_CARDINALITY');
    await expect(
      repository.runQuery(
        'project-1',
        { ...baseQuery, metric: 'restricted_metric' },
        new AbortController().signal,
      ),
    ).rejects.toThrow('RESTRICTED_FIELD');

    const dataset = reportingDatasetFixtures.find(({ id }) => id === 'events-product');
    const metric = dataset?.metrics.find(({ key }) => key === 'unique_users');
    expect(metric).toBeDefined();
    if (!metric) return;
    metric.analyticsReady = false;
    try {
      await expect(
        repository.runQuery('project-1', baseQuery, new AbortController().signal),
      ).rejects.toThrow('NOT_ANALYTICS_READY');
    } finally {
      metric.analyticsReady = true;
    }
  });

  it('keeps published Dashboard pins immutable across layout-only Draft edits', async () => {
    const repository = createMockReportingRepository();
    const original = await repository.getDashboard('project-1', 'dashboard-product-pulse');
    const originalPins = original.pages[0]?.widgets.map(
      ({ savedReportRevision, queryRevisionId, chartRevision }) => ({
        savedReportRevision,
        queryRevisionId,
        chartRevision,
      }),
    );
    const pages = structuredClone(original.pages);
    if (pages[0]?.widgets[0]) pages[0].widgets[0].width = 'FULL';

    const draft = await repository.saveDashboardDraft('project-1', {
      id: original.id,
      expectedVersion: original.version,
      title: original.title,
      description: original.description,
      space: original.space,
      collection: original.collection,
      pages,
    });

    expect(draft.id).not.toBe(original.id);
    expect(
      draft.pages[0]?.widgets.map(({ savedReportRevision, queryRevisionId, chartRevision }) => ({
        savedReportRevision,
        queryRevisionId,
        chartRevision,
      })),
    ).toEqual(originalPins);
    expect(await repository.getDashboard('project-1', original.id)).toEqual(original);
  });

  it('rejects an obsolete Draft autosave with OCC', async () => {
    const repository = createMockReportingRepository();
    const current = await repository.getSavedReport('project-1', 'report-orders');
    const input = {
      id: current.id,
      expectedVersion: current.version,
      title: current.title,
      space: current.space,
      collection: current.collection,
      visualization: current.visualization,
      query: current.query,
    };

    await repository.saveSavedReportDraft('project-1', input);
    await expect(repository.saveSavedReportDraft('project-1', input)).rejects.toThrow(
      'изменился в другой сессии',
    );
  });
});
