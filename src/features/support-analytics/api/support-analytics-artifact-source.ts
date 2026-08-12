import {
  dashboardCreate,
  dashboardPublish,
  dashboardRead,
  dashboardShareCreate,
  dashboardShareRevoke,
  dashboardInteractionCreate,
  dashboardWidgetResultRead,
  reportExportCreate,
  reportExportCancel,
  reportExportEstimate,
  reportExportRead,
  reportExportRevoke,
  reportScheduleCreate,
  reportScheduleArchive,
  reportSchedulePause,
  reportScheduleRead,
  reportScheduleResume,
  savedReportCreate,
  savedReportArchive,
  savedReportDuplicate,
  savedReportPublish,
  savedReportPreview,
  savedReportRead,
  savedReportRevisionList,
} from "@/shared/api/generated/retenive-backend";
import type {
  DashboardCommandResponseDto,
  DashboardShellResponseDto,
  ReportExportRequestedResponseDto,
  ReportExportStatusResponseDto,
  ReportScheduleChangedResponseDto,
  ReportScheduleResponseDto,
  ReportingQueryDefinitionDto,
  ReportingQueryResultResponseDto,
  SavedReportRevisionResponseDto,
  SavedReportRevisionPageResponseDto,
} from "@/shared/api/generated/models";
import { normalizeApiError } from "@/shared/api/http/api-error";
import { noAuthRetryRequestOptions } from "@/shared/api/http/axios-instance";
import { isMockMode } from "@/shared/config/data-mode";

export interface SupportSavedArtifact {
  savedReportId: string;
  savedReportRevisionId: string;
  revision: number;
  queryDefinitionHash: string;
  name: string;
  description: string;
  query: ReportingQueryDefinitionDto;
}

export interface SupportDashboardArtifact {
  dashboardId: string;
  dashboardRevisionId: string;
  revision: number;
  name: string;
  description: string;
  report: SupportSavedArtifact;
}

export interface SupportAnalyticsArtifactSource {
  saveAndPublishReport(
    projectId: string,
    name: string,
    description: string,
    query: ReportingQueryDefinitionDto,
  ): Promise<SupportSavedArtifact>;
  readReport(
    projectId: string,
    reportId: string,
    signal?: AbortSignal,
  ): Promise<SupportSavedArtifact>;
  createDashboard(
    projectId: string,
    actorCmsUserId: string,
    report: SupportSavedArtifact,
  ): Promise<DashboardCommandResponseDto>;
  readDashboard(
    projectId: string,
    dashboardId: string,
    signal?: AbortSignal,
  ): Promise<SupportDashboardArtifact>;
  runDashboard(
    projectId: string,
    dashboard: SupportDashboardArtifact,
    signal?: AbortSignal,
  ): Promise<ReportingQueryResultResponseDto>;
  exportReport(
    projectId: string,
    report: SupportSavedArtifact,
    format: "CSV" | "XLSX" | "PDF" | "PNG",
    highCostConfirmed?: boolean,
  ): Promise<ReportExportRequestedResponseDto>;
  scheduleReport(
    projectId: string,
    actorCmsUserId: string,
    report: SupportSavedArtifact,
    timezone: string,
  ): Promise<ReportScheduleChangedResponseDto>;
  readExport(projectId: string, exportId: string): Promise<ReportExportStatusResponseDto>;
  cancelExport(projectId: string, exportId: string): Promise<void>;
  revokeExport(projectId: string, exportId: string): Promise<void>;
  readSchedule(projectId: string, scheduleId: string): Promise<ReportScheduleResponseDto>;
  pauseSchedule(projectId: string, scheduleId: string): Promise<ReportScheduleChangedResponseDto>;
  resumeSchedule(projectId: string, scheduleId: string): Promise<ReportScheduleChangedResponseDto>;
  archiveSchedule(projectId: string, scheduleId: string): Promise<ReportScheduleChangedResponseDto>;
  reportHistory(projectId: string, reportId: string): Promise<SavedReportRevisionPageResponseDto>;
  duplicateReport(projectId: string, reportId: string, name: string): Promise<string>;
  archiveReport(projectId: string, reportId: string): Promise<void>;
  shareDashboard(projectId: string, dashboardId: string, cmsUserId: string): Promise<string>;
  revokeDashboardShare(projectId: string, dashboardId: string, shareId: string): Promise<void>;
}

const artifactAttempts = new Map<string, { key: string; expiresAt: number }>();

function attemptSignature(operation: string, intent: unknown): string {
  return `${operation}:${JSON.stringify(intent)}`;
}

