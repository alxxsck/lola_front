export type ReportingArtifactKind = "SAVED_REPORT" | "DASHBOARD";
export type ReportingLifecycle = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type ReportingVisualization = "KPI" | "LINE" | "BAR" | "DONUT" | "TABLE";
export type ReportingDateRange =
  "LAST_2_DAYS" | "LAST_7_DAYS" | "LAST_30_DAYS" | "LAST_90_DAYS";
export type ReportingTimeGrain = "HOUR" | "DAY" | "WEEK" | "MONTH";
export type ReportingDatasetOwner = "EVENT" | "PROFILE" | "SEGMENT";
export type ReportingArtifactSpace = "PERSONAL" | "TEAM" | "PROJECT";
export type ReportingFieldClassification = "PUBLIC" | "INTERNAL" | "RESTRICTED";
export type ReportingCompatibilityCode =
  | "NO_TEMPORAL_HISTORY"
  | "RESTRICTED_FIELD"
  | "DIMENSION_TOO_HIGH_CARDINALITY"
  | "SMALL_GROUP_SUPPRESSED"
  | "NOT_ANALYTICS_READY";

export type ReportingAllowedAction =
  "EDIT" | "PUBLISH" | "DUPLICATE" | "ARCHIVE" | "ADD_TO_DASHBOARD";

export type ReportingFilter = {
  field: string;
  operator: "EQUALS" | "NOT_EQUALS";
  value: string;
};

export type ReportingQueryDefinition = {
  definitionRevisionId: string;
  datasetId: string;
  metric: string;
  population:
    | { mode: "EVENT_TIME" }
    | { mode: "CURRENT_PROFILE" }
    | { mode: "CURRENT_SEGMENT"; segmentRevisionId: string };
  dateRange: ReportingDateRange | null;
  grain: ReportingTimeGrain | null;
  breakdown?: string;
  filters: ReportingFilter[];
};

export type ReportingDataset = {
  id: string;
  definitionRevisionId: string;
  owner: ReportingDatasetOwner;
  title: string;
  description: string;
  currentStateDisclosure?: string;
  segmentRevisionId?: string;
  metrics: Array<{
    key: string;
    label: string;
    unit: string;
    classification: ReportingFieldClassification;
    analyticsReady: boolean;
    allowedOperations: Array<"AGGREGATE">;
  }>;
  dimensions: Array<{
    key: string;
    label: string;
    cardinality: "LOW" | "HIGH";
    classification: ReportingFieldClassification;
    analyticsReady: boolean;
    allowedOperations: Array<"BREAKDOWN" | "FILTER">;
  }>;
};

export type ReportingArtifactSummary = {
  id: string;
  kind: ReportingArtifactKind;
  title: string;
  description: string;
  space: ReportingArtifactSpace;
  collection: string;
  ownerName: string;
  lifecycle: ReportingLifecycle;
  updatedAt: string;
  freshness: "FRESH" | "STALE" | "UNKNOWN";
  allowedActions: ReportingAllowedAction[];
};

export type SavedReportDraftInput = {
  id?: string;
  expectedVersion?: number;
  title: string;
  description?: string;
  space: ReportingArtifactSpace;
  collection: string;
  visualization: ReportingVisualization;
  query: ReportingQueryDefinition;
};

export type SavedReport = ReportingArtifactSummary & {
  kind: "SAVED_REPORT";
  visualization: ReportingVisualization;
  query: ReportingQueryDefinition;
  version: number;
  publishedRevision: number | null;
  chartRevision: number | null;
  sourceArtifactId?: string;
};

export type DashboardWidgetWidth = "ONE_THIRD" | "HALF" | "TWO_THIRDS" | "FULL";

export type DashboardWidget = {
  id: string;
  savedReportId: string;
  savedReportRevision: number;
  queryRevisionId: string;
  chartRevision: number;
  /** Immutable presentation snapshot returned by the data-free Dashboard shell. */
  title: string;
  accessibleSummary: string;
  visualization: ReportingVisualization;
  titleOverride?: string;
  width: DashboardWidgetWidth;
};

export type DashboardPageDefinition = {
  id: string;
  title: string;
  widgets: DashboardWidget[];
};

