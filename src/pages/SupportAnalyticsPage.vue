<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import Select from "primevue/select";
import Tag from "primevue/tag";
import { useAuthStore } from "@/features/auth/auth.store";
import {
  supportAnalyticsArtifactSource,
  type SupportSavedArtifact,
} from "@/features/support-analytics/api/support-analytics-artifact-source";
import {
  HighCostConfirmationRequiredError,
  metricLabel,
  metricUnit,
  supportAnalyticsSource,
} from "@/features/support-analytics/api/support-analytics-source";
import type {
  ReportingCatalogDatasetDto,
  ReportingMetricCellDto,
  ReportingQueryDefinitionDto,
  ReportingQueryResultResponseDto,
  ReportingResultRowDto,
  ReportExportRequestedResponseDto,
  ReportScheduleChangedResponseDto,
} from "@/shared/api/generated/models";
import { cmsRealtimeClient } from "@/shared/realtime/cms-realtime-client";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const catalog = ref<ReportingCatalogDatasetDto[]>([]);
const result = ref<ReportingQueryResultResponseDto | null>(null);
const loading = ref(true);
const running = ref(false);
const error = ref("");
const showReceipt = ref(false);
const updateAvailable = ref(false);
const showTable = ref(false);
const saveDialog = ref(false);
const saveName = ref("Отчёт по качеству поддержки");
const artifact = ref<SupportSavedArtifact | null>(null);
const artifactBusy = ref(false);
const artifactNotice = ref("");
const lastExport = ref<ReportExportRequestedResponseDto | null>(null);
const lastSchedule = ref<ReportScheduleChangedResponseDto | null>(null);
let controller: AbortController | null = null;
let unsubscribeRealtime: (() => void) | null = null;
let realtimeRefreshPending = false;
let scopeGeneration = 0;
let lastRealtimeGeneration = "";
const pageMode = computed(
  () =>
    String(route.name ?? "").replace("support-analytics-", "") || "overview",
);
const preferredFamily = computed(
  () =>
    ({
      flow: "SUPPORT_CONVERSATION",
      quality: "SUPPORT_QUALITY",
      team: "SUPPORT_ASSIGNMENT",
      automation: "SUPPORT_AI_USAGE",
    })[pageMode.value] ?? "SUPPORT_QUALITY",
);
const selectedFamily = ref("");
const selectedMetric = ref("");
const groupBy = ref("");
const rangeDays = ref(7);
const comparison = ref("PREVIOUS_PERIOD");
const dataset = computed(
  () =>
    catalog.value.find((item) => item.datasetCode === selectedFamily.value) ??
    null,
);
const metric = computed(
  () =>
    dataset.value?.metrics.find((item) => item.code === selectedMetric.value) ??
    null,
);
const metricAllowed = computed(() =>
  (metric.value?.requiredPermissionCodes ?? []).every((code) =>
    permissions.value.includes(code),
  ),
);
const metricOptions = computed(() =>
  (dataset.value?.metrics ?? []).map((item) => ({
    label: metricLabel(item),
    value: item.code,
  })),
);
const dimensionOptions = computed(() => [
  { label: "Без разбивки", value: "" },
  ...(dataset.value?.dimensions ?? [])
    .filter(
      ({ code }) =>
        metric.value?.compatibleDimensions.includes(code) &&
        code !== "OCCURRED_DAY" &&
        code !== "OCCURRED_HOUR",
    )
    .map(({ code }) => ({ label: dimensionLabel(code), value: code })),
]);
const rows = computed(() => result.value?.result?.rows ?? []);
const maxValue = computed(() =>
  Math.max(
    1,
    ...rows.value.flatMap((row) =>
      row.metrics.map((cell) => Number(cell.value ?? 0)),
    ),
  ),
);
const availableCount = computed(
  () =>
    catalog.value.filter((item) => item.readiness.status === "READY").length,
);
const permissions = computed(
  () => auth.project?.effectivePermissionCodes ?? [],
);
const canRun = computed(
  () =>
    permissions.value.includes("project.reporting.aggregate.read") &&
    metricAllowed.value,
);
const canAuthor = computed(
  () => permissions.value.includes("project.reporting.author"),
);
const canCreateDashboard = computed(() =>
  permissions.value.includes("project.dashboards.author") &&
  permissions.value.includes("project.dashboards.publish"),
);
const canExport = computed(() =>
  permissions.value.includes("project.reporting.export"),
);
const canSchedule = computed(() =>
  permissions.value.includes("project.reporting.schedule"),
);

