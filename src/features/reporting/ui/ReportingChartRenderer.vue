<script setup lang="ts">
import { computed } from "vue";
import Skeleton from "primevue/skeleton";
import type {
  ReportingQueryResult,
  ReportingVisualization,
} from "../model/reporting-types";
import ReportingEvidenceRail from "./ReportingEvidenceRail.vue";

const props = defineProps<{
  result?: ReportingQueryResult | null;
  visualization: ReportingVisualization;
  loading?: boolean;
}>();

const number = new Intl.NumberFormat("ru");
const percent = new Intl.NumberFormat("ru", { maximumFractionDigits: 1 });

const values = computed(() => {
  const data = props.result?.data;
  if (!data) return [];
  if (data.kind === "TIME_SERIES") return data.points;
  if (data.kind === "CATEGORY") return data.values;
  if (data.kind === "SCALAR") return [{ label: "Значение", value: data.value }];
  return [];
});

const primaryValue = computed(() => {
  const data = props.result?.data;
  if (!data) return null;
  if (data.kind === "SCALAR") return data.value;
  if (data.kind === "TIME_SERIES") return data.points.at(-1)?.value ?? null;
  if (data.kind === "CATEGORY")
    return data.values.reduce((sum, item) => sum + item.value, 0);
  return null;
});

const primaryUnit = computed(() => {
  const data = props.result?.data;
  return data && data.kind !== "ROWS" ? data.unit : "";
});

