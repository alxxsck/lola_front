import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
}));

vi.mock('@/shared/api/generated/retenive-backend', () => ({
  supportConversationCollaborationRead: mocks.read,
}));
vi.mock('@/shared/config/data-mode', () => ({ isMockMode: false }));

import {
  SupportConversationCollaborationContractError,
  supportConversationCollaborationSource,
} from './support-conversation-collaboration-source';

describe('support conversation collaboration source', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps only the bounded collaboration projection and sends the observed ordinal', async () => {
    mocks.read.mockResolvedValue({
      conversationId: 'conversation-1',
      generation: '8',
      observedAt: '2026-08-08T10:00:00.000Z',
      currentMessageOrdinal: 14,
      viewers: [
        {
          cmsUserId: 'operator-2',
          displayName: 'Анна',
          generation: '4',
          expiresAt: '2026-08-08T10:01:00.000Z',
          draft: 'must never cross the seam',
        },
      ],
      typers: [
        {
          cmsUserId: 'operator-3',
          displayName: 'Илья',
          watchGeneration: '6',
          revision: '2',
          expiresAt: '2026-08-08T10:00:05.000Z',
          body: 'private draft',
        },
      ],
      collision: {
        state: 'OTHER_OPERATOR_REPLIED',
        observedMessageOrdinal: 12,
        messageId: 'message-14',
        messageOrdinal: 14,
        cmsUserId: 'operator-2',
        createdAt: '2026-08-08T10:00:01.000Z',
      },
    });
    const abort = new AbortController();

    const result = await supportConversationCollaborationSource.read(
      'project-1',
      'conversation-1',
      12,
      abort.signal,
    );

    expect(mocks.read).toHaveBeenCalledWith(
      'project-1',
      'conversation-1',
      { observedMessageOrdinal: 12 },
      { signal: abort.signal },
    );
    expect(result.viewers).toEqual([
      {
        cmsUserId: 'operator-2',
        displayName: 'Анна',
        generation: '4',
        expiresAt: '2026-08-08T10:01:00.000Z',
      },
    ]);
    expect(result.typers[0]).not.toHaveProperty('body');
    expect(JSON.stringify(result)).not.toContain('private draft');
    expect(result.collision.state).toBe('OTHER_OPERATOR_REPLIED');
  });

  it('fails closed when the server returns another Conversation', async () => {
    mocks.read.mockResolvedValue({
      conversationId: 'conversation-other',
      generation: '1',
      observedAt: '2026-08-08T10:00:00.000Z',
      currentMessageOrdinal: 0,
      viewers: [],
      typers: [],
      collision: { state: 'NOT_ARMED' },
    });

    await expect(
      supportConversationCollaborationSource.read('project-1', 'conversation-1'),
    ).rejects.toBeInstanceOf(SupportConversationCollaborationContractError);
  });
});
