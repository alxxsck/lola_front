<script setup lang="ts">
import { ref, watch } from 'vue';
import { eventCatalogRepository } from '@/shared/api/repository/event-catalog';
import type { EventCatalogDefinition } from '@/shared/api/repository/event-catalog';
import { paginateByCursor } from '@/shared/lib/paged-search';
import EventPicker, {
  type EventPickerOption,
  type EventPickerPage,
  type EventPickerRequest,
} from './EventPicker.vue';

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
    required?: boolean;
    hideLabel?: boolean;
    label?: string;
    placeholder?: string;
    valueField?: 'definitionKeyId' | 'currentRevisionId' | 'code';
    allowEmpty?: boolean;
  }>(),
  {
    label: 'Событие',
    required: false,
    hideLabel: false,
    placeholder: 'Выберите событие',
    valueField: 'definitionKeyId',
    allowEmpty: false,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
  select: [event: EventDefinitionSelection];
}>();

const definitions = ref<EventCatalogDefinition[] | null>(null);
const selectedOption = ref<EventPickerOption>();
let loadedProjectId = '';
let loadPromise: Promise<EventCatalogDefinition[]> | null = null;

watch(
  () => [props.projectId, props.modelValue] as const,
  async ([projectId, modelValue]) => {
    selectedOption.value = undefined;
    if (!projectId || !modelValue) return;
    try {
      const events = await ensureDefinitions(projectId);
      if (projectId !== props.projectId || modelValue !== props.modelValue) return;
      const event = events.find((candidate) => eventValue(candidate) === modelValue);
      if (event) selectedOption.value = toOption(event);
    } catch {
      // The selected event can still be recovered by reopening the list.
    }
  },
  { immediate: true },
);

async function load(input: EventPickerRequest): Promise<EventPickerPage> {
  const events = await ensureDefinitions(props.projectId);
  const query = input.query.toLocaleLowerCase('ru-RU');
  const filtered = events.filter(
    (event) =>
      (!input.ingestion ||
        (input.ingestion === 'FRONTEND_ALLOWED'
          ? event.policy.clientIngestible
          : !event.policy.clientIngestible)) &&
      (!query ||
        event.metadata.name.toLocaleLowerCase('ru-RU').includes(query) ||
        event.code.toLocaleLowerCase('ru-RU').includes(query) ||
        event.metadata.description?.toLocaleLowerCase('ru-RU').includes(query)),
  );
  const page = paginateByCursor(filtered, input.cursor, input.limit);
  return {
    items: page.items.map(toOption),
    nextCursor: page.nextCursor,
  };
}

async function ensureDefinitions(projectId: string): Promise<EventCatalogDefinition[]> {
  if (loadedProjectId !== projectId) {
    loadedProjectId = projectId;
    definitions.value = null;
    loadPromise = eventCatalogRepository.listDefinitions(projectId, 'ACTIVE');
  }
  if (!definitions.value) {
    loadPromise ??= eventCatalogRepository.listDefinitions(projectId, 'ACTIVE');
    const request = loadPromise;
    try {
      const events = (await request).filter(
        (event) => event.lifecycle === 'ACTIVE' && event.policy.enabled,
      );
      if (loadedProjectId === projectId) definitions.value = events;
      return events;
    } finally {
      if (loadPromise === request) loadPromise = null;
    }
  }
  return definitions.value;
}

function eventValue(event: EventCatalogDefinition): string {
  if (props.valueField === 'currentRevisionId') return event.currentSchema.revisionId;
  if (props.valueField === 'code') return event.code;
  return event.definitionKeyId;
}

function toOption(event: EventCatalogDefinition): EventPickerOption {
  return {
    value: eventValue(event),
    name: event.metadata.name,
    code: event.code,
    description: event.metadata.description ?? undefined,
    ingestion: event.policy.clientIngestible ? 'FRONTEND_ALLOWED' : 'BACKEND_ONLY',
    tags: [
      `Схема v${event.currentSchema.revisionNumber}`,
      event.origin === 'RETENIVE_MANAGED' ? 'Retenive' : 'Пользовательское',
    ],
  };
}

function select(option: EventPickerOption | EventPickerOption[]): void {
  if (Array.isArray(option)) return;
  const event = definitions.value?.find((candidate) => eventValue(candidate) === option.value);
  if (!event) return;
  emit('select', {
    definitionKeyId: event.definitionKeyId,
    currentRevisionId: event.currentSchema.revisionId,
    name: event.metadata.name,
    code: event.code,
  });
}
</script>

<template>
  <EventPicker
    :model-value="modelValue"
    :load="load"
    :selected-option="selectedOption"
    :disabled="disabled"
    :required="required"
    :hide-label="hideLabel"
    :label="label"
    :placeholder="placeholder"
    :allow-empty="allowEmpty"
    :scope-key="projectId"
    show-ingestion-filter
    @update:model-value="!Array.isArray($event) && emit('update:modelValue', $event)"
    @select="select"
  />
</template>
