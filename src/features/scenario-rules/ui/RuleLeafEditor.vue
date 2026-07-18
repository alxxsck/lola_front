<script setup lang="ts">
import { computed, nextTick, reactive, ref, toRaw, watch } from 'vue'
import Drawer from 'primevue/drawer'
import Message from 'primevue/message'
import type { ScenarioAuthoringEvent, ScenarioAuthoringField } from '@/shared/api/repository/scenario-authoring'
import type {
  PartialRuleLeaf,
  RuleAggregateFilterInput,
  RuleDomainContext,
  RuleDraftNode,
  RuleLeafInput,
} from '../model'
import { RULE_LIMITS } from '../model'
import { displayMoneyToBackend, formatMoneyDisplay } from '../model/money-display'

type LeafKind = PartialRuleLeaf['kind']
type PeriodUnit = 'minute' | 'hour' | 'day'

interface FilterBuffer {
  filterId?: string
  fieldKey: string
  operator: string
  value: unknown
}

interface EditorBuffer {
  kind: LeafKind
  eventCode: string
  fieldKey: string
  operator: string
  value: unknown
  filters: FilterBuffer[]
  measure: string
  period: number
  periodUnit: PeriodUnit
  unsupportedWindow: boolean
  compareOperator: string
  compareValue: unknown
  streakOperator: string
  streakValue: number
}

const props = defineProps<{
  visible: boolean
  kind: LeafKind
  context: RuleDomainContext
  node?: RuleDraftNode
  activeIssue?: { fieldPath?: string; message: string }
}>()
const emit = defineEmits<{
  apply: [leaf: RuleLeafInput]
  close: []
  'dirty-change': [dirty: boolean]
}>()

const buffer = reactive<EditorBuffer>(emptyBuffer('eventField'))
const initialSnapshot = ref('')
const error = ref('')
const title = computed(() => ({ eventField: 'Поле события запуска', eventAggregate: 'История событий', activityDayStreak: 'Активные дни' })[buffer.kind])
const events = computed(() => props.context.contract.events)
const triggerEvent = computed(() => events.value.find((event) => event.definitionId === props.context.triggerEventDefinitionId && event.code === props.context.triggerEventCode))
const selectedEvent = computed(() => buffer.kind === 'eventField' ? triggerEvent.value : events.value.find((event) => event.code === buffer.eventCode))
const selectedField = computed(() => selectedEvent.value?.fields.find((field) => field.fieldKey === buffer.fieldKey))
const fieldOperators = computed(() => selectedField.value?.capabilities.eventField.operators ?? [])
const aggregateMeasures = computed(() => selectedEvent.value?.aggregateMeasures ?? [])
const selectedMeasure = computed(() => aggregateMeasures.value.find((item) => item.measure === buffer.measure))
const measureFields = computed(() => selectedEvent.value?.fields.filter((field) => field.capabilities.aggregateMeasure.measures.includes(buffer.measure as never)) ?? [])
const selectedMeasureField = computed(() => measureFields.value.find((field) => field.fieldKey === buffer.fieldKey))
const staleDependency = computed(() => {
  if (buffer.kind === 'eventField' && buffer.fieldKey && !selectedField.value) return `Поле «${buffer.fieldKey}» больше не доступно в текущем каталоге. Выберите замену.`
  if (buffer.kind !== 'eventAggregate') return ''
  if (buffer.eventCode && !selectedEvent.value) return `Событие «${buffer.eventCode}» больше не доступно. Введённые данные сохранены.`
  if (buffer.measure && !selectedMeasure.value) return `Расчёт «${buffer.measure}» больше не поддерживается выбранным событием.`
  if (buffer.fieldKey && selectedMeasure.value?.field === 'required' && !selectedMeasureField.value) return `Поле расчёта «${buffer.fieldKey}» больше не поддерживается.`
  const missingFilter = buffer.filters.find((filter) => filter.fieldKey && !selectedFilterField(filter))
  return missingFilter ? `Поле фильтра «${missingFilter.fieldKey}» больше не доступно. Замените его или удалите фильтр.` : ''
})
const dirty = computed(() => JSON.stringify(buffer) !== initialSnapshot.value)
const needsEventValue = computed(() => !['exists', 'not_exists'].includes(buffer.operator))
const moneyNeedsCurrency = computed(() => buffer.kind === 'eventAggregate' && selectedMeasureField.value?.semanticType?.startsWith('money'))
const currencyFilters = computed(() => buffer.filters.filter((filter) => {
  const field = selectedEvent.value?.fields.find((item) => item.fieldKey === filter.fieldKey)
  return field?.semanticType === 'currency'
}))
const hasExactCurrencyFilter = computed(() => currencyFilters.value.length === 1
  && currencyFilters.value[0]?.operator === 'eq'
  && hasValue(currencyFilters.value[0]?.value))
