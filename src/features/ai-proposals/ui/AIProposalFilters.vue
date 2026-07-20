<script setup lang="ts">
import DatePicker from "primevue/datepicker";
import InputText from "primevue/inputtext";
import Select from "primevue/select";
import type {
  AIProposalFilters,
  AIProposalKind,
  AIProposalPreset,
  AIProposalPriority,
  AIProposalSort,
} from "../model/ai-proposal";
import { russianCount } from "@/shared/lib/russian-count";

const props = withDefaults(
  defineProps<{
    modelValue: AIProposalFilters;
    openCount?: number;
    unreadCount?: number;
  }>(),
  { openCount: 0, unreadCount: 0 },
);
const emit = defineEmits<{ "update:modelValue": [value: AIProposalFilters] }>();

const presets: Array<{ value: AIProposalPreset; label: string }> = [
  { value: "OPEN", label: "Открытые" },
  { value: "UNREAD", label: "Непрочитанные" },
  { value: "COMPLETED", label: "Завершённые" },
];
const kinds: Array<{ value: AIProposalKind | undefined; label: string }> = [
  { value: undefined, label: "Все типы" },
  { value: "ADMIN_ATTENTION", label: "Запрос внимания" },
  { value: "INSIGHT", label: "Наблюдение" },
  { value: "ACTION_RECOMMENDATION", label: "Рекомендация" },
];
const priorities: Array<{
  value: AIProposalPriority | undefined;
  label: string;
}> = [
  { value: undefined, label: "Любой приоритет" },
  { value: "URGENT", label: "Срочный" },
  { value: "HIGH", label: "Высокий" },
  { value: "NORMAL", label: "Обычный" },
  { value: "LOW", label: "Низкий" },
];
const sorts: Array<{ value: AIProposalSort; label: string }> = [
  { value: "ATTENTION_FIRST", label: "Сначала требующие решения" },
  { value: "NEWEST", label: "Сначала новые" },
  { value: "OLDEST", label: "Сначала старые" },
];

function update(patch: Partial<AIProposalFilters>): void {
  emit("update:modelValue", { ...props.modelValue, ...patch });
}

function dateValue(value?: string): Date | null {
  if (!value) return null;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateBoundary(
  value: Date | null,
  endOfDay = false,
): string | undefined {
  if (!value) return undefined;
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`;
}
</script>

<template>
  <div class="proposal-filters card">
    <div class="preset-tabs" aria-label="Состояние предложений">
      <button
        v-for="preset in presets"
        :key="preset.value"
        :data-preset="preset.value"
        type="button"
        :class="{ active: modelValue.preset === preset.value }"
        :aria-pressed="modelValue.preset === preset.value"
        @click="update({ preset: preset.value })"
      >
        <span>{{ preset.label }}</span>
        <span
          v-if="
            (preset.value === 'OPEN' && openCount > 0) ||
            (preset.value === 'UNREAD' && unreadCount > 0)
          "
          class="tab-notice"
          :aria-label="
            preset.value === 'OPEN'
              ? `${russianCount(openCount, ['предложение требует', 'предложения требуют', 'предложений требуют'])} решения`
              : russianCount(unreadCount, [
                  'непрочитанное предложение',
                  'непрочитанных предложения',
                  'непрочитанных предложений',
                ])
          "
          >{{ preset.value === "OPEN" ? openCount : unreadCount }}</span
        >
      </button>
    </div>
    <div class="filter-fields">
      <label class="filter-field">
        <span>Тип запроса</span>
        <Select
          :model-value="modelValue.kind"
          :options="kinds"
          option-label="label"
          option-value="value"
          aria-label="Тип запроса"
          @update:model-value="update({ kind: $event })"
        />
      </label>
      <label class="filter-field">
        <span>Приоритет</span>
        <Select
          :model-value="modelValue.priority"
          :options="priorities"
          option-label="label"
          option-value="value"
          aria-label="Приоритет"
          @update:model-value="update({ priority: $event })"
        />
      </label>
      <label class="filter-field sort-field">
        <span>Порядок показанных карточек</span>
        <Select
          :model-value="modelValue.sort"
          :options="sorts"
          option-label="label"
          option-value="value"
          aria-label="Порядок показанных карточек"
          @update:model-value="update({ sort: $event })"
        />
        <small>Меняет порядок среди уже загруженных карточек.</small>
      </label>
      <label class="filter-field user-field">
        <span>Пользователь</span>
        <InputText
          :model-value="modelValue.endUserId"
          aria-label="Идентификатор пользователя"
          placeholder="Например, user_123"
          @update:model-value="update({ endUserId: $event || undefined })"
        />
      </label>
      <label class="filter-field date-filter">
        <span>Создано от</span>
        <DatePicker
          :model-value="dateValue(modelValue.createdFrom)"
          date-format="dd.mm.yy"
          show-icon
          icon-display="input"
          placeholder="дд.мм.гггг"
          aria-label="Дата создания от"
          @update:model-value="
            update({ createdFrom: dateBoundary($event as Date | null) })
          "
        />
      </label>
      <label class="filter-field date-filter">
        <span>Создано до</span>
        <DatePicker
          :model-value="dateValue(modelValue.createdTo)"
          date-format="dd.mm.yy"
          show-icon
          icon-display="input"
          placeholder="дд.мм.гггг"
          aria-label="Дата создания до"
          @update:model-value="
            update({ createdTo: dateBoundary($event as Date | null, true) })
          "
        />
      </label>
    </div>
  </div>
</template>

<style scoped>
.proposal-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px;
  border-radius: 16px;
}
.filter-field > small {
  color: var(--text-secondary);
  font-size: 0.63rem;
  line-height: 1.25;
}
.preset-tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  border-radius: 12px;
  background: var(--surface-subtle);
}
.preset-tabs button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 34px;
  padding: 0 12px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.73rem;
  font-weight: 700;
}
.preset-tabs button.active {
  background: var(--surface-card);
  color: var(--text-primary);
  box-shadow: 0 1px 4px color-mix(in srgb, var(--text-primary) 8%, transparent);
}
.tab-notice {
  display: inline-grid;
  place-items: center;
  min-width: 18px;
  height: 18px;
  padding-inline: 5px;
  color: var(--on-brand);
  font-size: 0.6rem;
  line-height: 1;
  background: var(--action-primary);
  border-radius: 999px;
}
.filter-fields {
  width: 100%;
  min-width: 0;
  flex: 1 1 700px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.filter-fields > * {
  min-width: 0;
}
.filter-fields :deep(.p-select),
.filter-fields :deep(.p-inputtext),
.filter-fields :deep(.p-datepicker) {
  width: 100%;
  min-width: 0;
  min-height: 38px;
  font-size: 0.74rem;
}
.filter-field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}
.filter-field > span {
  color: var(--text-tertiary);
  font-size: 0.58rem;
  font-weight: 700;
  text-transform: uppercase;
}
@media (max-width: 1120px) {
  .proposal-filters {
    align-items: stretch;
    flex-direction: column;
  }
  .preset-tabs {
    align-self: flex-start;
  }
  .filter-fields {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (max-width: 650px) {
  .proposal-filters {
    margin-inline: -4px;
  }
  .preset-tabs {
    width: 100%;
    overflow-x: auto;
  }
  .preset-tabs button {
    flex: 1 0 auto;
  }
  .filter-fields {
    grid-template-columns: 1fr 1fr;
  }
  .sort-field,
  .user-field {
    grid-column: 1 / -1;
  }
}
</style>
