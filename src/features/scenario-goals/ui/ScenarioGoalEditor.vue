<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'

import type { ScenarioAuthoringContract } from '@/shared/api/repository/scenario-authoring'
import {
  createGoalDraft,
  goalFilterOperatorLabel,
  goalDraftFromConfig,
  serializeGoalDraft,
  summarizeGoalDraft,
  type GoalDraft,
  type GoalDraftIssue,
  type GoalFilterDraft,
  type GoalFilterOperator,
} from '../model'

type DurationUnit = 'second' | 'minute' | 'hour' | 'day'

const props = defineProps<{
  modelValue: Record<string, unknown>
  contract: ScenarioAuthoringContract
  targets: Array<{ label: string; value: string }>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, unknown>]
  'validity-change': [valid: boolean]
}>()

const draft = reactive<GoalDraft>(createGoalDraft())
const duration = ref(1)
const durationUnit = ref<DurationUnit>('day')
const issues = ref<GoalDraftIssue[]>([])
const measureOptions = [{ label: 'Количество событий', value: 'count' }, { label: 'Сумма поля', value: 'sum' }]
const compareOptions = [
  { label: 'равно', value: 'eq' }, { label: 'не равно', value: 'neq' },
  { label: 'больше', value: 'gt' }, { label: 'не меньше', value: 'gte' },
  { label: 'меньше', value: 'lt' }, { label: 'не больше', value: 'lte' },
]
const unitOptions = [
  { label: 'секунд', value: 'second', multiplier: 1_000 },
  { label: 'минут', value: 'minute', multiplier: 60_000 },
  { label: 'часов', value: 'hour', multiplier: 3_600_000 },
  { label: 'дней', value: 'day', multiplier: 86_400_000 },
] as const
const supportedFilterOperators = new Set<GoalFilterOperator>(['eq', 'neq', 'in', 'exists'])

const selectedEvent = computed(() => props.contract.events.find((event) => event.code === draft.eventCode))
const numericFields = computed(() => selectedEvent.value?.fields.filter((field) => field.capabilities.aggregateMeasure.measures.includes('sum')) ?? [])
const summary = computed(() => summarizeGoalDraft(draft, props.contract))

function periodFromMs(milliseconds: number): [number, DurationUnit] {
  for (const unit of [...unitOptions].reverse()) {
    if (milliseconds >= unit.multiplier && milliseconds % unit.multiplier === 0) return [milliseconds / unit.multiplier, unit.value]
  }
  return [Math.max(1, milliseconds / 1_000), 'second']
}

function load(value: Record<string, unknown>) {
  const next = goalDraftFromConfig(value)
  Object.assign(draft, next)
  const [amount, unit] = periodFromMs(next.timeoutMs)
  duration.value = amount
  durationUnit.value = unit
}

watch(() => props.modelValue, load, { immediate: true })

function rawConfig(): Record<string, unknown> {
  return {
    goal: {
      version: 1, eventCode: draft.eventCode, measure: draft.measure,
      ...(draft.measure === 'sum' && draft.numericFieldKey ? { numericFieldKey: draft.numericFieldKey } : {}),
      filters: draft.filters.map((filter) => ({ ...filter })), compare: { ...draft.compare },
    },
    timeoutMs: draft.timeoutMs, onGoal: draft.onGoal, onTimeout: draft.onTimeout,
  }
}

function commit() {
  const result = serializeGoalDraft(draft, props.contract)
  issues.value = result.ok ? [] : result.issues
  emit('validity-change', result.ok)
  emit('update:modelValue', result.ok ? result.value : rawConfig())
}

function changeEvent() {
  draft.numericFieldKey = undefined
  draft.filters = []
  commit()
}

function changeMeasure() {
  if (draft.measure === 'count') draft.numericFieldKey = undefined
  commit()
}

function changeDuration() {
  const multiplier = unitOptions.find((unit) => unit.value === durationUnit.value)?.multiplier ?? 1_000
  draft.timeoutMs = Number(duration.value) * multiplier
  commit()
}

function addFilter() {
  draft.filters.push({ fieldKey: '', operator: 'eq' })
  commit()
}

function removeFilter(index: number) {
  draft.filters.splice(index, 1)
  commit()
}

function fieldFor(filter: GoalFilterDraft) {
  return selectedEvent.value?.fields.find((field) => field.fieldKey === filter.fieldKey)
}

