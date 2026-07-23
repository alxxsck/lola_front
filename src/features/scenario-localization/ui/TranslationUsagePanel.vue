<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import Button from "primevue/button";
import Message from "primevue/message";
import Skeleton from "primevue/skeleton";
import {
  translationRepository,
  type TranslationUsage,
} from "../api/translation-repository";

const props = defineProps<{ projectId: string }>();
const report = ref<TranslationUsage | null>(null);
const loading = ref(true);
const error = ref("");
type UsageRange = "7" | "30" | "billing" | "custom";
const range = ref<UsageRange>("30");
const rangeOptions: Array<{ value: UsageRange; label: string }> = [
  { value: "7", label: "7 дней" },
  { value: "30", label: "30 дней" },
  { value: "billing", label: "Текущий месяц" },
  { value: "custom", label: "Свой период" },
];
const customFrom = ref("");
const customTo = ref("");
const loadedAt = ref<Date | null>(null);
const cache = new Map<string, { report: TranslationUsage; loadedAt: Date }>();
const statusLabels: Record<string, string> = {
  SUCCESS: "Успешно",
  ERROR: "Ошибка перевода",
  FAILED: "Не выполнено",
  COMPLETED_WITH_ERRORS: "Завершено с ошибками",
  PROVIDER_TIMEOUT: "Сервис перевода не ответил",
  PLACEHOLDER_CORRUPTED: "Повреждены шаблонные переменные",
  CANCELLED: "Отменено",
};

function statusLabel(status: string) {
  return statusLabels[status] ?? "Другая ошибка перевода";
}

const successRate = computed(() => {
  const totals = report.value?.totals;
  return totals?.requests
    ? Math.round((totals.successes / totals.requests) * 100)
    : 0;
});
const cost = computed(() => {
  const totals = report.value?.totals;
  if (!totals) return "—";
  const micros = totals.actualCostMicros ?? totals.estimatedCostMicros;
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: totals.billingCurrency,
    maximumFractionDigits: 4,
  }).format(Number(micros) / 1_000_000);
});
const maximumDay = computed(() =>
  Math.max(1, ...(report.value?.series.map((item) => item.billableCharacters) ?? [])),
);
const budgetPercent = computed(() =>
  Math.min(Math.max(report.value?.budget?.hardPercent ?? 0, 0), 100),
);
const budgetStatus = computed(() => {
  const budget = report.value?.budget;
  if (!budget) return "";
  if (budget.hardExhausted) return "Лимит исчерпан";
  if ((budget.hardPercent ?? 0) >= 80) return "Бюджет почти исчерпан";
  return "В пределах лимита";
});

function selectedRange() {
  const now = new Date();
  if (range.value === "custom" && customFrom.value && customTo.value) {
    return {
      from: new Date(`${customFrom.value}T00:00:00`).toISOString(),
      to: new Date(`${customTo.value}T23:59:59.999`).toISOString(),
    };
  }
  if (range.value === "billing") {
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
      to: now.toISOString(),
    };
  }
  const days = Number(range.value);
  return {
    from: new Date(now.getTime() - days * 86_400_000).toISOString(),
    to: now.toISOString(),
  };
}

async function load(force = false) {
  loading.value = true;
  error.value = "";
  const period = selectedRange();
  const key =
    range.value === "custom"
      ? `custom:${customFrom.value}:${customTo.value}`
      : range.value;
  const cached = cache.get(key);
  if (cached && !force) {
    report.value = cached.report;
    loadedAt.value = cached.loadedAt;
    loading.value = false;
    return;
  }
  try {
    const nextReport = await translationRepository.usage(props.projectId, {
      ...period,
      groupBy: "day",
    });
    report.value = nextReport;
    loadedAt.value = new Date();
    cache.set(key, { report: nextReport, loadedAt: loadedAt.value });
  } catch (cause) {
    error.value =
      cause instanceof Error
        ? cause.message
        : "Не удалось загрузить статистику переводов";
  } finally {
    loading.value = false;
  }
}

function selectRange(value: UsageRange) {
  range.value = value;
  if (value !== "custom") void load();
}

onMounted(load);
</script>