const windowInRange = computed(() => durationMs() >= 1 && durationMs() <= RULE_LIMITS.maxWindowMs)
const canApply = computed(() => {
  if (buffer.kind === 'eventField') return Boolean(selectedField.value && fieldOperators.value.includes(buffer.operator as never) && (!needsEventValue.value || fieldValueValid(buffer.value, selectedField.value, buffer.operator === 'in')))
  if (buffer.kind === 'activityDayStreak') return Boolean(buffer.streakOperator && Number.isInteger(buffer.streakValue) && buffer.streakValue >= 0 && buffer.streakValue <= RULE_LIMITS.maxStreakDays)
  const fieldReady = selectedMeasure.value?.field !== 'required' || Boolean(selectedMeasureField.value)
  const filtersReady = buffer.filters.every((filter) => {
    const field = selectedFilterField(filter)
    return Boolean(field && field.capabilities.aggregateFilter.operators.includes(filter.operator as never) && (!needsValue(filter.operator) || fieldValueValid(filter.value, field, filter.operator === 'in')))
  })
  const compareReady = Boolean(selectedMeasure.value?.compareOperators.includes(buffer.compareOperator as never) && aggregateCompareValueValid())
  return Boolean(selectedEvent.value && selectedMeasure.value && fieldReady && !buffer.unsupportedWindow && windowInRange.value && compareReady && filtersReady && (!moneyNeedsCurrency.value || hasExactCurrencyFilter.value))
})

watch(dirty, (value) => emit('dirty-change', value), { immediate: true })

watch(() => [props.visible, props.kind, props.node] as const, ([visible]) => {
  if (!visible) return
  Object.assign(buffer, fromNode(props.kind, props.node))
  initialSnapshot.value = JSON.stringify(buffer)
  error.value = ''
}, { immediate: true })

watch(() => buffer.eventCode, () => {
  if (buffer.kind !== 'eventAggregate' || selectedEvent.value?.aggregateMeasures.some((item) => item.measure === buffer.measure)) return
  buffer.measure = ''
  buffer.fieldKey = ''
  buffer.filters = []
})

watch(() => buffer.measure, () => {
  if (buffer.kind !== 'eventAggregate') return
  if (!measureFields.value.some((field) => field.fieldKey === buffer.fieldKey)) buffer.fieldKey = ''
  if (!selectedMeasure.value?.compareOperators.includes(buffer.compareOperator as never)) buffer.compareOperator = ''
})

function emptyBuffer(kind: LeafKind): EditorBuffer {
  return {
    kind, eventCode: kind === 'eventField' ? props?.context?.triggerEventCode ?? '' : '', fieldKey: '', operator: '', value: '', filters: [], measure: '',
    period: 30, periodUnit: 'day', unsupportedWindow: false, compareOperator: '', compareValue: '', streakOperator: 'gte', streakValue: 2,
  }
}

function fromNode(kind: LeafKind, node?: RuleDraftNode): EditorBuffer {
  const value = emptyBuffer(kind)
  if (!node) return value
  const source = node.kind === 'incomplete' ? node.leaf : node
  if (!['eventField', 'eventAggregate', 'activityDayStreak'].includes(source.kind)) return value
  if (source.kind === 'eventField') Object.assign(value, { eventCode: source.eventCode ?? props.context.triggerEventCode, fieldKey: source.fieldKey ?? '', operator: source.operator ?? '', value: source.value ?? '' })
  if (source.kind === 'activityDayStreak') Object.assign(value, { streakOperator: source.compare?.operator ?? 'gte', streakValue: source.compare?.value ?? 2 })
  if (source.kind === 'eventAggregate') {
    const durationMs = source.window?.kind === 'last' ? source.window.durationMs : 1
    const [period, periodUnit] = displayDuration(durationMs)
    Object.assign(value, {
      eventCode: source.eventCode ?? '', fieldKey: source.fieldKey ?? '', measure: source.measure ?? '', filters: structuredClone(toRaw(source.filters ?? [])),
      period, periodUnit, unsupportedWindow: Boolean(source.window && source.window.kind !== 'last'), compareOperator: source.compare?.operator ?? '', compareValue: source.compare?.value ?? '',
    })
  }
  return value
}

