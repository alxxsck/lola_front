import { beforeEach, describe, expect, it, vi } from 'vitest';

const generated = vi.hoisted(() => ({ summary: vi.fn() }));
vi.mock('@/shared/api/generated/retenive-backend', () => ({
  integrationEventRouteEventDefinitionSummary: generated.summary,
}));

describe('integrationEventSummaryApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads the provider-neutral summary for one Event Definition', async () => {
    const { integrationEventSummaryApi } = await import('./integration-event-summary.api');

    await integrationEventSummaryApi.get('project-1', 'event-definition-1');

    expect(generated.summary).toHaveBeenCalledWith('project-1', 'event-definition-1');
  });
});