const linePoints = computed(() => {
  const data = props.result?.data;
  if (!data || data.kind !== "TIME_SERIES" || data.points.length === 0)
    return "";
  const chartWidth = 600;
  const chartHeight = 176;
  const maximum = Math.max(...data.points.map((point) => point.value));
  const minimum = Math.min(...data.points.map((point) => point.value));
  const spread = Math.max(maximum - minimum, 1);
  return data.points
    .map((point, index) => {
      const x = (index / Math.max(data.points.length - 1, 1)) * chartWidth;
      const y =
        chartHeight -
        ((point.value - minimum) / spread) * (chartHeight - 20) -
        10;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
});

const categoryMaximum = computed(() =>
  Math.max(...values.value.map((item) => item.value), 1),
);
const categoryTotal = computed(() =>
  values.value.reduce((sum, item) => sum + item.value, 0),
);
const donutSegments = computed(() => {
  const circumference = 251.327;
  let offset = 0;
  return values.value.map((item, index) => {
    const length = categoryTotal.value
      ? (item.value / categoryTotal.value) * circumference
      : 0;
    const segment = { ...item, index, length, offset: -offset };
    offset += length;
    return segment;
  });
});

const tableRows = computed<Array<Record<string, string | number>>>(() => {
  const data = props.result?.data;
  if (!data) return [];
  if (data.kind === "ROWS") return data.rows;
  return values.value.map((item) => ({ label: item.label, value: item.value }));
});

const tableColumns = computed(() => {
  const data = props.result?.data;
  if (data?.kind === "ROWS") return data.columns;
  return [
    { key: "label", label: "Период / категория" },
    { key: "value", label: "Значение" },
  ];
});

function formattedValue(value: string | number): string {
  return typeof value === "number" ? number.format(value) : value;
}

function unitLabel(unit: string): string {
  if (unit === "users") return "пользователей";
  if (unit === "events") return "событий";
  if (unit === "orders") return "заказов";
  return unit;
}
</script>

<template>
  <section class="chart-shell" :aria-busy="loading">
    <div v-if="loading" class="chart-loading" aria-label="Расчёт отчёта">
      <Skeleton width="32%" height="2.8rem" />
      <Skeleton width="100%" height="12rem" />
      <Skeleton width="64%" height="0.9rem" />
    </div>

    <div v-else-if="!result" class="chart-empty">
      <span class="empty-orbit" aria-hidden="true"
        ><i class="pi pi-chart-line"
      /></span>
      <strong>Предпросмотр ещё не запущен</strong>
      <p>Настройте запрос и нажмите «Предпросмотр».</p>
    </div>

    <template v-else>
      <div class="result-header">
        <span class="result-kicker">Результат</span>
        <p>{{ result.summary }}</p>
      </div>

      <div
        v-if="visualization === 'KPI'"
        class="kpi-result"
        role="img"
        :aria-label="result.summary"
      >
        <strong>{{
          primaryValue === null ? "—" : number.format(primaryValue)
        }}</strong>
        <span>{{ unitLabel(primaryUnit) }}</span>
        <em
          v-if="
            result.data.kind === 'SCALAR' && result.data.delta !== undefined
          "
        >
          <i class="pi pi-arrow-up-right" aria-hidden="true" />
          {{ percent.format(result.data.delta) }}% к прошлому периоду
        </em>
      </div>

      <div
        v-else-if="
          visualization === 'LINE' && result.data.kind === 'TIME_SERIES'
        "
        class="line-chart"
        role="img"
        :aria-label="result.summary"
      >
        <svg
          viewBox="0 0 600 210"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <line
            v-for="y in [24, 76, 128, 180]"
            :key="y"
            x1="0"
            :y1="y"
            x2="600"
            :y2="y"
            class="grid-line"
          />
          <polyline :points="linePoints" class="trend-line" />
          <circle
            v-for="(point, index) in result.data.points"
            :key="point.label"
            :cx="(index / Math.max(result.data.points.length - 1, 1)) * 600"
            :cy="linePoints.split(' ')[index]?.split(',')[1]"
            r="4"
            class="trend-point"
          />
        </svg>
        <div class="axis-labels">
          <span>{{ result.data.points[0]?.label }}</span>
          <span>{{ result.data.points.at(-1)?.label }}</span>
        </div>
      </div>

      <div
        v-else-if="visualization === 'BAR' && result.data.kind === 'CATEGORY'"
        class="bar-chart"
        role="img"
        :aria-label="result.summary"
      >
        <div
          v-for="(item, index) in result.data.values"
          :key="item.label"
          class="bar-row"
        >
          <span>{{ item.label }}</span>
          <div class="bar-track" aria-hidden="true">
            <span
              :style="{
                '--bar-scale': item.value / categoryMaximum,
                '--bar-index': index,
              }"
            />
          </div>
          <strong>{{ number.format(item.value) }}</strong>
        </div>
      </div>

      <div
        v-else-if="visualization === 'DONUT' && result.data.kind === 'CATEGORY'"
        class="donut-layout"
        role="img"
        :aria-label="result.summary"
      >
        <div class="donut-visual" aria-hidden="true">
          <svg viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="40" class="donut-track" />
            <circle
              v-for="segment in donutSegments"
              :key="segment.label"
              cx="60"
              cy="60"
              r="40"
              :class="`donut-segment series-${(segment.index % 6) + 1}`"
              :stroke-dasharray="`${segment.length} ${251.327 - segment.length}`"
              :stroke-dashoffset="segment.offset"
            />
          </svg>
          <div>
            <strong>{{ number.format(categoryTotal) }}</strong
            ><span>всего</span>
          </div>
        </div>
        <ul class="donut-legend">
          <li
            v-for="(item, index) in result.data.values"
            :key="item.label"
            class="donut-legend-item"
          >
            <i
              :class="`series-dot series-${(index % 6) + 1}`"
              aria-hidden="true"
            />
            <span>{{ item.label }}</span>
            <strong>{{ number.format(item.value) }}</strong>
            <em>{{ percent.format((item.value / categoryTotal) * 100) }}%</em>
          </li>
        </ul>
      </div>

      <div
        v-else-if="visualization === 'TABLE'"
        class="table-result"
        role="region"
        aria-label="Таблица результата"
      >
        <table>
          <thead>
            <tr>
              <th v-for="column in tableColumns" :key="column.key">
                {{ column.label }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in tableRows" :key="index">
              <td v-for="column in tableColumns" :key="column.key">
                {{ formattedValue(row[column.key] ?? "—") }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <details v-if="visualization !== 'TABLE'" class="data-table-alternative">
        <summary>Таблица данных</summary>
        <div class="table-result">
          <table>
            <thead>
              <tr>
                <th v-for="column in tableColumns" :key="column.key">
                  {{ column.label }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, index) in tableRows" :key="index">
                <td v-for="column in tableColumns" :key="column.key">
                  {{ formattedValue(row[column.key] ?? "—") }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>

      <ReportingEvidenceRail :receipt="result.receipt" />
    </template>
  </section>
</template>

<style scoped>
.chart-shell {
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  background: var(--surface-card);
}

.chart-loading,
.chart-empty {
  display: grid;
  min-height: 420px;
  align-content: center;
  gap: 20px;
  padding: 32px;
}

.chart-empty {
  place-items: center;
  gap: 8px;
  color: var(--text-secondary);
  text-align: center;
}

.chart-empty strong {
  color: var(--text-primary);
  font-family: var(--font-display);
}

.chart-empty p {
  margin: 0;
}

.empty-orbit {
  display: grid;
  width: 64px;
  height: 64px;
  margin-bottom: 8px;
  place-items: center;
  border-radius: 50%;
  background: var(--status-accent-soft);
  color: var(--status-accent-text);
  font-size: 1.5rem;
}

.result-header {
  padding: 20px 24px 0;
}

.result-kicker {
  color: var(--text-tertiary);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.result-header p {
  margin: 5px 0 0;
  color: var(--text-secondary);
  line-height: 1.45;
}

.kpi-result {
  display: flex;
  min-height: 300px;
  align-content: center;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px 12px;
  padding: 70px 24px;
}

.kpi-result strong {
  color: var(--text-primary);
  font: 700 clamp(3rem, 8vw, 6.5rem) / 0.9 var(--font-display);
  letter-spacing: -0.06em;
  font-variant-numeric: tabular-nums;
}

.kpi-result > span {
  color: var(--text-tertiary);
  font-size: 1rem;
}

.kpi-result em {
  flex-basis: 100%;
  margin-top: 12px;
  color: var(--status-success-text);
  font-size: var(--font-size-body-small);
  font-style: normal;
  font-weight: 600;
}

.line-chart {
  min-height: 310px;
  padding: 30px 24px 20px;
}

.line-chart svg {
  width: 100%;
  height: 250px;
  overflow: visible;
}

.grid-line {
  stroke: var(--chart-grid);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}

.trend-line {
  fill: none;
  stroke: var(--chart-series-1);
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 3;
  vector-effect: non-scaling-stroke;
  stroke-dasharray: 1000;
  animation: draw-line 600ms cubic-bezier(0.23, 1, 0.32, 1) both;
}

.trend-point {
  fill: var(--surface-card);
  stroke: var(--chart-series-1);
  stroke-width: 2;
  vector-effect: non-scaling-stroke;
}

.axis-labels {
  display: flex;
  justify-content: space-between;
  color: var(--text-tertiary);
  font-size: var(--font-size-caption);
  font-variant-numeric: tabular-nums;
}

.bar-chart {
  display: grid;
  min-height: 310px;
  align-content: center;
  gap: 12px;
  padding: 32px 24px;
}

.bar-row {
  display: grid;
  grid-template-columns: 80px 1fr 64px;
  align-items: center;
  gap: 12px;
  font-size: var(--font-size-body-small);
}

.bar-row > span {
  color: var(--text-secondary);
}

.bar-row strong {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.bar-track {
  height: 8px;
  overflow: hidden;
  border-radius: 4px;
  background: var(--surface-subtle);
}

.bar-track span {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  background: var(--chart-series-1);
  transform: scaleX(var(--bar-scale));
  transform-origin: left;
  animation: bar-enter 320ms cubic-bezier(0.23, 1, 0.32, 1) both;
  animation-delay: calc(var(--bar-index) * 35ms);
}

.donut-layout {
  display: grid;
  grid-template-columns: minmax(220px, 0.8fr) minmax(280px, 1fr);
  align-items: center;
  gap: 36px;
  min-height: 330px;
  padding: 30px 36px;
}

.donut-visual {
  position: relative;
  display: grid;
  width: min(260px, 100%);
  margin: auto;
  place-items: center;
}

.donut-visual svg {
  width: 100%;
  transform: rotate(-90deg);
}

.donut-track,
.donut-segment {
  fill: none;
  stroke-width: 14;
}

.donut-track {
  stroke: var(--surface-subtle);
}

.donut-segment {
  stroke-linecap: butt;
}

.donut-visual > div {
  position: absolute;
  display: grid;
  text-align: center;
}

.donut-visual strong {
  font: 700 1.8rem var(--font-display);
  font-variant-numeric: tabular-nums;
}

.donut-visual span {
  color: var(--text-tertiary);
  font-size: var(--font-size-caption);
}

.donut-legend {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.donut-legend-item {
  display: grid;
  grid-template-columns: 10px 1fr auto 52px;
  align-items: center;
  gap: 10px;
  min-height: 42px;
  padding: 8px;
  border-radius: 8px;
}

.donut-legend-item:hover {
  background: var(--surface-subtle);
}

.donut-legend-item span {
  color: var(--text-secondary);
}

.donut-legend-item strong,
.donut-legend-item em {
  font-variant-numeric: tabular-nums;
}

.donut-legend-item em {
  color: var(--text-tertiary);
  font-size: var(--font-size-caption);
  font-style: normal;
  text-align: right;
}

.series-dot {
  display: block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}

.series-1 {
  color: var(--chart-series-1);
  stroke: var(--chart-series-1);
}
.series-2 {
  color: var(--chart-series-2);
  stroke: var(--chart-series-2);
}
.series-3 {
  color: var(--chart-series-3);
  stroke: var(--chart-series-3);
}
.series-4 {
  color: var(--chart-series-4);
  stroke: var(--chart-series-4);
}
.series-5 {
  color: var(--chart-series-5);
  stroke: var(--chart-series-5);
}
.series-6 {
  color: var(--chart-series-6);
  stroke: var(--chart-series-6);
}

.data-table-alternative {
  margin: 0 24px 20px;
  border-top: 1px solid var(--border-subtle);
}

.data-table-alternative summary {
  min-height: 40px;
  padding: 12px 0;
  color: var(--text-link);
  font-size: var(--font-size-body-small);
  font-weight: 600;
  cursor: pointer;
}

.table-result {
  overflow-x: auto;
  padding: 12px 24px 24px;
}

.data-table-alternative .table-result {
  padding: 0 0 12px;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-body-small);
}

th,
td {
  padding: 9px 10px;
  border-bottom: 1px solid var(--border-subtle);
  text-align: left;
}

th {
  color: var(--text-tertiary);
  font-size: 0.7rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

td {
  font-variant-numeric: tabular-nums;
}

@keyframes draw-line {
  from {
    stroke-dashoffset: 1000;
  }
  to {
    stroke-dashoffset: 0;
  }
}

@keyframes bar-enter {
  from {
    transform: scaleX(0);
  }
}

@media (max-width: 700px) {
  .donut-layout {
    grid-template-columns: 1fr;
    gap: 12px;
    padding: 24px 16px;
  }

  .donut-visual {
    max-width: 210px;
  }

  .result-header,
  .line-chart,
  .bar-chart,
  .table-result {
    padding-right: 16px;
    padding-left: 16px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .trend-line,
  .bar-track span {
    animation: none;
  }
}
</style>
