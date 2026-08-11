<script setup lang="ts">
import { computed } from "vue";
import Button from "primevue/button";
import Message from "primevue/message";
import Tag from "primevue/tag";
import {
  calibrationBlockedReasonLabel,
  calibrationStateLabel,
} from "../model/support-case-intelligence-policy";
import type { CaseIntelligenceCalibrationResponseDto } from "@/shared/api/generated/models";

const props = defineProps<{
  calibration: CaseIntelligenceCalibrationResponseDto | null;
  loading: boolean;
  canPreview: boolean;
}>();

defineEmits<{ load: [] }>();

const passed = computed(
  () => props.calibration?.cells.filter((cell) => cell.coverageGatePassed).length ?? 0,
);
const total = computed(() => props.calibration?.cells.length ?? 0);

function decisionLabel(value: string) {
  const labels: Record<string, string> = {
    NO_CASE: "Без обращения",
    CREATE: "Создание",
    ATTACH: "Привязка",
    REOPEN: "Повторное открытие",
  };
  return labels[value] ?? "Неизвестное решение";
}

function channelLabel(value: string) {
  if (value === "TEXT") return "Текст";
  if (value === "VOICE") return "Голос";
  if (value === "TELEGRAM") return "Telegram";
  return "Неизвестный канал";
}

function intervalLabel(value: { lower: number; upper: number } | null) {
  if (!value) return "—";
  return `${Math.round(value.lower * 100)}–${Math.round(value.upper * 100)}%`;
}
</script>

<template>
<section class="calibration-card" aria-labelledby="calibration-title">
  <div class="calibration-heading">
    <div>
      <div class="card-kicker">Надёжность модели</div>
      <h2 id="calibration-title">Покрытие калибровки</h2>
      <p>
        Сервер проверяет отдельно каждое решение, язык и канал. Если данных
        мало, автоматическое действие остаётся заблокированным.
      </p>
    </div>
    <Button
      label="Проверить покрытие"
      icon="pi pi-chart-bar"
      severity="secondary"
      outlined
      :loading="loading"
      :disabled="!canPreview"
      @click="$emit('load')"
    />
  </div>

  <p v-if="!canPreview" class="permission-note">
    <i class="pi pi-lock" /> Для проверки покрытия нужен доступ к предпросмотру.
  </p>

  <template v-if="calibration">
    <div class="calibration-summary">
      <div>
        <span>Состояние</span>
        <strong>{{ calibrationStateLabel(calibration.state) }}</strong>
      </div>
      <div>
        <span>Группы с достаточным покрытием</span>
        <strong>{{ passed }} из {{ total }}</strong>
      </div>
      <div>
        <span>Минимум примеров</span>
        <strong>{{ calibration.minimumSamples ?? "Не задан" }}</strong>
      </div>
      <div>
        <span>Порог автоматического действия</span>
        <strong>{{ Math.round(calibration.autoApplyThreshold * 100) }}%</strong>
      </div>
    </div>

    <Message
      v-if="calibration.state !== 'READY'"
      severity="warn"
      :closable="false"
    >
      Часть групп не прошла проверку. Публикация правил не означает, что сервер
      разрешит автоматическое действие для этих групп.
    </Message>

    <div class="calibration-table-wrap" tabindex="0" aria-label="Таблица покрытия калибровки">
      <table class="calibration-table">
        <thead>
          <tr>
            <th scope="col">Решение</th>
            <th scope="col">Язык</th>
            <th scope="col">Канал</th>
            <th scope="col">Примеры</th>
            <th scope="col">Интервал</th>
            <th scope="col">Автоматическое действие</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="cell in calibration.cells" :key="`${cell.modelId}-${cell.category}-${cell.locale}-${cell.channel}`">
            <td>{{ decisionLabel(cell.category) }}</td>
            <td>{{ cell.locale }}</td>
            <td>{{ channelLabel(cell.channel) }}</td>
            <td>{{ cell.samples.toLocaleString("ru-RU") }}</td>
            <td>{{ intervalLabel(cell.confidenceInterval) }}</td>
            <td>
              <Tag
                :value="cell.coverageGatePassed ? 'Разрешено по покрытию' : calibrationBlockedReasonLabel(cell.autoApplyBlockedReason)"
                :severity="cell.coverageGatePassed ? 'success' : 'warn'"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </template>

  <div v-else class="calibration-empty">
    <i class="pi pi-chart-line" aria-hidden="true" />
    <div>
      <strong>Покрытие ещё не проверено</strong>
      <span>Запрос использует текущий черновик и ничего не меняет.</span>
    </div>
  </div>
</section>
</template>

<style scoped>
.calibration-card {
  display: grid;
  gap: 18px;
  padding: 24px;
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  background: var(--surface-card);
  box-shadow: var(--shadow-raised);
}
.calibration-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.calibration-heading h2 {
  margin: 5px 0 7px;
  font-size: 1.15rem;
}
.calibration-heading p {
  max-width: 720px;
  margin: 0;
  color: var(--text-secondary);
}
.card-kicker {
  color: var(--text-secondary);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.calibration-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border-block: 1px solid var(--border-subtle);
}
.calibration-summary > div {
  display: grid;
  gap: 4px;
  padding: 14px 12px;
}
.calibration-summary span,
.calibration-empty span {
  color: var(--text-secondary);
  font-size: 0.76rem;
}
.calibration-summary strong {
  font-variant-numeric: tabular-nums;
}
.calibration-table-wrap {
  max-height: 28rem;
  overflow: auto;
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
}
.calibration-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
}
.calibration-table th,
.calibration-table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-subtle);
  text-align: left;
  white-space: nowrap;
}
.calibration-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--surface-subtle);
  color: var(--text-secondary);
  font-size: 0.72rem;
}
.calibration-table td:nth-child(4),
.calibration-table td:nth-child(5) {
  font-variant-numeric: tabular-nums;
}
.calibration-empty,
.permission-note {
  display: flex;
  align-items: center;
  gap: 10px;
}
.calibration-empty {
  padding: 18px;
  border-radius: 10px;
  background: var(--surface-subtle);
}
.calibration-empty > div {
  display: grid;
  gap: 3px;
}
@media (max-width: 900px) {
  .calibration-summary {
    grid-template-columns: 1fr 1fr;
  }
}
@media (max-width: 620px) {
  .calibration-heading {
    display: grid;
  }
  .calibration-heading :deep(.p-button) {
    width: 100%;
  }
  .calibration-summary {
    grid-template-columns: 1fr;
  }
}
</style>