<template>
  <section class="translation-usage" aria-labelledby="translation-usage-title">
    <header class="translation-header">
      <div class="translation-heading">
        <span class="translation-icon"><i class="pi pi-language" /></span>
        <div>
          <span class="provider-label">xAI · Grok</span>
          <h3 id="translation-usage-title">Автоматические переводы</h3>
          <p>Расход, качество и стоимость переводов без текста сценариев.</p>
        </div>
      </div>
      <Button icon="pi pi-refresh" text rounded aria-label="Обновить статистику переводов" :loading="loading" @click="load(true)" />
    </header>
    <div class="range-toolbar">
      <span>Период</span>
      <div class="usage-ranges" aria-label="Период статистики переводов">
        <button v-for="option in rangeOptions" :key="option.value" type="button" :class="{ active: range === option.value }" @click="selectRange(option.value)">
          {{ option.label }}
        </button>
      </div>
    </div>
    <form v-if="range === 'custom'" class="custom-range" @submit.prevent="load()">
      <label>С <input v-model="customFrom" type="date" required /></label>
      <label>По <input v-model="customTo" type="date" required /></label>
      <Button type="submit" label="Показать" size="small" />
    </form>
    <Skeleton v-if="loading && !report" height="9rem" border-radius="14px" />
    <Message v-else-if="error" severity="error" :closable="false">
      {{ error }} <Button label="Повторить" text size="small" @click="load()" />
    </Message>
    <div v-else-if="report && !report.totals.requests" class="translation-empty">
      <i class="pi pi-language" />
      <div><strong>За выбранный период переводов не было</strong><p>Автоматические переводы ещё не используются.</p></div>
    </div>
    <template v-else-if="report">
      <div v-if="report.budget?.hardExhausted" class="budget-warning" role="alert">
        <strong>Лимит исчерпан.</strong> Новые автоматические переводы недоступны до обновления бюджета.
      </div>
      <div class="translation-summary">
        <article><span>Оплачиваемые символы</span><strong>{{ report.totals.billableCharacters.toLocaleString('ru-RU') }}</strong><small>{{ report.totals.inputCharacters.toLocaleString('ru-RU') }} исходных</small></article>
        <article><span>Успешность</span><strong>{{ successRate }}%</strong><small>{{ report.totals.successes }} успешно · {{ report.totals.errors }} ошибок</small></article>
        <article><span>Кэш</span><strong>{{ report.totals.cacheHits }}</strong><small>экономия {{ report.totals.estimatedSavingsMicros }} μUSD</small></article>
        <article><span>{{ report.totals.actualCostMicros ? 'Фактическая стоимость' : 'Расчётная стоимость' }}</span><strong>{{ cost }}</strong><small>{{ report.totals.billingCurrency }}</small></article>
      </div>
      <div v-if="report.budget" class="budget-meter">
        <div class="budget-heading">
          <span>
            <strong>Бюджет переводов</strong>
            <small>{{ budgetStatus }}</small>
          </span>
          <strong class="budget-value">{{ report.budget.hardPercent ?? 0 }}%</strong>
        </div>
        <div
          class="budget-track"
          role="progressbar"
          aria-label="Использовано бюджета переводов"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuenow="budgetPercent"
        >
          <span
            class="budget-track-fill"
            :class="{ exhausted: report.budget.hardExhausted }"
            :style="{ width: `${budgetPercent}%` }"
          />
        </div>
        <small class="budget-caption"
          >Предупреждение: {{ report.budget.softPercent ?? 0 }}% · жёсткий
          лимит: {{ report.budget.hardPercent ?? 0 }}%</small
        >
      </div>
      <section v-if="report.series.length" class="chart-panel">
        <div class="chart-heading">
          <strong>Оплачиваемые символы по дням</strong>
          <small>Динамика за выбранный период</small>
        </div>
        <div class="translation-chart" aria-label="Переводы по дням">
          <div v-for="item in report.series" :key="item.day" :title="`${item.day}: ${item.billableCharacters}`">
            <span :style="{ height: `${Math.max(4, item.billableCharacters / maximumDay * 100)}%` }" />
            <small>{{ item.day.slice(5) }}</small>
          </div>
        </div>
      </section>
      <div class="translation-details">
        <div v-if="report.targetLocales.length" class="target-breakdown">
          <span v-for="item in report.targetLocales" :key="item.targetLocale"><strong>{{ item.targetLocale }}</strong>{{ item.billableCharacters.toLocaleString('ru-RU') }}</span>
        </div>
        <div v-if="report.statuses.some((item) => item.errors)" class="status-breakdown">
          <strong>Ошибки по категориям</strong>
          <span v-for="item in report.statuses.filter((status) => status.errors)" :key="item.status">{{ statusLabel(item.status) }} · {{ item.errors }}</span>
        </div>
        <div class="translation-meta">
          <small v-if="report.totals.latencyP50Ms !== null" class="latency-note">
            Время ответа p50 {{ report.totals.latencyP50Ms }} мс · p95 {{ report.totals.latencyP95Ms ?? '—' }} мс
          </small>
          <small v-if="loadedAt" class="loaded-at">Обновлено {{ loadedAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) }}</small>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.translation-usage { display: grid; gap: 18px; margin-top: 22px; padding: 22px; border: 1px solid var(--border-default); border-radius: 20px; background: var(--surface-card); }
