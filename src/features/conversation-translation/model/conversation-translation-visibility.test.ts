import { describe, expect, it } from 'vitest';
import { hasConversationTranslationBoundary } from './conversation-translation-visibility';

describe('conversation translation visibility', () => {
  it.each([
    { workingLocale: 'ru', conversationLocale: 'ru' },
    { workingLocale: 'ru', conversationLocale: 'ru-RU' },
    { workingLocale: 'RU-ru', conversationLocale: 'ru' },
  ])(
    'hides translation for the same base language ($workingLocale → $conversationLocale)',
    ({ workingLocale, conversationLocale }) => {
      expect(
        hasConversationTranslationBoundary({
          workingLocale,
          conversationLocale,
        }),
      ).toBe(false);
    },
  );

  it('shows translation when the conversation language differs', () => {
    expect(
      hasConversationTranslationBoundary({
        workingLocale: 'ru',
        conversationLocale: 'en-US',
      }),
    ).toBe(true);
  });

  it.each([null, undefined, ''])(
    'does not invent a translation boundary for an unknown conversation locale (%j)',
    (conversationLocale) => {
      expect(
        hasConversationTranslationBoundary({
          workingLocale: 'ru',
          conversationLocale,
        }),
      ).toBe(false);
    },
  );
});
