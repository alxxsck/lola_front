<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Textarea from 'primevue/textarea'
import ToggleSwitch from 'primevue/toggleswitch'
import { actionFieldOptions, isActionFieldVisible } from '@/shared/lib/action-definition'
import type {
  ActionUiField,
  EventDefinition,
  ScenarioActionDefinition,
  UiElement,
} from '@/shared/types/domain'

const props = withDefaults(defineProps<{
  definition: ScenarioActionDefinition
  modelValue: Record<string, unknown>
  events?: EventDefinition[]
  elements?: UiElement[]
  templateVariables?: string[]
  instanceId?: string
  readonly?: boolean
}>(), {
  events: () => [],
  elements: () => [],
  templateVariables: () => [],
  instanceId: '',
  readonly: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, unknown>]
  'validity-change': [valid: boolean]
}>()

const jsonDrafts = reactive<Record<string, string>>({})
const jsonErrors = reactive<Record<string, string>>({})
const visibleFields = computed(() => props.definition.uiSchema.fields.filter((field) => isActionFieldVisible(field, props.modelValue)))

watch(
  () => props.definition.type,
  () => {
    for (const field of props.definition.uiSchema.fields) {
      if (field.control !== 'json') continue
      const value = props.modelValue[field.key]
      jsonDrafts[field.key] = typeof value === 'string' ? value : JSON.stringify(value ?? {}, null, 2)
      jsonErrors[field.key] = ''
    }
    emitValidity()
  },
  { immediate: true },
)

function propertyFor(field: ActionUiField) {
  return props.definition.configSchema.properties[field.key]
}

function booleanValue(field: ActionUiField) {
  return Boolean(props.modelValue[field.key] ?? propertyFor(field)?.default)
}

function fieldId(field: ActionUiField) {
  return `${props.definition.type}-${props.instanceId || props.definition.id}-${field.key}`
}

function isRequired(field: ActionUiField) {
  return props.definition.configSchema.required.includes(field.key)
}

function selectOptions(field: ActionUiField) {
  if (field.control === 'target') {
    const kinds = field.targetKinds ?? []
    return props.elements
      .filter((element) => element.enabled && (!kinds.length || kinds.includes(element.kind)))
      .map((element) => ({ label: element.name, value: element.code, meta: element.kind }))
  }
  if (field.control === 'event') {
    return props.events
      .filter((event) => event.enabled)
      .map((event) => ({ label: event.name, value: event.code, meta: `v${event.version}` }))
  }
  return actionFieldOptions(field, propertyFor(field)).map((option) => (
    option && typeof option === 'object'
      ? option
      : { label: String(option), value: option }
  ))
}

function updateField(key: string, value: unknown) {
  const next = { ...props.modelValue }
  if (value === undefined || value === null || value === '') delete next[key]
  else next[key] = value
  emit('update:modelValue', next)
}

function updateJson(field: ActionUiField) {
  try {
    const value = JSON.parse(jsonDrafts[field.key] || '{}') as unknown
    const expectedType = propertyFor(field)?.type
    if (expectedType === 'array' && !Array.isArray(value)) throw new Error('JSON должен быть массивом')
    if (expectedType !== 'array' && (!value || typeof value !== 'object' || Array.isArray(value))) throw new Error('JSON должен быть объектом')
    jsonErrors[field.key] = ''
    updateField(field.key, value)
    emitValidity()
  } catch (cause) {
    jsonErrors[field.key] = cause instanceof Error ? cause.message : 'Проверьте JSON'
    emitValidity()
  }
}

function emitValidity() {
  const hasVisibleError = visibleFields.value.some((field) => field.control === 'json' && Boolean(jsonErrors[field.key]))
  emit('validity-change', !hasVisibleError)
}

function insertVariable(field: ActionUiField, variable: string) {
  const current = typeof props.modelValue[field.key] === 'string' ? props.modelValue[field.key] as string : ''
  updateField(field.key, `${current}${current && !current.endsWith(' ') ? ' ' : ''}${variable}`)
}

function fieldHint(field: ActionUiField) {
  const property = propertyFor(field)
  const hints: string[] = []
  if (typeof property?.minLength === 'number') hints.push(`от ${property.minLength} симв.`)
  if (typeof property?.maxLength === 'number') hints.push(`до ${property.maxLength} симв.`)
  if (typeof property?.minimum === 'number') hints.push(`мин. ${property.minimum}`)
  if (typeof property?.maximum === 'number') hints.push(`макс. ${property.maximum}`)
  return hints.join(' · ')
}
</script>

