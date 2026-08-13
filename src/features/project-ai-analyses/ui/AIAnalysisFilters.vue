<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import Button from 'primevue/button';
import DatePicker from 'primevue/datepicker';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import EventDefinitionSelect from '@/features/events/EventDefinitionSelect.vue';
import type { ProjectAIAnalysisListParams } from '@/shared/api/generated/models';
import AIFilterToggle from '@/shared/ui/AIFilterToggle.vue';

export type AIAnalysisFiltersModel = Omit<ProjectAIAnalysisListParams, 'cursor' | 'limit'>;

const props = defineProps<{
  modelValue: AIAnalysisFiltersModel;
  canReadCost: boolean;
  loading: boolean;
  projectId?: string;
}>();
const emit = defineEmits<{
  'update:modelValue': [value: AIAnalysisFiltersModel];
  apply: [];
}>();
const mobileExpanded = ref(false);

const draft = reactive<{
  status: ProjectAIAnalysisListParams['status'] | null;
  kind: ProjectAIAnalysisListParams['kind'] | null;
  scopeKind: ProjectAIAnalysisListParams['scopeKind'] | null;
  endUserId: string;
  createdByCmsUserId: string;
  costAttributedToCmsUserId: string;
  eventCode: string;
  createdFrom: Date | null;
  createdTo: Date | null;
  runFrom: Date | null;
  runTo: Date | null;
}>({
  status: props.modelValue.status ?? null,
  kind: props.modelValue.kind ?? null,
  scopeKind: props.modelValue.scopeKind ?? null,
  endUserId: props.modelValue.endUserId ?? '',
  createdByCmsUserId: props.modelValue.createdByCmsUserId ?? '',
  costAttributedToCmsUserId: props.modelValue.costAttributedToCmsUserId ?? '',
  eventCode: props.modelValue.eventCode ?? '',
  createdFrom: parseDate(props.modelValue.createdFrom),
  createdTo: parseDate(props.modelValue.createdTo),
  runFrom: parseDate(props.modelValue.runFrom),
  runTo: parseDate(props.modelValue.runTo),
});

const statusOptions = [
  { label: 'Все статусы', value: null },
  { label: 'Запланирован', value: 'SCHEDULED' },
  { label: 'В очереди', value: 'QUEUED' },
  { label: 'Выполняется', value: 'RUNNING' },
  { label: 'Готов', value: 'SUCCEEDED' },
  { label: 'Нужно уточнение', value: 'NEEDS_CLARIFICATION' },
  { label: 'Ошибка', value: 'FAILED' },
  { label: 'Приостановлен', value: 'PAUSED' },
  { label: 'Отменён', value: 'CANCELLED' },
  { label: 'Истёк', value: 'EXPIRED' },
  { label: 'Исход неизвестен', value: 'OUTCOME_UNKNOWN' },
];
const scopeOptions = [
  { label: 'Любая область', value: null },
  { label: 'Весь проект', value: 'PROJECT' },
  { label: 'Пользователь', value: 'END_USER' },
  { label: 'Когорта', value: 'COHORT' },
];
const kindOptions = [
  { label: 'Все типы', value: null },
  { label: 'Разовый', value: 'ONE_OFF' },
  { label: 'Отложенный', value: 'SCHEDULED_ONCE' },
  { label: 'Регулярный', value: 'RECURRING' },
];
const advancedFilterCount = computed(
  () =>
    [
      draft.endUserId,
      draft.createdByCmsUserId,
      props.canReadCost ? draft.costAttributedToCmsUserId : '',
      draft.createdFrom,
      draft.createdTo,
      draft.runFrom,
      draft.runTo,
    ].filter(Boolean).length,
);

watch(
  () => props.modelValue,
  (value) => {
    draft.status = value.status ?? null;
    draft.kind = value.kind ?? null;
    draft.scopeKind = value.scopeKind ?? null;
    draft.endUserId = value.endUserId ?? '';
    draft.createdByCmsUserId = value.createdByCmsUserId ?? '';
    draft.costAttributedToCmsUserId = value.costAttributedToCmsUserId ?? '';
    draft.eventCode = value.eventCode ?? '';
    draft.createdFrom = parseDate(value.createdFrom);
    draft.createdTo = parseDate(value.createdTo);
    draft.runFrom = parseDate(value.runFrom);
    draft.runTo = parseDate(value.runTo);
  },
  { deep: true },
);

function apply(): void {
  emit('update:modelValue', {
    ...(draft.status ? { status: draft.status } : {}),
    ...(draft.kind ? { kind: draft.kind } : {}),
    ...(draft.scopeKind ? { scopeKind: draft.scopeKind } : {}),
    ...(draft.endUserId.trim() ? { endUserId: draft.endUserId.trim() } : {}),
    ...(draft.createdByCmsUserId.trim()
      ? { createdByCmsUserId: draft.createdByCmsUserId.trim() }
      : {}),
    ...(props.canReadCost && draft.costAttributedToCmsUserId.trim()
      ? {
          costAttributedToCmsUserId: draft.costAttributedToCmsUserId.trim(),
        }
      : {}),
    ...(draft.eventCode.trim() ? { eventCode: draft.eventCode.trim() } : {}),
    ...(draft.createdFrom ? { createdFrom: startOfDay(draft.createdFrom).toISOString() } : {}),
    ...(draft.createdTo ? { createdTo: nextDay(draft.createdTo).toISOString() } : {}),
    ...(draft.runFrom ? { runFrom: startOfDay(draft.runFrom).toISOString() } : {}),
    ...(draft.runTo ? { runTo: nextDay(draft.runTo).toISOString() } : {}),
  });
  emit('apply');
}