function dimensionLabel(code: string): string {
  return (
    (
      {
        TEAM: "Команда",
        OPERATOR: "Оператор",
        QUEUE: "Очередь",
        CHANNEL: "Канал",
        QUALITY_ITEM: "Критерий",
        CATEGORY: "Категория",
        PRIORITY: "Приоритет",
        SLA_STATE: "Состояние SLA",
        AI_OPERATION: "AI-операция",
        CURRENCY: "Валюта",
      } as Record<string, string>
    )[code] ?? code
  );
}
function readinessLabel(status: string): string {
  return status === "READY"
    ? "Готов"
    : status === "PARTIAL"
      ? "Частично"
      : "Нет данных";
}
function formatCell(cell: ReportingMetricCellDto | undefined, unit: string): string {
  if (!cell) return "Нет данных";
  if (cell.state === "SUPPRESSED") return "Скрыто";
  if (cell.state === "NOT_APPLICABLE") return "Неприменимо";
  if (cell.state === "NULL" || cell.value === undefined) return "Нет данных";
  const number = Number(cell.value);
  if (unit === "PERCENTAGE")
    return `${new Intl.NumberFormat("ru", { maximumFractionDigits: 1 }).format(number)}%`;
  if (unit === "DURATION_MS")
    return number >= 60_000
      ? `${(number / 60_000).toFixed(1)} мин`
      : `${Math.round(number / 1000)} сек`;
  if (unit === "MONEY")
    return new Intl.NumberFormat("ru", {
      style: "currency",
      currency: "EUR",
    }).format(number);
  return new Intl.NumberFormat("ru", { maximumFractionDigits: 1 }).format(
    number,
  );
}
function rowLabel(row: ReportingResultRowDto, index: number): string {
  return row.day
    ? new Intl.DateTimeFormat("ru", { day: "numeric", month: "short" }).format(
        new Date(row.day),
      )
    : Object.values(row.dimensions ?? {})
        .filter(Boolean)
        .join(" · ") || `Группа ${index + 1}`;
}
function localDay(value: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}
function query(): ReportingQueryDefinitionDto {
  const until = new Date();
  const from = new Date(until.getTime() - rangeDays.value * 86_400_000);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  return {
    version: 1,
    datasetRevisionId: dataset.value!.datasetRevisionId,
    metrics: [selectedMetric.value],
    groupBy: groupBy.value ? [groupBy.value] : ["OCCURRED_DAY"],
    filters: [],
    range: {
      from: localDay(from, timezone),
      until: localDay(until, timezone),
      grain: groupBy.value ? "DAY" : "DAY",
      timezone,
    },
    comparison: comparison.value
      ? {
          kind: comparison.value as
            "PREVIOUS_PERIOD" | "PREVIOUS_WEEK" | "PREVIOUS_MONTH",
        }
      : undefined,
    limit: 100,
  };
}

