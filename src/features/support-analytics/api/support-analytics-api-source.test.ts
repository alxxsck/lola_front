import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  reportingQueryResultRead,
  reportingQueryRunCreate,
  reportingQueryValidate,
} from "@/shared/api/generated/retenive-backend";
import type { ReportingQueryDefinitionDto } from "@/shared/api/generated/models";
import { supportAnalyticsApiSource } from "./support-analytics-source";

vi.mock("@/shared/api/generated/retenive-backend", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/shared/api/generated/retenive-backend")
  >()),
  reportingQueryValidate: vi.fn(),
  reportingQueryRunCreate: vi.fn(),
  reportingQueryResultRead: vi.fn(),
}));

const query: ReportingQueryDefinitionDto = {
  version: 1,
  datasetRevisionId: "00000000-0000-5000-8000-000000000001",
  metrics: ["case_event_count"],
  groupBy: ["OCCURRED_DAY"],
  filters: [],
  range: {
    from: "2026-08-01",
    until: "2026-08-08",
    grain: "DAY",
    timezone: "Europe/Madrid",
  },
  limit: 100,
};

function headersForRun(index: number): Record<string, string> {
  return vi.mocked(reportingQueryRunCreate).mock.calls[index]![2]!.headers as Record<
    string,
    string
  >;
}

describe("supportAnalyticsApiSource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(reportingQueryValidate).mockResolvedValue({
      canonicalQueryHash: "a".repeat(64),
      requestHash: "b".repeat(64),
      route: "SYNC",
      plan: "BOUNDED_CURRENT_PROJECTION",
      workloadLane: "INTERACTIVE",
      estimatedSourceRows: 7,
      estimatedResultRows: 7,
      estimatedResultBytes: 700,
      highCostConfirmationRequired: false,
      incompatibleFields: [],
      freshness: "READY",
    });
    vi.mocked(reportingQueryRunCreate).mockResolvedValue({
      runId: "run-1",
      queryHash: "a".repeat(64),
      status: "READY",
    });
    vi.mocked(reportingQueryResultRead).mockResolvedValue({
      runId: "run-1",
      queryHash: "a".repeat(64),
      status: "READY",
    });
  });

  it("creates a fresh Query Run for two successful refresh intents", async () => {
    await supportAnalyticsApiSource.run("project-1", query);
    await supportAnalyticsApiSource.run("project-1", query);

    expect(headersForRun(0)["Idempotency-Key"]).not.toBe(
      headersForRun(1)["Idempotency-Key"],
    );
  });

  it("retains the exact key only while the previous outcome is unknown", async () => {
    vi.mocked(reportingQueryRunCreate)
      .mockRejectedValueOnce(new Error("network interrupted"))
      .mockResolvedValueOnce({
        runId: "run-1",
        queryHash: "a".repeat(64),
        status: "READY",
      });

    await expect(
      supportAnalyticsApiSource.run("project-1", query),
    ).rejects.toThrow();
    await supportAnalyticsApiSource.run("project-1", query);

    expect(headersForRun(0)["Idempotency-Key"]).toBe(
      headersForRun(1)["Idempotency-Key"],
    );
  });
});
