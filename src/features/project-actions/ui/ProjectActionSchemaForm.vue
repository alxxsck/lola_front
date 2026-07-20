<script setup lang="ts">
import { computed } from "vue";
import InputNumber from "primevue/inputnumber";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import MultiSelect from "primevue/multiselect";
import Select from "primevue/select";
import Textarea from "primevue/textarea";
import ToggleSwitch from "primevue/toggleswitch";
import { buildProjectActionForm } from "../model/schema-form";

const props = defineProps<{
  schema: Record<string, unknown>;
  uiSchema: Record<string, unknown>;
  modelValue: Record<string, unknown>;
  disabled?: boolean;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: Record<string, unknown>];
}>();

const form = computed(() =>
  buildProjectActionForm(props.schema, props.uiSchema),
);

function update(key: string, value: unknown) {
  emit("update:modelValue", { ...props.modelValue, [key]: value });
}

function numberValue(key: string): number | null | undefined {
  const value = props.modelValue[key];
  return typeof value === "number" ? value : value === null ? null : undefined;
}

function stringValue(key: string): string | undefined {
  const value = props.modelValue[key];
  return typeof value === "string" ? value : undefined;
}
</script>

<template>
  <div class="schema-form">
    <Message v-if="form.blocked" severity="error" :closable="false">
      <strong>Настройки временно недоступны</strong>
      <ul>
        <li
          v-for="issue in form.issues"
          :key="`${issue.code}:${issue.field ?? ''}`"
        >
          {{ issue.message }}
        </li>
      </ul>
    </Message>
    <div v-else-if="form.fields.length" class="schema-fields">
      <label
        v-for="field in form.fields"
        :key="field.key"
        class="schema-field"
        :for="`project-action-${field.key}`"
      >
        <span class="field-label"
          >{{ field.label }} <em v-if="field.required">обязательно</em></span
        >
        <small v-if="field.description">{{ field.description }}</small>
        <Select
          v-if="field.kind === 'select'"
          :id="`project-action-${field.key}`"
          :model-value="modelValue[field.key]"
          :options="field.options"
          :disabled="disabled"
          @update:model-value="update(field.key, $event)"
        />
        <MultiSelect
          v-else-if="field.kind === 'multi-select'"
          :id="`project-action-${field.key}`"
          :model-value="modelValue[field.key]"
          :options="field.options"
          :disabled="disabled"
          display="chip"
          @update:model-value="update(field.key, $event)"
        />
        <InputNumber
          v-else-if="field.kind === 'number'"
          :input-id="`project-action-${field.key}`"
          :model-value="numberValue(field.key)"
          :min="field.minimum"
          :max="field.maximum"
          :disabled="disabled"
          @update:model-value="update(field.key, $event)"
        />
        <ToggleSwitch
          v-else-if="field.kind === 'boolean'"
          :input-id="`project-action-${field.key}`"
          :model-value="Boolean(modelValue[field.key])"
          :disabled="disabled"
          @update:model-value="update(field.key, $event)"
        />
        <Textarea
          v-else-if="field.kind === 'textarea'"
          :id="`project-action-${field.key}`"
          :model-value="stringValue(field.key)"
          :minlength="field.minLength"
          :maxlength="field.maxLength"
          :disabled="disabled"
          rows="3"
          @update:model-value="update(field.key, $event)"
        />
        <InputText
          v-else
          :id="`project-action-${field.key}`"
          :model-value="stringValue(field.key)"
          :minlength="field.minLength"
          :maxlength="field.maxLength"
          :disabled="disabled"
          @update:model-value="update(field.key, $event)"
        />
      </label>
    </div>
    <div v-else class="empty-config">
      <i class="pi pi-lock" /><span
        >Дополнительные настройки не требуются.</span
      >
    </div>
  </div>
</template>

<style scoped>
.schema-form,
.schema-fields {
  display: grid;
  gap: 14px;
}
.schema-field {
  display: grid;
  gap: 7px;
}
.field-label {
  font-size: 13px;
  font-weight: 700;
}
.field-label em {
  margin-left: 5px;
  color: var(--status-warning-text);
  font-size: 10px;
  font-style: normal;
  text-transform: uppercase;
}
.schema-field small {
  color: var(--text-secondary);
  line-height: 1.4;
}
.schema-field :deep(.p-inputtext),
.schema-field :deep(.p-select),
.schema-field :deep(.p-multiselect),
.schema-field :deep(.p-inputnumber) {
  width: 100%;
}
.empty-config {
  display: flex;
  gap: 9px;
  align-items: center;
  padding: 13px;
  color: var(--text-secondary);
  font-size: 12px;
  background: var(--surface-subtle);
  border-radius: 10px;
}
ul {
  margin: 8px 0 0;
  padding-left: 20px;
}
</style>
