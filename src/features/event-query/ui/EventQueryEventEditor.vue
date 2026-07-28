<script setup lang="ts">
import { computed } from "vue";
import Button from "primevue/button";
import type {
  EventQueryPolicyFieldDto,
  EventQueryPolicyItemDto,
} from "@/shared/api/generated/models";
import type { SchemaField } from "../model/event-query-policy";
import { schemaTypeToSemanticType } from "../model/event-query-policy";

const props = defineProps<{
  modelValue: EventQueryPolicyItemDto;
  schemaFields: SchemaField[];
  disabled?: boolean;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: EventQueryPolicyItemDto];
}>();

const availableFields = computed(() =>
  props.schemaFields.filter(
    (field) =>
      !props.modelValue.safeFields.some(
        (current) => current.path === field.path,
      ),
  ),
);

function patch(patch: Partial<EventQueryPolicyItemDto>) {
  emit("update:modelValue", { ...props.modelValue, ...patch });
}

function setMode(mode: "SUMMARY" | "AGGREGATE" | "LATEST", enabled: boolean) {
  const modes = new Set(props.modelValue.allowedModes);
  if (enabled) modes.add(mode);
  else modes.delete(mode);
  patch({ allowedModes: [...modes] });
}

function addField(event: Event) {
  const select = event.target as HTMLSelectElement;
  const schemaField = props.schemaFields.find(
    (field) => field.path === select.value,
  );
  if (!schemaField) return;
  const field: EventQueryPolicyFieldDto = {
    path: schemaField.path,
    semanticType: schemaTypeToSemanticType(schemaField.schemaType),
    sensitivity: "FORBIDDEN",
    operations: [],
  };
  patch({ safeFields: [...props.modelValue.safeFields, field] });
  select.value = "";
}

function patchField(index: number, value: Partial<EventQueryPolicyFieldDto>) {
  patch({
    safeFields: props.modelValue.safeFields.map((field, fieldIndex) =>
      fieldIndex === index ? { ...field, ...value } : field,
    ),
  });
}

function removeField(index: number) {
  patch({
    safeFields: props.modelValue.safeFields.filter(
      (_field, fieldIndex) => fieldIndex !== index,
    ),
  });
}

function setFieldOperation(
  index: number,
  operation: EventQueryPolicyFieldDto["operations"][number],
  enabled: boolean,
) {
  const operations = new Set(props.modelValue.safeFields[index]?.operations);
  if (enabled) operations.add(operation);
  else operations.delete(operation);
  patchField(index, { operations: [...operations] });
}

function schemaType(path: string) {
  return (
    props.schemaFields.find((field) => field.path === path)?.schemaType ??
    "unknown"
  );
}
</script>

