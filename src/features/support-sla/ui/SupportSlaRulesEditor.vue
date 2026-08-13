<script setup lang="ts">
import { ref } from 'vue';
import Button from 'primevue/button';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import MultiSelect from 'primevue/multiselect';
import Textarea from 'primevue/textarea';
import {
  createEmptySupportSlaRule,
  type SupportSlaConfigurationForm,
  type SupportSlaFormIssue,
} from '../model/support-sla-configuration-form';

defineProps<{
  readonly: boolean;
  issues: SupportSlaFormIssue[];
}>();
const form = defineModel<SupportSlaConfigurationForm>({ required: true });
const draggedRule = ref<number | null>(null);

const priorityOptions = [
  { label: 'Низкий', value: 'LOW' },
  { label: 'Обычный', value: 'NORMAL' },
  { label: 'Высокий', value: 'HIGH' },
  { label: 'Срочный', value: 'URGENT' },
  { label: 'Критический', value: 'CRITICAL' },
];
const caseTypeOptions = [
  { label: 'Информационный запрос', value: 'INFORMATION_REQUEST' },
  { label: 'Решение проблемы', value: 'PROBLEM_RESOLUTION' },
  { label: 'Поддержка решения', value: 'DECISION_SUPPORT' },
  { label: 'Запрос действия', value: 'ACTION_REQUEST' },
  { label: 'Обратная связь', value: 'FEEDBACK' },
  { label: 'Другое', value: 'OTHER' },
];
const pauseOptions = [
  { label: 'Ожидаем пользователя', value: 'WAITING_END_USER' },
  { label: 'Ожидаем систему', value: 'WAITING_SYSTEM' },
];

function isFallback(index: number): boolean {
  return index === form.value.rules.length - 1;
}

function addRule(): void {
  form.value.rules.splice(Math.max(0, form.value.rules.length - 1), 0, createEmptySupportSlaRule());
}

function moveRule(from: number, to: number): void {
  const fallbackIndex = form.value.rules.length - 1;
  if (from < 0 || to < 0 || from >= fallbackIndex || to >= fallbackIndex || from === to) return;
  const [rule] = form.value.rules.splice(from, 1);
  if (rule) form.value.rules.splice(to, 0, rule);
}

function dropRule(target: number): void {
  if (draggedRule.value !== null) moveRule(draggedRule.value, target);
  draggedRule.value = null;
}
</script>

