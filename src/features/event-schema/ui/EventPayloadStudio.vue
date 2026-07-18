<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

import type { ScenarioAuthoringEvent, ScenarioAuthoringField } from '@/shared/api/repository/scenario-authoring'
import { uid } from '@/shared/lib/format'
import { findCatalogFieldForDraft, summarizeEventFieldCapability } from '../model/event-schema-capability'
import {
  buildEventSchemaExample,
  diffEventSchemas,
  eventSchemaFieldTypes,
  parseEventSchema,
  serializeEventSchema,
  validateEventSchemaDefinition,
  validateEventSchemaSample,
} from '../model/event-schema'
import type { EventSchemaChange, EventSchemaDraft, EventSchemaDraftIssue, EventSchemaFieldDraft, EventSchemaSampleIssue } from '../model/event-schema'

type StudioSection = 'payload' | 'sample' | 'review' | 'all'

const props = defineProps<{
  modelValue: EventSchemaDraft
  baselineSchema?: Record<string, unknown>
  catalogEvent?: ScenarioAuthoringEvent
  catalogRevision?: string
  activeSection?: StudioSection
  issues?: EventSchemaDraftIssue[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: EventSchemaDraft]
  'technical-draft-change': [dirty: boolean]
}>()

const expandedFieldId = ref<string | null>(null)
const advancedVisible = ref(false)
const advancedText = ref('')
const advancedOriginalText = ref('')
const advancedError = ref('')
const advancedCandidate = ref<EventSchemaDraft | null>(null)
const advancedChanges = ref<EventSchemaChange[]>([])
const advancedDiscardPrompt = ref(false)
const sampleText = ref('')
const sampleIssues = ref<EventSchemaSampleIssue[] | null>(null)

const showPayload = computed(() => !props.activeSection || props.activeSection === 'all' || props.activeSection === 'payload')
const showSample = computed(() => !props.activeSection || props.activeSection === 'all' || props.activeSection === 'sample')
const showReview = computed(() => !props.activeSection || props.activeSection === 'all' || props.activeSection === 'review')

const generatedSample = computed(() => JSON.stringify(buildEventSchemaExample(props.modelValue), null, 2))

const changes = computed(() => props.baselineSchema
  ? diffEventSchemas(props.baselineSchema, serializeEventSchema(props.modelValue))
  : [])

const fieldTypeLabels: Record<EventSchemaFieldDraft['type'] & string, string> = {
  string: 'Текст',
  number: 'Число',
  integer: 'Целое число',
  boolean: 'Да / нет',
  object: 'Набор полей',
  array: 'Список',
}

const semanticTypeOptions = [
  { value: '', label: 'Обычное значение' },
  { value: 'money', label: 'Денежная сумма' },
  { value: 'currency', label: 'Валюта' },
  { value: 'datetime', label: 'Дата и время' },
]

const unitOptions = [
  { value: '', label: 'Как передано интеграцией' },
  { value: 'minor', label: 'Минимальные денежные единицы (например, центы)' },
  { value: 'major', label: 'Основные денежные единицы' },
  { value: 'milliseconds', label: 'Миллисекунды' },
  { value: 'seconds', label: 'Секунды' },
]

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
  void nextTick(() => document.getElementById(`field-title-${field.id}`)?.focus())
}

function updateField(id: string, patch: Partial<EventSchemaFieldDraft>) {
  emit('update:modelValue', {
    ...props.modelValue,
    fields: props.modelValue.fields.map((field) => field.id === id ? { ...field, ...patch } : field),
  })
}

function updateSemanticType(field: EventSchemaFieldDraft, event: Event) {
  const semanticType = optionalInput(event)
  if (semanticType !== 'money') {
    updateField(field.id, { semanticType })
    return
  }
  updateField(field.id, {
    semanticType,
    unit: field.unit ?? 'minor',
    displayScale: field.displayScale ?? 0.01,
    displayPrecision: field.displayPrecision ?? 2,
  })
}

function updateMoneyUnit(field: EventSchemaFieldDraft, event: Event) {
  const unit = optionalInput(event)
  updateField(field.id, {
    unit,
    ...(field.semanticType === 'money' && unit === 'minor' ? { displayScale: 0.01, displayPrecision: 2 } : {}),
    ...(field.semanticType === 'money' && unit === 'major' ? { displayScale: 1, displayPrecision: 2 } : {}),
  })
}

