import type {
  Dashboard,
  ReportingDataset,
  ReportingQueryResult,
  SavedReport,
} from "../model/reporting-types";

export const reportingDatasetFixtures: ReportingDataset[] = [
  {
    id: "events-product",
    owner: "EVENT",
    title: "Продуктовые события",
    description: "Опубликованные события и их безопасные аналитические поля.",
    metrics: [
      { key: "unique_users", label: "Уникальные пользователи", unit: "users" },
      { key: "total_events", label: "Количество событий", unit: "events" },
      { key: "orders", label: "Заказы", unit: "orders" },
    ],
    dimensions: [
      { key: "channel", label: "Канал", cardinality: "LOW" },
      { key: "event_name", label: "Событие", cardinality: "HIGH" },
    ],
  },
  {
    id: "profiles-current",
    owner: "PROFILE",
    title: "Профили пользователей",
    description: "Текущие опубликованные поля профиля.",
    currentStateDisclosure: "Текущее состояние на момент запроса",
    metrics: [{ key: "profile_count", label: "Профили", unit: "users" }],
    dimensions: [{ key: "plan", label: "Тариф", cardinality: "LOW" }],
  },
  {
    id: "segments-current",
    owner: "SEGMENT",
    title: "Сегменты",
    description: "Текущий состав опубликованных ревизий сегментов.",
    currentStateDisclosure: "Состав пересчитывается по текущему профилю",
    metrics: [{ key: "segment_size", label: "Размер сегмента", unit: "users" }],
    dimensions: [{ key: "segment", label: "Сегмент", cardinality: "LOW" }],
  },
];

export const savedReportFixtures: SavedReport[] = [
  {
    id: "report-active-users",
    kind: "SAVED_REPORT",
    title: "Активные пользователи",
    description: "Динамика уникальных пользователей за 30 дней",
    collection: "Продукт",
    ownerName: "Команда продукта",
    lifecycle: "PUBLISHED",
    updatedAt: "2026-08-10T08:40:00.000Z",
    freshness: "FRESH",
    allowedActions: ["EDIT", "DUPLICATE", "ARCHIVE", "ADD_TO_DASHBOARD"],
    visualization: "LINE",
    query: {
      datasetId: "events-product",
      metric: "unique_users",
      dateRange: "LAST_30_DAYS",
      grain: "DAY",
      filters: [],
    },
    version: 3,
    publishedRevision: 2,
  },
  {
    id: "report-total-events",
    kind: "SAVED_REPORT",
    title: "Всего событий",
    description: "Объём продуктовых событий",
    collection: "Продукт",
    ownerName: "Команда продукта",
    lifecycle: "PUBLISHED",
    updatedAt: "2026-08-10T08:35:00.000Z",
    freshness: "FRESH",
    allowedActions: ["EDIT", "DUPLICATE", "ARCHIVE", "ADD_TO_DASHBOARD"],
    visualization: "KPI",
    query: {
      datasetId: "events-product",
      metric: "total_events",
      dateRange: "LAST_30_DAYS",
      grain: "DAY",
      filters: [],
    },
    version: 2,
    publishedRevision: 1,
  },
  {
    id: "report-channel-share",
    kind: "SAVED_REPORT",
    title: "Каналы привлечения",
    description: "Распределение активных пользователей по каналам",
    collection: "Маркетинг",
    ownerName: "Growth",
    lifecycle: "PUBLISHED",
    updatedAt: "2026-08-09T15:10:00.000Z",
    freshness: "FRESH",
    allowedActions: ["EDIT", "DUPLICATE", "ARCHIVE", "ADD_TO_DASHBOARD"],
    visualization: "DONUT",
    query: {
      datasetId: "events-product",
      metric: "unique_users",
      dateRange: "LAST_30_DAYS",
      grain: "DAY",
      breakdown: "channel",
      filters: [],
    },
    version: 4,
    publishedRevision: 3,
  },
  {
    id: "report-orders",
    kind: "SAVED_REPORT",
    title: "Заказы по дням",
    description: "Количество заказов с разбивкой по дням",
    collection: "Продажи",
    ownerName: "Revenue",
    lifecycle: "DRAFT",
    updatedAt: "2026-08-10T07:15:00.000Z",
    freshness: "UNKNOWN",
    allowedActions: ["EDIT", "PUBLISH", "DUPLICATE", "ARCHIVE"],
    visualization: "BAR",
    query: {
      datasetId: "events-product",
      metric: "orders",
      dateRange: "LAST_7_DAYS",
      grain: "DAY",
      filters: [],
    },
    version: 1,
    publishedRevision: null,
  },
];

