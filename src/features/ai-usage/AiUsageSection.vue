<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import { isMockMode } from '@/shared/config/data-mode'
import ProjectSettingsSectionHeader from '@/shared/ui/ProjectSettingsSectionHeader.vue'
import { fetchAiUsageReport } from './ai-usage.api'
import AiModelUsageChart from './components/AiModelUsageChart.vue'
import AiModalityChart from './components/AiModalityChart.vue'
import ElevenLabsCreditChart from './components/ElevenLabsCreditChart.vue'
import { TranslationUsagePanel } from '@/features/scenario-localization/ui'
import {
  AI_USAGE_RANGE_OPTIONS,
  aggregateCreditUsage,
  aggregateModelUsage,
  aggregateProviderUsage,
  formatMoney,
  formatTokenCount,
  getUsageCost,
  getAiUsageRange,
  getProviderBreakdown,
  getUsageCurrency,
  hasUsageCost,
  pluralizeRu,
  type AiUsageMetric,
  type AiUsageRangeKey,
  type AiUsageReport,
} from './ai-usage.model'

const props = defineProps<{ projectId: string }>()

const range = shallowRef<AiUsageRangeKey>('today')
const expanded = shallowRef(false)
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
const caseIntelligenceUsage = computed(() =>
  report.value?.categories.find(
    (category) => category.category === 'CASE_INTELLIGENCE',
  ),
)
const caseIntelligenceBreakdown = computed(() =>
  xAiBreakdown.value.filter((item) => item.operation.startsWith('case_')),
)
const eventQueryUsage = computed(() => report.value?.eventQuery ?? null)
const xAiCurrency = computed(() => getUsageCurrency(xAiBreakdown.value))
const xAiCostAvailable = computed(
  () => Boolean(xAiCurrency.value) && xAiModels.value.some(hasUsageCost),
)
const xAiCostRecords = computed(() =>
  xAiBreakdown.value.reduce(
    (records, item) => records + (getUsageCost(item) > 0 ? item.records : 0),
    0,
  ),
)
const xAiUnpricedRecords = computed(() =>
  Math.max(xAiUsage.value.records - xAiCostRecords.value, 0),
)
const xAiCostLabel = computed(() => {
  if (!xAiCurrency.value) return 'Несколько валют'
  if (!xAiCostRecords.value) return 'Нет данных о стоимости'
  return formatMoney(getUsageCost(xAiUsage.value), xAiCurrency.value)
})
const xAiCostCaption = computed(() => {
  if (!xAiCurrency.value || !xAiCostRecords.value) return 'Нет операций со стоимостью'
  if (xAiUsage.value.billedCost > 0 && xAiUsage.value.estimatedCost > 0) {
    return `${formatMoney(xAiUsage.value.billedCost, xAiCurrency.value)} фактически · ${formatMoney(xAiUsage.value.estimatedCost, xAiCurrency.value)} расчётно`
  }
  return xAiUsage.value.estimatedCost > 0
    ? 'Расчёт по тарифу xAI'
    : 'По данным xAI'
})
const xAiCachedShare = computed(() => {
  if (!xAiUsage.value.inputTokens) return '0% входящих'
  const share =
    (xAiUsage.value.cachedInputTokens / xAiUsage.value.inputTokens) * 100
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(share)}% входящих`
})
const eventQueryCost = computed(() => {
  const linked = eventQueryUsage.value?.linkedAiUsage
  if (!linked) return 0
  const billed = linked.billedCostUsd ?? 0
  const estimated = linked.estimatedCostUsd ?? 0
  return billed > 0 ? billed : estimated
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

function caseOperationLabel(operation: string) {
  const labels: Record<string, string> = {
    case_router: 'Маршрутизация',
    case_aggregator: 'Агрегация',
  }
  return labels[operation] ?? operation.replaceAll(/[_-]+/g, ' ')
}

function formatBytes(value: number) {
  return value < 1024
    ? `${value} Б`
    : `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(value / 1024)} КБ`
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
  <section class="ai-usage card" :class="{ collapsed: !expanded }" aria-labelledby="ai-usage-title">
    <ProjectSettingsSectionHeader
      v-model:expanded="expanded"
      title="Потребление AI"
      description="Метрики разделены по провайдерам и их собственным единицам."
      icon="pi pi-chart-line"
      tone="brand"
      eyebrow="AI consumption"
      heading-id="ai-usage-title"
      content-id="ai-usage-content"
    >
      <template #actions>
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
      </template>
    </ProjectSettingsSectionHeader>

    <div id="ai-usage-content" v-show="expanded">
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
              <p>Токены, операции и стоимость использования.</p>
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
              <span class="summary-label">Стоимость Grok</span>
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
                    'операция xAI без стоимости',
                    'операции xAI без стоимости',
                    'операций xAI без стоимости',
                  )
                }}.</strong
              >
              Они учтены в количестве операций, но не в стоимости.</span
            >
          </div>

          <section
            v-if="caseIntelligenceUsage"
            class="case-usage"
            aria-labelledby="case-intelligence-usage-title"
          >
            <header>
              <span class="provider-mark case-mark"
                ><i class="pi pi-briefcase"
              /></span>
              <div>
                <span class="provider-kicker">AI-кейсы</span>
                <h4 id="case-intelligence-usage-title">
                  Анализ и проверка обращений
                </h4>
              </div>
            </header>
            <div class="case-summary">
              <article>
                <small>Стоимость</small>
                <strong>{{
                  formatMoney(
                    getUsageCost(caseIntelligenceUsage),
                    caseIntelligenceUsage.currency,
                  )
                }}</strong>
              </article>
              <article>
                <small>Токены</small>
                <strong>{{
                  formatTokenCount(caseIntelligenceUsage.totalTokens)
                }}</strong>
              </article>
              <article>
                <small>Операции</small>
                <strong>{{
                  formatTokenCount(caseIntelligenceUsage.records)
                }}</strong>
              </article>
            </div>
            <div
              v-if="caseIntelligenceBreakdown.length"
              class="case-operations"
            >
              <div
                v-for="item in caseIntelligenceBreakdown"
                :key="`${item.operation}:${item.model}:${item.currency}`"
              >
                <span>{{ caseOperationLabel(item.operation) }}</span>
                <small
                  >{{ item.records }}
                  {{
                    pluralizeRu(
                      item.records,
                      'операция',
                      'операции',
                      'операций',
                    )
                  }}</small
                >
                <strong>{{
                  formatMoney(getUsageCost(item), item.currency)
                }}</strong>
              </div>
            </div>
          </section>

          <section
            v-if="eventQueryUsage"
            class="event-query-usage"
            aria-labelledby="event-query-usage-title"
          >
            <header>
              <span class="provider-mark event-query-mark">
                <i class="pi pi-database" />
              </span>
              <div>
                <span class="provider-kicker">Event Query</span>
                <h4 id="event-query-usage-title">Запросы к событиям</h4>
                <p>
                  Вклад данных событий за выбранный период. Связанные токены и
                  стоимость уже входят в итог Grok выше.
                </p>
              </div>
            </header>
            <div class="event-query-summary">
              <article>
                <small>Запросы</small>
                <strong>{{ formatTokenCount(eventQueryUsage.calls) }}</strong>
              </article>
              <article>
                <small>Данные событий</small>
                <strong>{{ formatBytes(eventQueryUsage.resultBytes) }}</strong>
              </article>
              <article>
                <small>Оценка вклада</small>
                <strong>
                  {{
                    formatTokenCount(
                      eventQueryUsage.estimatedAddedInputTokens,
                    )
                  }}
                  токенов
                </strong>
              </article>
              <article>
                <small>Связано с Grok</small>
                <strong>
                  {{
                    formatTokenCount(
                      eventQueryUsage.linkedAiUsage.totalTokens,
                    )
                  }}
                  токенов
                </strong>
                <span v-if="eventQueryCost">
                  {{ formatMoney(eventQueryCost, 'usd') }}
                </span>
              </article>
            </div>
          </section>

          <aside
            class="voice-pricing-note"
            aria-label="Расчёт стоимости голосового Grok"
          >
            <i class="pi pi-info-circle" />
            <p>
              Стоимость голосового Grok рассчитывается по тарифу xAI Realtime:
              <strong>0,05 $ за минуту отправленного и полученного аудио</strong>.
              <a
                href="https://docs.x.ai/developers/pricing#voice-api"
                target="_blank"
                rel="noopener noreferrer"
              >Открыть таблицу тарифов</a>.
              Если ставка изменилась, сообщите в поддержку.
            </p>
          </aside>

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
        <span>Стоимость Grok включает данные xAI и расчёт по тарифу провайдера.</span>
      </footer>
    </template>
      <TranslationUsagePanel :project-id="projectId" />
    </div>
  </section>
</template>

<style scoped>
.ai-usage{margin-top:22px;padding:26px}.usage-actions{display:flex;align-items:center;gap:7px}.range-switch,.metric-switch{display:flex;gap:3px;padding:4px;border:1px solid var(--border-default);border-radius:12px;background:var(--surface-subtle)}.range-switch button,.metric-switch button{padding:7px 10px;border:0;border-radius:8px;background:transparent;color:var(--text-small-muted);font-size:.69rem;font-weight:700;cursor:pointer;white-space:nowrap}.range-switch button.active{background:var(--surface-emphasis);color:var(--text-on-emphasis);box-shadow:var(--shadow-raised)}.metric-switch{margin-left:auto}.metric-switch button.active{background:var(--surface-card);color:var(--text-primary);box-shadow:var(--shadow-raised)}.metric-switch button:disabled{cursor:not-allowed;opacity:.42}.error-row{display:flex;align-items:center;justify-content:space-between;gap:16px;width:100%}.usage-skeleton{display:grid;grid-template-columns:1fr 1fr;gap:14px}.usage-skeleton>*:nth-child(odd){grid-column:1/-1}.provider-stack{display:flex;flex-direction:column;gap:18px}.provider-panel{padding:22px;border:1px solid var(--border-default);border-radius:20px;background:var(--surface-subtle)}.provider-header{display:flex;align-items:center;gap:13px;padding-bottom:18px;margin-bottom:18px;border-bottom:1px solid var(--border-subtle)}.provider-mark{display:grid;place-items:center;width:42px;height:42px;flex:0 0 auto;border-radius:13px}.xai-mark{background:var(--status-violet-soft);color:var(--status-violet)}.elevenlabs-mark{background:var(--status-violet-soft);color:var(--status-violet-text)}.provider-kicker{display:block;margin-bottom:3px;color:var(--text-small-muted);font-size:.62rem;font-weight:700;letter-spacing:.11em;text-transform:uppercase}.provider-header h3{margin:0;font-size:1.08rem}.provider-header p{margin:3px 0 0;color:var(--text-small-muted);font-size:.7rem}.provider-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.summary-card{position:relative;min-width:0;overflow:hidden;padding:17px;border:1px solid var(--border-default);border-radius:15px;background:var(--surface-card)}.summary-label{display:block;color:var(--text-small-muted);font-size:.66rem;font-weight:600}.summary-card strong{position:relative;z-index:1;display:block;overflow:hidden;margin:11px 0 5px;font:700 clamp(1.2rem,2.2vw,1.6rem) var(--font-display);text-overflow:ellipsis;white-space:nowrap}.summary-card small{position:relative;z-index:1;display:block;overflow:hidden;color:var(--text-small-muted);font-size:.62rem;text-overflow:ellipsis;white-space:nowrap}.cost-card{border-color:var(--surface-emphasis);background:var(--surface-emphasis);color:var(--text-on-emphasis)}.cost-card::after{content:'';position:absolute;right:-32px;bottom:-54px;width:125px;height:125px;border:25px solid color-mix(in srgb,var(--brand) 13%,transparent);border-radius:50%}.cost-card .summary-label,.cost-card small{color:var(--text-on-emphasis-muted)}.credits-card{border-color:var(--ai-credits-surface);background:var(--ai-credits-surface);color:var(--ai-credits-text)}.credits-card::after{content:'';position:absolute;right:-34px;bottom:-58px;width:130px;height:130px;border:25px solid color-mix(in srgb,var(--ai-credits-text) 10%,transparent);border-radius:50%}.credits-card .summary-label,.credits-card small{color:var(--ai-credits-muted)}.unpriced-note,.voice-pricing-note{display:flex;align-items:center;gap:10px;padding:11px 13px;margin-top:12px;border-radius:12px;font-size:.7rem;line-height:1.45}.unpriced-note{border:1px solid color-mix(in srgb,var(--status-warning) 35%,var(--border-default));background:var(--status-warning-soft);color:var(--status-warning-text)}.unpriced-note i{color:var(--status-warning)}.case-usage{padding:16px;margin-top:14px;border:1px solid color-mix(in srgb,var(--status-violet) 24%,var(--border-default));border-radius:16px;background:var(--surface-card)}.case-usage>header{display:flex;align-items:center;gap:11px}.case-mark{width:36px;height:36px;background:var(--status-violet-soft);color:var(--status-violet)}.case-usage h4{margin:0;font-size:.88rem}.case-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-top:13px}.case-summary article{padding:11px;border-radius:11px;background:var(--surface-subtle)}.case-summary small,.case-summary strong{display:block}.case-summary small{color:var(--text-small-muted);font-size:.62rem}.case-summary strong{margin-top:5px;font:700 .9rem var(--font-display)}.case-operations{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.case-operations>div{display:grid;grid-template-columns:auto auto;gap:2px 10px;padding:9px 11px;border:1px solid var(--border-subtle);border-radius:10px}.case-operations span{font-size:.68rem;font-weight:700}.case-operations small{color:var(--text-small-muted);font-size:.59rem}.case-operations strong{grid-column:2;grid-row:1/3;align-self:center;font-size:.68rem}.voice-pricing-note{align-items:flex-start;margin-top:14px;border:1px solid color-mix(in srgb,var(--status-violet) 30%,var(--border-default));background:var(--status-violet-soft);color:var(--status-violet-text)}.voice-pricing-note i{margin-top:2px;color:var(--status-violet)}.voice-pricing-note p{margin:0}.voice-pricing-note a{color:var(--text-link);font-weight:700;text-decoration:none}.voice-pricing-note a:hover{text-decoration:underline}.xai-charts{display:grid;grid-template-columns:minmax(0,1.12fr) minmax(360px,.88fr);gap:14px;margin-top:14px}.elevenlabs-panel :deep(.credit-chart){margin-top:14px}.usage-footer{display:flex;align-items:center;justify-content:space-between;gap:20px;padding-top:18px;margin-top:20px;border-top:1px solid var(--border-subtle);color:var(--text-small-muted);font-size:.65rem}.usage-footer i{margin-right:5px;color:var(--text-brand)}@media(max-width:1100px){.usage-actions{justify-content:space-between}.provider-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.xai-charts{grid-template-columns:1fr}.usage-skeleton{grid-template-columns:1fr}.usage-skeleton>*:nth-child(odd){grid-column:auto}}@media(max-width:650px){.ai-usage{padding:20px}.usage-actions{display:grid;grid-template-columns:minmax(0,1fr) auto;width:100%}.range-switch{display:grid;grid-template-columns:repeat(4,minmax(0,1fr))}.range-switch button{padding:7px 4px;font-size:.62rem}.provider-panel{padding:17px}.provider-header{align-items:flex-start;flex-wrap:wrap}.metric-switch{width:100%;margin-left:0}.metric-switch button{flex:1}.provider-summary,.case-summary{grid-template-columns:1fr}.summary-card small{white-space:normal}.usage-footer{align-items:flex-start;flex-direction:column;gap:7px}}
.event-query-usage{padding:16px;margin-top:14px;border:1px solid color-mix(in srgb,var(--status-violet) 24%,var(--border-default));border-radius:16px;background:var(--surface-card)}.event-query-usage>header{display:flex;align-items:center;gap:11px}.event-query-mark{width:36px;height:36px;background:var(--status-violet-soft);color:var(--status-violet)}.event-query-usage h4{margin:0;font-size:.88rem}.event-query-usage header p{margin:3px 0 0;color:var(--text-small-muted);font-size:.65rem}.event-query-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-top:13px}.event-query-summary article{padding:11px;border-radius:11px;background:var(--surface-subtle)}.event-query-summary small,.event-query-summary strong,.event-query-summary span{display:block}.event-query-summary small,.event-query-summary span{color:var(--text-small-muted);font-size:.62rem}.event-query-summary strong{margin-top:5px;font:700 .9rem var(--font-display)}.event-query-summary span{margin-top:3px}@media(max-width:900px){.event-query-summary{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:650px){.event-query-summary{grid-template-columns:1fr}}
</style>