async function loadCatalog(): Promise<void> {
  controller?.abort();
  controller = new AbortController();
  const signal = controller.signal;
  const scope = ++scopeGeneration;
  const scopeProjectId = auth.project?.id;
  const scopePermissions = permissions.value.join(",");
  if (!scopeProjectId) return;
  loading.value = true;
  error.value = "";
  try {
    const nextCatalog = (
      await supportAnalyticsSource.catalog(scopeProjectId, signal)
    ).datasets;
    if (signal.aborted || scope !== scopeGeneration || auth.project?.id !== scopeProjectId || permissions.value.join(",") !== scopePermissions) return;
    catalog.value = nextCatalog;
    selectedFamily.value =
      typeof route.query.dataset === "string"
        ? route.query.dataset
        : preferredFamily.value;
    if (
      !catalog.value.some((item) => item.datasetCode === selectedFamily.value)
    )
      selectedFamily.value = "SUPPORT_QUALITY";
    selectedMetric.value =
      typeof route.query.metric === "string"
        ? route.query.metric
        : (catalog.value.find(
            (item) => item.datasetCode === selectedFamily.value,
          )?.metrics[0]?.code ?? "");
    groupBy.value =
      typeof route.query.groupBy === "string" ? route.query.groupBy : "";
    rangeDays.value = Number(route.query.days) || 7;
    comparison.value =
      typeof route.query.comparison === "string"
        ? route.query.comparison
        : "PREVIOUS_PERIOD";
    if (
      canRun.value &&
      dataset.value?.readiness.status === "READY" &&
      selectedMetric.value
    )
      await run();
  } catch (cause) {
    if (!signal.aborted && scope === scopeGeneration)
      error.value =
        cause instanceof Error ? cause.message : "Каталог аналитики недоступен";
  } finally {
    if (!signal.aborted && scope === scopeGeneration) loading.value = false;
  }
}
async function run(): Promise<void> {
  if (
    !auth.project?.id ||
    !dataset.value ||
    !selectedMetric.value ||
    dataset.value.readiness.status !== "READY" || !canRun.value
  )
    return;
  controller?.abort();
  controller = new AbortController();
  const signal = controller.signal;
  const scope = ++scopeGeneration;
  const scopeProjectId = auth.project.id;
  const scopePermissions = permissions.value.join(",");
  running.value = true;
  error.value = "";
  try {
    try {
      const nextResult = await supportAnalyticsSource.run(
        scopeProjectId,
        query(),
        signal,
      );
      if (signal.aborted || scope !== scopeGeneration || auth.project?.id !== scopeProjectId || permissions.value.join(",") !== scopePermissions || !canRun.value) return;
      result.value = nextResult;
    } catch (cause) {
      if (!(cause instanceof HighCostConfirmationRequiredError)) throw cause;
      if (!window.confirm("Запрос может обработать большой объём данных. Продолжить?")) return;
      const nextResult = await supportAnalyticsSource.run(
        scopeProjectId,
        query(),
        signal,
        true,
      );
      if (signal.aborted || scope !== scopeGeneration || auth.project?.id !== scopeProjectId || permissions.value.join(",") !== scopePermissions || !canRun.value) return;
      result.value = nextResult;
    }
    if (signal.aborted || scope !== scopeGeneration || auth.project?.id !== scopeProjectId || permissions.value.join(",") !== scopePermissions || !canRun.value) return;
    await router.replace({
      query: {
        dataset: selectedFamily.value,
        metric: selectedMetric.value,
        ...(groupBy.value ? { groupBy: groupBy.value } : {}),
        days: String(rangeDays.value),
        ...(comparison.value ? { comparison: comparison.value } : {}),
      },
    });
  } catch (cause) {
    if (!signal.aborted && scope === scopeGeneration)
      error.value =
        cause instanceof Error ? cause.message : "Запрос не выполнен";
  } finally {
    if (!signal.aborted && scope === scopeGeneration) running.value = false;
  }
}
function changeFamily(): void {
  selectedMetric.value = dataset.value?.metrics[0]?.code ?? "";
  groupBy.value = "";
  result.value = null;
  if (dataset.value?.readiness.status === "READY") void run();
}
function bindRealtime(): void {
  unsubscribeRealtime?.();
  unsubscribeRealtime = null;
  const projectId = auth.project?.id;
  if (!projectId) return;
  unsubscribeRealtime = cmsRealtimeClient.subscribe(
    ["reporting.dataset.generation.changed.v1"],
    (value) => {
      if (!value || typeof value !== "object") return;
      const event = value as Record<string, unknown>;
      if (
        event.projectId !== projectId ||
        event.datasetCode !== selectedFamily.value
      )
        return;
      const generation = String(event.generation ?? "");
      if (generation && generation === lastRealtimeGeneration) return;
      lastRealtimeGeneration = generation;
      if (
        (pageMode.value === "flow" || pageMode.value === "team") &&
        document.visibilityState === "visible" &&
        navigator.onLine &&
        !running.value &&
        !realtimeRefreshPending
      ) {
        realtimeRefreshPending = true;
        queueMicrotask(() => {
          realtimeRefreshPending = false;
          void run();
        });
      } else updateAvailable.value = true;
    },
  );
}
async function saveReport(): Promise<void> {
  if (!auth.project?.id || !result.value || !saveName.value.trim()) return;
  const scopeProjectId = auth.project.id;
  artifactBusy.value = true;
  artifactNotice.value = "";
  try {
    const nextArtifact = await supportAnalyticsArtifactSource.saveAndPublishReport(
      scopeProjectId,
      saveName.value.trim(),
      `Опубликованный Support-отчёт: ${metric.value ? metricLabel(metric.value) : selectedMetric.value}`,
      query(),
    );
    if (auth.project?.id !== scopeProjectId || !canAuthor.value) return;
    artifact.value = nextArtifact;
    saveDialog.value = false;
    artifactNotice.value = "Отчёт сохранён и опубликован.";
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : "Не удалось сохранить отчёт";
  } finally {
    artifactBusy.value = false;
  }
}
async function createDashboard(): Promise<void> {
  if (!auth.project?.id || !auth.user?.id || !artifact.value) return;
  const scopeProjectId = auth.project.id;
  const scopeActorId = auth.user.id;
  artifactBusy.value = true;
  try {
    const created = await supportAnalyticsArtifactSource.createDashboard(
      scopeProjectId,
      scopeActorId,
      artifact.value,
    );
    if (
      auth.project?.id !== scopeProjectId ||
      auth.user?.id !== scopeActorId ||
      !canCreateDashboard.value
    )
      return;
    artifactNotice.value = "Персональный dashboard опубликован.";
    await router.push(`/support/analytics/dashboards/${created.dashboardId}`);
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : "Не удалось создать dashboard";
  } finally {
    artifactBusy.value = false;
  }
}
async function requestExport(format: "CSV" | "PDF"): Promise<void> {
  if (!auth.project?.id || !artifact.value) return;
  const scopeProjectId = auth.project.id;
  artifactBusy.value = true;
  try {
    let receipt;
    try {
      receipt = await supportAnalyticsArtifactSource.exportReport(
        scopeProjectId,
        artifact.value,
        format,
      );
    } catch (cause) {
      if (!(cause instanceof Error) || !cause.message.includes("высокой стоимости")) throw cause;
      if (!window.confirm("Экспорт может быть большим. Подтвердить создание?")) return;
      receipt = await supportAnalyticsArtifactSource.exportReport(
        scopeProjectId,
        artifact.value,
        format,
        true,
      );
    }
    if (auth.project?.id !== scopeProjectId || !canExport.value) return;
    lastExport.value = receipt;
    artifactNotice.value = `${format}-экспорт поставлен в очередь · ${receipt.exportId}`;
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : "Не удалось запустить экспорт";
  } finally {
    artifactBusy.value = false;
  }
}
async function scheduleReport(): Promise<void> {
  if (!auth.project?.id || !auth.user?.id || !artifact.value) return;
  const scopeProjectId = auth.project.id;
  const scopeActorId = auth.user.id;
  artifactBusy.value = true;
  try {
    const receipt = await supportAnalyticsArtifactSource.scheduleReport(
      scopeProjectId,
      scopeActorId,
      artifact.value,
      Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    );
    if (
      auth.project?.id !== scopeProjectId ||
      auth.user?.id !== scopeActorId ||
      !canSchedule.value
    )
      return;
    lastSchedule.value = receipt;
    artifactNotice.value = `Расписание активно · ${receipt.scheduleId}`;
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : "Не удалось создать расписание";
  } finally {
    artifactBusy.value = false;
  }
}
async function cancelExport(): Promise<void> {
  if (!auth.project?.id || !lastExport.value) return;
  await supportAnalyticsArtifactSource.cancelExport(auth.project.id, lastExport.value.exportId);
  artifactNotice.value = `Экспорт отменён · ${lastExport.value.exportId}`;
  lastExport.value = null;
}
async function pauseSchedule(): Promise<void> {
  if (!auth.project?.id || !lastSchedule.value) return;
  lastSchedule.value = await supportAnalyticsArtifactSource.pauseSchedule(
    auth.project.id,
    lastSchedule.value.scheduleId,
  );
  artifactNotice.value = `Расписание приостановлено · ${lastSchedule.value.scheduleId}`;
}
async function archiveSchedule(): Promise<void> {
  if (!auth.project?.id || !lastSchedule.value) return;
  lastSchedule.value = await supportAnalyticsArtifactSource.archiveSchedule(
    auth.project.id,
    lastSchedule.value.scheduleId,
  );
  artifactNotice.value = `Расписание архивировано · ${lastSchedule.value.scheduleId}`;
}
watch(
  [() => auth.project?.id, pageMode],
  () => {
    scopeGeneration += 1;
    controller?.abort();
    result.value = null;
    artifact.value = null;
    lastExport.value = null;
    lastSchedule.value = null;
    catalog.value = [];
    showReceipt.value = false;
    updateAvailable.value = false;
    lastRealtimeGeneration = "";
    bindRealtime();
    void loadCatalog();
  },
  { immediate: true },
);
watch(
  () => permissions.value.join(","),
  () => {
    scopeGeneration += 1;
    catalog.value = [];
    selectedMetric.value = "";
    groupBy.value = "";
    void router.replace({ query: {} });
    if (canRun.value && metricAllowed.value) {
      void loadCatalog();
      return;
    }
    controller?.abort();
    result.value = null;
    artifact.value = null;
    lastExport.value = null;
    lastSchedule.value = null;
    showReceipt.value = false;
    updateAvailable.value = false;
  },
);
onBeforeUnmount(() => {
  controller?.abort();
  unsubscribeRealtime?.();
});
</script>

