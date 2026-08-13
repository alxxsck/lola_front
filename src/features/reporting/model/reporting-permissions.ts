const REPORTING_READ_PERMISSION = 'project.analytics.read';
const REPORTING_EXECUTE_PERMISSION = 'project.analytics.query.execute';

function includesAny(permissions: readonly string[], required: readonly string[]): boolean {
  return required.some((permission) => permissions.includes(permission));
}

export function canReadReporting(permissions: readonly string[]): boolean {
  return permissions.includes(REPORTING_READ_PERMISSION);
}

export function canRunReportingQuery(permissions: readonly string[]): boolean {
  return permissions.includes(REPORTING_EXECUTE_PERMISSION);
}

export function canAuthorSavedReport(permissions: readonly string[]): boolean {
  return canCreateSavedReport(permissions) || canEditSavedReport(permissions);
}

export function canCreateSavedReport(permissions: readonly string[]): boolean {
  return permissions.includes('project.saved_reports.create');
}

export function canEditSavedReport(permissions: readonly string[]): boolean {
  return includesAny(permissions, [
    'project.saved_reports.edit_own',
    'project.saved_reports.edit_any',
  ]);
}

export function canPublishSavedReport(permissions: readonly string[]): boolean {
  return permissions.includes('project.saved_reports.publish');
}

export function canAuthorDashboard(permissions: readonly string[]): boolean {
  return canCreateDashboard(permissions) || canEditDashboard(permissions);
}

export function canCreateDashboard(permissions: readonly string[]): boolean {
  return permissions.includes('project.dashboards.create');
}

export function canEditDashboard(permissions: readonly string[]): boolean {
  return includesAny(permissions, ['project.dashboards.edit_own', 'project.dashboards.edit_any']);
}

export function canPublishDashboard(permissions: readonly string[]): boolean {
  return permissions.includes('project.dashboards.publish');
}
