import { describe, expect, it } from 'vitest';
import type { RequestedMessageTranslation } from '@/features/conversation-translation/model/translation-presentation';
import type { ConversationMessage } from '@/shared/types/domain';
import { adaptUsersConversationMessages } from './user-conversation-surface-adapter';

describe('Users Conversation Surface adapter', () => {
  it('preserves server order, immutable author, translation and delivery state', () => {
    const translated: RequestedMessageTranslation = {
      state: 'COMPLETED',
      translatedText: 'Привет',
    };
    const messages: ConversationMessage[] = [
      {
        id: 'message-2',
        conversationId: 'conversation-1',
        ordinal: 2,
        author: 'ADMIN',
        authorSnapshot: {
          type: 'CMS_USER',
          cmsUserId: 'operator-1',
          displayName: 'Анна · Support',
          avatarUrl: 'https://example.test/anna.png',
        },
        text: 'Ответ',
        status: 'COMPLETED',
        delivery: {
          status: 'READ',
          generation: 1,
          version: 2,
          errorCode: null,
          retryEligible: false,
          allowedActions: [],
          commandIds: [],
        },
        createdAt: '2026-08-07T10:01:00.000Z',
      },
      {
        id: 'message-1',
        conversationId: 'conversation-1',
        ordinal: 1,
        author: 'USER',
        text: 'Hello',
        status: 'FAILED',
        createdAt: '2026-08-07T10:00:00.000Z',
      },
      {
        id: 'untrusted-hint',
        conversationId: 'conversation-1',
        author: 'USER',
        text: 'Нет server ordinal',
        status: 'COMPLETED',
        createdAt: '2026-08-07T10:02:00.000Z',
      },
    ];

    const result = adaptUsersConversationMessages(messages, new Map([['message-1', translated]]));

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: 'message-2',
      ordinal: 2,
      placement: 'OUTBOUND',
      author: {
        displayName: 'Анна · Support',
        avatarUrl: 'https://example.test/anna.png',
      },
      delivery: { label: 'Прочитано', tone: 'SUCCESS' },
    });
    expect(result[1]).toMatchObject({
      id: 'message-1',
      ordinal: 1,
      placement: 'INBOUND',
      author: { displayName: 'Пользователь', avatarUrl: null },
      requestedTranslation: translated,
      status: { label: 'Не доставлено', tone: 'DANGER' },
    });
  });
});