function removeField(id: string) {
  const index = props.modelValue.fields.findIndex((field) => field.id === id)
  const focusId = props.modelValue.fields[index + 1]?.id ?? props.modelValue.fields[index - 1]?.id
  emit('update:modelValue', { ...props.modelValue, fields: props.modelValue.fields.filter((field) => field.id !== id) })
  void nextTick(() => {
    if (focusId) document.getElementById(`field-title-${focusId}`)?.focus()
    else document.querySelector<HTMLElement>('[data-test="add-field"]')?.focus()
  })
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

function enumText(field: EventSchemaFieldDraft): string {
  return field.enumValues?.every((value) => typeof value === 'string') ? field.enumValues.join('\n') : ''
}

function canEditEnum(field: EventSchemaFieldDraft): boolean {
  return field.type === 'string' && (!field.enumValues || field.enumValues.every((value) => typeof value === 'string'))
}

function updateEnum(field: EventSchemaFieldDraft, event: Event) {
  const values = inputValue(event).split('\n').map((value) => value.trim()).filter(Boolean)
  updateField(field.id, { enumValues: values.length ? values : undefined })
}

function clearFieldConstraints(field: EventSchemaFieldDraft) {
  updateField(field.id, { enumValues: undefined, minimum: undefined, maximum: undefined })
}

function hasIncompatibleConstraints(field: EventSchemaFieldDraft): boolean {
  const stringEnumOnAnotherType = field.type !== 'string' && field.enumValues?.some((value) => typeof value === 'string')
  const rangeOnAnotherType = field.type !== 'number' && field.type !== 'integer' && (field.minimum !== undefined || field.maximum !== undefined)
  return Boolean(stringEnumOnAnotherType || rangeOnAnotherType)
}

function setAdditionalProperties(event: Event) {
  emit('update:modelValue', {
    ...props.modelValue,
    additionalProperties: (event.target as HTMLInputElement).checked,
    hasAdditionalProperties: true,
  })
}

function toggleAdvanced() {
  if (advancedVisible.value) {
    if (advancedText.value !== advancedOriginalText.value) {
      advancedDiscardPrompt.value = true
      return
    }
    discardAdvancedDraft()
    return
  }
  advancedVisible.value = true
  advancedError.value = ''
  advancedCandidate.value = null
  advancedChanges.value = []
  advancedDiscardPrompt.value = false
  advancedText.value = JSON.stringify(serializeEventSchema(props.modelValue), null, 2)
  advancedOriginalText.value = advancedText.value
  emit('technical-draft-change', false)
}

function updateAdvancedText(event: Event) {
  advancedText.value = inputValue(event)
  advancedCandidate.value = null
  advancedChanges.value = []
  advancedError.value = ''
  advancedDiscardPrompt.value = false
  emit('technical-draft-change', advancedText.value !== advancedOriginalText.value)
}

function reviewAdvancedSchema() {
  try {
    const schema: unknown = JSON.parse(advancedText.value)
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) throw new Error('Корневая JSON Schema должна быть объектом.')
    const issues = validateEventSchemaDefinition(schema as Record<string, unknown>)
    if (issues.length) throw new Error(issues.map((issue) => issue.message).join(' '))
    const candidate = parseEventSchema(schema as Record<string, unknown>)
    advancedCandidate.value = candidate
    advancedChanges.value = diffEventSchemas(serializeEventSchema(props.modelValue), serializeEventSchema(candidate))
    advancedError.value = ''
  } catch (cause) {
    advancedError.value = cause instanceof Error ? cause.message : 'Некорректная JSON Schema.'
    advancedCandidate.value = null
    advancedChanges.value = []
  }
}

function applyAdvancedSchema() {
  if (!advancedCandidate.value) return
  emit('update:modelValue', advancedCandidate.value)
  advancedVisible.value = false
  advancedCandidate.value = null
  advancedChanges.value = []
  advancedDiscardPrompt.value = false
  emit('technical-draft-change', false)
}

