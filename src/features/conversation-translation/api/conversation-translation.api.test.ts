import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createMessages: vi.fn(),
  retryMessage: vi.fn(),
  createDraft: vi.fn(),
  retryDraft: vi.fn(),
}));

vi.mock('@/shared/api/generated/retenive-backend', () => ({
  conversationMessageTranslationCreate: mocks.createMessages,
  conversationMessageTranslationGet: vi.fn(),
  conversationMessageTranslationRetry: mocks.retryMessage,
  conversationTranslationGet: vi.fn(),
  conversationTranslationPut: vi.fn(),
  replyTranslationDraftCreate: mocks.createDraft,
  replyTranslationDraftEdit: vi.fn(),
  replyTranslationDraftGet: vi.fn(),
  replyTranslationDraftRetry: mocks.retryDraft,
}));

import { conversationTranslationApi } from './conversation-translation.api';

describe('conversation translation API adapter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('передаёт caller-owned idempotency key во все команды provider work', async () => {
    mocks.createMessages.mockResolvedValue({ items: [], queued: false });
    mocks.retryMessage.mockResolvedValue({});
    mocks.createDraft.mockResolvedValue({});
    mocks.retryDraft.mockResolvedValue({});

    await conversationTranslationApi.translateMessages(
      'project-1',
      'user-1',
      'conversation-1',
      ['message-1'],
      'ru',
      'key-message',
    );
    await conversationTranslationApi.retryMessageTranslation(
      'project-1',
      'user-1',
      'conversation-1',
      'translation-1',
      'key-retry',
    );
    await conversationTranslationApi.createReplyDraft(
      'project-1',
      'user-1',
      'conversation-1',
      'Здравствуйте',
      'ru',
      'de',
      'case-1',
      'key-draft',
      { id: 'macro-draft-1', sourceHash: 'a'.repeat(64), version: 2 },
    );
    await conversationTranslationApi.retryReplyDraft(
      'project-1',
      'user-1',
      'conversation-1',
      'draft-1',
      'key-draft-retry',
    );

    expect(mocks.createMessages.mock.calls[0].at(-1)).toEqual({
      headers: { 'Idempotency-Key': 'key-message' },
    });
    expect(mocks.retryMessage.mock.calls[0].at(-1)).toEqual({
      headers: { 'Idempotency-Key': 'key-retry' },
    });
    expect(mocks.createDraft.mock.calls[0].at(-1)).toEqual({
      headers: { 'Idempotency-Key': 'key-draft' },
    });
    expect(mocks.createDraft.mock.calls[0]?.[3]).toEqual(
      expect.objectContaining({
        macroReplyDraftId: 'macro-draft-1',
        macroReplyDraftSourceHash: `sha256:${'a'.repeat(64)}`,
        macroReplyDraftVersion: 2,
      }),
    );
    expect(mocks.createDraft.mock.calls[0]?.[3]).not.toHaveProperty('sourceText');
    expect(mocks.retryDraft.mock.calls[0].at(-1)).toEqual({
      headers: { 'Idempotency-Key': 'key-draft-retry' },
    });
  });
});
