import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  supportSearchCases: vi.fn(),
  supportSearchConversations: vi.fn(),
  supportSearchMessages: vi.fn(),
  supportSearchUsers: vi.fn(),
}));

vi.mock('@/shared/api/generated/retenive-backend', () => api);

import { supportSearchSource } from './support-search-source';

const freshness = {
  state: 'READY' as const,
  indexedThrough: '2026-08-08T10:00:00.000Z',
  lagSeconds: 0,
  sourceWatermarks: {},
};

describe('support search source', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passes the closed Case grammar and signed cursor to the generated client', async () => {
    api.supportSearchCases.mockResolvedValue({
      items: [
        {
          target: { kind: 'CASE', id: 'case-1' },
          caseId: 'case-1',
          conversationId: 'conversation-1',
          endUserId: 'user-1',
          snippet: 'Безопасный фрагмент',
          activityAt: '2026-08-08T10:00:00.000Z',
          matchProvenance: 'ORIGINAL',
          matchLocale: 'ru',
        },
      ],
      nextCursor: 'signed-next',
      freshness,
    });

    const result = await supportSearchSource.search('project-1', {
      phrase: 'payment',
      scope: 'CASES',
      filters: {
        statuses: ['OPEN'],
        priorities: ['HIGH'],
        assignmentStates: ['UNASSIGNED'],
      },
      sort: { field: 'SLA_DUE_AT', direction: 'ASC' },
      cursor: 'signed-current',
      limit: 30,
    });

    expect(api.supportSearchCases).toHaveBeenCalledWith('project-1', {
      phrase: 'payment',
      cursor: 'signed-current',
      limit: 30,
      statuses: ['OPEN'],
      priorities: ['HIGH'],
      assignmentStates: ['UNASSIGNED'],
      sort: { field: 'SLA_DUE_AT', direction: 'ASC' },
    });
    expect(result.items[0]).toMatchObject({
      kind: 'CASE',
      selection: { kind: 'CASE', id: 'case-1' },
      snippet: 'Безопасный фрагмент',
    });
    expect(result.nextCursor).toBe('signed-next');
  });

  it('uses the server-provided safe End User label and canonical target', async () => {
    api.supportSearchUsers.mockResolvedValue({
      items: [
        {
          target: { kind: 'END_USER', id: 'user-1' },
          endUserId: 'user-1',
          externalEndUserId: 'safe-external-17',
          lastSeenAt: '2026-08-08T09:00:00.000Z',
        },
      ],
      nextCursor: null,
      freshness,
    });

    const result = await supportSearchSource.search('project-1', {
      phrase: 'safe-external-17',
      scope: 'END_USERS',
      filters: { statuses: ['OPEN'] },
      sort: { field: 'RELEVANCE', direction: 'DESC' },
    });

    expect(api.supportSearchUsers).toHaveBeenCalledWith('project-1', {
      phrase: 'safe-external-17',
      limit: 30,
    });
    expect(result.items[0]).toMatchObject({
      kind: 'END_USER',
      snippet: 'safe-external-17',
      selection: { kind: 'END_USER', id: 'user-1' },
    });
  });

  it('never reinterprets a non-actionable Message target as an End User', async () => {
    api.supportSearchMessages.mockResolvedValue({
      items: [
        {
          target: { kind: 'MESSAGE', id: 'message-1' },
          caseId: null,
          conversationId: null,
          endUserId: null,
          snippet: 'Safe snippet',
          activityAt: '2026-08-08T10:00:00.000Z',
          matchProvenance: 'ORIGINAL',
          role: 'USER',
        },
      ],
      nextCursor: null,
      freshness,
    });

    const result = await supportSearchSource.search('project-1', {
      phrase: 'payment',
      scope: 'MESSAGES',
      filters: { messageIds: ['message-1'] },
      sort: { field: 'RELEVANCE', direction: 'DESC' },
    });

    expect(api.supportSearchMessages).toHaveBeenCalledWith('project-1', {
      phrase: 'payment',
      messageIds: ['message-1'],
      limit: 30,
      sort: { field: 'RELEVANCE', direction: 'DESC' },
    });
    expect(result.items).toEqual([]);
  });
});
