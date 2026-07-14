<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AiModelUsage } from '../ai-usage.model'
import { formatMoney, formatTokenCount, pluralizeRu } from '../ai-usage.model'

const props = defineProps<{
  rows: AiModelUsage[]
  currency?: string
}>()

type Metric = 'tokens' | 'cost'

const metric = ref<Metric>('tokens')
const costAvailable = computed(() => Boolean(props.currency))
const sortedRows = computed(() => [...props.rows]
  .sort((left, right) => metric.value === 'cost'
    ? right.estimatedCost - left.estimatedCost
    : right.totalTokens - left.totalTokens)
  .slice(0, 6))
const hiddenCount = computed(() => Math.max(props.rows.length - sortedRows.value.length, 0))
const maxValue = computed(() => Math.max(0, ...sortedRows.value.map(rowValue)))

function rowValue(row: AiModelUsage): number {
  return metric.value === 'cost' ? row.estimatedCost : row.totalTokens
}

function rowWidth(row: AiModelUsage): string {
  if (!maxValue.value || rowValue(row) <= 0) return '0%'
  return `${Math.max((rowValue(row) / maxValue.value) * 100, 1.5)}%`
}

function rowLabel(row: AiModelUsage): string {
  return metric.value === 'cost'
    ? formatMoney(row.estimatedCost, row.currency)
    : `${formatTokenCount(row.totalTokens)} токенов`
}

function providerLabel(provider: string): string {
  return provider.toLowerCase() === 'openai' ? 'OpenAI' : provider
}

function chooseMetric(nextMetric: Metric) {
  if (nextMetric === 'cost' && !costAvailable.value) return
  metric.value = nextMetric
}

watch(costAvailable, (available) => {
  if (!available) metric.value = 'tokens'
})
</script>

<template>
  <section class="chart-card" aria-labelledby="model-usage-title">
    <header class="chart-header">
      <div>
        <span class="chart-kicker">Модели</span>
        <h3 id="model-usage-title">Где расходуется AI</h3>
      </div>
      <div class="metric-switch" role="group" aria-label="Показатель графика">
        <button type="button" :class="{ active: metric === 'tokens' }" :aria-pressed="metric === 'tokens'" @click="chooseMetric('tokens')">Токены</button>
        <button type="button" :class="{ active: metric === 'cost' }" :aria-pressed="metric === 'cost'" :disabled="!costAvailable" @click="chooseMetric('cost')">Стоимость</button>
      </div>
    </header>

    <div v-if="sortedRows.length" class="model-bars">
      <div v-for="row in sortedRows" :key="row.key" class="model-row">
        <div class="model-copy">
          <span><strong>{{ row.model }}</strong><small>{{ providerLabel(row.provider) }} · {{ row.records }} {{ pluralizeRu(row.records, 'операция', 'операции', 'операций') }}</small></span>
          <span class="model-value">{{ rowLabel(row) }}</span>
        </div>
        <div
          class="bar-track"
          role="meter"
          :aria-label="`${row.model}: ${rowLabel(row)}`"
          aria-valuemin="0"
          :aria-valuemax="maxValue"
          :aria-valuenow="rowValue(row)"
        >
          <span class="bar-fill" :style="{ width: rowWidth(row) }" />
        </div>
      </div>
      <p v-if="hiddenCount" class="chart-note">Ещё {{ hiddenCount }} {{ hiddenCount === 1 ? 'модель' : 'моделей' }} не показаны, но учтены в итогах.</p>
    </div>
    <div v-else class="chart-empty"><i class="pi pi-chart-bar" /><span>За выбранный период операций нет</span></div>
  </section>
</template>

<style scoped>
.chart-card{min-width:0;padding:22px;border:1px solid #e7e8e2;border-radius:17px;background:#fff}.chart-header{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:25px}.chart-kicker{display:block;margin-bottom:5px;color:#8b9086;font-size:.65rem;font-weight:700;letter-spacing:.11em;text-transform:uppercase}.chart-header h3{margin:0;font-size:1rem}.metric-switch{display:flex;padding:3px;border:1px solid #e2e4dd;border-radius:10px;background:#f7f8f4}.metric-switch button{padding:6px 9px;border:0;border-radius:7px;background:transparent;color:#777c72;font-size:.67rem;font-weight:700;cursor:pointer}.metric-switch button.active{background:#fff;color:#292d26;box-shadow:0 1px 4px rgba(30,34,26,.08)}.metric-switch button:disabled{cursor:not-allowed;opacity:.42}.model-bars{display:flex;flex-direction:column;gap:19px}.model-copy{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:8px}.model-copy>span:first-child{min-width:0}.model-copy strong,.model-copy small{display:block}.model-copy strong{overflow:hidden;font-size:.77rem;text-overflow:ellipsis;white-space:nowrap}.model-copy small{margin-top:2px;color:#999e94;font-size:.62rem}.model-value{flex:0 0 auto;color:#555a51;font-size:.72rem;font-weight:700}.bar-track{height:8px;overflow:hidden;border-radius:999px;background:#eff0eb}.bar-fill{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#8e77f5,#b6a7fb);transition:width .35s ease}.chart-note{margin:0;color:#8a8f85;font-size:.65rem}.chart-empty{display:grid;place-items:center;min-height:230px;color:#999e94;font-size:.75rem}.chart-empty i{margin-bottom:-65px;font-size:1.65rem;color:#c4c7bf}
@media(max-width:600px){.chart-header{align-items:stretch;flex-direction:column}.metric-switch{align-self:flex-start}.chart-card{padding:18px}}
</style>
