<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import { isMockMode } from '@/shared/config/data-mode'
import { fetchAiUsageReport } from './ai-usage.api'
import AiModelUsageChart from './components/AiModelUsageChart.vue'
import AiModalityChart from './components/AiModalityChart.vue'
import ElevenLabsCreditChart from './components/ElevenLabsCreditChart.vue'
import {
  AI_USAGE_RANGE_OPTIONS,
  aggregateCreditUsage,
  aggregateModelUsage,
  aggregateProviderUsage,
  formatMoney,
  formatTokenCount,
  getAiUsageRange,
  getProviderBreakdown,
  getUsageCurrency,
  hasEstimatedCost,
  pluralizeRu,
  type AiUsageMetric,
  type AiUsageRangeKey,
  type AiUsageReport,
} from './ai-usage.model'

const props = defineProps<{ projectId: string }>()

const range = shallowRef<AiUsageRangeKey>('today')
const usageMetric = shallowRef<AiUsageMetric>('tokens')
const report = shallowRef<AiUsageReport | null>(null)
const loading = shallowRef(false)
const error = shallowRef('')
const cache = new Map<AiUsageRangeKey, AiUsageReport>()
let activeRequest: AbortController | undefined
let requestGeneration = 0

const totals = computed(() => report.value?.totals)
const xAiBreakdown = computed(() =>
  report.value ? getProviderBreakdown(report.value.breakdown, 'xai') : [],
)
const elevenLabsBreakdown = computed(() =>
  report.value ? getProviderBreakdown(report.value.breakdown, 'elevenlabs') : [],
)
const xAiUsage = computed(() =>
  aggregateProviderUsage(xAiBreakdown.value),
)
const elevenLabsUsage = computed(() =>
  aggregateProviderUsage(elevenLabsBreakdown.value),
)
const xAiModels = computed(() =>
  aggregateModelUsage(xAiBreakdown.value),
)
const elevenLabsCredits = computed(() =>
  aggregateCreditUsage(elevenLabsBreakdown.value),
)
const xAiCurrency = computed(() => getUsageCurrency(xAiBreakdown.value))
const xAiCostAvailable = computed(
  () => Boolean(xAiCurrency.value) && xAiModels.value.some(hasEstimatedCost),
)
const xAiEstimatedCostRecords = computed(() => {
  const exactCount = totals.value?.estimatedCostRecords
  if (exactCount !== undefined)
    return Math.min(exactCount, xAiUsage.value.records)
  return xAiUsage.value.estimatedCost > 0 ? xAiUsage.value.records : 0
})
const xAiUnpricedRecords = computed(() =>
  Math.max(xAiUsage.value.records - xAiEstimatedCostRecords.value, 0),
)
const xAiCostLabel = computed(() => {
  if (!xAiCurrency.value) return 'Несколько валют'
  if (!xAiEstimatedCostRecords.value) return 'Нет USD-оценки'
  return formatMoney(xAiUsage.value.estimatedCost, xAiCurrency.value)
})
const xAiCostCaption = computed(
  () =>
    `${xAiEstimatedCostRecords.value} ${pluralizeRu(xAiEstimatedCostRecords.value, 'операция оценена', 'операции оценены', 'операций оценено')} по rate card`,
)
const xAiCachedShare = computed(() => {
  if (!xAiUsage.value.inputTokens) return '0% входящих'
  const share =
    (xAiUsage.value.cachedInputTokens / xAiUsage.value.inputTokens) * 100
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(share)}% входящих`
})
const creditsPerThousandCharacters = computed(() => {
  if (!elevenLabsUsage.value.inputCharacters) return '—'
  const credits =
    (elevenLabsUsage.value.providerBilledUnits /
      elevenLabsUsage.value.inputCharacters) *
    1_000
  return formatTokenCount(Math.round(credits))
})

function selectUsageMetric(metric: AiUsageMetric) {
  if (metric === 'cost' && !xAiCostAvailable.value) return
  usageMetric.value = metric
}

watch(xAiCostAvailable, (available) => {
  if (!available && usageMetric.value === 'cost') usageMetric.value = 'tokens'
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
        : 'Не удалось загрузить потребление AI'
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
          <h2 id="ai-usage-title">Потребление AI</h2>
          <p>Метрики разделены по провайдерам и их собственным единицам.</p>
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
        <span>{{ error }}</span>
        <Button
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
      <Skeleton height="10rem" border-radius="18px" />
      <Skeleton height="24rem" border-radius="18px" />
      <Skeleton height="10rem" border-radius="18px" />
      <Skeleton height="21rem" border-radius="18px" />
    </div>

    <template v-else-if="report && totals">
      <div class="provider-stack">
        <section class="provider-panel xai-panel" aria-labelledby="xai-usage-title">
          <header class="provider-header">
            <span class="provider-mark xai-mark"><i class="pi pi-sparkles" /></span>
            <div>
              <span class="provider-kicker">Models & inference</span>
              <h3 id="xai-usage-title">xAI · Grok</h3>
              <p>Токены, операции и расчётная стоимость по rate card.</p>
            </div>
            <div class="metric-switch" role="group" aria-label="Показатель графиков Grok">
              <button
                type="button"
                :class="{ active: usageMetric === 'tokens' }"
                :aria-pressed="usageMetric === 'tokens'"
                @click="selectUsageMetric('tokens')"
              >Токены</button>
              <button
                type="button"
                :class="{ active: usageMetric === 'cost' }"
                :aria-pressed="usageMetric === 'cost'"
                :disabled="!xAiCostAvailable"
                @click="selectUsageMetric('cost')"
              >Стоимость</button>
            </div>
          </header>

          <div class="provider-summary xai-summary">
            <article class="summary-card cost-card">
              <span class="summary-label">Расчётная стоимость</span>
              <strong>{{ xAiCostLabel }}</strong>
              <small>{{ xAiCostCaption }}</small>
            </article>
            <article class="summary-card">
              <span class="summary-label">Всего токенов</span>
              <strong>{{ formatTokenCount(xAiUsage.totalTokens) }}</strong>
              <small
                >{{ formatTokenCount(xAiUsage.inputTokens) }} ввод ·
                {{ formatTokenCount(xAiUsage.outputTokens) }} вывод</small
              >
            </article>
            <article class="summary-card">
              <span class="summary-label">Операции xAI</span>
              <strong>{{ formatTokenCount(xAiUsage.records) }}</strong>
              <small
                >{{ xAiModels.length }}
                {{
                  pluralizeRu(
                    xAiModels.length,
                    'модель',
                    'модели',
                    'моделей',
                  )
                }}</small
              >
            </article>
            <article class="summary-card">
              <span class="summary-label">Входящий кэш</span>
              <strong>{{ formatTokenCount(xAiUsage.cachedInputTokens) }}</strong>
              <small>{{ xAiCachedShare }}</small>
            </article>
          </div>

          <div v-if="xAiUnpricedRecords" class="unpriced-note" role="status">
            <i class="pi pi-info-circle" />
            <span
              ><strong
                >{{ xAiUnpricedRecords }}
                {{
                  pluralizeRu(
                    xAiUnpricedRecords,
                    'операция xAI без оценки',
                    'операции xAI без оценки',
                    'операций xAI без оценки',
                  )
                }}.</strong
              >
              Они учтены в количестве операций, но не в расчётной стоимости.</span
            >
          </div>

          <div class="xai-charts">
            <AiModelUsageChart
              :rows="xAiModels"
              :metric="usageMetric"
            />
            <AiModalityChart
              :totals="xAiUsage"
              :breakdown="xAiBreakdown"
              :metric="usageMetric"
              :currency="xAiCurrency"
            />
          </div>
        </section>

        <section class="provider-panel elevenlabs-panel" aria-labelledby="elevenlabs-usage-title">
          <header class="provider-header">
            <span class="provider-mark elevenlabs-mark"><i class="pi pi-volume-up" /></span>
            <div>
              <span class="provider-kicker">Text to Speech</span>
              <h3 id="elevenlabs-usage-title">ElevenLabs</h3>
              <p>Генерация речи и фактическое потребление provider credits.</p>
            </div>
          </header>

          <div class="provider-summary elevenlabs-summary">
            <article class="summary-card credits-card">
              <span class="summary-label">Использовано credits</span>
              <strong>{{ formatTokenCount(elevenLabsUsage.providerBilledUnits) }}</strong>
              <small>billing-единицы ElevenLabs</small>
            </article>
            <article class="summary-card">
              <span class="summary-label">Входной текст</span>
              <strong>{{ formatTokenCount(elevenLabsUsage.inputCharacters) }}</strong>
              <small>символов передано в генерацию</small>
            </article>
            <article class="summary-card">
              <span class="summary-label">Генерации</span>
              <strong>{{ formatTokenCount(elevenLabsUsage.records) }}</strong>
              <small>TTS-операций за период</small>
            </article>
            <article class="summary-card">
              <span class="summary-label">Credits / 1 000 символов</span>
              <strong>{{ creditsPerThousandCharacters }}</strong>
              <small>фактическое соотношение за период</small>
            </article>
          </div>

          <ElevenLabsCreditChart :rows="elevenLabsCredits" />
        </section>
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
        <span>Стоимость xAI является оценкой и не заменяет счёт провайдера.</span>
      </footer>
    </template>
  </section>
</template>

<style scoped>
.ai-usage{margin-top:22px;padding:26px}.usage-header{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;padding-bottom:23px;margin-bottom:22px;border-bottom:1px solid #ecece7}.usage-title{display:flex;align-items:flex-start;gap:14px}.usage-title .eyebrow{margin-bottom:4px}.usage-title h2{font-size:1.18rem}.usage-title p{margin:5px 0 0;color:var(--muted);font-size:.76rem}.usage-icon{display:grid;place-items:center;width:43px;height:43px;border-radius:13px;background:#eef8d0;color:#789a14;box-shadow:inset 0 0 0 1px #e1edbd}.usage-actions{display:flex;align-items:center;gap:7px}.range-switch,.metric-switch{display:flex;gap:3px;padding:4px;border:1px solid #e0e2db;border-radius:12px;background:#f7f8f4}.range-switch button,.metric-switch button{padding:7px 10px;border:0;border-radius:8px;background:transparent;color:#747970;font-size:.69rem;font-weight:700;cursor:pointer;white-space:nowrap}.range-switch button.active{background:#252920;color:#fff;box-shadow:0 2px 6px rgba(27,31,24,.14)}.metric-switch{margin-left:auto}.metric-switch button.active{background:#fff;color:#292d26;box-shadow:0 1px 4px rgba(30,34,26,.08)}.metric-switch button:disabled{cursor:not-allowed;opacity:.42}.error-row{display:flex;align-items:center;justify-content:space-between;gap:16px;width:100%}.usage-skeleton{display:grid;grid-template-columns:1fr 1fr;gap:14px}.usage-skeleton>*:nth-child(odd){grid-column:1/-1}.provider-stack{display:flex;flex-direction:column;gap:18px}.provider-panel{padding:22px;border:1px solid #e5e6e0;border-radius:20px;background:#fbfbf8}.provider-header{display:flex;align-items:center;gap:13px;padding-bottom:18px;margin-bottom:18px;border-bottom:1px solid #e8e9e3}.provider-mark{display:grid;place-items:center;width:42px;height:42px;flex:0 0 auto;border-radius:13px}.xai-mark{background:#eeeafd;color:#6f58d2}.elevenlabs-mark{background:#eeeaf5;color:#6f6194}.provider-kicker{display:block;margin-bottom:3px;color:#8c9187;font-size:.62rem;font-weight:700;letter-spacing:.11em;text-transform:uppercase}.provider-header h3{margin:0;font-size:1.08rem}.provider-header p{margin:3px 0 0;color:var(--muted);font-size:.7rem}.provider-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.summary-card{position:relative;min-width:0;overflow:hidden;padding:17px;border:1px solid #e6e7e1;border-radius:15px;background:#fff}.summary-label{display:block;color:#858a80;font-size:.66rem;font-weight:600}.summary-card strong{position:relative;z-index:1;display:block;overflow:hidden;margin:11px 0 5px;font:700 clamp(1.2rem,2.2vw,1.6rem) Manrope;text-overflow:ellipsis;white-space:nowrap}.summary-card small{position:relative;z-index:1;display:block;overflow:hidden;color:#92978d;font-size:.62rem;text-overflow:ellipsis;white-space:nowrap}.cost-card{border-color:#252920;background:#252920;color:#fff}.cost-card::after{content:'';position:absolute;right:-32px;bottom:-54px;width:125px;height:125px;border:25px solid rgba(215,255,100,.13);border-radius:50%}.cost-card .summary-label,.cost-card small{color:#aeb3a8}.credits-card{border-color:#7566a0;background:#7566a0;color:#fff}.credits-card::after{content:'';position:absolute;right:-34px;bottom:-58px;width:130px;height:130px;border:25px solid rgba(255,255,255,.1);border-radius:50%}.credits-card .summary-label,.credits-card small{color:#ddd8ec}.unpriced-note{display:flex;align-items:center;gap:10px;padding:11px 13px;margin-top:12px;border:1px solid #f0dfb2;border-radius:12px;background:#fff9e8;color:#786126;font-size:.7rem;line-height:1.45}.unpriced-note i{color:#be8d13}.xai-charts{display:grid;grid-template-columns:minmax(0,1.12fr) minmax(360px,.88fr);gap:14px;margin-top:14px}.elevenlabs-panel :deep(.credit-chart){margin-top:14px}.usage-footer{display:flex;align-items:center;justify-content:space-between;gap:20px;padding-top:18px;margin-top:20px;border-top:1px solid #ecece7;color:#8a8f85;font-size:.65rem}.usage-footer i{margin-right:5px;color:#77961d}@media(max-width:1100px){.usage-header{align-items:stretch;flex-direction:column}.usage-actions{justify-content:space-between}.provider-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.xai-charts{grid-template-columns:1fr}.usage-skeleton{grid-template-columns:1fr}.usage-skeleton>*:nth-child(odd){grid-column:auto}}@media(max-width:650px){.ai-usage{padding:20px}.usage-actions{display:grid;grid-template-columns:minmax(0,1fr) auto;width:100%}.range-switch{display:grid;grid-template-columns:repeat(4,minmax(0,1fr))}.range-switch button{padding:7px 4px;font-size:.62rem}.usage-title p{line-height:1.45}.provider-panel{padding:17px}.provider-header{align-items:flex-start;flex-wrap:wrap}.metric-switch{width:100%;margin-left:0}.metric-switch button{flex:1}.provider-summary{grid-template-columns:1fr}.summary-card small{white-space:normal}.usage-footer{align-items:flex-start;flex-direction:column;gap:7px}}
</style>
