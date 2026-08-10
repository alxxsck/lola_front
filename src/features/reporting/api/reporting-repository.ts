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
  ReportingDataset,
  ReportingQueryDefinition,
  ReportingQueryResult,
  ReportingRepository,
  SavedReport,
  SavedReportDraftInput,
} from "../model/reporting-types";
import {
  ReportingCompatibilityError,
  ReportingVersionConflictError,
} from "../model/reporting-types";

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

let mockStates = new Map<string, MockState>();

export function resetMockReportingRepository(): void {
  mockStates = new Map();
}

function stateForProject(projectId: string): MockState {
  const existing = mockStates.get(projectId);
  if (existing) return existing;
  const state = initialState();
  mockStates.set(projectId, state);
  return state;
}

function now(): string {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function requireReport(projectId: string, reportId: string): SavedReport {
  const report = stateForProject(projectId).reports.find(
    (item) => item.id === reportId,
  );
  if (!report) throw new Error("Сохранённый отчёт не найден");
  return report;
}

function requireDashboard(projectId: string, dashboardId: string): Dashboard {
  const dashboard = stateForProject(projectId).dashboards.find(
    (item) => item.id === dashboardId,
  );
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
  async listArtifacts(
    projectId: string,
    query: Parameters<ReportingRepository["listArtifacts"]>[1],
  ): ReturnType<ReportingRepository["listArtifacts"]> {
    const state = stateForProject(projectId);
    const authorityFiltered = [...state.dashboards, ...state.reports].filter(
      (artifact) => artifact.lifecycle !== "ARCHIVED",
    );
    const needle = query.search.trim().toLocaleLowerCase("ru");
    const items = authorityFiltered
      .filter(
        (artifact) =>
          artifact.kind === query.kind &&
          (!query.collection || artifact.collection === query.collection) &&
          (!needle ||
            `${artifact.title} ${artifact.description} ${artifact.ownerName}`
              .toLocaleLowerCase("ru")
              .includes(needle)),
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    return clone({
      items,
      counts: {
        dashboards: authorityFiltered.filter(
          (artifact) => artifact.kind === "DASHBOARD",
        ).length,
        savedReports: authorityFiltered.filter(
          (artifact) => artifact.kind === "SAVED_REPORT",
        ).length,
      },
      collections: [
        ...new Set(authorityFiltered.map(({ collection }) => collection)),
      ],
    });
  }

  async listDatasets(projectId: string): Promise<ReportingDataset[]> {
    stateForProject(projectId);
    return clone(reportingDatasetFixtures);
  }

  async listSavedReports(projectId: string): Promise<SavedReport[]> {
    return clone(
      stateForProject(projectId).reports.filter(
        (report) => report.lifecycle !== "ARCHIVED",
      ),
    );
  }

  async getSavedReport(
    projectId: string,
    reportId: string,
  ): Promise<SavedReport> {
    return clone(requireReport(projectId, reportId));
  }

  async saveSavedReportDraft(
    projectId: string,
    draft: SavedReportDraftInput,
  ): Promise<SavedReport> {
    const state = stateForProject(projectId);
    const existing = draft.id ? requireReport(projectId, draft.id) : null;
    if (existing && draft.expectedVersion !== existing.version)
      throw new ReportingVersionConflictError();
    const branchFromPublished = existing?.lifecycle === "PUBLISHED";
    const report: SavedReport = {
      id:
        existing && !branchFromPublished
          ? existing.id
          : `report-draft-${state.nextId++}`,
      kind: "SAVED_REPORT",
      title: draft.title,
      description: draft.description ?? "",
      space: draft.space,
      collection: draft.collection,
      ownerName: existing?.ownerName ?? "Вы",
      lifecycle: "DRAFT",
      updatedAt: now(),
      freshness: existing?.freshness ?? "UNKNOWN",
      allowedActions: ["EDIT", "PUBLISH", "DUPLICATE", "ARCHIVE"],
      visualization: draft.visualization,
      query: clone(draft.query),
      version: branchFromPublished ? 1 : (existing?.version ?? 0) + 1,
      publishedRevision: existing?.publishedRevision ?? null,
      chartRevision: existing?.chartRevision ?? null,
      ...(branchFromPublished ? { sourceArtifactId: existing.id } : {}),
    };
    if (existing && !branchFromPublished) {
      state.reports = state.reports.map((item) =>
        item.id === report.id ? report : item,
      );
    } else state.reports.unshift(report);
    return clone(report);
  }

  async publishSavedReport(
    projectId: string,
    reportId: string,
    expectedVersion: number,
  ): Promise<SavedReport> {
    const state = stateForProject(projectId);
    const current = requireReport(projectId, reportId);
    if (current.version !== expectedVersion)
      throw new ReportingVersionConflictError();
    const published: SavedReport = {
      ...current,
      lifecycle: "PUBLISHED",
      freshness: "FRESH",
      updatedAt: now(),
      version: current.version + 1,
      publishedRevision: (current.publishedRevision ?? 0) + 1,
      chartRevision: (current.chartRevision ?? 0) + 1,
      allowedActions: ["EDIT", "DUPLICATE", "ARCHIVE", "ADD_TO_DASHBOARD"],
    };
    state.reports = state.reports.map((item) =>
      item.id === reportId ? published : item,
    );
    return clone(published);
  }

  async getDashboard(
    projectId: string,
    dashboardId: string,
  ): Promise<Dashboard> {
    return clone(requireDashboard(projectId, dashboardId));
  }

  async saveDashboardDraft(
    projectId: string,
    draft: DashboardDraftInput,
  ): Promise<Dashboard> {
    const state = stateForProject(projectId);
    const existing = draft.id ? requireDashboard(projectId, draft.id) : null;
    if (existing && draft.expectedVersion !== existing.version)
      throw new ReportingVersionConflictError();
    const branchFromPublished = existing?.lifecycle === "PUBLISHED";
    const dashboard: Dashboard = {
      id:
        existing && !branchFromPublished
          ? existing.id
          : `dashboard-draft-${state.nextId++}`,
      kind: "DASHBOARD",
      title: draft.title,
      description: draft.description ?? "",
      space: draft.space,
      collection: draft.collection,
      ownerName: existing?.ownerName ?? "Вы",
      lifecycle: "DRAFT",
      updatedAt: now(),
      freshness: existing?.freshness ?? "UNKNOWN",
      allowedActions: ["EDIT", "PUBLISH", "DUPLICATE", "ARCHIVE"],
      pages: clone(draft.pages),
      version: branchFromPublished ? 1 : (existing?.version ?? 0) + 1,
      publishedRevision: existing?.publishedRevision ?? null,
      ...(branchFromPublished ? { sourceArtifactId: existing.id } : {}),
    };
    if (existing && !branchFromPublished) {
      state.dashboards = state.dashboards.map((item) =>
        item.id === dashboard.id ? dashboard : item,
      );
    } else state.dashboards.unshift(dashboard);
    return clone(dashboard);
  }

  async publishDashboard(
    projectId: string,
    dashboardId: string,
    expectedVersion: number,
  ): Promise<Dashboard> {
    const state = stateForProject(projectId);
    const current = requireDashboard(projectId, dashboardId);
    if (current.version !== expectedVersion)
      throw new ReportingVersionConflictError();
    const published: Dashboard = {
      ...current,
      lifecycle: "PUBLISHED",
      freshness: "FRESH",
      updatedAt: now(),
      version: current.version + 1,
      publishedRevision: (current.publishedRevision ?? 0) + 1,
      allowedActions: ["EDIT", "DUPLICATE", "ARCHIVE"],
    };
    state.dashboards = state.dashboards.map((item) =>
      item.id === dashboardId ? published : item,
    );
    return clone(published);
  }

  async archiveArtifact(
    projectId: string,
    kind: ReportingArtifactKind,
    artifactId: string,
  ): Promise<void> {
    if (kind === "SAVED_REPORT") {
      const state = stateForProject(projectId);
      state.reports = state.reports.map((item) =>
        item.id === artifactId ? { ...item, lifecycle: "ARCHIVED" } : item,
      );
      return;
    }
    const state = stateForProject(projectId);
    state.dashboards = state.dashboards.map((item) =>
      item.id === artifactId ? { ...item, lifecycle: "ARCHIVED" } : item,
    );
  }

  async runQuery(
    projectId: string,
    query: ReportingQueryDefinition,
    signal: AbortSignal,
  ): Promise<ReportingQueryResult> {
    stateForProject(projectId);
    await waitForFixture(signal);
    const dataset = reportingDatasetFixtures.find(
      ({ id }) => id === query.datasetId,
    );
    if (!dataset) throw new Error("Источник данных недоступен");
    const metric = dataset.metrics.find(({ key }) => key === query.metric);
    if (!metric || metric.classification === "RESTRICTED")
      throw new ReportingCompatibilityError("RESTRICTED_FIELD");
    if (!metric.analyticsReady)
      throw new ReportingCompatibilityError("NOT_ANALYTICS_READY");
    const selectedFields = [
      ...(query.breakdown ? [query.breakdown] : []),
      ...query.filters.map(({ field }) => field),
    ];
    for (const field of selectedFields) {
      const dimension = dataset.dimensions.find(({ key }) => key === field);
      if (!dimension || dimension.classification === "RESTRICTED")
        throw new ReportingCompatibilityError("RESTRICTED_FIELD");
      if (!dimension.analyticsReady)
        throw new ReportingCompatibilityError("NOT_ANALYTICS_READY");
      if (dimension.cardinality === "HIGH")
        throw new ReportingCompatibilityError("DIMENSION_TOO_HIGH_CARDINALITY");
    }
    const invalidTemporalMode =
      (dataset.owner === "EVENT" && query.population.mode !== "EVENT_TIME") ||
      (dataset.owner === "PROFILE" &&
        (query.population.mode !== "CURRENT_PROFILE" ||
          query.dateRange !== null ||
          query.grain !== null)) ||
      (dataset.owner === "SEGMENT" &&
        (query.population.mode !== "CURRENT_SEGMENT" ||
          query.population.segmentRevisionId !== dataset.segmentRevisionId ||
          query.dateRange !== null ||
          query.grain !== null));
    if (invalidTemporalMode)
      throw new ReportingCompatibilityError("NO_TEMPORAL_HISTORY");
    return clone(resultFixtureFor(query.metric, query.breakdown));
  }
}

export class ReportingContractUnavailableError extends Error {
  constructor() {
    super("Reporting API ещё не опубликован в текущем OpenAPI-контракте");
    this.name = "ReportingContractUnavailableError";
  }
}

const unavailable = () =>
  Promise.reject(new ReportingContractUnavailableError());

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
