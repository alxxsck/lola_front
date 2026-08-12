import {
  dashboardCreate,
  dashboardArchive,
  dashboardDraftRead,
  dashboardPublish,
  dashboardUpdateDraft,
  dashboardRead,
  dashboardRevisionList,
  dashboardShareCreate,
  dashboardShareList,
  dashboardShareRevoke,
  dashboardInteractionCreate,
  dashboardWidgetResultRead,
  dashboardWidgetDrilldownRead,
  reportExportCreate,
  reportExportCancel,
  reportExportDownload,
  reportExportEstimate,
  reportExportIssueDownloadCapability,
  reportExportRead,
  reportExportRevoke,
  reportScheduleCreate,
  reportScheduleArchive,
  reportSchedulePause,
  reportScheduleRead,
  reportScheduleResume,
  reportScheduleList,
  reportScheduleRunList,
  reportDeliveryList,
  savedReportCreate,
  savedReportArchive,
  savedReportDuplicate,
  savedReportPublish,
  savedReportDraftRead,
  savedReportUpdateDraft,
  savedReportPreview,
  savedReportRead,
  savedReportRevisionList,
} from '@/shared/api/generated/retenive-backend';
import type {
  DashboardCommandResponseDto,
  DashboardDraftResponseDto,
  DashboardDocumentBodyDto,
  DashboardDrilldownResponseDto,
  DashboardShareDto,
  DashboardShareCatalogPageDto,
  DashboardShellResponseDto,
  DashboardRevisionPageResponseDto,
  ReportExportRequestedResponseDto,
  ReportExportStatusResponseDto,
  ReportScheduleChangedResponseDto,
  ReportScheduleCatalogResponseDto,
  ReportScheduleCatalogItemResponseDto,
  ReportScheduleResponseDto,
  ReportScheduleRunHistoryResponseDto,
  ReportDeliveryInboxResponseDto,
  ReportingQueryDefinitionDto,
  ReportingQueryResultResponseDto,
  SavedReportRevisionResponseDto,
  SavedReportDraftResponseDto,
  SavedReportDocumentBodyDto,
  SavedReportRevisionPageResponseDto,
} from '@/shared/api/generated/models';
import { normalizeApiError } from '@/shared/api/http/api-error';
import { noAuthRetryRequestOptions } from '@/shared/api/http/axios-instance';
import { isMockMode } from '@/shared/config/data-mode';

export interface SupportSavedArtifact {
  savedReportId: string;
  savedReportRevisionId: string;
  revision: number;
  queryDefinitionHash: string;
  name: string;
  description: string;
  query: ReportingQueryDefinitionDto;
}