function displayDuration(durationMs: number): [number, PeriodUnit] {
  if (durationMs % 86_400_000 === 0) return [durationMs / 86_400_000, 'day']
  if (durationMs % 3_600_000 === 0) return [durationMs / 3_600_000, 'hour']
  return [Math.max(1, durationMs / 60_000), 'minute']
}

function durationMs() {
  return buffer.period * ({ minute: 60_000, hour: 3_600_000, day: 86_400_000 } as const)[buffer.periodUnit]
}

function needsValue(operator: string) { return !['exists', 'not_exists'].includes(operator) }
function hasValue(value: unknown) { return Array.isArray(value) ? value.length > 0 : value !== '' && value !== null && value !== undefined }
function fieldValueValid(value: unknown, field: ScenarioAuthoringField, arrayRequired: boolean) {
  const values = arrayRequired ? (Array.isArray(value) ? value : []) : Array.isArray(value) || value === '' || value === undefined ? [] : [value]
  if (!values.length || values.length > RULE_LIMITS.maxLiteralArrayItems) return false
  if (field.valueType === 'number') return values.every((item) => typeof item === 'number' && Number.isFinite(item))
  if (field.valueType === 'integer') return values.every((item) => typeof item === 'number' && Number.isSafeInteger(item))
  if (field.valueType === 'boolean') return values.every((item) => typeof item === 'boolean')
  return values.every((item) => typeof item === 'string' && item.length <= RULE_LIMITS.maxLiteralStringLength && (!field.allowedValues || field.allowedValues.includes(item)))
}
function operatorLabel(operator: string) {
  return ({ eq: 'равно', neq: 'не равно', gt: 'больше', gte: 'не меньше', lt: 'меньше', lte: 'не больше', in: 'в списке', exists: 'существует', not_exists: 'не существует' } as Record<string, string>)[operator] ?? operator
}
function measureLabel(measure: string) {
  return ({ exists: 'Есть хотя бы одно событие', count: 'Количество событий', sum: 'Сумма поля', min: 'Минимум поля', max: 'Максимум поля', first: 'Первое событие', last: 'Последнее событие' } as Record<string, string>)[measure] ?? measure
}
function fieldLabel(field: ScenarioAuthoringField) {
  return [field.label, field.unit, field.sensitive ? 'чувствительные данные' : ''].filter(Boolean).join(' · ')
}
function fieldOptions(event: ScenarioAuthoringEvent | undefined, capability: 'eventField' | 'aggregateFilter') {
  return event?.fields.filter((field) => field.capabilities[capability].operators.length) ?? []
}
function selectedFilterField(filter: FilterBuffer) { return selectedEvent.value?.fields.find((field) => field.fieldKey === filter.fieldKey) }
function isMoneyField(field?: ScenarioAuthoringField) { return Boolean(field?.semanticType?.includes('money')) }
function displayValue(value: unknown, field?: ScenarioAuthoringField) {
  return isMoneyField(field) ? formatMoneyDisplay(value, field?.display?.scale ?? 1, field?.display?.precision) : value
}
function displayListText(value: unknown, field?: ScenarioAuthoringField) {
  return Array.isArray(value) ? value.map((item) => displayValue(item, field)).join(', ') : ''
}
function backendValue(value: string, field?: ScenarioAuthoringField): unknown {
  if (value === '') return ''
  const raw = isMoneyField(field) ? displayMoneyToBackend(value, field?.display?.scale ?? 1) : value
  if (raw === null) return value
  if (field?.valueType === 'number' || field?.valueType === 'integer') return Number(raw)
  if (field?.valueType === 'boolean') return raw === 'true'
  return raw
}
function selectValue(value: string, field: ScenarioAuthoringField | undefined): unknown {
  return backendValue(value, field)
}
function selectValues(event: Event, field: ScenarioAuthoringField | undefined) {
  return Array.from((event.target as HTMLSelectElement).selectedOptions, (option) => selectValue(option.value, field))
}
function listValues(event: Event, field: ScenarioAuthoringField | undefined) {
  return (event.target as HTMLInputElement).value.split(',').map((value) => value.trim()).filter(Boolean).map((value) => backendValue(value, field))
}
function inputValue(event: Event, field?: ScenarioAuthoringField) { return selectValue((event.target as HTMLInputElement).value, field) }
function compareInputValue(event: Event) {
  const value = (event.target as HTMLInputElement).value
  if (value === '') return ''
  if (isMoneyField(selectedMeasureField.value)) return displayMoneyToBackend(value, selectedMeasureField.value?.display?.scale ?? 1) ?? value
  return ['integer', 'field'].includes(selectedMeasure.value?.compareValueType ?? '') ? Number(value) : value
}
function aggregateCompareValueValid() {
  const value = buffer.compareValue
  if (selectedMeasure.value?.compareValueType === 'boolean') return typeof value === 'boolean'
  if (['first', 'last'].includes(buffer.measure)) return typeof value === 'string' && Number.isFinite(Date.parse(value))
  const semanticType = selectedMeasureField.value?.semanticType
  if (semanticType?.startsWith('money')) {
    return typeof value === 'string' && /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value)
      && (selectedMeasureField.value?.valueType !== 'integer' || !value.includes('.'))
  }
  if (selectedMeasure.value?.compareValueType === 'integer') return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
  if (selectedMeasure.value?.compareValueType === 'field') {
    return selectedMeasureField.value?.valueType === 'integer'
      ? typeof value === 'number' && Number.isSafeInteger(value)
      : typeof value === 'number' && Number.isFinite(value)
  }
  return hasValue(value)
}
function addFilter() { if (buffer.filters.length < RULE_LIMITS.maxFilters) buffer.filters.push({ fieldKey: '', operator: '', value: '' }) }
function removeFilter(index: number) { buffer.filters.splice(index, 1) }

