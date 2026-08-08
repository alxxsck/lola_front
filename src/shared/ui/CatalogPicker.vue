<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import Listbox from "primevue/listbox";

export interface CatalogPickerMeta {
  label: string;
  icon?: string;
}

export interface CatalogPickerOption {
  value: string;
  name: string;
  code: string;
  context?: string;
  description?: string;
  meta?: CatalogPickerMeta[];
  data?: unknown;
}

export interface CatalogPickerFilter {
  value: string;
  label: string;
  icon?: string;
  testId?: string;
}

export interface CatalogPickerRequest {
  query: string;
  cursor?: string;
  limit: number;
  filter?: string;
}

export interface CatalogPickerPage {
  items: CatalogPickerOption[];
  nextCursor: string | null;
}

const props = withDefaults(
  defineProps<{
    modelValue: string | string[];
    multiple?: boolean;
    maxSelection?: number;
    allowEmpty?: boolean;
    label: string;
    placeholder: string;
    disabled?: boolean;
    required?: boolean;
    hideLabel?: boolean;
    scopeKey?: string | number;
    selectedOption?: CatalogPickerOption;
    selectedOptions?: CatalogPickerOption[];
    load: (request: CatalogPickerRequest) => Promise<CatalogPickerPage>;
    filters?: CatalogPickerFilter[];
    allFilterLabel?: string;
    eyebrow: string;
    title: string;
    multipleTitle?: string;
    description: string;
    searchPlaceholder: string;
    emptyMessage: string;
    errorMessage: string;
    applyLabel: string;
    multipleApplyLabel?: string;
    icon?: string;
    layout?: "list" | "grid";
    testIdPrefix: string;
    labelClass?: string;
  }>(),
  {
    disabled: false,
    required: false,
    hideLabel: false,
    multiple: false,
    maxSelection: 50,
    allowEmpty: false,
    scopeKey: "",
    selectedOption: undefined,
    selectedOptions: () => [],
    filters: () => [],
    allFilterLabel: "Все",
    multipleTitle: undefined,
    multipleApplyLabel: undefined,
    icon: "pi pi-list",
    layout: "list",
    labelClass: undefined,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string | string[]];
  select: [option: CatalogPickerOption | CatalogPickerOption[]];
}>();

const visible = ref(false);
const appendTarget = import.meta.env.MODE === "test" ? "self" : "body";
const labelId = useId();
const summaryId = useId();
const requiredDescriptionId = useId();
const searchInput = ref<HTMLInputElement | null>(null);
const options = ref<CatalogPickerOption[]>([]);
const draftValues = ref<string[]>([]);
const draftOptions = ref<CatalogPickerOption[]>([]);
const chosenOptions = ref<CatalogPickerOption[]>([]);
const loading = ref(false);
const error = ref("");
const query = ref("");
const nextCursor = ref<string | null>(null);
const activeFilter = ref<string>();
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let requestGeneration = 0;

const modelValues = computed(() =>
  Array.isArray(props.modelValue)
    ? props.modelValue
    : props.modelValue
      ? [props.modelValue]
      : [],
);
const resolvedOptions = computed(() => {
  const candidates = [
    ...chosenOptions.value,
    ...props.selectedOptions,
    ...(props.selectedOption ? [props.selectedOption] : []),
    ...options.value,
  ];
  return modelValues.value.flatMap((value) => {
    const option = candidates.find((candidate) => candidate.value === value);
    return option ? [option] : [];
  });
});
const selected = computed(() => resolvedOptions.value[0]);
const draftModel = computed<string | string[] | null>({
  get: () =>
    props.multiple ? [...draftValues.value] : (draftValues.value[0] ?? null),
  set: (value) => {
    if (
      !props.multiple &&
      !value &&
      !props.allowEmpty &&
      draftValues.value.length
    )
      return;
    const nextValues = Array.isArray(value)
      ? value.slice(0, props.maxSelection)
      : value
        ? [value]
        : [];
    const candidates = [
      ...draftOptions.value,
      ...resolvedOptions.value,
      ...options.value,
    ];
    draftValues.value = nextValues;
    draftOptions.value = nextValues.flatMap((item) => {
      const option = candidates.find((candidate) => candidate.value === item);
      return option ? [option] : [];
    });
  },
});
const dialogTitle = computed(() =>
  props.multiple && props.multipleTitle ? props.multipleTitle : props.title,
);
const statusText = computed(() => {
  if (loading.value && !options.value.length) return "Загружаем каталог…";
  if (error.value) return error.value;
  if (!options.value.length) return props.emptyMessage;
  return `Показано: ${options.value.length}${nextCursor.value ? "+" : ""}`;
});

