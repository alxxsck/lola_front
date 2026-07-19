<script setup lang="ts">
import type {
  ScenarioLocalizationCatalogResponseDto,
  ScenarioLocalizationPolicyDto,
} from "@/shared/api/generated/models";
import { localeDisplayName } from "@/shared/lib/locale";

const props = defineProps<{
  modelValue: ScenarioLocalizationPolicyDto;
  catalog: ScenarioLocalizationCatalogResponseDto;
  readonly?: boolean;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: ScenarioLocalizationPolicyDto];
}>();

function all() {
  emit("update:modelValue", {
    version: 1,
    mode: "ALL_PROJECT_LOCALES",
    locales: [],
  });
}
function selected(locales = [props.catalog.defaultLocale]) {
  emit("update:modelValue", {
    version: 1,
    mode: "SELECTED_LOCALES",
    locales: [...new Set([props.catalog.defaultLocale, ...locales])],
  });
}
function toggle(locale: string, checked: boolean) {
  const current =
    props.modelValue.mode === "SELECTED_LOCALES"
      ? props.modelValue.locales
      : props.catalog.locales.map(({ code }) => code);
  selected(
    checked
      ? [...current, locale]
      : current.filter((candidate) => candidate !== locale),
  );
}
</script>

<template>
  <fieldset class="policy-control" :disabled="readonly">
    <legend>Языки контента</legend>
    <label class="policy-option">
      <input
        type="radio"
        name="scenario-localization-mode"
        :checked="modelValue.mode === 'ALL_PROJECT_LOCALES'"
        @change="all"
      />
      <span><strong>Все языки проекта</strong><small>Для публикации нужно заполнить каждый язык.</small></span>
    </label>
    <label class="policy-option">
      <input
        type="radio"
        name="scenario-localization-mode"
        :checked="modelValue.mode === 'SELECTED_LOCALES'"
        @change="selected(catalog.locales.map(({ code }) => code))"
      />
      <span><strong>Только выбранные языки</strong><small>Остальные пользователи получат основной вариант.</small></span>
    </label>
    <div v-if="modelValue.mode === 'SELECTED_LOCALES'" class="selected-locales">
      <button type="button" class="default-only" @click="selected()">
        Только основной язык — показывать его всем
      </button>
      <label v-for="locale in catalog.locales" :key="locale.code">
        <input
          type="checkbox"
          :checked="modelValue.locales.includes(locale.code)"
          :disabled="locale.code === catalog.defaultLocale"
          @change="toggle(locale.code, ($event.target as HTMLInputElement).checked)"
        />
        {{ localeDisplayName(locale.code) }} ({{ locale.code }})
        <small v-if="locale.code === catalog.defaultLocale">Основной</small>
      </label>
      <p>
        Если Scenario запустится для другого языка, пользователь получит вариант на основном языке —
        {{ localeDisplayName(catalog.defaultLocale) }} ({{ catalog.defaultLocale }}), а не пустое сообщение.
      </p>
    </div>
  </fieldset>
</template>

<style scoped>
.policy-control { display: grid; gap: 8px; margin: 0; padding: 0; border: 0; }
legend { margin-bottom: 8px; font-weight: 700; }
.policy-option { display: flex; gap: 9px; padding: 10px; border: 1px solid var(--border-default); border-radius: 10px; }
.policy-option span { display: grid; gap: 2px; }
.policy-option small, .selected-locales p { color: var(--text-small-muted); }
.selected-locales { display: grid; gap: 7px; margin-left: 24px; padding: 10px; background: var(--surface-subtle); border-radius: 10px; }
.selected-locales label { display: flex; align-items: center; gap: 7px; }
.default-only { justify-self: start; border: 0; background: transparent; color: var(--brand-primary); font: inherit; cursor: pointer; }
.selected-locales p { margin: 4px 0 0; font-size: .72rem; }
</style>