function buildLeaf(): RuleLeafInput | null {
  if (!canApply.value) return null
  if (buffer.kind === 'eventField') return {
    kind: 'eventField', eventCode: props.context.triggerEventCode, fieldKey: buffer.fieldKey,
    operator: buffer.operator, ...(needsEventValue.value ? { value: buffer.value } : {}),
  } as RuleLeafInput
  if (buffer.kind === 'activityDayStreak') return { kind: 'activityDayStreak', compare: { operator: buffer.streakOperator, value: buffer.streakValue } } as RuleLeafInput
  return {
    kind: 'eventAggregate', eventCode: buffer.eventCode, measure: buffer.measure, ...(buffer.fieldKey ? { fieldKey: buffer.fieldKey } : {}),
    filters: buffer.filters.map((filter): RuleAggregateFilterInput => ({
      ...(filter.filterId ? { filterId: filter.filterId } : {}), fieldKey: filter.fieldKey, operator: filter.operator as RuleAggregateFilterInput['operator'],
      ...(needsValue(filter.operator) ? { value: filter.value as never } : {}),
    })),
    window: { kind: 'last', boundary: 'beforeTrigger', durationMs: durationMs() },
    compare: { operator: buffer.compareOperator, value: buffer.compareValue },
  } as RuleLeafInput
}

function apply() {
  const leaf = buildLeaf()
  if (!leaf) { error.value = moneyNeedsCurrency.value && !hasExactCurrencyFilter.value ? 'Для денежной суммы нужен ровно один фильтр валюты с условием «равно».' : 'Заполните обязательные поля условия.'; return }
  emit('apply', leaf)
}

function close() {
  if (dirty.value && !window.confirm('Отменить неприменённые изменения условия?')) return
  emit('close')
}

function focusFirst() { void nextTick(() => document.querySelector<HTMLElement>('.rule-leaf-drawer select, .rule-leaf-drawer input')?.focus()) }
function issueMatches(...fieldPaths: string[]) { return Boolean(props.activeIssue?.fieldPath && fieldPaths.some((path) => path === props.activeIssue?.fieldPath || (path.endsWith('.') && props.activeIssue?.fieldPath?.startsWith(path)))) }
function issueDescription(...fieldPaths: string[]) { return issueMatches(...fieldPaths) ? 'rule-leaf-active-issue' : undefined }
</script>

