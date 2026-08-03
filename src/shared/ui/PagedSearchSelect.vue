<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";

export interface PagedSearchOption {
  value: string;
  label: string;
  description?: string;
}

export interface PagedSearchPage {
  items: PagedSearchOption[];
  nextCursor: string | null;
}

export interface PagedSearchRequest {
  query: string;
  cursor?: string;
  limit: number;
}

const props = withDefaults(
  defineProps<{
    modelValue: string;
    label: string;
    placeholder: string;
    searchPlaceholder?: string;
    emptyText?: string;
    disabled?: boolean;
    reloadKey?: string;
    selectedOption?: PagedSearchOption;
    load: (input: PagedSearchRequest) => Promise<PagedSearchPage>;
  }>(),
  {
    searchPlaceholder: "Поиск по названию или коду",
    emptyText: "Ничего не найдено",
    disabled: false,
    reloadKey: "",
    selectedOption: undefined,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
  select: [option: PagedSearchOption];
}>();

const open = ref(false);
const query = ref("");
const options = ref<PagedSearchOption[]>([]);
const chosenOption = ref<PagedSearchOption>();
const nextCursor = ref<string | null>(null);
const loading = ref(false);
const error = ref("");
const loaded = ref(false);
let requestGeneration = 0;
let searchTimer: ReturnType<typeof setTimeout> | undefined;

const selected = computed(
  () =>
    options.value.find((option) => option.value === props.modelValue) ??
    (chosenOption.value?.value === props.modelValue
      ? chosenOption.value
      : undefined) ??
    (props.selectedOption?.value === props.modelValue
      ? props.selectedOption
      : undefined),
);

watch(
  () => props.modelValue,
  (value) => {
    if (chosenOption.value?.value !== value) chosenOption.value = undefined;
  },
);

watch(
  () => props.reloadKey,
  () => {
    requestGeneration += 1;
    clearSearchTimer();
    open.value = false;
    query.value = "";
    options.value = [];
    chosenOption.value = undefined;
    nextCursor.value = null;
    loading.value = false;
    error.value = "";
    loaded.value = false;
  },
);

onBeforeUnmount(() => {
  requestGeneration += 1;
  clearSearchTimer();
});

function toggle(): void {
  if (props.disabled) return;
  open.value = !open.value;
  if (open.value && !loaded.value) void loadPage(false);
}

function scheduleSearch(): void {
  requestGeneration += 1;
  loading.value = false;
  clearSearchTimer();
  searchTimer = setTimeout(() => void loadPage(false), 250);
}

function clearSearchTimer(): void {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = undefined;
}

async function loadPage(append: boolean): Promise<void> {
  const cursor = append ? nextCursor.value : null;
  if (append && (!cursor || loading.value)) return;
  const generation = ++requestGeneration;
  loading.value = true;
  error.value = "";
  try {
    const page = await props.load({
      query: query.value.trim(),
      ...(cursor ? { cursor } : {}),
      limit: 25,
    });
    if (generation !== requestGeneration) return;
    const combined = append ? [...options.value, ...page.items] : page.items;
    options.value = combined.filter(
      (option, index, all) =>
        all.findIndex((candidate) => candidate.value === option.value) ===
        index,
    );
    nextCursor.value = page.nextCursor;
    loaded.value = true;
  } catch (cause) {
    if (generation !== requestGeneration) return;
    error.value =
      cause instanceof Error ? cause.message : "Не удалось загрузить список";
    if (!append) options.value = [];
    nextCursor.value = null;
    loaded.value = true;
  } finally {
    if (generation === requestGeneration) loading.value = false;
  }
}

function choose(option: PagedSearchOption): void {
  chosenOption.value = option;
  emit("update:modelValue", option.value);
  emit("select", option);
  open.value = false;
}

function closeOnEscape(): void {
  open.value = false;
}
</script>

<template>
  <div class="paged-search-select" @keydown.esc="closeOnEscape">
    <span class="paged-search-select__label">{{ label }}</span>
    <button
      type="button"
      class="paged-search-select__trigger"
      data-testid="paged-search-trigger"
      :disabled="disabled"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @click="toggle"
    >
      <span :class="{ placeholder: !selected }">
        {{ selected?.label ?? placeholder }}
        <small v-if="selected?.description">{{ selected.description }}</small>
      </span>
      <i :class="open ? 'pi pi-chevron-up' : 'pi pi-chevron-down'" />
    </button>

    <div v-if="open" class="paged-search-select__panel">
      <label class="paged-search-select__search">
        <span class="sr-only">Поиск: {{ label }}</span>
        <i class="pi pi-search" aria-hidden="true" />
        <input
          v-model="query"
          type="search"
          :placeholder="searchPlaceholder"
          autocomplete="off"
          @input="scheduleSearch"
        />
      </label>

      <div class="paged-search-select__options" role="listbox">
        <button
          v-for="option in options"
          :key="option.value"
          type="button"
          role="option"
          :aria-selected="option.value === modelValue"
          @click="choose(option)"
        >
          <span>{{ option.label }}</span>
          <small v-if="option.description">{{ option.description }}</small>
          <i
            v-if="option.value === modelValue"
            class="pi pi-check"
            aria-hidden="true"
          />
        </button>
      </div>

      <p v-if="loading" class="paged-search-select__status" role="status">
        Загрузка…
      </p>
      <p v-else-if="error" class="paged-search-select__error" role="alert">
        {{ error }}
        <button type="button" @click="loadPage(false)">Повторить</button>
      </p>
      <p
        v-else-if="loaded && !options.length"
        class="paged-search-select__status"
        role="status"
      >
        {{ emptyText }}
      </p>
      <button
        v-if="nextCursor"
        type="button"
        class="paged-search-select__more"
        data-testid="paged-search-more"
        :disabled="loading"
        @click="loadPage(true)"
      >
        Показать ещё
      </button>
    </div>
  </div>
</template>

<style scoped>
.paged-search-select {
  position: relative;
  display: grid;
  gap: 7px;
  min-width: 0;
}
.paged-search-select__label {
  color: var(--text-secondary);
  font-size: 0.9rem;
  font-weight: 500;
}
.paged-search-select__trigger {
  display: flex;
  min-height: 48px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--border-default);
  border-radius: 12px;
  background: var(--surface-card);
  color: var(--text-primary);
  text-align: left;
}
.paged-search-select__trigger > span,
.paged-search-select__options span {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.paged-search-select small {
  overflow: hidden;
  color: var(--text-small-muted);
  font-size: 0.75rem;
  font-weight: 400;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.paged-search-select .placeholder {
  color: var(--text-small-muted);
}
.paged-search-select__panel {
  position: absolute;
  z-index: 30;
  top: calc(100% + 6px);
  display: grid;
  gap: 8px;
  width: 100%;
  max-height: 360px;
  padding: 10px;
  overflow: auto;
  border: 1px solid var(--border-default);
  border-radius: 12px;
  background: var(--surface-card);
  box-shadow: var(--shadow-raised);
}
.paged-search-select__search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border: 1px solid var(--border-default);
  border-radius: 10px;
}
.paged-search-select__search input {
  min-width: 0;
  width: 100%;
  padding: 11px 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: inherit;
}
.paged-search-select__options {
  display: grid;
  gap: 3px;
}
.paged-search-select__options button {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 9px 10px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: inherit;
  text-align: left;
}
.paged-search-select__options button:hover,
.paged-search-select__options button[aria-selected="true"] {
  background: var(--surface-active);
}
.paged-search-select__status,
.paged-search-select__error {
  margin: 4px 8px;
  color: var(--text-small-muted);
  font-size: 0.82rem;
}
.paged-search-select__error {
  color: var(--danger-color);
}
.paged-search-select__error button,
.paged-search-select__more {
  border: 0;
  background: transparent;
  color: var(--primary-color);
  font-weight: 600;
}
.paged-search-select__more {
  padding: 9px;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
