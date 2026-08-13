import type {
  Dashboard,
  ReportingDataset,
  ReportingQueryResult,
  SavedReport,
} from '../model/reporting-types';

const aggregateField = {
  classification: 'INTERNAL' as const,
  analyticsReady: true,
  allowedOperations: ['AGGREGATE'] as Array<'AGGREGATE'>,
};
const dimensionField = {
  classification: 'INTERNAL' as const,
  analyticsReady: true,
  allowedOperations: ['BREAKDOWN', 'FILTER'] as Array<'BREAKDOWN' | 'FILTER'>,
};

export const reportingDatasetFixtures: ReportingDataset[] = [
  {
    id: 'events-product',
    definitionRevisionId: 'dataset-events-product-r3',
    owner: 'EVENT',
    title: 'Продуктовые события',
    description: 'Опубликованные события и их безопасные аналитические поля.',
    metrics: [
      {
        key: 'unique_users',
        label: 'Уникальные пользователи',
        unit: 'users',
        ...aggregateField,
      },
      {
        key: 'total_events',
        label: 'Количество событий',
        unit: 'events',
        ...aggregateField,
      },
      { key: 'orders', label: 'Заказы', unit: 'orders', ...aggregateField },
    ],
    dimensions: [
      {
        key: 'channel',
        label: 'Канал',
        cardinality: 'LOW',
        ...dimensionField,
      },
      {
        key: 'event_name',
        label: 'Событие',
        cardinality: 'HIGH',
        ...dimensionField,
      },
    ],
  },
  {
    id: 'profiles-current',
    definitionRevisionId: 'dataset-profiles-current-r2',
    owner: 'PROFILE',
    title: 'Профили пользователей',
    description: 'Текущие опубликованные поля профиля.',
    currentStateDisclosure: 'Текущее состояние на момент запроса',
    metrics: [
      {
        key: 'profile_count',
        label: 'Профили',
        unit: 'users',
        ...aggregateField,
      },
    ],
    dimensions: [{ key: 'plan', label: 'Тариф', cardinality: 'LOW', ...dimensionField }],
  },
  {
    id: 'segments-current',
    definitionRevisionId: 'dataset-segments-current-r5',
    owner: 'SEGMENT',
    title: 'Сегменты',
    description: 'Текущий состав опубликованных ревизий сегментов.',
    currentStateDisclosure: 'Состав пересчитывается по текущему профилю',
    segmentRevisionId: 'segment-catalog-r5',
    metrics: [
      {
        key: 'segment_size',
        label: 'Размер сегмента',
        unit: 'users',
        ...aggregateField,
      },
    ],
    dimensions: [
      {
        key: 'segment',
        label: 'Сегмент',
        cardinality: 'LOW',
        ...dimensionField,
      },
    ],
  },
];

