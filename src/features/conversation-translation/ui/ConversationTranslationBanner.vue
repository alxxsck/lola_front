<script setup lang="ts">
import { computed } from "vue";
import Button from "primevue/button";
import Select from "primevue/select";
import ToggleSwitch from "primevue/toggleswitch";
import type { ConversationTranslationResponseDto } from "@/shared/api/generated/models";
import { localeDisplayName } from "@/shared/lib/locale";

const props = defineProps<{
  state: ConversationTranslationResponseDto | null;
  loading: boolean;
  saving: boolean;
  canManage: boolean;
  eligibleCount: number;
}>();
const emit = defineEmits<{
  reload: [];
  updateEnabled: [enabled: boolean];
  updateTargetLocale: [locale: string | null];
  translateVisible: [];
}>();

const languageSourceLabels = {
  MANUAL: "выбран вручную",
  PROFILE: "из профиля",
  RECENT_MESSAGES: "по последним сообщениям",
  CASE_HINT: "из обращения",
  UNKNOWN: "источник не определён",
} as const;

const responseLocale = computed(
  () =>
    props.state?.preference.endUserLocaleOverride ??
    props.state?.language.locale ??
    null,
);
const responseLocaleSource = computed(() =>
  props.state?.preference.endUserLocaleOverride
    ? languageSourceLabels.MANUAL
    : props.state
      ? languageSourceLabels[props.state.language.source]
      : languageSourceLabels.UNKNOWN,
);
const supportedLocaleSet = computed(
  () => new Set(props.state?.supportedLocales ?? []),
);
const selectableResponseLocale = computed(() => {
  const locale =
    props.state?.preference.endUserLocaleOverride ??
    props.state?.language.locale ??
    null;
  return locale && supportedLocaleSet.value.has(locale) ? locale : null;
});

const localeOptions = computed<Array<{ label: string; value: string | null }>>(
  () => [
    { label: "Определять автоматически", value: null },
    ...[...new Set(props.state?.supportedLocales ?? [])].map((locale) => ({
      label: `${localeDisplayName(locale)} · ${locale}`,
      value: locale,
    })),
  ],
);

function isSupportedLocale(
  locale: string | null | undefined,
): locale is string {
  return Boolean(locale && supportedLocaleSet.value.has(locale));
}
</script>

<template>
  <section
    class="translation-banner"
    :class="{ unavailable: state && !state.availability.available }"
    aria-label="Перевод диалога"
  >
    <div class="translation-banner__main">
      <span class="translation-banner__icon"
        ><i class="pi pi-language" aria-hidden="true"
      /></span>
      <div>
        <strong>Перевод диалога</strong>
        <span v-if="loading">Определяем язык и загружаем настройки…</span>
        <span v-else-if="!state">Настройки перевода недоступны.</span>
        <span v-else-if="!state.availability.available">
          Перевод временно недоступен. Повторите попытку позже.
        </span>
        <span v-else-if="state.language.needsConfirmation">
          Требуется подтверждение.
          <template v-if="state.language.locale">
            Текущий вариант:
            {{ localeDisplayName(state.language.locale) }}
            · {{ responseLocaleSource }}.
          </template>
          <template v-if="state.language.conflictingLocale">
            Альтернативный:
            {{ localeDisplayName(state.language.conflictingLocale) }}.
          </template>
          <template
            v-if="!state.language.locale && !state.language.conflictingLocale"
          >
            Выберите язык вручную.
          </template>
        </span>
        <span v-else>
          Язык ответов:
          {{
            responseLocale
              ? `${localeDisplayName(responseLocale)} (${responseLocale})`
              : "не подтверждён"
          }}
          · {{ responseLocaleSource }}
          · рабочий язык:
          {{ localeDisplayName(state.preference.workingLocale) }}
          <template v-if="!state.preference.enabled">
            · перевод выключен
          </template>
        </span>
      </div>
    </div>
    <div v-if="state" class="translation-banner__controls">
      <Button
        v-if="!state.availability.available"
        label="Проверить снова"
        icon="pi pi-refresh"
        size="small"
        text
        :disabled="loading || saving"
        @click="emit('reload')"
      />
      <template
        v-if="
          state.language.needsConfirmation &&
          !state.preference.endUserLocaleOverride
        "
      >
        <Button
          v-if="isSupportedLocale(state.language.conflictingLocale)"
          :label="`Использовать ${localeDisplayName(state.language.conflictingLocale)}`"
          size="small"
          :disabled="saving || !canManage"
          @click="emit('updateTargetLocale', state.language.conflictingLocale!)"
        />
        <Button
          v-if="isSupportedLocale(state.language.locale)"
          :label="`Оставить ${localeDisplayName(state.language.locale)}`"
          size="small"
          severity="secondary"
          text
          :disabled="saving || !canManage"
          @click="emit('updateTargetLocale', state.language.locale)"
        />
      </template>
      <Button
        v-if="
          !state.language.needsConfirmation &&
          state.preference.enabled &&
          eligibleCount
        "
        :label="`Перевести видимые · ${eligibleCount}`"
        icon="pi pi-language"
        size="small"
        text
        :disabled="saving || !canManage"
        @click="emit('translateVisible')"
      />
      <Select
        :model-value="selectableResponseLocale"
        :options="localeOptions"
        option-label="label"
        option-value="value"
        placeholder="Язык пользователя"
        size="small"
        :disabled="saving || !canManage"
        aria-label="Язык пользователя"
        @update:model-value="emit('updateTargetLocale', $event)"
      />
      <label>
        <span class="sr-only">Переводить этот диалог</span>
        <ToggleSwitch
          :model-value="state.preference.enabled"
          :disabled="
            saving ||
            !canManage ||
            !state.availability.available ||
            (state.language.needsConfirmation &&
              !state.preference.endUserLocaleOverride)
          "
          aria-label="Переводить этот диалог"
          @update:model-value="emit('updateEnabled', $event)"
        />
      </label>
    </div>
    <Button
      v-else-if="!loading"
      label="Повторить"
      icon="pi pi-refresh"
      size="small"
      text
      @click="emit('reload')"
    />
  </section>
</template>

<style scoped>
.translation-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 12px;
  padding: 10px 16px;
  border: 1px solid
    color-mix(in srgb, var(--status-violet-text) 18%, var(--line));
  border-radius: 12px;
  background: color-mix(
    in srgb,
    var(--status-violet-soft) 70%,
    var(--surface-card)
  );
}
.translation-banner.unavailable {
  background: var(--status-warning-soft);
}
.translation-banner__main,
.translation-banner__controls {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.translation-banner__main > div {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.translation-banner__main strong {
  font-size: 0.73rem;
}
.translation-banner__main span {
  color: var(--text-secondary);
  font-size: 0.65rem;
}
.translation-banner__icon {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  border-radius: 9px;
  background: var(--surface-card);
  color: var(--status-violet-text);
}
.translation-banner__controls :deep(.p-select) {
  width: 176px;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}
@media (max-width: 720px) {
  .translation-banner {
    align-items: stretch;
    flex-direction: column;
  }
  .translation-banner__controls {
    justify-content: space-between;
  }
  .translation-banner__controls :deep(.p-select) {
    width: min(240px, calc(100vw - 130px));
  }
}
</style>
