<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import { isMockMode } from '@/shared/config/data-mode'
import { fetchAiUsageReport } from './ai-usage.api'
import AiModelUsageChart from './components/AiModelUsageChart.vue'
import AiModalityChart from './components/AiModalityChart.vue'
import {
  AI_USAGE_RANGE_OPTIONS,
  aggregateModelUsage,
  formatMoney,
  formatTokenCount,
  getAiUsageRange,
  getReportCurrency,
  pluralizeRu,
  type AiUsageRangeKey,
  type AiUsageReport,
} from './ai-usage.model'

const props = defineProps<{ projectId: string }>()

const range = shallowRef<AiUsageRangeKey>('today')
const report = shallowRef<AiUsageReport | null>(null)
const loading = shallowRef(false)
const error = shallowRef('')
const cache = new Map<AiUsageRangeKey, AiUsageReport>()
let activeRequest: AbortController | undefined
let requestGeneration = 0

const totals = computed(() => report.value?.totals)
const models = computed(() =>
  report.value ? aggregateModelUsage(report.value.breakdown) : [],
)
const currency = computed(() =>
  report.value ? getReportCurrency(report.value) : 'USD',
)
const costLabel = computed(() => {
  if (!totals.value) return '—'
  if (!currency.value) return 'Несколько валют'
  if (
    totals.value.estimatedCostRecords === 0 ||
    (totals.value.estimatedCostRecords === undefined &&
      totals.value.estimatedCost === 0)
  )
    return 'Нет USD-оценки'
  return formatMoney(totals.value.estimatedCost, currency.value)
})
const costCaption = computed(() =>
  totals.value?.estimatedCostRecords === undefined
    ? 'локальная оценка только по rate card OpenAI'
    : `${totals.value.estimatedCostRecords} операций по rate card OpenAI`,
)
const cachedShare = computed(() => {
  if (!totals.value?.inputTokens) return '0% входящих'
  const share =
    (totals.value.cachedInputTokens / totals.value.inputTokens) * 100
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(share)}% входящих`
})

async function load(force = false) {
  const requestedRange = range.value
  const cached = cache.get(requestedRange)
  if (cached && !force) {
    activeRequest?.abort()
    activeRequest = undefined
    requestGeneration += 1
    loading.value = false
    report.value = cached
    error.value = ''
    return
  }

  activeRequest?.abort()
  const controller = new AbortController()
  activeRequest = controller
  const generation = ++requestGeneration
  loading.value = true
  error.value = ''
  if (!cached) report.value = null

  try {
    const nextReport = await fetchAiUsageReport(
      props.projectId,
      getAiUsageRange(requestedRange),
      controller.signal,
    )
    if (generation !== requestGeneration) return
    cache.set(requestedRange, nextReport)
    report.value = nextReport
  } catch (cause) {
    if (controller.signal.aborted || generation !== requestGeneration) return
    error.value =
      cause instanceof Error
        ? cause.message
        : 'Не удалось загрузить расходы на AI'
  } finally {
    if (generation === requestGeneration) loading.value = false
  }
}

function selectRange(nextRange: AiUsageRangeKey) {
  if (nextRange === range.value) return
  range.value = nextRange
  void load()
}

watch(
  () => props.projectId,
  () => {
    cache.clear()
    report.value = null
    void load()
  },
)

onMounted(() => void load())
onBeforeUnmount(() => {
  requestGeneration += 1
  activeRequest?.abort()
})
</script>

<template>
  <section class="ai-usage card" aria-labelledby="ai-usage-title">
    <header class="usage-header">
      <div class="usage-title">
        <span class="usage-icon"><i class="pi pi-chart-line" /></span>
        <div>
          <div class="eyebrow">AI consumption</div>
          <h2 id="ai-usage-title">Использование AI и расходы</h2>
          <p>
            Токены OpenAI, символы ElevenLabs и оценка стоимости внутри этого
            проекта.
          </p>
        </div>
      </div>
      <div class="usage-actions">
        <div class="range-switch" role="group" aria-label="Период статистики">
          <button
            v-for="option in AI_USAGE_RANGE_OPTIONS"
            :key="option.value"
            type="button"
            :class="{ active: range === option.value }"
            :aria-pressed="range === option.value"
            @click="selectRange(option.value)"
          >
            {{ option.label }}
          </button>
        </div>
        <Button
          icon="pi pi-refresh"
          severity="secondary"
          text
          rounded
          aria-label="Обновить статистику"
          :loading="loading"
          @click="load(true)"
        />
      </div>
    </header>

    <Message v-if="error" severity="error" :closable="false">
      <div class="error-row">
        <span>{{ error }}</span
        ><Button
          label="Повторить"
          icon="pi pi-refresh"
          size="small"
          text
          @click="load(true)"
        />
      </div>
    </Message>

    <div
      v-if="loading && !report"
      class="usage-skeleton"
      aria-label="Загрузка статистики"
    >
      <Skeleton
        v-for="item in 4"
        :key="item"
        height="7.5rem"
        border-radius="16px"
      />
      <Skeleton height="22rem" border-radius="17px" />
      <Skeleton height="22rem" border-radius="17px" />
    </div>

    <template v-else-if="report && totals">
      <div class="summary-grid">
        <article class="summary-card cost-card">
          <span class="summary-label">Расчётная стоимость</span>
          <strong>{{ costLabel }}</strong>
          <small>{{ costCaption }}</small>
        </article>
        <article class="summary-card">
          <span class="summary-label">Credits ElevenLabs</span>
          <strong>{{ formatTokenCount(totals.providerBilledUnits) }}</strong>
          <small
            >{{ formatTokenCount(totals.inputCharacters) }} входных
            символов</small
          >
        </article>
        <article class="summary-card">
          <span class="summary-label">Всего токенов</span>
          <strong>{{ formatTokenCount(totals.totalTokens) }}</strong>
          <small
            >{{ formatTokenCount(totals.inputTokens) }} ввод ·
            {{ formatTokenCount(totals.outputTokens) }} вывод</small
          >
        </article>
        <article class="summary-card">
          <span class="summary-label">AI-операции</span>
          <strong>{{ formatTokenCount(totals.records) }}</strong>
          <small
            >{{ models.length }}
            {{ pluralizeRu(models.length, 'модель', 'модели', 'моделей') }} за
            период</small
          >
        </article>
        <article class="summary-card cache-card">
          <span class="summary-label">Входящий кэш</span>
          <strong>{{ formatTokenCount(totals.cachedInputTokens) }}</strong>
          <small>{{ cachedShare }}</small>
        </article>
      </div>

      <div v-if="totals.unpricedRecords" class="unpriced-note" role="status">
        <i class="pi pi-info-circle" />
        <span
          ><strong
            >{{ totals.unpricedRecords }}
            {{
              pluralizeRu(
                totals.unpricedRecords,
                'операция',
                'операции',
                'операций',
              )
            }}
            без цены.</strong
          >
          Они учтены в количестве операций, но не в сумме расходов.</span
        >
      </div>

      <div
        v-if="totals.providerReportedUsageRecords"
        class="provider-usage-note"
        role="status"
      >
        <i class="pi pi-check-circle" />
        <span
          ><strong
            >{{ totals.providerReportedUsageRecords }}
            {{
              pluralizeRu(
                totals.providerReportedUsageRecords,
                'операция ElevenLabs учтена',
                'операции ElevenLabs учтены',
                'операций ElevenLabs учтены',
              )
            }}.</strong
          >
          Расход сохранён в provider-reported credits (`character-cost`), а не в
          токенах или USD.</span
        >
      </div>

      <div class="accuracy-note" role="note">
        <i class="pi pi-exclamation-circle" />
        <span
          ><strong
            >Расчётная стоимость может отличаться от фактического
            списания.</strong
          >
          ElevenLabs не возвращает USD-цену отдельного запроса; `character-cost`
          сверяется с общей статистикой и счётом workspace.</span
        >
      </div>

      <div class="charts-grid">
        <AiModelUsageChart :rows="models" :currency="currency" />
        <AiModalityChart :totals="totals" />
      </div>

      <footer class="usage-footer">
        <span v-if="isMockMode"
          ><i class="pi pi-database" /> Демонстрационные данные для
          предварительного просмотра.</span
        >
        <span v-else
          ><i class="pi pi-shield" /> Данные доступны только участникам проекта
          через защищённый CMS endpoint.</span
        >
        <span
          >Estimated cost не подменяет billed cost и итоговый счёт
          провайдера.</span
        >
      </footer>
    </template>
  </section>
</template>

<style scoped>
.ai-usage {
  margin-top: 22px;
  padding: 26px;
}
.usage-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding-bottom: 23px;
  margin-bottom: 22px;
  border-bottom: 1px solid #ecece7;
}
.usage-title {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}
.usage-title .eyebrow {
  margin-bottom: 4px;
}
.usage-title h2 {
  font-size: 1.18rem;
}
.usage-title p {
  margin: 5px 0 0;
  color: var(--muted);
  font-size: 0.76rem;
}
.usage-icon {
  display: grid;
  place-items: center;
  width: 43px;
  height: 43px;
  border-radius: 13px;
  background: #eef8d0;
  color: #789a14;
  box-shadow: inset 0 0 0 1px #e1edbd;
}
.usage-actions {
  display: flex;
  align-items: center;
  gap: 7px;
}
.range-switch {
  display: flex;
  gap: 3px;
  padding: 4px;
  border: 1px solid #e0e2db;
  border-radius: 12px;
  background: #f7f8f4;
}
.range-switch button {
  padding: 7px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #747970;
  font-size: 0.69rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}
.range-switch button.active {
  background: #252920;
  color: #fff;
  box-shadow: 0 2px 6px rgba(27, 31, 24, 0.14);
}
.error-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
}
.usage-skeleton {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}
.usage-skeleton > *:nth-child(n + 5) {
  grid-column: span 2;
}
.summary-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
}
.summary-card {
  position: relative;
  min-width: 0;
  overflow: hidden;
  padding: 18px;
  border: 1px solid #e7e8e2;
  border-radius: 16px;
  background: #fafbf7;
}
.summary-card.cost-card {
  background: #252920;
  color: #fff;
  border-color: #252920;
}
.summary-card.cost-card::after {
  content: '';
  position: absolute;
  right: -30px;
  bottom: -48px;
  width: 130px;
  height: 130px;
  border: 26px solid rgba(215, 255, 100, 0.13);
  border-radius: 50%;
}
.summary-label {
  display: block;
  color: #858a80;
  font-size: 0.68rem;
  font-weight: 600;
}
.cost-card .summary-label {
  color: #aeb3a8;
}
.summary-card strong {
  position: relative;
  z-index: 1;
  display: block;
  overflow: hidden;
  margin: 12px 0 5px;
  font: 700 clamp(1.3rem, 2.5vw, 1.75rem) Manrope;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.summary-card small {
  position: relative;
  z-index: 1;
  display: block;
  overflow: hidden;
  color: #92978d;
  font-size: 0.64rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cost-card small {
  color: #aeb3a8;
}
.unpriced-note,
.provider-usage-note,
.accuracy-note {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 12px;
  padding: 11px 13px;
  border-radius: 12px;
  font-size: 0.7rem;
  line-height: 1.45;
}
.unpriced-note,
.provider-usage-note {
  align-items: center;
}
.unpriced-note {
  border: 1px solid #f0dfb2;
  background: #fff9e8;
  color: #786126;
}
.unpriced-note i {
  color: #be8d13;
}
.provider-usage-note {
  border: 1px solid #d9e8c0;
  background: #f6faee;
  color: #52683a;
}
.provider-usage-note i {
  color: #789a14;
}
.accuracy-note {
  border: 1px solid #dce5f1;
  background: #f5f8fc;
  color: #52647a;
}
.accuracy-note i {
  margin-top: 2px;
  color: #6682a4;
}
.charts-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.12fr) minmax(360px, 0.88fr);
  gap: 14px;
  margin-top: 14px;
}
.usage-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding-top: 18px;
  margin-top: 20px;
  border-top: 1px solid #ecece7;
  color: #8a8f85;
  font-size: 0.65rem;
}
.usage-footer i {
  margin-right: 5px;
  color: #77961d;
}
@media (max-width: 1100px) {
  .usage-header {
    align-items: stretch;
    flex-direction: column;
  }
  .usage-actions {
    justify-content: space-between;
  }
  .summary-grid,
  .usage-skeleton {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .summary-card.cache-card {
    grid-column: span 2;
  }
  .charts-grid {
    grid-template-columns: 1fr;
  }
  .usage-skeleton > *:nth-child(n + 5) {
    grid-column: span 2;
  }
}
@media (max-width: 650px) {
  .ai-usage {
    padding: 20px;
  }
  .usage-actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    width: 100%;
  }
  .range-switch {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  .range-switch button {
    padding: 7px 4px;
    font-size: 0.62rem;
  }
  .usage-title p {
    line-height: 1.45;
  }
  .summary-grid,
  .usage-skeleton {
    grid-template-columns: 1fr;
  }
  .summary-card.cache-card,
  .usage-skeleton > *:nth-child(n + 5) {
    grid-column: auto;
  }
  .usage-footer {
    align-items: flex-start;
    flex-direction: column;
    gap: 7px;
  }
}
</style>
