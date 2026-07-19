<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type {
  ScenarioLocalizationCatalogResponseDto,
  ScenarioLocalizationPolicyDto,
  ScenarioTranslationCatalogResponseDto,
} from "@/shared/api/generated/models";
import { localeDisplayName } from "@/shared/lib/locale";
import {
  requiredLocales,
  targetLocalesForTranslation,
  type LocalizedText,
} from "../model";

export type TranslationUiState =
  | "IDLE"
  | "PENDING"
  | "RUNNING"
  | "MACHINE_UNSAVED"
  | "MANUAL"
  | "ERROR"
  | "STALE_SOURCE"
  | "TARGET_CONFLICT"
  | "CANCELLED";

const props = withDefaults(
  defineProps<{
    modelValue: LocalizedText;
    catalog: ScenarioLocalizationCatalogResponseDto;
    translation: ScenarioTranslationCatalogResponseDto;
    policy: ScenarioLocalizationPolicyDto;
    sourceLocale: string;
    fieldPath: string;
    scenarioId: string;
    projectId: string;
    label: string;
    translationStates?: Record<string, TranslationUiState>;
    maxLength?: number;
    supportsTemplates?: boolean;
    readonly?: boolean;
    focusLocale?: string;
  }>(),
  {
    translationStates: () => ({}),
    maxLength: undefined,
    supportsTemplates: false,
    readonly: false,
    focusLocale: "",
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: LocalizedText];
  "translation-request": [targets: string[]];
  "manual-edit": [locale: string];
  retry: [locale: string];
  cancel: [];
}>();

const expanded = ref(false);
const search = ref("");
const targetPickerOpen = ref(false);
const pickedTargets = ref<string[]>([]);
const translationMenu = ref<HTMLDetailsElement | null>(null);
const activeTarget = ref(
  props.catalog.locales.find(({ code }) => code !== props.sourceLocale)?.code ?? "",
);
const orderedLocales = computed(() => [
  ...props.catalog.locales.filter(({ code }) => code === props.sourceLocale),
  ...props.catalog.locales.filter(({ code }) => code !== props.sourceLocale),
]);
const targets = computed(() =>
  orderedLocales.value.filter(({ code }) => code !== props.sourceLocale),
);
const largeSet = computed(() => props.catalog.locales.length > 5);
const filteredTargets = computed(() => {
  const needle = search.value.trim().toLocaleLowerCase();
  if (!needle) return targets.value;
  return targets.value.filter(({ code }) =>
    `${localeDisplayName(code)} ${code}`.toLocaleLowerCase().includes(needle),
  );
});
const required = computed(() => requiredLocales(props.catalog, props.policy));
const filled = computed(
  () => required.value.filter((locale) => props.modelValue[locale]?.trim()).length,
);
const generateTargets = computed(() =>
  targetLocalesForTranslation({
    catalog: props.catalog,
    policy: props.policy,
    sourceLocale: props.sourceLocale,
    value: props.modelValue,
    supportedTargetLocales: props.translation.supportedTargetLocales,
  }),
);
const allTranslatableTargets = computed(() =>
  targetLocalesForTranslation({
    catalog: props.catalog,
    policy: props.policy,
    sourceLocale: props.sourceLocale,
    value: props.modelValue,
    supportedTargetLocales: props.translation.supportedTargetLocales,
    includeFilled: true,
  }),
);
const filledTargets = computed(() =>
  allTranslatableTargets.value.filter((locale) => props.modelValue[locale]?.trim()),
);
const translationBusy = computed(() =>
  Object.values(props.translationStates).some((state) =>
    ["PENDING", "RUNNING"].includes(state),
  ),
);
watch(
  () => props.focusLocale,
  (locale) => {
    if (!locale || locale === props.sourceLocale) return;
    expanded.value = true;
    activeTarget.value = locale;
  },
  { immediate: true },
);

const statusLabels: Record<TranslationUiState, string> = {
  IDLE: "Не заполнен",
  PENDING: "В очереди",
  RUNNING: "Переводится",
  MACHINE_UNSAVED: "Сгенерирован · не сохранён",
  MANUAL: "Изменён вручную",
  ERROR: "Ошибка · повторить",
  STALE_SOURCE: "Устарел: исходный текст изменился",
  TARGET_CONFLICT: "Конфликт — перевод готов",
  CANCELLED: "Отменён",
};

function update(locale: string, value: string) {
  emit("update:modelValue", { ...props.modelValue, [locale]: value });
  if (locale !== props.sourceLocale) emit("manual-edit", locale);
}

function localeStatus(locale: string) {
  return (
    props.translationStates[locale] ??
    (props.modelValue[locale]?.trim() ? "MANUAL" : "IDLE")
  );
}

function openTargetPicker() {
  pickedTargets.value = [...generateTargets.value];
  targetPickerOpen.value = true;
  translationMenu.value?.removeAttribute("open");
}

