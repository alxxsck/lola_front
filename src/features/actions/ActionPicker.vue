<script setup lang="ts">
import { computed } from 'vue';

import CatalogPicker, {
  type CatalogPickerFilter,
  type CatalogPickerOption,
} from '@/shared/ui/CatalogPicker.vue';
import {
  actionPickerCategory,
  actionPickerCategoryIcon,
  actionPickerCategoryLabel,
  createLocalActionPickerLoader,
  toActionPickerOption,
  type ActionPickerItem,
} from './action-picker-loader';

defineOptions({ name: 'ActionPicker' });

const props = withDefaults(
  defineProps<{
    modelValue: string;
    catalog: ActionPickerItem[];
    allowedTypes?: string[];
    label: string;
    placeholder: string;
    disabled?: boolean;
    required?: boolean;
    hideLabel?: boolean;
    allowEmpty?: boolean;
    applyLabel?: string;
  }>(),
  {
    allowedTypes: () => [],
    disabled: false,
    required: false,
    hideLabel: false,
    allowEmpty: false,
    applyLabel: 'Выбрать действие',
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
  select: [action: ActionPickerItem];
  closed: [];
}>();

const availableCatalog = computed(() => {
  const allowed = new Set(props.allowedTypes);
  return props.catalog.filter(
    (action) => action.enabled && (!allowed.size || allowed.has(action.type)),
  );
});
const categories = computed(
  () => new Set(availableCatalog.value.map((action) => actionPickerCategory(action.type))),
);
const filters = computed<CatalogPickerFilter[]>(() =>
  (['logic', 'wait', 'action'] as const)
    .filter((category) => categories.value.has(category))
    .map((category) => ({
      value: category,
      label: actionPickerCategoryLabel(category),
      icon: actionPickerCategoryIcon(category),
      testId: `action-picker-filter-${category}`,
    })),
);
const selectedOption = computed(() => {
  const action = props.catalog.find((item) => item.type === props.modelValue);
  return action ? toActionPickerOption(action) : undefined;
});
const scopeKey = computed(() =>
  [
    props.allowedTypes.join(','),
    ...props.catalog.map((action) => `${action.id}:${action.type}:${action.enabled}`),
  ].join('|'),
);
const load = createLocalActionPickerLoader(
  () => props.catalog,
  () => props.allowedTypes,
);

function select(option: CatalogPickerOption | CatalogPickerOption[]): void {
  if (Array.isArray(option) || !option.data) return;
  emit('select', option.data as ActionPickerItem);
}
</script>

<template>
  <CatalogPicker
    class="action-picker"
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
    all-filter-label="Все действия"
    eyebrow="Каталог сценария"
    title="Выберите действие"
    description="Сравните назначение, системный тип и место выполнения действия."
    search-placeholder="Название, тип или описание"
    empty-message="Подходящие действия не найдены"
    error-message="Не удалось загрузить каталог действий"
    :apply-label="applyLabel"
    icon="pi pi-bolt"
    layout="grid"
    test-id-prefix="action-picker"
    @update:model-value="!Array.isArray($event) && emit('update:modelValue', $event)"
    @select="select"
    @closed="emit('closed')"
  />
</template>
