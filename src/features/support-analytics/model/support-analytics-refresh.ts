import type { SupportAnalyticsView } from './support-analytics-curation';

export function isOperationalSupportAnalyticsView(view: SupportAnalyticsView): boolean {
  return view === 'overview' || view === 'flow';
}

export function shouldAutoRefreshSupportAnalytics(input: {
  view: SupportAnalyticsView;
  enabled: boolean;
  visible: boolean;
  online: boolean;
  busy: boolean;
}): boolean {
  return (
    input.enabled &&
    isOperationalSupportAnalyticsView(input.view) &&
    input.visible &&
    input.online &&
    !input.busy
  );
}
