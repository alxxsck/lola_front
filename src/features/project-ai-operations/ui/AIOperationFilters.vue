<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import Button from "primevue/button";
import DatePicker from "primevue/datepicker";
import InputText from "primevue/inputtext";
import Select from "primevue/select";
import EventDefinitionSelect from "@/features/events/EventDefinitionSelect.vue";
import type { AiOperationsListParams } from "@/shared/api/generated/models";
import AIFilterToggle from "@/shared/ui/AIFilterToggle.vue";

export type AIOperationFiltersModel = Omit<
  AiOperationsListParams,
  "cursor" | "limit"
>;

const props = defineProps<{
  modelValue: AIOperationFiltersModel;
  loading: boolean;
  canReadSubjects: boolean;
  projectId?: string;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: AIOperationFiltersModel];
  apply: [];
}>();
const mobileExpanded = ref(false);

const draft = reactive({
  status: props.modelValue.status ?? null,
  category: props.modelValue.category ?? null,
  initiatorType: props.modelValue.initiatorType ?? null,
  initiatorCmsUserId: props.modelValue.initiatorCmsUserId ?? "",
  initiatorEndUserId: props.modelValue.initiatorEndUserId ?? "",
  authorizedByCmsUserId: props.modelValue.authorizedByCmsUserId ?? "",
  chargedAccount: props.modelValue.chargedAccount ?? null,
  responsibleCmsUserId: props.modelValue.responsibleCmsUserId ?? "",
  chargedEndUserId: props.modelValue.chargedEndUserId ?? "",
  subjectEndUserId: props.modelValue.subjectEndUserId ?? "",
  subjectRole: props.modelValue.subjectRole ?? null,
  eventCode: props.modelValue.eventCode ?? "",
  sourceKind: props.modelValue.sourceKind ?? "",
  sourceId: props.modelValue.sourceId ?? "",
  provider: props.modelValue.provider ?? "",
  providerResponseId: props.modelValue.providerResponseId ?? "",
  occurredFrom: parseDate(props.modelValue.occurredFrom),
  occurredTo: parseDate(props.modelValue.occurredTo),
});

const statusOptions = [
  { label: "Все статусы", value: null },
  { label: "Запущено", value: "STARTED" },
  { label: "Выполняется", value: "RUNNING" },
  { label: "Завершено", value: "SUCCEEDED" },
  { label: "Ошибка", value: "FAILED" },
  { label: "Отменено", value: "CANCELLED" },
];
const categoryOptions = [
  { label: "Все категории", value: null },
  { label: "AI-анализ", value: "AI_ANALYSIS" },
  { label: "Чат", value: "CHAT" },
  { label: "Голос", value: "VOICE" },
  { label: "Речь", value: "SPEECH" },
  { label: "Память", value: "MEMORY" },
  { label: "AI-проверка", value: "AI_REVIEW" },
  { label: "Анализ обращения", value: "CASE_INTELLIGENCE" },
  { label: "Системная операция", value: "PROJECT_OVERHEAD" },
];
const actorOptions = [
  { label: "Любой инициатор", value: null },
  { label: "Администратор", value: "CMS_USER" },
  { label: "Пользователь", value: "END_USER" },
  { label: "Система", value: "SYSTEM" },
];
const accountOptions = [
  { label: "Любой источник расходов", value: null },
  { label: "Бюджет проекта", value: "PROJECT_BUDGET" },
  { label: "AI-лимит пользователя", value: "END_USER_ALLOWANCE" },
  { label: "Системные расходы", value: "PROJECT_OVERHEAD" },
];
const subjectRoleOptions = [
  { label: "Любая роль в данных", value: null },
  { label: "В области анализа", value: "SCOPE_MEMBER" },
  { label: "Источник данных", value: "DATA_CONTRIBUTOR" },
  { label: "Прямой субъект", value: "DIRECT_SUBJECT" },
];
const advancedFilterCount = computed(
  () =>
    [
      draft.initiatorCmsUserId,
      draft.initiatorEndUserId,
      draft.authorizedByCmsUserId,
      draft.responsibleCmsUserId,
      draft.chargedEndUserId,
      props.canReadSubjects ? draft.subjectEndUserId : "",
      props.canReadSubjects ? draft.subjectRole : null,
      draft.eventCode,
      draft.sourceKind,
      draft.sourceId,
      draft.provider,
      draft.providerResponseId,
    ].filter(Boolean).length,
);

