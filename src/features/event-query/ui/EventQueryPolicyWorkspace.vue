<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Message from "primevue/message";
import type {
  EventQueryPolicyDiagnosticDto,
  EventQueryPolicyDocumentDto,
  EventQueryPolicyItemDto,
} from "@/shared/api/generated/models";
import type { EventCatalogDefinition } from "@/shared/api/repository/event-catalog/event-catalog-contract";
import {
  eventPolicyState,
  flattenSchemaFields,
} from "../model/event-query-policy";
import EventQueryEventEditor from "./EventQueryEventEditor.vue";

const props = defineProps<{
  definitions: EventCatalogDefinition[];
  modelValue: EventQueryPolicyDocumentDto;
  publishedItems: EventQueryPolicyItemDto[];
  diagnostics: EventQueryPolicyDiagnosticDto[];
  canManage: boolean;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: EventQueryPolicyDocumentDto];
  edited: [];
}>();

const selectedCode = ref("");
const selectedDefinition = computed(() =>
  props.definitions.find((definition) => definition.code === selectedCode.value),
);
const selectedItemIndex = computed(() =>
  props.modelValue.items.findIndex(
    (item) => item.stableCode === selectedCode.value,
  ),
);
const selectedItem = computed(
  () => props.modelValue.items[selectedItemIndex.value] ?? null,
);

watch(
  () => [props.definitions, props.modelValue.items] as const,
  () => {
    const available = props.definitions.some(
      (definition) => definition.code === selectedCode.value,
    );
    if (!available) {
      selectedCode.value =
        props.modelValue.items[0]?.stableCode ??
        props.definitions[0]?.code ??
        "";
    }
  },
  { immediate: true, deep: true },
);

function setDefinitionEnabled(
  definition: EventCatalogDefinition,
  enabled: boolean,
) {
  const items = props.modelValue.items.filter(
    (item) => item.stableCode !== definition.code,
  );
  if (enabled) items.push(defaultItem(definition));
  emit("update:modelValue", { ...props.modelValue, items });
  emit("edited");
  selectedCode.value = definition.code;
}

function updateSelectedItem(value: EventQueryPolicyItemDto) {
  if (selectedItemIndex.value < 0) return;
  emit("update:modelValue", {
    ...props.modelValue,
    items: props.modelValue.items.map((item, index) =>
      index === selectedItemIndex.value ? value : item,
    ),
  });
  emit("edited");
}

function diagnosticsForSelected() {
  if (selectedItemIndex.value < 0) return [];
  return props.diagnostics.filter((diagnostic) =>
    diagnostic.location.startsWith(`items[${selectedItemIndex.value}]`),
  );
}

function status(definition: EventCatalogDefinition) {
  return eventPolicyState(
    definition.code,
    props.modelValue.items,
    props.publishedItems,
    props.diagnostics,
  );
}

function defaultItem(
  definition: EventCatalogDefinition,
): EventQueryPolicyItemDto {
  return {
    stableCode: definition.code,
    descriptionForAI:
      definition.metadata.description ??
      `Событие «${definition.metadata.name}».`,
    allowedModes: ["SUMMARY"],
    maxInteractiveLookbackHours: 168,
    maxVerificationLookbackHours: 720,
    safeFields: [],
  };
}
</script>

<template>
  <div class="policy-workspace">
    <nav aria-label="Типы событий" class="definition-list">
      <button
        v-for="definition in definitions"
        :key="definition.definitionKeyId"
        type="button"
        :class="{ selected: selectedCode === definition.code }"
        @click="selectedCode = definition.code"
      >
        <span>
          <strong>{{ definition.metadata.name }}</strong>
          <code>{{ definition.code }}</code>
        </span>
        <span class="policy-state" :data-state="status(definition)">
          {{ status(definition) }}
        </span>
      </button>
    </nav>

    <div v-if="selectedDefinition" class="definition-editor">
      <div class="definition-heading">
        <div>
          <h4>{{ selectedDefinition.metadata.name }}</h4>
          <code>{{ selectedDefinition.code }}</code>
        </div>
        <label>
          <input
            type="checkbox"
            :checked="Boolean(selectedItem)"
            :disabled="!canManage"
            @change="
              setDefinitionEnabled(
                selectedDefinition,
                ($event.target as HTMLInputElement).checked,
              )
            "
          />
          Доступно ИИ
        </label>
      </div>
      <div class="schema-summary">
        <span
          v-for="field in flattenSchemaFields(
            selectedDefinition.currentSchema.payloadSchema,
          )"
          :key="field.path"
        >
          <code>{{ field.path }}</code> {{ field.schemaType }}
        </span>
      </div>
      <EventQueryEventEditor
        v-if="selectedItem"
        :model-value="selectedItem"
        :schema-fields="
          flattenSchemaFields(selectedDefinition.currentSchema.payloadSchema)
        "
        :disabled="!canManage"
        @update:model-value="updateSelectedItem"
      />
      <Message v-else severity="secondary" :closable="false">
        Этот Event Definition не передаётся модели и не может быть выбран для AI
        Review или проверки обращения.
      </Message>
      <Message
        v-for="diagnostic in diagnosticsForSelected()"
        :key="`${diagnostic.code}:${diagnostic.location}`"
        severity="error"
        :closable="false"
      >
        <strong>{{ diagnostic.location }}</strong> — {{ diagnostic.message }}
      </Message>
    </div>
  </div>
</template>

<style scoped>
.policy-workspace {
  display: grid;
  grid-template-columns: minmax(210px, 0.7fr) minmax(0, 1.7fr);
  overflow: hidden;
  border: 1px solid var(--border-default);
  border-radius: 16px;
}
.definition-list {
  padding: 8px;
  border-right: 1px solid var(--border-default);
  background: var(--surface-subtle);
}
.definition-list button {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 11px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
}
.definition-list button.selected {
  background: var(--surface-card);
  box-shadow: var(--shadow-xs);
}
.definition-list button > span:first-child,
.definition-list strong,
.definition-list code {
  display: block;
  min-width: 0;
}
.definition-list code {
  overflow: hidden;
  color: var(--text-tertiary);
  font-size: 0.66rem;
  text-overflow: ellipsis;
}
.policy-state {
  padding: 5px 9px;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 700;
}
.policy-state[data-state="disabled"] {
  background: var(--surface-muted);
  color: var(--text-tertiary);
}
.policy-state[data-state="draft"] {
  background: var(--status-warning-soft);
  color: var(--status-warning-text);
}
.policy-state[data-state="invalid"] {
  background: var(--status-danger-soft);
  color: var(--status-danger-text);
}
.policy-state[data-state="published"] {
  background: var(--status-success-soft);
  color: var(--status-success-text);
}
.definition-editor {
  display: grid;
  min-width: 0;
  gap: 14px;
  padding: 18px;
}
.definition-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}
.definition-heading h4 {
  margin: 0 0 3px;
}
.schema-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.schema-summary span {
  padding: 5px 8px;
  border-radius: 8px;
  background: var(--surface-subtle);
  color: var(--text-tertiary);
  font-size: 0.66rem;
}
@media (max-width: 900px) {
  .policy-workspace {
    grid-template-columns: 1fr;
  }
  .definition-list {
    border-right: 0;
    border-bottom: 1px solid var(--border-default);
  }
}
@media (max-width: 600px) {
  .definition-heading {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