function discardAdvancedDraft() {
  advancedVisible.value = false
  advancedText.value = ''
  advancedOriginalText.value = ''
  advancedError.value = ''
  advancedCandidate.value = null
  advancedChanges.value = []
  advancedDiscardPrompt.value = false
  emit('technical-draft-change', false)
}

defineExpose({ discardAdvancedDraft })

function catalogField(field: EventSchemaFieldDraft): ScenarioAuthoringField | undefined {
  return findCatalogFieldForDraft(props.catalogEvent, field)
}

function capability(field: EventSchemaFieldDraft) {
  return summarizeEventFieldCapability(catalogField(field), Boolean(props.catalogEvent))
}

function fieldLabel(field: EventSchemaFieldDraft): string {
  return field.title || field.wireKey || 'без названия'
}

function fieldIssue(field: EventSchemaFieldDraft): EventSchemaDraftIssue | undefined {
  return props.issues?.find((issue) => issue.fieldId === field.id)
}

function optionsWithCurrent(options: Array<{ value: string; label: string }>, current?: string) {
  if (!current || options.some((option) => option.value === current)) return options
  return [...options, { value: current, label: `Текущее значение: ${current}` }]
}

const changeLabels: Record<EventSchemaChange['kind'], string> = {
  added: 'Добавлено поле',
  removed: 'Удалено поле',
  renamed: 'Изменено имя поля в данных',
  'type-changed': 'Изменён тип',
  'field-key-changed': 'Изменён технический идентификатор',
  'required-changed': 'Изменена обязательность',
  'constraint-changed': 'Изменены допустимые значения или диапазон',
  'metadata-changed': 'Изменены описание или смысл данных',
  'additional-properties-changed': 'Изменён приём дополнительных полей',
}

function changeTarget(change: EventSchemaChange): string {
  return change.afterWireKey ?? change.beforeWireKey ?? 'Всё событие'
}

function changeValues(change: EventSchemaChange): string | null {
  if (change.beforeValue === undefined && change.afterValue === undefined) return null
  return `${change.beforeValue ?? '—'} → ${change.afterValue ?? '—'}`
}

function validateSample() {
  try {
    const sample: unknown = JSON.parse(sampleText.value)
    sampleIssues.value = validateEventSchemaSample(props.modelValue, sample)
  } catch {
    sampleIssues.value = [{
      path: '/',
      expected: 'корректный JSON',
      actual: 'пример не удалось прочитать',
      explanation: 'Проверьте кавычки, запятые и фигурные скобки в примере.',
    }]
  }
}

watch(
  () => JSON.stringify(serializeEventSchema(props.modelValue)),
  () => { sampleIssues.value = null },
)
</script>