function filterOperators(filter: GoalFilterDraft) {
  return (fieldFor(filter)?.capabilities.aggregateFilter.operators ?? [])
    .filter((operator): operator is GoalFilterOperator => supportedFilterOperators.has(operator as GoalFilterOperator))
}

function changeFilterField(filter: GoalFilterDraft) {
  filter.operator = filterOperators(filter)[0] ?? 'eq'
  filter.value = undefined
  commit()
}

function changeFilterOperator(filter: GoalFilterDraft) {
  filter.value = filter.operator === 'in' ? [] : undefined
  commit()
}

function changeScalarFilterValue(filter: GoalFilterDraft, event: Event) {
  const value = (event.target as HTMLInputElement).value
  filter.value = value === '' ? undefined : typedFilterValue(value, fieldFor(filter)?.valueType)
  commit()
}

function changeListFilterValue(filter: GoalFilterDraft, event: Event) {
  const valueType = fieldFor(filter)?.valueType
  filter.value = (event.target as HTMLInputElement).value
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => typedFilterValue(value, valueType))
  commit()
}

function typedFilterValue(value: string, valueType?: string): string | number | boolean {
  if (valueType === 'number' || valueType === 'integer') return Number(value)
  if (valueType === 'boolean') return value === 'true'
  return value
}
</script>

<template>
  <div class="goal-editor">
    <div class="field">
      <label for="goal-event">Событие цели</label>
      <select id="goal-event" v-model="draft.eventCode" aria-label="Событие цели" @change="changeEvent">
        <option value="">Выберите событие</option>
        <option v-for="event in contract.events" :key="event.definitionId" :value="event.code">{{ event.name }} · {{ event.code }}</option>
      </select>
    </div>
    <div class="field">
      <label for="goal-measure">Результат</label>
      <select id="goal-measure" v-model="draft.measure" aria-label="Что считать для цели" @change="changeMeasure">
        <option v-for="option in measureOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
      </select>
    </div>
    <div v-if="draft.measure === 'sum'" class="field">
      <label for="goal-number-field">Поле суммы</label>
      <select id="goal-number-field" v-model="draft.numericFieldKey" aria-label="Поле суммы цели" @change="commit">
        <option value="">Выберите числовое поле</option>
        <option v-for="field in numericFields" :key="field.fieldKey" :value="field.fieldKey">{{ field.label }}{{ field.unit ? ` · ${field.unit}` : '' }}</option>
      </select>
    </div>

    <div class="filters-head"><div><strong>Какие события учитывать</strong><small>До 20 типизированных фильтров payload.</small></div><button type="button" aria-label="Добавить фильтр цели" :disabled="draft.filters.length >= 20 || !selectedEvent" @click="addFilter">+ Фильтр</button></div>
    <div v-for="(filter, index) in draft.filters" :key="index" class="filter-card">
      <select v-model="filter.fieldKey" :aria-label="`Поле фильтра цели ${index + 1}`" @change="changeFilterField(filter)">
        <option value="">Поле</option>
        <option v-for="field in selectedEvent?.fields" :key="field.fieldKey" :value="field.fieldKey">{{ field.label }}</option>
      </select>
      <select v-model="filter.operator" :aria-label="`Оператор фильтра цели ${index + 1}`" @change="changeFilterOperator(filter)">
        <option v-for="operator in filterOperators(filter)" :key="operator" :value="operator">{{ goalFilterOperatorLabel(operator) }}</option>
      </select>
      <select v-if="fieldFor(filter)?.allowedValues && filter.operator === 'in'" v-model="filter.value" multiple :aria-label="`Значения фильтра цели ${index + 1}`" @change="commit">
        <option v-for="value in fieldFor(filter)?.allowedValues" :key="String(value)" :value="value">{{ value }}</option>
      </select>
      <select v-else-if="fieldFor(filter)?.allowedValues && filter.operator !== 'exists'" v-model="filter.value" :aria-label="`Значение фильтра цели ${index + 1}`" @change="commit">
        <option value="">Значение</option>
        <option v-for="value in fieldFor(filter)?.allowedValues" :key="String(value)" :value="value">{{ value }}</option>
      </select>
      <select v-else-if="fieldFor(filter)?.valueType === 'boolean' && filter.operator !== 'exists'" v-model="filter.value" :aria-label="`Значение фильтра цели ${index + 1}`" @change="commit">
        <option :value="undefined">Значение</option><option :value="true">Да</option><option :value="false">Нет</option>
      </select>
      <input v-else-if="filter.operator === 'in'" :value="Array.isArray(filter.value) ? filter.value.join(', ') : ''" placeholder="Значения через запятую" :aria-label="`Значения фильтра цели ${index + 1}`" @input="changeListFilterValue(filter, $event)">
      <input v-else-if="filter.operator !== 'exists'" :value="filter.value" :type="['number', 'integer'].includes(fieldFor(filter)?.valueType ?? '') ? 'number' : 'text'" :aria-label="`Значение фильтра цели ${index + 1}`" @input="changeScalarFilterValue(filter, $event)">
      <button type="button" :aria-label="`Удалить фильтр цели ${index + 1}`" @click="removeFilter(index)">×</button>
    </div>

    <div class="compare-grid">
      <div class="field"><label for="goal-compare">Успех, когда результат</label><select id="goal-compare" v-model="draft.compare.operator" aria-label="Сравнение цели" @change="commit"><option v-for="option in compareOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select></div>
      <div class="field"><label for="goal-threshold">Порог</label><input id="goal-threshold" v-model="draft.compare.value" inputmode="decimal" aria-label="Порог цели" @input="commit"></div>
    </div>

    <div class="deadline-card">
      <strong>Срок цели</strong>
      <p>Ожидание всегда конечное. Этот срок выбирает Timeout-ветку и не является сроком ожидания online.</p>
      <div class="duration-grid"><input v-model.number="duration" type="number" min="1" aria-label="Срок цели" @input="changeDuration"><select v-model="durationUnit" aria-label="Единица срока цели" @change="changeDuration"><option v-for="unit in unitOptions" :key="unit.value" :value="unit.value">{{ unit.label }}</option></select></div>
    </div>

    <div class="field"><label for="goal-branch">При достижении цели</label><select id="goal-branch" v-model="draft.onGoal" aria-label="Ветка при достижении цели" @change="commit"><option value="">Выберите действие</option><option v-for="target in targets" :key="target.value" :value="target.value">{{ target.label }}</option></select></div>
    <div class="field"><label for="timeout-branch">По истечении срока</label><select id="timeout-branch" v-model="draft.onTimeout" aria-label="Ветка по истечении срока" @change="commit"><option value="">Выберите действие</option><option v-for="target in targets" :key="target.value" :value="target.value">{{ target.label }}</option></select></div>

    <div class="goal-summary"><strong>Как это работает</strong><span>{{ summary }}</span></div>
    <ul v-if="issues.length" class="goal-issues"><li v-for="item in issues" :key="`${item.code}:${item.field}`">{{ item.message }}</li></ul>
  </div>
