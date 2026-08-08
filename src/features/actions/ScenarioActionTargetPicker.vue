<script setup lang="ts">
import { computed } from "vue";

import type { ActionExecutor } from "@/shared/types/domain";
import CatalogPicker, {
  type CatalogPickerFilter,
  type CatalogPickerOption,
} from "@/shared/ui/CatalogPicker.vue";
import {
  actionExecutorIcon,
  actionExecutorLabel,
  createLocalCatalogPickerLoader,
} from "./action-picker-loader";

defineOptions({ name: "ScenarioActionTargetPicker" });

export interface ScenarioActionTargetOption {
  value: string;
  name: string;
  code: string;
  description?: string;
  kind: "existing" | "create";
  actionType?: string;
  executor?: ActionExecutor;
  position?: number;
}

const props = withDefaults(
  defineProps<{
    modelValue: string;
    options: ScenarioActionTargetOption[];
    label: string;
    placeholder: string;
    disabled?: boolean;
    required?: boolean;
    hideLabel?: boolean;
    allowEmpty?: boolean;
    applyLabel?: string;
    eyebrow?: string;
    title?: string;
    description?: string;
  }>(),
  {
    disabled: false,
    required: false,
    hideLabel: false,
    allowEmpty: false,
    applyLabel: "Выбрать переход",
    eyebrow: "Переход сценария",
    title: "Выберите следующее действие",
    description:
      "Продолжите с существующего шага или создайте новое действие из каталога.",
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
  select: [target: ScenarioActionTargetOption];
}>();

const kinds = computed(() => new Set(props.options.map((option) => option.kind)));
const filters = computed<CatalogPickerFilter[]>(() =>
  kinds.value.size > 1
    ? [
        {
          value: "existing",
          label: "В сценарии",
          icon: "pi pi-sitemap",
          testId: "action-target-picker-filter-existing",
        },
        {
          value: "create",
          label: "Создать новое",
          icon: "pi pi-plus",
          testId: "action-target-picker-filter-create",
        },
      ]
    : [],
);

function toCatalogOption(option: ScenarioActionTargetOption): CatalogPickerOption {
  return {
    value: option.value,
    name: option.name,
    code: option.code,
    context:
      option.kind === "existing"
        ? option.position !== undefined
          ? `В сценарии · шаг ${option.position + 1}`
          : "В сценарии"
        : "Добавить в сценарий",
    description: option.description,
    meta: [
      ...(option.executor
        ? [
            {
              label: actionExecutorLabel(option.executor),
              icon: actionExecutorIcon(option.executor),
            },
          ]
        : []),
    ],
    data: option,
  };
}

const selectedOption = computed(() => {
  const option = props.options.find((item) => item.value === props.modelValue);
  return option ? toCatalogOption(option) : undefined;
});
const scopeKey = computed(() =>
  props.options
    .map((option) => `${option.value}:${option.kind}:${option.name}`)
    .join("|"),
);

const load = createLocalCatalogPickerLoader({
  items: () => props.options,
  filterValue: (option) => option.kind,
  searchValues: (option) => [
    option.name,
    option.code,
    option.actionType,
    option.description,
  ],
  compare: (left, right) => {
      if (left.kind !== right.kind) return left.kind === "existing" ? -1 : 1;
      return left.name.localeCompare(right.name, "ru-RU", {
        sensitivity: "base",
      });
  },
  toOption: toCatalogOption,
});

function updateModel(value: string | string[]): void {
  if (Array.isArray(value)) return;
  if (!value) {
    emit("update:modelValue", "");
    return;
  }
  const option = props.options.find((item) => item.value === value);
  if (option?.kind === "existing") emit("update:modelValue", value);
}

function select(option: CatalogPickerOption | CatalogPickerOption[]): void {
  if (Array.isArray(option) || !option.data) return;
  emit("select", option.data as ScenarioActionTargetOption);
}
</script>

<template>
  <CatalogPicker
    class="scenario-action-target-picker"
    :model-value="modelValue"
    :label="label"
    :placeholder="placeholder"
    :disabled="disabled"
    :required="required"
    :hide-label="hideLabel"
    :allow-empty="allowEmpty"
    :scope-key="scopeKey"
    :selected-option="selectedOption"
    :load="load"
    :filters="filters"
    all-filter-label="Все варианты"
    :eyebrow="eyebrow"
    :title="title"
    :description="description"
    search-placeholder="Название, ключ шага, тип или описание"
    empty-message="Подходящие действия не найдены"
    error-message="Не удалось загрузить действия сценария"
    :apply-label="applyLabel"
    icon="pi pi-arrow-right"
    layout="grid"
    test-id-prefix="action-target-picker"
    @update:model-value="updateModel"
    @select="select"
  />
</template>
