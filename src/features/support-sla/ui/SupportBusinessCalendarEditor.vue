<script setup lang="ts">
import Button from 'primevue/button';
import DatePicker from 'primevue/datepicker';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import {
  createSupportSlaLocalId,
  type SupportSlaConfigurationForm,
  type SupportSlaExceptionForm,
  type SupportSlaFormIssue,
  type SupportSlaTimeIntervalForm,
} from '../model/support-sla-configuration-form';

defineProps<{
  readonly: boolean;
  issues: SupportSlaFormIssue[];
}>();
const form = defineModel<SupportSlaConfigurationForm>({ required: true });

const weekdayLabels = [
  'Понедельник',
  'Вторник',
  'Среда',
  'Четверг',
  'Пятница',
  'Суббота',
  'Воскресенье',
];

function newInterval(): SupportSlaTimeIntervalForm {
  return {
    id: createSupportSlaLocalId('interval'),
    start: '09:00',
    end: '18:00',
  };
}

function addWeekdayInterval(dayIndex: number): void {
  form.value.weekly[dayIndex]?.intervals.push(newInterval());
}

function removeWeekdayInterval(dayIndex: number, intervalIndex: number): void {
  form.value.weekly[dayIndex]?.intervals.splice(intervalIndex, 1);
}

function addException(): void {
  form.value.exceptions.push({
    id: createSupportSlaLocalId('exception'),
    localDate: '',
    intervals: [],
  });
}

function addExceptionInterval(exception: SupportSlaExceptionForm): void {
  exception.intervals.push(newInterval());
}

function dateValue(value: string): Date | null {
  return value ? new Date(`${value}T12:00:00`) : null;
}

function updateDate(exception: SupportSlaExceptionForm, value: unknown): void {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!(candidate instanceof Date)) {
    exception.localDate = '';
    return;
  }
  const date = candidate;
  exception.localDate = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}
</script>