<template>
  <section class="sla-editor-panel" aria-labelledby="sla-rules-title">
    <header class="sla-editor-panel__header">
      <div>
        <span class="section-kicker">Шаг 2</span>
        <h2 id="sla-rules-title">Правила SLA</h2>
        <p>Сервер применяет первое подходящее правило сверху вниз.</p>
      </div>
      <Button
        v-if="!readonly"
        type="button"
        label="Добавить правило"
        icon="pi pi-plus"
        severity="secondary"
        outlined
        :disabled="form.rules.length >= 100"
        @click="addRule"
      />
    </header>

    <div class="sla-rule-list">
      <details
        v-for="(rule, index) in form.rules"
        :key="rule.id"
        class="sla-rule"
        :class="{ 'sla-rule--fallback': isFallback(index) }"
        :open="index === 0 || isFallback(index)"
        @dragover.prevent
        @drop.prevent="dropRule(index)"
      >
        <summary
          :draggable="!readonly && !isFallback(index)"
          @dragstart="draggedRule = index"
          @dragend="draggedRule = null"
        >
          <span class="sla-rule__order">{{ index + 1 }}</span>
          <span class="sla-rule__summary">
            <strong>{{ rule.code || 'Новое правило' }}</strong>
            <small v-if="isFallback(index)">Обязательное правило для остальных обращений</small>
            <small v-else
              >Условий:
              {{
                rule.priorities.length +
                rule.caseTypes.length +
                (rule.groupCodesText.trim() ? 1 : 0)
              }}</small
            >
          </span>
          <span v-if="isFallback(index)" class="sla-rule__badge">Последнее</span>
          <i class="pi pi-chevron-down" aria-hidden="true" />
        </summary>

        <div class="sla-rule__body">
          <div
            v-if="!readonly && !isFallback(index)"
            class="sla-rule__controls"
            :aria-label="`Управление правилом ${index + 1}`"
          >
            <Button
              type="button"
              icon="pi pi-arrow-up"
              severity="secondary"
              text
              aria-label="Поднять правило"
              :disabled="index === 0"
              @click="moveRule(index, index - 1)"
            />
            <Button
              type="button"
              icon="pi pi-arrow-down"
              severity="secondary"
              text
              aria-label="Опустить правило"
              :disabled="index >= form.rules.length - 2"
              @click="moveRule(index, index + 1)"
            />
            <Button
              type="button"
              icon="pi pi-trash"
              severity="danger"
              text
              aria-label="Удалить правило"
              @click="form.rules.splice(index, 1)"
            />
          </div>
          <div class="rule-grid rule-grid--identity">
            <label class="sla-field">
              <span>Код правила</span>
              <InputText
                v-model="rule.code"
                :disabled="readonly"
                maxlength="64"
                placeholder="URGENT_CASES"
                :aria-label="`Код правила ${index + 1}`"
              />
              <small>Стабильный код из заглавных латинских символов, цифр и _.</small>
            </label>
            <label class="sla-field">
              <span>Порог риска</span>
              <InputNumber
                v-model="rule.atRiskRemainingPercent"
                :disabled="readonly"
                :min="1"
                :max="90"
                suffix=" %"
                :aria-label="`Порог риска правила ${index + 1}`"
              />
              <small>Обращение переходит в риск при таком остатке рабочего времени.</small>
            </label>
          </div>

          <section v-if="!isFallback(index)" class="rule-section">
            <header>
              <h3>Когда применять</h3>
              <p>Пустое измерение не ограничивает правило.</p>
            </header>
            <div class="rule-grid rule-grid--conditions">
              <label class="sla-field">
                <span>Приоритет</span>
                <MultiSelect
                  v-model="rule.priorities"
                  :options="priorityOptions"
                  option-label="label"
                  option-value="value"
                  display="chip"
                  :disabled="readonly"
                  placeholder="Любой приоритет"
                  :aria-label="`Приоритеты правила ${index + 1}`"
                />
              </label>
              <label class="sla-field">
                <span>Тип обращения</span>
                <MultiSelect
                  v-model="rule.caseTypes"
                  :options="caseTypeOptions"
                  option-label="label"
                  option-value="value"
                  display="chip"
                  :disabled="readonly"
                  placeholder="Любой тип"
                  :aria-label="`Типы обращений правила ${index + 1}`"
                />
              </label>
              <label class="sla-field rule-groups-field">
                <span>Коды групп</span>
                <Textarea
                  v-model="rule.groupCodesText"
                  :disabled="readonly"
                  rows="2"
                  placeholder="VIP&#10;ENTERPRISE"
                  :aria-label="`Коды групп правила ${index + 1}`"
                />
                <small
                  >По одному серверному коду на строку. Названия групп появятся после публикации
                  каталога.</small
                >
              </label>
            </div>
          </section>

          <section class="rule-section">
            <header>
              <h3>Цели в рабочем времени</h3>
              <p>От 1 минуты до 30 дней. Календарные паузы не расходуют цель.</p>
            </header>
            <div class="target-grid">
              <label class="sla-field">
                <span>Первый ответ</span>
                <InputNumber
                  v-model="rule.targetsMinutes.firstHumanResponse"
                  :disabled="readonly"
                  :min="1"
                  :max="43200"
                  suffix=" мин"
                  :aria-label="`Первый ответ правила ${index + 1}`"
                />
              </label>
              <label class="sla-field">
                <span>Следующий ответ</span>
                <InputNumber
                  v-model="rule.targetsMinutes.nextHumanResponse"
                  :disabled="readonly"
                  :min="1"
                  :max="43200"
                  suffix=" мин"
                  :aria-label="`Следующий ответ правила ${index + 1}`"
                />
              </label>
              <label class="sla-field">
                <span>Решение</span>
                <InputNumber
                  v-model="rule.targetsMinutes.resolution"
                  :disabled="readonly"
                  :min="1"
                  :max="43200"
                  suffix=" мин"
                  :aria-label="`Решение правила ${index + 1}`"
                />
              </label>
            </div>
          </section>

          <section class="rule-section">
            <header>
              <h3>Когда приостанавливать</h3>
              <p>Для каждого таймера задаётся независимый набор статусов ожидания.</p>
            </header>
            <div class="target-grid">
              <label class="sla-field">
                <span>Первый ответ</span>
                <MultiSelect
                  v-model="rule.firstHumanResponsePause"
                  :options="pauseOptions"
                  option-label="label"
                  option-value="value"
                  display="chip"
                  :disabled="readonly"
                  placeholder="Не ставить на паузу"
                  :aria-label="`Паузы первого ответа правила ${index + 1}`"
                />
              </label>
              <label class="sla-field">
                <span>Следующий ответ</span>
                <MultiSelect
                  v-model="rule.nextHumanResponsePause"
                  :options="pauseOptions"
                  option-label="label"
                  option-value="value"
                  display="chip"
                  :disabled="readonly"
                  placeholder="Не ставить на паузу"
                  :aria-label="`Паузы следующего ответа правила ${index + 1}`"
                />
              </label>
              <label class="sla-field">
                <span>Решение</span>
                <MultiSelect
                  v-model="rule.resolutionPause"
                  :options="pauseOptions"
                  option-label="label"
                  option-value="value"
                  display="chip"
                  :disabled="readonly"
                  placeholder="Не ставить на паузу"
                  :aria-label="`Паузы решения правила ${index + 1}`"
                />
              </label>
            </div>
          </section>

          <Message
            v-for="issue in issues.filter((item) => item.path === `policy.rules.${rule.id}`)"
            :key="`${issue.code}-${issue.path}`"
            severity="error"
            :closable="false"
            >{{ issue.message }}</Message
          >
        </div>
      </details>
    </div>

    <Message
      v-for="issue in issues.filter((item) => item.path === 'policy.rules')"
      :key="`${issue.code}-${issue.path}`"
      severity="error"
      :closable="false"
      >{{ issue.message }}</Message
    >
  </section>
