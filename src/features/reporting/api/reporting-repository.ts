import { isMockMode } from "@/shared/config/data-mode";
import {
  dashboardFixtures,
  reportingDatasetFixtures,
  resultFixtureFor,
  savedReportFixtures,
} from "./reporting-fixtures";
import type {
  Dashboard,
  DashboardDraftInput,
  ReportingArtifactKind,
  ReportingArtifactSummary,
  ReportingDataset,
  ReportingQueryDefinition,
  ReportingQueryResult,
  ReportingRepository,
  SavedReport,
  SavedReportDraftInput,
} from "../model/reporting-types";
import { ReportingVersionConflictError } from "../model/reporting-types";

type MockState = {
  reports: SavedReport[];
  dashboards: Dashboard[];
  nextId: number;
};

function initialState(): MockState {
  return {
    reports: structuredClone(savedReportFixtures),
    dashboards: structuredClone(dashboardFixtures),
    nextId: 1,
  };
}

let mockState = initialState();

export function resetMockReportingRepository(): void {
  mockState = initialState();
}

function now(): string {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function requireReport(reportId: string): SavedReport {
  const report = mockState.reports.find((item) => item.id === reportId);
  if (!report) throw new Error("Сохранённый отчёт не найден");
  return report;
}

function requireDashboard(dashboardId: string): Dashboard {
  const dashboard = mockState.dashboards.find((item) => item.id === dashboardId);
  if (!dashboard) throw new Error("Дашборд не найден");
  return dashboard;
}

async function waitForFixture(signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  if (import.meta.env.MODE === "test") return;
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, 280);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

class MockReportingRepository implements ReportingRepository {
  async listArtifacts(): Promise<ReportingArtifactSummary[]> {
    return clone(
      [...mockState.dashboards, ...mockState.reports]
        .filter((artifact) => artifact.lifecycle !== "ARCHIVED")
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    );
  }

  async listDatasets(): Promise<ReportingDataset[]> {
    return clone(reportingDatasetFixtures);
  }

  async listSavedReports(): Promise<SavedReport[]> {
    return clone(mockState.reports.filter((report) => report.lifecycle !== "ARCHIVED"));
  }

  async getSavedReport(_projectId: string, reportId: string): Promise<SavedReport> {
    return clone(requireReport(reportId));
  }

  async saveSavedReportDraft(
    _projectId: string,
    draft: SavedReportDraftInput,
  ): Promise<SavedReport> {
    const existing = draft.id ? requireReport(draft.id) : null;
    const report: SavedReport = {
      id: existing?.id ?? `report-draft-${mockState.nextId++}`,
      kind: "SAVED_REPORT",
      title: draft.title,
      description: draft.description ?? "",
      collection: draft.collection,
      ownerName: existing?.ownerName ?? "Вы",
      lifecycle: "DRAFT",
      updatedAt: now(),
      freshness: existing?.freshness ?? "UNKNOWN",
      allowedActions: ["EDIT", "PUBLISH", "DUPLICATE", "ARCHIVE"],
      visualization: draft.visualization,
      query: clone(draft.query),
      version: (existing?.version ?? 0) + 1,
      publishedRevision: existing?.publishedRevision ?? null,
    };
    if (existing) {
      mockState.reports = mockState.reports.map((item) =>
        item.id === report.id ? report : item,
      );
    } else mockState.reports.unshift(report);
    return clone(report);
  }

  async publishSavedReport(
    _projectId: string,
    reportId: string,
    expectedVersion: number,
  ): Promise<SavedReport> {
    const current = requireReport(reportId);
    if (current.version !== expectedVersion) throw new ReportingVersionConflictError();
    const published: SavedReport = {
      ...current,
      lifecycle: "PUBLISHED",
      freshness: "FRESH",
      updatedAt: now(),
      version: current.version + 1,
      publishedRevision: (current.publishedRevision ?? 0) + 1,
      allowedActions: ["EDIT", "DUPLICATE", "ARCHIVE", "ADD_TO_DASHBOARD"],
    };
    mockState.reports = mockState.reports.map((item) =>
      item.id === reportId ? published : item,
    );
    return clone(published);
  }

  async getDashboard(_projectId: string, dashboardId: string): Promise<Dashboard> {
    return clone(requireDashboard(dashboardId));
  }

  async saveDashboardDraft(
    _projectId: string,
    draft: DashboardDraftInput,
  ): Promise<Dashboard> {
    const existing = draft.id ? requireDashboard(draft.id) : null;
    const dashboard: Dashboard = {
      id: existing?.id ?? `dashboard-draft-${mockState.nextId++}`,
      kind: "DASHBOARD",
      title: draft.title,
      description: draft.description ?? "",
      collection: draft.collection,
      ownerName: existing?.ownerName ?? "Вы",
      lifecycle: "DRAFT",
      updatedAt: now(),
      freshness: existing?.freshness ?? "UNKNOWN",
      allowedActions: ["EDIT", "PUBLISH", "DUPLICATE", "ARCHIVE"],
      widgets: clone(draft.widgets),
      version: (existing?.version ?? 0) + 1,
      publishedRevision: existing?.publishedRevision ?? null,
    };
    if (existing) {
      mockState.dashboards = mockState.dashboards.map((item) =>
        item.id === dashboard.id ? dashboard : item,
      );
    } else mockState.dashboards.unshift(dashboard);
    return clone(dashboard);
  }

  async publishDashboard(
    _projectId: string,
    dashboardId: string,
    expectedVersion: number,
  ): Promise<Dashboard> {
    const current = requireDashboard(dashboardId);
    if (current.version !== expectedVersion) throw new ReportingVersionConflictError();
    const published: Dashboard = {
      ...current,
      lifecycle: "PUBLISHED",
      freshness: "FRESH",
      updatedAt: now(),
      version: current.version + 1,
      publishedRevision: (current.publishedRevision ?? 0) + 1,
      allowedActions: ["EDIT", "DUPLICATE", "ARCHIVE"],
    };
    mockState.dashboards = mockState.dashboards.map((item) =>
      item.id === dashboardId ? published : item,
    );
    return clone(published);
  }

  async archiveArtifact(
    _projectId: string,
    kind: ReportingArtifactKind,
    artifactId: string,
  ): Promise<void> {
    if (kind === "SAVED_REPORT") {
      mockState.reports = mockState.reports.map((item) =>
        item.id === artifactId ? { ...item, lifecycle: "ARCHIVED" } : item,
      );
      return;
    }
    mockState.dashboards = mockState.dashboards.map((item) =>
      item.id === artifactId ? { ...item, lifecycle: "ARCHIVED" } : item,
    );
  }

  async runQuery(
    _projectId: string,
    query: ReportingQueryDefinition,
    signal: AbortSignal,
  ): Promise<ReportingQueryResult> {
    await waitForFixture(signal);
    return clone(resultFixtureFor(query.metric, query.breakdown));
  }
}

export class ReportingContractUnavailableError extends Error {
  constructor() {
    super("Reporting API ещё не опубликован в текущем OpenAPI-контракте");
    this.name = "ReportingContractUnavailableError";
  }
}

const unavailable = () => Promise.reject(new ReportingContractUnavailableError());

const unavailableRepository: ReportingRepository = {
  listArtifacts: unavailable,
  listDatasets: unavailable,
  listSavedReports: unavailable,
  getSavedReport: unavailable,
  saveSavedReportDraft: unavailable,
  publishSavedReport: unavailable,
  getDashboard: unavailable,
  saveDashboardDraft: unavailable,
  publishDashboard: unavailable,
  archiveArtifact: unavailable,
  runQuery: unavailable,
};

const mockRepository = new MockReportingRepository();

export function createMockReportingRepository(): ReportingRepository {
  return mockRepository;
}

export function createReportingRepository(): ReportingRepository {
  return isMockMode || import.meta.env.MODE === "test"
    ? mockRepository
    : unavailableRepository;
}

export const reportingRepository = createReportingRepository();
