<script setup lang="ts">
import { ref } from "vue";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import MultiSelect from "primevue/multiselect";
import Select from "primevue/select";
import type {
  EndUserCaseFilters,
  EndUserCasePreset,
} from "../model/end-user-case";

const props = defineProps<{
  modelValue: EndUserCaseFilters;
  counts: { active: number; attention: number; resolved: number };
}>();
const emit = defineEmits<{
  "update:modelValue": [value: EndUserCaseFilters];
}>();

const presets: Array<{ value: EndUserCasePreset; label: string }> = [
  { value: "ACTIVE", label: "Активные" },
  { value: "ATTENTION", label: "Требуют внимания" },
  { value: "WAITING", label: "Ожидают" },
  { value: "RESOLVED", label: "Решённые" },
  { value: "ALL", label: "Все" },
];
const sorts = [
  { value: "ATTENTION_FIRST", label: "Важные сначала" },
  { value: "LAST_ACTIVITY", label: "Последняя активность" },
  { value: "OLDEST_OPEN", label: "Сначала старые" },
  { value: "PRIORITY", label: "По приоритету" },
  { value: "RECENTLY_RESOLVED", label: "Недавно решённые" },
];
const priorities = [
  { value: "CRITICAL", label: "Критично" },
  { value: "URGENT", label: "Срочно" },
  { value: "HIGH", label: "Высокий" },
  { value: "NORMAL", label: "Обычный" },
  { value: "LOW", label: "Низкий" },
];
const statuses = [
  { value: "OPEN", label: "Открыто" },
  { value: "IN_PROGRESS", label: "В работе" },
  { value: "WAITING_END_USER", label: "Ожидает пользователя" },
  { value: "WAITING_SYSTEM", label: "Ожидает систему" },
  { value: "WAITING_ADMIN", label: "Ожидает администратора" },
  { value: "RESOLVED", label: "Решено" },
  { value: "UNRESOLVED", label: "Не решено" },
  { value: "CANCELLED", label: "Отменено" },
];
const impacts = [
  { value: "CRITICAL", label: "Критичное влияние" },
  { value: "HIGH", label: "Высокое влияние" },
  { value: "MEDIUM", label: "Среднее влияние" },
  { value: "LOW", label: "Низкое влияние" },
];
const urgencies = [
  { value: "IMMEDIATE", label: "Немедленно" },
  { value: "HIGH", label: "Высокая срочность" },
  { value: "MEDIUM", label: "Средняя срочность" },
  { value: "LOW", label: "Низкая срочность" },
];
const resolutionAssessments = [
  { value: "NOT_ASSESSED", label: "Не оценено" },
  { value: "LIKELY_RESOLVED", label: "Вероятно решено" },
  { value: "CONFIRMED_RESOLVED", label: "Решение подтверждено" },
  { value: "LIKELY_UNRESOLVED", label: "Вероятно не решено" },
  { value: "CONFIRMED_UNRESOLVED", label: "Не решено подтверждённо" },
  { value: "INCONCLUSIVE", label: "Недостаточно данных" },
];
const resolutionSources = [
  { value: "END_USER_EXPLICIT", label: "Подтвердил пользователь" },
  { value: "CMS_USER", label: "Подтвердил администратор" },
  { value: "TRUSTED_VERIFICATION", label: "Проверено по данным" },
  { value: "AI_INFERENCE", label: "Оценка Retenive" },
];
const assignments = [
  { value: undefined, label: "Любой" },
  { value: "ASSIGNED", label: "Назначено" },
  { value: "UNASSIGNED", label: "Без исполнителя" },
];
const recontacts = [
  { value: undefined, label: "Любой возврат" },
  { value: "YES", label: "Пользователь возвращался" },
  { value: "NO", label: "Без возврата" },
];
const yesNoOptions = (anyLabel: string, yesLabel: string, noLabel: string) => [
  { value: undefined, label: anyLabel },
  { value: "YES", label: yesLabel },
  { value: "NO", label: noLabel },
];
const adminAttentionOptions = [
  { value: undefined, label: "Любое внимание" },
  { value: "OPEN", label: "Есть активная эскалация" },
  { value: "NONE", label: "Нет активной эскалации" },
];
const channels = [
  { value: "TEXT", label: "Текст" },
  { value: "VOICE", label: "Голос" },
  { value: "CMS", label: "Администратор" },
];
const capabilityOutcomes = [
  { value: "COMPLETED", label: "Успешно" },
  { value: "FAILED", label: "Ошибка" },
  { value: "REJECTED", label: "Отклонено" },
  { value: "ACCEPTED", label: "Принято" },
  { value: "RESERVED", label: "Начато" },
];

function count(preset: EndUserCasePreset): number | null {
  if (preset === "ACTIVE") return props.counts.active;
  if (preset === "ATTENTION") return props.counts.attention;
  if (preset === "RESOLVED") return props.counts.resolved;
  return null;
}

function update(patch: Partial<EndUserCaseFilters>): void {
  emit("update:modelValue", { ...props.modelValue, ...patch });
}

