<script setup lang="ts">
import { computed } from 'vue'
import type {
  AiProviderUsage,
  AiUsageBreakdown,
  AiUsageMetric,
} from '../ai-usage.model'
import {
  formatMoney,
  formatTokenCount,
  getUsageCost,
  getModalityUsage,
  pluralizeRu,
} from '../ai-usage.model'

const props = defineProps<{
  totals: AiProviderUsage
  breakdown: AiUsageBreakdown[]
  metric: AiUsageMetric
  currency?: string
}>()

const radius = 46
const circumference = 2 * Math.PI * radius
const operationColors = ['#8e77f5', '#ff8c6b', '#9fc62d', '#52a9a5', '#e3af43', '#7688db']
const modalities = computed(() =>
  getModalityUsage(props.totals).map((item) => ({
    key: item.key,
    label: item.label,
    color: item.color,
    value: item.tokens,
  })),
)
const operations = computed(() => {
  const values = new Map<string, number>()
  for (const item of props.breakdown) {
    values.set(item.operation, (values.get(item.operation) ?? 0) + getUsageCost(item))
  }
  const sorted = [...values]
    .filter(([, value]) => value > 0)
    .sort((left, right) => right[1] - left[1])
  const grouped = sorted.length <= operationColors.length
    ? sorted
    : [
        ...sorted.slice(0, operationColors.length - 1),
        [
          '__other__',
          sorted
            .slice(operationColors.length - 1)
            .reduce((sum, [, value]) => sum + value, 0),
        ] as [string, number],
      ]
  return grouped
    .map(([operation, value], index) => ({
      key: operation,
      label: operation === '__other__' ? 'Остальное' : operationLabel(operation),
      color: operationColors[index]!,
      value,
    }))
})
const chartItems = computed(() =>
  props.metric === 'cost' ? operations.value : modalities.value,
)
const chartTotal = computed(() =>
  chartItems.value.reduce((sum, item) => sum + item.value, 0),
)
const chartSegments = computed(() => {
  let offset = 0
  return chartItems.value.map((item) => {
    const length = chartTotal.value
      ? (item.value / chartTotal.value) * circumference
      : 0
    const segment = { ...item, length, offset: -offset }
    offset += length
    return segment
  })
})
const chartLabel = computed(() =>
  chartItems.value
    .map((item) => `${item.label}: ${formatValue(item.value)}`)
    .join('. '),
)

function formatValue(value: number, key?: string): string {
  if (props.metric === 'cost') return formatMoney(value, props.currency ?? 'USD')
  if (key === 'audio' && value === 0 && props.totals.durationSeconds > 0) {
    return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(props.totals.durationSeconds)} сек. аудио · токены не переданы`
  }
  return `${formatTokenCount(value)} токенов`
}

function operationLabel(operation: string): string {
  const normalized = operation.toLowerCase()
  const labels: Record<string, string> = {
    responses: 'Текст',
    response: 'Текст',
    web_search: 'Web search',
    knowledge_search: 'Knowledge search',
    realtime_response: 'Голосовой ответ',
    voice_response: 'Голосовой ответ',
    realtime_text_input: 'Текстовые команды Voice',
    transcription: 'Транскрипция',
    input_transcription: 'Входная транскрипция',
    output_transcription: 'Выходная транскрипция',
  }
  return labels[normalized] ?? operation.replaceAll(/[_-]+/g, ' ')
}

function percentage(itemValue: number): string {
  if (!chartTotal.value) return '0%'
  const value = (itemValue / chartTotal.value) * 100
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: value < 1 ? 1 : 0 }).format(value)}%`
}
</script>