</template>

<style scoped>
.sla-editor-panel {
  display: grid;
  gap: 16px;
  padding: 20px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface-card);
}
.sla-editor-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.section-kicker {
  color: var(--text-tertiary);
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}
.sla-editor-panel h2 {
  margin-top: 4px;
  font-size: 1.1rem;
}
.sla-editor-panel p {
  margin: 5px 0 0;
  color: var(--text-secondary);
  font-size: 0.78rem;
}
.sla-rule-list {
  display: grid;
  gap: 10px;
}
.sla-rule {
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface-card);
}
.sla-rule--fallback {
  border-color: color-mix(in srgb, var(--action-primary) 35%, var(--line));
  background: color-mix(in srgb, var(--status-accent-soft) 38%, var(--surface-card));
}
.sla-rule > summary {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) auto 16px;
  align-items: center;
  gap: 10px;
  min-height: 60px;
  padding: 9px 12px;
  cursor: pointer;
  list-style: none;
}
.sla-rule > summary::-webkit-details-marker {
  display: none;
}
.sla-rule__order {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  color: var(--text-secondary);
  background: var(--surface-subtle);
  border-radius: 10px;
  font-size: 0.76rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.sla-rule__summary strong,
.sla-rule__summary small {
  display: block;
}
.sla-rule__summary strong {
  font-size: 0.82rem;
}
.sla-rule__summary small {
  margin-top: 3px;
  color: var(--text-tertiary);
  font-size: 0.68rem;
}
.sla-rule__badge {
  padding: 5px 8px;
  color: var(--status-accent-text);
  background: var(--status-accent-soft);
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 800;
}
.sla-rule__controls {
  display: flex;
  justify-content: flex-end;
  gap: 2px;
  padding-top: 4px;
}
.sla-rule > summary > i {
  color: var(--text-tertiary);
  font-size: 0.7rem;
  transition: transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
}
.sla-rule[open] > summary > i {
  transform: rotate(180deg);
}
.sla-rule__body {
  display: grid;
  gap: 18px;
  padding: 4px 14px 16px;
  border-top: 1px solid var(--line);
}
.rule-section {
  display: grid;
  gap: 10px;
  padding-top: 14px;
}
.rule-section h3 {
  margin: 0;
  font-size: 0.86rem;
  letter-spacing: -0.01em;
}
.rule-section p {
  margin-top: 3px;
  font-size: 0.7rem;
}
.rule-grid,
.target-grid {
  display: grid;
  gap: 10px;
}
.rule-grid--identity {
  grid-template-columns: minmax(0, 1fr) minmax(180px, 0.45fr);
  padding-top: 14px;
}
.rule-grid--conditions {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.rule-groups-field {
  grid-column: 1 / -1;
}
.target-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.sla-field {
  display: grid;
  gap: 7px;
  min-width: 0;
}
.sla-field > span {
  font-size: 0.76rem;
  font-weight: 700;
}
.sla-field small {
  color: var(--text-tertiary);
  font-size: 0.68rem;
  line-height: 1.45;
}
@media (max-width: 760px) {
  .sla-editor-panel {
    padding: 16px;
  }
  .rule-grid--identity,
  .rule-grid--conditions,
  .target-grid {
    grid-template-columns: 1fr;
  }
  .sla-rule > summary {
    grid-template-columns: 32px minmax(0, 1fr) auto 16px;
  }
  .sla-rule__controls {
    justify-content: flex-start;
  }
}
@media (max-width: 480px) {
  .sla-editor-panel__header {
    flex-direction: column;
  }
  .sla-editor-panel__header :deep(.p-button) {
    width: 100%;
  }
  .sla-rule__badge {
    display: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .sla-rule > summary > i {
    transition: none;
  }
}
</style>