<template>
  <main class="analytics-page" aria-labelledby="analytics-title">
    <header class="page-heading">
      <div>
        <span class="eyebrow">Support Analytics</span>
        <h1 id="analytics-title">
          {{
            pageMode === "quality"
              ? "Качество поддержки"
              : pageMode === "flow"
                ? "Поток обращений"
                : pageMode === "team"
                  ? "Команда и нагрузка"
                  : pageMode === "automation"
                    ? "Автоматизация"
                    : "Аналитика поддержки"
          }}
        </h1>
        <p>
          Проверяемые метрики с определениями, покрытием и квитанцией
          результата.
        </p>
      </div>
      <nav aria-label="Представления аналитики">
        <RouterLink
          to="/support/analytics"
          :aria-current="pageMode === 'overview' ? 'page' : undefined"
          >Обзор</RouterLink
        ><RouterLink
          to="/support/analytics/flow"
          :aria-current="pageMode === 'flow' ? 'page' : undefined"
          >Поток</RouterLink
        ><RouterLink
          to="/support/analytics/quality"
          :aria-current="pageMode === 'quality' ? 'page' : undefined"
          >Качество</RouterLink
        ><RouterLink
          to="/support/analytics/team"
          :aria-current="pageMode === 'team' ? 'page' : undefined"
          >Команда</RouterLink
        ><RouterLink
          to="/support/analytics/automation"
          :aria-current="pageMode === 'automation' ? 'page' : undefined"
          >Автоматизация</RouterLink
        >
      </nav>
    </header>
    <div v-if="error" class="notice" role="alert">
      <i class="pi pi-exclamation-circle" />{{ error
      }}<Button label="Повторить" text size="small" @click="run" />
    </div>
    <div v-if="artifactNotice" class="artifact-notice" role="status">
      <i class="pi pi-check-circle" />
      <span>{{ artifactNotice }}</span>
      <RouterLink
        v-if="artifact"
        :to="`/support/analytics/reports/${artifact.savedReportId}`"
        >Открыть отчёт</RouterLink
      >
    </div>
    <div v-if="updateAvailable" class="update-hint" role="status">
      <i class="pi pi-refresh" /><span
        >Появились более свежие данные. Текущий результат остаётся закреплённым
        за своей квитанцией.</span
      ><Button
        label="Обновить"
        size="small"
        @click="
          updateAvailable = false;
          run();
        "
      />
    </div>
    <section class="readiness-strip" aria-label="Готовность источников">
      <div>
        <span>Доступно сейчас</span
        ><strong>{{ availableCount }} / {{ catalog.length }}</strong
        ><small>семейств данных</small>
      </div>
      <div>
        <span>Свежесть Quality</span
        ><strong>{{
          dataset?.readiness.projectionLagMs
            ? Math.round(dataset.readiness.projectionLagMs / 1000) + " сек"
            : "—"
        }}</strong
        ><small>лаг проекции</small>
      </div>
      <div>
        <span>Физический предел</span><strong>117 120</strong
        ><small>строк на запрос</small>
      </div>
      <div>
        <span>Режим</span><strong class="compact">Exact</strong
        ><small>bounded sync</small>
      </div>
    </section>
    <section class="filter-bar" aria-label="Фильтры аналитики">
      <label
        >Источник<Select
          v-model="selectedFamily"
          :options="
            catalog.map((item) => ({
              label: item.name,
              value: item.datasetCode,
              disabled: item.readiness.status !== 'READY',
            }))
          "
          option-label="label"
          option-value="value"
          option-disabled="disabled"
          aria-label="Источник данных"
          @change="changeFamily" /></label
      ><label
        >Метрика<Select
          v-model="selectedMetric"
          :options="metricOptions"
          option-label="label"
          option-value="value"
          aria-label="Метрика" /></label
      ><label
        >Период<Select
          v-model="rangeDays"
          :options="[
            { label: '7 дней', value: 7 },
            { label: '30 дней', value: 30 },
            { label: '90 дней', value: 90 },
          ]"
          option-label="label"
          option-value="value"
          aria-label="Период" /></label
      ><label
        >Разбивка<Select
          v-model="groupBy"
          :options="dimensionOptions"
          option-label="label"
          option-value="value"
          aria-label="Разбивка" /></label
      ><label
        >Сравнение<Select
          v-model="comparison"
          :options="[
            { label: 'Предыдущий период', value: 'PREVIOUS_PERIOD' },
            { label: 'Без сравнения', value: '' },
          ]"
          option-label="label"
          option-value="value"
          aria-label="Сравнение" /></label
      ><Button
        label="Применить"
        icon="pi pi-play"
        :loading="running"
        :disabled="!canRun || dataset?.readiness.status !== 'READY'"
        @click="run"
      />
    </section>
    <section
      v-if="pageMode === 'overview'"
      class="source-matrix"
      aria-labelledby="source-title"
    >
      <div class="section-title">
        <div>
          <h2 id="source-title">Готовность источников</h2>
          <p>Недоступный источник не превращается в нулевую метрику.</p>
        </div>
      </div>
      <button
        v-for="item in catalog"
        :key="item.datasetCode"
        type="button"
        :disabled="item.readiness.status !== 'READY'"
        @click="
          selectedFamily = item.datasetCode;
          changeFamily();
        "
      >
        <span
          ><i
            :class="
              item.readiness.status === 'READY'
                ? 'pi pi-check-circle'
                : 'pi pi-minus-circle'
            "
          /><strong>{{ item.name }}</strong></span
        ><Tag
          :value="readinessLabel(item.readiness.status)"
          :severity="
            item.readiness.status === 'READY' ? 'success' : 'secondary'
          "
        />
      </button>
    </section>
    <section
      v-if="dataset?.readiness.status !== 'READY' && !loading"
      class="unavailable"
    >
      <i class="pi pi-database" />
      <h2>{{ dataset?.name }}: источник ещё не готов</h2>
      <p>
        Backend не получил authoritative publisher для
        {{ dataset?.readiness.missingSourceFamilies.join(", ") }}. Мы не
        показываем искусственные нули.
      </p>
      <Button
        label="Открыть доступную Quality-аналитику"
        severity="secondary"
        outlined
        @click="
          selectedFamily = 'SUPPORT_QUALITY';
          changeFamily();
        "
      />
    </section>
    <section v-else class="analysis-layout">
      <article class="surface chart-surface">
        <div class="section-title">
          <div>
            <span class="eyebrow">{{ dataset?.name }}</span>
            <h2>{{ metric ? metricLabel(metric) : "Результат" }}</h2>
            <p>
              {{ metric?.operation }} · минимум
              {{ metric?.minimumSample }} наблюдений ·
              {{
                dataset?.readiness.coverageFrom
                  ? "покрытие с " +
                    new Date(dataset.readiness.coverageFrom).toLocaleDateString(
                      "ru",
                    )
                  : "покрытие уточняется"
              }}
            </p>
          </div>
          <div class="chart-actions">
            <Button
              v-if="result?.receipt && canAuthor"
              label="Сохранить отчёт"
              icon="pi pi-bookmark"
              severity="secondary"
              outlined
              :disabled="artifactBusy"
              @click="saveDialog = true"
            />
            <Button
              v-if="rows.length"
              :label="showTable ? 'График' : 'Таблица'"
              :icon="showTable ? 'pi pi-chart-bar' : 'pi pi-table'"
              text
              severity="secondary"
              @click="showTable = !showTable"
            />
            <Button
              v-if="result?.receipt"
              label="Квитанция"
              icon="pi pi-receipt"
              text
              severity="secondary"
              @click="showReceipt = !showReceipt"
            />
          </div>
        </div>
        <div v-if="(running || loading) && !result" class="chart-loading">
          <i class="pi pi-spin pi-spinner" /> Строим проверяемый результат…
        </div>
        <div v-else-if="rows.length && showTable" class="analytics-table-scroll" tabindex="0">
          <table>
            <thead><tr><th>Период / группа</th><th>{{ metric ? metricLabel(metric) : selectedMetric }}</th><th>Состояние</th><th>Выборка</th></tr></thead>
            <tbody>
              <tr v-for="(row, index) in rows" :key="index">
                <td>{{ rowLabel(row, index) }}</td>
                <td>{{ formatCell(row.metrics[0], metric ? metricUnit(metric) : 'DECIMAL') }}</td>
                <td>{{ row.metrics[0]?.state }}</td>
                <td>{{ row.metrics[0]?.sampleSize ?? '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div
          v-else-if="rows.length"
          class="chart"
          role="img"
          tabindex="0"
          :aria-label="`${metric ? metricLabel(metric) : 'Метрика'}: ${rows.map((row, index) => `${rowLabel(row, index)} ${row.metrics[0]?.value}`).join(', ')}`"
        >
          <div v-for="(row, index) in rows" :key="index" class="bar-column">
            <div class="bar-value">
              {{
                formatCell(row.metrics[0], metric ? metricUnit(metric) : "DECIMAL")
              }}
            </div>
            <div class="bar-track">
              <span
                v-if="row.metrics[0]?.state === 'VALUE'"
                :style="{
                  height: `${Math.max(2, (Number(row.metrics[0]?.value ?? 0) / maxValue) * 100)}%`,
                }"
              />
            </div>
            <small>{{ rowLabel(row, index) }}</small>
            <span v-if="row.metrics[0]?.sampleSize" class="sample-size"
              >n={{ row.metrics[0]?.sampleSize }}</span
            >
          </div>
        </div>
        <div v-if="running && result" class="comparison-note" role="status">
          <i class="pi pi-spin pi-spinner" /><span>Обновляем снимок; текущие данные остаются доступны.</span>
        </div>
        <div v-else class="empty">
          <i class="pi pi-chart-bar" />
          <p>Выберите готовый источник и запустите запрос.</p>
        </div>
        <div v-if="result?.result?.comparison" class="comparison-note">
          <i class="pi pi-arrow-right-arrow-left" /><span
            >Сравнение с предыдущим периодом рассчитано по тому же dataset
            revision.</span
          >
        </div>
        <div v-if="result?.result?.comparison" class="comparison-table-link">
          <span>Предыдущий период: {{ result.result.comparison.rows.length }} строк</span>
          <Button label="Открыть проверки Quality" text icon="pi pi-external-link" @click="router.push('/support/quality')" />
        </div>
        <div v-if="artifact" class="artifact-actions" aria-label="Действия с отчётом">
          <div>
            <strong>{{ artifact.name }}</strong>
            <small>revision {{ artifact.revision }} · опубликован</small>
          </div>
          <Button
            v-if="canCreateDashboard"
            label="Dashboard"
            icon="pi pi-th-large"
            text
            :loading="artifactBusy"
            @click="createDashboard"
          />
          <Button
            v-if="canExport"
            label="CSV"
            icon="pi pi-download"
            text
            @click="requestExport('CSV')"
          />
          <Button
            v-if="canExport"
            label="PDF"
            icon="pi pi-file-pdf"
            text
            @click="requestExport('PDF')"
          />
          <Button
            v-if="canSchedule"
            label="Ежедневно"
            icon="pi pi-calendar-clock"
            text
            @click="scheduleReport"
          />
        </div>
        <div v-if="lastExport || lastSchedule" class="delivery-lifecycle">
          <span v-if="lastExport"
            ><strong>Экспорт {{ lastExport.status }}</strong><small>{{ lastExport.exportId }}</small>
            <Button label="Отменить" text severity="secondary" @click="cancelExport" />
          </span>
          <span v-if="lastSchedule"
            ><strong>Расписание {{ lastSchedule.status }}</strong><small>{{ lastSchedule.scheduleId }}</small>
            <Button
              v-if="lastSchedule.status === 'ACTIVE'"
              label="Пауза"
              text
              severity="secondary"
              @click="pauseSchedule"
            />
            <Button label="Архивировать" text severity="secondary" @click="archiveSchedule" />
          </span>
        </div>
      </article>
      <aside class="evidence-rail">
        <section class="surface definition">
          <div class="section-title">
            <div>
              <h2>Определение</h2>
              <p>Почему это число можно сравнивать.</p>
            </div>
          </div>
          <dl>
            <div>
              <dt>Код</dt>
              <dd>{{ metric?.code }}</dd>
            </div>
            <div>
              <dt>Операция</dt>
              <dd>{{ metric?.operation }}</dd>
            </div>
            <div>
              <dt>Точность</dt>
              <dd>{{ metric?.exactness }}</dd>
            </div>
            <div>
              <dt>Классификация</dt>
              <dd>{{ metric?.classification }}</dd>
            </div>
            <div>
              <dt>Совместимые разрезы</dt>
              <dd>
                {{
                  metric?.compatibleDimensions.map(dimensionLabel).join(", ")
                }}
              </dd>
            </div>
          </dl>
        </section>
        <section v-if="showReceipt && result?.receipt" class="surface receipt">
          <div class="section-title">
            <div>
              <h2>Квитанция результата</h2>
              <p>Закреплённый снимок и privacy epoch.</p>
            </div>
          </div>
          <dl>
            <div>
              <dt>Данные на</dt>
              <dd>
                {{ new Date(result.receipt.dataAsOf).toLocaleString("ru") }}
              </dd>
            </div>
            <div>
              <dt>Полнота</dt>
              <dd>{{ result.receipt.completeness }}</dd>
            </div>
            <div>
              <dt>Строк / байт</dt>
              <dd>{{ result.receipt.rows }} / {{ result.receipt.bytes }}</dd>
            </div>
            <div>
              <dt>Скрыто ячеек</dt>
              <dd>{{ result.receipt.suppressedCellCount }}</dd>
            </div>
            <div>
              <dt>Истекает</dt>
              <dd>
                {{
                  new Date(result.receipt.expiresAt).toLocaleTimeString("ru")
                }}
              </dd>
            </div>
            <div>
              <dt>Dataset revision</dt>
              <dd class="mono">{{ result.receipt.datasetRevisionId }}</dd>
            </div>
          </dl>
        </section>
      </aside>
    </section>
    <Dialog
      v-model:visible="saveDialog"
      modal
      header="Сохранить Support-отчёт"
      :style="{ width: 'min(460px, calc(100vw - 24px))' }"
    >
      <div class="save-dialog">
        <p>
          Запрос будет опубликован как immutable revision. Dashboard и доставки
          закрепятся за этим снимком.
        </p>
        <label>
          Название
          <InputText v-model="saveName" autofocus maxlength="120" />
        </label>
      </div>
      <template #footer>
        <Button label="Отмена" text severity="secondary" @click="saveDialog = false" />
        <Button
          label="Сохранить и опубликовать"
          icon="pi pi-check"
          :loading="artifactBusy"
          :disabled="!saveName.trim()"
          @click="saveReport"
        />
      </template>
    </Dialog>
  </main>
</template>

<style scoped>
.analytics-page {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  max-width: 1560px;
  margin: 0 auto;
  padding: 24px;
  display: grid;
  gap: 20px;
}
.analytics-page > *,
.page-heading > *,
.filter-bar > * {
  min-width: 0;
}
.page-heading {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 24px;
}
.eyebrow {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--p-primary-color);
  font-weight: 700;
}
.page-heading h1 {
  margin: 4px 0;
  font-size: clamp(1.8rem, 3vw, 2.5rem);
  letter-spacing: -0.04em;
}
.page-heading p,
.section-title p {
  margin: 0;
  color: var(--p-text-muted-color);
}
nav {
  box-sizing: border-box;
  max-width: 100%;
  min-width: 0;
  display: flex;
  gap: 3px;
  padding: 4px;
  background: var(--p-content-hover-background);
  border-radius: 10px;
  overflow: auto;
}
nav a {
  padding: 8px 11px;
  border-radius: 7px;
  color: color-mix(in srgb, var(--p-text-color) 82%, var(--p-text-muted-color));
  text-decoration: none;
  white-space: nowrap;
  font-size: 0.82rem;
  font-weight: 600;
}
nav a[aria-current="page"],
nav a:hover {
  background: var(--p-content-background);
  color: var(--p-text-color);
}
.notice {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--p-red-200);
  background: var(--p-red-50);
  color: var(--p-red-700);
  border-radius: 8px;
}
.notice :deep(.p-button) {
  margin-left: auto;
}
.artifact-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--p-green-200);
  background: var(--p-green-50);
  color: var(--p-green-800);
  border-radius: 8px;
}
.artifact-notice a {
  margin-left: auto;
  color: inherit;
  font-weight: 650;
}
.update-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid
    color-mix(in srgb, var(--p-primary-color) 25%, var(--p-content-border-color));
  border-radius: 8px;
  background: color-mix(
    in srgb,
    var(--p-primary-color) 7%,
    var(--p-content-background)
  );
  color: var(--p-text-color);
}
.update-hint :deep(.p-button) {
  margin-left: auto;
}
.readiness-strip {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border: 1px solid var(--p-content-border-color);
  border-radius: 12px;
  background: var(--p-content-background);
  overflow: hidden;
}
.readiness-strip > div {
  padding: 14px 16px;
  border-right: 1px solid var(--p-content-border-color);
  display: grid;
  gap: 2px;
}
.readiness-strip > div:last-child {
  border: 0;
}
.readiness-strip span,
.readiness-strip small {
  color: var(--p-text-muted-color);
}
.readiness-strip strong {
  font-size: 1.55rem;
}
.readiness-strip .compact {
  font-size: 1.05rem;
  margin: 6px 0;
}
.filter-bar {
  display: grid;
  grid-template-columns: 1.2fr 1.5fr 0.7fr 1fr 1fr auto;
  gap: 8px;
  align-items: end;
  padding: 12px;
  border: 1px solid var(--p-content-border-color);
  background: var(--p-content-background);
  border-radius: 10px;
}
.filter-bar label {
  display: grid;
  gap: 5px;
  font-size: 0.7rem;
  color: var(--p-text-muted-color);
}
.filter-bar :deep(.p-select) {
  min-width: 0;
  max-width: 100%;
  width: 100%;
}
.filter-bar :deep(.p-select-label) {
  overflow: hidden;
  text-overflow: ellipsis;
}
.surface,
.source-matrix {
  border: 1px solid var(--p-content-border-color);
  border-radius: 12px;
  background: var(--p-content-background);
  overflow: hidden;
}
.section-title {
  padding: 14px 16px;
  border-bottom: 1px solid var(--p-content-border-color);
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}
.section-title h2 {
  font-size: 1rem;
  margin: 2px 0 3px;
}
.chart-actions,
.artifact-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
.delivery-lifecycle {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border-top: 1px solid var(--p-content-border-color);
}
.delivery-lifecycle > span {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
}
.delivery-lifecycle > span + span {
  border-left: 1px solid var(--p-content-border-color);
}
.delivery-lifecycle small {
  color: var(--p-text-muted-color);
  margin-right: auto;
}
.artifact-actions {
  padding: 8px 12px;
  border-top: 1px solid var(--p-content-border-color);
  flex-wrap: wrap;
}
.artifact-actions > div {
  display: grid;
  gap: 1px;
  margin-right: auto;
}
.artifact-actions small {
  color: var(--p-text-muted-color);
}
.save-dialog {
  display: grid;
  gap: 16px;
}
.save-dialog p {
  margin: 0;
  color: var(--p-text-muted-color);
}
.save-dialog label {
  display: grid;
  gap: 6px;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}
