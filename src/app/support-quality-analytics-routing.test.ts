import { describe, expect, it } from "vitest";
import { router } from "./router";

describe("Support Quality and Analytics routing", () => {
  it("publishes the complete Ticket 33 route surface behind exact permissions", () => {
    const routes = new Map(router.getRoutes().map((route) => [String(route.name), route]));
    for (const name of [
      "support-quality",
      "support-quality-review",
      "support-quality-scorecards",
      "support-quality-calibrations",
      "support-quality-disputes",
      "support-analytics-overview",
      "support-analytics-flow",
      "support-analytics-quality",
      "support-analytics-team",
      "support-analytics-automation",
      "support-analytics-report",
      "support-analytics-dashboard",
    ]) expect(routes.has(name), name).toBe(true);

    expect(routes.get("support-quality")?.meta.projectPermissionsAny).toEqual([
      "project.support.quality.read",
      "project.support.quality.review",
      "project.support.quality.self_read",
    ]);
    expect(routes.get("support-analytics-quality")?.meta.projectPermissionsAny).toContain(
      "project.reporting.aggregate.read",
    );
  });
});
