import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  dashboardInteractionCreate,
  dashboardWidgetDrilldownRead,
  dashboardWidgetResultRead,
  reportExportCreate,
  reportExportDownload,
  reportExportEstimate,
  reportExportIssueDownloadCapability,
  reportScheduleCreate,
  savedReportRevisionList,
  savedReportPreview,
} from "@/shared/api/generated/retenive-backend";
import { supportAnalyticsArtifactApiSource } from "./support-analytics-artifact-source";
import { ApiError } from "@/shared/api/http/api-error";

vi.mock("@/shared/api/generated/retenive-backend", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/shared/api/generated/retenive-backend")
  >()),
  savedReportPreview: vi.fn(),
  reportExportEstimate: vi.fn(),
  reportExportCreate: vi.fn(),
  reportExportDownload: vi.fn(),
  reportExportIssueDownloadCapability: vi.fn(),
  reportScheduleCreate: vi.fn(),
  savedReportRevisionList: vi.fn(),
  dashboardInteractionCreate: vi.fn(),
  dashboardWidgetResultRead: vi.fn(),
  dashboardWidgetDrilldownRead: vi.fn(),
}));

describe("supportAnalyticsArtifactApiSource", () => {
  beforeEach(() => vi.clearAllMocks());

  it("pins export to the prepared runtime query hash and estimate bounds", async () => {
    vi.mocked(savedReportPreview).mockResolvedValue({
      report: {} as never,
      estimate: {
        canonicalQueryHash: "a".repeat(64),
        estimatedSourceRows: 7,
        estimatedResultRows: 7,
        estimatedResultBytes: 700,
        freshness: "FRESH",
        highCostConfirmationRequired: false,
        incompatibleFields: [],
        plan: "bounded",
        requestHash: "c".repeat(64),
        route: "SYNC",
        workloadLane: "INTERACTIVE",
      },
      resolvedCurrencies: [],
      resolvedRange: { fromDay: "2026-08-01", untilDay: "2026-08-08" },
    });
    vi.mocked(reportExportEstimate).mockResolvedValue({
      artifactTtlSeconds: 900,
      downloadTtlSeconds: 60,
      format: "CSV",
      highCostConfirmationRequired: false,
      lane: "EXPORT",
      maximumBytes: 2_000,
      maximumRows: 20,
    });
    vi.mocked(reportExportCreate).mockResolvedValue({
      exportId: "export-1",
      kind: "EXPORT_REQUESTED",
      lane: "EXPORT",
      savedReportRevisionId: "report-r1",
      status: "QUEUED",
    });
    await supportAnalyticsArtifactApiSource.exportReport(
      "project-1",
      {
        savedReportId: "report-1",
        savedReportRevisionId: "report-r1",
        revision: 1,
        queryDefinitionHash: "b".repeat(64),
        name: "Quality",
        description: "",
        query: {} as never,
      },
      "CSV",
    );
    expect(vi.mocked(reportExportCreate).mock.calls[0]![1]).toMatchObject({
      expectedQueryHash: "a".repeat(64),
      maximumRows: 20,
      maximumBytes: 2_000,
      resolvedRange: { fromDay: "2026-08-01", untilDay: "2026-08-08" },
    });
  });

  it("issues a short-lived capability before downloading a completed export", async () => {
    vi.mocked(reportExportIssueDownloadCapability).mockResolvedValue({
      exportId: "export-1",
      downloadCapability: "capability-1",
      expiresAt: "2026-08-12T12:01:00.000Z",
    });
    vi.mocked(reportExportDownload).mockResolvedValue(new Blob(["report"]));

    const blob = await supportAnalyticsArtifactApiSource.downloadExport(
      "project-1",
      "export-1",
    );

    expect(blob.size).toBe(6);
    expect(reportExportDownload).toHaveBeenCalledWith(
      "project-1",
      "export-1",
      expect.objectContaining({
        headers: { "x-download-capability": "capability-1" },
      }),
    );
  });

  it("preserves the chosen time, timezone and format in a schedule", async () => {
    vi.mocked(reportScheduleCreate).mockResolvedValue({
      kind: "SCHEDULE_CHANGED",
      scheduleId: "schedule-1",
      status: "ACTIVE",
      version: 1,
    });
    const report = {
      savedReportId: "report-1",
      savedReportRevisionId: "report-r1",
      revision: 1,
      queryDefinitionHash: "b".repeat(64),
      name: "Качество",
      description: "",
      query: {} as never,
    };

    await supportAnalyticsArtifactApiSource.scheduleReport(
      "project-1",
      "user-1",
      report,
      { timezone: "Europe/Madrid", localTime: "08:30", format: "XLSX" },
    );

    expect(reportScheduleCreate).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        format: "XLSX",
        recurrence: {
          kind: "DAILY",
          localTime: "08:30",
          timezone: "Europe/Madrid",
        },
      }),
      expect.anything(),
    );
  });

  it("pages immutable report history with the closed backend limits", async () => {
    vi.mocked(savedReportRevisionList).mockResolvedValue({ items: [] });

    await supportAnalyticsArtifactApiSource.reportHistory(
      "project-1",
      "report-1",
      51,
    );

    expect(savedReportRevisionList).toHaveBeenCalledWith(
      "project-1",
      "report-1",
      { before: 51, limit: 50 },
    );
  });

  it("uses the authoritative dashboard interaction for a day drilldown", async () => {
    vi.mocked(dashboardInteractionCreate).mockResolvedValue({
      dashboardId: "dashboard-1",
      dashboardRevisionId: "dashboard-r1",
      interactionId: "interaction-1",
      receiptId: "receipt-1",
      status: "QUEUED",
      widgets: [],
    } as never);
    vi.mocked(dashboardWidgetResultRead).mockResolvedValue({
      status: "READY",
      result: { version: 1, rows: [] },
      receipt: {} as never,
      interactionId: "interaction-1",
      runId: "run-1",
      widgetId: "quality",
    } as never);
    vi.mocked(dashboardWidgetDrilldownRead).mockResolvedValue({
      status: "READY",
      interactionId: "interaction-1",
      runId: "run-1",
      day: "2026-08-12",
      currency: "EUR",
      metrics: [],
      breadcrumb: {
        dashboardId: "dashboard-1",
        dashboardRevisionId: "dashboard-r1",
        pageId: "overview",
        tabId: "main",
        widgetId: "quality",
      },
      reset: {
        dashboardId: "dashboard-1",
        dashboardRevisionId: "dashboard-r1",
        pageId: "overview",
        tabId: "main",
      },
    });
    const dashboard = {
      dashboardId: "dashboard-1",
      dashboardRevisionId: "dashboard-r1",
      revision: 1,
      name: "Качество",
      description: "",
      report: { savedReportId: "report-1" },
    } as never;

    await supportAnalyticsArtifactApiSource.runDashboard(
      "project-1",
      dashboard,
    );
    await supportAnalyticsArtifactApiSource.drilldownDashboard(
      "project-1",
      dashboard,
      "2026-08-12",
      "EUR",
    );

    const interactionId = vi.mocked(dashboardInteractionCreate).mock
      .calls[0]![2].interactionId;
    expect(dashboardWidgetDrilldownRead).toHaveBeenCalledWith(
      "project-1",
      "dashboard-1",
      interactionId,
      "quality",
      {
        dashboardRevisionId: "dashboard-r1",
        day: "2026-08-12",
        currency: "EUR",
      },
      undefined,
    );
  });

  it("replays the same dashboard interaction after an ambiguous create outcome", async () => {
    vi.mocked(dashboardInteractionCreate)
      .mockRejectedValueOnce(new ApiError(503, "Временно недоступно"))
      .mockResolvedValueOnce({ status: "QUEUED" } as never);
    vi.mocked(dashboardWidgetResultRead).mockResolvedValue({
      status: "READY",
      result: { version: 1, rows: [] },
      receipt: {} as never,
    } as never);
    const dashboard = {
      dashboardId: "dashboard-ambiguous",
      dashboardRevisionId: "dashboard-r-ambiguous",
      revision: 1,
      name: "Качество",
      description: "",
      report: { savedReportId: "report-1" },
    } as never;

    await expect(
      supportAnalyticsArtifactApiSource.runDashboard("project-1", dashboard),
    ).rejects.toMatchObject({ status: 503 });
    await supportAnalyticsArtifactApiSource.runDashboard(
      "project-1",
      dashboard,
    );

    const calls = vi.mocked(dashboardInteractionCreate).mock.calls;
    expect(calls[0]![2].interactionId).toBe(calls[1]![2].interactionId);
    expect(calls[0]![3]?.headers?.["Idempotency-Key"]).toBe(
      calls[1]![3]?.headers?.["Idempotency-Key"],
    );
  });
});
