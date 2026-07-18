<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import type { AudienceAttributeResponseDto, SegmentSummaryResponseDto } from '@/shared/api/repository/scenario-authoring'
import type { AudienceDomainContext, AudienceLeafDraftNode, AudienceLeafInput, AudienceLeafKind, AudienceLiteral } from '../model'

const props = defineProps<{
  kind: AudienceLeafKind
  context: AudienceDomainContext
  segmentSearch?: (query: string) => Promise<SegmentSummaryResponseDto[]>
  node?: AudienceLeafDraftNode
  activeIssue?: { fieldPath?: string; message: string }
}>()
const emit = defineEmits<{
  apply: [leaf: AudienceLeafInput]
  close: []
  dirtyChange: [dirty: boolean]
}>()

interface Buffer {
  kind: AudienceLeafKind
  operator: string
  value: AudienceLiteral | undefined
  definitionId: string
  segmentId: string
}

function cloneLiteral(value: AudienceLiteral | undefined): AudienceLiteral | undefined {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value)) as AudienceLiteral
}

function initialBuffer(): Buffer {
  const node = props.node
  if (node?.kind === 'userAttribute') return { kind: node.kind, operator: node.operator, value: cloneLiteral(node.value), definitionId: node.definitionId, segmentId: '' }
  if (node?.kind === 'segmentMembership') return { kind: node.kind, operator: node.operator, value: undefined, definitionId: '', segmentId: node.segmentId }
  if (node && (node.kind === 'locale' || node.kind === 'language' || node.kind === 'country')) return { kind: node.kind, operator: node.operator, value: cloneLiteral(node.value), definitionId: '', segmentId: '' }
  return { kind: props.kind, operator: props.kind === 'segmentMembership' ? 'is_member' : 'eq', value: undefined, definitionId: '', segmentId: '' }
}

const buffer = reactive<Buffer>(initialBuffer())
const baseline = JSON.stringify(buffer)
const segmentQuery = ref('')
const segmentOptions = ref<SegmentSummaryResponseDto[]>([...props.context.segments])
const segmentLoading = ref(false)
const segmentError = ref('')
const dialog = ref<HTMLElement | null>(null)
const selectedAttribute = computed(() => props.context.catalog.attributes.find((attribute) => attribute.definitionId === buffer.definitionId))
const selectedSegment = computed(() => [...props.context.segments, ...segmentOptions.value].find((segment) => segment.segmentId === buffer.segmentId && segment.status === 'ACTIVE'))
const localeOptions = computed(() => buffer.kind === 'language'
  ? [...new Map(props.context.catalog.locales.map((locale) => [locale.language, { value: locale.language, label: locale.language }])).values()]
  : props.context.catalog.locales.map((locale) => ({ value: locale.code, label: locale.label })))
const operators = computed(() => {
  if (buffer.kind === 'locale') return props.context.catalog.localeSource.operators
  if (buffer.kind === 'language') return props.context.catalog.languageSource.operators
  if (buffer.kind === 'country') return props.context.catalog.country.operators
  if (buffer.kind === 'userAttribute') return selectedAttribute.value?.operators ?? []
  return props.context.catalog.segmentSource.operators
})
const needsValue = computed(() => !['exists', 'not_exists', 'is_member', 'is_not_member'].includes(buffer.operator))
const valueIsValid = computed(() => !needsValue.value || (buffer.operator === 'in'
  ? Array.isArray(buffer.value) && buffer.value.length > 0
  : !Array.isArray(buffer.value) && buffer.value !== undefined && buffer.value !== ''))
const canApply = computed(() => {
  if (!operators.value.includes(buffer.operator as never) || !valueIsValid.value) return false
  if (buffer.kind === 'userAttribute') return Boolean(selectedAttribute.value)
  if (buffer.kind === 'segmentMembership') return Boolean(selectedSegment.value?.currentRevision)
  return true
})

