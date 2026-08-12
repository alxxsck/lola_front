import { describe, expect, it } from "vitest";
import {
  metricLabel,
  supportAnalyticsSource,
} from "./support-analytics-source";

describe("supportAnalyticsSource", () => {
  it("exposes every production owner family after the B1 publishers are ready", async () => {
    const catalog = await supportAnalyticsSource.catalog("project-1");
    expect(catalog.datasets).toHaveLength(10);
    expect(catalog.datasets.map(({ readiness }) => readiness.status)).toEqual(
      Array.from({ length: 10 }, () => "READY"),
    );
    expect(
      catalog.datasets.every(
        ({ readiness }) => readiness.missingSourceFamilies.length === 0,
      ),
    ).toBe(true);
  });

  it("returns bounded Quality rows, comparison and a privacy receipt", async () => {
    const dataset = (
      await supportAnalyticsSource.catalog("project-1")
    ).datasets.find(({ datasetCode }) => datasetCode === "SUPPORT_QUALITY")!;
    const metric = dataset.metrics.find(
      ({ code }) => code === "quality_score_average",
    )!;
    const result = await supportAnalyticsSource.run("project-1", {
      version: 1,
      datasetRevisionId: dataset.datasetRevisionId,
      metrics: [metric.code],
      groupBy: ["OCCURRED_DAY"],
      filters: [],
      range: {
        from: "2026-08-01",
        until: "2026-08-08",
        grain: "DAY",
        timezone: "Europe/Madrid",
      },
      comparison: { kind: "PREVIOUS_PERIOD" },
      limit: 100,
    });
    expect(result.status).toBe("READY");
    expect(result.result?.rows).toHaveLength(7);
    expect(result.result?.comparison?.rows).toHaveLength(7);
    expect(result.receipt).toMatchObject({
      completeness: "COMPLETE",
      suppressedCellCount: 0,
    });
    expect(metricLabel(metric)).toBe("Средняя оценка");
  });
});