export interface SupportSavedReportDraft {
  savedReportId: string;
  draftVersion: number;
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
export interface SupportScheduleInput {
  timezone: string;
  localTime: string;
  format: 'CSV' | 'XLSX' | 'PDF' | 'PNG';
}

export interface SupportAnalyticsArtifactSource {
  createReportDraft(
    projectId: string,
    name: string,
    description: string,
    query: ReportingQueryDefinitionDto,
  ): Promise<SupportSavedReportDraft>;
  publishReport(projectId: string, draft: SupportSavedReportDraft): Promise<SupportSavedArtifact>;
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
  readReportDraft(
    projectId: string,
    reportId: string,
    signal?: AbortSignal,
  ): Promise<SavedReportDraftResponseDto>;
  updateReportDraft(
    projectId: string,
    reportId: string,
    document: SavedReportDocumentBodyDto,
  ): Promise<void>;
  createDashboard(
    projectId: string,
    actorCmsUserId: string,
    report: SupportSavedArtifact,
  ): Promise<DashboardCommandResponseDto>;
  createDashboardDraft(
    projectId: string,
    actorCmsUserId: string,
    report: SupportSavedArtifact,
  ): Promise<DashboardCommandResponseDto>;
  publishDashboard(projectId: string, dashboardId: string): Promise<DashboardCommandResponseDto>;
  readDashboard(
    projectId: string,
    dashboardId: string,
    signal?: AbortSignal,
  ): Promise<SupportDashboardArtifact>;
  readDashboardDraft(
    projectId: string,
    dashboardId: string,
    signal?: AbortSignal,
  ): Promise<DashboardDraftResponseDto>;
  updateDashboardDraft(
    projectId: string,
    dashboardId: string,
    document: DashboardDocumentBodyDto,
  ): Promise<void>;
  dashboardHistory(
    projectId: string,
    dashboardId: string,
  ): Promise<DashboardRevisionPageResponseDto>;
  archiveDashboard(projectId: string, dashboardId: string, version: number): Promise<void>;
  runDashboard(
    projectId: string,
    dashboard: SupportDashboardArtifact,
    signal?: AbortSignal,
  ): Promise<ReportingQueryResultResponseDto>;
  drilldownDashboard(
    projectId: string,
    dashboard: SupportDashboardArtifact,
    day: string,
    currency: string,
    signal?: AbortSignal,
  ): Promise<DashboardDrilldownResponseDto>;
  exportReport(
    projectId: string,
    report: SupportSavedArtifact,
    format: 'CSV' | 'XLSX' | 'PDF' | 'PNG',
    highCostConfirmed?: boolean,
  ): Promise<ReportExportRequestedResponseDto>;
  scheduleReport(
    projectId: string,
    actorCmsUserId: string,
    report: SupportSavedArtifact,
    input: SupportScheduleInput,
  ): Promise<ReportScheduleChangedResponseDto>;
  readExport(projectId: string, exportId: string): Promise<ReportExportStatusResponseDto>;
  downloadExport(projectId: string, exportId: string): Promise<Blob>;
  cancelExport(projectId: string, exportId: string): Promise<void>;
  revokeExport(projectId: string, exportId: string): Promise<void>;
  readSchedule(projectId: string, scheduleId: string): Promise<ReportScheduleResponseDto>;
  listSchedules(
    projectId: string,
    beforeScheduleId?: string,
  ): Promise<ReportScheduleCatalogResponseDto>;
  listScheduleRuns(
    projectId: string,
    scheduleId: string,
    beforeRunId?: string,
  ): Promise<ReportScheduleRunHistoryResponseDto>;
  listDeliveries(
    projectId: string,
    beforeDeliveryId?: string,
  ): Promise<ReportDeliveryInboxResponseDto>;
  pauseSchedule(projectId: string, scheduleId: string): Promise<ReportScheduleChangedResponseDto>;
  resumeSchedule(projectId: string, scheduleId: string): Promise<ReportScheduleChangedResponseDto>;
  archiveSchedule(projectId: string, scheduleId: string): Promise<ReportScheduleChangedResponseDto>;
  reportHistory(
    projectId: string,
    reportId: string,
    beforeRevision?: number,
  ): Promise<SavedReportRevisionPageResponseDto>;
  duplicateReport(projectId: string, reportId: string, name: string): Promise<string>;
  archiveReport(projectId: string, reportId: string): Promise<void>;
  shareDashboard(
    projectId: string,
    dashboardId: string,
    target: DashboardShareDto,
  ): Promise<string>;
  listDashboardShares(
    projectId: string,
    dashboardId: string,
    beforeShareId?: string,
  ): Promise<DashboardShareCatalogPageDto>;
  revokeDashboardShare(projectId: string, dashboardId: string, shareId: string): Promise<void>;
}

const artifactAttempts = new Map<string, { key: string; expiresAt: number }>();
const dashboardInteractions = new Map<string, string>();
const dashboardRunAttempts = new Map<string, { interactionId: string; expiresAt: number }>();

function dashboardInteractionKey(projectId: string, dashboard: SupportDashboardArtifact): string {
  return `${projectId}:${dashboard.dashboardId}:${dashboard.dashboardRevisionId}`;
}

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
  const attempt =
    retained && retained.expiresAt > now
      ? retained
      : { key: crypto.randomUUID(), expiresAt: now + 5 * 60_000 };
  artifactAttempts.set(signature, attempt);
  return {
    ...noAuthRetryRequestOptions(),
    headers: { 'Idempotency-Key': attempt.key },
  };
}