function dateTimeLocalValue(value?: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function absoluteDateTime(value?: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

const advancedVisible = ref(false);
</script>

<template>
  <div class="case-filters card">
    <div class="presets" aria-label="Представление обращений">
      <button
        v-for="preset in presets"
        :key="preset.value"
        type="button"
        :data-preset="preset.value"
        :class="{ active: modelValue.preset === preset.value }"
        :aria-pressed="modelValue.preset === preset.value"
        @click="update({ preset: preset.value })"
      >
        {{ preset.label }}
        <strong v-if="count(preset.value) !== null">{{
          count(preset.value)
        }}</strong>
      </button>
    </div>
    <div class="controls">
      <MultiSelect
        :model-value="modelValue.status"
        :options="statuses"
        option-label="label"
        option-value="value"
        placeholder="Статус"
        aria-label="Статус"
        display="chip"
        :max-selected-labels="2"
        @update:model-value="
          update({ status: $event?.length ? $event : undefined })
        "
      />
      <MultiSelect
        :model-value="modelValue.priority"
        :options="priorities"
        option-label="label"
        option-value="value"
        placeholder="Приоритет"
        aria-label="Приоритет"
        display="chip"
        :max-selected-labels="2"
        @update:model-value="
          update({ priority: $event?.length ? $event : undefined })
        "
      />
      <Select
        :model-value="modelValue.assignment"
        :options="assignments"
        option-label="label"
        option-value="value"
        placeholder="Исполнитель"
        aria-label="Назначение"
        @update:model-value="update({ assignment: $event })"
      />
      <Select
        :model-value="modelValue.sort"
        :options="sorts"
        option-label="label"
        option-value="value"
        aria-label="Сортировка"
        @update:model-value="update({ sort: $event })"
      />
      <Button
        class="advanced-toggle"
        :label="advancedVisible ? 'Скрыть фильтры' : 'Дополнительные фильтры'"
        :icon="advancedVisible ? 'pi pi-chevron-up' : 'pi pi-sliders-h'"
        severity="secondary"
        text
        :aria-expanded="advancedVisible"
        aria-controls="advanced-case-filters"
        @click="advancedVisible = !advancedVisible"
      />
      <div
        v-if="advancedVisible"
        id="advanced-case-filters"
        class="advanced-controls"
      >
        <MultiSelect
          :model-value="modelValue.impact"
          :options="impacts"
          option-label="label"
          option-value="value"
          placeholder="Влияние"
          aria-label="Влияние"
          display="chip"
          :max-selected-labels="2"
          @update:model-value="
            update({ impact: $event?.length ? $event : undefined })
          "
        />
        <MultiSelect
          :model-value="modelValue.urgency"
          :options="urgencies"
          option-label="label"
          option-value="value"
          placeholder="Срочность"
          aria-label="Срочность"
          display="chip"
          :max-selected-labels="2"
          @update:model-value="
            update({ urgency: $event?.length ? $event : undefined })
          "
        />
        <MultiSelect
          :model-value="modelValue.resolutionAssessment"
          :options="resolutionAssessments"
          option-label="label"
          option-value="value"
          placeholder="Оценка решения"
          aria-label="Оценка решения"
          display="chip"
          :max-selected-labels="2"
          @update:model-value="
            update({
              resolutionAssessment: $event?.length ? $event : undefined,
            })
          "
        />
        <MultiSelect
          :model-value="modelValue.resolutionSource"
          :options="resolutionSources"
          option-label="label"
          option-value="value"
          placeholder="Источник решения"
          aria-label="Источник решения"
          display="chip"
          :max-selected-labels="2"
          @update:model-value="
            update({ resolutionSource: $event?.length ? $event : undefined })
          "
        />
        <InputText
          :model-value="modelValue.groupCode"
          maxlength="64"
          placeholder="Код категории"
          aria-label="Код категории"
          @update:model-value="update({ groupCode: $event || undefined })"
        />
        <InputText
          :model-value="modelValue.assignedCmsUserId"
          maxlength="36"
          placeholder="ID исполнителя"
          aria-label="ID исполнителя"
          @update:model-value="
            update({ assignedCmsUserId: $event || undefined })
          "
        />
        <InputText
          :model-value="modelValue.endUserId"
          maxlength="36"
          placeholder="ID пользователя"
          aria-label="ID пользователя"
          @update:model-value="update({ endUserId: $event || undefined })"
        />
        <InputText
          :model-value="modelValue.primaryLanguage"
          maxlength="35"
          placeholder="Язык, например ru"
          aria-label="Основной язык"
          @update:model-value="update({ primaryLanguage: $event || undefined })"
        />
        <Select
          :model-value="modelValue.adminAttention"
          :options="adminAttentionOptions"
          option-label="label"
          option-value="value"
          placeholder="Эскалация обращения"
          aria-label="Эскалация обращения"
          @update:model-value="update({ adminAttention: $event })"
        />
        <Select
          :model-value="modelValue.cmsParticipation"
          :options="
            yesNoOptions(
              'Любое участие администратора',
              'Администратор участвовал',
              'Без участия администратора',
            )
          "
          option-label="label"
          option-value="value"
          aria-label="Участие администратора"
          @update:model-value="update({ cmsParticipation: $event })"
        />
        <Select
          :model-value="modelValue.recontacted"
          :options="recontacts"
          option-label="label"
          option-value="value"
          placeholder="Возврат"
          aria-label="Возврат"
          @update:model-value="update({ recontacted: $event })"
        />
        <Select
          :model-value="modelValue.reopened"
          :options="
            yesNoOptions('Любое переоткрытие', 'Переоткрыто', 'Не переоткрыто')
          "
          option-label="label"
          option-value="value"
          aria-label="Переоткрытие"
          @update:model-value="update({ reopened: $event })"
        />
        <Select
          :model-value="modelValue.stale"
          :options="
            yesNoOptions('Любая давность', 'Просрочено', 'Не просрочено')
          "
          option-label="label"
          option-value="value"
          aria-label="Просроченность"
          @update:model-value="update({ stale: $event })"
        />
        <Select
          :model-value="modelValue.degraded"
          :options="
            yesNoOptions(
              'Любое состояние анализа',
              'Анализ отстаёт',
              'Анализ актуален',
            )
          "
          option-label="label"
          option-value="value"
          aria-label="Состояние анализа"
          @update:model-value="update({ degraded: $event })"
        />
        <MultiSelect
          :model-value="modelValue.channel"
          :options="channels"
          option-label="label"
          option-value="value"
          placeholder="Канал"
          aria-label="Канал"
          display="chip"
          :max-selected-labels="2"
          @update:model-value="
            update({ channel: $event?.length ? $event : undefined })
          "
        />
        <InputText
          type="datetime-local"
          :model-value="dateTimeLocalValue(modelValue.createdFrom)"
          aria-label="Создано с"
          @update:model-value="
            update({ createdFrom: absoluteDateTime($event) })
          "
        />
        <InputText
          type="datetime-local"
          :model-value="dateTimeLocalValue(modelValue.createdTo)"
          aria-label="Создано до"
          @update:model-value="update({ createdTo: absoluteDateTime($event) })"
        />
        <InputText
          type="datetime-local"
          :model-value="dateTimeLocalValue(modelValue.lastActivityFrom)"
          aria-label="Активность с"
          @update:model-value="
            update({ lastActivityFrom: absoluteDateTime($event) })
          "
        />
        <InputText
          type="datetime-local"
          :model-value="dateTimeLocalValue(modelValue.lastActivityTo)"
          aria-label="Активность до"
          @update:model-value="
            update({ lastActivityTo: absoluteDateTime($event) })
          "
        />
        <InputText
          :model-value="modelValue.aiCapabilityCode"
          maxlength="100"
          placeholder="Код инструмента Retenive"
          aria-label="Код инструмента Retenive"
          @update:model-value="
            update({ aiCapabilityCode: $event || undefined })
          "
        />
        <MultiSelect
          :model-value="modelValue.aiCapabilityOutcome"
          :options="capabilityOutcomes"
          option-label="label"
          option-value="value"
          placeholder="Результат инструмента"
          aria-label="Результат инструмента"
          display="chip"
          :max-selected-labels="2"
          @update:model-value="
            update({ aiCapabilityOutcome: $event?.length ? $event : undefined })
          "
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.case-filters {
  margin-bottom: 16px;
  overflow: hidden;
}
.presets,
.controls {
  display: flex;
  align-items: center;
  gap: 8px;
}
.presets {
  padding: 8px;
  overflow-x: auto;
  border-bottom: 1px solid var(--border-subtle);
}
.presets button {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 9px 12px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--text-secondary);
  white-space: nowrap;
  cursor: pointer;
}
.presets button.active {
  background: var(--surface-subtle);
  color: var(--text-primary);
  font-weight: 700;
}
.presets strong {
  min-width: 22px;
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--surface-muted);
  font-size: 0.64rem;
}
.controls {
  flex-wrap: wrap;
  padding: 12px;
}
.controls > :deep(.p-select),
.controls > :deep(.p-multiselect) {
  min-width: 180px;
  flex: 1 1 180px;
}
.advanced-toggle {
  min-height: 42px;
  margin-left: auto;
  white-space: nowrap;
}
.advanced-controls {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  width: 100%;
  gap: 10px;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle);
}
.controls :deep(.p-select),
.controls :deep(.p-multiselect),
.controls :deep(.p-inputtext) {
  width: 100%;
}
@media (max-width: 700px) {
  .presets {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    overflow: visible;
  }
  .presets button {
    justify-content: center;
    min-width: 0;
    white-space: normal;
  }
  .presets button:last-child {
    grid-column: 1 / -1;
  }
  .controls {
    align-items: stretch;
  }
  .advanced-toggle {
    width: 100%;
    margin-left: 0;
  }
  .advanced-controls {
    grid-template-columns: 1fr;
  }
  .controls :deep(.p-select),
  .controls :deep(.p-multiselect),
  .controls :deep(.p-inputtext) {
    width: 100%;
  }
}
</style>
