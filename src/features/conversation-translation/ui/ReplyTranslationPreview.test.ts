import { shallowMount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ReplyTranslationPreview from './ReplyTranslationPreview.vue';
import type { ReplyTranslationDraftResponseDto } from '@/shared/api/generated/models';

const draft: ReplyTranslationDraftResponseDto = {
  conversationId: 'conversation-1',
  createdAt: '2026-07-30T10:00:00.000Z',
  deliveredTextPreview: 'Guten Tag',
  editedTranslatedText: null,
  errorCode: null,
  expiresAt: '2099-07-30T10:10:00.000Z',
  id: 'draft-1',
  model: 'grok-4.3',
  modelConfigRevision: 'model-1',
  provider: 'xai',
  queued: false,
  sourceLocale: 'ru',
  sourceText: 'Здравствуйте',
  sourceTextHash: 'hash-1',
  status: 'READY',
  targetLocale: 'de',
  targetLocaleSource: 'PROFILE',
  translatedText: 'Guten Tag',
  translationConfigRevision: 'translation-config-1',
  updatedAt: '2026-07-30T10:00:01.000Z',
  warnings: [],
};

describe('reply translation preview', () => {
  it('скрывает provider model без явного права на детали', () => {
    const wrapper = shallowMount(ReplyTranslationPreview, {
      props: {
        draft,
        targetLocale: 'de',
        busy: false,
        stale: false,
        disabled: false,
        showProviderDetails: false,
      },
    });

    expect(wrapper.text()).not.toContain('grok-4.3');
  });

  it('показывает provider model только с явным правом на детали', () => {
    const wrapper = shallowMount(ReplyTranslationPreview, {
      props: {
        draft,
        targetLocale: 'de',
        busy: false,
        stale: false,
        disabled: false,
        showProviderDetails: true,
      },
    });

    expect(wrapper.text()).toContain('grok-4.3');
  });

  it('оставляет recovery-action доступным для устаревшего preview', async () => {
    const wrapper = shallowMount(ReplyTranslationPreview, {
      props: {
        draft,
        targetLocale: 'de',
        busy: false,
        stale: true,
        disabled: true,
      },
      global: {
        stubs: {
          Message: { template: '<div><slot /></div>' },
        },
      },
    });
    const refresh = wrapper
      .findAll('button-stub')
      .find((button) => button.attributes('label') === 'Обновить перевод');

    expect(refresh).toBeDefined();
    expect(refresh!.attributes('disabled')).toBe('false');
    await refresh?.trigger('click');
    expect(wrapper.emitted('preview')).toHaveLength(1);
  });

  it('даёт вручную сверить зависший pending draft', async () => {
    const pendingDraft: ReplyTranslationDraftResponseDto = {
      ...draft,
      status: 'PENDING',
      queued: true,
    };
    const wrapper = shallowMount(ReplyTranslationPreview, {
      props: {
        draft: pendingDraft,
        targetLocale: 'de',
        busy: false,
        stale: false,
        disabled: false,
      },
    });
    const reconcile = wrapper
      .findAll('button-stub')
      .find((button) => button.attributes('label') === 'Проверить статус');

    await reconcile?.trigger('click');
    expect(wrapper.emitted('reconcile')).toHaveLength(1);
  });
});
