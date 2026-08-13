import { describe, expect, it } from 'vitest';
import { isFrontendTranslationCandidate } from './translation-eligibility';
import type { ConversationMessage } from '@/shared/types/domain';

function message(text: string): ConversationMessage {
  return {
    id: 'message-1',
    conversationId: 'conversation-1',
    author: 'USER',
    status: 'COMPLETED',
    text,
    createdAt: '2026-07-30T10:00:00.000Z',
  };
}

describe('frontend translation eligibility', () => {
  it.each(['', '   ', '👋✨', '?!…'])('исключает очевидный noise %j', (text) => {
    expect(isFrontendTranslationCandidate(message(text), 'ru')).toBe(false);
  });

  it.each([
    'Спасибо, возврат уже пришёл',
    'Благодаря',
    'Хвала',
    'Благодарам',
    'Danke!',
    'ok',
    'ID 42',
    'Привет, invoice attached',
  ])('оставляет кандидатом содержательный текст без authoritative source locale %j', (text) => {
    expect(isFrontendTranslationCandidate(message(text), 'ru')).toBe(true);
  });

  it('исключает authoritative same-language сообщение', () => {
    expect(
      isFrontendTranslationCandidate(message('Спасибо, возврат уже пришёл'), 'ru', 'ru-RU'),
    ).toBe(false);
  });
});