.source-matrix {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
}
.source-matrix > .section-title {
  grid-column: 1/-1;
}
.source-matrix > button {
  padding: 14px;
  border: 0;
  border-right: 1px solid var(--p-content-border-color);
  border-bottom: 1px solid var(--p-content-border-color);
  background: transparent;
  color: inherit;
  display: grid;
  gap: 10px;
  text-align: left;
}
.source-matrix > button:not(:disabled) {
  cursor: pointer;
}
.source-matrix > button:not(:disabled):hover {
  background: var(--p-content-hover-background);
}
.source-matrix > button:disabled {
  opacity: 0.55;
}
.source-matrix > button > span {
  display: flex;
  gap: 7px;
  align-items: center;
}
.source-matrix .pi-check-circle {
  color: var(--p-green-500);
}
.source-matrix .pi-minus-circle {
  color: var(--p-text-muted-color);
}
.analysis-layout {
  display: grid;
  grid-template-columns: minmax(0, 2.1fr) minmax(290px, 0.75fr);
  gap: 16px;
  align-items: start;
}
.evidence-rail {
  display: grid;
  gap: 16px;
}
.chart {
  height: 340px;
  padding: 30px 20px 12px;
  display: flex;
  align-items: stretch;
  gap: clamp(8px, 2vw, 24px);
  overflow: auto;
}
.analytics-table-scroll {
  max-height: 380px;
  overflow: auto;
}
.analytics-table-scroll table {
  width: 100%;
  min-width: 620px;
  border-collapse: collapse;
}
.analytics-table-scroll th,
.analytics-table-scroll td {
  padding: 10px 14px;
  border-bottom: 1px solid var(--p-content-border-color);
  text-align: left;
  font-size: 0.8rem;
}
.analytics-table-scroll th {
  color: var(--p-text-muted-color);
  font-size: 0.7rem;
}
.comparison-table-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 12px;
  border-top: 1px solid var(--p-content-border-color);
  color: var(--p-text-muted-color);
  font-size: 0.75rem;
}
.bar-column {
  flex: 1;
  min-width: 54px;
  display: grid;
  grid-template-rows: 24px 1fr 30px 14px;
  gap: 5px;
  text-align: center;
}
.bar-value {
  font-size: 0.75rem;
  font-weight: 700;
}
.bar-track {
  height: 100%;
  display: flex;
  align-items: flex-end;
  border-bottom: 1px solid var(--p-content-border-color);
  background: linear-gradient(
    to top,
    color-mix(in srgb, var(--p-content-border-color) 35%, transparent) 1px,
    transparent 1px
  );
  background-size: 100% 25%;
}
.bar-track span {
  display: block;
  width: 100%;
  min-height: 4px;
  border-radius: 4px 4px 1px 1px;
  background: var(--p-primary-color);
  opacity: 0.84;
}
.bar-column small {
  font-size: 0.67rem;
  color: var(--p-text-muted-color);
}
.sample-size {
  color: var(--p-text-muted-color);
  font-size: 0.63rem;
}
.chart-loading,
.empty,
.unavailable {
  min-height: 300px;
  display: grid;
  place-content: center;
  text-align: center;
  color: var(--p-text-muted-color);
  gap: 8px;
}
.unavailable {
  min-height: 360px;
  border: 1px dashed var(--p-content-border-color);
  border-radius: 12px;
}
.unavailable i,
.empty i {
  font-size: 2rem;
}
.unavailable h2 {
  color: var(--p-text-color);
  margin: 5px 0;
}
.unavailable p {
  max-width: 600px;
  margin: 0;
}
.comparison-note {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-top: 1px solid var(--p-content-border-color);
  font-size: 0.78rem;
  color: var(--p-text-muted-color);
}
dl {
  margin: 0;
  padding: 12px 16px;
  display: grid;
  gap: 10px;
}
dl div {
  display: grid;
  gap: 2px;
}
dt {
  font-size: 0.67rem;
  text-transform: uppercase;
  color: var(--p-text-muted-color);
}
dd {
  margin: 0;
  font-size: 0.82rem;
  overflow-wrap: anywhere;
}
.mono {
  font-family: monospace;
}
.receipt {
  border-color: color-mix(
    in srgb,
    var(--p-primary-color) 35%,
    var(--p-content-border-color)
  );
}
@media (max-width: 1200px) {
  .filter-bar {
    grid-template-columns: repeat(3, 1fr);
  }
  .source-matrix {
    grid-template-columns: repeat(3, 1fr);
  }
  .analysis-layout {
    grid-template-columns: 1fr;
  }
  .evidence-rail {
    grid-template-columns: 1fr 1fr;
  }
}
@media (max-width: 800px) {
  .page-heading {
    align-items: flex-start;
    flex-direction: column;
  }
  .readiness-strip {
    grid-template-columns: 1fr 1fr;
  }
  .readiness-strip > div:nth-child(2) {
    border-right: 0;
  }
  .readiness-strip > div:nth-child(-n + 2) {
    border-bottom: 1px solid var(--p-content-border-color);
  }
  .filter-bar {
    grid-template-columns: 1fr 1fr;
  }
  .source-matrix {
    grid-template-columns: 1fr 1fr;
  }
  .evidence-rail {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 520px) {
  .analytics-page {
    padding: 16px 12px;
  }
  .page-heading nav {
    width: calc(100vw - 24px);
    max-width: calc(100vw - 24px);
  }
  .page-heading h1 {
    max-width: 100%;
    overflow-wrap: anywhere;
  }
  .page-heading p {
    max-width: 100%;
  }
  .filter-bar {
    grid-template-columns: 1fr;
  }
  .filter-bar :deep(.p-button) {
    width: 100%;
  }
  .readiness-strip {
    grid-template-columns: 1fr 1fr;
  }
  .source-matrix {
    grid-template-columns: 1fr;
  }
  .chart {
    height: 280px;
    padding-inline: 12px;
  }
  .bar-column {
    min-width: 46px;
  }
  .section-title {
    align-items: flex-start;
  }
  .chart-surface > .section-title,
  .chart-actions {
    display: grid;
  }
  .artifact-actions :deep(.p-button) {
    flex: 1;
  }
  .delivery-lifecycle {
    grid-template-columns: 1fr;
  }
  .delivery-lifecycle > span + span {
    border-left: 0;
    border-top: 1px solid var(--p-content-border-color);
  }
  .artifact-notice {
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .artifact-notice a {
    width: 100%;
    margin-left: 24px;
  }
}
</style>
