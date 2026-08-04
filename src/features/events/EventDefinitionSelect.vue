<script setup lang="ts">
import { ref, watch } from "vue";
import { eventCatalogRepository } from "@/shared/api/repository/event-catalog";
import type { EventCatalogDefinition } from "@/shared/api/repository/event-catalog";
import { paginateByCursor } from "@/shared/lib/paged-search";
import PagedSearchSelect, {
  type PagedSearchOption,
  type PagedSearchPage,
  type PagedSearchRequest,
} from "@/shared/ui/PagedSearchSelect.vue";

export interface EventDefinitionSelection {
  definitionKeyId: string;
  currentRevisionId: string;
  name: string;
  code: string;
}

const props = withDefaults(
  defineProps<{
    projectId: string;
    modelValue: string;
    disabled?: boolean;
    label?: string;
    placeholder?: string;
  }>(),
  {
    label: "Событие",
    placeholder: "Выберите событие",
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
  select: [event: EventDefinitionSelection];
}>();

const definitions = ref<EventCatalogDefinition[] | null>(null);
const selectedOption = ref<PagedSearchOption>();
let loadedProjectId = "";
let loadPromise: Promise<EventCatalogDefinition[]> | null = null;

watch(
  () => [props.projectId, props.modelValue] as const,
  async ([projectId, modelValue]) => {
    selectedOption.value = undefined;
    if (!projectId || !modelValue) return;
    try {
      const events = await ensureDefinitions(projectId);
      if (projectId !== props.projectId || modelValue !== props.modelValue)
        return;
      const event = events.find(
        (candidate) => candidate.definitionKeyId === modelValue,
      );
      if (event) selectedOption.value = toOption(event);
    } catch {
      // The selected event can still be recovered by reopening the list.
    }
  },
  { immediate: true },
);

async function load(input: PagedSearchRequest): Promise<PagedSearchPage> {
  const events = await ensureDefinitions(props.projectId);
  const query = input.query.toLocaleLowerCase("ru-RU");
  const filtered = events.filter(
    (event) =>
      !query ||
      event.metadata.name.toLocaleLowerCase("ru-RU").includes(query) ||
      event.code.toLocaleLowerCase("ru-RU").includes(query),
  );
  const page = paginateByCursor(filtered, input.cursor, input.limit);
  return {
    items: page.items.map(toOption),
    nextCursor: page.nextCursor,
  };
}

async function ensureDefinitions(
  projectId: string,
): Promise<EventCatalogDefinition[]> {
  if (loadedProjectId !== projectId) {
    loadedProjectId = projectId;
    definitions.value = null;
    loadPromise = eventCatalogRepository.listDefinitions(projectId, "ACTIVE");
  }
  if (!definitions.value) {
    loadPromise ??= eventCatalogRepository.listDefinitions(projectId, "ACTIVE");
    const request = loadPromise;
    try {
      const events = (await request).filter(
        (event) => event.lifecycle === "ACTIVE" && event.policy.enabled,
      );
      if (loadedProjectId === projectId) definitions.value = events;
      return events;
    } finally {
      if (loadPromise === request) loadPromise = null;
    }
  }
  return definitions.value;
}

function toOption(event: EventCatalogDefinition): PagedSearchOption {
  return {
    value: event.definitionKeyId,
    label: event.metadata.name,
    description: event.code,
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
</script>

<template>
  <PagedSearchSelect
    :model-value="modelValue"
    :reload-key="projectId"
    :load="load"
    :selected-option="selectedOption"
    :disabled="disabled"
    :label="label"
    :placeholder="placeholder"
    search-placeholder="Название или код события"
    empty-text="События не найдены"
    @update:model-value="emit('update:modelValue', $event)"
    @select="select"
  />
</template>
