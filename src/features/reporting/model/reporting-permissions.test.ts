import { describe, expect, it } from "vitest";
import {
  canAuthorDashboard,
  canAuthorSavedReport,
  canCreateSavedReport,
  canEditSavedReport,
  canPublishDashboard,
  canReadReporting,
  canRunReportingQuery,
} from "./reporting-permissions";

describe("Reporting permissions", () => {
  it("grants capabilities only from exact effective Permissions", () => {
    const permissions = [
      "project.analytics.read",
      "project.analytics.query.execute",
      "project.saved_reports.create",
      "project.dashboards.create",
      "project.dashboards.publish",
    ];

    expect(canReadReporting(permissions)).toBe(true);
    expect(canRunReportingQuery(permissions)).toBe(true);
    expect(canAuthorSavedReport(permissions)).toBe(true);
    expect(canCreateSavedReport(permissions)).toBe(true);
    expect(canEditSavedReport(permissions)).toBe(false);
    expect(canAuthorDashboard(permissions)).toBe(true);
    expect(canPublishDashboard(permissions)).toBe(true);
  });

  it("does not infer access from a legacy role name", () => {
    const legacyOwner = { role: "OWNER", effectivePermissionCodes: [] };

    expect(canReadReporting(legacyOwner.effectivePermissionCodes)).toBe(false);
    expect(canAuthorSavedReport(legacyOwner.effectivePermissionCodes)).toBe(
      false,
    );
    expect(canAuthorDashboard(legacyOwner.effectivePermissionCodes)).toBe(
      false,
    );
  });
});