function reportDocument(name: string, description: string, query: ReportingQueryDefinitionDto) {
  const defaultDays = calendarDayDistance(query.range.from, query.range.until);
  return {
    document: {
      version: 3 as const,
      name,
      description,
      presentation: {
        version: 3 as const,
        table: {
          kind: 'TABLE' as const,
          columns: [...query.groupBy, ...query.metrics],
          sort: [
            {
              field: query.groupBy[0] ?? query.metrics[0]!,
              direction: 'ASC' as const,
            },
            { field: query.metrics[0]!, direction: 'DESC' as const },
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
          kind: 'LAST_COMPLETE_DAYS' as const,
          defaultDays,
          grain: 'DAY' as const,
          timezone: query.range.timezone,
        },
      },
    },
  };
}

function calendarDayDistance(from: string, until: string): number {
  const fromTime = Date.parse(`${from}T00:00:00.000Z`);
  const untilTime = Date.parse(`${until}T00:00:00.000Z`);
  const days = (untilTime - fromTime) / 86_400_000;
  if (!Number.isInteger(days) || days < 1 || days > 366)
    throw new Error('Период отчёта должен содержать от 1 до 366 полных дней');
  return days;
}

function dashboardDocument(report: SupportSavedArtifact) {
  return {
    version: 1 as const,
    name: `Дашборд: ${report.name}`,
    description: report.description,
    globalFilters: [],
    pages: [
      {
        id: 'overview',
        title: 'Обзор',
        tabs: [
          {
            id: 'main',
            title: 'Основное',
            widgets: [
              {
                id: 'quality',
                title: report.name,
                accessibleSummary: `${report.name}. ${report.description}`,
                filterBindings: [],
                layout: { column: 0, row: 0, width: 12, height: 6 },
                loading: {
                  activation: 'VIEWPORT' as const,
                  reducedMotion: 'DATA_IMMEDIATE' as const,
                },
                source: {
                  savedReportId: report.savedReportId,
                  savedReportRevision: report.revision,
                  savedReportRevisionId: report.savedReportRevisionId,
                  queryDefinitionHash: report.queryDefinitionHash,
                  presentation: 'TABLE' as const,
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
  async createReportDraft(projectId, name, description, query) {
    try {
      const intent = { name, description, query };
      const created = await savedReportCreate(
        projectId,
        reportDocument(name, description, query),
        commandOptions('saved-report-create', intent),
      );
      completeAttempt('saved-report-create', intent);
      return {
        savedReportId: created.savedReportId,
        draftVersion: created.draftVersion,
        name,
        description,
        query,
      };
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async publishReport(projectId, draft) {
    try {
      const intent = { savedReportId: draft.savedReportId };
      const published = await savedReportPublish(
        projectId,
        draft.savedReportId,
        commandOptions('saved-report-publish', intent),
      );
      completeAttempt('saved-report-publish', intent);
      return {
        savedReportId: published.savedReportId,
        savedReportRevisionId: published.savedReportRevisionId,
        revision: published.revision,
        queryDefinitionHash: published.queryDefinitionHash,
        name: draft.name,
        description: draft.description,
        query: draft.query,
      };
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async saveAndPublishReport(projectId, name, description, query) {
    const draft = await supportAnalyticsArtifactApiSource.createReportDraft(
      projectId,
      name,
      description,
      query,
    );
    return supportAnalyticsArtifactApiSource.publishReport(projectId, draft);
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
  async readReportDraft(projectId, reportId, signal) {
    try {
      return await savedReportDraftRead(projectId, reportId, signal ? { signal } : undefined);
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async updateReportDraft(projectId, reportId, document) {
    try {
      const intent = { reportId, document };
      await savedReportUpdateDraft(
        projectId,
        reportId,
        { document },
        commandOptions('saved-report-update-draft', intent),
      );
      completeAttempt('saved-report-update-draft', intent);
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async createDashboardDraft(projectId, actorCmsUserId, report) {
    try {
      const intent = {
        actorCmsUserId,
        savedReportRevisionId: report.savedReportRevisionId,
      };
      const created = await dashboardCreate(
        projectId,
        {
          collectionId: null,
          space: { kind: 'PERSONAL', ownerCmsUserId: actorCmsUserId },
          document: dashboardDocument(report),
        },
        commandOptions('dashboard-create', intent),
      );
      completeAttempt('dashboard-create', intent);
      return created;
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async publishDashboard(projectId, dashboardId) {
    try {
      const published = await dashboardPublish(
        projectId,
        dashboardId,
        { acknowledgeCostWarnings: true },
        commandOptions('dashboard-publish', { dashboardId }),
      );
      completeAttempt('dashboard-publish', { dashboardId });
      return published;
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async createDashboard(projectId, actorCmsUserId, report) {
    const draft = await supportAnalyticsArtifactApiSource.createDashboardDraft(
      projectId,
      actorCmsUserId,
      report,
    );
    return supportAnalyticsArtifactApiSource.publishDashboard(projectId, draft.dashboardId);
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
  async readDashboardDraft(projectId, dashboardId, signal) {
    try {
      return await dashboardDraftRead(projectId, dashboardId, signal ? { signal } : undefined);
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async updateDashboardDraft(projectId, dashboardId, document) {
    try {
      const intent = { dashboardId, document };
      await dashboardUpdateDraft(
        projectId,
        dashboardId,
        { document },
        commandOptions('dashboard-update-draft', intent),
      );
      completeAttempt('dashboard-update-draft', intent);
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async dashboardHistory(projectId, dashboardId) {
    try {
      return await dashboardRevisionList(projectId, dashboardId);
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async archiveDashboard(projectId, dashboardId, version) {
    const intent = { dashboardId, version };
    try {
      const options = commandOptions('dashboard-archive', intent);
      await dashboardArchive(projectId, dashboardId, {
        ...options,
        headers: {
          ...options.headers,
          'If-Match': `"${version}"`,
        },
      });
      completeAttempt('dashboard-archive', intent);
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async runDashboard(projectId, dashboard, signal) {
    const runKey = dashboardInteractionKey(projectId, dashboard);
    const retained = dashboardRunAttempts.get(runKey);
    const now = Date.now();
    const attempt =
      retained && retained.expiresAt > now
        ? retained
        : { interactionId: crypto.randomUUID(), expiresAt: now + 5 * 60_000 };
    dashboardRunAttempts.set(runKey, attempt);
    const interactionIntent = {
      dashboardRevisionId: dashboard.dashboardRevisionId,
      interactionId: attempt.interactionId,
    };
    try {
      await dashboardInteractionCreate(
        projectId,
        dashboard.dashboardId,
        {
          dashboardRevisionId: dashboard.dashboardRevisionId,
          interactionId: attempt.interactionId,
          pageId: 'overview',
          tabId: 'main',
          widgetIds: ['quality'],
          filters: {
            periodDays: calendarDayDistance(
              dashboard.report.query.range.from,
              dashboard.report.query.range.until,
            ),
          },
        },
        {
          ...commandOptions('dashboard-interaction', interactionIntent),
          ...(signal ? { signal } : {}),
        },
      );
      dashboardInteractions.set(
        dashboardInteractionKey(projectId, dashboard),
        attempt.interactionId,
      );
      const deadline = Date.now() + 60_000;
      while (Date.now() < deadline) {
        const widget = await dashboardWidgetResultRead(
          projectId,
          dashboard.dashboardId,
          attempt.interactionId,
          'quality',
          { dashboardRevisionId: dashboard.dashboardRevisionId },
          signal ? { signal } : undefined,
        );
        if (!['QUEUED', 'RUNNING'].includes(widget.status)) {
          dashboardRunAttempts.delete(runKey);
          completeAttempt('dashboard-interaction', interactionIntent);
          return widget;
        }
        await new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(resolve, widget.retryAfterMs ?? 350);
          signal?.addEventListener(
            'abort',
            () => {
              window.clearTimeout(timer);
              reject(new DOMException('Aborted', 'AbortError'));
            },
            { once: true },
          );
        });
      }
      throw new Error('Widget не завершился за минуту');
    } catch (cause) {
      const error = normalizeApiError(cause);
      if (error.status > 0 && error.status < 500 && ![408, 425, 429].includes(error.status)) {
        dashboardRunAttempts.delete(runKey);
        completeAttempt('dashboard-interaction', interactionIntent);
      }
      throw error;
    }
  },
  async drilldownDashboard(projectId, dashboard, day, currency, signal) {
    const interactionId = dashboardInteractions.get(dashboardInteractionKey(projectId, dashboard));
    if (!interactionId) throw new Error('Сначала дождитесь результата закреплённого виджета');
    try {
      return await dashboardWidgetDrilldownRead(
        projectId,
        dashboard.dashboardId,
        interactionId,
        'quality',
        {
          dashboardRevisionId: dashboard.dashboardRevisionId,
          day,
          currency,
        },
        signal ? { signal } : undefined,
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async exportReport(projectId, report, format, highCostConfirmed = false) {
    try {
      const preview = await savedReportPreview(projectId, report.savedReportId, {
        periodDays: calendarDayDistance(report.query.range.from, report.query.range.until),
      });
      const estimate = await reportExportEstimate(projectId, {
        savedReportId: report.savedReportId,
        savedReportRevisionId: report.savedReportRevisionId,
        expectedQueryHash: preview.estimate.canonicalQueryHash,
        format,
        resolvedCurrencies: preview.resolvedCurrencies,
        resolvedRange: preview.resolvedRange,
      });
      if (estimate.highCostConfirmationRequired && !highCostConfirmed)
        throw new Error('Экспорт требует отдельного подтверждения высокой стоимости');
      const intent = {
        savedReportRevisionId: report.savedReportRevisionId,
        format,
        queryHash: preview.estimate.canonicalQueryHash,
        range: preview.resolvedRange,
      };
      const receipt = await reportExportCreate(
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
        commandOptions('report-export', intent),
      );
      completeAttempt('report-export', intent);
      return receipt;
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async scheduleReport(projectId, actorCmsUserId, report, input) {
    try {
      const intent = {
        actorCmsUserId,
        savedReportRevisionId: report.savedReportRevisionId,
        input,
      };
      const receipt = await reportScheduleCreate(
        projectId,
        {
          savedReportId: report.savedReportId,
          savedReportRevisionId: report.savedReportRevisionId,
          name: `Ежедневно: ${report.name}`,
          format: input.format,
          maximumRows: 10_000,
          maximumBytes: 10_000_000,
          highCostConfirmed: false,
          recurrence: {
            kind: 'DAILY',
            localTime: input.localTime,
            timezone: input.timezone,
          },
          target: { kind: 'IN_APP', cmsUserId: actorCmsUserId },
        },
        commandOptions('report-schedule', intent),
      );
      completeAttempt('report-schedule', intent);
      return receipt;
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
  async downloadExport(projectId, exportId) {
    try {
      const capability = await reportExportIssueDownloadCapability(
        projectId,
        exportId,
        commandOptions('export-download-capability', { exportId }),
      );
      completeAttempt('export-download-capability', { exportId });
      return await reportExportDownload(projectId, exportId, {
        ...noAuthRetryRequestOptions(),
        headers: { 'x-download-capability': capability.downloadCapability },
      });
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async cancelExport(projectId, exportId) {
    try {
      await reportExportCancel(projectId, exportId, commandOptions('export-cancel', { exportId }));
      completeAttempt('export-cancel', { exportId });
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async revokeExport(projectId, exportId) {
    try {
      await reportExportRevoke(projectId, exportId, commandOptions('export-revoke', { exportId }));
      completeAttempt('export-revoke', { exportId });
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
  async listSchedules(projectId, beforeScheduleId) {
    try {
      return await reportScheduleList(projectId, {
        limit: 50,
        ...(beforeScheduleId ? { before: beforeScheduleId } : {}),
      });
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async listScheduleRuns(projectId, scheduleId, beforeRunId) {
    try {
      return await reportScheduleRunList(projectId, scheduleId, {
        limit: 50,
        ...(beforeRunId ? { before: beforeRunId } : {}),
      });
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async listDeliveries(projectId, beforeDeliveryId) {
    try {
      return await reportDeliveryList(projectId, {
        limit: 50,
        ...(beforeDeliveryId ? { before: beforeDeliveryId } : {}),
      });
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async pauseSchedule(projectId, scheduleId) {
    try {
      const receipt = await reportSchedulePause(
        projectId,
        scheduleId,
        commandOptions('schedule-pause', { scheduleId }),
      );
      completeAttempt('schedule-pause', { scheduleId });
      return receipt;
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async resumeSchedule(projectId, scheduleId) {
    try {
      const receipt = await reportScheduleResume(
        projectId,
        scheduleId,
        commandOptions('schedule-resume', { scheduleId }),
      );
      completeAttempt('schedule-resume', { scheduleId });
      return receipt;
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async archiveSchedule(projectId, scheduleId) {
    try {
      const receipt = await reportScheduleArchive(
        projectId,
        scheduleId,
        commandOptions('schedule-archive', { scheduleId }),
      );
      completeAttempt('schedule-archive', { scheduleId });
      return receipt;
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async reportHistory(projectId, reportId, beforeRevision) {
    try {
      return await savedReportRevisionList(projectId, reportId, {
        limit: 50,
        ...(beforeRevision ? { before: beforeRevision } : {}),
      });
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
        commandOptions('saved-report-duplicate', { reportId, name }),
      );
      completeAttempt('saved-report-duplicate', { reportId, name });
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
        commandOptions('saved-report-archive', { reportId }),
      );
      completeAttempt('saved-report-archive', { reportId });
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async shareDashboard(projectId, dashboardId, target) {
    try {
      const result = await dashboardShareCreate(
        projectId,
        dashboardId,
        target,
        commandOptions('dashboard-share', { dashboardId, target }),
      );
      if (!result.shareId) throw new Error('Backend не вернул share ID');
      completeAttempt('dashboard-share', { dashboardId, target });
      return result.shareId;
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async listDashboardShares(projectId, dashboardId, beforeShareId) {
    try {
      return await dashboardShareList(projectId, dashboardId, {
        limit: 50,
        ...(beforeShareId ? { beforeShareId } : {}),
      });
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
        commandOptions('dashboard-share-revoke', { dashboardId, shareId }),
      );
      completeAttempt('dashboard-share-revoke', { dashboardId, shareId });
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
};

const reports = new Map<string, SupportSavedArtifact>();
const dashboards = new Map<string, SupportDashboardArtifact>();
const reportDrafts = new Map<string, SupportSavedReportDraft>();
const dashboardDrafts = new Map<string, SupportSavedArtifact>();
const mockSchedules = new Map<string, ReportScheduleCatalogItemResponseDto>();

function persistMockArtifact(key: string, value: unknown): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(`support-analytics:${key}`, JSON.stringify(value));
}

function restoreMockArtifact<T>(key: string): T | undefined {
  if (typeof sessionStorage === 'undefined') return undefined;
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
    semanticDigest: 'mock-semantic-digest',
    document: reportDocument(report.name, report.description, report.query).document,
  };
}

const mockSource: SupportAnalyticsArtifactSource = {
  async createReportDraft(_projectId, name, description, query) {
    const savedReportId = `support-report-${Date.now()}`;
    const draft = { savedReportId, draftVersion: 1, name, description, query };
    reportDrafts.set(savedReportId, draft);
    return cloneMockArtifact(draft);
  },
  async publishReport(_projectId, draft) {
    const value: SupportSavedArtifact = {
      savedReportId: draft.savedReportId,
      savedReportRevisionId: `${draft.savedReportId}-r1`,
      revision: 1,
      queryDefinitionHash: 'e'.repeat(64),
      name: draft.name,
      description: draft.description,
      query: draft.query,
    };
    reports.set(draft.savedReportId, value);
    reportDrafts.delete(draft.savedReportId);
    persistMockArtifact(`report:${draft.savedReportId}`, value);
    return cloneMockArtifact(value);
  },
  async saveAndPublishReport(projectId, name, description, query) {
    const draft = await mockSource.createReportDraft(projectId, name, description, query);
    return mockSource.publishReport(projectId, draft);
  },
  async readReport(_projectId, id) {
    const value = reports.get(id) ?? restoreMockArtifact<SupportSavedArtifact>(`report:${id}`);
    if (!value) throw new Error('Сохранённый отчёт не найден');
    return cloneMockArtifact(value);
  },
  async readReportDraft(_projectId, id) {
    const draft = reportDrafts.get(id);
    const published = reports.get(id);
    if (!draft && !published) throw new Error('Черновик отчёта не найден');
    const source = draft ?? {
      savedReportId: id,
      draftVersion: 1,
      name: published!.name,
      description: published!.description,
      query: published!.query,
    };
    return {
      savedReportId: id,
      draftVersion: source.draftVersion,
      actionEtag: 'mock-etag',
      baseRevisionId: published?.savedReportRevisionId ?? null,
      allowedActions: ['EDIT', 'PUBLISH'],
      document: reportDocument(source.name, source.description, source.query).document,
    };
  },
  async updateReportDraft(_projectId, id, document) {
    const query = reports.get(id)?.query ?? reportDrafts.get(id)?.query;
    if (!query) throw new Error('Черновик отчёта не найден');
    reportDrafts.set(id, {
      savedReportId: id,
      draftVersion: (reportDrafts.get(id)?.draftVersion ?? 0) + 1,
      name: document.name,
      description: document.description ?? '',
      query,
    });
  },
  async createDashboardDraft(_projectId, _actorCmsUserId, report) {
    const dashboardId = `support-dashboard-${Date.now()}`;
    dashboardDrafts.set(dashboardId, cloneMockArtifact(report));
    return {
      dashboardId,
      receiptId: `receipt-${Date.now()}`,
      version: 1,
    };
  },
  async publishDashboard(_projectId, dashboardId) {
    const report = dashboardDrafts.get(dashboardId);
    if (!report) throw new Error('Черновик дашборда не найден');
    dashboards.set(
      dashboardId,
      cloneMockArtifact({
        dashboardId,
        dashboardRevisionId: `${dashboardId}-r1`,
        revision: 1,
        name: `Дашборд: ${report.name}`,
        description: report.description,
        report,
      }),
    );
    persistMockArtifact(`dashboard:${dashboardId}`, dashboards.get(dashboardId));
    dashboardDrafts.delete(dashboardId);
    return {
      dashboardId,
      dashboardRevisionId: `${dashboardId}-r1`,
      receiptId: `receipt-${Date.now()}`,
      revision: 1,
      version: 2,
    };
  },
  async readDashboardDraft(_projectId, dashboardId) {
    const report = dashboardDrafts.get(dashboardId) ?? dashboards.get(dashboardId)?.report;
    if (!report) throw new Error('Черновик панели не найден');
    return {
      dashboardId,
      version: 1,
      allowedActions: ['EDIT', 'PUBLISH'],
      document: dashboardDocument(report),
    };
  },
  async updateDashboardDraft(_projectId, dashboardId, document) {
    const report = dashboardDrafts.get(dashboardId) ?? dashboards.get(dashboardId)?.report;
    if (!report) throw new Error('Черновик панели не найден');
    dashboardDrafts.set(dashboardId, {
      ...report,
      name: document.name,
      description: document.description ?? '',
    });
  },
  async dashboardHistory(_projectId, dashboardId) {
    const dashboard = dashboards.get(dashboardId);
    return {
      items: dashboard
        ? [
            {
              dashboardId,
              dashboardRevisionId: dashboard.dashboardRevisionId,
              revision: dashboard.revision,
              document: dashboardDocument(dashboard.report),
              widgets: [],
            },
          ]
        : [],
    };
  },
  async archiveDashboard(_projectId, dashboardId) {
    dashboards.delete(dashboardId);
    dashboardDrafts.delete(dashboardId);
  },
  async createDashboard(projectId, actorCmsUserId, report) {
    const draft = await mockSource.createDashboardDraft(projectId, actorCmsUserId, report);
    return mockSource.publishDashboard(projectId, draft.dashboardId);
  },
  async readDashboard(_projectId, id) {
    const value =
      dashboards.get(id) ?? restoreMockArtifact<SupportDashboardArtifact>(`dashboard:${id}`);
    if (!value) throw new Error('Дашборд не найден');
    return cloneMockArtifact(value);
  },
  async runDashboard(_projectId, dashboard, signal) {
    const { supportAnalyticsSource } = await import('./support-analytics-source');
    return await supportAnalyticsSource.run('project-1', dashboard.report.query, signal);
  },
  async drilldownDashboard(_projectId, _dashboard, day, currency) {
    return {
      status: 'READY',
      interactionId: 'mock-interaction',
      runId: 'mock-run',
      day,
      currency,
      metrics: [],
      breadcrumb: {
        dashboardId: _dashboard.dashboardId,
        dashboardRevisionId: _dashboard.dashboardRevisionId,
        pageId: 'overview',
        tabId: 'main',
        widgetId: 'quality',
      },
      reset: {
        dashboardId: _dashboard.dashboardId,
        dashboardRevisionId: _dashboard.dashboardRevisionId,
        pageId: 'overview',
        tabId: 'main',
      },
    };
  },
  async exportReport(_projectId, report) {
    return {
      exportId: `export-${Date.now()}`,
      savedReportRevisionId: report.savedReportRevisionId,
      kind: 'EXPORT_REQUESTED',
      lane: 'EXPORT',
      status: 'QUEUED',
    };
  },
  async scheduleReport(_projectId, _actorCmsUserId, report, input) {
    const scheduleId = `schedule-${Date.now()}`;
    mockSchedules.set(scheduleId, {
      scheduleId,
      name: `Ежедневно: ${report.name}`,
      status: 'ACTIVE',
      timezone: input.timezone,
      format: input.format,
      version: 1,
      updatedAt: new Date().toISOString(),
    });
    return {
      kind: 'SCHEDULE_CHANGED',
      scheduleId,
      status: 'ACTIVE',
      version: 1,
    };
  },
  async readExport(_projectId, exportId) {
    return {
      exportId,
      kind: 'EXPORT_STATUS',
      format: 'CSV',
      status: 'READY',
      bytes: 29,
      rows: 7,
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    };
  },
  async downloadExport() {
    return new Blob(['mock support analytics export'], { type: 'text/csv' });
  },
  async cancelExport() {},
  async revokeExport() {},
  async readSchedule(_projectId, scheduleId) {
    const current = mockSchedules.get(scheduleId);
    return {
      kind: 'SCHEDULE',
      scheduleId,
      status: current?.status ?? 'ACTIVE',
      timezone: current?.timezone ?? 'Europe/Madrid',
      version: current?.version ?? 1,
    };
  },
  async listSchedules() {
    return {
      kind: 'SCHEDULE_CATALOG',
      schedules: [...mockSchedules.values()],
    };
  },
  async listScheduleRuns(_projectId, scheduleId) {
    return { kind: 'RUN_HISTORY', scheduleId, runs: [] };
  },
  async listDeliveries() {
    return { kind: 'IN_APP_INBOX', deliveries: [] };
  },
  async pauseSchedule(_projectId, scheduleId) {
    const current = mockSchedules.get(scheduleId);
    if (current)
      mockSchedules.set(scheduleId, {
        ...current,
        status: 'PAUSED',
        version: current.version + 1,
      });
    return {
      kind: 'SCHEDULE_CHANGED',
      scheduleId,
      status: 'PAUSED',
      version: 2,
    };
  },
  async resumeSchedule(_projectId, scheduleId) {
    const current = mockSchedules.get(scheduleId);
    if (current)
      mockSchedules.set(scheduleId, {
        ...current,
        status: 'ACTIVE',
        version: current.version + 1,
      });
    return {
      kind: 'SCHEDULE_CHANGED',
      scheduleId,
      status: 'ACTIVE',
      version: 3,
    };
  },
  async archiveSchedule(_projectId, scheduleId) {
    const current = mockSchedules.get(scheduleId);
    if (current)
      mockSchedules.set(scheduleId, {
        ...current,
        status: 'ARCHIVED',
        version: current.version + 1,
      });
    return {
      kind: 'SCHEDULE_CHANGED',
      scheduleId,
      status: 'ARCHIVED',
      version: 4,
    };
  },
  async reportHistory(_projectId, reportId, beforeRevision) {
    const report =
      reports.get(reportId) ?? restoreMockArtifact<SupportSavedArtifact>(`report:${reportId}`);
    return {
      items:
        report && (!beforeRevision || beforeRevision > report.revision)
          ? [mockRevision(report)]
          : [],
    };
  },
  async duplicateReport(_projectId, reportId, name) {
    const report =
      reports.get(reportId) ?? restoreMockArtifact<SupportSavedArtifact>(`report:${reportId}`);
    if (!report) throw new Error('Сохранённый отчёт не найден');
    const id = `${reportId}-copy`;
    reports.set(id, { ...report, savedReportId: id, name });
    return id;
  },
  async archiveReport() {},
  async shareDashboard() {
    return `share-${Date.now()}`;
  },
  async listDashboardShares() {
    return { items: [], nextBeforeShareId: undefined };
  },
  async revokeDashboardShare() {},
};

function mapRevision(report: SavedReportRevisionResponseDto): SupportSavedArtifact {
  return {
    savedReportId: report.savedReportId,
    savedReportRevisionId: report.savedReportRevisionId,
    revision: report.revision,
    queryDefinitionHash: report.queryDefinitionHash,
    name: report.document.name,
    description: report.document.description ?? '',
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
        grain: 'DAY',
        timezone: report.document.query.range.timezone ?? 'UTC',
      },
    },
  };
}

function mapDashboard(shell: DashboardShellResponseDto): SupportDashboardArtifact {
  const widget = shell.document.pages[0]?.tabs[0]?.widgets[0];
  if (!widget) throw new Error('В дашборде нет Support-виджета');
  return {
    dashboardId: shell.dashboardId,
    dashboardRevisionId: shell.dashboardRevisionId,
    revision: shell.revision,
    name: shell.document.name,
    description: shell.document.description ?? '',
    report: {
      savedReportId: widget.source.savedReportId,
      savedReportRevisionId: widget.source.savedReportRevisionId,
      revision: widget.source.savedReportRevision,
      queryDefinitionHash: widget.source.queryDefinitionHash,
      name: widget.title,
      description: widget.accessibleSummary,
      query: {
        version: 1,
        datasetRevisionId: '',
        metrics: [],
        groupBy: [],
        filters: [],
        range: {
          from: new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10),
          until: new Date().toISOString().slice(0, 10),
          grain: 'DAY',
          timezone: 'UTC',
        },
      },
    },
  };
}

export const supportAnalyticsArtifactSource: SupportAnalyticsArtifactSource =
  isMockMode || import.meta.env.MODE === 'test' ? mockSource : supportAnalyticsArtifactApiSource;