watch(buffer, () => emit('dirtyChange', JSON.stringify(buffer) !== baseline), { deep: true })
watch(() => buffer.definitionId, () => {
  const attribute = selectedAttribute.value
  if (!attribute) return
  if (!attribute.operators.includes(buffer.operator)) buffer.operator = attribute.operators[0] ?? 'eq'
  buffer.value = undefined
})
watch(() => buffer.operator, (operator) => {
  if (operator === 'exists' || operator === 'not_exists') buffer.value = undefined
  else if (operator === 'in' && !Array.isArray(buffer.value)) buffer.value = buffer.value === undefined || buffer.value === '' ? [] : [buffer.value]
  else if (operator !== 'in' && Array.isArray(buffer.value)) buffer.value = buffer.value[0]
})

onMounted(() => void nextTick(() => {
  const selector = props.activeIssue?.fieldPath === 'definitionId' ? '[aria-label="Атрибут пользователя"]'
    : props.activeIssue?.fieldPath === 'segmentId' ? '[aria-label="Сегмент аудитории"]'
      : props.activeIssue?.fieldPath === 'operator' ? 'select[aria-label^="Оператор"], select[aria-label^="Проверка"]'
        : props.activeIssue?.fieldPath === 'value' ? '[aria-label^="Значение"], [aria-label^="ISO-код"]'
          : 'select, input, button'
  dialog.value?.querySelector<HTMLElement>(selector)?.focus()
}))

function trapFocus(event: KeyboardEvent) {
  const controls = [...(dialog.value?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])]
  const first = controls[0]
  const last = controls.at(-1)
  if (!first || !last) return
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}

function attributeValue(value: string, attribute: AudienceAttributeResponseDto) {
  const values = buffer.operator === 'in' ? value.split(',').map((item) => item.trim()).filter(Boolean) : [value]
  const converted = values.map((item) => attribute.valueType === 'number' ? Number(item) : attribute.valueType === 'boolean' ? item === 'true' : item)
  buffer.value = buffer.operator === 'in' ? converted : value === '' ? undefined : converted[0]
}

function selectedValues(event: Event, attribute?: AudienceAttributeResponseDto) {
  const selected = Array.from((event.target as HTMLSelectElement).selectedOptions, (option) => option.value)
  if (!attribute) {
    buffer.value = selected
    return
  }
  buffer.value = selected.map((value) => attribute.allowedValues?.find((candidate) => String(candidate) === value)
    ?? (attribute.valueType === 'boolean' ? value === 'true' : attribute.valueType === 'number' ? Number(value) : value))
}

function countryValue(value: string) {
  const upper = value.toUpperCase()
  buffer.value = buffer.operator === 'in'
    ? upper.split(',').map((item) => item.trim()).filter(Boolean)
    : upper
}

async function searchSegments() {
  if (!props.segmentSearch) return
  segmentLoading.value = true
  segmentError.value = ''
  try {
    segmentOptions.value = await props.segmentSearch(segmentQuery.value.trim())
  } catch (cause) {
    segmentError.value = cause instanceof Error ? cause.message : 'Не удалось найти сегменты'
  } finally {
    segmentLoading.value = false
  }
}

function apply() {
  if (!canApply.value) return
  if (buffer.kind === 'segmentMembership') {
    const revision = selectedSegment.value?.currentRevision
    if (!revision) return
    emit('apply', { kind: 'segmentMembership', segmentId: buffer.segmentId, segmentRevisionId: revision.segmentRevisionId, operator: buffer.operator as 'is_member' | 'is_not_member' })
    return
  }
  if (buffer.kind === 'userAttribute') {
    emit('apply', { kind: 'userAttribute', definitionId: buffer.definitionId, operator: buffer.operator as never, ...(needsValue.value ? { value: cloneLiteral(buffer.value) } : {}) })
    return
  }
  emit('apply', { kind: buffer.kind, operator: buffer.operator as never, ...(needsValue.value ? { value: cloneLiteral(buffer.value) as string | string[] } : {}) } as AudienceLeafInput)
}