<template>
  <div v-if="visibleFields.length" class="schema-fields">
    <div
      v-for="field in visibleFields"
      :key="field.key"
      class="field schema-field"
      :class="{ 'field-wide': field.control === 'textarea' || field.control === 'json' }"
    >
      <label :for="fieldId(field)">
        {{ field.label }}
        <span v-if="isRequired(field)" class="required">*</span>
      </label>

      <Textarea
        v-if="field.control === 'textarea'"
        :id="fieldId(field)"
        :model-value="String(modelValue[field.key] ?? '')"
        rows="3"
        auto-resize
        :disabled="readonly"
        @update:model-value="updateField(field.key, $event)"
      />
      <InputNumber
        v-else-if="field.control === 'number'"
        :input-id="fieldId(field)"
        :model-value="typeof modelValue[field.key] === 'number' ? modelValue[field.key] as number : null"
        :min="propertyFor(field)?.minimum"
        :max="propertyFor(field)?.maximum"
        :use-grouping="false"
        :disabled="readonly"
        @update:model-value="updateField(field.key, $event)"
      />
      <ToggleSwitch
        v-else-if="field.control === 'boolean'"
        :input-id="fieldId(field)"
        :model-value="booleanValue(field)"
        :disabled="readonly"
        @update:model-value="updateField(field.key, $event)"
      />
      <Select
        v-else-if="field.control === 'select' || field.control === 'target' || field.control === 'event'"
        :input-id="fieldId(field)"
        :model-value="modelValue[field.key]"
        :options="selectOptions(field)"
        option-label="label"
        option-value="value"
        :editable="Boolean(field.allowCustom)"
        :disabled="readonly"
        :placeholder="field.control === 'target' ? 'Выберите объект интерфейса' : field.control === 'event' ? 'Выберите событие' : 'Выберите значение'"
        @update:model-value="updateField(field.key, $event)"
      >
        <template #option="slotProps">
          <div class="select-option"><span>{{ slotProps.option.label }}</span><small v-if="slotProps.option.meta">{{ slotProps.option.meta }}</small></div>
        </template>
      </Select>
      <template v-else-if="field.control === 'json'">
        <Textarea
          :id="fieldId(field)"
          v-model="jsonDrafts[field.key]"
          rows="5"
          class="mono"
          :invalid="Boolean(jsonErrors[field.key])"
          :disabled="readonly"
          @blur="updateJson(field)"
        />
        <small v-if="jsonErrors[field.key]" class="field-error">{{ jsonErrors[field.key] }}</small>
      </template>
      <InputText
        v-else
        :id="fieldId(field)"
        :model-value="String(modelValue[field.key] ?? '')"
        :disabled="readonly"
        @update:model-value="updateField(field.key, $event)"
      />

      <small v-if="fieldHint(field)" class="field-hint">{{ fieldHint(field) }}</small>
      <div v-if="field.supportsTemplates && templateVariables.length && !readonly" class="variable-pills">
        <button v-for="variable in templateVariables" :key="variable" type="button" @click="insertVariable(field, variable)">{{ variable }}</button>
      </div>
    </div>
  </div>
  <div v-else class="no-config"><i class="pi pi-check" /> Дополнительные настройки не требуются.</div>
</template>

<style scoped>
.schema-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}.field-wide{grid-column:1/-1}.required{color:var(--status-danger-text)}.field-hint{color:var(--muted);font-size:.68rem}.field-error{color:var(--status-danger-text);font-size:.7rem}.select-option{display:flex;align-items:center;justify-content:space-between;gap:16px;width:100%}.select-option small{color:var(--muted);font-size:.65rem}.no-config{padding:12px 14px;border-radius:11px;background:var(--status-success-soft);color:var(--status-success-text);font-size:.79rem}.no-config i{color:var(--status-success-text);margin-right:6px}.variable-pills{display:flex;flex-wrap:wrap;gap:5px}.variable-pills button{border:1px solid var(--status-violet);background:var(--status-violet-soft);color:var(--status-violet-text);border-radius:7px;padding:4px 7px;font:500 .62rem ui-monospace,SFMono-Regular,Menlo,monospace;cursor:pointer}.variable-pills button:hover{background:var(--status-violet-soft);border-color:var(--status-violet)}@media(max-width:680px){.schema-fields{grid-template-columns:1fr}.field-wide{grid-column:auto}}
</style>
