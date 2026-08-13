<script setup lang="ts">
import Button from 'primevue/button';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import MultiSelect from 'primevue/multiselect';
import Select from 'primevue/select';
import type { QueuePredicate } from '../model/routing-control-plane';

defineOptions({ name: 'QueuePredicateEditor' });
type PresentationOption = Readonly<{ label: string; value: string }>;
const props = withDefaults(
  defineProps<{
    modelValue: QueuePredicate;
    removable?: boolean;
    teamOptions?: PresentationOption[];
    operatorOptions?: PresentationOption[];
  }>(),
  { teamOptions: () => [], operatorOptions: () => [] },
);
const emit = defineEmits<{ 'update:modelValue': [QueuePredicate]; remove: [] }>();
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const group = (value: QueuePredicate) =>
  value.kind === 'AND' || value.kind === 'OR' || value.kind === 'NOT';

function replacement(kind: QueuePredicate['kind']): QueuePredicate {
  if (kind === 'AND' || kind === 'OR')
    return { kind, children: [{ kind: 'BOOLEAN', field: 'ACTIONABLE', value: true }] };
  if (kind === 'NOT') return { kind, child: { kind: 'BOOLEAN', field: 'ACTIONABLE', value: true } };
  if (kind === 'ENUM_IN') return { kind, field: 'STATUS', values: ['OPEN'] };
  if (kind === 'ID_IN') return { kind, field: 'ASSIGNED_TEAM_ID', values: [] };
  if (kind === 'TIME_RANGE') return { kind, field: 'CREATED_AT', from: null, to: null };
  if (kind === 'RELATIVE_WINDOW') return { kind, field: 'UNASSIGNED_AGE', days: 1 };
  return { kind: 'BOOLEAN', field: 'ACTIONABLE', value: true };
}
function update(patch: Record<string, unknown>): void {
  emit('update:modelValue', { ...clone(props.modelValue), ...patch } as QueuePredicate);
}
function setChild(index: number, value: QueuePredicate): void {
  if (props.modelValue.kind === 'AND' || props.modelValue.kind === 'OR') {
    const children = clone(props.modelValue.children);
    children[index] = value;
    update({ children });
  } else if (props.modelValue.kind === 'NOT') update({ child: value });
}
function removeChild(index: number): void {
  if (props.modelValue.kind !== 'AND' && props.modelValue.kind !== 'OR') return;
  const children = clone(props.modelValue.children);
  children.splice(index, 1);
  if (children.length) update({ children });
}
function addChild(): void {
  if (props.modelValue.kind !== 'AND' && props.modelValue.kind !== 'OR') return;
  update({ children: [...props.modelValue.children, replacement('BOOLEAN')] });
}
function commaValues(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
const closedEnumOptions: Partial<
  Record<Extract<QueuePredicate, { kind: 'ENUM_IN' }>['field'], PresentationOption[]>
> = {
  STATUS: [
    { label: 'Открыто', value: 'OPEN' },
    { label: 'В работе', value: 'IN_PROGRESS' },
    { label: 'Ожидает сотрудника', value: 'WAITING_ADMIN' },
    { label: 'Ожидает клиента', value: 'WAITING_END_USER' },
    { label: 'Ожидает систему', value: 'WAITING_SYSTEM' },
    { label: 'Решено', value: 'RESOLVED' },
    { label: 'Не решено', value: 'UNRESOLVED' },
    { label: 'Отменено', value: 'CANCELLED' },
  ],
  PRIORITY: [
    { label: 'Низкий', value: 'LOW' },
    { label: 'Обычный', value: 'NORMAL' },
    { label: 'Высокий', value: 'HIGH' },
    { label: 'Срочный', value: 'URGENT' },
  ],
  IMPACT: [
    { label: 'Низкое', value: 'LOW' },
    { label: 'Среднее', value: 'MEDIUM' },
    { label: 'Высокое', value: 'HIGH' },
    { label: 'Критическое', value: 'CRITICAL' },
  ],
  URGENCY: [
    { label: 'Низкая', value: 'LOW' },
    { label: 'Средняя', value: 'MEDIUM' },
    { label: 'Высокая', value: 'HIGH' },
    { label: 'Немедленная', value: 'IMMEDIATE' },
  ],
  ASSIGNMENT_STATE: [
    { label: 'Назначено', value: 'ASSIGNED' },
    { label: 'Не назначено', value: 'UNASSIGNED' },
  ],
  SLA_RISK: [
    { label: 'В срок', value: 'ON_TRACK' },
    { label: 'Есть риск', value: 'AT_RISK' },
    { label: 'Срок нарушен', value: 'BREACHED' },
  ],
  SLA_CLOCK_KIND: [
    { label: 'Первый ответ', value: 'FIRST_HUMAN_RESPONSE' },
    { label: 'Следующий ответ', value: 'NEXT_HUMAN_RESPONSE' },
    { label: 'Решение', value: 'RESOLUTION' },
  ],
  BREACH_STATE: [
    { label: 'Срок нарушен', value: 'BREACHED' },
    { label: 'Срок не нарушен', value: 'NOT_BREACHED' },
  ],
};
function enumOptions(
  field: Extract<QueuePredicate, { kind: 'ENUM_IN' }>['field'],
): PresentationOption[] | undefined {
  return closedEnumOptions[field];
}
function identifierOptions(
  field: Extract<QueuePredicate, { kind: 'ID_IN' }>['field'],
): PresentationOption[] {
  return field === 'ASSIGNED_TEAM_ID' ? props.teamOptions : props.operatorOptions;
}
</script>

<template>
  <div class="predicate" :class="{ 'predicate--group': group(modelValue) }">
    <div class="predicate__line">
      <Select
        :model-value="modelValue.kind"
        :options="[
          { label: 'Все условия', value: 'AND' },
          { label: 'Любое условие', value: 'OR' },
          { label: 'Исключить', value: 'NOT' },
          { label: 'Значение из списка', value: 'ENUM_IN' },
          { label: 'Идентификатор из списка', value: 'ID_IN' },
          { label: 'Да или нет', value: 'BOOLEAN' },
          { label: 'Диапазон времени', value: 'TIME_RANGE' },
          { label: 'Период в днях', value: 'RELATIVE_WINDOW' },
        ]"
        option-label="label"
        option-value="value"
        aria-label="Тип условия"
        @update:model-value="emit('update:modelValue', replacement($event))"
      />
      <template v-if="modelValue.kind === 'ENUM_IN'">
        <Select
          :model-value="modelValue.field"
          :options="[
            { label: 'Состояние', value: 'STATUS' },
            { label: 'Приоритет', value: 'PRIORITY' },
            { label: 'Влияние', value: 'IMPACT' },
            { label: 'Срочность', value: 'URGENCY' },
            { label: 'Тема', value: 'TOPIC_GROUP' },
            { label: 'Язык', value: 'LANGUAGE' },
            { label: 'Назначение', value: 'ASSIGNMENT_STATE' },
            { label: 'Риск срока', value: 'SLA_RISK' },
            { label: 'Вид срока', value: 'SLA_CLOCK_KIND' },
            { label: 'Нарушение срока', value: 'BREACH_STATE' },
          ]"
          option-label="label"
          option-value="value"
          aria-label="Поле условия"
          @update:model-value="update({ field: $event })"
        />
        <MultiSelect
          v-if="enumOptions(modelValue.field)"
          :model-value="modelValue.values"
          :options="enumOptions(modelValue.field)"
          option-label="label"
          option-value="value"
          display="chip"
          aria-label="Допустимые значения"
          @update:model-value="update({ values: $event })"
        />
        <InputText
          v-else
          :model-value="modelValue.values.join(', ')"
          :placeholder="modelValue.field === 'LANGUAGE' ? 'ru, en' : 'Тема обращения'"
          aria-label="Значения через запятую"
          @update:model-value="update({ values: commaValues(String($event)) })"
        />
      </template>
      <template v-else-if="modelValue.kind === 'ID_IN'">
        <Select
          :model-value="modelValue.field"
          :options="[
            { label: 'Команда', value: 'ASSIGNED_TEAM_ID' },
            { label: 'Оператор', value: 'ASSIGNED_OPERATOR_ID' },
          ]"
          option-label="label"
          option-value="value"
          aria-label="Поле идентификатора"
          @update:model-value="update({ field: $event })"
        />
        <MultiSelect
          :model-value="modelValue.values"
          :options="identifierOptions(modelValue.field)"
          option-label="label"
          option-value="value"
          display="chip"
          filter
          aria-label="Выбранные участники"
          @update:model-value="update({ values: $event })"
        />
      </template>
      <template v-else-if="modelValue.kind === 'BOOLEAN'">
        <Select
          :model-value="modelValue.field"
          :options="[
            { label: 'Требует внимания', value: 'ADMIN_ATTENTION_REQUIRED' },
            { label: 'Работает с ограничениями', value: 'DEGRADED' },
            { label: 'Можно назначать', value: 'ACTIONABLE' },
          ]"
          option-label="label"
          option-value="value"
          aria-label="Поле условия"
          @update:model-value="update({ field: $event })"
        />
        <Select
          :model-value="modelValue.value"
          :options="[
            { label: 'Да', value: true },
            { label: 'Нет', value: false },
          ]"
          option-label="label"
          option-value="value"
          aria-label="Значение условия"
          @update:model-value="update({ value: $event })"
        />
      </template>
      <template v-else-if="modelValue.kind === 'TIME_RANGE'">
        <Select
          :model-value="modelValue.field"
          :options="[
            { label: 'Создано', value: 'CREATED_AT' },
            { label: 'Последняя активность', value: 'LAST_ACTIVITY_AT' },
            { label: 'Ожидает с', value: 'WAITING_SINCE' },
            { label: 'Переоткрыто', value: 'REOPENED_AT' },
            { label: 'Срок ответа', value: 'SLA_DUE_AT' },
          ]"
          option-label="label"
          option-value="value"
          aria-label="Поле времени"
          @update:model-value="update({ field: $event })"
        />
        <InputText
          :model-value="modelValue.from ?? ''"
          placeholder="От, ISO 8601"
          aria-label="Начало диапазона"
          @update:model-value="update({ from: String($event).trim() || null })"
        />
        <InputText
          :model-value="modelValue.to ?? ''"
          placeholder="До, ISO 8601"
          aria-label="Конец диапазона"
          @update:model-value="update({ to: String($event).trim() || null })"
        />
      </template>
      <template v-else-if="modelValue.kind === 'RELATIVE_WINDOW'">
        <Select
          :model-value="modelValue.field"
          :options="[
            { label: 'Без назначения', value: 'UNASSIGNED_AGE' },
            { label: 'Ожидает ответа', value: 'WAITING_AGE' },
            { label: 'До срока ответа', value: 'SLA_DUE_IN' },
            { label: 'После решения', value: 'RESOLVED_AGE' },
          ]"
          option-label="label"
          option-value="value"
          aria-label="Поле периода"
          @update:model-value="update({ field: $event })"
        />
        <InputNumber
          :model-value="modelValue.days"
          :min="1"
          :max="366"
          suffix=" дн."
          aria-label="Количество дней"
          @update:model-value="update({ days: $event })"
        />
      </template>
      <Button
        v-if="removable"
        icon="pi pi-trash"
        text
        rounded
        severity="secondary"
        aria-label="Удалить условие"
        @click="emit('remove')"
      />
    </div>
    <div v-if="modelValue.kind === 'AND' || modelValue.kind === 'OR'" class="predicate__children">
      <QueuePredicateEditor
        v-for="(child, index) in modelValue.children"
        :key="index"
        :model-value="child"
        :team-options="teamOptions"
        :operator-options="operatorOptions"
        removable
        @update:model-value="setChild(index, $event)"
        @remove="removeChild(index)"
      />
      <Button
        label="Добавить вложенное условие"
        icon="pi pi-plus"
        size="small"
        text
        @click="addChild"
      />
    </div>
    <div v-else-if="modelValue.kind === 'NOT'" class="predicate__children">
      <QueuePredicateEditor
        :model-value="modelValue.child"
        :team-options="teamOptions"
        :operator-options="operatorOptions"
        @update:model-value="setChild(0, $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.predicate {
  display: grid;
  gap: 10px;
  min-width: 0;
}
.predicate--group {
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: color-mix(in srgb, var(--surface) 84%, transparent);
}
.predicate__line {
  display: grid;
  grid-template-columns: minmax(150px, 0.8fr) repeat(3, minmax(120px, 1fr)) auto;
  gap: 8px;
  align-items: center;
  min-width: 0;
}
.predicate__children {
  display: grid;
  gap: 10px;
  padding-left: 18px;
  border-left: 2px solid color-mix(in srgb, var(--primary) 25%, var(--border));
}
@media (max-width: 760px) {
  .predicate__line {
    grid-template-columns: 1fr;
  }
  .predicate__children {
    padding-left: 8px;
  }
}
</style>
