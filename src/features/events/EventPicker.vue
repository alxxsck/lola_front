<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";

export interface EventPickerOption {
  value: string;
  name: string;
  code: string;
  description?: string;
  ingestion?: "FRONTEND_ALLOWED" | "BACKEND_ONLY";
  tags?: string[];
}

export interface EventPickerRequest {
  query: string;
  cursor?: string;
  limit: number;
  ingestion?: EventPickerOption["ingestion"];
}

export interface EventPickerPage {
  items: EventPickerOption[];
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
    showIngestionFilter?: boolean;
    scopeKey?: string | number;
    selectedOption?: EventPickerOption;
    selectedOptions?: EventPickerOption[];
    load: (request: EventPickerRequest) => Promise<EventPickerPage>;
  }>(),
  {
    disabled: false,
    required: false,
    multiple: false,
    maxSelection: 50,
    allowEmpty: false,
    showIngestionFilter: false,
    scopeKey: "",
    selectedOption: undefined,
    selectedOptions: () => [],
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string | string[]];
  select: [option: EventPickerOption | EventPickerOption[]];
}>();

const visible = ref(false);
const labelId = useId();
const summaryId = useId();
const options = ref<EventPickerOption[]>([]);
const draftValues = ref<string[]>([]);
const draftOptions = ref<EventPickerOption[]>([]);
const chosenOptions = ref<EventPickerOption[]>([]);
const loading = ref(false);
const error = ref("");
const query = ref("");
const nextCursor = ref<string | null>(null);
const ingestion = ref<EventPickerOption["ingestion"]>();
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let requestGeneration = 0;

const modelValues = computed(() =>
  Array.isArray(props.modelValue)
    ? props.modelValue
    : props.modelValue
      ? [props.modelValue]
      : [],
);
const selectedOptions = computed(() => {
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
const selected = computed(() => selectedOptions.value[0]);

async function open(): Promise<void> {
  if (props.disabled) return;
  visible.value = true;
  draftValues.value = [...modelValues.value];
  draftOptions.value = [...selectedOptions.value];
  query.value = "";
  await loadPage(false);
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
      ...(ingestion.value ? { ingestion: ingestion.value } : {}),
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
    error.value =
      cause instanceof Error ? cause.message : "Не удалось загрузить события";
    if (!append) options.value = [];
    nextCursor.value = null;
  } finally {
    if (generation === requestGeneration) loading.value = false;
  }
}

function filterBy(next: EventPickerOption["ingestion"] | undefined): void {
  ingestion.value = next;
  void loadPage(false);
}

function scheduleSearch(): void {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => void loadPage(false), 250);
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
    ingestion.value = undefined;
  },
);

function choose(option: EventPickerOption): void {
  if (!props.multiple) {
    draftValues.value = [option.value];
    draftOptions.value = [option];
    return;
  }
  if (draftValues.value.includes(option.value)) {
    draftValues.value = draftValues.value.filter(
      (value) => value !== option.value,
    );
    draftOptions.value = draftOptions.value.filter(
      (candidate) => candidate.value !== option.value,
    );
  } else if (draftValues.value.length < props.maxSelection) {
    draftValues.value = [...draftValues.value, option.value];
    draftOptions.value = [
      ...draftOptions.value.filter(
        (candidate) => candidate.value !== option.value,
      ),
      option,
    ];
  }
}

function clearDraft(): void {
  draftValues.value = [];
  draftOptions.value = [];
}