.translation-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding-bottom: 18px; border-bottom: 1px solid var(--border-subtle); }
.translation-heading { display: flex; align-items: flex-start; gap: 13px; }
.translation-icon { display: grid; place-items: center; width: 40px; height: 40px; flex: 0 0 auto; border-radius: 12px; background: var(--status-violet-soft); color: var(--status-violet-text); }
.provider-label { color: var(--status-violet-text); font-size: .62rem; font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }
.translation-header h3 { margin: 3px 0; font-size: 1rem; }
.translation-header p, .translation-empty p { margin: 0; color: var(--muted); font-size: .7rem; line-height: 1.45; }
.range-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.range-toolbar > span { color: var(--text-small-muted); font-size: .65rem; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; }
.usage-ranges { display: flex; flex-wrap: wrap; gap: 5px; }
.usage-ranges button { padding: 7px 11px; border: 1px solid var(--border-default); border-radius: 999px; background: var(--surface-subtle); color: var(--text-secondary); font: inherit; font-size: .68rem; cursor: pointer; }
.usage-ranges button.active { border-color: var(--status-violet); background: var(--status-violet-soft); color: var(--status-violet-text); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--status-violet) 12%, transparent); }
.custom-range { display: flex; align-items: end; flex-wrap: wrap; gap: 8px; }
.custom-range label { display: grid; gap: 4px; color: var(--muted); font-size: .65rem; }
.custom-range input { min-height: 34px; border: 1px solid var(--border-default); border-radius: 8px; padding: 5px 8px; background: var(--surface-card); color: var(--text-primary); }
.translation-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.translation-summary article { display: grid; gap: 4px; min-width: 0; padding: 14px; border: 1px solid var(--border-subtle); border-radius: 14px; background: var(--surface-subtle); }
.translation-summary span, .translation-summary small { color: var(--muted); font-size: .65rem; }
.translation-summary strong { font-size: 1.05rem; }
.translation-empty { display: flex; align-items: center; gap: 10px; padding: 18px; border-radius: 14px; background: var(--surface-subtle); }
.budget-warning { padding: 10px 12px; border-radius: 10px; background: var(--status-warning-soft); color: var(--status-warning-text); font-size: .72rem; }
.budget-meter { display: grid; gap: 10px; padding: 16px; border: 1px solid var(--border-subtle); border-radius: 14px; background: var(--surface-subtle); }
.budget-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.budget-heading > span { display: grid; gap: 2px; }
.budget-heading small, .budget-caption, .latency-note, .loaded-at { color: var(--muted); font-size: .63rem; }
.budget-value { font-size: 1rem; }
.budget-track { height: 10px; overflow: hidden; border-radius: 999px; background: var(--border-subtle); box-shadow: inset 0 1px 2px color-mix(in srgb, var(--text-primary) 9%, transparent); }
.budget-track-fill { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--status-violet), var(--action-primary)); transition: width .25s ease; }
.budget-track-fill.exhausted { background: var(--status-danger); }
.chart-panel { padding: 16px; border: 1px solid var(--border-subtle); border-radius: 16px; background: var(--surface-subtle); }
.chart-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.chart-heading strong { font-size: .75rem; }
.chart-heading small { color: var(--muted); font-size: .62rem; }
.translation-chart { display: flex; align-items: end; gap: 6px; height: 145px; padding: 14px 10px 0; border-radius: 12px; background: linear-gradient(to bottom, transparent 24%, var(--border-subtle) 25%, transparent 26%, transparent 49%, var(--border-subtle) 50%, transparent 51%, transparent 74%, var(--border-subtle) 75%, transparent 76%), var(--surface-card); }
.translation-chart > div { display: grid; grid-template-rows: 1fr auto; align-items: end; flex: 1; height: 100%; gap: 4px; }
.translation-chart span { display: block; min-width: 5px; border-radius: 5px 5px 2px 2px; background: var(--status-violet); }
.translation-chart small { color: var(--muted); font-size: .55rem; text-align: center; }
.translation-details { display: grid; gap: 12px; }
.target-breakdown { display: flex; flex-wrap: wrap; gap: 6px; }
.target-breakdown span { display: flex; gap: 6px; padding: 6px 9px; border: 1px solid var(--border-subtle); border-radius: 999px; background: var(--surface-subtle); font-size: .68rem; }
.status-breakdown { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: .68rem; }
.status-breakdown span { padding: 5px 8px; border-radius: 999px; background: var(--status-danger-soft); color: var(--status-danger-text); }
.translation-meta { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: 12px; border-top: 1px solid var(--border-subtle); }
@media (max-width: 760px) {
  .translation-usage { padding: 17px; }
  .range-toolbar { align-items: flex-start; flex-direction: column; gap: 8px; }
  .translation-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .chart-heading, .translation-meta { align-items: flex-start; flex-direction: column; }
}
@media (max-width: 480px) {
  .translation-summary { grid-template-columns: 1fr; }
  .usage-ranges { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); width: 100%; }
  .usage-ranges button { white-space: nowrap; }
}
</style>
