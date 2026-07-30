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
      label: `${localeDisplayName(locale)} · ${locale.toUpperCase()}`,
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
              ? `${localeDisplayName(responseLocale)} · ${responseLocale.toUpperCase()}`
              : "не подтверждён"
          }}
          · {{ responseLocaleSource }}
          · рабочий язык:
          {{ state.preference.workingLocale.toUpperCase() }}
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
        icon="pi pi-language"
        size="small"
        text
        class="translation-banner__translate"
        :aria-label="`Перевести ещё ${eligibleCount} сообщений`"
        :title="`Перевести ещё ${eligibleCount} сообщений`"
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
  justify-content: flex-end;
  gap: 10px;
  min-width: 0;
  margin-left: auto;
}
.translation-banner.unavailable {
  color: var(--status-warning-text);
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
  font-size: 0.67rem;
}
.translation-banner__main span {
  max-width: 220px;
  overflow: hidden;
  color: var(--text-secondary);
  font-size: 0.59rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.translation-banner__icon {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  border-radius: 8px;
  background: var(--surface-card);
  color: var(--status-violet-text);
  box-shadow: inset 0 0 0 1px var(--line);
}
.translation-banner__controls :deep(.p-select) {
  width: 152px;
  min-height: 34px;
  font-size: 0.66rem;
}
.translation-banner__controls :deep(.p-button) {
  min-height: 34px;
  font-size: 0.65rem;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}
@media (max-width: 1180px) {
  .translation-banner__main > div {
    display: none;
  }
}
@media (max-width: 720px) {
  .translation-banner {
    width: 100%;
    margin-left: 0;
  }
  .translation-banner__controls {
    width: 100%;
  }
  .translation-banner__controls :deep(.p-select) {
    width: min(210px, calc(100vw - 128px));
  }
  .translation-banner__translate {
    width: 34px;
    flex: 0 0 34px;
    padding-inline: 0;
  }
}
</style>
