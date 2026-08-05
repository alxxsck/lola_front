<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import {
  aggregateModelUsage,
  aggregateProviderUsage,
  formatMoney,
  formatTokenCount,
  getModelBreakdown,
  getUsageCost,
  getUsageCurrency,
  hasUsageCost,
  pluralizeRu,
  usageOperationLabel,
  type AiUsageBreakdown,
  type AiUsageCategoryBreakdown,
  type AiUsageMetric,
} from '../ai-usage.model'
import AiModelUsageChart from './AiModelUsageChart.vue'
import AiModalityChart from './AiModalityChart.vue'

const props = defineProps<{
  breakdown: AiUsageBreakdown[]
  caseUsage?: AiUsageCategoryBreakdown
}>()

const usageMetric = shallowRef<AiUsageMetric>('tokens')
const modelBreakdown = computed(() => getModelBreakdown(props.breakdown))
const modelUsage = computed(() => aggregateProviderUsage(modelBreakdown.value))
const models = computed(() => aggregateModelUsage(modelBreakdown.value))
const currency = computed(() => getUsageCurrency(modelBreakdown.value))
const costAvailable = computed(
  () => Boolean(currency.value) && models.value.some(hasUsageCost),
)
const caseBreakdown = computed(() =>
  modelBreakdown.value.filter((item) => item.operation.startsWith('case_')),
)
const cachedShare = computed(() => {
  if (!modelUsage.value.inputTokens) return '0% входящих'
  const share =
    (modelUsage.value.cachedInputTokens / modelUsage.value.inputTokens) * 100
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(share)}% входящих`
})

function selectMetric(metric: AiUsageMetric) {
  if (metric === 'cost' && !costAvailable.value) return
  usageMetric.value = metric
}

function operationCount(value: number) {
  return `${formatTokenCount(value)} ${pluralizeRu(value, 'операция', 'операции', 'операций')}`
}

watch(costAvailable, (available) => {
  if (!available && usageMetric.value === 'cost') usageMetric.value = 'tokens'
})
</script>

<template>
  <section
    class="ai-usage-slice model-slice"
    aria-labelledby="model-slice-title"
  >
    <header class="slice-header">
      <div>
        <span class="provider-kicker">Models & inference</span>
        <h4 id="model-slice-title">Модели Grok</h4>
        <p>Токены и provider-reported стоимость модельных операций.</p>
      </div>
      <div
        class="metric-switch"
        role="group"
        aria-label="Показатель графиков Grok"
      >
        <button
          type="button"
          :class="{ active: usageMetric === 'tokens' }"
          :aria-pressed="usageMetric === 'tokens'"
          @click="selectMetric('tokens')"
        >
          Токены
        </button>
        <button
          type="button"
          :class="{ active: usageMetric === 'cost' }"
          :aria-pressed="usageMetric === 'cost'"
          :disabled="!costAvailable"
          @click="selectMetric('cost')"
        >
          Стоимость
        </button>
      </div>
    </header>

    <div class="slice-summary">
      <article>
        <small>Всего токенов</small>
        <strong>{{ formatTokenCount(modelUsage.totalTokens) }}</strong>
      </article>
      <article>
        <small>Операции моделей</small>
        <strong>{{ operationCount(modelUsage.records) }}</strong>
      </article>
      <article>
        <small>Входящий кэш</small>
        <strong>{{ formatTokenCount(modelUsage.cachedInputTokens) }}</strong>
        <span>{{ cachedShare }}</span>
      </article>
    </div>

    <section
      v-if="caseUsage"
      class="case-usage"
      aria-labelledby="case-intelligence-usage-title"
    >
      <header>
        <span class="case-mark">
          <i class="pi pi-briefcase" />
        </span>
        <div>
          <span class="provider-kicker">AI-кейсы</span>
          <h5 id="case-intelligence-usage-title">
            Анализ и проверка обращений
          </h5>
        </div>
      </header>
      <div class="case-summary">
        <article>
          <small>Стоимость</small>
          <strong>{{
            formatMoney(getUsageCost(caseUsage), caseUsage.currency)
          }}</strong>
        </article>
        <article>
          <small>Токены</small>
          <strong>{{ formatTokenCount(caseUsage.totalTokens) }}</strong>
        </article>
        <article>
          <small>Операции</small>
          <strong>{{ formatTokenCount(caseUsage.records) }}</strong>
        </article>
      </div>
      <div v-if="caseBreakdown.length" class="case-operations">
        <div
          v-for="item in caseBreakdown"
          :key="`${item.operation}:${item.model}:${item.currency}`"
        >
          <span>{{ usageOperationLabel(item.operation) }}</span>
          <small>{{ operationCount(item.records) }}</small>
          <strong>{{ formatMoney(getUsageCost(item), item.currency) }}</strong>
        </div>
      </div>
    </section>

    <div class="xai-charts">
      <AiModelUsageChart :rows="models" :metric="usageMetric" />
      <AiModalityChart
        :totals="modelUsage"
        :breakdown="modelBreakdown"
        :metric="usageMetric"
        :currency="currency"
      />
    </div>
  </section>
</template>

<style src="./ai-usage-slice.css"></style>

<style scoped>
.case-usage > header {
  display: flex;
  align-items: center;
}

.case-usage h5 {
  margin: 0;
}

.metric-switch {
  display: flex;
  flex: 0 0 auto;
  gap: 3px;
  padding: 4px;
  border: 1px solid var(--border-default);
  border-radius: 12px;
  background: var(--surface-subtle);
}

.metric-switch button {
  padding: 7px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-small-muted);
  font-size: 0.69rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}

.metric-switch button.active {
  background: var(--surface-card);
  color: var(--text-primary);
  box-shadow: var(--shadow-raised);
}

.metric-switch button:disabled {
  cursor: not-allowed;
  opacity: 0.42;
}

.case-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 14px;
}

.case-summary article {
  min-width: 0;
  padding: 13px;
  border: 1px solid var(--border-default);
  border-radius: 15px;
  background: var(--surface-subtle);
}

.case-summary small {
  display: block;
  color: var(--text-small-muted);
  font-size: 0.66rem;
  font-weight: 600;
}

.case-usage {
  padding: 16px;
  margin-top: 14px;
  border: 1px solid
    color-mix(in srgb, var(--status-accent) 24%, var(--border-default));
  border-radius: 16px;
  background: var(--surface-subtle);
}

.case-usage > header {
  gap: 11px;
}

.case-mark {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  border-radius: 13px;
  background: var(--status-accent-soft);
  color: var(--status-accent);
}

.case-summary {
  margin-top: 13px;
}

.case-summary article {
  padding: 11px;
  background: var(--surface-card);
}

.case-summary strong {
  display: block;
  margin-top: 5px;
  font: 700 0.9rem var(--font-display);
}

.case-operations {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.case-operations > div {
  display: grid;
  grid-template-columns: auto auto;
  gap: 2px 10px;
  padding: 9px 11px;
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  background: var(--surface-card);
}

.case-operations span {
  font-size: 0.68rem;
  font-weight: 700;
}

.case-operations small {
  color: var(--text-small-muted);
  font-size: 0.59rem;
}

.case-operations strong {
  grid-column: 2;
  grid-row: 1 / 3;
  align-self: center;
  font-size: 0.68rem;
}

.xai-charts {
  display: grid;
  grid-template-columns: minmax(0, 1.12fr) minmax(320px, 0.88fr);
  gap: 14px;
  margin-top: 14px;
}

@media (max-width: 1100px) {
  .xai-charts {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 650px) {
  .metric-switch {
    width: 100%;
  }

  .metric-switch button {
    flex: 1;
  }

  .case-summary {
    grid-template-columns: 1fr;
  }
}
</style>
