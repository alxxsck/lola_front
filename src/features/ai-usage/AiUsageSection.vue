<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue';
import Button from 'primevue/button';
import Message from 'primevue/message';
import Skeleton from 'primevue/skeleton';
import { TranslationUsagePanel } from '@/features/scenario-localization/ui';
import { isMockMode } from '@/shared/config/data-mode';
import { compareDecimalStrings } from '@/shared/lib/decimal-money';
import ProjectSettingsSectionHeader from '@/shared/ui/ProjectSettingsSectionHeader.vue';
import { fetchAiUsageReport } from './ai-usage.api';
import AiModelUsageSlice from './components/AiModelUsageSlice.vue';
import AiSpeechUsageSlice from './components/AiSpeechUsageSlice.vue';
import AiVoiceUsageSlice from './components/AiVoiceUsageSlice.vue';
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
} from './ai-usage.model';

const props = defineProps<{ projectId: string }>();

const range = shallowRef<AiUsageRangeKey>('today');
const expanded = shallowRef(false);
const report = shallowRef<AiUsageReport | null>(null);
const loading = shallowRef(false);
const error = shallowRef('');
const cache = new Map<AiUsageRangeKey, AiUsageReport>();
let activeRequest: AbortController | undefined;
let requestGeneration = 0;

const totals = computed(() => report.value?.totals);
const xAiBreakdown = computed(() =>
  report.value ? getProviderBreakdown(report.value.breakdown, 'xai') : [],
);
const xAiUsage = computed(() => aggregateProviderUsage(xAiBreakdown.value));
const voiceUsage = computed(() =>
  report.value ? getCategoryUsage(report.value, 'VOICE') : undefined,
);
const speechUsage = computed(() =>
  report.value ? getCategoryUsage(report.value, 'SPEECH') : undefined,
);
const caseIntelligenceUsage = computed(() =>
  report.value ? getCategoryUsage(report.value, 'CASE_INTELLIGENCE') : undefined,
);
const eventQueryUsage = computed(() => report.value?.eventQuery ?? null);
const xAiCurrency = computed(() => getUsageCurrency(xAiBreakdown.value));
const eventQueryCost = computed(() => {
  const linked = eventQueryUsage.value?.linkedAiUsage;
  if (!linked) return '0';
  const billed = linked.billedCostUsd ?? '0';
  const estimated = linked.estimatedCostUsd ?? '0';
  return compareDecimalStrings(billed, '0') > 0 ? billed : estimated;
});
const eventQueryHasCost = computed(() => compareDecimalStrings(eventQueryCost.value, '0') > 0);

function operationCount(value: number) {
  return `${formatTokenCount(value)} ${pluralizeRu(value, 'операция', 'операции', 'операций')}`;
}

function formatBytes(value: number) {
  return value < 1024
    ? `${value} Б`
    : `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(value / 1024)} КБ`;
}
function formatLatency(value: number | null) {
  return value === null
    ? '—'
    : `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value)} мс`;
}
function workloadLabel(value: string) {
  return (
    {
      ASSISTANT: 'Основное общение',
      SCENARIO_AUTHORING: 'Переводы сценариев',
      CONVERSATION_INBOUND: 'Входящие сообщения',
      CONVERSATION_OUTBOUND: 'Исходящие ответы',
    }[value] ?? value
  );
}
async function load(force = false) {
  const requestedRange = range.value;
  const cached = cache.get(requestedRange);
  if (cached && !force) {
    activeRequest?.abort();
    activeRequest = undefined;
    requestGeneration += 1;
    loading.value = false;
    report.value = cached;
    error.value = '';
    return;
  }

  activeRequest?.abort();
  const controller = new AbortController();
  activeRequest = controller;
  const generation = ++requestGeneration;
  loading.value = true;
  error.value = '';
  if (!cached) report.value = null;

  try {
    const nextReport = await fetchAiUsageReport(
      props.projectId,
      getAiUsageRange(requestedRange),
      controller.signal,
    );
    if (generation !== requestGeneration) return;
    cache.set(requestedRange, nextReport);
    report.value = nextReport;
  } catch (cause) {
    if (controller.signal.aborted || generation !== requestGeneration) return;
    error.value = cause instanceof Error ? cause.message : 'Не удалось загрузить потребление AI';
  } finally {
    if (generation === requestGeneration) loading.value = false;
  }
}

function selectRange(nextRange: AiUsageRangeKey) {
  if (nextRange === range.value) return;
  range.value = nextRange;
  void load();
}

watch(
  () => props.projectId,
  () => {
    cache.clear();
    report.value = null;
    void load();
  },
);

onMounted(() => void load());
onBeforeUnmount(() => {
  requestGeneration += 1;
  activeRequest?.abort();
});
</script>

