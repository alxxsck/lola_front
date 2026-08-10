export type ReportingArtifactKind = "SAVED_REPORT" | "DASHBOARD";
export type ReportingLifecycle = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type ReportingVisualization = "KPI" | "LINE" | "BAR" | "DONUT" | "TABLE";
export type ReportingDateRange =
  | "LAST_7_DAYS"
  | "LAST_30_DAYS"
  | "LAST_90_DAYS";
export type ReportingTimeGrain = "HOUR" | "DAY" | "WEEK" | "MONTH";
export type ReportingDatasetOwner = "EVENT" | "PROFILE" | "SEGMENT";

export type ReportingAllowedAction =
  | "EDIT"
  | "PUBLISH"
  | "DUPLICATE"
  | "ARCHIVE"
  | "ADD_TO_DASHBOARD";

export type ReportingFilter = {
  field: string;
  operator: "EQUALS" | "NOT_EQUALS";
  value: string;
};

export type ReportingQueryDefinition = {
  datasetId: string;
  metric: string;
  dateRange: ReportingDateRange;
  grain: ReportingTimeGrain;
  breakdown?: string;
  filters: ReportingFilter[];
};

export type ReportingDataset = {
  id: string;
  owner: ReportingDatasetOwner;
  title: string;
  description: string;
  currentStateDisclosure?: string;
  metrics: Array<{ key: string; label: string; unit: string }>;
  dimensions: Array<{ key: string; label: string; cardinality: "LOW" | "HIGH" }>;
};

export type ReportingArtifactSummary = {
  id: string;
  kind: ReportingArtifactKind;
  title: string;
  description: string;
  collection: string;
  ownerName: string;
  lifecycle: ReportingLifecycle;
  updatedAt: string;
  freshness: "FRESH" | "STALE" | "UNKNOWN";
  allowedActions: ReportingAllowedAction[];
};

export type SavedReportDraftInput = {
  id?: string;
  title: string;
  description?: string;
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
};

export type DashboardWidgetWidth = "ONE_THIRD" | "HALF" | "TWO_THIRDS" | "FULL";

export type DashboardWidget = {
  id: string;
  savedReportId: string;
  titleOverride?: string;
  width: DashboardWidgetWidth;
};

export type DashboardDraftInput = {
  id?: string;
  title: string;
  description?: string;
  collection: string;
  widgets: DashboardWidget[];
};

export type Dashboard = ReportingArtifactSummary & {
  kind: "DASHBOARD";
  widgets: DashboardWidget[];
  version: number;
  publishedRevision: number | null;
};

export type ResourceReceipt = {
  periodLabel: string;
  timezone: string;
  dataAsOf: string;
  completeness: "COMPLETE" | "PARTIAL";
  exactness: "EXACT" | "ESTIMATED";
  exclusions: string[];
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
  data: ReportingResultData;
  receipt: ResourceReceipt;
  summary: string;
  safeMessage?: string;
};

export type ReportingRepository = {
  listArtifacts(projectId: string): Promise<ReportingArtifactSummary[]>;
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
};

export class ReportingVersionConflictError extends Error {
  constructor() {
    super("Отчёт изменился в другой сессии. Обновите данные или создайте копию.");
    this.name = "ReportingVersionConflictError";
  }
}