function segmentLabel(segment: SegmentSummaryResponseDto) {
  return `${segment.name} · v${segment.currentRevision?.revision ?? '—'}`
}
</script>

<template>
  <div class="leaf-backdrop" role="presentation" @mousedown.self="emit('close')">
    <aside ref="dialog" class="leaf-editor" role="dialog" aria-modal="true" aria-labelledby="audience-leaf-title" @keydown.esc="emit('close')" @keydown.tab="trapFocus">
      <header><div><span>Условие аудитории</span><h3 id="audience-leaf-title">{{ { locale: 'Locale', language: 'Язык', country: 'Страна', userAttribute: 'Атрибут пользователя', segmentMembership: 'Сегмент' }[kind] }}</h3></div><button type="button" aria-label="Закрыть редактор условия аудитории" @click="emit('close')"><i class="pi pi-times" /></button></header>
      <p class="intro">Условие проверяется backend по текущему состоянию End User при старте Run. JSON и raw paths не используются.</p>
      <div v-if="activeIssue" id="audience-active-issue" class="active-issue" role="alert"><i class="pi pi-exclamation-circle" /> {{ activeIssue.message }}</div>

      <label v-if="kind === 'userAttribute'" class="field"><span>Атрибут</span><select v-model="buffer.definitionId" aria-label="Атрибут пользователя" :aria-invalid="activeIssue?.fieldPath === 'definitionId'"><option value="">Выберите атрибут</option><option v-for="attribute in context.catalog.attributes" :key="attribute.definitionId" :value="attribute.definitionId">{{ attribute.label }} · v{{ attribute.revision }}</option></select><small v-if="selectedAttribute?.description">{{ selectedAttribute.description }}</small></label>
      <div v-if="kind === 'segmentMembership'" class="field"><span>Сегмент</span><form v-if="segmentSearch" class="segment-search" @submit.prevent="searchSegments"><input v-model="segmentQuery" aria-label="Поиск сегмента аудитории" maxlength="128" placeholder="Название или ключ"><button type="submit" :disabled="segmentLoading">{{ segmentLoading ? 'Ищем…' : 'Найти' }}</button></form><small v-if="segmentError" class="field-error" role="alert">{{ segmentError }}</small><select v-model="buffer.segmentId" aria-label="Сегмент аудитории" :aria-invalid="activeIssue?.fieldPath === 'segmentId'"><option value="">Выберите опубликованный сегмент</option><option v-for="segment in segmentOptions.filter((item) => item.status === 'ACTIVE' && item.currentRevision)" :key="segment.segmentId" :value="segment.segmentId">{{ segmentLabel(segment) }}</option></select><small v-if="selectedSegment?.currentRevision">Версия {{ selectedSegment.currentRevision.revision }} будет закреплена в опубликованном сценарии. Новая версия сегмента не изменит уже опубликованный contract.</small></div>

      <label class="field"><span>Проверка</span><select v-model="buffer.operator" :aria-label="kind === 'userAttribute' ? `Оператор атрибута ${selectedAttribute?.label ?? ''}` : kind === 'segmentMembership' ? 'Проверка членства в сегменте' : `Оператор ${kind === 'language' ? 'языка' : kind}`" :aria-invalid="activeIssue?.fieldPath === 'operator'"><option v-for="operator in operators" :key="operator" :value="operator">{{ { eq: 'Равно', neq: 'Не равно', gt: 'Больше', gte: 'Не меньше', lt: 'Меньше', lte: 'Не больше', in: 'Одно из', exists: 'Заполнено', not_exists: 'Не заполнено', is_member: 'Входит в сегмент', is_not_member: 'Не входит в сегмент' }[operator] ?? operator }}</option></select></label>

      <label v-if="needsValue && (kind === 'locale' || kind === 'language')" class="field"><span>{{ buffer.operator === 'in' ? 'Значения' : 'Значение' }}</span><select v-if="buffer.operator === 'in'" multiple :aria-label="`Значения ${kind === 'language' ? 'языка' : 'locale'}`" :aria-invalid="activeIssue?.fieldPath === 'value'" @change="selectedValues"><option v-for="option in localeOptions" :key="option.value" :value="option.value" :selected="Array.isArray(buffer.value) && buffer.value.includes(option.value)">{{ option.label }}</option></select><select v-else v-model="buffer.value" :aria-label="`Значение ${kind === 'language' ? 'языка' : 'locale'}`" :aria-invalid="activeIssue?.fieldPath === 'value'" :aria-describedby="activeIssue?.fieldPath === 'value' ? 'audience-active-issue' : undefined"><option :value="undefined">Выберите значение</option><option v-for="option in localeOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select><small v-if="buffer.operator === 'in'">Можно выбрать несколько значений.</small></label>
      <label v-if="needsValue && kind === 'country'" class="field"><span>{{ buffer.operator === 'in' ? 'Страны' : 'Страна' }}</span><input :value="Array.isArray(buffer.value) ? buffer.value.join(', ') : buffer.value" :maxlength="buffer.operator === 'in' ? 256 : 2" :aria-label="buffer.operator === 'in' ? 'ISO-коды стран' : 'ISO-код страны'" :placeholder="buffer.operator === 'in' ? 'ES, PT' : 'ES'" :aria-invalid="activeIssue?.fieldPath === 'value'" :aria-describedby="activeIssue?.fieldPath === 'value' ? 'audience-active-issue' : 'country-help'" @input="countryValue(($event.target as HTMLInputElement).value)"><small id="country-help">Двухбуквенные ISO 3166-1 alpha-2 коды в верхнем регистре<span v-if="buffer.operator === 'in'"> через запятую</span>.</small></label>
      <label v-if="needsValue && kind === 'userAttribute' && selectedAttribute" class="field"><span>{{ buffer.operator === 'in' ? 'Значения' : 'Значение' }}</span><select v-if="selectedAttribute.allowedValues?.length && buffer.operator === 'in'" multiple :aria-label="`Значения атрибута ${selectedAttribute.label}`" @change="selectedValues($event, selectedAttribute)"><option v-for="value in selectedAttribute.allowedValues" :key="String(value)" :value="String(value)" :selected="Array.isArray(buffer.value) && buffer.value.includes(value)">{{ value }}</option></select><select v-else-if="selectedAttribute.allowedValues?.length" :value="buffer.value" :aria-label="`Значение атрибута ${selectedAttribute.label}`" @change="attributeValue(($event.target as HTMLSelectElement).value, selectedAttribute)"><option value="">Выберите значение</option><option v-for="value in selectedAttribute.allowedValues" :key="String(value)" :value="String(value)">{{ value }}</option></select><select v-else-if="selectedAttribute.valueType === 'boolean' && buffer.operator === 'in'" multiple :aria-label="`Значения атрибута ${selectedAttribute.label}`" @change="selectedValues($event, selectedAttribute)"><option value="true" :selected="Array.isArray(buffer.value) && buffer.value.includes(true)">Да</option><option value="false" :selected="Array.isArray(buffer.value) && buffer.value.includes(false)">Нет</option></select><select v-else-if="selectedAttribute.valueType === 'boolean'" :value="buffer.value === undefined ? '' : String(buffer.value)" :aria-label="`Значение атрибута ${selectedAttribute.label}`" @change="attributeValue(($event.target as HTMLSelectElement).value, selectedAttribute)"><option value="">Выберите значение</option><option value="true">Да</option><option value="false">Нет</option></select><input v-else :type="buffer.operator === 'in' ? 'text' : selectedAttribute.valueType === 'number' ? 'number' : selectedAttribute.valueType === 'datetime' ? 'datetime-local' : 'text'" :inputmode="buffer.operator === 'in' && selectedAttribute.valueType === 'number' ? 'decimal' : undefined" :value="Array.isArray(buffer.value) ? buffer.value.join(', ') : buffer.value" :aria-label="`${buffer.operator === 'in' ? 'Значения' : 'Значение'} атрибута ${selectedAttribute.label}`" :placeholder="buffer.operator === 'in' ? 'Введите значения через запятую' : undefined" :aria-invalid="activeIssue?.fieldPath === 'value'" :aria-describedby="activeIssue?.fieldPath === 'value' ? 'audience-active-issue' : undefined" @input="attributeValue(($event.target as HTMLInputElement).value, selectedAttribute)"></label>

      <div v-if="selectedAttribute?.sensitive" class="privacy-note"><i class="pi pi-eye-slash" /><div><strong>Чувствительное значение</strong><span>В preview и Run Explain backend скроет фактическое значение. CMS не сможет его восстановить.</span></div></div>
      <footer><button type="button" class="secondary" @click="emit('close')">Отмена</button><button type="button" class="primary" aria-label="Применить условие аудитории" :disabled="!canApply" @click="apply">Применить</button></footer>
    </aside>
  </div>
