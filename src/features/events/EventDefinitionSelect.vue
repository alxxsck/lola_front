<script setup lang="ts">
import { ref } from "vue";
import { eventCatalogRepository } from "@/shared/api/repository/event-catalog";
import type { EventCatalogDefinition } from "@/shared/api/repository/event-catalog";
import PagedSearchSelect, {
  type PagedSearchOption,
  type PagedSearchPage,
} from "@/shared/ui/PagedSearchSelect.vue";

export interface EventDefinitionSelection {
  definitionKeyId: string;
  currentRevisionId: string;
  name: string;
  code: string;
}

const props = defineProps<{
  projectId: string;
  modelValue: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  select: [event: EventDefinitionSelection];
}>();

const definitions = ref<EventCatalogDefinition[] | null>(null);
let loadedProjectId = "";

async function load(input: {
  query: string;
  cursor?: string;
  limit: number;
}): Promise<PagedSearchPage> {
  if (!definitions.value || loadedProjectId !== props.projectId) {
    loadedProjectId = props.projectId;
    definitions.value = await eventCatalogRepository.listDefinitions(
      props.projectId,
      "ACTIVE",
    );
  }
  const query = input.query.toLocaleLowerCase("ru-RU");
  const filtered = definitions.value.filter(
    (event) =>
      !query ||
      event.metadata.name.toLocaleLowerCase("ru-RU").includes(query) ||
      event.code.toLocaleLowerCase("ru-RU").includes(query),
  );
  const offset = cursorOffset(input.cursor);
  const page = filtered.slice(offset, offset + input.limit);
  const nextOffset = offset + page.length;
  return {
    items: page.map((event) => ({
      value: event.definitionKeyId,
      label: event.metadata.name,
      description: event.code,
    })),
    nextCursor: nextOffset < filtered.length ? String(nextOffset) : null,
  };
}

function select(option: PagedSearchOption): void {
  const event = definitions.value?.find(
    (candidate) => candidate.definitionKeyId === option.value,
  );
  if (!event) return;
  emit("select", {
    definitionKeyId: event.definitionKeyId,
    currentRevisionId: event.currentSchema.revisionId,
    name: event.metadata.name,
    code: event.code,
  });
}

function cursorOffset(cursor: string | undefined): number {
  const offset = Number(cursor);
  return Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
}
</script>

<template>
  <PagedSearchSelect
    :model-value="modelValue"
    :reload-key="projectId"
    :load="load"
    :disabled="disabled"
    label="Событие"
    placeholder="Выберите событие"
    search-placeholder="Название или код события"
    empty-text="События не найдены"
    @update:model-value="emit('update:modelValue', $event)"
    @select="select"
  />
</template>