<template>
  <section class="ai-usage card" :class="{ collapsed: !expanded }" aria-labelledby="ai-usage-title">
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
          <Button label="Повторить" icon="pi pi-refresh" size="small" text @click="load(true)" />
        </div>
      </Message>

      <div v-if="loading && !report" class="usage-skeleton" aria-label="Загрузка статистики">
        <Skeleton height="10rem" border-radius="18px" />
        <Skeleton height="24rem" border-radius="18px" />
        <Skeleton height="18rem" border-radius="18px" />
      </div>

      <template v-else-if="report && totals">
        <div class="provider-stack">
          <section class="provider-panel xai-panel" aria-labelledby="xai-usage-title">
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
                  >{{ totals.providerReportedCostRecords ?? 0 }} операций с provider-reported
                  ценой</small
                >
              </article>
              <article class="summary-card estimated-cost">
                <span class="summary-label">Расчёт по тарифу</span>
                <strong>{{
                  xAiCurrency
                    ? formatMoney(xAiUsage.estimatedFallbackCost, xAiCurrency)
                    : 'Несколько валют'
                }}</strong>
                <small>{{ totals.estimatedCostRecords ?? 0 }} операций рассчитано локально</small>
              </article>
              <article class="summary-card effective-cost">
                <span class="summary-label">Общий расход</span>
                <strong>{{
                  xAiCurrency ? formatMoney(xAiUsage.effectiveCost, xAiCurrency) : 'Несколько валют'
                }}</strong>
                <small>Сумма фактической и расчётной частей</small>
              </article>
            </div>

            <div v-if="totals.unpricedRecords" class="unpriced-note" role="status">
              <i class="pi pi-info-circle" />
              <span>
                {{ operationCount(totals.unpricedRecords) }} без денежной стоимости учтены только в
                количестве.
              </span>
            </div>

            <AiModelUsageSlice :breakdown="xAiBreakdown" :case-usage="caseIntelligenceUsage" />

            <section
              v-if="report.workloads?.length"
              class="workload-usage"
              aria-labelledby="workload-usage-title"
            >
              <header>
                <div>
                  <span class="provider-kicker">Фактически применено</span>
                  <h4 id="workload-usage-title">Модели по назначению</h4>
                  <p>Requested и applied model могут различаться при безопасном fallback.</p>
                </div>
              </header>
              <div class="workload-grid">
                <article
                  v-for="item in report.workloads ?? []"
                  :key="`${item.workload}:${item.appliedModel}:${item.reasoningEffort}:${item.isOther}`"
                >
                  <div>
                    <strong>{{
                      item.isOther
                        ? `${workloadLabel(item.workload)} · Другие`
                        : workloadLabel(item.workload)
                    }}</strong>
                    <span v-if="item.isOther">Агрегированные редкие комбинации</span>
                    <span v-else
                      >{{ item.appliedModel ?? 'Модель не зафиксирована' }} · reasoning
                      {{ item.reasoningEffort ?? 'неизвестен' }}</span
                    >
                  </div>
                  <dl>
                    <div>
                      <dt>Запросы</dt>
                      <dd>{{ formatTokenCount(item.requests) }}</dd>
                    </div>
                    <div>
                      <dt>Reasoning</dt>
                      <dd>{{ formatTokenCount(item.reasoningTokens) }}</dd>
                    </div>
                    <div>
                      <dt>Средняя задержка</dt>
                      <dd>{{ formatLatency(item.averageLatencyMs) }}</dd>
                    </div>
                    <div>
                      <dt>Стоимость</dt>
                      <dd>{{ formatMoney(item.effectiveCostUsd, 'usd') }}</dd>
                    </div>
                  </dl>
                  <small
                    v-if="
                      !item.isOther &&
                      item.requestedModel &&
                      item.requestedModel !== item.appliedModel
                    "
                  >
                    Запрошено: {{ item.requestedModel }}
                  </small>
                </article>
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
                    Вклад данных событий за выбранный период. Связанные токены и стоимость уже
                    входят в итог Grok выше.
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
                    {{ formatTokenCount(eventQueryUsage.estimatedAddedInputTokens) }}
                    токенов
                  </strong>
                </article>
                <article>
                  <small>Связано с Grok</small>
                  <strong>
                    {{ formatTokenCount(eventQueryUsage.linkedAiUsage.totalTokens) }}
                    токенов
                  </strong>
                  <span v-if="eventQueryHasCost">
                    {{ formatMoney(eventQueryCost, 'usd') }}
                  </span>
                </article>
              </div>
            </section>

            <AiVoiceUsageSlice :usage="voiceUsage" :fallback-currency="xAiCurrency" />
            <AiSpeechUsageSlice
              :usage="speechUsage"
              :pricing="report.textToSpeechPricing"
              :fallback-currency="xAiCurrency"
            />
          </section>
        </div>

        <footer class="usage-footer">
          <span v-if="isMockMode">
            <i class="pi pi-database" /> Демонстрационные данные для предварительного просмотра.
          </span>
          <span v-else>
            <i class="pi pi-shield" /> Данные доступны только участникам проекта через защищённый
            CMS endpoint.
          </span>
          <span>Исторические суммы приходят из backend и не пересчитываются.</span>
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
.provider-header {
  display: flex;
  align-items: center;
}

