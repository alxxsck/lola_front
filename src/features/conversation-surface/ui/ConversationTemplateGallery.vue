<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import Skeleton from "primevue/skeleton";
import Tag from "primevue/tag";
import type {
  SupportMacroCatalogFreshnessDto,
  SupportMacroResponseDto,
} from "@/shared/api/generated/models";
import type { ConversationReplyTemplate } from "../model/conversation-reply-templates";

type TemplateGalleryItem = SupportMacroResponseDto | ConversationReplyTemplate;

const props = withDefaults(defineProps<{
  visible: boolean;
  macros?: readonly SupportMacroResponseDto[];
  templates?: readonly ConversationReplyTemplate[];
  query?: string;
  loading?: boolean;
  applyingId?: string | null;
  error?: string;
  hasMore?: boolean;
  freshness?: SupportMacroCatalogFreshnessDto | null;
}>(), {
  macros: () => [],
  templates: () => [],
  query: "",
  loading: false,
  applyingId: null,
  error: "",
  hasMore: false,
  freshness: null,
});

// Runtime emits keep the shared gallery compatible with the legacy User workspace
// while Support passes the server-owned macro projection.
const emit = defineEmits(["close", "select", "search", "loadMore"]);

const localQuery = ref(props.query);
const searchInput = ref<{ $el?: HTMLInputElement } | null>(null);
const items = computed<readonly TemplateGalleryItem[]>(() =>
  props.macros.length ? props.macros : props.templates,
);
const serverOwned = computed(() => props.macros.length > 0 || props.templates.length === 0);

watch(
  () => props.query,
  (value) => (localQuery.value = value),
);
watch(
  () => props.visible,
  async (visible) => {
    if (!visible) return;
    localQuery.value = props.query;
    await nextTick();
    searchInput.value?.$el?.focus();
  },
);

function isMacro(item: TemplateGalleryItem): item is SupportMacroResponseDto {
  return "stableCode" in item;
}

function title(item: TemplateGalleryItem): string {
  if (!isMacro(item)) return item.label;
  return (
    item.publishedRevision?.configuration.title ??
    item.draft?.configuration.title ??
    item.stableCode
  );
}

function body(item: TemplateGalleryItem): string {
  if (!isMacro(item)) return item.text;
  return item.publishedRevision?.configuration.body ?? "Macro ещё не опубликован.";
}

function description(item: TemplateGalleryItem): string {
  return isMacro(item) ? item.stableCode : item.description;
}

function shortcuts(item: TemplateGalleryItem): string[] {
  return isMacro(item) ? item.publishedRevision?.configuration.shortcuts ?? [] : [];
}

function applicability(item: TemplateGalleryItem): string[] {
  if (!isMacro(item)) return [];
  return [
    item.applicability.locale ?? "любой язык",
    item.applicability.visibility === "PROJECT" ? "весь проект" : "команды",
    ...item.applicability.categoryCodes.slice(0, 2),
  ];
}

function disabled(item: TemplateGalleryItem): boolean {
  return Boolean(props.applyingId) || (isMacro(item) && (item.lifecycle !== "ACTIVE" || !item.publishedRevision));
}

