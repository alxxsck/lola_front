<script setup lang="ts">
import PagedSearchSelect, {
  type PagedSearchPage,
} from "@/shared/ui/PagedSearchSelect.vue";
import { scenarioAuthoringRepository } from "@/shared/api/repository/scenario-authoring/scenario-authoring-repository";

const props = defineProps<{
  projectId: string;
  modelValue: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

async function load(input: {
  query: string;
  cursor?: string;
  limit: number;
}): Promise<PagedSearchPage> {
  const response = await scenarioAuthoringRepository.searchSegments(
    props.projectId,
    {
      ...(input.query ? { query: input.query } : {}),
      limit: input.limit,
      ...(input.cursor ? { cursor: input.cursor } : {}),
      includeArchived: false,
    },
  );
  return {
    items: response.items.map((segment) => ({
      value: segment.segmentId,
      label: segment.name,
      description: segment.key,
    })),
    nextCursor: response.nextCursor ?? null,
  };
}
</script>

<template>
  <PagedSearchSelect
    :model-value="modelValue"
    :reload-key="projectId"
    :load="load"
    :disabled="disabled"
    label="Сегмент"
    placeholder="Выберите опубликованный сегмент"
    search-placeholder="Название или ключ сегмента"
    empty-text="Опубликованные сегменты не найдены"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>