<template>
  <section class="chart-card" aria-labelledby="modality-usage-title">
    <header class="chart-header">
      <div>
        <span class="chart-kicker">{{ metric === 'cost' ? 'Операции' : 'Форматы' }}</span>
        <h3 id="modality-usage-title">
          {{ metric === 'cost' ? 'Структура стоимости Grok' : 'Форматы токенов Grok' }}
        </h3>
      </div>
      <span class="direction-badge">
        <template v-if="metric === 'cost'">{{ formatMoney(chartTotal, currency ?? 'USD') }}</template>
        <template v-else>{{ formatTokenCount(totals.inputTokens) }} in · {{ formatTokenCount(totals.outputTokens) }} out</template>
      </span>
    </header>

    <div v-if="chartTotal" class="modality-layout">
      <div class="donut-wrap">
        <svg viewBox="0 0 120 120" role="img" :aria-label="chartLabel">
          <circle class="donut-track" cx="60" cy="60" :r="radius" />
          <circle
            v-for="segment in chartSegments"
            :key="segment.key"
            class="donut-segment"
            cx="60"
            cy="60"
            :r="radius"
            :stroke="segment.color"
            :stroke-dasharray="`${segment.length} ${circumference - segment.length}`"
            :stroke-dashoffset="segment.offset"
          />
        </svg>
        <div class="donut-total">
          <strong>{{ metric === 'cost' ? formatMoney(chartTotal, currency ?? 'USD') : formatTokenCount(chartTotal) }}</strong>
          <span>{{ metric === 'cost' ? 'оценка' : 'токенов' }}</span>
        </div>
      </div>

      <div class="modality-legend">
        <div v-for="item in chartItems" :key="item.key" class="legend-row">
          <span class="legend-dot" :style="{ backgroundColor: item.color }" />
          <span
            ><strong>{{ item.label }}</strong
            ><small>{{ formatValue(item.value, item.key) }}</small></span
          >
          <b>{{ percentage(item.value) }}</b>
        </div>
      </div>
    </div>
    <div v-else class="chart-empty">
      <i class="pi pi-chart-pie" /><span>{{ metric === 'cost' ? 'Оценка стоимости пока отсутствует' : 'Детализация по форматам пока отсутствует' }}</span>
    </div>

    <footer v-if="metric === 'tokens'" class="cache-row">
      <span><i class="pi pi-bolt" /> Повторно использовано из кэша</span>
      <strong>{{ formatTokenCount(totals.cachedInputTokens) }} токенов</strong>
    </footer>
    <footer v-else class="cache-row">
      <span><i class="pi pi-receipt" /> Фактическая и расчётная стоимость</span>
      <strong>{{ totals.records }} {{ pluralizeRu(totals.records, 'операция', 'операции', 'операций') }}</strong>
    </footer>
  </section>
</template>

<style scoped>
.chart-card {
  container-type: inline-size;
  min-width: 0;
  padding: 22px;
  border: 1px solid #e7e8e2;
  border-radius: 17px;
  background: #fff;
}
.chart-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}
.chart-kicker {
  display: block;
  margin-bottom: 5px;
  color: #8b9086;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.11em;
  text-transform: uppercase;
}
.chart-header h3 {
  margin: 0;
  font-size: 1rem;
}
.direction-badge {
  padding: 7px 9px;
  border: 1px solid #e7e8e2;
  border-radius: 9px;
  color: #777c72;
  font-size: 0.63rem;
  font-weight: 700;
  white-space: nowrap;
}
.modality-layout {
  display: grid;
  grid-template-columns: minmax(120px, 0.85fr) minmax(0, 1.15fr);
  align-items: center;
  gap: 14px;
  min-height: 225px;
}
.donut-wrap {
  position: relative;
  width: min(100%, 175px);
  container-type: inline-size;
  margin: auto;
}
.donut-wrap svg {
  display: block;
  width: 100%;
  overflow: visible;
  transform: rotate(-90deg);
}
.donut-track,
.donut-segment {
  fill: none;
  stroke-width: 12;
}
.donut-track {
  stroke: #eff0eb;
}
.donut-segment {
  stroke-linecap: butt;
  transition: stroke-dasharray 0.35s ease;
}
.donut-total {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  text-align: center;
}
.donut-total strong {
  max-width: 72%;
  margin-inline: auto;
  font: 700 clamp(0.75rem, 12cqi, 1.35rem)/1.05 Manrope;
  overflow-wrap: anywhere;
}
.donut-total span {
  margin-top: 2px;
  color: #8d9288;
  font-size: 0.62rem;
}
.modality-legend {
  display: flex;
  flex-direction: column;
}
.legend-row {
  display: grid;
  grid-template-columns: 8px minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  padding: 12px 0;
  border-bottom: 1px solid #eeefe9;
}
.legend-row:last-child {
  border-bottom: 0;
}
.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.legend-row strong,
.legend-row small {
  display: block;
  overflow-wrap: anywhere;
}
.legend-row strong {
  font-size: 0.74rem;
}
.legend-row small {
  margin-top: 2px;
  color: #92978d;
  font-size: 0.62rem;
}
.legend-row b {
  justify-self: end;
  font-size: 0.74rem;
  white-space: nowrap;
}
.cache-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 13px;
  border-radius: 11px;
  background: #f7f8f4;
  color: #72776d;
  font-size: 0.66rem;
}
.cache-row i {
  margin-right: 5px;
  color: #99bd2e;
}
.cache-row strong {
  color: #373b34;
}
.chart-empty {
  display: grid;
  place-items: center;
  min-height: 225px;
  color: #999e94;
  font-size: 0.75rem;
}
.chart-empty i {
  margin-bottom: -65px;
  font-size: 1.65rem;
  color: #c4c7bf;
}
@media (max-width: 600px) {
  .chart-header {
    align-items: stretch;
    flex-direction: column;
  }
  .direction-badge {
    align-self: flex-start;
  }
  .modality-layout {
    grid-template-columns: 1fr;
  }
  .donut-wrap {
    width: 165px;
  }
  .chart-card {
    padding: 18px;
  }
}
@container (max-width: 390px) {
  .modality-layout {
    grid-template-columns: 1fr;
  }
  .donut-wrap {
    width: 150px;
  }
}
</style>
