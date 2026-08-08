<script setup lang="ts">
import { computed } from "vue";
import CatalogPicker, {
  type CatalogPickerFilter,
  type CatalogPickerOption,
  type CatalogPickerPage,
  type CatalogPickerRequest,
} from "@/shared/ui/CatalogPicker.vue";

defineOptions({ name: "EventPicker" });

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
    hideLabel?: boolean;
    showIngestionFilter?: boolean;
    scopeKey?: string | number;
    selectedOption?: EventPickerOption;
    selectedOptions?: EventPickerOption[];
    load: (request: EventPickerRequest) => Promise<EventPickerPage>;
  }>(),
  {
    disabled: false,
    required: false,
    hideLabel: false,
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

const filters = computed<CatalogPickerFilter[]>(() =>
  props.showIngestionFilter
    ? [
        {
          value: "BACKEND_ONLY",
          label: "Только backend",
          icon: "pi pi-server",
          testId: "event-picker-filter-backend",
        },
        {
          value: "FRONTEND_ALLOWED",
          label: "Разрешено frontend",
          icon: "pi pi-desktop",
        },
      ]
    : [],
);
const selectedOption = computed(() =>
  props.selectedOption ? toCatalogOption(props.selectedOption) : undefined,
);
const selectedOptions = computed(() =>
  props.selectedOptions.map(toCatalogOption),
);

function toCatalogOption(option: EventPickerOption): CatalogPickerOption {
  return {
    value: option.value,
    name: option.name,
    code: option.code,
    description: option.description,
    meta: [
      ...(option.ingestion
        ? [
            {
              label:
                option.ingestion === "FRONTEND_ALLOWED"
                  ? "Frontend"
                  : "Backend",
              icon:
                option.ingestion === "FRONTEND_ALLOWED"
                  ? "pi pi-desktop"
                  : "pi pi-server",
            },
          ]
        : []),
      ...(option.tags ?? []).map((label) => ({ label })),
    ],
    data: option,
  };
}

async function loadCatalog(
  request: CatalogPickerRequest,
): Promise<CatalogPickerPage> {
  const page = await props.load({
    query: request.query,
    ...(request.cursor ? { cursor: request.cursor } : {}),
    ...(request.filter
      ? { ingestion: request.filter as EventPickerOption["ingestion"] }
      : {}),
    limit: request.limit,
  });
  return {
    items: page.items.map(toCatalogOption),
    nextCursor: page.nextCursor,
  };
}

function select(option: CatalogPickerOption | CatalogPickerOption[]): void {
  if (Array.isArray(option)) {
    emit(
      "select",
      option.flatMap((item) =>
        item.data ? [item.data as EventPickerOption] : [],
      ),
    );
    return;
  }
  if (option.data) emit("select", option.data as EventPickerOption);
}
</script>

<template>
  <CatalogPicker
    class="event-picker"
    :model-value="modelValue"
    :multiple="multiple"
    :max-selection="maxSelection"
    :allow-empty="allowEmpty"
    :label="label"
    :placeholder="placeholder"
    :disabled="disabled"
    :required="required"
    :hide-label="hideLabel"
    :scope-key="scopeKey"
    :selected-option="selectedOption"
    :selected-options="selectedOptions"
    :load="loadCatalog"
    :filters="filters"
    all-filter-label="Все"
    eyebrow="Каталог событий"
    title="Выберите событие"
    multiple-title="Выберите события"
    description="Ищите по названию, системному коду или описанию."
    search-placeholder="Название, код или описание"
    empty-message="События не найдены"
    error-message="Не удалось загрузить события"
    apply-label="Выбрать событие"
    multiple-apply-label="Применить выбор"
    icon="pi pi-bolt"
    test-id-prefix="event-picker"
    label-class="event-picker__label"
    @update:model-value="emit('update:modelValue', $event)"
    @select="select"
  />
</template>
