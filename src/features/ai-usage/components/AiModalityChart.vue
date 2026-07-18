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
const operationColors = [
  'var(--chart-series-1)',
  'var(--chart-series-4)',
  'var(--chart-series-6)',
  'var(--chart-series-5)',
  'var(--chart-series-3)',
  'var(--chart-series-2)',
]
const modalityColors: Record<'text' | 'audio' | 'image', string> = {
  text: 'var(--chart-series-1)',
  audio: 'var(--chart-series-4)',
  image: 'var(--chart-series-6)',
}
const modalities = computed(() =>
  getModalityUsage(props.totals).map((item) => ({
    key: item.key,
    label: item.label,
    color: modalityColors[item.key],
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
const totalLabel = computed(() =>
  props.metric === 'cost'
    ? formatMoney(chartTotal.value, props.currency ?? 'USD')
    : formatTokenCount(chartTotal.value),
)
const totalCaption = computed(() =>
  props.metric === 'cost'
    ? `${props.totals.records} ${pluralizeRu(props.totals.records, 'операция', 'операции', 'операций')}`
    : 'токенов',
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
      <div class="chart-summary">
        <strong>{{ totalLabel }}</strong>
        <span>{{ totalCaption }}</span>
        <small v-if="metric === 'tokens'">
          {{ formatTokenCount(totals.inputTokens) }} in ·
          {{ formatTokenCount(totals.outputTokens) }} out
        </small>
      </div>
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
  border: 1px solid var(--border-default);
  border-radius: 17px;
  background: var(--surface-card);
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
  color: var(--text-small-muted);
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.11em;
  text-transform: uppercase;
}
.chart-header h3 {
  margin: 0;
  font-size: 1rem;
}
.chart-summary {
  display: grid;
  flex: 0 0 auto;
  justify-items: end;
  min-width: 0;
  padding-left: 16px;
  text-align: right;
}
.chart-summary strong {
  color: var(--text-primary);
  font: 700 1.2rem/1.1 Manrope;
  letter-spacing: -0.03em;
  white-space: nowrap;
}
.chart-summary span {
  margin-top: 3px;
  color: var(--text-small-muted);
  font-size: 0.62rem;
  font-weight: 700;
  white-space: nowrap;
}
.chart-summary small {
  margin-top: 5px;
  color: var(--text-small-muted);
  font-size: 0.58rem;
  font-weight: 600;
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
  width: min(100%, 190px);
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
  stroke: var(--surface-active);
}
.donut-segment {
  stroke-linecap: butt;
  transition: stroke-dasharray 0.35s ease;
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
  border-bottom: 1px solid var(--border-subtle);
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
  hyphens: none;
  overflow-wrap: normal;
  word-break: normal;
}
.legend-row strong {
  overflow: hidden;
  font-size: 0.74rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.legend-row small {
  margin-top: 2px;
  color: var(--text-small-muted);
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
  background: var(--surface-subtle);
  color: var(--text-small-muted);
  font-size: 0.66rem;
}
.cache-row i {
  margin-right: 5px;
  color: var(--text-brand);
}
.cache-row strong {
  color: var(--text-primary);
}
.chart-empty {
  display: grid;
  place-items: center;
  min-height: 225px;
  color: var(--text-small-muted);
  font-size: 0.75rem;
}
.chart-empty i {
  margin-bottom: -65px;
  font-size: 1.65rem;
  color: var(--text-disabled);
}
@media (max-width: 600px) {
  .chart-header {
    align-items: stretch;
    flex-direction: column;
  }
  .chart-summary {
    justify-items: start;
    padding-left: 0;
    text-align: left;
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
@container (max-width: 460px) {
  .chart-header {
    align-items: stretch;
    flex-direction: column;
  }
  .chart-summary {
    justify-items: start;
    padding-left: 0;
    text-align: left;
  }
}
</style>
