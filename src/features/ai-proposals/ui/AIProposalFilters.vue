<script setup lang="ts">
import InputText from "primevue/inputtext";
import Select from "primevue/select";
import type {
  AIProposalFilters,
  AIProposalKind,
  AIProposalPreset,
  AIProposalPriority,
} from "../model/ai-proposal";

const props = defineProps<{ modelValue: AIProposalFilters }>();
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

function update(patch: Partial<AIProposalFilters>): void {
  emit("update:modelValue", { ...props.modelValue, ...patch });
}

function dateBoundary(value: string, endOfDay = false): string | undefined {
  if (!value) return undefined;
  return `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`;
}
</script>

<template>
  <div class="proposal-filters card">
    <div class="preset-tabs" aria-label="Состояние предложений">
      <button
        v-for="preset in presets"
        :key="preset.value"
        type="button"
        :class="{ active: modelValue.preset === preset.value }"
        :aria-pressed="modelValue.preset === preset.value"
        @click="update({ preset: preset.value })"
      >
        {{ preset.label }}
      </button>
    </div>
    <div class="filter-fields">
      <Select
        :model-value="modelValue.kind"
        :options="kinds"
        option-label="label"
        option-value="value"
        aria-label="Тип предложения"
        @update:model-value="update({ kind: $event })"
      />
      <Select
        :model-value="modelValue.priority"
        :options="priorities"
        option-label="label"
        option-value="value"
        aria-label="Приоритет"
        @update:model-value="update({ priority: $event })"
      />
      <InputText
        :model-value="modelValue.endUserId"
        aria-label="Внутренний ID пользователя"
        placeholder="ID пользователя"
        @update:model-value="update({ endUserId: $event || undefined })"
      />
      <label class="date-filter">
        <span>Создано от</span>
        <input
          type="date"
          :value="modelValue.createdFrom?.slice(0, 10)"
          @change="
            update({
              createdFrom: dateBoundary(
                ($event.target as HTMLInputElement).value,
              ),
            })
          "
        />
      </label>
      <label class="date-filter">
        <span>Создано до</span>
        <input
          type="date"
          :value="modelValue.createdTo?.slice(0, 10)"
          @change="
            update({
              createdTo: dateBoundary(
                ($event.target as HTMLInputElement).value,
                true,
              ),
            })
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
.preset-tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  border-radius: 12px;
  background: var(--surface-subtle);
}
.preset-tabs button {
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
.filter-fields {
  width: 100%;
  min-width: 0;
  flex: 1 1 700px;
  display: grid;
  grid-template-columns: 150px 160px minmax(140px, 180px) 128px 128px;
  gap: 8px;
}
.filter-fields > * {
  min-width: 0;
}
.filter-fields :deep(.p-select),
.filter-fields :deep(.p-inputtext),
.date-filter input {
  min-width: 0;
  min-height: 38px;
  font-size: 0.74rem;
}
.date-filter {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}
.date-filter span {
  color: var(--text-tertiary);
  font-size: 0.58rem;
  font-weight: 700;
  text-transform: uppercase;
}
.date-filter input {
  width: 100%;
  padding: 0 8px;
  border: 1px solid var(--input-border);
  border-radius: 10px;
  background: var(--input-background);
  color: var(--text-primary);
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
    grid-template-columns: repeat(5, minmax(0, 1fr));
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
  .filter-fields :deep(.p-inputtext) {
    grid-column: 1 / -1;
  }
}
</style>