watch(
  () => props.modelValue,
  (value) => {
    Object.assign(draft, {
      status: value.status ?? null,
      category: value.category ?? null,
      initiatorType: value.initiatorType ?? null,
      initiatorCmsUserId: value.initiatorCmsUserId ?? "",
      initiatorEndUserId: value.initiatorEndUserId ?? "",
      authorizedByCmsUserId: value.authorizedByCmsUserId ?? "",
      chargedAccount: value.chargedAccount ?? null,
      responsibleCmsUserId: value.responsibleCmsUserId ?? "",
      chargedEndUserId: value.chargedEndUserId ?? "",
      subjectEndUserId: value.subjectEndUserId ?? "",
      subjectRole: value.subjectRole ?? null,
      eventCode: value.eventCode ?? "",
      sourceKind: value.sourceKind ?? "",
      sourceId: value.sourceId ?? "",
      provider: value.provider ?? "",
      providerResponseId: value.providerResponseId ?? "",
      occurredFrom: parseDate(value.occurredFrom),
      occurredTo: parseDate(value.occurredTo),
    });
  },
  { deep: true },
);

function apply(): void {
  emit("update:modelValue", {
    ...(draft.status ? { status: draft.status } : {}),
    ...(draft.category ? { category: draft.category } : {}),
    ...(draft.initiatorType ? { initiatorType: draft.initiatorType } : {}),
    ...(trimmed(draft.initiatorCmsUserId)
      ? { initiatorCmsUserId: trimmed(draft.initiatorCmsUserId) }
      : {}),
    ...(trimmed(draft.initiatorEndUserId)
      ? { initiatorEndUserId: trimmed(draft.initiatorEndUserId) }
      : {}),
    ...(trimmed(draft.authorizedByCmsUserId)
      ? { authorizedByCmsUserId: trimmed(draft.authorizedByCmsUserId) }
      : {}),
    ...(draft.chargedAccount ? { chargedAccount: draft.chargedAccount } : {}),
    ...(trimmed(draft.responsibleCmsUserId)
      ? { responsibleCmsUserId: trimmed(draft.responsibleCmsUserId) }
      : {}),
    ...(trimmed(draft.chargedEndUserId)
      ? { chargedEndUserId: trimmed(draft.chargedEndUserId) }
      : {}),
    ...(props.canReadSubjects && trimmed(draft.subjectEndUserId)
      ? { subjectEndUserId: trimmed(draft.subjectEndUserId) }
      : {}),
    ...(props.canReadSubjects && draft.subjectRole
      ? { subjectRole: draft.subjectRole }
      : {}),
    ...(trimmed(draft.eventCode)
      ? { eventCode: trimmed(draft.eventCode) }
      : {}),
    ...(trimmed(draft.sourceKind)
      ? { sourceKind: trimmed(draft.sourceKind) }
      : {}),
    ...(trimmed(draft.sourceId) ? { sourceId: trimmed(draft.sourceId) } : {}),
    ...(trimmed(draft.provider) ? { provider: trimmed(draft.provider) } : {}),
    ...(trimmed(draft.providerResponseId)
      ? { providerResponseId: trimmed(draft.providerResponseId) }
      : {}),
    ...(draft.occurredFrom
      ? { occurredFrom: startOfDay(draft.occurredFrom).toISOString() }
      : {}),
    ...(draft.occurredTo
      ? { occurredTo: nextDay(draft.occurredTo).toISOString() }
      : {}),
  });
  emit("apply");
}

function reset(): void {
  Object.assign(draft, {
    status: null,
    category: null,
    initiatorType: null,
    initiatorCmsUserId: "",
    initiatorEndUserId: "",
    authorizedByCmsUserId: "",
    chargedAccount: null,
    responsibleCmsUserId: "",
    chargedEndUserId: "",
    subjectEndUserId: "",
    subjectRole: null,
    eventCode: "",
    sourceKind: "",
    sourceId: "",
    provider: "",
    providerResponseId: "",
    occurredFrom: null,
    occurredTo: null,
  });
  apply();
}

