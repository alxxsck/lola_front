import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dashboardShareTeamOptionList } from '@/shared/api/generated/retenive-backend';
import { supportDashboardShareTeamApiSource } from './support-dashboard-share-team-source';

vi.mock('@/shared/api/generated/retenive-backend', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/api/generated/retenive-backend')>()),
  dashboardShareTeamOptionList: vi.fn(),
}));

describe('supportDashboardShareTeamApiSource', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the bounded purpose-built Team selector', async () => {
    vi.mocked(dashboardShareTeamOptionList).mockResolvedValue({ items: [], nextCursor: null });
    const signal = new AbortController().signal;

    await supportDashboardShareTeamApiSource.list('project-1', 'приоритет', 'cursor-1', signal);

    expect(dashboardShareTeamOptionList).toHaveBeenCalledWith(
      'project-1',
      { search: 'приоритет', cursor: 'cursor-1', limit: 100 },
      { signal },
    );
  });
});