function completeAttempt(operation: string, intent: unknown): void {
  artifactAttempts.delete(attemptSignature(operation, intent));
}

function commandOptions(operation: string, intent: unknown) {
  const signature = attemptSignature(operation, intent);
  const now = Date.now();
  const retained = artifactAttempts.get(signature);
  const attempt = retained && retained.expiresAt > now
    ? retained
    : { key: crypto.randomUUID(), expiresAt: now + 5 * 60_000 };
  artifactAttempts.set(signature, attempt);
  return {
    ...noAuthRetryRequestOptions(),
    headers: { "Idempotency-Key": attempt.key },
  };
}

function reportDocument(
  name: string,
  description: string,
  query: ReportingQueryDefinitionDto,
) {
  return {
    document: {
      version: 3 as const,
      name,
      description,
      presentation: {
        version: 3 as const,
        table: {
          kind: "TABLE" as const,
          columns: [...query.groupBy, ...query.metrics],
          sort: [
            {
              field: query.groupBy[0] ?? query.metrics[0]!,
              direction: "ASC" as const,
            },
            { field: query.metrics[0]!, direction: "DESC" as const },
          ],
        },
      },
      query: {
        version: 1 as const,
        datasetRevisionId: query.datasetRevisionId,
        metrics: query.metrics,
        groupBy: query.groupBy,
        filters: query.filters,
        comparison: query.comparison,
        order: query.order,
        limit: query.limit,
        range: {
          kind: "LAST_COMPLETE_DAYS" as const,
          defaultDays: 7,
          grain: "DAY" as const,
          timezone: query.range.timezone,
        },
      },
    },
  };
}

function dashboardDocument(report: SupportSavedArtifact) {
  return {
    version: 1 as const,
    name: `Дашборд: ${report.name}`,
    description: report.description,
    globalFilters: [],
    pages: [
      {
        id: "overview",
        title: "Обзор",
        tabs: [
          {
            id: "main",
            title: "Основное",
            widgets: [
              {
                id: "quality",
                title: report.name,
                accessibleSummary: `${report.name}. ${report.description}`,
                filterBindings: [],
                layout: { column: 0, row: 0, width: 12, height: 6 },
                loading: {
                  activation: "VIEWPORT" as const,
                  reducedMotion: "DATA_IMMEDIATE" as const,
                },
                source: {
                  savedReportId: report.savedReportId,
                  savedReportRevision: report.revision,
                  savedReportRevisionId: report.savedReportRevisionId,
                  queryDefinitionHash: report.queryDefinitionHash,
                  presentation: "TABLE" as const,
                },
              },
            ],
          },
        ],
      },
    ],
  };
}

