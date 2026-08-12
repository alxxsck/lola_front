import { describe, expect, it } from 'vitest';
import { shouldAutoRefreshSupportAnalytics } from './support-analytics-refresh';

describe('support analytics realtime refresh policy', () => {
  it('allows explicit auto-refresh only for visible online operational views', () => {
    expect(
      shouldAutoRefreshSupportAnalytics({
        view: 'overview',
        enabled: true,
        visible: true,
        online: true,
        busy: false,
      }),
    ).toBe(true);
    expect(
      shouldAutoRefreshSupportAnalytics({
        view: 'flow',
        enabled: true,
        visible: false,
        online: true,
        busy: false,
      }),
    ).toBe(false);
  });

  it.each(['quality', 'team', 'automation'] as const)(
    'keeps the historical %s view pinned until a manual refresh',
    (view) => {
      expect(
        shouldAutoRefreshSupportAnalytics({
          view,
          enabled: true,
          visible: true,
          online: true,
          busy: false,
        }),
      ).toBe(false);
    },
  );
});