<template>
  <section class="sla-editor-panel" aria-labelledby="business-calendar-title">
    <header class="sla-editor-panel__header">
      <div>
        <span class="section-kicker">Шаг 1</span>
        <h2 id="business-calendar-title">Рабочий календарь</h2>
        <p>Время считается только внутри этих интервалов и исключений.</p>
      </div>
      <span class="sla-editor-panel__counter">{{ form.exceptions.length }} исключений</span>
    </header>

    <label class="sla-field sla-timezone-field">
      <span>Часовой пояс IANA</span>
      <InputText
        v-model="form.timeZone"
        aria-label="Часовой пояс"
        placeholder="Europe/Madrid"
        :disabled="readonly"
      />
      <small>Сервер применяет актуальную tzdb и правила перехода на летнее время.</small>
    </label>

    <Message
      v-for="issue in issues.filter((item) => item.path === 'calendar.timeZone')"
      :key="`${issue.code}-${issue.path}`"
      severity="error"
      :closable="false"
      >{{ issue.message }}</Message
    >

    <div class="weekday-list">
      <article v-for="(day, dayIndex) in form.weekly" :key="day.isoWeekday" class="weekday-row">
        <div class="weekday-row__label">
          <strong>{{ weekdayLabels[dayIndex] }}</strong>
          <small>{{
            day.intervals.length ? `${day.intervals.length} интервал(а)` : 'Выходной'
          }}</small>
        </div>
        <div class="interval-list">
          <div
            v-for="(interval, intervalIndex) in day.intervals"
            :key="interval.id"
            class="interval-row"
          >
            <label>
              <span class="sr-only">Начало, {{ weekdayLabels[dayIndex] }}</span>
              <input v-model="interval.start" type="time" :disabled="readonly" />
            </label>
            <i class="pi pi-arrow-right" aria-hidden="true" />
            <label>
              <span class="sr-only">Конец, {{ weekdayLabels[dayIndex] }}</span>
              <input v-model="interval.end" type="time" :disabled="readonly" />
            </label>
            <Button
              v-if="!readonly"
              type="button"
              icon="pi pi-times"
              severity="secondary"
              text
              :aria-label="`Удалить интервал, ${weekdayLabels[dayIndex]}`"
              @click="removeWeekdayInterval(dayIndex, intervalIndex)"
            />
          </div>
          <Button
            v-if="!readonly && day.intervals.length < 8"
            type="button"
            label="Добавить время"
            icon="pi pi-plus"
            severity="secondary"
            text
            @click="addWeekdayInterval(dayIndex)"
          />
        </div>
      </article>
    </div>

    <Message
      v-for="issue in issues.filter((item) => item.path.startsWith('calendar.weekly'))"
      :key="`${issue.code}-${issue.path}`"
      severity="error"
      :closable="false"
      >{{ issue.message }}</Message
    >

    <section class="calendar-exceptions" aria-labelledby="calendar-exceptions-title">
      <header>
        <div>
          <h3 id="calendar-exceptions-title">Исключения</h3>
          <p>Пустой день закрывает календарь. Интервалы заменяют обычное расписание.</p>
        </div>
        <Button
          v-if="!readonly"
          type="button"
          label="Добавить дату"
          icon="pi pi-plus"
          severity="secondary"
          outlined
          @click="addException"
        />
      </header>
      <p v-if="!form.exceptions.length" class="calendar-exceptions__empty">
        Исключений пока нет. Обычное недельное расписание применяется ко всем датам.
      </p>
      <article
        v-for="(exception, exceptionIndex) in form.exceptions"
        :key="exception.id"
        class="exception-row"
      >
        <DatePicker
          :model-value="dateValue(exception.localDate)"
          date-format="yy-mm-dd"
          show-icon
          icon-display="input"
          :manual-input="false"
          :disabled="readonly"
          :aria-label="`Дата исключения ${exceptionIndex + 1}`"
          @update:model-value="updateDate(exception, $event)"
        />
        <div class="interval-list">
          <div
            v-for="(interval, intervalIndex) in exception.intervals"
            :key="interval.id"
            class="interval-row"
          >
            <input
              v-model="interval.start"
              type="time"
              :disabled="readonly"
              aria-label="Начало исключения"
            />
            <i class="pi pi-arrow-right" aria-hidden="true" />
            <input
              v-model="interval.end"
              type="time"
              :disabled="readonly"
              aria-label="Конец исключения"
            />
            <Button
              v-if="!readonly"
              type="button"
              icon="pi pi-times"
              severity="secondary"
              text
              aria-label="Удалить интервал исключения"
              @click="exception.intervals.splice(intervalIndex, 1)"
            />
          </div>
          <Button
            v-if="!readonly && exception.intervals.length < 8"
            type="button"
            :label="exception.intervals.length ? 'Добавить время' : 'Сделать рабочим днём'"
            icon="pi pi-plus"
            severity="secondary"
            text
            @click="addExceptionInterval(exception)"
          />
        </div>
        <Button
          v-if="!readonly"
          type="button"
          icon="pi pi-trash"
          severity="danger"
          text
          :aria-label="`Удалить исключение ${exceptionIndex + 1}`"
          @click="form.exceptions.splice(exceptionIndex, 1)"
        />
      </article>
    </section>

    <Message
      v-for="issue in issues.filter((item) => item.path.startsWith('calendar.exceptions'))"
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
  gap: 20px;
  padding: 20px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface-card);
}
.sla-editor-panel__header,
.calendar-exceptions > header {
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
.sla-editor-panel h3 {
  margin: 0;
  font-size: 0.94rem;
  letter-spacing: -0.01em;
}
.sla-editor-panel p {
  margin: 5px 0 0;
  color: var(--text-secondary);
  font-size: 0.78rem;
}
.sla-editor-panel__counter {
  color: var(--text-secondary);
  font-size: 0.72rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.sla-field {
  display: grid;
  gap: 7px;
}
.sla-field > span {
  font-size: 0.8rem;
  font-weight: 700;
}
.sla-field small {
  color: var(--text-tertiary);
  font-size: 0.7rem;
  line-height: 1.45;
}
.sla-timezone-field {
  max-width: 460px;
}
.weekday-list {
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 14px;
}
.weekday-row {
  display: grid;
  grid-template-columns: minmax(130px, 0.55fr) minmax(0, 1.45fr);
  gap: 12px;
  min-height: 60px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--line);
}
.weekday-row:last-child {
  border-bottom: 0;
}
.weekday-row__label {
  padding-top: 7px;
}
.weekday-row__label strong,
.weekday-row__label small {
  display: block;
}
.weekday-row__label strong {
  font-size: 0.8rem;
}
.weekday-row__label small {
  margin-top: 3px;
  color: var(--text-tertiary);
  font-size: 0.68rem;
}
.interval-list {
  display: grid;
  gap: 6px;
  min-width: 0;
}
.interval-row {
  display: grid;
  grid-template-columns: minmax(102px, 1fr) 16px minmax(102px, 1fr) 40px;
  align-items: center;
  gap: 6px;
}
.interval-row > i {
  color: var(--text-tertiary);
  font-size: 0.66rem;
  text-align: center;
}
.interval-row input {
  width: 100%;
  min-height: 40px;
  padding: 7px 10px;
  color: var(--text-primary);
  background: var(--input-background);
  border: 1px solid var(--input-border);
  border-radius: 10px;
}
.calendar-exceptions {
  display: grid;
  gap: 12px;
  padding-top: 4px;
}
.calendar-exceptions__empty {
  padding: 14px;
  background: var(--surface-subtle);
  border-radius: 12px;
}
.exception-row {
  display: grid;
  grid-template-columns: minmax(180px, 0.7fr) minmax(0, 1.3fr) 40px;
  align-items: start;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface-subtle);
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}
@media (max-width: 720px) {
  .sla-editor-panel {
    padding: 16px;
  }
  .weekday-row {
    grid-template-columns: 1fr;
    gap: 4px;
  }
  .weekday-row__label {
    padding-top: 0;
  }
  .exception-row {
    grid-template-columns: 1fr 40px;
  }
  .exception-row > .interval-list {
    grid-column: 1 / -1;
    grid-row: 2;
  }
}
@media (max-width: 480px) {
  .interval-row {
    grid-template-columns: 1fr 16px 1fr 40px;
  }
  .sla-editor-panel__header,
  .calendar-exceptions > header {
    flex-direction: column;
  }
  .calendar-exceptions > header :deep(.p-button) {
    width: 100%;
  }
}
</style>