export const supportAnalyticsArtifactApiSource: SupportAnalyticsArtifactSource = {
  async saveAndPublishReport(projectId, name, description, query) {
    try {
      const created = await savedReportCreate(
        projectId,
        reportDocument(name, description, query),
        commandOptions("saved-report-create", { name, description, query }),
      );
      const published = await savedReportPublish(
        projectId,
        created.savedReportId,
        commandOptions("saved-report-publish", { savedReportId: created.savedReportId }),
      );
      completeAttempt("saved-report-create", { name, description, query });
      completeAttempt("saved-report-publish", { savedReportId: created.savedReportId });
      return {
        savedReportId: published.savedReportId,
        savedReportRevisionId: published.savedReportRevisionId,
        revision: published.revision,
        queryDefinitionHash: published.queryDefinitionHash,
        name,
        description,
        query,
      };
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async readReport(projectId, reportId, signal) {
    try {
      const revision = await savedReportRead(projectId, reportId, signal ? { signal } : undefined);
      const preview = await savedReportPreview(
        projectId,
        reportId,
        { periodDays: revision.document.query.range.defaultDays ?? 7 },
        signal ? { signal } : undefined,
      );
      const mapped = mapRevision(revision);
      mapped.query.range.from = preview.resolvedRange.fromDay;
      mapped.query.range.until = preview.resolvedRange.untilDay;
      return mapped;
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async createDashboard(projectId, actorCmsUserId, report) {
    try {
      const created = await dashboardCreate(
        projectId,
        {
          collectionId: null,
          space: { kind: "PERSONAL", ownerCmsUserId: actorCmsUserId },
          document: dashboardDocument(report),
        },
        commandOptions("dashboard-create", {
          actorCmsUserId,
          savedReportRevisionId: report.savedReportRevisionId,
        }),
      );
      const published = await dashboardPublish(
        projectId,
        created.dashboardId,
        { acknowledgeCostWarnings: true },
        commandOptions("dashboard-publish", { dashboardId: created.dashboardId }),
      );
      completeAttempt("dashboard-create", { actorCmsUserId, savedReportRevisionId: report.savedReportRevisionId });
      completeAttempt("dashboard-publish", { dashboardId: created.dashboardId });
      return published;
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async readDashboard(projectId, dashboardId, signal) {
    try {
      return mapDashboard(
        await dashboardRead(projectId, dashboardId, signal ? { signal } : undefined),
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async runDashboard(projectId, dashboard, signal) {
    try {
      const interactionId = crypto.randomUUID();
      await dashboardInteractionCreate(
        projectId,
        dashboard.dashboardId,
        {
          dashboardRevisionId: dashboard.dashboardRevisionId,
          interactionId,
          pageId: "overview",
          tabId: "main",
          widgetIds: ["quality"],
          filters: { periodDays: 7 },
        },
        {
          ...commandOptions("dashboard-interaction", {
            dashboardRevisionId: dashboard.dashboardRevisionId,
            interactionId,
          }),
          ...(signal ? { signal } : {}),
        },
      );
      const deadline = Date.now() + 60_000;
      while (Date.now() < deadline) {
        const widget = await dashboardWidgetResultRead(
          projectId,
          dashboard.dashboardId,
          interactionId,
          "quality",
          { dashboardRevisionId: dashboard.dashboardRevisionId },
          signal ? { signal } : undefined,
        );
        if (!['QUEUED', 'RUNNING'].includes(widget.status)) return widget;
        await new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(resolve, widget.retryAfterMs ?? 350);
          signal?.addEventListener("abort", () => {
            window.clearTimeout(timer);
            reject(new DOMException("Aborted", "AbortError"));
          }, { once: true });
        });
      }
      throw new Error("Widget не завершился за минуту");
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async exportReport(projectId, report, format, highCostConfirmed = false) {
    try {
      const preview = await savedReportPreview(
        projectId,
        report.savedReportId,
        { periodDays: 7 },
      );
      const estimate = await reportExportEstimate(projectId, {
        savedReportId: report.savedReportId,
        savedReportRevisionId: report.savedReportRevisionId,
        expectedQueryHash: preview.estimate.canonicalQueryHash,
        format,
        resolvedCurrencies: preview.resolvedCurrencies,
        resolvedRange: preview.resolvedRange,
      });
      if (estimate.highCostConfirmationRequired && !highCostConfirmed)
        throw new Error("Экспорт требует отдельного подтверждения высокой стоимости");
      return await reportExportCreate(
        projectId,
        {
          savedReportId: report.savedReportId,
          savedReportRevisionId: report.savedReportRevisionId,
          expectedQueryHash: preview.estimate.canonicalQueryHash,
          format,
          resolvedCurrencies: preview.resolvedCurrencies,
          resolvedRange: preview.resolvedRange,
          maximumRows: estimate.maximumRows,
          maximumBytes: estimate.maximumBytes,
          highCostConfirmed,
        },
        commandOptions("report-export", {
          savedReportRevisionId: report.savedReportRevisionId,
          format,
          queryHash: preview.estimate.canonicalQueryHash,
          range: preview.resolvedRange,
        }),
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async scheduleReport(projectId, actorCmsUserId, report, timezone) {
    try {
      return await reportScheduleCreate(
        projectId,
        {
          savedReportId: report.savedReportId,
          savedReportRevisionId: report.savedReportRevisionId,
          name: `Ежедневно: ${report.name}`,
          format: "PDF",
          maximumRows: 10_000,
          maximumBytes: 10_000_000,
          highCostConfirmed: false,
          recurrence: { kind: "DAILY", localTime: "09:00", timezone },
          target: { kind: "IN_APP", cmsUserId: actorCmsUserId },
        },
        commandOptions("report-schedule", {
          actorCmsUserId,
          savedReportRevisionId: report.savedReportRevisionId,
          timezone,
        }),
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async readExport(projectId, exportId) {
    try {
      return await reportExportRead(projectId, exportId);
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async cancelExport(projectId, exportId) {
    try {
      await reportExportCancel(projectId, exportId, commandOptions("export-cancel", { exportId }));
      completeAttempt("export-cancel", { exportId });
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async revokeExport(projectId, exportId) {
    try {
      await reportExportRevoke(projectId, exportId, commandOptions("export-revoke", { exportId }));
      completeAttempt("export-revoke", { exportId });
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async readSchedule(projectId, scheduleId) {
    try {
      return await reportScheduleRead(projectId, scheduleId);
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async pauseSchedule(projectId, scheduleId) {
    try {
      return await reportSchedulePause(projectId, scheduleId, commandOptions("schedule-pause", { scheduleId }));
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async resumeSchedule(projectId, scheduleId) {
    try {
      return await reportScheduleResume(projectId, scheduleId, commandOptions("schedule-resume", { scheduleId }));
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async archiveSchedule(projectId, scheduleId) {
    try {
      return await reportScheduleArchive(projectId, scheduleId, commandOptions("schedule-archive", { scheduleId }));
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async reportHistory(projectId, reportId) {
    try {
      return await savedReportRevisionList(projectId, reportId);
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async duplicateReport(projectId, reportId, name) {
    try {
      const result = await savedReportDuplicate(
        projectId,
        reportId,
        { name },
        commandOptions("saved-report-duplicate", { reportId, name }),
      );
      return result.savedReportId;
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async archiveReport(projectId, reportId) {
    try {
      await savedReportArchive(
        projectId,
        reportId,
        commandOptions("saved-report-archive", { reportId }),
      );
      completeAttempt("saved-report-archive", { reportId });
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async shareDashboard(projectId, dashboardId, cmsUserId) {
    try {
      const result = await dashboardShareCreate(
        projectId,
        dashboardId,
        { kind: "CMS_USER", id: cmsUserId },
        commandOptions("dashboard-share", { dashboardId, cmsUserId }),
      );
      if (!result.shareId) throw new Error("Backend не вернул share ID");
      completeAttempt("dashboard-share", { dashboardId, cmsUserId });
      return result.shareId;
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async revokeDashboardShare(projectId, dashboardId, shareId) {
    try {
      await dashboardShareRevoke(
        projectId,
        dashboardId,
        shareId,
        commandOptions("dashboard-share-revoke", { dashboardId, shareId }),
      );
      completeAttempt("dashboard-share-revoke", { dashboardId, shareId });
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
};

const reports = new Map<string, SupportSavedArtifact>();
const dashboards = new Map<string, SupportDashboardArtifact>();

function persistMockArtifact(key: string, value: unknown): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(`support-analytics:${key}`, JSON.stringify(value));
}

function restoreMockArtifact<T>(key: string): T | undefined {
  if (typeof sessionStorage === "undefined") return undefined;
  const raw = sessionStorage.getItem(`support-analytics:${key}`);
  return raw ? (JSON.parse(raw) as T) : undefined;
}

function cloneMockArtifact<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function mockRevision(report: SupportSavedArtifact): SavedReportRevisionResponseDto {
  return {
    savedReportId: report.savedReportId,
    savedReportRevisionId: report.savedReportRevisionId,
    revision: report.revision,
    datasetRevisionId: report.query.datasetRevisionId,
    queryDefinitionHash: report.queryDefinitionHash,
    semanticDigest: "mock-semantic-digest",
    document: reportDocument(report.name, report.description, report.query).document,
  };
}

const mockSource: SupportAnalyticsArtifactSource = {
  async saveAndPublishReport(_projectId, name, description, query) {
    const savedReportId = `support-report-${Date.now()}`;
    const value: SupportSavedArtifact = {
      savedReportId,
      savedReportRevisionId: `${savedReportId}-r1`,
      revision: 1,
      queryDefinitionHash: "e".repeat(64),
      name,
      description,
      query,
    };
    reports.set(savedReportId, value);
    persistMockArtifact(`report:${savedReportId}`, value);
    return cloneMockArtifact(value);
  },
  async readReport(_projectId, id) {
    const value =
      reports.get(id) ?? restoreMockArtifact<SupportSavedArtifact>(`report:${id}`);
    if (!value) throw new Error("Сохранённый отчёт не найден");
    return cloneMockArtifact(value);
  },
  async createDashboard(_projectId, _actorCmsUserId, report) {
    const dashboardId = `support-dashboard-${Date.now()}`;
    dashboards.set(dashboardId, cloneMockArtifact({
      dashboardId,
      dashboardRevisionId: `${dashboardId}-r1`,
      revision: 1,
      name: `Дашборд: ${report.name}`,
      description: report.description,
      report,
    }));
    persistMockArtifact(`dashboard:${dashboardId}`, dashboards.get(dashboardId));
    return {
      dashboardId,
      dashboardRevisionId: `${dashboardId}-r1`,
      receiptId: `receipt-${Date.now()}`,
      revision: 1,
      version: 2,
    };
  },
  async readDashboard(_projectId, id) {
    const value =
      dashboards.get(id) ??
      restoreMockArtifact<SupportDashboardArtifact>(`dashboard:${id}`);
    if (!value) throw new Error("Дашборд не найден");
    return cloneMockArtifact(value);
  },
  async runDashboard(_projectId, dashboard, signal) {
    const { supportAnalyticsSource } = await import("./support-analytics-source");
    return await supportAnalyticsSource.run("project-1", dashboard.report.query, signal);
  },
  async exportReport(_projectId, report) {
    return {
      exportId: `export-${Date.now()}`,
      savedReportRevisionId: report.savedReportRevisionId,
      kind: "EXPORT_REQUESTED",
      lane: "EXPORT",
      status: "QUEUED",
    };
  },
  async scheduleReport() {
    return {
      kind: "SCHEDULE_CHANGED",
      scheduleId: `schedule-${Date.now()}`,
      status: "ACTIVE",
      version: 1,
    };
  },
  async readExport(_projectId, exportId) {
    return {
      exportId,
      kind: "EXPORT_STATUS",
      format: "CSV",
      status: "QUEUED",
      bytes: null,
      rows: null,
      expiresAt: null,
    };
  },
  async cancelExport() {},
  async revokeExport() {},
  async readSchedule(_projectId, scheduleId) {
    return { kind: "SCHEDULE", scheduleId, status: "ACTIVE", timezone: "Europe/Madrid", version: 1 };
  },
  async pauseSchedule(_projectId, scheduleId) {
    return { kind: "SCHEDULE_CHANGED", scheduleId, status: "PAUSED", version: 2 };
  },
  async resumeSchedule(_projectId, scheduleId) {
    return { kind: "SCHEDULE_CHANGED", scheduleId, status: "ACTIVE", version: 3 };
  },
  async archiveSchedule(_projectId, scheduleId) {
    return { kind: "SCHEDULE_CHANGED", scheduleId, status: "ARCHIVED", version: 4 };
  },
  async reportHistory(_projectId, reportId) {
    const report =
      reports.get(reportId) ??
      restoreMockArtifact<SupportSavedArtifact>(`report:${reportId}`);
    return { items: report ? [mockRevision(report)] : [] };
  },
  async duplicateReport(_projectId, reportId, name) {
    const report =
      reports.get(reportId) ??
      restoreMockArtifact<SupportSavedArtifact>(`report:${reportId}`);
    if (!report) throw new Error("Сохранённый отчёт не найден");
    const id = `${reportId}-copy`;
    reports.set(id, { ...report, savedReportId: id, name });
    return id;
  },
  async archiveReport() {},
  async shareDashboard() {
    return `share-${Date.now()}`;
  },
  async revokeDashboardShare() {},
};

function mapRevision(
  report: SavedReportRevisionResponseDto,
): SupportSavedArtifact {
  return {
    savedReportId: report.savedReportId,
    savedReportRevisionId: report.savedReportRevisionId,
    revision: report.revision,
    queryDefinitionHash: report.queryDefinitionHash,
    name: report.document.name,
    description: report.document.description ?? "",
    query: {
      version: 1,
      datasetRevisionId: report.document.query.datasetRevisionId,
      metrics: report.document.query.metrics.slice(0, 8),
      groupBy: report.document.query.groupBy ?? [],
      filters: report.document.query.filters ?? [],
      comparison: report.document.query.comparison,
      order: report.document.query.order,
      limit: report.document.query.limit,
      range: {
        from: new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10),
        until: new Date().toISOString().slice(0, 10),
        grain: "DAY",
        timezone: report.document.query.range.timezone ?? "UTC",
      },
    },
  };
}

function mapDashboard(shell: DashboardShellResponseDto): SupportDashboardArtifact {
  const widget = shell.document.pages[0]?.tabs[0]?.widgets[0];
  if (!widget) throw new Error("В дашборде нет Support-виджета");
  return {
    dashboardId: shell.dashboardId,
    dashboardRevisionId: shell.dashboardRevisionId,
    revision: shell.revision,
    name: shell.document.name,
    description: shell.document.description ?? "",
    report: {
      savedReportId: widget.source.savedReportId,
      savedReportRevisionId: widget.source.savedReportRevisionId,
      revision: widget.source.savedReportRevision,
      queryDefinitionHash: widget.source.queryDefinitionHash,
      name: widget.title,
      description: widget.accessibleSummary,
      query: {
        version: 1,
        datasetRevisionId: "",
        metrics: [],
        groupBy: [],
        filters: [],
        range: {
          from: new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10),
          until: new Date().toISOString().slice(0, 10),
          grain: "DAY",
          timezone: "UTC",
        },
      },
    },
  };
}

export const supportAnalyticsArtifactSource: SupportAnalyticsArtifactSource =
  isMockMode || import.meta.env.MODE === "test"
    ? mockSource
    : supportAnalyticsArtifactApiSource;
