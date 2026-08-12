import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  reportExportCreate,
  reportExportEstimate,
  savedReportPreview,
} from "@/shared/api/generated/retenive-backend";
import { supportAnalyticsArtifactApiSource } from "./support-analytics-artifact-source";

vi.mock("@/shared/api/generated/retenive-backend", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/api/generated/retenive-backend")>()),
  savedReportPreview: vi.fn(),
  reportExportEstimate: vi.fn(),
  reportExportCreate: vi.fn(),
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
});