export const savedReportFixtures: SavedReport[] = [
  {
    id: 'report-active-users',
    kind: 'SAVED_REPORT',
    title: 'Активные пользователи',
    description: 'Динамика уникальных пользователей за 2 полных дня',
    space: 'TEAM',
    collection: 'Продукт',
    ownerName: 'Команда продукта',
    lifecycle: 'PUBLISHED',
    updatedAt: '2026-08-10T08:40:00.000Z',
    freshness: 'FRESH',
    allowedActions: ['EDIT', 'DUPLICATE', 'ARCHIVE', 'ADD_TO_DASHBOARD'],
    visualization: 'LINE',
    query: {
      definitionRevisionId: 'query-active-users-r2',
      datasetId: 'events-product',
      metric: 'unique_users',
      population: { mode: 'EVENT_TIME' },
      dateRange: 'LAST_2_DAYS',
      grain: 'DAY',
      filters: [],
    },
    version: 3,
    publishedRevision: 2,
    chartRevision: 2,
  },
  {
    id: 'report-total-events',
    kind: 'SAVED_REPORT',
    title: 'Всего событий',
    description: 'Объём продуктовых событий',
    space: 'TEAM',
    collection: 'Продукт',
    ownerName: 'Команда продукта',
    lifecycle: 'PUBLISHED',
    updatedAt: '2026-08-10T08:35:00.000Z',
    freshness: 'FRESH',
    allowedActions: ['EDIT', 'DUPLICATE', 'ARCHIVE', 'ADD_TO_DASHBOARD'],
    visualization: 'KPI',
    query: {
      definitionRevisionId: 'query-total-events-r1',
      datasetId: 'events-product',
      metric: 'total_events',
      population: { mode: 'EVENT_TIME' },
      dateRange: 'LAST_2_DAYS',
      grain: 'DAY',
      filters: [],
    },
    version: 2,
    publishedRevision: 1,
    chartRevision: 1,
  },
  {
    id: 'report-channel-share',
    kind: 'SAVED_REPORT',
    title: 'Каналы привлечения',
    description: 'Распределение активных пользователей по каналам',
    space: 'TEAM',
    collection: 'Маркетинг',
    ownerName: 'Growth',
    lifecycle: 'PUBLISHED',
    updatedAt: '2026-08-09T15:10:00.000Z',
    freshness: 'FRESH',
    allowedActions: ['EDIT', 'DUPLICATE', 'ARCHIVE', 'ADD_TO_DASHBOARD'],
    visualization: 'DONUT',
    query: {
      definitionRevisionId: 'query-channel-share-r3',
      datasetId: 'events-product',
      metric: 'unique_users',
      population: { mode: 'EVENT_TIME' },
      dateRange: 'LAST_2_DAYS',
      grain: 'DAY',
      breakdown: 'channel',
      filters: [],
    },
    version: 4,
    publishedRevision: 3,
    chartRevision: 3,
  },
  {
    id: 'report-orders',
    kind: 'SAVED_REPORT',
    title: 'Заказы по дням',
    description: 'Количество заказов с разбивкой по дням',
    space: 'PERSONAL',
    collection: 'Продажи',
    ownerName: 'Revenue',
    lifecycle: 'DRAFT',
    updatedAt: '2026-08-10T07:15:00.000Z',
    freshness: 'UNKNOWN',
    allowedActions: ['EDIT', 'PUBLISH', 'DUPLICATE', 'ARCHIVE'],
    visualization: 'BAR',
    query: {
      definitionRevisionId: 'query-orders-draft-r1',
      datasetId: 'events-product',
      metric: 'orders',
      population: { mode: 'EVENT_TIME' },
      dateRange: 'LAST_7_DAYS',
      grain: 'DAY',
      filters: [],
    },
    version: 1,
    publishedRevision: null,
    chartRevision: null,
  },
];

function dashboardWidgetFixture(input: {
  id: string;
  savedReportId: string;
  savedReportRevision: number;
  queryRevisionId: string;
  chartRevision: number;
  width: 'ONE_THIRD' | 'HALF' | 'TWO_THIRDS' | 'FULL';
}) {
  const report = savedReportFixtures.find(({ id }) => id === input.savedReportId);
  if (!report) throw new Error(`Missing Saved Report fixture: ${input.savedReportId}`);
  return {
    ...input,
    title: report.title,
    accessibleSummary: `${report.title}. ${report.description}`,
    visualization: report.visualization,
  };
}

