<script setup lang="ts">
import { computed, ref } from 'vue'

import type { ScenarioAuthoringEvent, ScenarioAuthoringField } from '@/shared/api/repository/scenario-authoring'
import { uid } from '@/shared/lib/format'
import { summarizeEventFieldCapability } from '../model/event-schema-capability'
import {
  buildEventSchemaExample,
  diffEventSchemas,
  eventSchemaFieldTypes,
  parseEventSchema,
  serializeEventSchema,
  validateEventSchemaSample,
} from '../model/event-schema'
import type { EventSchemaChange, EventSchemaDraft, EventSchemaFieldDraft, EventSchemaSampleIssue } from '../model/event-schema'

const props = defineProps<{
  modelValue: EventSchemaDraft
  baselineSchema?: Record<string, unknown>
  catalogEvent?: ScenarioAuthoringEvent
  catalogRevision?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: EventSchemaDraft]
}>()

const expandedFieldId = ref<string | null>(null)
const advancedVisible = ref(false)
const advancedText = ref('')
const advancedError = ref('')
const enumError = ref('')
const sampleText = ref('')
const sampleIssues = ref<EventSchemaSampleIssue[] | null>(null)

const generatedSample = computed(() => JSON.stringify(buildEventSchemaExample(props.modelValue), null, 2))

const changes = computed(() => props.baselineSchema
  ? diffEventSchemas(props.baselineSchema, serializeEventSchema(props.modelValue))
  : [])

function addField() {
  const fieldKey = `field_${crypto.randomUUID()}`
  const field: EventSchemaFieldDraft = {
    id: uid('schema_field'),
    wireKey: '',
    title: '',
    type: 'string',
    required: false,
    fieldKey,
    sensitive: false,
    visuallyEditable: true,
    source: {},
  }
  emit('update:modelValue', { ...props.modelValue, fields: [...props.modelValue.fields, field], hasProperties: true })
}

function updateField(id: string, patch: Partial<EventSchemaFieldDraft>) {
  emit('update:modelValue', {
    ...props.modelValue,
    fields: props.modelValue.fields.map((field) => field.id === id ? { ...field, ...patch } : field),
  })
}

function removeField(id: string) {
  emit('update:modelValue', { ...props.modelValue, fields: props.modelValue.fields.filter((field) => field.id !== id) })
}

function inputValue(event: Event): string {
  return (event.target as HTMLInputElement).value
}

function optionalInput(event: Event): string | undefined {
  return inputValue(event).trim() || undefined
}

function optionalNumber(event: Event): number | undefined {
  const value = inputValue(event)
  return value === '' ? undefined : Number(value)
}

function updateEnum(field: EventSchemaFieldDraft, event: Event) {
  const value = inputValue(event).trim()
  if (!value) {
    enumError.value = ''
    updateField(field.id, { enumValues: undefined })
    return
  }
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) throw new Error('Enum должен быть JSON-массивом.')
    enumError.value = ''
    updateField(field.id, { enumValues: parsed })
  } catch (cause) {
    enumError.value = cause instanceof Error ? cause.message : 'Некорректный JSON enum.'
  }
}

function setAdditionalProperties(event: Event) {
  emit('update:modelValue', {
    ...props.modelValue,
    additionalProperties: (event.target as HTMLInputElement).checked,
    hasAdditionalProperties: true,
  })
}

function toggleAdvanced() {
  advancedVisible.value = !advancedVisible.value
  advancedError.value = ''
  if (advancedVisible.value) advancedText.value = JSON.stringify(serializeEventSchema(props.modelValue), null, 2)
}

function applyAdvancedSchema() {
  try {
    const schema: unknown = JSON.parse(advancedText.value)
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) throw new Error('Корневая JSON Schema должна быть объектом.')
    emit('update:modelValue', parseEventSchema(schema as Record<string, unknown>))
    advancedError.value = ''
    advancedVisible.value = false
  } catch (cause) {
    advancedError.value = cause instanceof Error ? cause.message : 'Некорректная JSON Schema.'
  }
}

