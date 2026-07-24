<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import Button from "primevue/button";
import Message from "primevue/message";
import Skeleton from "primevue/skeleton";
import type { AiUsageRangeKey } from "./ai-usage.model";
import { fetchEndUserAiUsageReport } from "./end-user-ai-usage.api";
import {
  END_USER_AI_USAGE_CATEGORY_LABELS,
  END_USER_AI_USAGE_WINDOWS,
  type EndUserAiUsageCategoryRow,
  type EndUserAiUsageReport,
} from "./end-user-ai-usage.model";

const props = defineProps<{
  projectId: string;
  endUserId: string;
}>();

const windowKey = ref<AiUsageRangeKey>("7d");
const report = ref<EndUserAiUsageReport | null>(null);
const loading = ref(true);
const error = ref("");
let requestGeneration = 0;
let controller: AbortController | undefined;

const maxCategoryCost = computed(() =>
  Math.max(
    0,
    ...(report.value?.categories.map((item) => item.effectiveCost) ?? [0]),
  ),
);

function categoryWidth(category: EndUserAiUsageCategoryRow) {
  if (!maxCategoryCost.value || !category.effectiveCost) return "0%";
  return `${Math.max(8, (category.effectiveCost / maxCategoryCost.value) * 100)}%`;
}

function formatCount(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatMoney(value: number, currency = "usd") {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: value > 0 && value < 0.01 ? 4 : 2,
    maximumFractionDigits: value > 0 && value < 0.01 ? 6 : 2,
  }).format(value);
}

function categoryCost(category: EndUserAiUsageCategoryRow) {
  if (category.providerReportedCost > 0)
    return `${formatMoney(category.providerReportedCost, category.currency)} по данным провайдера`;
  if (category.estimatedFallbackCost > 0)
    return `${formatMoney(category.estimatedFallbackCost, category.currency)} оценка`;
  if (category.providerBilledUnits > 0)
    return `${formatCount(category.providerBilledUnits)} ед.`;
  return `${category.records} операций`;
}

async function load(nextWindow = windowKey.value) {
  controller?.abort();
  controller = new AbortController();
  const generation = ++requestGeneration;
  loading.value = true;
  error.value = "";
  try {
    const nextReport = await fetchEndUserAiUsageReport(
      props.projectId,
      props.endUserId,
      nextWindow,
      controller.signal,
    );
    if (generation === requestGeneration) report.value = nextReport;
  } catch (cause) {
    if (controller.signal.aborted || generation !== requestGeneration) return;
    error.value =
      cause instanceof Error
        ? cause.message
        : "Не удалось загрузить потребление пользователя";
  } finally {
    if (generation === requestGeneration) loading.value = false;
  }
}

function selectWindow(nextWindow: AiUsageRangeKey) {
  if (nextWindow === windowKey.value) return;
  windowKey.value = nextWindow;
  report.value = null;
  void load(nextWindow);
}

watch(
  () => [props.projectId, props.endUserId] as const,
  () => {
    report.value = null;
    void load();
  },
);
onMounted(() => void load());
onBeforeUnmount(() => controller?.abort());
</script>

<template>
  <section class="usage-card" aria-labelledby="end-user-ai-usage-title">
    <header>
      <div>
        <span class="usage-kicker">Потребление</span>
        <h3 id="end-user-ai-usage-title">
          <i class="pi pi-chart-line" /> AI и голос
        </h3>
      </div>
      <div class="window-switch" aria-label="Период потребления">
        <button
          v-for="option in END_USER_AI_USAGE_WINDOWS"
          :key="option.value"
          type="button"
          :data-window="option.value"
          :class="{ active: windowKey === option.value }"
          :aria-pressed="windowKey === option.value"
          @click="selectWindow(option.value)"
        >
          {{ option.label }}
        </button>
      </div>
    </header>

    <div v-if="loading && !report" class="usage-loading">
      <Skeleton height="96px" />
      <Skeleton height="96px" />
      <Skeleton height="150px" />
    </div>
    <Message v-else-if="error && !report" severity="error" :closable="false">
      <span>{{ error }}</span>
      <Button label="Повторить" size="small" text @click="load()" />
    </Message>
    <template v-else-if="report">
      <div class="usage-totals" :class="{ refreshing: loading }">
        <article class="token-total">
          <small>Всего токенов</small>
          <strong>{{ formatCount(report.totals.totalTokens) }}</strong>
          <span>
            {{ formatCount(report.totals.inputTokens) }} ввод ·
            {{ formatCount(report.totals.outputTokens) }} вывод
          </span>
        </article>
        <article>
          <small>По данным xAI</small>
          <strong>{{ formatMoney(report.totals.providerReportedCost) }}</strong>
          <span
            >{{ report.totals.providerReportedCostRecords }} операций с ценой
            провайдера</span
          >
        </article>
        <article>
          <small>Оценка по тарифу</small>
          <strong>{{
            formatMoney(report.totals.estimatedFallbackCost)
          }}</strong>
          <span>{{ report.totals.estimatedRecords }} оценочных операций</span>
        </article>
        <article>
          <small>Единицы ElevenLabs</small>
          <strong>{{ formatCount(report.totals.providerBilledUnits) }}</strong>
          <span
            >{{ report.totals.providerUnitOnlyRecords }} без per-request
            USD</span
          >
        </article>
      </div>

      <div v-if="report.categories.length" class="category-list">
        <div
          v-for="category in report.categories"
          :key="`${category.category}:${category.currency}`"
          class="category-row"
        >
          <span>{{
            END_USER_AI_USAGE_CATEGORY_LABELS[category.category]
          }}</span>
          <div class="category-track" title="Доля денежной стоимости категории">
            <i :style="{ width: categoryWidth(category) }" />
          </div>
          <strong>{{
            category.totalTokens
              ? formatCount(category.totalTokens)
              : formatCount(
                  category.providerBilledUnits || category.inputCharacters,
                )
          }}</strong>
          <small>{{ categoryCost(category) }}</small>
        </div>
      </div>
      <p v-else class="usage-empty">За выбранный период расходов пока нет.</p>

      <div v-if="report.totals.unpricedRecords" class="completeness-note">
        <i class="pi pi-info-circle" />
        <span>
          {{ report.totals.unpricedRecords }} операций без денежной стоимости
        </span>
      </div>
      <footer>
        Период рассчитан по часовому поясу проекта:
        <strong>{{ report.range.timezone }}</strong>
      </footer>
    </template>
  </section>
