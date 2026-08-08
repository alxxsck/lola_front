<script setup lang="ts">
import { computed } from "vue";
import CatalogPicker, {
  type CatalogPickerFilter,
  type CatalogPickerOption,
} from "@/shared/ui/CatalogPicker.vue";
import type { EntityKind, UiElement } from "@/shared/types/domain";
import {
  createLocalUiElementPickerLoader,
  toUiElementPickerOption,
  uiElementKindIcon,
  uiElementKindLabel,
} from "./ui-element-picker-loader";

defineOptions({ name: "UiElementPicker" });

const props = withDefaults(
  defineProps<{
    modelValue: string;
    elements: UiElement[];
    allowedKinds?: EntityKind[];
    label: string;
    placeholder: string;
    disabled?: boolean;
    required?: boolean;
    hideLabel?: boolean;
    allowEmpty?: boolean;
  }>(),
  {
    allowedKinds: () => [],
    disabled: false,
    required: false,
    hideLabel: false,
    allowEmpty: false,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
  select: [element: UiElement];
}>();

const availableKinds = computed<EntityKind[]>(() => {
  const allowed = new Set(props.allowedKinds);
  return Array.from(
    new Set(
      props.elements
        .filter(
          (element) =>
            element.enabled && (!allowed.size || allowed.has(element.kind)),
        )
        .map((element) => element.kind),
    ),
  );
});
const filters = computed<CatalogPickerFilter[]>(() =>
  availableKinds.value.length > 1
    ? availableKinds.value.map((kind) => ({
        value: kind,
        label: uiElementKindLabel(kind),
        icon: uiElementKindIcon(kind),
        testId: `ui-element-picker-filter-${kind.toLowerCase()}`,
      }))
    : [],
);
const selectedOption = computed(() => {
  const element = props.elements.find((item) => item.code === props.modelValue);
  return element ? toUiElementPickerOption(element) : undefined;
});
const scopeKey = computed(() =>
  [
    props.allowedKinds.join(","),
    ...props.elements.map(
      (element) =>
        `${element.id}:${element.updatedAt ?? ""}:${element.enabled}:${element.aiEnabled}`,
    ),
  ].join("|"),
);
const load = createLocalUiElementPickerLoader(
  () => props.elements,
  () => props.allowedKinds,
);

function select(option: CatalogPickerOption | CatalogPickerOption[]): void {
  if (Array.isArray(option) || !option.data) return;
  emit("select", option.data as UiElement);
}
</script>

<template>
  <CatalogPicker
    class="ui-element-picker"
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
    all-filter-label="Все типы"
    eyebrow="Каталог интерфейса"
    title="Выберите элемент интерфейса"
    description="Проверьте название, системный код, описание и тип цели."
    search-placeholder="Название, код или описание"
    empty-message="Подходящие элементы интерфейса не найдены"
    error-message="Не удалось загрузить элементы интерфейса"
    apply-label="Выбрать элемент"
    icon="pi pi-objects-column"
    test-id-prefix="ui-element-picker"
    @update:model-value="
      !Array.isArray($event) && emit('update:modelValue', $event)
    "
    @select="select"
  />
</template>
