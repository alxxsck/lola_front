<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import { TranslationUsagePanel } from '@/features/scenario-localization/ui'
import { isMockMode } from '@/shared/config/data-mode'
import ProjectSettingsSectionHeader from '@/shared/ui/ProjectSettingsSectionHeader.vue'
import { fetchAiUsageReport } from './ai-usage.api'
import AiModelUsageSlice from './components/AiModelUsageSlice.vue'
import AiSpeechUsageSlice from './components/AiSpeechUsageSlice.vue'
import AiVoiceUsageSlice from './components/AiVoiceUsageSlice.vue'
import {
  AI_USAGE_RANGE_OPTIONS,
  aggregateProviderUsage,
  formatMoney,
  formatTokenCount,
  getAiUsageRange,
  getCategoryUsage,
  getProviderBreakdown,
  getUsageCurrency,
  pluralizeRu,
  type AiUsageRangeKey,
  type AiUsageReport,
} from './ai-usage.model'

const props = defineProps<{ projectId: string }>()

const range = shallowRef<AiUsageRangeKey>('today')
const expanded = shallowRef(false)
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
const xAiUsage = computed(() => aggregateProviderUsage(xAiBreakdown.value))
const voiceUsage = computed(() =>
  report.value ? getCategoryUsage(report.value, 'VOICE') : undefined,
)
const speechUsage = computed(() =>
  report.value ? getCategoryUsage(report.value, 'SPEECH') : undefined,
)
const caseIntelligenceUsage = computed(() =>
  report.value
    ? getCategoryUsage(report.value, 'CASE_INTELLIGENCE')
    : undefined,
)
const xAiCurrency = computed(() => getUsageCurrency(xAiBreakdown.value))

function operationCount(value: number) {
  return `${formatTokenCount(value)} ${pluralizeRu(value, 'операция', 'операции', 'операций')}`
}

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
  <section
    class="ai-usage card"
    :class="{ collapsed: !expanded }"
    aria-labelledby="ai-usage-title"
  >
    <ProjectSettingsSectionHeader
      v-model:expanded="expanded"
      title="Потребление AI"
      description="Модели, голосовой чат и озвучивание текста в едином xAI ledger."
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
        <Skeleton height="18rem" border-radius="18px" />
      </div>

      <template v-else-if="report && totals">
        <div class="provider-stack">
          <section
            class="provider-panel xai-panel"
            aria-labelledby="xai-usage-title"
          >
            <header class="provider-header">
              <span class="provider-mark xai-mark">
                <i class="pi pi-sparkles" />
              </span>
              <div>
                <span class="provider-kicker">Единый AI provider</span>
                <h3 id="xai-usage-title">xAI</h3>
                <p>Расходы разделены по источнику стоимости и назначению.</p>
              </div>
            </header>

            <div class="provider-summary total-summary">
              <article class="summary-card actual-cost">
                <span class="summary-label">Фактически по данным xAI</span>
                <strong>{{
                  xAiCurrency
                    ? formatMoney(xAiUsage.providerReportedCost, xAiCurrency)
                    : 'Несколько валют'
                }}</strong>
                <small
                  >{{ totals.providerReportedCostRecords ?? 0 }} операций с
                  provider-reported ценой</small
                >
              </article>
              <article class="summary-card estimated-cost">
                <span class="summary-label">Расчёт по тарифу</span>
                <strong>{{
                  xAiCurrency
                    ? formatMoney(xAiUsage.estimatedFallbackCost, xAiCurrency)
                    : 'Несколько валют'
                }}</strong>
                <small
                  >{{ totals.estimatedCostRecords ?? 0 }} операций рассчитано
                  локально</small
                >
              </article>
              <article class="summary-card effective-cost">
                <span class="summary-label">Общий расход</span>
                <strong>{{
                  xAiCurrency
                    ? formatMoney(xAiUsage.effectiveCost, xAiCurrency)
                    : 'Несколько валют'
                }}</strong>
                <small>Сумма фактической и расчётной частей</small>
              </article>
            </div>

            <div
              v-if="totals.unpricedRecords"
              class="unpriced-note"
              role="status"
            >
              <i class="pi pi-info-circle" />
              <span>
                {{ operationCount(totals.unpricedRecords) }} без денежной
                стоимости учтены только в количестве.
              </span>
            </div>

            <AiModelUsageSlice
              :breakdown="xAiBreakdown"
              :case-usage="caseIntelligenceUsage"
            />

            <AiVoiceUsageSlice
              :usage="voiceUsage"
              :fallback-currency="xAiCurrency"
            />
            <AiSpeechUsageSlice
              :usage="speechUsage"
              :pricing="report.textToSpeechPricing"
              :fallback-currency="xAiCurrency"
            />
          </section>
        </div>

        <footer class="usage-footer">
          <span v-if="isMockMode">
            <i class="pi pi-database" /> Демонстрационные данные для
            предварительного просмотра.
          </span>
          <span v-else>
            <i class="pi pi-shield" /> Данные доступны только участникам проекта
            через защищённый CMS endpoint.
          </span>
          <span
            >Исторические суммы приходят из backend и не пересчитываются.</span
          >
        </footer>
      </template>

      <TranslationUsagePanel :project-id="projectId" />
    </div>
  </section>