function testId(part: string): string {
  return `${props.testIdPrefix}-${part}`;
}

async function open(): Promise<void> {
  if (props.disabled) return;
  visible.value = true;
  draftValues.value = [...modelValues.value];
  draftOptions.value = [...resolvedOptions.value];
  query.value = "";
  await loadPage(false);
  await nextTick();
  searchInput.value?.focus();
}

async function loadPage(append: boolean): Promise<void> {
  const cursor = append ? nextCursor.value : null;
  if (append && !cursor) return;
  const generation = ++requestGeneration;
  loading.value = true;
  error.value = "";
  try {
    const page = await props.load({
      query: query.value.trim(),
      ...(cursor ? { cursor } : {}),
      ...(activeFilter.value ? { filter: activeFilter.value } : {}),
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
  } catch (cause) {
    if (generation !== requestGeneration) return;
    error.value = cause instanceof Error ? cause.message : props.errorMessage;
    if (!append) options.value = [];
    nextCursor.value = null;
  } finally {
    if (generation === requestGeneration) loading.value = false;
  }
}

function filterBy(value: string | undefined): void {
  activeFilter.value = value;
  void loadPage(false);
}

function scheduleSearch(): void {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => void loadPage(false), 250);
}

function clearSearch(): void {
  if (searchTimer) clearTimeout(searchTimer);
  query.value = "";
  void loadPage(false);
  searchInput.value?.focus();
}

function clearDraft(): void {
  draftValues.value = [];
  draftOptions.value = [];
}

function close(): void {
  visible.value = false;
}

function apply(): void {
  const candidates = [
    ...draftOptions.value,
    ...resolvedOptions.value,
    ...options.value,
  ];
  const picked = draftValues.value.flatMap((value) => {
    const option = candidates.find((candidate) => candidate.value === value);
    return option ? [option] : [];
  });
  if (!picked.length && !props.allowEmpty) return;
  chosenOptions.value = picked;
  emit(
    "update:modelValue",
    props.multiple ? [...draftValues.value] : (draftValues.value[0] ?? ""),
  );
  if (props.multiple) emit("select", picked);
  else if (picked[0]) emit("select", picked[0]);
  visible.value = false;
}

onBeforeUnmount(() => {
  requestGeneration += 1;
  if (searchTimer) clearTimeout(searchTimer);
});

watch(
  () => props.scopeKey,
  () => {
    requestGeneration += 1;
    if (searchTimer) clearTimeout(searchTimer);
    visible.value = false;
    options.value = [];
    draftValues.value = [];
    draftOptions.value = [];
    chosenOptions.value = [];
    loading.value = false;
    error.value = "";
    query.value = "";
    nextCursor.value = null;
    activeFilter.value = undefined;
  },
);
</script>

<template>
  <div class="catalog-picker">
    <span
      :id="labelId"
      :class="[
        'catalog-picker__label',
        labelClass,
        hideLabel && 'catalog-picker__label--visually-hidden',
        hideLabel && labelClass ? `${labelClass}--visually-hidden` : undefined,
      ]"
    >
      {{ label }}
    </span>
    <span
      v-if="required"
      :id="requiredDescriptionId"
      class="catalog-picker__label--visually-hidden"
    >
      Обязательное поле
    </span>
    <button
      type="button"
      class="catalog-picker__trigger"
      :data-testid="testId('trigger')"
      :disabled="disabled"
      :aria-labelledby="`${labelId} ${summaryId}`"
      :aria-describedby="required ? requiredDescriptionId : undefined"
      aria-haspopup="dialog"
      :aria-expanded="visible"
      @click="open"
    >
      <span class="catalog-picker__trigger-icon" aria-hidden="true">
        <i :class="icon" />
      </span>
      <span class="catalog-picker__trigger-copy">
        <strong :id="summaryId">
          {{
            multiple && resolvedOptions.length > 1
              ? `${resolvedOptions.length} выбрано`
              : (selected?.name ?? placeholder)
          }}
        </strong>
        <small v-if="selected">
          {{
            multiple && resolvedOptions.length > 1
              ? resolvedOptions.map((option) => option.code).join(", ")
              : selected.code
          }}
        </small>
      </span>
      <span class="catalog-picker__trigger-action">
        <span>{{ selected ? "Изменить" : "Выбрать" }}</span>
        <i class="pi pi-arrow-right" aria-hidden="true" />
      </span>
    </button>

    <Dialog
      v-model:visible="visible"
      modal
      :draggable="false"
      :append-to="appendTarget"
      class="catalog-picker-dialog"
      :style="{ width: 'min(920px, calc(100vw - 24px))' }"
      @hide="close"
    >
      <template #header>
        <div class="catalog-picker__dialog-heading">
          <span class="catalog-picker__eyebrow">{{ eyebrow }}</span>
          <h2>{{ dialogTitle }}</h2>
          <p>{{ description }}</p>
        </div>
      </template>

      <div class="catalog-picker__body">
        <div class="catalog-picker__toolbar">
          <label class="catalog-picker__search">
            <i class="pi pi-search" aria-hidden="true" />
            <input
              ref="searchInput"
              v-model="query"
              type="search"
              :data-testid="testId('search')"
              :aria-label="searchPlaceholder"
              :placeholder="searchPlaceholder"
              autocomplete="off"
              @input="scheduleSearch"
            />
            <button
              v-if="query"
              type="button"
              class="catalog-picker__search-clear"
              aria-label="Очистить поиск"
              @click="clearSearch"
            >
              <i class="pi pi-times" aria-hidden="true" />
            </button>
          </label>
          <div
            v-if="filters.length"
            class="catalog-picker__filters"
            role="group"
            aria-label="Фильтр каталога"
          >
            <button
              type="button"
              :aria-pressed="!activeFilter"
              @click="filterBy(undefined)"
            >
              {{ allFilterLabel }}
            </button>
            <button
              v-for="filter in filters"
              :key="filter.value"
              type="button"
              :data-testid="filter.testId"
              :aria-pressed="activeFilter === filter.value"
              @click="filterBy(filter.value)"
            >
              <i v-if="filter.icon" :class="filter.icon" aria-hidden="true" />
              {{ filter.label }}
            </button>
          </div>
        </div>

        <div class="catalog-picker__list-head" aria-live="polite">
          <span>{{ statusText }}</span>
          <strong v-if="draftValues.length">
            Выбрано: {{ draftValues.length }}
          </strong>
        </div>

        <Listbox
          v-if="options.length"
          v-model="draftModel"
          :class="[
            'catalog-picker__options',
            `catalog-picker__options--${layout}`,
          ]"
          :options="options"
          option-label="name"
          option-value="value"
          :multiple="multiple"
          :aria-label="multiple ? `${title}: множественный выбор` : title"
        >
          <template #option="{ option, selected: optionSelected }">
            <div
              class="catalog-picker__option"
              :data-testid="testId('option')"
            >
              <span
                v-if="multiple"
                class="catalog-picker__selection-mark"
                aria-hidden="true"
              >
                <i v-if="optionSelected" class="pi pi-check" />
              </span>
              <span class="catalog-picker__option-copy">
                <span v-if="option.context" class="catalog-picker__option-context">
                  {{ option.context }}
                </span>
                <span class="catalog-picker__option-title">
                  <strong>{{ option.name }}</strong>
                  <code>{{ option.code }}</code>
                </span>
                <small v-if="option.description">{{ option.description }}</small>
                <span v-if="option.meta?.length" class="catalog-picker__meta">
                  <span v-for="item in option.meta" :key="`${option.value}:${item.label}`">
                    <i v-if="item.icon" :class="item.icon" aria-hidden="true" />
                    {{ item.label }}
                  </span>
                </span>
              </span>
            </div>
          </template>
        </Listbox>

        <div v-if="loading && !options.length" class="catalog-picker__loading" role="status">
          <i class="pi pi-spin pi-spinner" aria-hidden="true" />
          Загрузка…
        </div>
        <div v-else-if="error" class="catalog-picker__error" role="alert">
          <span>{{ error }}</span>
          <Button
            label="Повторить"
            :data-testid="testId('retry')"
            severity="secondary"
            size="small"
            @click="loadPage(false)"
          />
        </div>
        <p v-else-if="!options.length" class="catalog-picker__empty" role="status">
          {{ emptyMessage }}
        </p>
        <Button
          v-if="nextCursor"
          class="catalog-picker__more"
          label="Показать ещё"
          :data-testid="testId('more')"
          severity="secondary"
          text
          :loading="loading"
          @click="loadPage(true)"
        />
      </div>

      <template #footer>
        <div class="catalog-picker__footer">
          <span>
            <strong>{{ draftValues.length }}</strong>
            {{ multiple ? "выбрано" : draftValues.length ? "выбрано" : "— выбор не сделан" }}
          </span>
          <div>
            <Button
              v-if="allowEmpty && draftValues.length"
              class="catalog-picker__clear"
              label="Очистить"
              severity="secondary"
              text
              @click="clearDraft"
            />
            <Button label="Отмена" severity="secondary" outlined @click="close" />
            <Button
              :label="multiple ? (multipleApplyLabel ?? applyLabel) : applyLabel"
              icon="pi pi-check"
              :data-testid="testId('apply')"
              :disabled="!draftValues.length && !allowEmpty"
              @click="apply"
            />
          </div>
        </div>
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.catalog-picker {
  container: catalog-picker / inline-size;
  display: grid;
  align-content: start;
  gap: 7px;
  min-width: 0;
}
.catalog-picker__label {
  color: var(--text-primary);
  font-size: var(--font-size-body-small);
  font-weight: 650;
}
.catalog-picker__label--visually-hidden {
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
.catalog-picker__trigger {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: var(
    --catalog-picker-trigger-height,
    var(--event-picker-trigger-height, var(--control-height))
  );
  min-height: var(
    --catalog-picker-trigger-height,
    var(--event-picker-trigger-height, var(--control-height))
  );
  padding: 4px 7px;
  border: 1px solid var(--input-border);
  border-radius: 10px;
  background: var(--input-background);
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
  transition:
    border-color 160ms cubic-bezier(0.23, 1, 0.32, 1),
    box-shadow 160ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 120ms cubic-bezier(0.23, 1, 0.32, 1);
}
.catalog-picker__trigger:hover:not(:disabled) {
  border-color: var(--input-border-hover);
}
.catalog-picker__trigger:active:not(:disabled) {
  transform: scale(0.99);
}
.catalog-picker__trigger:focus-visible {
  border-color: var(--focus-ring);
  outline: 0;
  box-shadow: 0 0 0 3px var(--focus-ring-outer);
}
.catalog-picker__trigger:disabled {
  cursor: not-allowed;
  opacity: 0.62;
}
.catalog-picker__trigger-icon {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 7px;
  background: var(--status-accent-soft);
  color: var(--status-accent-text);
}
.catalog-picker__trigger-copy {
  display: grid;
  min-width: 0;
  line-height: 1.1;
}
.catalog-picker__trigger-copy strong,
.catalog-picker__trigger-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.catalog-picker__trigger-copy strong {
  font-size: var(--font-size-control);
  font-weight: 650;
}
.catalog-picker__trigger-copy small {
  color: var(--text-small-muted);
  font: 0.68rem/1.15 ui-monospace, SFMono-Regular, Menlo, monospace;
}
.catalog-picker__trigger-action {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 30px;
  padding: 5px 7px;
  border-radius: 7px;
  background: var(--surface-hover);
  color: var(--action-primary);
  font-size: 0.7rem;
  font-weight: 700;
}
.catalog-picker__dialog-heading {
  display: grid;
  gap: 3px;
  min-width: 0;
}
.catalog-picker__eyebrow {
  color: var(--action-primary);
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.catalog-picker__dialog-heading h2,
.catalog-picker__dialog-heading p {
  margin: 0;
}
.catalog-picker__dialog-heading h2 {
  font-size: 1.08rem;
  letter-spacing: -0.01em;
  text-wrap: balance;
}
.catalog-picker__dialog-heading p {
  color: var(--text-small-muted);
  font-size: 0.78rem;
  line-height: 1.45;
  text-wrap: pretty;
}
.catalog-picker__body {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto auto;
  min-height: 0;
}
.catalog-picker__toolbar {
  position: sticky;
  z-index: 2;
  top: 0;
  display: grid;
  gap: 8px;
  padding-bottom: 10px;
  background: var(--surface-card);
}
.catalog-picker__search {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 44px;
  padding: 0 8px 0 12px;
  border: 1px solid var(--input-border);
  border-radius: 10px;
  background: var(--input-background);
  transition:
    border-color 160ms cubic-bezier(0.23, 1, 0.32, 1),
    box-shadow 160ms cubic-bezier(0.23, 1, 0.32, 1);
}
.catalog-picker__search:focus-within {
  border-color: var(--focus-ring);
  box-shadow: 0 0 0 3px var(--focus-ring-outer);
}
.catalog-picker__search input {
  width: 100%;
  min-width: 0;
  min-height: 42px;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
}
.catalog-picker__search-clear {
  display: grid;
  flex: 0 0 36px;
  place-items: center;
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
}
.catalog-picker__search-clear:hover {
  background: var(--surface-hover);
}
.catalog-picker__filters {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding: 1px 1px 2px;
  scrollbar-width: thin;
}
.catalog-picker__filters button {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
  min-height: 40px;
  padding: 7px 11px;
  border: 1px solid var(--border-default);
  border-radius: 999px;
  background: var(--surface-card);
  color: var(--text-secondary);
  font-size: 0.73rem;
  font-weight: 650;
}
.catalog-picker__filters button[aria-pressed="true"] {
  border-color: color-mix(
    in srgb,
    var(--action-primary) 40%,
    var(--border-default)
  );
  background: var(--surface-active);
  color: var(--action-primary);
}
.catalog-picker__list-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  min-height: 26px;
  padding: 2px 3px 7px;
  color: var(--text-small-muted);
  font-size: 0.69rem;
  font-variant-numeric: tabular-nums;
}
.catalog-picker__list-head strong {
  color: var(--action-primary);
}
.catalog-picker__options {
  max-height: min(54vh, 520px);
  overflow: auto;
  border: 0;
  background: transparent;
  overscroll-behavior: contain;
}
.catalog-picker__options :deep(.p-listbox-list-container) {
  max-height: none !important;
  overflow: visible;
}
.catalog-picker__options :deep(.p-listbox-list) {
  display: grid;
  gap: 5px;
  padding: 2px 3px 6px;
}
.catalog-picker__options--grid :deep(.p-listbox-list) {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: stretch;
}
.catalog-picker__options--grid :deep(.p-listbox-option) {
  height: 100%;
}
.catalog-picker__options :deep(.p-listbox-option) {
  min-width: 0;
  min-height: 60px;
  padding: 0;
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  background: var(--surface-card);
  color: var(--text-primary);
  transition:
    border-color 140ms cubic-bezier(0.23, 1, 0.32, 1),
    background 140ms cubic-bezier(0.23, 1, 0.32, 1);
}
.catalog-picker__options :deep(.p-listbox-option:hover) {
  border-color: var(--input-border-hover);
  background: var(--surface-hover);
}
.catalog-picker__options :deep(.p-listbox-option:focus-visible) {
  outline: 2px solid var(--action-primary);
  outline-offset: 2px;
}
.catalog-picker__options :deep(.p-listbox-option[aria-selected="true"]) {
  border-color: var(--action-primary);
  background: color-mix(
    in srgb,
    var(--action-primary) 4%,
    var(--surface-card)
  ) !important;
  box-shadow: inset 0 0 0 1px
    color-mix(in srgb, var(--action-primary) 34%, transparent);
}
.catalog-picker__option {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  width: 100%;
  min-width: 0;
  padding: 7px 10px;
  text-align: left;
}
.catalog-picker__selection-mark + .catalog-picker__option-copy {
  min-width: 0;
}
.catalog-picker__option:has(.catalog-picker__selection-mark) {
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 9px;
}
.catalog-picker__selection-mark {
  display: grid;
  place-items: center;
  width: 27px;
  height: 27px;
  margin-top: 1px;
  border: 1px solid var(--input-border);
  border-radius: 8px;
  background: transparent;
  color: var(--text-small-muted);
}
.catalog-picker__options
  :deep(.p-listbox-option[aria-selected="true"] .catalog-picker__selection-mark) {
  background: var(--action-primary);
  color: var(--on-action-primary);
}
.catalog-picker__option-copy {
  display: grid;
  gap: 3px;
  min-width: 0;
}
.catalog-picker__option-context {
  color: var(--text-small-muted);
  font-size: 0.64rem;
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: 0.015em;
}
.catalog-picker__option-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.catalog-picker__option-title strong {
  overflow: hidden;
  font-size: 0.84rem;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.catalog-picker__option-title code {
  overflow: hidden;
  max-width: 42%;
  color: var(--text-secondary);
  font-size: 0.68rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.catalog-picker__option-copy > small {
  display: -webkit-box;
  overflow: hidden;
  color: var(--text-small-muted);
  font-size: 0.72rem;
  line-height: 1.4;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.catalog-picker__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.catalog-picker__meta > span {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 5px;
  border-radius: 999px;
  background: var(--surface-hover);
  color: var(--text-secondary);
  font-size: 0.62rem;
  font-weight: 650;
  line-height: 1.15;
}
.catalog-picker__meta i {
  flex: 0 0 auto;
  font-size: 0.6rem;
  line-height: 1;
}
.catalog-picker__loading,
.catalog-picker__error {
  display: flex;
  min-height: 112px;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 16px;
}
.catalog-picker__error {
  justify-content: space-between;
  color: var(--danger-color);
}
.catalog-picker__empty {
  min-height: 112px;
  margin: 0;
  padding: 44px 12px;
  color: var(--text-small-muted);
  text-align: center;
}
.catalog-picker__more {
  width: 100%;
  margin-top: 2px;
}
.catalog-picker__footer {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}
.catalog-picker__footer > span {
  color: var(--text-small-muted);
  font-size: 0.72rem;
}
.catalog-picker__footer > span strong {
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}
.catalog-picker__footer > div {
  display: flex;
  gap: 8px;
}
.catalog-picker__footer :deep(.p-button) {
  min-height: 40px;
}
:global(.catalog-picker-dialog .p-dialog-content) {
  min-height: 0;
  padding-top: 8px;
}
:global(.catalog-picker-dialog .p-dialog-footer) {
  border-top: 1px solid var(--border-subtle);
}
@media (max-width: 620px) {
  :global(.catalog-picker-dialog) {
    width: calc(100vw - 12px) !important;
    height: calc(100dvh - 12px);
    max-height: calc(100dvh - 12px);
    margin: 6px;
  }
  :global(.catalog-picker-dialog .p-dialog-content) {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    padding-right: max(12px, env(safe-area-inset-right));
    padding-left: max(12px, env(safe-area-inset-left));
    overflow: hidden;
  }
  .catalog-picker__body {
    flex: 1 1 auto;
    overflow: hidden;
  }
  .catalog-picker__options {
    max-height: none;
    min-height: 0;
  }
  .catalog-picker__options--grid :deep(.p-listbox-list) {
    grid-template-columns: minmax(0, 1fr);
  }
  .catalog-picker__trigger-action {
    width: 32px;
    justify-content: center;
  }
  .catalog-picker__trigger-action span {
    display: none;
  }
  .catalog-picker__option-title {
    display: grid;
    gap: 2px;
  }
  .catalog-picker__option-title code {
    max-width: 100%;
  }
  .catalog-picker__footer {
    align-items: stretch;
    flex-direction: column;
  }
  .catalog-picker__footer > div {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  .catalog-picker__footer :deep(.catalog-picker__clear) {
    grid-column: 1 / -1;
  }
}
@container catalog-picker (max-width: 220px) {
  .catalog-picker__trigger {
    grid-template-columns: 28px minmax(0, 1fr) 32px;
    gap: 6px;
    padding-inline: 6px;
  }
  .catalog-picker__trigger-action {
    justify-content: center;
  }
  .catalog-picker__trigger-action span {
    display: none;
  }
}
@container catalog-picker (max-width: 160px) {
  .catalog-picker__trigger {
    grid-template-columns: minmax(0, 1fr) 32px;
  }
  .catalog-picker__trigger-icon {
    display: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .catalog-picker__trigger,
  .catalog-picker__search,
  .catalog-picker__options :deep(.p-listbox-option) {
    transition: none;
  }
}
</style>