<template>
  <Drawer :visible="visible" position="right" class="rule-leaf-drawer" :dismissable="false" @show="focusFirst" @update:visible="!$event && close()">
    <template #header><div class="drawer-title"><small>Условия запуска</small><h2>{{ title }}</h2></div></template>
    <form class="leaf-form" @submit.prevent="apply">
      <Message v-if="activeIssue" id="rule-leaf-active-issue" severity="error" :closable="false">{{ activeIssue.message }}</Message>
      <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
      <Message v-if="staleDependency" severity="warn" :closable="false">{{ staleDependency }}</Message>
      <Message v-if="buffer.unsupportedWindow" severity="warn" :closable="false">Этот период относится к повторной проверке и недоступен в начальных условиях. Отмените редактирование или замените условие.</Message>

      <template v-if="buffer.kind === 'eventField'">
        <section><span class="section-number">1</span><div><h3>Событие запуска</h3><p>Событие запуска: {{ triggerEvent?.name ?? context.triggerEventCode }}</p><code>{{ context.triggerEventCode }}</code></div></section>
        <section class="form-section"><span class="section-number">2</span><div class="section-fields">
          <div class="field"><label for="trigger-field">Какое поле проверить?</label><select id="trigger-field" v-model="buffer.fieldKey" aria-label="Поле события запуска" :aria-invalid="issueMatches('fieldKey')" :aria-describedby="issueDescription('fieldKey')"><option value="">Выберите поле</option><option v-if="buffer.fieldKey && !selectedField" :value="buffer.fieldKey">Недоступно · {{ buffer.fieldKey }}</option><option v-for="field in fieldOptions(triggerEvent, 'eventField')" :key="field.fieldKey" :value="field.fieldKey">{{ fieldLabel(field) }}</option></select><small v-if="selectedField?.description">{{ selectedField.description }}</small></div>
          <div v-if="selectedField" class="field"><label for="trigger-operator">Как сравнить?</label><select id="trigger-operator" v-model="buffer.operator" :aria-label="`Оператор поля ${selectedField.label}`" :aria-invalid="issueMatches('operator')" :aria-describedby="issueDescription('operator')"><option value="">Выберите оператор</option><option v-for="operator in fieldOperators" :key="operator" :value="operator">{{ operatorLabel(operator) }}</option></select></div>
          <div v-if="selectedField && buffer.operator && needsEventValue" class="field"><label>С каким значением?</label><select v-if="selectedField.allowedValues?.length && buffer.operator === 'in'" multiple :value="Array.isArray(buffer.value) ? buffer.value.map(String) : []" :aria-label="`Значение поля ${selectedField.label}`" :aria-invalid="issueMatches('value')" :aria-describedby="issueDescription('value')" @change="buffer.value = selectValues($event, selectedField)"><option v-for="value in selectedField.allowedValues" :key="String(value)" :value="String(value)">{{ displayValue(value, selectedField) }}</option></select><select v-else-if="selectedField.allowedValues?.length" :value="buffer.value" :aria-label="`Значение поля ${selectedField.label}`" :aria-invalid="issueMatches('value')" :aria-describedby="issueDescription('value')" @change="buffer.value = selectValue(($event.target as HTMLSelectElement).value, selectedField)"><option value="">Выберите значение</option><option v-for="value in selectedField.allowedValues" :key="String(value)" :value="String(value)">{{ displayValue(value, selectedField) }}</option></select><input v-else-if="buffer.operator === 'in'" :value="displayListText(buffer.value, selectedField)" type="text" placeholder="Значения через запятую" :aria-label="`Значение поля ${selectedField.label}`" :aria-invalid="issueMatches('value')" :aria-describedby="issueDescription('value')" @input="buffer.value = listValues($event, selectedField)" /><input v-else :value="displayValue(buffer.value, selectedField)" :type="selectedField.valueType === 'number' || selectedField.valueType === 'integer' ? 'number' : 'text'" :step="isMoneyField(selectedField) ? 'any' : selectedField.valueType === 'integer' ? 1 : 'any'" :aria-label="`Значение поля ${selectedField.label}`" :aria-invalid="issueMatches('value')" :aria-describedby="issueDescription('value')" @input="buffer.value = inputValue($event, selectedField)" /><small v-if="buffer.operator === 'in'">Можно выбрать несколько значений.</small><small v-if="isMoneyField(selectedField)">Введите показываемую сумму. В черновике она хранится в единице «{{ selectedField.unit }}» с масштабом {{ selectedField.display?.scale ?? 1 }}.</small><small v-else-if="selectedField.unit">Единица: {{ selectedField.unit }}.</small><small v-if="selectedField.sensitive">Поле помечено как чувствительное. Предпросмотр может скрыть фактическое значение.</small></div>
        </div></section>
      </template>

      <template v-else-if="buffer.kind === 'eventAggregate'">
        <section class="form-section"><span class="section-number">1</span><div class="section-fields"><h3>Какое событие?</h3><div class="field"><label for="history-event">Событие из истории</label><select id="history-event" v-model="buffer.eventCode" aria-label="Событие из истории" :aria-invalid="issueMatches('eventCode')" :aria-describedby="issueDescription('eventCode')"><option value="">Выберите событие</option><option v-if="buffer.eventCode && !selectedEvent" :value="buffer.eventCode">Недоступно · {{ buffer.eventCode }}</option><option v-for="event in events" :key="event.code" :value="event.code">{{ event.name }} · {{ event.code }}</option></select></div>
          <div v-if="selectedEvent" class="filters"><header><div><h4>Какие записи учитывать?</h4><p>Фильтры применяются к payload выбранного события.</p></div><button type="button" aria-label="Добавить фильтр события" :disabled="buffer.filters.length >= RULE_LIMITS.maxFilters" @click="addFilter"><i class="pi pi-plus" /> Фильтр</button></header>
            <div v-for="(filter, index) in buffer.filters" :key="filter.filterId ?? index" class="filter-row"><select v-model="filter.fieldKey" :aria-label="`Поле фильтра ${index + 1}`" :aria-invalid="issueMatches(`filters.${index}.fieldKey`)" :aria-describedby="issueDescription(`filters.${index}.fieldKey`)"><option value="">Поле</option><option v-if="filter.fieldKey && !selectedFilterField(filter)" :value="filter.fieldKey">Недоступно · {{ filter.fieldKey }}</option><option v-for="field in fieldOptions(selectedEvent, 'aggregateFilter')" :key="field.fieldKey" :value="field.fieldKey">{{ fieldLabel(field) }}</option></select><select v-model="filter.operator" :aria-label="`Оператор фильтра ${index + 1}`" :aria-invalid="issueMatches(`filters.${index}.operator`)" :aria-describedby="issueDescription(`filters.${index}.operator`)"><option value="">Оператор</option><option v-for="operator in selectedFilterField(filter)?.capabilities.aggregateFilter.operators ?? []" :key="operator" :value="operator">{{ operatorLabel(operator) }}</option></select><template v-if="needsValue(filter.operator)"><select v-if="selectedFilterField(filter)?.allowedValues?.length && filter.operator === 'in'" multiple :value="Array.isArray(filter.value) ? filter.value.map(String) : []" :aria-label="`Значение фильтра ${index + 1}`" :aria-invalid="issueMatches(`filters.${index}.value`)" :aria-describedby="issueDescription(`filters.${index}.value`)" @change="filter.value = selectValues($event, selectedFilterField(filter))"><option v-for="value in selectedFilterField(filter)?.allowedValues" :key="String(value)" :value="String(value)">{{ displayValue(value, selectedFilterField(filter)) }}</option></select><select v-else-if="selectedFilterField(filter)?.allowedValues?.length" :value="filter.value" :aria-label="`Значение фильтра ${index + 1}`" :aria-invalid="issueMatches(`filters.${index}.value`)" :aria-describedby="issueDescription(`filters.${index}.value`)" @change="filter.value = selectValue(($event.target as HTMLSelectElement).value, selectedFilterField(filter))"><option value="">Значение</option><option v-for="value in selectedFilterField(filter)?.allowedValues" :key="String(value)" :value="String(value)">{{ displayValue(value, selectedFilterField(filter)) }}</option></select><input v-else-if="filter.operator === 'in'" :value="displayListText(filter.value, selectedFilterField(filter))" placeholder="Через запятую" :aria-label="`Значение фильтра ${index + 1}`" :aria-invalid="issueMatches(`filters.${index}.value`)" :aria-describedby="issueDescription(`filters.${index}.value`)" @input="filter.value = listValues($event, selectedFilterField(filter))" /><input v-else :value="displayValue(filter.value, selectedFilterField(filter))" :type="['number', 'integer'].includes(selectedFilterField(filter)?.valueType ?? '') ? 'number' : 'text'" :step="isMoneyField(selectedFilterField(filter)) ? 'any' : selectedFilterField(filter)?.valueType === 'integer' ? 1 : 'any'" :aria-label="`Значение фильтра ${index + 1}`" :aria-invalid="issueMatches(`filters.${index}.value`)" :aria-describedby="issueDescription(`filters.${index}.value`)" @input="filter.value = inputValue($event, selectedFilterField(filter))" /></template><span v-else class="no-value">Без значения</span><button type="button" class="icon-button danger" :aria-label="`Удалить фильтр ${index + 1}`" @click="removeFilter(index)"><i class="pi pi-trash" /></button></div>
          </div></div></section>
        <section v-if="selectedEvent" class="form-section"><span class="section-number">2</span><div class="section-fields"><h3>Что посчитать?</h3><div class="field"><label for="aggregate-measure">Расчёт</label><select id="aggregate-measure" v-model="buffer.measure" aria-label="Что посчитать" :aria-invalid="issueMatches('measure')" :aria-describedby="issueDescription('measure')"><option value="">Выберите расчёт</option><option v-if="buffer.measure && !selectedMeasure" :value="buffer.measure">Недоступно · {{ buffer.measure }}</option><option v-for="capability in aggregateMeasures" :key="capability.measure" :value="capability.measure">{{ measureLabel(capability.measure) }}</option></select></div><div v-if="selectedMeasure?.field === 'required'" class="field"><label for="measure-field">Поле для расчёта</label><select id="measure-field" v-model="buffer.fieldKey" aria-label="Поле для расчёта" :aria-invalid="issueMatches('fieldKey')" :aria-describedby="issueDescription('fieldKey')"><option value="">Выберите поле</option><option v-if="buffer.fieldKey && !selectedMeasureField" :value="buffer.fieldKey">Недоступно · {{ buffer.fieldKey }}</option><option v-for="field in measureFields" :key="field.fieldKey" :value="field.fieldKey">{{ fieldLabel(field) }}</option></select></div><Message v-if="moneyNeedsCurrency && !hasExactCurrencyFilter" severity="warn" :closable="false">Добавьте ровно один фильтр валюты с условием «равно»: денежные значения нельзя смешивать между валютами.</Message></div></section>
        <section v-if="selectedMeasure" class="form-section"><span class="section-number">3</span><div class="section-fields"><h3>За какой период?</h3><div class="period-row"><div class="field"><label for="history-period">Последние</label><input id="history-period" v-model.number="buffer.period" type="number" min="1" aria-label="Период истории" :aria-invalid="!windowInRange || issueMatches('window.', 'window')" :aria-describedby="issueMatches('window.', 'window') ? 'history-period-help rule-leaf-active-issue' : 'history-period-help'" /></div><div class="field"><label for="history-unit">Единица</label><select id="history-unit" v-model="buffer.periodUnit" aria-label="Единица периода"><option value="minute">минут</option><option value="hour">часов</option><option value="day">дней</option></select></div></div><p id="history-period-help" class="help">История заканчивается перед событием запуска и не включает его. Максимум — {{ RULE_LIMITS.maxWindowMs / 86_400_000 }} дней; «с момента запуска» для начальной проверки недоступно.</p></div></section>
        <section v-if="selectedMeasure" class="form-section"><span class="section-number">4</span><div class="section-fields"><h3>Какой результат нужен?</h3><div class="compare-row"><div class="field"><label for="compare-operator">Сравнение</label><select id="compare-operator" v-model="buffer.compareOperator" aria-label="Сравнение результата" :aria-invalid="issueMatches('compare.operator')" :aria-describedby="issueDescription('compare.operator')"><option value="">Выберите</option><option v-for="operator in selectedMeasure.compareOperators" :key="operator" :value="operator">{{ operatorLabel(operator) }}</option></select></div><div class="field"><label for="compare-value">Значение</label><select v-if="selectedMeasure.compareValueType === 'boolean'" id="compare-value" v-model="buffer.compareValue" aria-label="Значение сравнения" :aria-invalid="issueMatches('compare.value')" :aria-describedby="issueDescription('compare.value')"><option value="">Выберите</option><option :value="true">Да</option><option :value="false">Нет</option></select><input v-else id="compare-value" :value="isMoneyField(selectedMeasureField) ? displayValue(buffer.compareValue, selectedMeasureField) : buffer.compareValue" :type="isMoneyField(selectedMeasureField) ? 'text' : ['integer', 'field'].includes(selectedMeasure.compareValueType) ? 'number' : 'datetime-local'" :inputmode="isMoneyField(selectedMeasureField) ? 'decimal' : undefined" aria-label="Значение сравнения" :aria-invalid="issueMatches('compare.value')" :aria-describedby="issueDescription('compare.value')" @input="buffer.compareValue = compareInputValue($event)" /><small v-if="isMoneyField(selectedMeasureField)">Введите показываемую сумму. В черновике сохраняется точное значение в единице «{{ selectedMeasureField?.unit }}» с масштабом {{ selectedMeasureField?.display?.scale ?? 1 }}.</small><small v-else-if="selectedMeasureField?.unit">Единица: {{ selectedMeasureField.unit }}</small></div></div></div></section>
      </template>

      <template v-else>
        <section><span class="section-number">1</span><div><h3>Серия активных дней</h3><p>Activity Day учитывает продуктовую активность, а не техническое переподключение.</p></div></section>
        <section class="form-section"><span class="section-number">2</span><div class="section-fields"><div class="compare-row"><div class="field"><label for="streak-operator">Сравнение</label><select id="streak-operator" v-model="buffer.streakOperator" aria-label="Сравнение серии активных дней" :aria-invalid="issueMatches('compare.operator')" :aria-describedby="issueDescription('compare.operator')"><option value="eq">равно</option><option value="neq">не равно</option><option value="gt">больше</option><option value="gte">не меньше</option><option value="lt">меньше</option><option value="lte">не больше</option></select></div><div class="field"><label for="streak-value">Дней подряд</label><input id="streak-value" v-model.number="buffer.streakValue" type="number" min="0" :max="RULE_LIMITS.maxStreakDays" aria-label="Количество активных дней подряд" :aria-invalid="issueMatches('compare.value')" :aria-describedby="issueDescription('compare.value')" /></div></div></div></section>
      </template>

      <footer class="drawer-actions"><button type="button" class="secondary" aria-label="Отменить редактирование условия" @click="close">Отмена</button><button type="submit" class="primary" aria-label="Применить условие" :disabled="!canApply">Применить</button></footer>
    </form>
  </Drawer>
