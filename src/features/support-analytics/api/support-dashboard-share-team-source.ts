import { dashboardShareTeamOptionList } from '@/shared/api/generated/retenive-backend';
import type { DashboardShareTeamOptionPageDto } from '@/shared/api/generated/models';
import { normalizeApiError } from '@/shared/api/http/api-error';
import { isMockMode } from '@/shared/config/data-mode';

export interface SupportDashboardShareTeamSource {
  list(
    projectId: string,
    search?: string,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<DashboardShareTeamOptionPageDto>;
}

export const supportDashboardShareTeamApiSource: SupportDashboardShareTeamSource = {
  async list(projectId, search, cursor, signal) {
    try {
      return await dashboardShareTeamOptionList(
        projectId,
        { limit: 100, ...(search ? { search } : {}), ...(cursor ? { cursor } : {}) },
        signal ? { signal } : undefined,
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
};

const mockSource: SupportDashboardShareTeamSource = {
  async list() {
    return {
      items: [
        { id: 'team-support', code: 'SUPPORT', name: 'Поддержка' },
        { id: 'team-priority', code: 'PRIORITY', name: 'Приоритетные обращения' },
      ],
      nextCursor: null,
    };
  },
};

export const supportDashboardShareTeamSource: SupportDashboardShareTeamSource =
  isMockMode || import.meta.env.MODE === 'test' ? mockSource : supportDashboardShareTeamApiSource;