export const dashboardFixtures: Dashboard[] = [
  {
    id: 'dashboard-product-pulse',
    kind: 'DASHBOARD',
    title: 'Пульс продукта',
    description: 'Главные сигналы продукта и привлечения',
    space: 'PROJECT',
    collection: 'Общие',
    ownerName: 'Команда продукта',
    lifecycle: 'PUBLISHED',
    updatedAt: '2026-08-10T09:05:00.000Z',
    freshness: 'FRESH',
    allowedActions: ['EDIT', 'DUPLICATE', 'ARCHIVE'],
    dashboardRevisionId: 'dashboard-product-pulse-r4',
    pages: [
      {
        id: 'overview',
        title: 'Обзор',
        widgets: [
          dashboardWidgetFixture({
            id: 'widget-active',
            savedReportId: 'report-active-users',
            savedReportRevision: 2,
            queryRevisionId: 'query-active-users-r2',
            chartRevision: 2,
            width: 'TWO_THIRDS',
          }),
          dashboardWidgetFixture({
            id: 'widget-total',
            savedReportId: 'report-total-events',
            savedReportRevision: 1,
            queryRevisionId: 'query-total-events-r1',
            chartRevision: 1,
            width: 'ONE_THIRD',
          }),
          dashboardWidgetFixture({
            id: 'widget-channel',
            savedReportId: 'report-channel-share',
            savedReportRevision: 3,
            queryRevisionId: 'query-channel-share-r3',
            chartRevision: 3,
            width: 'HALF',
          }),
        ],
      },
      {
        id: 'diagnostics',
        title: 'Диагностика',
        widgets: Array.from({ length: 50 }, (_, index) =>
          dashboardWidgetFixture({
            id: `widget-hidden-${index + 1}`,
            savedReportId: 'report-active-users',
            savedReportRevision: 2,
            queryRevisionId: 'query-active-users-r2',
            chartRevision: 2,
            width: 'HALF',
          }),
        ),
      },
    ],
    version: 6,
    publishedRevision: 4,
  },
  {
    id: 'dashboard-growth-draft',
    kind: 'DASHBOARD',
    title: 'Growth review',
    description: 'Черновик еженедельного обзора',
    space: 'TEAM',
    collection: 'Маркетинг',
    ownerName: 'Growth',
    lifecycle: 'DRAFT',
    updatedAt: '2026-08-09T17:20:00.000Z',
    freshness: 'UNKNOWN',
    allowedActions: ['EDIT', 'PUBLISH', 'DUPLICATE', 'ARCHIVE'],
    dashboardRevisionId: 'dashboard-growth-draft-v2',
    pages: [
      {
        id: 'overview',
        title: 'Обзор',
        widgets: [
          dashboardWidgetFixture({
            id: 'widget-growth-channel',
            savedReportId: 'report-channel-share',
            savedReportRevision: 3,
            queryRevisionId: 'query-channel-share-r3',
            chartRevision: 3,
            width: 'FULL',
          }),
        ],
      },
    ],
    version: 2,
    publishedRevision: null,
  },
];

const receiptBase = {
  timezone: 'Europe/Madrid',
  dataAsOf: '2026-08-10T09:12:00.000Z',
  completeness: 'COMPLETE' as const,
  exactness: 'EXACT' as const,
  exclusions: [],
  definitionPins: {
    queryRevisionId: 'query-active-users-r2',
    datasetRevisionId: 'dataset-events-product-r3',
  },
  execution: { route: 'SYNC' as const, costUnits: 1 },
};

function periodLabel(days: number): string {
  if (days === 2) return '8–9 авг 2026 · 2 полных дня';
  if (days === 7) return '3–9 авг 2026 · 7 полных дней';
  if (days === 30) return '11 июл — 9 авг 2026 · 30 полных дней';
  return `Последние ${days} полных дней`;
}