<template>
  <div class="event-editor">
    <label>
      <span>Описание для ИИ</span>
      <textarea
        data-test="policy-description"
        :value="modelValue.descriptionForAI"
        rows="3"
        maxlength="500"
        :disabled="disabled"
        @input="
          patch({
            descriptionForAI: ($event.target as HTMLTextAreaElement).value,
          })
        "
      />
      <small>{{ modelValue.descriptionForAI.length }}/500</small>
    </label>

    <div class="editor-grid">
      <fieldset>
        <legend>Доступные режимы</legend>
        <label v-for="mode in ['SUMMARY', 'AGGREGATE', 'LATEST']" :key="mode">
          <input
            type="checkbox"
            :checked="modelValue.allowedModes.includes(mode as never)"
            :disabled="disabled"
            @change="
              setMode(
                mode as 'SUMMARY' | 'AGGREGATE' | 'LATEST',
                ($event.target as HTMLInputElement).checked,
              )
            "
          />
          {{ mode }}
        </label>
      </fieldset>
      <label>
        <span>Период для диалога, часов</span>
        <input
          type="number"
          min="1"
          max="744"
          :value="modelValue.maxInteractiveLookbackHours"
          :disabled="disabled"
          @input="
            patch({
              maxInteractiveLookbackHours: Number(
                ($event.target as HTMLInputElement).value,
              ),
            })
          "
        />
      </label>
      <label>
        <span>Период для проверки, часов</span>
        <input
          type="number"
          min="1"
          max="2160"
          :value="modelValue.maxVerificationLookbackHours"
          :disabled="disabled"
          @input="
            patch({
              maxVerificationLookbackHours: Number(
                ($event.target as HTMLInputElement).value,
              ),
            })
          "
        />
      </label>
    </div>

    <div class="safe-fields">
      <div class="fields-heading">
        <div>
          <strong>Безопасные поля</strong>
          <small>Только пути из опубликованной типизированной схемы.</small>
        </div>
        <select
          aria-label="Добавить безопасное поле"
          :disabled="disabled || !availableFields.length"
          @change="addField"
        >
          <option value="">Добавить поле…</option>
          <option
            v-for="field in availableFields"
            :key="field.path"
            :value="field.path"
          >
            {{ field.path }} · {{ field.schemaType }}
          </option>
        </select>
      </div>

      <div v-if="!modelValue.safeFields.length" class="empty-fields">
        Поля payload не передаются. Для SUMMARY этого достаточно.
      </div>
      <div
        v-for="(field, index) in modelValue.safeFields"
        :key="field.path"
        class="field-row"
      >
        <div>
          <code>{{ field.path }}</code>
          <small>{{ schemaType(field.path) }}</small>
        </div>
        <select
          :value="field.semanticType"
          aria-label="Семантический тип"
          :disabled="disabled"
          @change="
            patchField(index, {
              semanticType: ($event.target as HTMLSelectElement)
                .value as typeof field.semanticType,
            })
          "
        >
          <option
            v-for="value in [
              'STRING',
              'BOOLEAN',
              'INTEGER',
              'DECIMAL',
              'MONEY',
              'CURRENCY',
            ]"
            :key="value"
            :value="value"
          >
            {{ value }}
          </option>
        </select>
        <select
          class="field-sensitivity"
          :value="field.sensitivity"
          aria-label="Чувствительность"
          :disabled="disabled"
          @change="
            patchField(index, {
              sensitivity: ($event.target as HTMLSelectElement)
                .value as typeof field.sensitivity,
            })
          "
        >
          <option value="PUBLIC_TO_END_USER">PUBLIC_TO_END_USER</option>
          <option value="PRIVATE_DERIVED">PRIVATE_DERIVED</option>
          <option value="FORBIDDEN">FORBIDDEN</option>
        </select>
        <small v-if="field.sensitivity === 'FORBIDDEN'" class="field-warning">
          Выберите допустимую чувствительность и операции явно.
        </small>
        <fieldset class="operations">
          <legend>Операции</legend>
          <label
            v-for="operation in [
              'PROJECT',
              'GROUP_BY',
              'SUM',
              'MIN',
              'MAX',
              'AVG',
            ]"
            :key="operation"
          >
            <input
              type="checkbox"
              :checked="field.operations.includes(operation as never)"
              :disabled="disabled"
              @change="
                setFieldOperation(
                  index,
                  operation as EventQueryPolicyFieldDto['operations'][number],
                  ($event.target as HTMLInputElement).checked,
                )
              "
            />
            {{ operation }}
          </label>
        </fieldset>
        <input
          v-if="field.semanticType === 'MONEY'"
          :value="field.currencyPath ?? ''"
          placeholder="Путь к валюте"
          aria-label="Путь к валюте"
          :disabled="disabled"
          @input="
            patchField(index, {
              currencyPath:
                ($event.target as HTMLInputElement).value || undefined,
            })
          "
        />
        <Button
          label="Удалить"
          severity="secondary"
          text
          size="small"
          :disabled="disabled"
          @click="removeField(index)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.event-editor,
.event-editor label,
.safe-fields {
  display: grid;
  min-width: 0;
  gap: 8px;
}
.event-editor textarea,
.event-editor input,
.event-editor select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background: var(--surface-card);
  color: var(--text-primary);
  font: inherit;
}
.event-editor small {
  color: var(--text-tertiary);
  font-size: 0.68rem;
}
.editor-grid {
  display: grid;
  grid-template-columns: 1.2fr 1fr 1fr;
  gap: 12px;
}
fieldset {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 0;
  border: 1px solid var(--border-default);
  border-radius: 12px;
}
fieldset label {
  display: flex;
  grid-auto-flow: column;
  align-items: center;
}
fieldset input {
  width: auto;
}
.fields-heading,
.field-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(160px, 0.7fr);
  align-items: center;
  gap: 10px;
}
.fields-heading > div,
.field-row > div {
  display: grid;
  gap: 3px;
}
.field-row {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  padding: 10px 0;
  border-top: 1px solid var(--border-subtle);
}
.field-row > * {
  min-width: 0;
}
.field-warning {
  grid-column: 1 / -1;
  color: var(--status-warning-text);
}
.operations {
  grid-column: 1 / -1;
  display: flex;
  gap: 5px 9px;
  padding: 6px 8px;
}
.field-sensitivity {
  grid-column: 1 / -1;
}
.field-row > input,
.field-row > :deep(.p-button) {
  grid-column: 1 / -1;
}
.field-row > :deep(.p-button) {
  justify-self: start;
}
.operations label {
  display: flex;
  grid-auto-flow: column;
  align-items: center;
  gap: 4px;
  font-size: 0.62rem;
}
.operations input {
  width: auto;
}
.empty-fields {
  padding: 14px;
  border-radius: 12px;
  background: var(--surface-subtle);
  color: var(--text-secondary);
}
@media (max-width: 800px) {
  .editor-grid,
  .fields-heading,
  .field-row {
    grid-template-columns: 1fr;
  }
}
</style>