</template>

<style scoped>
.leaf-backdrop{position:fixed;inset:0;z-index:1200;background:var(--overlay-backdrop)}.leaf-editor{position:absolute;top:0;right:0;display:flex;flex-direction:column;gap:16px;width:min(520px,100%);height:100%;padding:24px;background:var(--surface-card);box-shadow:var(--shadow-dialog);overflow:auto}.leaf-editor header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.leaf-editor header span{color:var(--status-violet-text);font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em}.leaf-editor h3{margin:4px 0 0;font-size:1.25rem}.leaf-editor header button{width:34px;height:34px;border:0;border-radius:50%;background:var(--surface-subtle);cursor:pointer}.intro{margin:0;color:var(--text-small-muted);font-size:.75rem;line-height:1.55}.field{display:flex;flex-direction:column;gap:7px}.field>span{font-size:.7rem;font-weight:800}.field select,.field input{width:100%;min-height:42px;padding:9px 11px;border:1px solid var(--border-default);border-radius:10px;background:var(--surface-card);font:inherit}.field [aria-invalid=true]{border-color:var(--status-danger-text);box-shadow:0 0 0 3px color-mix(in srgb,var(--status-danger) 8%,transparent)}.field small{color:var(--text-small-muted);font-size:.64rem;line-height:1.45}.active-issue{padding:10px 12px;border:1px solid var(--status-danger);border-radius:10px;background:var(--status-danger-soft);color:var(--status-danger-text);font-size:.7rem}.privacy-note{display:flex;gap:10px;padding:12px;border:1px solid var(--status-warning);border-radius:12px;background:var(--status-warning-soft);color:var(--status-warning-text)}.privacy-note strong,.privacy-note span{display:block}.privacy-note strong{font-size:.7rem}.privacy-note span{margin-top:3px;font-size:.64rem;line-height:1.4}.leaf-editor footer{display:flex;justify-content:flex-end;gap:8px;margin-top:auto;padding-top:10px}.leaf-editor footer button{padding:10px 16px;border-radius:10px;font-weight:800;cursor:pointer}.secondary{border:1px solid var(--border-default);background:var(--surface-card)}.primary{border:1px solid var(--surface-emphasis);background:var(--surface-emphasis);color:var(--text-on-emphasis)}.primary:disabled{opacity:.4;cursor:not-allowed}@media(max-width:767px){.leaf-editor{width:100%;padding:18px}}
.segment-search{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px}.segment-search button{border:0;border-radius:9px;padding:0 12px;background:var(--status-violet-soft);color:var(--status-violet-text);font-weight:800}.field-error{color:var(--status-danger-text)!important}
</style>