export type DashboardDraftInput = {
  id?: string;
  expectedVersion?: number;
  title: string;
  description?: string;
  space: ReportingArtifactSpace;
  collection: string;
  pages: DashboardPageDefinition[];
};

export type Dashboard = ReportingArtifactSummary & {
  kind: "DASHBOARD";
  dashboardRevisionId: string;
  pages: DashboardPageDefinition[];
  version: number;
  publishedRevision: number | null;
  sourceArtifactId?: string;
};

export type ResourceReceipt = {
  periodLabel: string;
  timezone: string;
  dataAsOf: string;
  completeness: "COMPLETE" | "PARTIAL";
  exactness: "EXACT" | "ESTIMATED";
  exclusions: string[];
  definitionPins: {
    queryRevisionId: string;
    datasetRevisionId: string;
  };
  execution: {
    route: "SYNC" | "ASYNC";
    costUnits: number;
  };
};

export type ReportingResultData =
  | { kind: "SCALAR"; value: number; unit: string; delta?: number }
  | {
      kind: "TIME_SERIES";
      unit: string;
      points: Array<{ label: string; value: number }>;
    }
  | {
      kind: "CATEGORY";
      unit: string;
      values: Array<{ label: string; value: number }>;
    }
  | {
      kind: "ROWS";
      columns: Array<{ key: string; label: string }>;
      rows: Array<Record<string, string | number>>;
      nextCursor: string | null;
    };

export type ReportingResultStatus =
  | "queued"
  | "running"
  | "complete"
  | "empty"
  | "stale"
  | "partial"
  | "suppressed"
  | "forbidden"
  | "failed"
  | "expired";

export type ReportingQueryResult = {
  runId: string;
  status: ReportingResultStatus;
  data: ReportingResultData | null;
  receipt: ResourceReceipt | null;
  summary: string;
  safeMessage?: string;
};

export type ReportingArtifactCatalogQuery = {
  kind: ReportingArtifactKind;
  search: string;
  collection: string | null;
};

export type ReportingArtifactCatalog = {
  items: ReportingArtifactSummary[];
  counts: { dashboards: number; savedReports: number };
  collections: string[];
};

export type ReportingRepository = {
  listArtifacts(
    projectId: string,
    query: ReportingArtifactCatalogQuery,
  ): Promise<ReportingArtifactCatalog>;
  listDatasets(projectId: string): Promise<ReportingDataset[]>;
  listSavedReports(projectId: string): Promise<SavedReport[]>;
  getSavedReport(projectId: string, reportId: string): Promise<SavedReport>;
  saveSavedReportDraft(
    projectId: string,
    draft: SavedReportDraftInput,
  ): Promise<SavedReport>;
  publishSavedReport(
    projectId: string,
    reportId: string,
    expectedVersion: number,
  ): Promise<SavedReport>;
  getDashboard(projectId: string, dashboardId: string): Promise<Dashboard>;
  saveDashboardDraft(
    projectId: string,
    draft: DashboardDraftInput,
  ): Promise<Dashboard>;
  publishDashboard(
    projectId: string,
    dashboardId: string,
    expectedVersion: number,
  ): Promise<Dashboard>;
  archiveArtifact(
    projectId: string,
    kind: ReportingArtifactKind,
    artifactId: string,
  ): Promise<void>;
  runQuery(
    projectId: string,
    query: ReportingQueryDefinition,
    signal: AbortSignal,
  ): Promise<ReportingQueryResult>;
  runDashboardWidget(
    projectId: string,
    input: {
      dashboardId: string;
      dashboardRevisionId: string;
      pageId: string;
      widgetId: string;
      periodDays: number;
    },
    signal: AbortSignal,
  ): Promise<ReportingQueryResult>;
};

export class ReportingVersionConflictError extends Error {
  constructor() {
    super(
      "Отчёт изменился в другой сессии. Обновите данные или создайте копию.",
    );
    this.name = "ReportingVersionConflictError";
  }
}

export class ReportingCompatibilityError extends Error {
  constructor(readonly code: ReportingCompatibilityCode) {
    super(code);
    this.name = "ReportingCompatibilityError";
  }
}
