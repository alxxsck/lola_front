import { shallowMount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { ConversationTranslationResponseDto } from '@/shared/api/generated/models';
import ConversationTranslationBanner from './ConversationTranslationBanner.vue';

function state(
  source: ConversationTranslationResponseDto['language']['source'],
): ConversationTranslationResponseDto {
  return {
    availability: { available: true, reason: null },
    budget: {
      consumedMicros: '0',
      hardExhausted: false,
      hardLimitMicros: null,
      hardPercent: null,
      reservedMicros: '0',
      softLimitMicros: null,
      softPercent: null,
    },
    configRevision: 'translation-config-1',
    supportedLocales: ['ru', 'de'],
    language: { locale: 'de', needsConfirmation: false, source },
    preference: {
      enabled: true,
      endUserLocaleOverride: null,
      updatedAt: '2026-07-30T10:00:00.000Z',
      version: 1,
      workingLocale: 'ru',
    },
    projectVersion: 1,
  };
}

describe('conversation translation banner', () => {
  it.each([
    ['MANUAL', 'выбран вручную'],
    ['PROFILE', 'из профиля'],
    ['RECENT_MESSAGES', 'по последним сообщениям'],
    ['CASE_HINT', 'из обращения'],
    ['UNKNOWN', 'источник не определён'],
  ] as const)('объясняет источник языка %s', (source, explanation) => {
    const wrapper = shallowMount(ConversationTranslationBanner, {
      props: {
        state: state(source),
        loading: false,
        saving: false,
        canManage: true,
        eligibleCount: 0,
      },
    });

    expect(wrapper.text()).toContain('Язык ответов');
    expect(wrapper.text()).toContain('DE');
    expect(wrapper.text()).toContain(explanation);
  });

  it('помечает explicit override как ручной выбор', () => {
    const value = state('PROFILE');
    value.preference.endUserLocaleOverride = 'de';
    const wrapper = shallowMount(ConversationTranslationBanner, {
      props: {
        state: value,
        loading: false,
        saving: false,
        canManage: true,
        eligibleCount: 0,
      },
    });

    expect(wrapper.text()).toContain('выбран вручную');
    expect(wrapper.text()).not.toContain('из профиля');
  });

  it('never lets language controls submit an enclosing reply form', () => {
    const value = state('PROFILE');
    value.language.needsConfirmation = true;
    value.language.conflictingLocale = 'ru';
    const wrapper = shallowMount(ConversationTranslationBanner, {
      props: {
        state: value,
        loading: false,
        saving: false,
        canManage: true,
        eligibleCount: 0,
      },
      global: {
        stubs: {
          Button: {
            props: ['label', 'type'],
            template: '<button :type="type">{{ label }}</button>',
          },
        },
      },
    });

    expect(wrapper.findAll('button')).not.toHaveLength(0);
    expect(
      wrapper.findAll('button').every((button) => button.attributes('type') === 'button'),
    ).toBe(true);
  });

  it('всегда предлагает supported locales, когда язык неизвестен', async () => {
    const value = state('UNKNOWN');
    value.language.locale = null;
    value.language.needsConfirmation = true;
    value.language.conflictingLocale = undefined;
    const wrapper = shallowMount(ConversationTranslationBanner, {
      props: {
        state: value,
        loading: false,
        saving: false,
        canManage: true,
        eligibleCount: 0,
      },
      global: {
        stubs: {
          Select: {
            props: ['modelValue', 'options'],
            emits: ['update:modelValue'],
            template:
              '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="option in options" :key="String(option.value)" :value="option.value">{{ option.label }}</option></select>',
          },
        },
      },
    });

    const selector = wrapper.get('select');
    expect(selector.findAll('option').map((option) => option.text())).toEqual(
      expect.arrayContaining([expect.stringContaining('RU'), expect.stringContaining('DE')]),
    );
    await selector.setValue('de');
    expect(wrapper.emitted('updateTargetLocale')).toEqual([['de']]);
  });

  it('показывает unsupported language evidence, но не предлагает его выбрать', () => {
    const value = state('PROFILE');
    value.language.locale = 'pt-BR';
    value.language.conflictingLocale = 'ja';
    value.language.needsConfirmation = true;
    const wrapper = shallowMount(ConversationTranslationBanner, {
      props: {
        state: value,
        loading: false,
        saving: false,
        canManage: true,
        eligibleCount: 0,
      },
      global: {
        stubs: {
          Select: {
            props: ['modelValue', 'options'],
            template:
              '<select :value="modelValue"><option v-for="option in options" :key="String(option.value)" :value="option.value">{{ option.label }}</option></select>',
          },
        },
      },
    });

    expect(wrapper.text()).toContain('португальский');
    expect(wrapper.text()).toContain('японский');
    expect(
      wrapper
        .get('select')
        .findAll('option')
        .map((option) => option.attributes('value')),
    ).toEqual([undefined, 'ru', 'de']);
    expect(wrapper.text()).not.toContain('Использовать японский');
    expect(wrapper.text()).not.toContain('Оставить португальский');
  });

  it.each([
    ['PROFILE', 'из профиля'],
    ['RECENT_MESSAGES', 'по последним сообщениям'],
    ['CASE_HINT', 'из обращения'],
  ] as const)('объясняет конфликт через фактический source %s', (source, explanation) => {
    const value = state(source);
    value.language.locale = 'en';
    value.language.conflictingLocale = 'de';
    value.language.needsConfirmation = true;
    const wrapper = shallowMount(ConversationTranslationBanner, {
      props: {
        state: value,
        loading: false,
        saving: false,
        canManage: true,
        eligibleCount: 0,
      },
    });

    expect(wrapper.text()).toContain(explanation);
    expect(wrapper.text()).toContain('английский');
    expect(wrapper.text()).toContain('немецкий');
  });
});