function catalogField(field: EventSchemaFieldDraft): ScenarioAuthoringField | undefined {
  return props.catalogEvent?.fields.find((candidate) => (
    Boolean(field.fieldKey) && candidate.fieldKey === field.fieldKey
  ) || candidate.path === `event.payload.${field.wireKey}`)
}

function capability(field: EventSchemaFieldDraft) {
  return summarizeEventFieldCapability(catalogField(field), Boolean(props.catalogRevision || props.catalogEvent))
}

const changeLabels: Record<EventSchemaChange['kind'], string> = {
  added: 'Добавлено поле',
  removed: 'Удалено поле',
  renamed: 'Изменён wire key',
  'type-changed': 'Изменён тип',
  'field-key-changed': 'Изменён stable field key',
}

function validateSample() {
  try {
    const sample: unknown = JSON.parse(sampleText.value)
    sampleIssues.value = validateEventSchemaSample(props.modelValue, sample)
  } catch (cause) {
    sampleIssues.value = [{
      path: '/',
      expected: 'valid JSON',
      actual: 'parse failed',
      explanation: cause instanceof Error ? cause.message : 'Некорректный JSON sample',
    }]
  }
}
</script>

<template>
  <section class="payload-studio">
    <header class="studio-header">
      <div>
        <strong>Поля payload</strong>
        <span>Wire contract, обязательность и Lola metadata сохраняются в JSON Schema.</span>
      </div>
      <button type="button" class="secondary-button" data-test="add-field" @click="addField">+ Добавить поле</button>
    </header>

    <div v-if="modelValue.fields.length" class="schema-fields">
      <article v-for="field in modelValue.fields" :key="field.id" class="schema-field" :class="{ unsupported: !field.visuallyEditable }">
        <template v-if="field.visuallyEditable">
          <div class="field-main">
            <label>Название<input :value="field.title ?? ''" aria-label="Название поля" placeholder="Сумма" @input="updateField(field.id, { title: optionalInput($event) })"></label>
            <label>Wire key<input :value="field.wireKey" aria-label="Wire key" class="mono" placeholder="amountMinor" @input="updateField(field.id, { wireKey: inputValue($event) })"></label>
            <label>Тип<select :value="field.type" aria-label="Тип поля" @change="updateField(field.id, { type: inputValue($event) as EventSchemaFieldDraft['type'] })"><option v-for="type in eventSchemaFieldTypes" :key="type" :value="type">{{ type }}</option></select></label>
            <label class="checkbox-label"><input type="checkbox" :checked="field.required" aria-label="Обязательное поле" @change="updateField(field.id, { required: ($event.target as HTMLInputElement).checked })"> Обязательное</label>
            <button type="button" class="icon-button" aria-label="Удалить поле" @click="removeField(field.id)">×</button>
          </div>
          <div class="field-meta">
            <span :class="{ available: capability(field).availableForScenarios }">{{ capability(field).label }}</span>
            <button type="button" class="link-button" data-test="field-details" @click="expandedFieldId = expandedFieldId === field.id ? null : field.id">{{ expandedFieldId === field.id ? 'Скрыть свойства' : 'Дополнительные свойства' }}</button>
          </div>
          <div v-if="expandedFieldId === field.id" class="field-details">
            <label class="wide">Описание<input :value="field.description ?? ''" aria-label="Описание поля" @input="updateField(field.id, { description: optionalInput($event) })"></label>
            <label>Stable field key<input :value="field.fieldKey ?? ''" aria-label="Stable field key" class="mono" @input="updateField(field.id, { fieldKey: optionalInput($event) })"><small>Не меняется при обычном rename wire key.</small></label>
            <label>Семантический тип<input :value="field.semanticType ?? ''" aria-label="Семантический тип" placeholder="money" @input="updateField(field.id, { semanticType: optionalInput($event) })"></label>
            <label>Единица измерения<input :value="field.unit ?? ''" aria-label="Единица измерения" placeholder="minor" @input="updateField(field.id, { unit: optionalInput($event) })"><small>CMS не конвертирует minor/major.</small></label>
            <label>Минимум<input type="number" :value="field.minimum" aria-label="Минимум" @input="updateField(field.id, { minimum: optionalNumber($event) })"></label>
            <label>Максимум<input type="number" :value="field.maximum" aria-label="Максимум" @input="updateField(field.id, { maximum: optionalNumber($event) })"></label>
            <label class="wide">Enum JSON<input :value="field.enumValues ? JSON.stringify(field.enumValues) : ''" aria-label="Enum JSON" placeholder='["EUR", "USD"]' @change="updateEnum(field, $event)"></label>
            <label class="checkbox-label"><input type="checkbox" :checked="field.sensitive === true" aria-label="Sensitive поле" @change="updateField(field.id, { sensitive: ($event.target as HTMLInputElement).checked })"> Sensitive</label>
          </div>
        </template>
        <template v-else>
          <div class="opaque-field">
            <div><strong>{{ field.wireKey }}</strong><span>{{ field.unsupportedReason }}</span></div>
            <span>Данные сохранены без изменений. Редактирование доступно в расширенном режиме.</span>
          </div>
        </template>
      </article>
    </div>
    <div v-else class="no-fields">Payload без фиксированных полей.</div>

    <p v-if="enumError" class="schema-error" role="alert">{{ enumError }}</p>

    <div class="schema-options">
      <label v-if="typeof modelValue.additionalProperties !== 'object'" class="checkbox-label">
        <input type="checkbox" :checked="modelValue.additionalProperties === true" aria-label="Разрешить дополнительные поля" @change="setAdditionalProperties">
        Разрешить дополнительные свойства payload
      </label>
      <span v-else>Custom `additionalProperties` сохранён и редактируется в расширенном режиме.</span>
    </div>

    <section v-if="changes.length" class="schema-diff" aria-label="Изменения schema">
      <strong>Изменения контракта</strong>
      <p>Backend пока не предоставляет impact/history metadata; показан локальный semantic diff.</p>
      <ul><li v-for="(change, index) in changes" :key="`${change.kind}-${index}`"><b>{{ changeLabels[change.kind] }}</b>: <code>{{ change.beforeWireKey ?? '—' }}</code> → <code>{{ change.afterWireKey ?? '—' }}</code></li></ul>
    </section>

    <section class="sample-validator">
      <header><div><strong>Пример payload</strong><span>Вставьте реальный sample и проверьте его теми же JSON Schema rules, что использует backend.</span></div><button type="button" class="link-button" @click="sampleText = generatedSample">Использовать generated</button></header>
      <pre>{{ generatedSample }}</pre>
      <textarea v-model="sampleText" aria-label="Sample payload" rows="6" spellcheck="false" placeholder='{"amountMinor": 125, "currency": "EUR"}' />
      <button type="button" class="secondary-button" data-test="validate-sample" @click="validateSample">Проверить sample</button>
      <p v-if="sampleIssues && !sampleIssues.length" class="sample-success" role="status">Sample соответствует текущей JSON Schema.</p>
      <table v-else-if="sampleIssues?.length" class="sample-issues">
        <thead><tr><th>Path</th><th>Ожидалось</th><th>Получено</th><th>Объяснение</th></tr></thead>
        <tbody><tr v-for="(issue, index) in sampleIssues" :key="`${issue.path}-${index}`"><td><code>{{ issue.path }}</code></td><td>{{ issue.expected }}</td><td><code>{{ issue.actual }}</code></td><td>{{ issue.explanation }}</td></tr></tbody>
      </table>
    </section>

    <section class="advanced-schema">
      <button type="button" class="link-button" data-test="advanced-schema" @click="toggleAdvanced">{{ advancedVisible ? 'Закрыть технические детали' : 'Технические детали · JSON Schema' }}</button>
      <div v-if="advancedVisible" class="advanced-editor">
        <p>Неизвестные keywords сохраняются. Применение JSON заменяет текущую визуальную модель после parse.</p>
        <textarea v-model="advancedText" aria-label="JSON Schema" rows="14" spellcheck="false" />
        <p v-if="advancedError" class="schema-error" role="alert">{{ advancedError }}</p>
        <button type="button" class="secondary-button" data-test="apply-advanced-schema" @click="applyAdvancedSchema">Применить JSON Schema</button>
      </div>
    </section>
  </section>