function reset(): void {
  Object.assign(draft, {
    status: null,
    kind: null,
    scopeKind: null,
    endUserId: '',
    createdByCmsUserId: '',
    costAttributedToCmsUserId: '',
    eventCode: '',
    createdFrom: null,
    createdTo: null,
    runFrom: null,
    runTo: null,
  });
  apply();
}

function parseDate(value?: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfDay(value: Date): Date {
  const result = new Date(value);
  result.setHours(0, 0, 0, 0);
  return result;
}

function nextDay(value: Date): Date {
  const result = startOfDay(value);
  result.setDate(result.getDate() + 1);
  return result;
}
</script>

<template>
  <form
    class="analysis-filters ai-ledger-filters"
    :class="{ collapsed: !mobileExpanded }"
    @submit.prevent="apply"
  >
    <AIFilterToggle v-model:expanded="mobileExpanded" :filters="modelValue" />
    <div class="filter-primary">
      <Select
        v-model="draft.status"
        :options="statusOptions"
        option-label="label"
        option-value="value"
        placeholder="Все статусы"
        aria-label="Статус анализа"
        :disabled="loading"
      />
      <Select
        v-model="draft.scopeKind"
        :options="scopeOptions"
        option-label="label"
        option-value="value"
        placeholder="Любая область"
        aria-label="Область анализа"
        :disabled="loading"
      />
      <Select
        v-model="draft.kind"
        :options="kindOptions"
        option-label="label"
        option-value="value"
        placeholder="Все типы"
        aria-label="Тип запуска"
        :disabled="loading"
      />
      <EventDefinitionSelect
        :model-value="draft.eventCode"
        :project-id="projectId ?? ''"
        value-field="code"
        allow-empty
        hide-label
        label="Событие"
        placeholder="Любое событие"
        :disabled="loading || !projectId"
        @update:model-value="draft.eventCode = $event"
      />
    </div>

    <details class="advanced-filters">
      <summary>
        <span><i class="pi pi-sliders-h" /> Дополнительные фильтры</span>
        <strong v-if="advancedFilterCount">{{ advancedFilterCount }}</strong>
        <i class="pi pi-chevron-down" />
      </summary>
      <div class="filter-advanced-grid">
        <InputText
          v-model="draft.endUserId"
          placeholder="ID пользователя"
          aria-label="ID пользователя данных"
          :disabled="loading"
        />
        <InputText
          v-model="draft.createdByCmsUserId"
          placeholder="ID администратора"
          aria-label="ID администратора-создателя"
          :disabled="loading"
        />
        <InputText
          v-if="canReadCost"
          v-model="draft.costAttributedToCmsUserId"
          placeholder="ID расхода администратора"
          aria-label="ID администратора для атрибуции расходов"
          :disabled="loading"
        />
        <DatePicker
          v-model="draft.createdFrom"
          date-format="dd.mm.yy"
          show-icon
          placeholder="Создан с"
          aria-label="Дата создания с"
          :disabled="loading"
        />
        <DatePicker
          v-model="draft.createdTo"
          date-format="dd.mm.yy"
          show-icon
          placeholder="Создан по"
          aria-label="Дата создания по"
          :disabled="loading"
        />
        <DatePicker
          v-model="draft.runFrom"
          date-format="dd.mm.yy"
          show-icon
          placeholder="Запуск с"
          aria-label="Дата запуска с"
          :disabled="loading"
        />
        <DatePicker
          v-model="draft.runTo"
          date-format="dd.mm.yy"
          show-icon
          placeholder="Запуск по"
          aria-label="Дата запуска по"
          :disabled="loading"
        />
      </div>
    </details>
    <div class="filter-actions">
      <Button type="button" label="Сбросить" severity="secondary" text @click="reset" />
      <Button type="submit" label="Применить" icon="pi pi-filter" :loading="loading" />
    </div>
  </form>
</template>

<style scoped>
.analysis-filters {
  grid-template-columns: minmax(0, 1fr);
}
.filter-primary,
.filter-advanced-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(150px, 1fr));
  gap: 12px;
}
@media (max-width: 860px) {
  .filter-primary,
  .filter-advanced-grid {
    grid-template-columns: repeat(2, minmax(130px, 1fr));
  }
}
@media (max-width: 560px) {
  .filter-primary,
  .filter-advanced-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .analysis-filters.collapsed > :not(.ai-filter-toggle) {
    display: none;
  }
}
</style>