</template>

<style scoped>
.drawer-title small{color:var(--text-small-muted);font-size:.64rem;text-transform:uppercase;letter-spacing:.1em}.drawer-title h2{margin-top:3px;font-size:1.05rem}.leaf-form{display:flex;flex-direction:column;gap:14px;min-height:100%}.leaf-form>section{display:grid;grid-template-columns:28px minmax(0,1fr);gap:11px;padding:14px;border:1px solid var(--line);border-radius:14px;background:var(--surface-subtle)}.section-number{display:grid;place-items:center;width:28px;height:28px;border-radius:9px;background:var(--status-violet-soft);color:var(--status-violet-text);font-size:.65rem;font-weight:800}.leaf-form h3,.leaf-form h4{margin:0}.leaf-form h3{font-size:.82rem}.leaf-form h4{font-size:.72rem}.leaf-form p{margin:4px 0 0;color:var(--text-small-muted);font-size:.67rem}.leaf-form code{display:block;margin-top:5px;color:var(--text-secondary);font-size:.63rem}.section-fields{display:flex;flex-direction:column;gap:12px;min-width:0}.field{display:flex;flex-direction:column;gap:6px;min-width:0}.field label{font-size:.7rem;font-weight:700;color:var(--text-secondary)}.field small{color:var(--text-small-muted);font-size:.63rem}.leaf-form select,.leaf-form input{width:100%;min-width:0;border:1px solid var(--border-default);border-radius:10px;background:var(--surface-card);padding:9px 10px;color:var(--ink);font:inherit;font-size:.72rem}.filters{padding:11px;border:1px solid var(--border-default);border-radius:12px;background:var(--surface-card)}.filters>header{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}.filters>header button{border:0;border-radius:8px;background:var(--status-violet-soft);color:var(--status-violet-text);padding:7px;font-size:.65rem;font-weight:700}.filter-row{display:grid;grid-template-columns:1fr .85fr 1fr 30px;gap:6px;margin-top:9px}.icon-button{display:grid;place-items:center;border:0;border-radius:8px;background:transparent;color:var(--text-secondary);cursor:pointer}.icon-button.danger{color:var(--status-danger-text)}.no-value{align-self:center;color:var(--text-small-muted);font-size:.64rem}.period-row,.compare-row{display:grid;grid-template-columns:1fr 1fr;gap:9px}.help{padding:9px;border-radius:9px;background:var(--surface-subtle);color:var(--text-secondary)!important}.drawer-actions{position:sticky;bottom:0;display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:auto;padding:12px 0 2px;background:var(--surface-card)}.drawer-actions button{min-height:42px;border-radius:11px;font-weight:700;cursor:pointer}.drawer-actions .secondary{border:1px solid var(--line);background:var(--surface-card);color:var(--text-secondary)}.drawer-actions .primary{border:1px solid var(--action-primary);background:var(--action-primary);color:var(--on-action-primary)}.drawer-actions .primary:disabled{opacity:.45;cursor:not-allowed}
:global(.rule-leaf-drawer){width:min(460px,100vw)!important}:global(.rule-leaf-drawer .p-drawer-content){padding-top:4px}@media(max-width:767px){:global(.rule-leaf-drawer){width:100vw!important;height:100dvh!important;max-height:100dvh!important;border-radius:0!important}:global(.rule-leaf-drawer .p-drawer-content){padding:0 14px 14px}}
@media(max-width:390px){.leaf-form>section{grid-template-columns:1fr;padding:12px}.section-number{width:24px;height:24px}.filter-row{grid-template-columns:1fr 1fr 30px}.filter-row>*:nth-child(3){grid-column:1/3}.filter-row>.icon-button{grid-column:3;grid-row:1}.period-row,.compare-row{grid-template-columns:1fr}.drawer-actions{padding-bottom:max(4px,env(safe-area-inset-bottom))}}
</style>
