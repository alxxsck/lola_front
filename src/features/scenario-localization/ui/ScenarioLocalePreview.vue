<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type {
  ScenarioLocalizationCatalogResponseDto,
  ScenarioLocalizationPolicyDto,
} from "@/shared/api/generated/models";
import type { ScenarioAction } from "@/shared/types/domain";
import { localeDisplayName } from "@/shared/lib/locale";
import { requiredLocales, resolveLocalizedContent } from "../model";

const props = defineProps<{
  actions: ScenarioAction[];
  catalog: ScenarioLocalizationCatalogResponseDto;
  policy?: ScenarioLocalizationPolicyDto;
}>();
const requestedLocale = ref(props.catalog.defaultLocale);
watch(
  () => props.catalog.locales.map(({ code }) => code),
  (locales) => {
    if (!locales.includes(requestedLocale.value))
      requestedLocale.value = props.catalog.defaultLocale;
  },
);

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function resolve(value: unknown) {
  const enabledLocales = props.policy
    ? requiredLocales(props.catalog, props.policy)
    : props.catalog.locales.map(({ code }) => code);
  if (!enabledLocales.includes(requestedLocale.value)) {
    const fallback = resolveLocalizedContent(
      value,
      props.catalog.defaultLocale,
      props.catalog.defaultLocale,
    );
    return {
      ...fallback,
      fallbackReason: `${requestedLocale.value} не включён в языки сценария — используется основной язык`,
    };
  }
  return resolveLocalizedContent(
    value,
    requestedLocale.value,
    props.catalog.defaultLocale,
  );
}

const rows = computed(() =>
  props.actions.flatMap((action) => {
    const config = record(action.config);
    return props.catalog.paths
      .filter((descriptor) => descriptor.actionType === action.type)
      .flatMap((descriptor) => {
        if (descriptor.path === "config.options[].label") {
          return Array.isArray(config.options)
            ? config.options.map((option, index) => ({
                key: `${action.nodeKey}:option:${record(option).id ?? index}`,
                action: action.nodeKey ?? action.type,
                field: `Вариант ${index + 1}`,
                ...resolve(record(option).label),
              }))
            : [];
        }
        const match = descriptor.path.match(/^config\.([^.]+)$/);
        if (!match) return [];
        return [
          {
            key: `${action.nodeKey}:${descriptor.path}`,
            action: action.nodeKey ?? action.type,
            field: match[1]!,
            ...resolve(config[match[1]!]),
          },
        ];
      });
  }),
);
</script>

<template>
  <section class="locale-preview" aria-label="Preview локализованного контента">
    <label>
      Язык пользователя
      <select v-model="requestedLocale">
        <option v-for="locale in catalog.locales" :key="locale.code" :value="locale.code">
          {{ localeDisplayName(locale.code) }} ({{ locale.code }})
        </option>
      </select>
    </label>
    <div v-if="rows.length" class="preview-rows">
      <article v-for="row in rows" :key="row.key">
        <small>{{ row.action }} · {{ row.field }}</small>
        <p>{{ row.text || "Контент не заполнен" }}</p>
        <span>
          {{ requestedLocale }} → {{ row.contentLocale }}
          <template v-if="row.fallbackReason"> · {{ row.fallbackReason }}</template>
        </span>
      </article>
    </div>
    <p v-else class="empty-preview">Добавьте локализуемое действие, чтобы увидеть preview.</p>
  </section>
</template>

<style scoped>
.locale-preview { display: grid; gap: 8px; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-subtle); }
.locale-preview > label { display: grid; gap: 5px; color: var(--text-secondary); font-size: .68rem; font-weight: 700; }
select { min-height: 34px; border: 1px solid var(--border-default); border-radius: 8px; padding: 5px 8px; background: var(--surface-card); color: var(--text-primary); }
.preview-rows { display: grid; gap: 6px; max-height: 230px; overflow: auto; }
article { padding: 8px; border-radius: 9px; background: var(--surface-subtle); }
article small, article span, .empty-preview { color: var(--text-small-muted); font-size: .62rem; }
article p { margin: 4px 0; font-size: .72rem; line-height: 1.4; white-space: pre-wrap; }
.empty-preview { margin: 0; }
</style>