export function resultFixtureFor(
  metric: string,
  breakdown?: string,
  periodDays = 2,
): ReportingQueryResult {
  const receipt = { ...receiptBase, periodLabel: periodLabel(periodDays) };
  if (metric === 'profile_count') {
    return {
      runId: 'run-profile-count-current',
      status: 'complete',
      data: { kind: 'SCALAR', value: 18_420, unit: 'users' },
      receipt: {
        ...receipt,
        periodLabel: 'Текущее состояние',
        dataAsOf: '2026-08-10T09:12:00.000Z',
        definitionPins: {
          queryRevisionId: 'query-profile-current-r1',
          datasetRevisionId: 'dataset-profiles-current-r2',
        },
      },
      summary: '18 420 профилей на текущий момент запроса.',
    };
  }
  if (metric === 'segment_size') {
    return {
      runId: 'run-segment-size-current',
      status: 'complete',
      data: {
        kind: 'CATEGORY',
        unit: 'users',
        values: [
          { label: 'Активные', value: 8_640 },
          { label: 'Новые', value: 3_180 },
          { label: 'Риск оттока', value: 1_240 },
        ],
      },
      receipt: {
        ...receipt,
        periodLabel: 'Текущий состав',
        dataAsOf: '2026-08-10T09:12:00.000Z',
        definitionPins: {
          queryRevisionId: 'query-segment-current-r1',
          datasetRevisionId: 'dataset-segments-current-r5',
        },
      },
      summary: 'Текущий состав опубликованных ревизий сегментов.',
    };
  }
  if (metric === 'total_events') {
    return {
      runId: 'run-total-events',
      status: 'complete',
      data: { kind: 'SCALAR', value: 482_610, unit: 'events', delta: 12.4 },
      receipt,
      summary: '482 610 событий, на 12,4% больше предыдущего периода.',
    };
  }
  if (breakdown === 'channel') {
    return {
      runId: 'run-channel',
      status: 'complete',
      data: {
        kind: 'CATEGORY',
        unit: 'users',
        values: [
          { label: 'Органика', value: 5_240 },
          { label: 'Реклама', value: 3_180 },
          { label: 'Партнёры', value: 1_860 },
          { label: 'Другое', value: 940 },
        ],
      },
      receipt,
      summary: 'Органика приводит 46,7% активных пользователей.',
    };
  }
  if (metric === 'orders') {
    return {
      runId: 'run-orders',
      status: 'complete',
      data: {
        kind: 'CATEGORY',
        unit: 'orders',
        values: [
          { label: '4 авг', value: 124 },
          { label: '5 авг', value: 151 },
          { label: '6 авг', value: 138 },
          { label: '7 авг', value: 176 },
          { label: '8 авг', value: 164 },
          { label: '9 авг', value: 192 },
          { label: '10 авг', value: 207 },
        ],
      },
      receipt: { ...receipt, periodLabel: '4–10 авг 2026' },
      summary: 'Заказы выросли с 124 до 207 в день за неделю.',
    };
  }
  return {
    runId: 'run-active-users',
    status: 'complete',
    data: {
      kind: 'TIME_SERIES',
      unit: 'users',
      points: [
        ...(periodDays > 7
          ? [
              { label: '11 июл', value: 8_420 },
              { label: '17 июл', value: 9_180 },
              { label: '22 июл', value: 9_640 },
              { label: '27 июл', value: 10_880 },
            ]
          : []),
        ...(periodDays > 2
          ? [
              { label: '3 авг', value: 11_320 },
              { label: '6 авг', value: 12_140 },
            ]
          : []),
        { label: '8 авг', value: 12_410 },
        { label: '9 авг', value: 12_840 },
      ],
    },
    receipt,
    summary: '12 840 активных пользователей; устойчивый рост в течение периода.',
  };
}

const completeStateFixture = resultFixtureFor('unique_users');

export const reportingResultStateFixtures: Record<
  Exclude<ReportingQueryResult['status'], 'complete'>,
  ReportingQueryResult
> = {
  queued: {
    runId: 'run-queued',
    status: 'queued',
    data: null,
    receipt: null,
    summary: 'Запрос ожидает запуска.',
  },
  running: {
    runId: 'run-running',
    status: 'running',
    data: null,
    receipt: null,
    summary: 'Идёт расчёт.',
  },
  empty: {
    runId: 'run-empty',
    status: 'empty',
    data: null,
    receipt: null,
    summary: 'Данных нет.',
  },
  stale: {
    ...completeStateFixture,
    runId: 'run-stale',
    status: 'stale',
    safeMessage: 'Данные обновляются с задержкой.',
  },
  partial: {
    ...completeStateFixture,
    runId: 'run-partial',
    status: 'partial',
    receipt: completeStateFixture.receipt
      ? { ...completeStateFixture.receipt, completeness: 'PARTIAL' }
      : null,
    safeMessage: 'Часть источников исключена.',
  },
  suppressed: {
    runId: 'run-suppressed',
    status: 'suppressed',
    data: null,
    receipt: null,
    summary: 'Результат скрыт.',
    safeMessage: 'SMALL_GROUP_SUPPRESSED',
  },
  forbidden: {
    runId: 'run-forbidden',
    status: 'forbidden',
    data: null,
    receipt: null,
    summary: '',
    safeMessage: 'Доступ к результату отозван.',
  },
  failed: {
    runId: 'run-failed',
    status: 'failed',
    data: null,
    receipt: null,
    summary: 'Расчёт не выполнен.',
  },
  expired: {
    runId: 'run-expired',
    status: 'expired',
    data: null,
    receipt: null,
    summary: 'Результат истёк.',
  },
};