function requestTargets(targets: string[]) {
  const filled = targets.filter((locale) => props.modelValue[locale]?.trim());
  if (
    filled.length &&
    !window.confirm(
      `Заменить существующие переводы: ${filled
        .map((locale) => `${localeDisplayName(locale)} (${locale})`)
        .join(", ")}?`,
    )
  )
    return;
  translationMenu.value?.removeAttribute("open");
  targetPickerOpen.value = false;
  if (targets.length) emit("translation-request", targets);
}
</script>

<template>
  <div class="localized-field" :data-field-path="fieldPath">
    <div class="source-toolbar">
      <label :for="`${scenarioId}-${fieldPath}-${sourceLocale}`">
        {{ label }} · {{ localeDisplayName(sourceLocale) }} ({{ sourceLocale }})
        <span class="default-badge">Основной</span>
      </label>
      <div class="translation-actions">
        <button
          type="button"
          class="translate-button"
          data-translation-trigger
          title="Перевести этот текст на все языки сценария с помощью Google Translation LLM"
          :aria-label="`Перевести ${label} на языки сценария с помощью AI`"
          :disabled="
            readonly ||
            !translation.enabled ||
            !modelValue[sourceLocale]?.trim() ||
            !generateTargets.length ||
            translationBusy
          "
          @click="emit('translation-request', generateTargets)"
        >
          <span aria-hidden="true" class="sparkle">✦</span>
          {{ translationBusy ? "Переводим…" : "AI Перевести" }}
        </button>
        <details v-if="allTranslatableTargets.length" ref="translationMenu" class="translation-menu">
          <summary aria-label="Другие варианты AI-перевода">•••</summary>
          <div>
            <button type="button" :disabled="!generateTargets.length" @click="emit('translation-request', generateTargets)">
              Перевести только незаполненные
            </button>
            <button type="button" @click="openTargetPicker">Выбрать языки…</button>
            <button v-if="filledTargets.length" type="button" @click="requestTargets(allTranslatableTargets)">
              Перевести заново…
            </button>
          </div>
        </details>
      </div>
      <button
        v-if="Object.values(translationStates).some((state) => state === 'PENDING')"
        type="button"
        class="cancel-button"
        @click="emit('cancel')"
      >Отменить</button>
    </div>
    <small v-if="translation.enabled" class="translation-privacy">
      В Google Translation LLM через Lola отправляется только статический текст поля — без данных пользователей и значений шаблонов.
    </small>
    <div v-if="targetPickerOpen" class="target-picker" role="group" aria-label="Выбрать языки для AI-перевода">
      <label v-for="locale in allTranslatableTargets" :key="locale">
        <input v-model="pickedTargets" type="checkbox" :value="locale" />
        {{ localeDisplayName(locale) }} ({{ locale }})
        <small v-if="modelValue[locale]?.trim()">Будет заменён</small>
      </label>
      <div>
        <button type="button" class="cancel-button" @click="targetPickerOpen = false">Закрыть</button>
        <button type="button" class="translate-button" :disabled="!pickedTargets.length" @click="requestTargets(pickedTargets)">
          Перевести выбранные
        </button>
      </div>
    </div>
    <textarea
      :id="`${scenarioId}-${fieldPath}-${sourceLocale}`"
      :value="modelValue[sourceLocale] ?? ''"
      :maxlength="maxLength"
      :readonly="readonly"
      rows="3"
      :aria-label="`${label}, основной язык ${sourceLocale}`"
      @input="update(sourceLocale, ($event.target as HTMLTextAreaElement).value)"
    />

    <button
      v-if="targets.length"
      type="button"
      class="coverage-trigger"
      data-coverage-trigger
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <span>Переводы {{ filled }}/{{ required.length }}</span>
      <span v-if="translationBusy">· Переводится</span>
      <span aria-hidden="true">{{ expanded ? "⌃" : "⌄" }}</span>
    </button>

    <section v-if="expanded" class="translations" aria-label="Переводы поля">
      <template v-if="!largeSet">
        <div v-for="locale in targets" :key="locale.code" class="target-editor">
          <label :for="`${scenarioId}-${fieldPath}-${locale.code}`">
            {{ localeDisplayName(locale.code) }} ({{ locale.code }})
            <span class="locale-status">{{ statusLabels[localeStatus(locale.code)] }}</span>
          </label>
          <button v-if="localeStatus(locale.code) === 'ERROR'" type="button" class="retry-button" @click="emit('retry', locale.code)">Повторить перевод</button>
          <textarea
            :id="`${scenarioId}-${fieldPath}-${locale.code}`"
            :value="modelValue[locale.code] ?? ''"
            :maxlength="maxLength"
            :readonly="readonly"
            rows="3"
            :aria-label="`${label}, перевод ${locale.code}`"
            @input="update(locale.code, ($event.target as HTMLTextAreaElement).value)"
          />
        </div>
      </template>
      <div v-else class="locale-panel">
        <div class="locale-list">
          <input v-model="search" type="search" placeholder="Найти язык" aria-label="Найти язык перевода" />
          <button
            v-for="locale in filteredTargets"
            :key="locale.code"
            type="button"
            :class="{ active: activeTarget === locale.code }"
            @click="activeTarget = locale.code"
          >
            <span>{{ localeDisplayName(locale.code) }} ({{ locale.code }})</span>
            <small>{{ statusLabels[localeStatus(locale.code)] }}</small>
          </button>
        </div>
        <div v-if="activeTarget" class="target-editor">
          <label :for="`${scenarioId}-${fieldPath}-${activeTarget}`">
            {{ localeDisplayName(activeTarget) }} ({{ activeTarget }})
            <span class="locale-status">{{ statusLabels[localeStatus(activeTarget)] }}</span>
          </label>
          <button v-if="localeStatus(activeTarget) === 'ERROR'" type="button" class="retry-button" @click="emit('retry', activeTarget)">Повторить перевод</button>
          <textarea
            :id="`${scenarioId}-${fieldPath}-${activeTarget}`"
            :value="modelValue[activeTarget] ?? ''"
            :maxlength="maxLength"
            :readonly="readonly"
            rows="4"
            :aria-label="`${label}, перевод ${activeTarget}`"
            @input="update(activeTarget, ($event.target as HTMLTextAreaElement).value)"
          />
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.localized-field { display: grid; gap: 8px; }
.source-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.translation-actions { position: relative; display: flex; align-items: center; gap: 4px; margin-left: auto; }
label { font-size: .78rem; font-weight: 650; color: var(--text-primary); }
.default-badge { margin-left: 5px; padding: 2px 6px; border-radius: 999px; background: var(--status-violet-soft); color: var(--status-violet-text); font-size: .62rem; }
textarea, input[type="search"] { width: 100%; box-sizing: border-box; border: 1px solid var(--border-default); border-radius: 10px; padding: 10px 11px; background: var(--surface-card); color: var(--text-primary); font: inherit; resize: vertical; }
.translate-button, .coverage-trigger, .locale-list button { border: 0; cursor: pointer; font: inherit; }
.cancel-button, .retry-button { justify-self: start; border: 0; background: transparent; color: var(--text-link); font-size: .68rem; cursor: pointer; }
.translate-button { flex: 0 0 auto; padding: 6px 9px; border-radius: 9px; background: var(--status-violet-soft); color: var(--status-violet-text); font-size: .72rem; font-weight: 700; }
.translate-button:disabled { cursor: not-allowed; opacity: .5; }
.translation-privacy { color: var(--text-small-muted); font-size: .64rem; line-height: 1.4; }
.translation-menu summary { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 8px; color: var(--text-secondary); cursor: pointer; list-style: none; }
.translation-menu summary::-webkit-details-marker { display: none; }
.translation-menu > div { position: absolute; z-index: 8; top: calc(100% + 5px); right: 0; display: grid; width: 240px; padding: 6px; border: 1px solid var(--border-default); border-radius: 10px; background: var(--surface-card); box-shadow: var(--shadow-raised); }
.translation-menu button { padding: 8px; border: 0; border-radius: 7px; background: transparent; color: var(--text-primary); text-align: left; cursor: pointer; }
.translation-menu button:hover { background: var(--surface-hover); }
.translation-menu button:disabled { cursor: not-allowed; opacity: .5; }
.target-picker { display: grid; gap: 7px; padding: 10px; border: 1px solid var(--border-default); border-radius: 10px; background: var(--surface-subtle); }
.target-picker > label { display: flex; align-items: center; gap: 7px; }
.target-picker > label small { margin-left: auto; color: var(--status-warning-text); }
.target-picker > div { display: flex; justify-content: flex-end; gap: 8px; }
.sparkle { display: inline-block; margin-right: 3px; }
.translate-button:not(:disabled):hover .sparkle { animation: shimmer .7s ease; }
.coverage-trigger { display: flex; justify-content: space-between; padding: 7px 9px; border-radius: 9px; background: var(--surface-subtle); color: var(--text-secondary); font-size: .7rem; }
.translations { display: grid; gap: 12px; padding: 12px; border: 1px solid var(--border-default); border-radius: 12px; background: var(--surface-subtle); }
.target-editor { display: grid; gap: 6px; }
.locale-status { margin-left: 6px; color: var(--text-small-muted); font-size: .64rem; font-weight: 500; }
.locale-panel { display: grid; grid-template-columns: minmax(150px, .8fr) minmax(220px, 1.4fr); gap: 12px; }
.locale-list { display: grid; align-content: start; gap: 4px; max-height: 280px; overflow: auto; }
.locale-list button { display: grid; gap: 2px; padding: 8px; border-radius: 8px; background: transparent; color: var(--text-primary); text-align: left; }
.locale-list button.active { background: var(--status-violet-soft); }
.locale-list small { color: var(--text-small-muted); }
@keyframes shimmer { 50% { transform: rotate(18deg) scale(1.2); } }
@media (prefers-reduced-motion: reduce) { .sparkle { animation: none !important; } }
@media (max-width: 640px) { .source-toolbar { align-items: flex-start; flex-direction: column; } .translation-actions { margin-left: 0; } .translation-menu > div { right: auto; left: 0; } .locale-panel { grid-template-columns: 1fr; } }
</style>
