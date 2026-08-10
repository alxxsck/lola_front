import { beforeEach, describe, expect, it } from "vitest";
import {
  createMockReportingRepository,
  resetMockReportingRepository,
} from "./reporting-repository";

describe("Reporting repository", () => {
  beforeEach(() => resetMockReportingRepository());

  it("lists authority-filtered artifacts without executing widget queries", async () => {
    const repository = createMockReportingRepository();

    const artifacts = await repository.listArtifacts("project-1");

    expect(artifacts.some((artifact) => artifact.kind === "DASHBOARD")).toBe(
      true,
    );
    expect(artifacts.some((artifact) => artifact.kind === "SAVED_REPORT")).toBe(
      true,
    );
    expect(
      artifacts.every((artifact) => artifact.lifecycle !== "ARCHIVED"),
    ).toBe(true);
  });

  it("publishes an immutable Saved Report revision", async () => {
    const repository = createMockReportingRepository();
    const draft = await repository.saveSavedReportDraft("project-1", {
      title: "Новый отчёт",
      collection: "Личные",
      visualization: "KPI",
      query: {
        datasetId: "events-product",
        metric: "unique_users",
        dateRange: "LAST_30_DAYS",
        grain: "DAY",
        filters: [],
      },
    });

    const published = await repository.publishSavedReport(
      "project-1",
      draft.id,
      draft.version,
    );

    expect(published.lifecycle).toBe("PUBLISHED");
    expect(published.publishedRevision).toBe(1);
    expect(published.version).toBe(draft.version + 1);
  });

  it("returns a typed result and Resource Receipt through the query seam", async () => {
    const repository = createMockReportingRepository();

    const result = await repository.runQuery(
      "project-1",
      {
        datasetId: "events-product",
        metric: "unique_users",
        dateRange: "LAST_30_DAYS",
        grain: "DAY",
        filters: [],
      },
      new AbortController().signal,
    );

    expect(result.status).toBe("complete");
    expect(result.receipt).toMatchObject({
      timezone: "Europe/Madrid",
      exactness: "EXACT",
    });
    expect(result.data.kind).toBe("TIME_SERIES");
  });

  it("keeps Profile and Segment populations explicitly current-state", async () => {
    const repository = createMockReportingRepository();
    const datasets = await repository.listDatasets("project-1");

    expect(
      datasets.find((dataset) => dataset.owner === "PROFILE"),
    ).toMatchObject({
      currentStateDisclosure: "Текущее состояние на момент запроса",
    });
    expect(
      datasets.find((dataset) => dataset.owner === "SEGMENT"),
    ).toMatchObject({
      currentStateDisclosure: "Состав пересчитывается по текущему профилю",
    });

    const result = await repository.runQuery(
      "project-1",
      {
        datasetId: "profiles-current",
        metric: "profile_count",
        dateRange: "LAST_30_DAYS",
        grain: "DAY",
        filters: [],
      },
      new AbortController().signal,
    );
    expect(result.summary).toContain("текущий момент");
    expect(result.receipt.periodLabel).toBe("Текущее состояние");
  });
});