<template>
  <section class="payload-studio">
    <template v-if="showPayload">
      <template v-if="!advancedVisible">
        <header class="studio-header">
          <div>
            <strong>Поля события</strong>
            <span>Добавьте только те данные, которые интеграция будет отправлять вместе с событием.</span>
          </div>
          <button type="button" class="secondary-button" data-test="add-field" @click="addField">+ Добавить поле</button>
        </header>

        <div v-if="modelValue.fields.length" class="schema-fields">
          <article v-for="field in modelValue.fields" :key="field.id" class="schema-field" :class="{ unsupported: !field.visuallyEditable }" role="group" :aria-label="`Поле ${fieldLabel(field)}`">
            <template v-if="field.visuallyEditable">
              <div class="field-main">
                <label :for="`field-title-${field.id}`">Название<input :id="`field-title-${field.id}`" data-test="field-title" :value="field.title ?? ''" :aria-label="`Название поля ${fieldLabel(field)}`" placeholder="Сумма" @input="updateField(field.id, { title: optionalInput($event) })"></label>
                <label :for="`field-wire-${field.id}`">Имя в данных<input :id="`field-wire-${field.id}`" data-test="field-wire-key" :value="field.wireKey" :aria-label="`Имя поля в данных ${fieldLabel(field)}`" :aria-invalid="Boolean(fieldIssue(field))" :aria-describedby="fieldIssue(field) ? `field-error-${field.id}` : undefined" class="mono" placeholder="amountMinor" @input="updateField(field.id, { wireKey: inputValue($event) })"><small>Латиницей, как его отправляет интеграция.</small></label>
                <label :for="`field-type-${field.id}`">Тип данных<select :id="`field-type-${field.id}`" data-test="field-type" :value="field.type" :aria-label="`Тип поля ${fieldLabel(field)}`" @change="updateField(field.id, { type: inputValue($event) as EventSchemaFieldDraft['type'] })"><option v-for="type in eventSchemaFieldTypes" :key="type" :value="type">{{ fieldTypeLabels[type] }}</option></select></label>
                <label class="checkbox-label"><input type="checkbox" :checked="field.required" :aria-label="`Обязательное поле ${fieldLabel(field)}`" @change="updateField(field.id, { required: ($event.target as HTMLInputElement).checked })"> Обязательно</label>
                <button type="button" class="icon-button" :aria-label="`Удалить поле ${fieldLabel(field)}`" @click="removeField(field.id)">×</button>
              </div>
              <p v-if="fieldIssue(field)" :id="`field-error-${field.id}`" class="schema-error" role="alert">{{ fieldIssue(field)?.message }}</p>
              <div class="field-meta">
                <span :class="{ available: capability(field).availableForScenarios }">{{ capability(field).label }}</span>
                <button type="button" class="link-button" data-test="field-details" :aria-expanded="expandedFieldId === field.id" :aria-controls="`field-details-${field.id}`" @click="expandedFieldId = expandedFieldId === field.id ? null : field.id">{{ expandedFieldId === field.id ? 'Скрыть настройки' : 'Дополнительные настройки' }}</button>
              </div>
              <div v-if="expandedFieldId === field.id" :id="`field-details-${field.id}`" class="field-details">
                <label class="wide">Описание<input :value="field.description ?? ''" :aria-label="`Описание поля ${fieldLabel(field)}`" @input="updateField(field.id, { description: optionalInput($event) })"></label>
                <label>Смысл данных<select :value="field.semanticType ?? ''" :aria-label="`Смысл данных поля ${fieldLabel(field)}`" @change="updateSemanticType(field, $event)"><option v-for="option in optionsWithCurrent(semanticTypeOptions, field.semanticType)" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
                <label>Способ хранения<select :value="field.unit ?? ''" :aria-label="`Способ хранения поля ${fieldLabel(field)}`" @change="updateMoneyUnit(field, $event)"><option v-for="option in optionsWithCurrent(unitOptions, field.unit)" :key="option.value" :value="option.value">{{ option.label }}</option></select><small>В событии сохраняется исходное значение; интерфейс применяет заданный ниже масштаб только при показе и вводе.</small></label>
                <template v-if="field.semanticType?.includes('money')">
                  <label>Масштаб отображения<input data-test="money-display-scale" type="number" min="0" step="any" :value="field.displayScale" :aria-label="`Масштаб отображения поля ${fieldLabel(field)}`" @input="updateField(field.id, { displayScale: optionalNumber($event) })"><small>Показываемое значение = значение события × масштаб. Для центов обычно 0,01.</small></label>
                  <label>Знаков после запятой<input data-test="money-display-precision" type="number" min="0" max="12" step="1" :value="field.displayPrecision" :aria-label="`Точность отображения поля ${fieldLabel(field)}`" @input="updateField(field.id, { displayPrecision: optionalNumber($event) })"><small>Допустимо от 0 до 12.</small></label>
                </template>
                <label v-if="field.type === 'number' || field.type === 'integer'">Минимальное значение<input type="number" :value="field.minimum" :aria-label="`Минимальное значение поля ${fieldLabel(field)}`" @input="updateField(field.id, { minimum: optionalNumber($event) })"></label>
                <label v-if="field.type === 'number' || field.type === 'integer'">Максимальное значение<input type="number" :value="field.maximum" :aria-label="`Максимальное значение поля ${fieldLabel(field)}`" @input="updateField(field.id, { maximum: optionalNumber($event) })"></label>
                <label v-if="canEditEnum(field)" class="wide">Допустимые варианты<textarea :value="enumText(field)" :aria-label="`Допустимые варианты поля ${fieldLabel(field)}`" rows="3" placeholder="Каждый вариант с новой строки" @input="updateEnum(field, $event)" /><small>По одному варианту в строке — например EUR и USD.</small></label>
                <div v-else-if="field.enumValues?.length" class="readonly-note wide">Список допустимых значений сохранён без изменений. Для этого типа он доступен только в технических деталях.</div>
                <div v-if="hasIncompatibleConstraints(field)" class="constraint-warning wide" role="alert"><span>Часть ограничений не подходит выбранному типу. Очистите их или верните прежний тип.</span><button type="button" class="link-button" @click="clearFieldConstraints(field)">Очистить несовместимые ограничения</button></div>
                <label class="checkbox-label"><input type="checkbox" :checked="field.sensitive === true" :aria-label="`Скрывать значение поля ${fieldLabel(field)}`" @change="updateField(field.id, { sensitive: ($event.target as HTMLInputElement).checked })"> Скрывать значение в проверках</label>
                <div class="technical-identity wide"><span>Технический идентификатор</span><code>{{ field.fieldKey || 'будет создан при добавлении поля' }}</code><small>Не меняется при обычном переименовании.</small></div>
              </div>
            </template>
            <template v-else>
              <div class="opaque-field">
                <div><strong>{{ field.wireKey }}</strong><span>{{ field.unsupportedReason }}</span></div>
                <span>Данные сохранены без изменений. Их можно посмотреть в технических деталях.</span>
              </div>
            </template>
          </article>
        </div>
        <div v-else class="no-fields">У события пока нет дополнительных данных.</div>

        <div class="schema-options">
          <label v-if="typeof modelValue.additionalProperties !== 'object'" class="checkbox-label">
            <input type="checkbox" :checked="modelValue.additionalProperties === true" aria-label="Разрешить дополнительные поля" @change="setAdditionalProperties">
            Принимать поля, которые не описаны выше
          </label>
          <span v-else>Особое правило для дополнительных полей сохранено. Оно доступно в технических деталях.</span>
        </div>
      </template>

      <section class="advanced-schema">
        <button type="button" class="link-button" data-test="advanced-schema" :aria-expanded="advancedVisible" aria-controls="advanced-schema-editor" @click="toggleAdvanced">{{ advancedVisible ? 'Вернуться к визуальной настройке' : 'Технические детали · JSON Schema' }}</button>
        <div v-if="advancedVisible" id="advanced-schema-editor" class="advanced-editor">
          <p>Этот режим предназначен для разработчиков. Сначала схема проверяется и показывает изменения; только потом её можно применить.</p>
          <textarea :value="advancedText" aria-label="JSON Schema" rows="14" spellcheck="false" @input="updateAdvancedText" />
          <p v-if="advancedError" class="schema-error" role="alert">{{ advancedError }}</p>
          <div v-if="advancedDiscardPrompt" class="constraint-warning" role="alert"><span>В JSON есть неприменённые изменения. Проверить их или отменить?</span><button type="button" class="link-button" data-test="discard-advanced-schema" @click="discardAdvancedDraft">Отменить изменения JSON</button></div>
          <div v-if="advancedCandidate" class="advanced-review" role="status">
            <strong>Проверка пройдена</strong>
            <span v-if="!advancedChanges.length">Изменений полей не найдено. Остальные технические параметры будут сохранены как введены.</span>
            <ul v-else><li v-for="(change, index) in advancedChanges" :key="`${change.kind}-${index}`">{{ changeLabels[change.kind] }}: <code>{{ changeTarget(change) }}</code><span v-if="changeValues(change)"> · {{ changeValues(change) }}</span></li></ul>
          </div>
          <div class="advanced-actions">
            <button type="button" class="secondary-button" data-test="review-advanced-schema" @click="reviewAdvancedSchema">Проверить изменения</button>
            <button v-if="advancedCandidate" type="button" class="primary-inline-button" data-test="apply-advanced-schema" @click="applyAdvancedSchema">Применить проверенную схему</button>
          </div>
        </div>
      </section>
    </template>

    <section v-if="showSample" class="sample-validator">
      <header><div><strong>Пример данных события</strong><span>Так будет выглядеть заполненное событие с текущими полями и ограничениями.</span></div><button type="button" class="link-button" @click="sampleText = generatedSample">Подставить пример для проверки</button></header>
      <pre>{{ generatedSample }}</pre>
      <details class="sample-details">
        <summary>Проверить пример от интеграции <span>необязательно</span></summary>
        <p>Вставьте JSON, который прислал разработчик. Настраивать событие через этот блок не требуется.</p>
        <textarea v-model="sampleText" aria-label="Пример данных для проверки" rows="6" spellcheck="false" placeholder='{"amountMinor": 125, "currency": "EUR"}' />
        <button type="button" class="secondary-button" data-test="validate-sample" @click="validateSample">Проверить пример</button>
      </details>
      <p v-if="sampleIssues && !sampleIssues.length" class="sample-success" role="status">Пример соответствует текущей настройке.</p>
      <table v-else-if="sampleIssues?.length" class="sample-issues">
        <thead><tr><th>Поле</th><th>Ожидалось</th><th>Получено</th><th>Как исправить</th></tr></thead>
        <tbody><tr v-for="(issue, index) in sampleIssues" :key="`${issue.path}-${index}`"><td data-label="Поле"><code>{{ issue.path }}</code></td><td data-label="Ожидалось">{{ issue.expected }}</td><td data-label="Получено"><code>{{ issue.actual }}</code></td><td data-label="Как исправить">{{ issue.explanation }}</td></tr></tbody>
      </table>
    </section>

    <section v-if="showReview" class="schema-diff" aria-label="Изменения данных события">
      <strong>{{ baselineSchema ? 'Что изменится' : 'Настройка готова к созданию' }}</strong>
      <p v-if="baselineSchema">Показано сравнение с открытой версией. Сейчас система не может автоматически оценить влияние на внешние интеграции и связанные сценарии.</p>
      <p v-else>Проверьте название, поля и пример перед созданием события.</p>
      <ul v-if="changes.length"><li v-for="(change, index) in changes" :key="`${change.kind}-${index}`"><b>{{ changeLabels[change.kind] }}</b>: <code>{{ changeTarget(change) }}</code><span v-if="changeValues(change)"> · {{ changeValues(change) }}</span></li></ul>
      <p v-else-if="baselineSchema" class="no-changes">Изменений в полях нет.</p>
    </section>
  </section>