function apply(): void {
  const candidates = [
    ...draftOptions.value,
    ...selectedOptions.value,
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
</script>

<template>
  <div class="event-picker">
    <span :id="labelId" class="event-picker__label">{{ label }}</span>
    <button
      type="button"
      class="event-picker__trigger"
      data-testid="event-picker-trigger"
      :disabled="disabled"
      :aria-labelledby="`${labelId} ${summaryId}`"
      aria-haspopup="dialog"
      :aria-expanded="visible"
      :aria-required="required || undefined"
      @click="open"
    >
      <span class="event-picker__trigger-icon" aria-hidden="true">
        <i class="pi pi-bolt" />
      </span>
      <span class="event-picker__trigger-copy">
        <strong :id="summaryId">{{
          multiple && selectedOptions.length > 1
            ? `${selectedOptions.length} событий`
            : (selected?.name ?? placeholder)
        }}</strong>
        <small v-if="selected">{{
          multiple && selectedOptions.length > 1
            ? selectedOptions.map((option) => option.code).join(", ")
            : selected.code
        }}</small>
      </span>
      <span class="event-picker__trigger-action">
        {{ selected ? "Изменить" : "Выбрать" }}
        <i class="pi pi-arrow-right" aria-hidden="true" />
      </span>
    </button>

    <Dialog
      v-model:visible="visible"
      modal
      append-to="self"
      class="event-picker-dialog"
      :style="{ width: 'min(880px, calc(100vw - 24px))' }"
    >
      <template #header>
        <div class="event-picker__dialog-heading">
          <span class="event-picker__eyebrow">Каталог событий</span>
          <h2>{{ multiple ? "Выберите события" : "Выберите событие" }}</h2>
          <p>Ищите по названию, системному коду или описанию.</p>
        </div>
      </template>

      <div class="event-picker__toolbar">
        <label class="event-picker__search">
          <i class="pi pi-search" aria-hidden="true" />
          <input
            v-model="query"
            type="search"
            data-testid="event-picker-search"
            aria-label="Поиск событий"
            placeholder="Название, код или описание"
            autocomplete="off"
            @input="scheduleSearch"
          />
        </label>
        <div
          v-if="showIngestionFilter"
          class="event-picker__filters"
          role="group"
          aria-label="Канал приёма события"
        >
          <button
            type="button"
            :aria-pressed="!ingestion"
            @click="filterBy(undefined)"
          >
            Все
          </button>
          <button
            type="button"
            data-testid="event-picker-filter-backend"
            :aria-pressed="ingestion === 'BACKEND_ONLY'"
            @click="filterBy('BACKEND_ONLY')"
          >
            <i class="pi pi-server" aria-hidden="true" /> Только backend
          </button>
          <button
            type="button"
            :aria-pressed="ingestion === 'FRONTEND_ALLOWED'"
            @click="filterBy('FRONTEND_ALLOWED')"
          >
            <i class="pi pi-desktop" aria-hidden="true" /> Разрешено frontend
          </button>
        </div>
      </div>

      <div class="event-picker__list-head">
        <span>{{
          loading ? "Обновляем каталог…" : `${options.length} на странице`
        }}</span>
        <strong v-if="draftValues.length"
          >Выбрано: {{ draftValues.length }}</strong
        >
      </div>
      <div
        :role="multiple ? 'group' : 'radiogroup'"
        class="event-picker__options"
        :aria-label="multiple ? 'События' : 'Событие'"
      >
        <button
          v-for="option in options"
          :key="option.value"
          type="button"
          data-testid="event-picker-option"
          :class="{ 'event-picker__option--single': !multiple }"
          :role="multiple ? undefined : 'radio'"
          :aria-checked="
            multiple ? undefined : draftValues.includes(option.value)
          "
          :aria-pressed="
            multiple ? draftValues.includes(option.value) : undefined
          "
          @click="choose(option)"
        >
          <span
            v-if="multiple"
            class="event-picker__selection-mark"
            aria-hidden="true"
          >
            <i
              :class="
                draftValues.includes(option.value)
                  ? 'pi pi-check'
                  : 'pi pi-square'
              "
            />
          </span>
          <span class="event-picker__option-copy">
            <span class="event-picker__option-title">
              <strong>{{ option.name }}</strong>
              <code>{{ option.code }}</code>
            </span>
            <small v-if="option.description">{{ option.description }}</small>
            <span
              v-if="option.ingestion || option.tags?.length"
              class="event-picker__meta"
            >
              <span v-if="option.ingestion">
                <i
                  :class="
                    option.ingestion === 'FRONTEND_ALLOWED'
                      ? 'pi pi-desktop'
                      : 'pi pi-server'
                  "
                  aria-hidden="true"
                />
                {{
                  option.ingestion === "FRONTEND_ALLOWED"
                    ? "Frontend"
                    : "Backend"
                }}
              </span>
              <span v-for="tag in option.tags" :key="tag">{{ tag }}</span>
            </span>
          </span>
        </button>
      </div>
      <p v-if="loading" role="status">Загрузка…</p>
      <div v-else-if="error" class="event-picker__error" role="alert">
        <span>{{ error }}</span>
        <Button
          label="Повторить"
          data-testid="event-picker-retry"
          severity="secondary"
          size="small"
          @click="loadPage(false)"
        />
      </div>
      <p v-else-if="!options.length" class="event-picker__empty" role="status">
        События не найдены
      </p>
      <Button
        v-if="nextCursor"
        label="Показать ещё"
        data-testid="event-picker-more"
        severity="secondary"
        text
        :loading="loading"
        @click="loadPage(true)"
      />
      <template #footer>
        <div class="event-picker__footer">
          <span>
            <strong>{{ draftValues.length }}</strong>
            {{ multiple ? "выбрано" : "событие выбрано" }}
          </span>
          <div>
            <Button
              v-if="allowEmpty && draftValues.length"
              class="event-picker__clear"
              label="Очистить"
              severity="secondary"
              text
              @click="clearDraft"
            />
            <Button
              label="Отмена"
              severity="secondary"
              outlined
              @click="visible = false"
            />
            <Button
              :label="multiple ? 'Применить выбор' : 'Выбрать событие'"
              icon="pi pi-check"
              data-testid="event-picker-apply"
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
.event-picker {
  display: grid;
  gap: 7px;
  min-width: 0;
}
.event-picker__label {
  color: var(--text-primary);
  font-size: var(--font-size-body-small);
  font-weight: 650;
}
.event-picker__trigger {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  min-height: 58px;
  align-items: center;
  gap: 11px;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--input-border);
  border-radius: 13px;
  background: var(--input-background);
  color: var(--text-primary);
  text-align: left;
  transition:
    border-color 0.16s ease,
    box-shadow 0.16s ease;
}
.event-picker__trigger:hover:not(:disabled) {
  border-color: var(--input-border-hover);
}
.event-picker__trigger:focus-visible {
  border-color: var(--focus-ring);
  outline: 0;
  box-shadow: 0 0 0 3px var(--focus-ring-outer);
}
.event-picker__trigger-icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: var(--status-accent-soft);
  color: var(--status-accent-text);
}
.event-picker__trigger-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.event-picker__trigger-copy strong,
.event-picker__trigger-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.event-picker__trigger-copy strong {
  font-size: var(--font-size-control);
}
.event-picker__trigger-copy small {
  color: var(--text-small-muted);
  font:
    0.72rem ui-monospace,
    SFMono-Regular,
    Menlo,
    monospace;
}
.event-picker__trigger-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 9px;
  border-radius: 9px;
  background: var(--surface-hover);
  color: var(--action-primary);
  font-size: 0.76rem;
  font-weight: 700;
}
.event-picker__dialog-heading {
  display: grid;
  gap: 3px;
}
.event-picker__eyebrow {
  color: var(--action-primary);
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.event-picker__dialog-heading h2,
.event-picker__dialog-heading p {
  margin: 0;
}
.event-picker__dialog-heading h2 {
  font-size: 1.08rem;
}
.event-picker__dialog-heading p {
  color: var(--text-small-muted);
  font-size: 0.78rem;
}
.event-picker__toolbar {
  position: sticky;
  z-index: 2;
  top: 0;
  display: grid;
  gap: 10px;
  padding-bottom: 12px;
  background: var(--surface-card);
}
.event-picker__search {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 12px;
  border: 1px solid var(--input-border);
  border-radius: 12px;
  background: var(--input-background);
  transition:
    border-color 0.16s ease,
    box-shadow 0.16s ease;
}
.event-picker__search:focus-within {
  border-color: var(--focus-ring);
  box-shadow: 0 0 0 3px var(--focus-ring-outer);
}
.event-picker__search input {
  width: 100%;
  min-height: 46px;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
}
.event-picker__filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.event-picker__filters button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 6px 10px;
  border: 1px solid var(--border-default);
  border-radius: 999px;
  background: var(--surface-card);
  color: var(--text-secondary);
  font-size: 0.73rem;
  font-weight: 650;
}
.event-picker__filters button[aria-pressed="true"] {
  border-color: color-mix(
    in srgb,
    var(--action-primary) 40%,
    var(--border-default)
  );
  background: var(--surface-active);
  color: var(--action-primary);
}
.event-picker__list-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 0 3px 8px;
  color: var(--text-small-muted);
  font-size: 0.69rem;
}
.event-picker__list-head strong {
  color: var(--action-primary);
}
.event-picker__options {
  display: grid;
  gap: 5px;
  max-height: min(56vh, 540px);
  padding: 2px 3px 6px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.event-picker__options > button {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  align-items: start;
  gap: 9px;
  padding: 10px 11px;
  border: 1px solid var(--border-subtle);
  border-radius: 11px;
  background: var(--surface-card);
  color: var(--text-primary);
  text-align: left;
  transition:
    border-color 0.14s ease,
    background 0.14s ease;
}
.event-picker__options > button:hover {
  border-color: var(--input-border-hover);
  background: var(--surface-hover);
}
.event-picker__options > button:focus-visible {
  outline: 2px solid var(--action-primary);
  outline-offset: 2px;
}
.event-picker__options > button[aria-pressed="true"] {
  border-color: color-mix(
    in srgb,
    var(--action-primary) 42%,
    var(--border-default)
  );
  background: var(--surface-active);
  box-shadow: inset 3px 0 0 var(--action-primary);
}
.event-picker__options > .event-picker__option--single {
  grid-template-columns: minmax(0, 1fr);
}
.event-picker__options > .event-picker__option--single[aria-checked="true"] {
  border-color: var(--action-primary);
  background: var(--surface-active);
  box-shadow: 0 0 0 2px
    color-mix(in srgb, var(--action-primary) 18%, transparent);
}
.event-picker__selection-mark {
  display: grid;
  place-items: center;
  width: 27px;
  height: 27px;
  margin-top: 1px;
  border-radius: 9px;
  background: var(--surface-hover);
  color: var(--text-small-muted);
}
[aria-pressed="true"] > .event-picker__selection-mark {
  background: var(--action-primary);
  color: var(--on-action-primary);
}
.event-picker__option-copy {
  display: grid;
  gap: 5px;
  min-width: 0;
}
.event-picker__option-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.event-picker__option-title strong {
  overflow: hidden;
  font-size: 0.84rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.event-picker__option-title code {
  overflow: hidden;
  max-width: 42%;
  color: var(--text-secondary);
  font-size: 0.68rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.event-picker__option-copy > small {
  display: -webkit-box;
  overflow: hidden;
  color: var(--text-small-muted);
  font-size: 0.72rem;
  line-height: 1.4;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.event-picker__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.event-picker__meta > span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 6px;
  border-radius: 999px;
  background: var(--surface-hover);
  color: var(--text-secondary);
  font-size: 0.62rem;
  font-weight: 650;
}
.event-picker__error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  color: var(--danger-color);
}
.event-picker__empty {
  margin: 24px 0;
  color: var(--text-small-muted);
  text-align: center;
}
.event-picker__footer {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}
.event-picker__footer > span {
  color: var(--text-small-muted);
  font-size: 0.72rem;
}
.event-picker__footer > span strong {
  color: var(--text-primary);
}
.event-picker__footer > div {
  display: flex;
  gap: 8px;
}
:global(.event-picker-dialog .p-dialog-content) {
  padding-top: 8px;
}
:global(.event-picker-dialog .p-dialog-footer) {
  border-top: 1px solid var(--border-subtle);
}
@media (max-width: 620px) {
  .event-picker__trigger-action {
    width: 34px;
    justify-content: center;
    font-size: 0;
  }
  .event-picker__option-title {
    display: grid;
    gap: 3px;
  }
  .event-picker__option-title code {
    max-width: 100%;
  }
  .event-picker__footer {
    align-items: stretch;
    flex-direction: column;
  }
  .event-picker__footer > div {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  :deep(.event-picker__clear) {
    grid-column: 1 / -1;
  }
}
</style>