export const dashboardFixtures: Dashboard[] = [
  {
    id: "dashboard-product-pulse",
    kind: "DASHBOARD",
    title: "Пульс продукта",
    description: "Главные сигналы продукта и привлечения",
    collection: "Общие",
    ownerName: "Команда продукта",
    lifecycle: "PUBLISHED",
    updatedAt: "2026-08-10T09:05:00.000Z",
    freshness: "FRESH",
    allowedActions: ["EDIT", "DUPLICATE", "ARCHIVE"],
    widgets: [
      {
        id: "widget-active",
        savedReportId: "report-active-users",
        width: "TWO_THIRDS",
      },
      {
        id: "widget-total",
        savedReportId: "report-total-events",
        width: "ONE_THIRD",
      },
      {
        id: "widget-channel",
        savedReportId: "report-channel-share",
        width: "HALF",
      },
    ],
    version: 6,
    publishedRevision: 4,
  },
  {
    id: "dashboard-growth-draft",
    kind: "DASHBOARD",
    title: "Growth review",
    description: "Черновик еженедельного обзора",
    collection: "Маркетинг",
    ownerName: "Growth",
    lifecycle: "DRAFT",
    updatedAt: "2026-08-09T17:20:00.000Z",
    freshness: "UNKNOWN",
    allowedActions: ["EDIT", "PUBLISH", "DUPLICATE", "ARCHIVE"],
    widgets: [
      {
        id: "widget-growth-channel",
        savedReportId: "report-channel-share",
        width: "FULL",
      },
    ],
    version: 2,
    publishedRevision: null,
  },
];

const receipt = {
  periodLabel: "12 июл — 10 авг 2026",
  timezone: "Europe/Madrid",
  dataAsOf: "2026-08-10T09:12:00.000Z",
  completeness: "COMPLETE" as const,
  exactness: "EXACT" as const,
  exclusions: [],
};

export function resultFixtureFor(
  metric: string,
  breakdown?: string,
): ReportingQueryResult {
  if (metric === "profile_count") {
    return {
      runId: "run-profile-count-current",
      status: "complete",
      data: { kind: "SCALAR", value: 18_420, unit: "users" },
      receipt: {
        ...receipt,
        periodLabel: "Текущее состояние",
        dataAsOf: "2026-08-10T09:12:00.000Z",
      },
      summary: "18 420 профилей на текущий момент запроса.",
    };
  }
  if (metric === "segment_size") {
    return {
      runId: "run-segment-size-current",
      status: "complete",
      data: {
        kind: "CATEGORY",
        unit: "users",
        values: [
          { label: "Активные", value: 8_640 },
          { label: "Новые", value: 3_180 },
          { label: "Риск оттока", value: 1_240 },
        ],
      },
      receipt: {
        ...receipt,
        periodLabel: "Текущий состав",
        dataAsOf: "2026-08-10T09:12:00.000Z",
      },
      summary: "Текущий состав опубликованных ревизий сегментов.",
    };
  }
  if (metric === "total_events") {
    return {
      runId: "run-total-events",
      status: "complete",
      data: { kind: "SCALAR", value: 482_610, unit: "events", delta: 12.4 },
      receipt,
      summary: "482 610 событий, на 12,4% больше предыдущего периода.",
    };
  }
  if (breakdown === "channel") {
    return {
      runId: "run-channel",
      status: "complete",
      data: {
        kind: "CATEGORY",
        unit: "users",
        values: [
          { label: "Органика", value: 5_240 },
          { label: "Реклама", value: 3_180 },
          { label: "Партнёры", value: 1_860 },
          { label: "Другое", value: 940 },
        ],
      },
      receipt,
      summary: "Органика приводит 46,7% активных пользователей.",
    };
  }
  if (metric === "orders") {
    return {
      runId: "run-orders",
      status: "complete",
      data: {
        kind: "CATEGORY",
        unit: "orders",
        values: [
          { label: "4 авг", value: 124 },
          { label: "5 авг", value: 151 },
          { label: "6 авг", value: 138 },
          { label: "7 авг", value: 176 },
          { label: "8 авг", value: 164 },
          { label: "9 авг", value: 192 },
          { label: "10 авг", value: 207 },
        ],
      },
      receipt: { ...receipt, periodLabel: "4–10 авг 2026" },
      summary: "Заказы выросли с 124 до 207 в день за неделю.",
    };
  }
  return {
    runId: "run-active-users",
    status: "complete",
    data: {
      kind: "TIME_SERIES",
      unit: "users",
      points: [
        { label: "12 июл", value: 8_420 },
        { label: "17 июл", value: 9_180 },
        { label: "22 июл", value: 9_640 },
        { label: "27 июл", value: 10_880 },
        { label: "1 авг", value: 11_320 },
        { label: "6 авг", value: 12_140 },
        { label: "10 авг", value: 12_840 },
      ],
    },
    receipt,
    summary:
      "12 840 активных пользователей; устойчивый рост в течение периода.",
  };
}