.usage-actions {
  gap: 7px;
}

.range-switch {
  display: flex;
  gap: 3px;
  padding: 4px;
  border: 1px solid var(--border-default);
  border-radius: 12px;
  background: var(--surface-subtle);
}

.range-switch button {
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

.provider-mark {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 13px;
}

.provider-mark {
  width: 42px;
  height: 42px;
}

.xai-mark {
  background: var(--status-accent-soft);
  color: var(--status-accent);
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

.provider-header h3 {
  margin: 0;
}

.provider-header h3 {
  font-size: 1.08rem;
}

.provider-header p {
  margin: 3px 0 0;
  color: var(--text-small-muted);
  font-size: 0.7rem;
  line-height: 1.45;
}

.provider-summary {
  display: grid;
  gap: 12px;
}

.provider-summary {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.summary-card {
  min-width: 0;
  padding: 17px;
  border: 1px solid var(--border-default);
  border-radius: 15px;
  background: var(--surface-card);
}

.summary-label {
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

.unpriced-note {
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
  border: 1px solid color-mix(in srgb, var(--status-warning) 35%, var(--border-default));
  background: var(--status-warning-soft);
  color: var(--status-warning-text);
}

.event-query-usage {
  padding: 16px;
  margin-top: 14px;
  border: 1px solid color-mix(in srgb, var(--status-accent) 24%, var(--border-default));
  border-radius: 16px;
  background: var(--surface-card);
}
.workload-usage {
  padding: 16px;
  margin-top: 14px;
  border: 1px solid color-mix(in srgb, var(--status-accent) 24%, var(--border-default));
  border-radius: 16px;
  background: var(--surface-card);
}
.workload-usage h4 {
  margin: 0;
  font-size: 0.88rem;
}
.workload-usage header p {
  margin: 3px 0 0;
  color: var(--text-small-muted);
  font-size: 0.65rem;
}
.workload-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
  margin-top: 13px;
}
.workload-grid > article {
  display: grid;
  gap: 10px;
  padding: 13px;
  border-radius: 12px;
  background: var(--surface-subtle);
}
.workload-grid > article > div {
  display: grid;
  gap: 3px;
}
.workload-grid span,
.workload-grid small,
.workload-grid dt {
  color: var(--text-small-muted);
  font-size: 0.61rem;
}
.workload-grid dl {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 7px;
  margin: 0;
}
.workload-grid dl > div {
  min-width: 0;
}
.workload-grid dd {
  margin: 3px 0 0;
  overflow: hidden;
  font-size: 0.68rem;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.event-query-usage > header {
  display: flex;
  align-items: center;
  gap: 11px;
}

.event-query-mark {
  width: 36px;
  height: 36px;
  background: var(--status-accent-soft);
  color: var(--status-accent);
}

.event-query-usage h4 {
  margin: 0;
  font-size: 0.88rem;
}

.event-query-usage header p {
  margin: 3px 0 0;
  color: var(--text-small-muted);
  font-size: 0.65rem;
}

.event-query-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 9px;
  margin-top: 13px;
}

.event-query-summary article {
  padding: 11px;
  border-radius: 11px;
  background: var(--surface-subtle);
}

.event-query-summary small,
.event-query-summary strong,
.event-query-summary span {
  display: block;
}

.event-query-summary small,
.event-query-summary span {
  color: var(--text-small-muted);
  font-size: 0.62rem;
}

.event-query-summary strong {
  margin-top: 5px;
  font: 700 0.9rem var(--font-display);
}

.event-query-summary span {
  margin-top: 3px;
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
@media (max-width: 760px) {
  .workload-grid {
    grid-template-columns: 1fr;
  }
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
}

@media (max-width: 900px) {
  .event-query-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
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

  .provider-panel {
    padding: 16px;
  }

  .provider-header {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .provider-summary {
    grid-template-columns: 1fr;
  }

  .effective-cost {
    grid-column: auto;
  }

  .event-query-summary {
    grid-template-columns: 1fr;
  }

  .usage-footer {
    align-items: flex-start;
    flex-direction: column;
    gap: 7px;
  }
}
</style>