</template>

<style scoped>
.goal-editor{display:grid;gap:13px}.field{display:grid;gap:5px}.field label,.filters-head strong,.deadline-card strong,.goal-summary strong{font-size:.72rem}.field select,.field input,.filter-card select,.filter-card input,.duration-grid select,.duration-grid input{width:100%;min-height:38px;border:1px solid #d9dcd4;border-radius:9px;background:#fff;padding:7px 9px;color:var(--ink)}.filters-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding-top:5px}.filters-head small{display:block;margin-top:2px;color:var(--muted);font-size:.63rem}.filters-head button,.filter-card button{border:0;border-radius:8px;background:#f0edff;color:#6650c8;padding:7px;cursor:pointer}.filter-card{display:grid;grid-template-columns:1.1fr .75fr 1fr auto;gap:6px;padding:9px;border:1px solid #e5e7e0;border-radius:11px;background:#fafbf8}.compare-grid,.duration-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.deadline-card{padding:12px;border-radius:12px;background:#f4f2ff}.deadline-card p{margin:4px 0 10px;color:var(--muted);font-size:.66rem;line-height:1.5}.goal-summary{display:grid;gap:4px;padding:11px;border-radius:11px;background:#f2f5ed}.goal-summary span{font-size:.68rem;line-height:1.45}.goal-issues{margin:0;padding:10px 10px 10px 28px;border-radius:11px;background:#fff2ef;color:#9a4c40;font-size:.67rem}@media(max-width:460px){.filter-card{grid-template-columns:1fr}.filter-card button{justify-self:end}.compare-grid{grid-template-columns:1fr}}
</style>
