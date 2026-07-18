<script setup lang="ts">
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import type { ScenarioCondition } from '@/shared/types/domain'

const props = defineProps<{ modelValue: ScenarioCondition[]; paths: string[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: ScenarioCondition[]] }>()

const operators = [
  { label: 'равно', value: 'eq' }, { label: 'не равно', value: 'neq' },
  { label: 'больше', value: 'gt' }, { label: 'не меньше', value: 'gte' },
  { label: 'меньше', value: 'lt' }, { label: 'не больше', value: 'lte' },
  { label: 'в списке', value: 'in' }, { label: 'содержит', value: 'contains' },
  { label: 'существует', value: 'exists' },
]

function update(index: number, patch: Partial<ScenarioCondition>) {
  emit('update:modelValue', props.modelValue.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item))
}

function add() {
  emit('update:modelValue', [...props.modelValue, { path: props.paths[0] ?? 'user.segment', operator: 'eq', value: '' }])
}

function remove(index: number) {
  emit('update:modelValue', props.modelValue.filter((_, itemIndex) => itemIndex !== index))
}
</script>

<template>
  <div class="conditions">
    <div v-for="(condition, index) in modelValue" :key="index" class="condition-row">
      <Select class="condition-path" :model-value="condition.path" :options="paths" editable placeholder="event.payload…" @update:model-value="update(index, { path: $event })" />
      <Select class="condition-operator" :model-value="condition.operator" :options="operators" option-label="label" option-value="value" @update:model-value="update(index, { operator: $event })" />
      <InputText v-if="condition.operator !== 'exists'" class="condition-value" :model-value="String(condition.value ?? '')" placeholder="Значение" @update:model-value="update(index, { value: $event })" />
      <span v-else class="condition-value exists-note">без значения</span>
      <Button type="button" class="condition-remove" icon="pi pi-trash" text rounded severity="danger" aria-label="Удалить условие" title="Удалить условие" @click="remove(index)" />
    </div>
    <Button type="button" label="Добавить условие" icon="pi pi-plus" text size="small" @click="add" />
  </div>
</template>

<style scoped>
.conditions{container-type:inline-size;display:flex;flex-direction:column;gap:8px}.condition-row{display:grid;grid-template-columns:minmax(0,1.25fr) 120px minmax(0,.75fr) 36px;gap:7px;align-items:center}.condition-row :deep(.p-select),.condition-row :deep(.p-inputtext){min-width:0;font-size:.74rem}.condition-remove{justify-self:end}.exists-note{padding:9px;color:var(--text-secondary);font-size:.7rem}@container(max-width:420px){.condition-row{grid-template-columns:minmax(0,1fr) 120px 36px}.condition-path{grid-column:1/3}.condition-remove{grid-column:3;grid-row:1}.condition-operator{grid-column:1}.condition-value{grid-column:2/4}}
</style>