function trimmed(value: string): string {
  return value.trim();
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
    class="operation-filters ai-ledger-filters"
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
        aria-label="Статус AI-операции"
        :disabled="loading"
      />
      <Select
        v-model="draft.category"
        :options="categoryOptions"
        option-label="label"
        option-value="value"
        placeholder="Все категории"
        aria-label="Категория AI-операции"
        :disabled="loading"
      />
      <Select
        v-model="draft.initiatorType"
        :options="actorOptions"
        option-label="label"
        option-value="value"
        placeholder="Любой инициатор"
        aria-label="Тип инициатора"
        :disabled="loading"
      />
      <Select
        v-model="draft.chargedAccount"
        :options="accountOptions"
        option-label="label"
        option-value="value"
        placeholder="Любой источник расходов"
        aria-label="Источник расходов"
        :disabled="loading"
      />
      <DatePicker
        v-model="draft.occurredFrom"
        date-format="dd.mm.yy"
        show-icon
        placeholder="Период с"
        aria-label="Дата операции с"
        :disabled="loading"
      />
      <DatePicker
        v-model="draft.occurredTo"
        date-format="dd.mm.yy"
        show-icon
        placeholder="Период по"
        aria-label="Дата операции по"
        :disabled="loading"
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
          v-model="draft.initiatorCmsUserId"
          placeholder="ID администратора-инициатора"
          aria-label="ID администратора-инициатора"
          :disabled="loading"
        />
        <InputText
          v-model="draft.initiatorEndUserId"
          placeholder="ID пользователя-инициатора"
          aria-label="ID пользователя-инициатора"
          :disabled="loading"
        />
        <InputText
          v-model="draft.authorizedByCmsUserId"
          placeholder="ID администратора-авторизатора"
          aria-label="ID администратора-авторизатора"
          :disabled="loading"
        />
        <InputText
          v-model="draft.responsibleCmsUserId"
          placeholder="ID ответственного администратора"
          aria-label="ID ответственного администратора"
          :disabled="loading"
        />
        <InputText
          v-model="draft.chargedEndUserId"
          placeholder="ID владельца AI-лимита"
          aria-label="ID пользователя — владельца расхода"
          :disabled="loading"
        />
        <InputText
          v-if="canReadSubjects"
          v-model="draft.subjectEndUserId"
          placeholder="ID участника анализа"
          aria-label="ID пользователя — участника данных"
          :disabled="loading"
        />
        <Select
          v-if="canReadSubjects"
          v-model="draft.subjectRole"
          :options="subjectRoleOptions"
          option-label="label"
          option-value="value"
          placeholder="Любая роль в данных"
          aria-label="Роль пользователя в данных"
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
        <InputText
          v-model="draft.sourceKind"
          placeholder="Тип источника"
          aria-label="Тип источника операции"
          :disabled="loading"
        />
        <InputText
          v-model="draft.sourceId"
          placeholder="ID источника"
          aria-label="ID источника операции"
          :disabled="loading"
        />
        <InputText
          v-model="draft.provider"
          placeholder="AI-провайдер"
          aria-label="AI-провайдер"
          :disabled="loading"
        />
        <InputText
          v-model="draft.providerResponseId"
          placeholder="Provider response ID"
          aria-label="ID ответа AI-провайдера"
          :disabled="loading"
        />
      </div>
    </details>
    <div class="filter-actions">
      <Button
        type="button"
        label="Сбросить"
        severity="secondary"
        text
        @click="reset"
      />
      <Button
        type="submit"
        label="Применить"
        icon="pi pi-filter"
        :loading="loading"
      />
    </div>
  </form>
</template>

<style scoped>
.operation-filters {
  grid-template-columns: minmax(0, 1fr);
}
.filter-primary,
.filter-advanced-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(150px, 1fr));
  gap: 12px;
}
@media (max-width: 1320px) {
  .filter-primary,
  .filter-advanced-grid {
    grid-template-columns: repeat(3, minmax(160px, 1fr));
  }
}
@media (max-width: 1080px) {
  .filter-primary,
  .filter-advanced-grid {
    grid-template-columns: repeat(2, minmax(140px, 1fr));
  }
}
@media (max-width: 560px) {
  .filter-primary,
  .filter-advanced-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .operation-filters.collapsed > :not(.ai-filter-toggle) {
    display: none;
  }
}
</style>