</template>

<style scoped>
.payload-studio{display:flex;flex-direction:column;gap:14px}.studio-header,.field-main,.field-meta,.opaque-field,.sample-validator>header{display:flex;align-items:center;justify-content:space-between;gap:12px}.studio-header strong,.studio-header span,.opaque-field strong,.opaque-field span,.sample-validator header strong,.sample-validator header span{display:block}.studio-header span,.opaque-field span,.sample-validator header span{color:var(--muted);font-size:.68rem;margin-top:3px}.secondary-button,.link-button,.icon-button{border:0;cursor:pointer;font:inherit}.secondary-button{padding:8px 11px;border-radius:8px;background:#efedf9;color:#5f49c8;font-size:.72rem;font-weight:700}.link-button{padding:0;background:transparent;color:#6653c5;font-size:.68rem}.icon-button{width:34px;height:34px;border-radius:50%;background:transparent;color:#b24938;font-size:1.2rem}.schema-fields{display:flex;flex-direction:column;gap:9px}.schema-field{padding:12px;border:1px solid var(--line);border-radius:11px;background:#fff}.schema-field.unsupported{background:#fbf8ef}.field-main{display:grid;grid-template-columns:1.15fr 1fr .75fr 118px 34px;align-items:end}.field-main label,.field-details label{display:flex;flex-direction:column;gap:5px;color:#777c72;font-size:.62rem}.field-main input,.field-main select,.field-details input,.advanced-editor textarea,.sample-validator textarea{width:100%;border:1px solid #dddeda;border-radius:8px;background:#fff;padding:8px 9px;color:var(--ink);font:inherit}.checkbox-label{display:flex!important;flex-direction:row!important;align-items:center!important;gap:7px!important;color:#60655c!important}.checkbox-label input{width:auto}.field-meta{margin-top:9px;color:#9a7350;font-size:.65rem}.field-meta .available{color:#3e8a4a}.field-details{display:grid;grid-template-columns:repeat(3,1fr);gap:11px;margin-top:12px;padding-top:12px;border-top:1px solid var(--line)}.field-details .wide{grid-column:span 2}.field-details small{color:var(--muted);font-size:.59rem}.no-fields,.schema-options{padding:12px;border-radius:9px;background:#f7f7f3;color:var(--muted);font-size:.72rem}.schema-diff{padding:13px;border:1px solid #eadfc1;border-radius:10px;background:#fffaf0}.schema-diff strong{font-size:.76rem}.schema-diff p,.schema-diff li{font-size:.68rem;color:var(--muted)}.schema-diff ul{margin:8px 0 0;padding-left:18px}.sample-validator{display:flex;min-width:0;flex-direction:column;align-items:flex-start;gap:9px;padding:13px;border:1px solid var(--line);border-radius:10px;background:#fff}.sample-validator pre{box-sizing:border-box;width:100%;max-height:160px;margin:0;padding:11px;overflow:auto;border-radius:8px;background:#252821;color:#dce7c1;font-size:.68rem}.sample-validator textarea{box-sizing:border-box;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.7rem;line-height:1.5;resize:vertical}.sample-success{margin:0;color:#347a40;font-size:.7rem}.sample-issues{width:100%;table-layout:fixed;border-collapse:collapse;font-size:.68rem}.sample-issues th,.sample-issues td{padding:7px;border-top:1px solid var(--line);overflow-wrap:anywhere;text-align:left;vertical-align:top}.advanced-schema{border-top:1px solid var(--line);padding-top:12px}.advanced-editor{display:flex;flex-direction:column;align-items:flex-start;gap:9px;margin-top:10px}.advanced-editor p{margin:0;color:var(--muted);font-size:.67rem}.advanced-editor textarea{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.7rem;line-height:1.5;resize:vertical}.schema-error{margin:0;color:#b23b2a;font-size:.7rem}
@media(max-width:820px){.field-main{grid-template-columns:1fr 1fr}.field-main .icon-button{grid-column:2;justify-self:end}.field-details{grid-template-columns:1fr 1fr}}@media(max-width:520px){.studio-header,.sample-validator>header{align-items:flex-start;flex-direction:column}.field-main,.field-details{grid-template-columns:1fr}.field-main .icon-button,.field-details .wide{grid-column:auto}.field-meta{align-items:flex-start;flex-direction:column}}
</style>
