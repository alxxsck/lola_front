import { shallowMount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import TranslatedMessageBody from './TranslatedMessageBody.vue';
import type { ConversationMessageTranslationItemResponseDto } from '@/shared/api/generated/models';
import type { ConversationMessage } from '@/shared/types/domain';

function message(overrides: Partial<ConversationMessage> = {}): ConversationMessage {
  return {
    id: 'message-1',
    conversationId: 'conversation-1',
    author: 'USER',
    text: 'Guten Tag',
    status: 'COMPLETED',
    createdAt: '2026-07-30T10:00:00.000Z',
    ...overrides,
  };
}

describe('translated message body', () => {
  it('показывает сохранённый перевод без локальных кнопок управления', () => {
    const wrapper = shallowMount(TranslatedMessageBody, {
      props: {
        message: message({
          translation: {
            id: 'translation-1',
            direction: 'INBOUND',
            status: 'COMPLETED',
            originalText: 'Guten Tag',
            translatedText: 'Добрый день',
            deliveredText: null,
            viewText: 'Добрый день',
            sourceLocale: 'de',
            targetLocale: 'ru',
            errorCode: null,
            warnings: [],
            updatedAt: '2026-07-30T10:00:01.000Z',
          },
        }),
      },
    });

    expect(wrapper.text()).toContain('Добрый день');
    expect(wrapper.find('button-stub').exists()).toBe(false);
  });

  it('для outbound показывает исходник оператора без локального переключателя', () => {
    const wrapper = shallowMount(TranslatedMessageBody, {
      props: {
        message: message({
          author: 'ADMIN',
          text: 'Guten Tag!',
          translation: {
            id: 'draft-1',
            direction: 'OUTBOUND',
            status: 'COMPLETED',
            originalText: 'Здравствуйте',
            translatedText: 'Hallo',
            deliveredText: 'Guten Tag!',
            viewText: 'Guten Tag!',
            sourceLocale: 'ru',
            targetLocale: 'de',
            errorCode: null,
            warnings: ['OPERATOR_EDITED'],
            updatedAt: '2026-07-30T10:00:01.000Z',
          },
        }),
      },
    });

    expect(wrapper.text()).toContain('Здравствуйте');
    expect(wrapper.text()).not.toContain('Guten Tag!');
    expect(wrapper.text()).not.toContain('Hallo');
    expect(wrapper.text()).toContain('Изменено оператором');
    expect(wrapper.find('button-stub').exists()).toBe(false);
  });

  it('в едином режиме показывает доставленный outbound как оригинал, а текст оператора как перевод', async () => {
    const wrapper = shallowMount(TranslatedMessageBody, {
      props: {
        message: message({
          author: 'ADMIN',
          text: 'Guten Tag!',
          translation: {
            id: 'draft-1',
            direction: 'OUTBOUND',
            status: 'COMPLETED',
            originalText: 'Здравствуйте',
            translatedText: 'Hallo',
            deliveredText: 'Guten Tag!',
            viewText: 'Guten Tag!',
            sourceLocale: 'ru',
            targetLocale: 'de',
            errorCode: null,
            warnings: ['OPERATOR_EDITED'],
            updatedAt: '2026-07-30T10:00:01.000Z',
          },
        }),
        viewMode: 'ORIGINAL',
      },
    });

    expect(wrapper.text()).toContain('Guten Tag!');
    expect(wrapper.text()).not.toContain('Здравствуйте');

    await wrapper.setProps({ viewMode: 'TRANSLATED' });
    expect(wrapper.text()).toContain('Здравствуйте');
    expect(wrapper.text()).not.toContain('Guten Tag!');
  });

  it('объявляет pending как live status', () => {
    const wrapper = shallowMount(TranslatedMessageBody, {
      props: {
        message: message(),
        requested: {
          messageId: 'message-1',
          translationId: 'translation-1',
          state: 'RUNNING',
          sourceLocale: 'de',
          targetLocale: 'ru',
          translatedText: null,
          errorCode: null,
          warnings: [],
          updatedAt: '2026-07-30T10:00:01.000Z',
        } satisfies ConversationMessageTranslationItemResponseDto,
      },
    });

    expect(wrapper.get('[role="status"]').attributes('aria-live')).toBe('polite');
  });

  it('не показывает ручную сверку pending внутри сообщения', () => {
    const wrapper = shallowMount(TranslatedMessageBody, {
      props: {
        message: message(),
        requested: {
          messageId: 'message-1',
          translationId: 'translation-1',
          state: 'PENDING',
          sourceLocale: 'de',
          targetLocale: 'ru',
          translatedText: null,
          errorCode: null,
          warnings: [],
          updatedAt: '2026-07-30T10:00:01.000Z',
        } satisfies ConversationMessageTranslationItemResponseDto,
      },
    });

    expect(wrapper.find('button-stub').exists()).toBe(false);
  });

  it.each([
    ['SAME_LANGUAGE', 'Язык сообщения совпадает с рабочим'],
    ['EMPTY_OR_NOISE', 'В сообщении нет текста для перевода'],
    ['UNSUPPORTED_ROLE', 'Этот тип сообщения нельзя перевести'],
    ['LANGUAGE_UNRESOLVED', 'Язык сообщения не удалось определить'],
  ] as const)('безопасно объясняет SKIPPED: %s', (skipReason, explanation) => {
    const wrapper = shallowMount(TranslatedMessageBody, {
      props: {
        message: message(),
        requested: {
          messageId: 'message-1',
          state: 'SKIPPED',
          skipReason,
          translatedText: null,
          updatedAt: '2026-07-30T10:00:01.000Z',
        } satisfies ConversationMessageTranslationItemResponseDto,
      },
    });

    expect(wrapper.get('[role="status"]').text()).toContain(explanation);
    expect(wrapper.text()).not.toContain(skipReason);
  });

  it('использует нейтральное объяснение для SKIPPED без reason', () => {
    const wrapper = shallowMount(TranslatedMessageBody, {
      props: {
        message: message(),
        requested: {
          messageId: 'message-1',
          state: 'SKIPPED',
          translatedText: null,
          updatedAt: '2026-07-30T10:00:01.000Z',
        } satisfies ConversationMessageTranslationItemResponseDto,
      },
    });

    expect(wrapper.get('[role="status"]').text()).toContain(
      'Перевод пропущен без обращения к модели',
    );
    expect(wrapper.text()).not.toContain('Язык сообщения не удалось определить');
  });

  it('не предлагает per-message перевод без conversation opt-in', () => {
    const wrapper = shallowMount(TranslatedMessageBody, {
      props: {
        message: message(),
      },
    });

    expect(wrapper.find('button-stub').exists()).toBe(false);
  });

  it('не предлагает перевод для очевидного emoji/noise', () => {
    const wrapper = shallowMount(TranslatedMessageBody, {
      props: {
        message: message({ text: '👋✨' }),
      },
    });

    expect(wrapper.find('button-stub').exists()).toBe(false);
  });

  it('renders a shortcode emoji with its adjacent skin-tone modifier', () => {
    const wrapper = shallowMount(TranslatedMessageBody, {
      props: {
        message: message({ text: ':+1::skin-tone-3:' }),
      },
    });

    expect(wrapper.text()).toContain('👍🏼');
    expect(wrapper.text()).not.toContain(':+1:');
    expect(wrapper.text()).not.toContain(':skin-tone-3:');
  });

  it.each([
    ['русского', 'Спасибо, всё получилось'],
    ['болгарского', 'Благодаря'],
    ['сербского', 'Хвала'],
    ['македонского', 'Благодарам'],
    ['немецкого', 'Danke!'],
  ])('не добавляет локальное действие для содержательного %s текста', (_label, text) => {
    const wrapper = shallowMount(TranslatedMessageBody, {
      props: {
        message: message({ text }),
      },
    });

    expect(wrapper.find('button-stub').exists()).toBe(false);
  });

  it.each(['ASSISTANT', 'SCENARIO'] as const)('не добавляет локальный перевод для %s', (author) => {
    const wrapper = shallowMount(TranslatedMessageBody, {
      props: {
        message: message({ author }),
      },
    });

    expect(wrapper.find('button-stub').exists()).toBe(false);
  });
});