</template>

<style scoped>
.usage-card {
  padding: 22px;
  border: 1px solid var(--line);
  border-radius: 20px;
  background: var(--surface-card);
  box-shadow: var(--shadow-card);
}
.usage-card > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding-bottom: 16px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--line);
}
.usage-kicker {
  color: var(--text-secondary);
  font-size: 0.61rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
h3 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 4px 0 0;
  font: 700 1rem var(--font-display);
}
h3 i {
  color: var(--text-brand);
}
.window-switch {
  display: flex;
  gap: 3px;
  padding: 4px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface-subtle);
}
.window-switch button {
  padding: 7px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.66rem;
  font-weight: 750;
  white-space: nowrap;
  cursor: pointer;
}
.window-switch button.active {
  background: var(--surface-emphasis);
  color: var(--text-on-emphasis);
  box-shadow: var(--shadow-raised);
}
.usage-loading {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.usage-loading > :last-child {
  grid-column: 1 / -1;
}
.usage-totals {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  transition: opacity 0.16s ease;
}
.usage-totals.refreshing {
  opacity: 0.55;
}
.usage-totals article {
  min-width: 0;
  padding: 15px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface-subtle);
}
.usage-totals .token-total {
  border-color: var(--surface-emphasis);
  background: var(--surface-emphasis);
  color: var(--text-on-emphasis);
}
.usage-totals small,
.usage-totals span {
  display: block;
  overflow: hidden;
  color: var(--text-secondary);
  font-size: 0.61rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.usage-totals .token-total small,
.usage-totals .token-total span {
  color: var(--text-on-emphasis-muted);
}
.usage-totals strong {
  display: block;
  margin: 9px 0 4px;
  overflow: hidden;
  font: 750 clamp(1.05rem, 2vw, 1.4rem) var(--font-display);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.category-list {
  display: grid;
  gap: 11px;
  margin-top: 18px;
}
.category-row {
  display: grid;
  grid-template-columns: minmax(110px, 0.8fr) minmax(100px, 1fr) 68px 92px;
  align-items: center;
  gap: 10px;
  font-size: 0.68rem;
}
.category-row > span {
  font-weight: 700;
}
.category-track {
  height: 7px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--surface-subtle);
}
.category-track i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--status-violet);
}
.category-row strong,
.category-row small {
  text-align: right;
}
.category-row small {
  color: var(--text-secondary);
}
.completeness-note {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px 12px;
  margin-top: 16px;
  border-radius: 12px;
  background: var(--status-warning-soft);
  color: var(--status-warning-text);
  font-size: 0.66rem;
}
.usage-empty {
  padding: 20px;
  margin: 0;
  color: var(--text-secondary);
  text-align: center;
  font-size: 0.72rem;
}
footer {
  padding-top: 13px;
  margin-top: 16px;
  border-top: 1px solid var(--line);
  color: var(--text-secondary);
  font-size: 0.61rem;
}
footer strong {
  color: var(--text-primary);
}
@media (max-width: 900px) {
  .usage-card > header {
    align-items: flex-start;
    flex-direction: column;
  }
  .window-switch {
    width: 100%;
  }
  .window-switch button {
    flex: 1;
    padding-inline: 5px;
  }
  .usage-totals {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 560px) {
  .usage-totals {
    grid-template-columns: 1fr;
  }
  .category-row {
    grid-template-columns: minmax(95px, 1fr) 62px 78px;
  }
  .category-track {
    grid-column: 1 / -1;
    grid-row: 2;
  }
}
</style>