</template>

<style scoped>
.payload-studio{display:flex;min-width:0;flex-direction:column;gap:16px}.studio-header,.field-main,.field-meta,.opaque-field,.sample-validator>header{display:flex;align-items:center;justify-content:space-between;gap:12px}.studio-header strong,.studio-header span,.opaque-field strong,.opaque-field span,.sample-validator header strong,.sample-validator header span{display:block}.studio-header span,.opaque-field span,.sample-validator header span{margin-top:4px;color:var(--muted);font-size:.76rem;line-height:1.45}.secondary-button,.primary-inline-button,.link-button,.icon-button{border:0;cursor:pointer;font:inherit}.secondary-button,.primary-inline-button{padding:9px 12px;border-radius:8px;font-size:.76rem;font-weight:700}.secondary-button{background:var(--status-violet-soft);color:var(--status-violet-text)}.primary-inline-button{background:var(--action-primary);color:var(--on-action-primary)}.link-button{padding:3px 0;background:transparent;color:var(--status-violet-text);font-size:.76rem}.icon-button{width:36px;height:36px;border-radius:50%;background:transparent;color:var(--status-danger-text);font-size:1.2rem}.schema-fields{display:flex;flex-direction:column;gap:10px}.schema-field{padding:14px;border:1px solid var(--line);border-radius:12px;background:var(--surface-card)}.schema-field.unsupported{background:var(--status-warning-soft)}.field-main{display:grid;grid-template-columns:1.15fr 1fr .78fr 120px 36px;align-items:end}.field-main label,.field-details label{display:flex;flex-direction:column;gap:6px;color:var(--text-secondary);font-size:.74rem;line-height:1.35}.field-main input,.field-main select,.field-details input,.field-details select,.field-details textarea,.advanced-editor textarea,.sample-validator textarea{box-sizing:border-box;width:100%;border:1px solid var(--border-default);border-radius:8px;background:var(--surface-card);padding:9px 10px;color:var(--ink);font:inherit}.field-main small,.field-details small,.technical-identity small{color:var(--muted);font-size:.7rem;line-height:1.4}.checkbox-label{display:flex!important;flex-direction:row!important;align-items:center!important;gap:8px!important;color:var(--text-secondary)!important;font-size:.76rem!important}.checkbox-label input{width:auto}.field-meta{margin-top:10px;color:var(--status-warning-text);font-size:.74rem}.field-meta .available{color:var(--status-success-text)}.field-details{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px;margin-top:13px;padding-top:13px;border-top:1px solid var(--line)}.field-details .wide{grid-column:span 2}.readonly-note,.technical-identity{padding:10px;border-radius:8px;background:var(--surface-subtle);color:var(--muted);font-size:.74rem}.technical-identity{display:flex;flex-direction:column;gap:4px}.technical-identity code{overflow-wrap:anywhere;color:var(--text-secondary)}.constraint-warning{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px;border-radius:8px;background:var(--status-warning-soft);color:var(--status-warning-text);font-size:.74rem}.no-fields,.schema-options{padding:13px;border-radius:9px;background:var(--surface-subtle);color:var(--muted);font-size:.76rem}.schema-diff{padding:15px;border:1px solid var(--status-warning);border-radius:11px;background:var(--status-warning-soft)}.schema-diff strong{font-size:.82rem}.schema-diff p,.schema-diff li{color:var(--text-secondary);font-size:.76rem;line-height:1.45}.schema-diff ul{margin:9px 0 0;padding-left:20px}.no-changes{margin-bottom:0}.sample-validator{display:flex;min-width:0;flex-direction:column;align-items:stretch;gap:11px;padding:15px;border:1px solid var(--line);border-radius:11px;background:var(--surface-card)}.sample-validator pre{box-sizing:border-box;width:100%;max-height:180px;margin:0;padding:12px;overflow:auto;border-radius:8px;background:var(--surface-emphasis);color:var(--status-success);font-size:.74rem;line-height:1.5}.sample-details{padding:11px 12px;border-radius:9px;background:var(--surface-subtle)}.sample-details summary{cursor:pointer;color:var(--status-violet-text);font-size:.76rem;font-weight:700}.sample-details summary span{color:var(--muted);font-weight:400}.sample-details p{color:var(--muted);font-size:.74rem;line-height:1.45}.sample-details textarea{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.74rem;line-height:1.5;resize:vertical}.sample-details .secondary-button{margin-top:9px}.sample-success{margin:0;color:var(--status-success-text);font-size:.76rem}.sample-issues{width:100%;table-layout:fixed;border-collapse:collapse;font-size:.74rem}.sample-issues th,.sample-issues td{padding:9px;border-top:1px solid var(--line);overflow-wrap:anywhere;text-align:left;vertical-align:top}.advanced-schema{border-top:1px solid var(--line);padding-top:13px}.advanced-editor{display:flex;flex-direction:column;align-items:stretch;gap:11px;margin-top:10px}.advanced-editor p{margin:0;color:var(--muted);font-size:.74rem;line-height:1.45}.advanced-editor textarea{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.74rem;line-height:1.5;resize:vertical}.advanced-review{display:flex;flex-direction:column;gap:5px;padding:11px;border-radius:9px;background:var(--status-success-soft);color:var(--status-success-text);font-size:.76rem}.advanced-review ul{margin:4px 0 0;padding-left:19px}.advanced-actions{display:flex;gap:9px;flex-wrap:wrap}.schema-error{margin:8px 0 0;color:var(--status-danger-text);font-size:.76rem;line-height:1.4}
@media(max-width:820px){.field-main{grid-template-columns:1fr 1fr}.field-main .icon-button{grid-column:2;justify-self:end}.field-details{grid-template-columns:1fr 1fr}}
@media(max-width:520px){.studio-header,.sample-validator>header{align-items:flex-start;flex-direction:column}.field-main,.field-details{grid-template-columns:1fr}.field-main .icon-button,.field-details .wide{grid-column:auto}.field-meta{align-items:flex-start;flex-direction:column}.sample-issues,.sample-issues tbody,.sample-issues tr,.sample-issues td{display:block}.sample-issues thead{display:none}.sample-issues tr{padding:10px 0;border-top:1px solid var(--line)}.sample-issues td{display:grid;grid-template-columns:90px minmax(0,1fr);gap:8px;padding:4px 0;border:0}.sample-issues td::before{content:attr(data-label);color:var(--muted);font-weight:700}.advanced-actions{flex-direction:column}.advanced-actions button{width:100%}}
</style>
