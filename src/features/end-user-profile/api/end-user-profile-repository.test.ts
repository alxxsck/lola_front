import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  adminEndUserProfilesHistory,
  adminEndUserProfilesList,
} from '@/shared/api/generated/retenive-backend';
import { endUserProfileRepository } from './end-user-profile-repository';

vi.mock('@/shared/api/generated/retenive-backend', () => ({
  adminEndUserProfilesHistory: vi.fn(),
  adminEndUserProfilesList: vi.fn(),
  adminEndUserProfilesProfile: vi.fn(),
}));

describe('endUserProfileRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('передаёт cursor без преобразований в endpoint истории профиля', async () => {
    vi.mocked(adminEndUserProfilesHistory).mockResolvedValue({
      items: [],
      nextCursor: 'opaque-next',
    });

    await expect(
      endUserProfileRepository.history('project-1', 'user-1', {
        limit: 25,
        cursor: 'opaque-current',
      }),
    ).resolves.toEqual({
      items: [],
      nextCursor: 'opaque-next',
    });
    expect(adminEndUserProfilesHistory).toHaveBeenCalledWith('project-1', 'user-1', {
      limit: 25,
      cursor: 'opaque-current',
    });
  });

  it('разрешает внешний ID через профильный list endpoint в API mode', async () => {
    vi.mocked(adminEndUserProfilesList).mockResolvedValue({
      items: [
        {
          endUserId: 'user-1',
          externalUserId: 'player-42',
          fields: [],
          lastSeenAt: '2026-08-13T10:00:00.000Z',
          profileVersion: '2',
          syncStatus: 'VALID',
          conversationAiSuspensionSummary: {
            activeConversationCount: 0,
            mostRecentlyStartedConversationId: null,
            nearestSuspendedUntil: null,
            serverTime: '2026-08-13T10:00:00.000Z',
          },
        },
      ],
      nextCursor: null,
    });

    await expect(
      endUserProfileRepository.resolveIdentity('project-1', 'player-42'),
    ).resolves.toEqual({ endUserId: 'user-1' });
    expect(adminEndUserProfilesList).toHaveBeenCalledWith('project-1', {
      externalUserId: 'player-42',
      limit: 1,
    });
  });
});