</template>

<style scoped>
.ai-usage {
  margin-top: 22px;
  padding: 26px;
}

.usage-actions,
.error-row,
.provider-header,
.slice-header {
  display: flex;
  align-items: center;
}

.usage-actions {
  gap: 7px;
}

.range-switch,
.metric-switch {
  display: flex;
  gap: 3px;
  padding: 4px;
  border: 1px solid var(--border-default);
  border-radius: 12px;
  background: var(--surface-subtle);
}

.range-switch button,
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

.range-switch button.active {
  background: var(--surface-emphasis);
  color: var(--text-on-emphasis);
  box-shadow: var(--shadow-raised);
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

.error-row {
  justify-content: space-between;
  gap: 16px;
  width: 100%;
}

.usage-skeleton {
  display: grid;
  gap: 14px;
}

.provider-stack {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.provider-panel {
  min-width: 0;
  padding: 22px;
  border: 1px solid var(--border-default);
  border-radius: 20px;
  background: var(--surface-subtle);
}

.provider-header {
  gap: 13px;
  padding-bottom: 18px;
  margin-bottom: 18px;
  border-bottom: 1px solid var(--border-subtle);
}

.provider-mark,
.slice-icon {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 13px;
}

.provider-mark {
  width: 42px;
  height: 42px;
}

.xai-mark,
.case-mark,
.slice-icon {
  background: var(--status-violet-soft);
  color: var(--status-violet);
}

.provider-kicker {
  display: block;
  margin-bottom: 3px;
  color: var(--text-small-muted);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.11em;
  text-transform: uppercase;
}

.provider-header h3,
.slice-header h4,
.case-usage h5 {
  margin: 0;
}

.provider-header h3 {
  font-size: 1.08rem;
}

.provider-header p,
.slice-header p {
  margin: 3px 0 0;
  color: var(--text-small-muted);
  font-size: 0.7rem;
  line-height: 1.45;
}

.provider-summary,
.slice-summary,
.case-summary {
  display: grid;
  gap: 12px;
}

.provider-summary {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.summary-card,
.slice-summary article,
.case-summary article {
  min-width: 0;
  padding: 17px;
  border: 1px solid var(--border-default);
  border-radius: 15px;
  background: var(--surface-card);
}

.summary-label,
.slice-summary small,
.case-summary small {
  display: block;
  color: var(--text-small-muted);
  font-size: 0.66rem;
  font-weight: 600;
}

.summary-card strong {
  display: block;
  overflow: hidden;
  margin: 11px 0 5px;
  font: 700 clamp(1.15rem, 2vw, 1.55rem) var(--font-display);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.summary-card small {
  display: block;
  color: var(--text-small-muted);
  font-size: 0.62rem;
  line-height: 1.4;
}

.effective-cost {
  border-color: var(--surface-emphasis);
  background: var(--surface-emphasis);
  color: var(--text-on-emphasis);
}

.effective-cost .summary-label,
.effective-cost small {
  color: var(--text-on-emphasis-muted);
}

.unpriced-note,
.calculation-note,
.pricing-context {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 11px 13px;
  border-radius: 12px;
  font-size: 0.7rem;
  line-height: 1.45;
}

.unpriced-note {
  margin-top: 12px;
  border: 1px solid
    color-mix(in srgb, var(--status-warning) 35%, var(--border-default));
  background: var(--status-warning-soft);
  color: var(--status-warning-text);
}

.usage-slice {
  min-width: 0;
  padding: 18px;
  margin-top: 16px;
  border: 1px solid var(--border-default);
  border-radius: 17px;
  background: var(--surface-card);
}

.slice-header {
  justify-content: space-between;
  gap: 16px;
}

.slice-header h4 {
  font-size: 0.95rem;
}

.slice-icon {
  width: 38px;
  height: 38px;
}

.metric-switch {
  flex: 0 0 auto;
}

.slice-summary {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-top: 14px;
}

.slice-summary article {
  padding: 13px;
  background: var(--surface-subtle);
}

.slice-summary strong {
  display: block;
  margin-top: 6px;
  font: 700 1rem var(--font-display);
  overflow-wrap: anywhere;
}

.slice-summary span {
  display: block;
  margin-top: 3px;
  color: var(--text-small-muted);
  font-size: 0.61rem;
}

.case-usage {
  padding: 16px;
  margin-top: 14px;
  border: 1px solid
    color-mix(in srgb, var(--status-violet) 24%, var(--border-default));
  border-radius: 16px;
  background: var(--surface-subtle);
}

.case-usage > header {
  display: flex;
  align-items: center;
  gap: 11px;
}

.case-mark {
  width: 36px;
  height: 36px;
}

.case-summary {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-top: 13px;
}

.case-summary article {
  padding: 11px;
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

.calculation-note {
  margin: 12px 0 0;
  border: 1px solid
    color-mix(in srgb, var(--status-violet) 24%, var(--border-default));
  background: var(--status-violet-soft);
  color: var(--status-violet-text);
}

.pricing-context {
  margin-top: 12px;
  border: 1px solid
    color-mix(in srgb, var(--status-violet) 30%, var(--border-default));
  background: var(--status-violet-soft);
  color: var(--status-violet-text);
}

.pricing-context > div {
  display: grid;
  gap: 3px;
}

.pricing-context a {
  width: fit-content;
  margin-top: 3px;
  color: var(--text-link);
  font-weight: 700;
  text-decoration: none;
}

.pricing-context a:hover {
  text-decoration: underline;
}

.usage-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding-top: 18px;
  margin-top: 20px;
  border-top: 1px solid var(--border-subtle);
  color: var(--text-small-muted);
  font-size: 0.65rem;
}

.usage-footer i {
  margin-right: 5px;
  color: var(--text-brand);
}

@media (max-width: 1100px) {
  .usage-actions {
    justify-content: space-between;
  }

  .provider-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .effective-cost {
    grid-column: 1 / -1;
  }

  .xai-charts {
    grid-template-columns: 1fr;
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

  .provider-panel,
  .usage-slice {
    padding: 16px;
  }

  .provider-header,
  .slice-header {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .metric-switch {
    width: 100%;
  }

  .metric-switch button {
    flex: 1;
  }

  .provider-summary,
  .slice-summary,
  .case-summary {
    grid-template-columns: 1fr;
  }

  .effective-cost {
    grid-column: auto;
  }

  .usage-footer {
    align-items: flex-start;
    flex-direction: column;
    gap: 7px;
  }
}
</style>