function submitSearch(): void {
  emit("search", localQuery.value.trim());
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    dismissable-mask
    class="support-macro-dialog"
    :style="{ width: 'min(720px, calc(100vw - 24px))' }"
    :draggable="false"
    @update:visible="!$event && emit('close')"
  >
    <template #header>
      <div class="macro-dialog__heading">
        <span>{{ serverOwned ? "Support macros" : "Быстрый ответ" }}</span>
        <h3>Шаблоны ответа</h3>
        <p>
          {{ serverOwned
            ? "Выберите опубликованный macro — он появится как обычный редактируемый черновик."
            : "Выберите быстрый ответ — перед отправкой его можно изменить." }}
        </p>
      </div>
    </template>

    <form v-if="serverOwned" class="macro-search" role="search" @submit.prevent="submitSearch">
      <i class="pi pi-search" aria-hidden="true" />
      <InputText
        ref="searchInput"
        v-model="localQuery"
        aria-label="Найти macro"
        placeholder="Название, код или быстрый вызов"
      />
      <Button type="submit" label="Найти" :disabled="loading" />
    </form>

    <Message v-if="error" severity="warn" :closable="false" role="status">
      {{ error }}
    </Message>
    <p v-if="serverOwned && freshness" class="macro-freshness" role="status">
      <i class="pi pi-database" aria-hidden="true" />
      Каталог: актуален
      <span>· generation {{ freshness.generation }}</span>
    </p>

    <div v-if="loading && !items.length" class="macro-list" aria-label="Загрузка macros">
      <Skeleton v-for="index in 3" :key="index" height="94px" border-radius="14px" />
    </div>
    <p v-else-if="!items.length" class="macro-empty">
      <i class="pi pi-file-edit" aria-hidden="true" />
      <strong>Подходящих macros нет</strong>
      <span>Измените запрос или попросите администратора опубликовать шаблон.</span>
    </p>
    <div v-else class="macro-list" aria-live="polite">
      <button
        v-for="item in items"
        :key="item.id"
        type="button"
        class="macro-row"
        :disabled="disabled(item)"
        @click="emit('select', item)"
      >
        <span class="macro-row__icon"><i class="pi pi-file-edit" aria-hidden="true" /></span>
        <span class="macro-row__content">
          <span class="macro-row__title">
            <strong>{{ title(item) }}</strong>
            <Tag
              v-if="isMacro(item)"
              :value="`v${item.publishedRevision?.revisionNumber ?? '—'}`"
              severity="secondary"
            />
          </span>
          <span class="macro-row__body">{{ body(item) }}</span>
          <span class="macro-row__meta">
            <span>{{ description(item) }}</span>
            <span v-for="shortcut in shortcuts(item).slice(0, 3)" :key="shortcut">/{{ shortcut }}</span>
            <span v-for="fact in applicability(item)" :key="fact">{{ fact }}</span>
          </span>
        </span>
        <span class="macro-row__action" aria-hidden="true">
          <i v-if="applyingId === item.id" class="pi pi-spin pi-spinner" />
          <i v-else class="pi pi-arrow-right" />
        </span>
      </button>
    </div>

    <Button
      v-if="hasMore"
      label="Показать ещё"
      severity="secondary"
      outlined
      class="macro-load-more"
      :loading="loading"
      @click="emit('loadMore')"
    />
  </Dialog>
</template>

<style scoped>
.macro-dialog__heading {
  display: grid;
  gap: 3px;
}
.macro-dialog__heading > span {
  color: var(--text-tertiary);
  font-size: 0.68rem;
  font-weight: 750;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.macro-dialog__heading h3,
.macro-dialog__heading p {
  margin: 0;
}
.macro-dialog__heading h3 {
  color: var(--text-primary);
  font-size: 1rem;
  font-weight: 780;
  letter-spacing: -0.01em;
}
.macro-dialog__heading p {
  max-width: 580px;
  color: var(--text-tertiary);
  font-size: 0.78rem;
  line-height: 1.45;
}
.macro-search {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding: 4px 4px 4px 12px;
  border: 1px solid var(--border-default);
  border-radius: 12px;
  background: var(--surface-subtle);
}
.macro-search > i {
  color: var(--text-tertiary);
  font-size: 0.85rem;
}
.macro-search :deep(.p-inputtext) {
  min-width: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
}
.macro-search :deep(.p-button) {
  min-height: 40px;
}
.macro-freshness { display: flex; align-items: center; gap: 5px; margin: 0 0 8px; color: var(--text-tertiary); font-size: 0.68rem; }
.macro-freshness span { color: var(--text-muted); }
.macro-list {
  display: grid;
  max-height: min(480px, 58dvh);
  gap: 6px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.macro-row {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) 32px;
  min-height: 92px;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  background: var(--surface-card);
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
  transition: border-color 160ms cubic-bezier(0.23, 1, 0.32, 1), background 160ms cubic-bezier(0.23, 1, 0.32, 1), transform 120ms cubic-bezier(0.23, 1, 0.32, 1);
}
.macro-row:hover,
.macro-row:focus-visible {
  border-color: var(--palette-blue-200);
  background: var(--status-accent-soft);
  outline: none;
}
.macro-row:active { transform: scale(0.99); }
.macro-row:disabled { cursor: not-allowed; opacity: 0.58; }
.macro-row__icon,
.macro-row__action {
  display: grid;
  place-items: center;
}
.macro-row__icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--brand-soft);
  color: var(--text-brand);
}
.macro-row__action { color: var(--text-tertiary); }
.macro-row__content { display: grid; min-width: 0; gap: 5px; }
.macro-row__title { display: flex; min-width: 0; align-items: center; gap: 8px; }
.macro-row__title strong { overflow: hidden; font-size: 0.86rem; font-weight: 750; text-overflow: ellipsis; white-space: nowrap; }
.macro-row__body { display: -webkit-box; overflow: hidden; color: var(--text-secondary); font-size: 0.76rem; line-height: 1.42; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.macro-row__meta { display: flex; min-width: 0; flex-wrap: wrap; gap: 6px; color: var(--text-tertiary); font-family: ui-monospace, "SFMono-Regular", Consolas, monospace; font-size: 0.64rem; }
.macro-empty {
  display: grid;
  min-height: 220px;
  place-items: center;
  align-content: center;
  gap: 7px;
  margin: 0;
  color: var(--text-tertiary);
  text-align: center;
}
.macro-empty > i { font-size: 1.4rem; }
.macro-empty strong { color: var(--text-primary); font-size: 0.9rem; }
.macro-empty span { max-width: 360px; font-size: 0.76rem; line-height: 1.45; }
.macro-load-more { width: 100%; margin-top: 10px; }

@media (max-width: 640px) {
  .macro-search { grid-template-columns: auto minmax(0, 1fr); padding-right: 8px; }
  .macro-search :deep(.p-button) { grid-column: 1 / -1; width: 100%; }
  .macro-list { max-height: 52dvh; }
  .macro-row { grid-template-columns: 32px minmax(0, 1fr) 28px; min-height: 104px; padding: 10px; }
  .macro-row__icon { width: 32px; height: 32px; }
}

@media (prefers-reduced-motion: reduce) {
  .macro-row { transition: none; }
}
</style>
