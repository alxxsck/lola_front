<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Select from "primevue/select";
import Textarea from "primevue/textarea";
import { useAuthStore } from "@/features/auth/auth.store";
import { reportingRepository } from "@/features/reporting/api/reporting-repository";
import {
  canCreateSavedReport,
  canEditSavedReport,
  canPublishSavedReport,
  canReadReporting,
  canRunReportingQuery,
} from "@/features/reporting/model/reporting-permissions";
import { ReportingRunCoordinator } from "@/features/reporting/model/reporting-run-coordinator";
import {
  reportingDateRangeOptions,
  reportingSpaceOptions,
} from "@/features/reporting/model/reporting-options";
import type {
  ReportingArtifactSpace,
  ReportingDataset,
  ReportingDateRange,
  ReportingQueryResult,
  ReportingTimeGrain,
  ReportingVisualization,
  SavedReport,
} from "@/features/reporting/model/reporting-types";
import ReportingChartRenderer from "@/features/reporting/ui/ReportingChartRenderer.vue";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const coordinator = new ReportingRunCoordinator(1);
const datasets = ref<ReportingDataset[]>([]);
const report = ref<SavedReport | null>(null);
const result = ref<ReportingQueryResult | null>(null);
const loading = ref(true);
const previewing = ref(false);
const saving = ref(false);
const publishing = ref(false);
const error = ref("");

const form = reactive({
  title: "Новый отчёт",
  description: "",
  collection: "Без коллекции",
  space: "PERSONAL" as ReportingArtifactSpace,
  datasetId: "events-product",
  metric: "unique_users",
  dateRange: "LAST_30_DAYS" as ReportingDateRange,
  grain: "DAY" as ReportingTimeGrain,
  breakdown: "" as string,
  visualization: "LINE" as ReportingVisualization,
});

const isCreate = computed(() => route.name === "saved-report-create");
const isEditing = computed(
  () => isCreate.value || route.name === "saved-report-edit",
);
const permissions = computed(
  () => auth.project?.effectivePermissionCodes ?? [],
);
const canExecute = computed(() => canRunReportingQuery(permissions.value));
const canEdit = computed(() =>
  isCreate.value
    ? canCreateSavedReport(permissions.value)
    : canEditSavedReport(permissions.value),
);
const canPublish = computed(() => canPublishSavedReport(permissions.value));
const selectedDataset = computed(
  () => datasets.value.find((dataset) => dataset.id === form.datasetId) ?? null,
);
const metricOptions = computed(() => selectedDataset.value?.metrics ?? []);
const dimensionOptions = computed(() => [
  { key: "", label: "Без разбивки" },
  ...(selectedDataset.value?.dimensions ?? []),
]);
const dateRangeOptions = reportingDateRangeOptions;
const spaceOptions = reportingSpaceOptions;
const grainOptions: Array<{ value: ReportingTimeGrain; label: string }> = [
  { value: "DAY", label: "По дням" },
  { value: "WEEK", label: "По неделям" },
  { value: "MONTH", label: "По месяцам" },
];
const visualizationOptions: Array<{
  value: ReportingVisualization;
  label: string;
  icon: string;
}> = [
  { value: "KPI", label: "Число", icon: "pi pi-hashtag" },
  { value: "LINE", label: "Линия", icon: "pi pi-chart-line" },
  { value: "BAR", label: "Столбцы", icon: "pi pi-chart-bar" },
  { value: "TABLE", label: "Таблица", icon: "pi pi-table" },
];

function applyReport(next: SavedReport): void {
  report.value = next;
  form.title = next.title;
  form.description = next.description;
  form.space = next.space;
  form.collection = next.collection;
  form.datasetId = next.query.datasetId;
  form.metric = next.query.metric;
  form.dateRange = next.query.dateRange ?? "LAST_30_DAYS";
  form.grain = next.query.grain ?? "DAY";
  form.breakdown = next.query.breakdown ?? "";
  form.visualization = next.visualization;
}

function queryDefinition() {
  const dataset = selectedDataset.value;
  const population =
    dataset?.owner === "PROFILE"
      ? ({ mode: "CURRENT_PROFILE" } as const)
      : dataset?.owner === "SEGMENT"
        ? ({
            mode: "CURRENT_SEGMENT",
            segmentRevisionId: dataset.segmentRevisionId ?? "",
          } as const)
        : ({ mode: "EVENT_TIME" } as const);
  return {
    definitionRevisionId:
      !isEditing.value && report.value
        ? report.value.query.definitionRevisionId
        : `query-draft-${report.value?.id ?? "new"}-${form.datasetId}-${form.metric}-v${(report.value?.version ?? 0) + 1}`,
    datasetId: form.datasetId,
    metric: form.metric,
    population,
    dateRange: population.mode === "EVENT_TIME" ? form.dateRange : null,
    grain: population.mode === "EVENT_TIME" ? form.grain : null,
    ...(form.breakdown ? { breakdown: form.breakdown } : {}),
    filters: [],
  };
}

async function loadPage(): Promise<void> {
  const projectId = auth.project?.id;
  if (!projectId || !canReadReporting(permissions.value)) {
    coordinator.purge();
    report.value = null;
    result.value = null;
    datasets.value = [];
    loading.value = false;
    await router.replace({ name: "overview" });
    return;
  }
  coordinator.purge();
  result.value = null;
  loading.value = true;
  error.value = "";
  try {
    datasets.value = await reportingRepository.listDatasets(projectId);
    const reportId =
      typeof route.params.reportId === "string" ? route.params.reportId : "";
    if (reportId)
      applyReport(
        await reportingRepository.getSavedReport(projectId, reportId),
      );
    if (
      isEditing.value &&
      reportId &&
      (!canEdit.value || !report.value?.allowedActions.includes("EDIT"))
    ) {
      await router.replace(`/reports/${reportId}`);
      return;
    }
    if (!isEditing.value && reportId) await runPreview();
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : "Не удалось открыть отчёт";
  } finally {
    loading.value = false;
  }
}

async function runPreview(): Promise<void> {
  const projectId = auth.project?.id;
  if (!projectId || !canExecute.value) {
    error.value = "Недостаточно прав для выполнения аналитического запроса";
    return;
  }
  error.value = "";
  previewing.value = true;
  const query = queryDefinition();
  coordinator.beginScope(
    `${projectId}:${report.value?.id ?? "new"}:${JSON.stringify(query)}`,
  );
  try {
    const outcome = await coordinator.schedule((signal) =>
      reportingRepository.runQuery(projectId, query, signal),
    );
    if (outcome.status === "committed") result.value = outcome.value;
  } catch (cause) {
    if (!(cause instanceof DOMException && cause.name === "AbortError")) {
      error.value =
        cause instanceof Error ? cause.message : "Расчёт не выполнен";
    }
  } finally {
    previewing.value = false;
  }
}

async function saveDraft(): Promise<SavedReport | null> {
  const projectId = auth.project?.id;
  if (
    !projectId ||
    !canEdit.value ||
    !form.title.trim() ||
    (report.value && !report.value.allowedActions.includes("EDIT"))
  )
    return null;
  saving.value = true;
  error.value = "";
  try {
    const saved = await reportingRepository.saveSavedReportDraft(projectId, {
      ...(report.value ? { id: report.value.id } : {}),
      title: form.title.trim(),
      description: form.description.trim(),
      space: form.space,
      collection: form.collection.trim() || "Без коллекции",
      visualization: form.visualization,
      query: queryDefinition(),
    });
    applyReport(saved);
    if (route.params.reportId !== saved.id) {
      await router.replace(`/reports/${saved.id}/edit`);
    }
    return saved;
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : "Черновик не сохранён";
    return null;
  } finally {
    saving.value = false;
  }
}

async function publish(): Promise<void> {
  if (!canPublish.value) return;
  publishing.value = true;
  try {
    const draft = await saveDraft();
    const projectId = auth.project?.id;
    if (!draft || !projectId) return;
    const published = await reportingRepository.publishSavedReport(
      projectId,
      draft.id,
      draft.version,
    );
    applyReport(published);
    await router.replace(`/reports/${published.id}`);
    await runPreview();
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : "Отчёт не опубликован";
  } finally {
    publishing.value = false;
  }
}

watch(
  () => form.datasetId,
  () => {
    const firstMetric = selectedDataset.value?.metrics[0];
    if (
      firstMetric &&
      !selectedDataset.value?.metrics.some((item) => item.key === form.metric)
    ) {
      form.metric = firstMetric.key;
    }
    form.breakdown = "";
    result.value = null;
  },
);
watch(
  () => [
    route.fullPath,
    auth.project?.id ?? "",
    [...permissions.value].sort().join(","),
  ],
  () => void loadPage(),
);
onMounted(() => void loadPage());
onBeforeUnmount(() => coordinator.purge());
</script>

<template>
  <main class="saved-report-page" :class="{ 'is-viewer': !isEditing }">
    <header class="report-header">
      <div class="report-heading">
        <button
          type="button"
          class="back-link"
          @click="router.push('/reports')"
        >
          <i class="pi pi-arrow-left" aria-hidden="true" /> Библиотека
        </button>
        <span class="report-eyebrow">Сохранённый отчёт</span>
        <h1>{{ isCreate ? "Новый сохранённый отчёт" : form.title }}</h1>
        <p v-if="!isEditing">{{ form.description }}</p>
      </div>
      <div class="report-actions">
        <template v-if="isEditing">
          <Button
            label="Сохранить черновик"
            severity="secondary"
            outlined
            :loading="saving"
            @click="saveDraft"
          />
          <Button
            v-if="canPublish"
            label="Опубликовать"
            icon="pi pi-send"
            :loading="publishing"
            @click="publish"
          />
        </template>
        <template v-else>
          <Button
            label="Добавить в дашборд"
            icon="pi pi-plus"
            severity="secondary"
            outlined
            @click="router.push(`/dashboards/new?reportId=${report?.id ?? ''}`)"
          />
          <Button
            v-if="canEdit && report?.allowedActions.includes('EDIT')"
            label="Редактировать"
            icon="pi pi-pencil"
            severity="secondary"
            @click="router.push(`/reports/${report?.id}/edit`)"
          />
        </template>
      </div>
    </header>

    <div v-if="error" class="report-error" role="alert">
      <i class="pi pi-exclamation-triangle" aria-hidden="true" />
      <span>{{ error }}</span>
      <button type="button" @click="error = ''" aria-label="Закрыть сообщение">
        <i class="pi pi-times" aria-hidden="true" />
      </button>
    </div>

    <section
      v-if="isEditing"
      class="builder-layout"
      aria-label="Конструктор отчёта"
    >
      <aside class="configuration-rail">
        <section class="config-section identity-section">
          <div class="section-number">01</div>
          <div class="config-fields">
            <label>
              <span>Название</span>
              <InputText
                v-model="form.title"
                placeholder="Например, Активные пользователи"
              />
            </label>
            <label>
              <span>Описание</span>
              <Textarea v-model="form.description" rows="2" auto-resize />
            </label>
            <label>
              <span>Пространство</span>
              <Select
                v-model="form.space"
                :options="spaceOptions"
                option-label="label"
                option-value="value"
              />
            </label>
            <label>
              <span>Коллекция</span>
              <InputText v-model="form.collection" />
            </label>
          </div>
        </section>

        <section class="config-section">
          <div class="section-number">02</div>
          <div class="config-fields">
            <div class="section-heading">
              <h2>Источник данных</h2>
              <p>Только опубликованные аналитические поля.</p>
            </div>
            <label>
              <span>Датасет</span>
              <Select
                v-model="form.datasetId"
                :options="datasets"
                option-label="title"
                option-value="id"
              />
              <small v-if="selectedDataset"
                >{{ selectedDataset.title }} ·
                {{ selectedDataset.description }}</small
              >
            </label>
            <p
              v-if="selectedDataset?.currentStateDisclosure"
              class="data-disclosure"
            >
              <i class="pi pi-info-circle" aria-hidden="true" />
              {{ selectedDataset.currentStateDisclosure }}
            </p>
          </div>
        </section>

        <section class="config-section">
          <div class="section-number">03</div>
          <div class="config-fields">
            <div class="section-heading">
              <h2>Что посчитать</h2>
              <p>Метрика, период и способ группировки.</p>
            </div>
            <label>
              <span>Метрика</span>
              <Select
                v-model="form.metric"
                :options="metricOptions"
                option-label="label"
                option-value="key"
              />
            </label>
            <div v-if="selectedDataset?.owner === 'EVENT'" class="field-pair">
              <label>
                <span>Период</span>
                <Select
                  v-model="form.dateRange"
                  :options="dateRangeOptions"
                  option-label="label"
                  option-value="value"
                />
              </label>
              <label>
                <span>Шаг</span>
                <Select
                  v-model="form.grain"
                  :options="grainOptions"
                  option-label="label"
                  option-value="value"
                />
              </label>
            </div>
            <label>
              <span>Разбивка</span>
              <Select
                v-model="form.breakdown"
                :options="dimensionOptions"
                option-label="label"
                option-value="key"
              />
            </label>
          </div>
        </section>

        <section class="config-section">
          <div class="section-number">04</div>
          <div class="config-fields">
            <div class="section-heading">
              <h2>Визуализация</h2>
              <p>Вид можно менять без пересборки запроса.</p>
            </div>
            <div
              class="visualization-grid"
              role="radiogroup"
              aria-label="Вид визуализации"
            >
              <button
                v-for="option in visualizationOptions"
                :key="option.value"
                type="button"
                role="radio"
                :aria-checked="form.visualization === option.value"
                :class="{ active: form.visualization === option.value }"
                @click="form.visualization = option.value"
              >
                <i :class="option.icon" aria-hidden="true" />
                <span>{{ option.label }}</span>
              </button>
            </div>
          </div>
        </section>
      </aside>

      <section class="preview-stage" aria-labelledby="preview-title">
        <header class="preview-header">
          <div>
            <span>Предпросмотр</span>
            <h2 id="preview-title">{{ form.title || "Без названия" }}</h2>
          </div>
          <Button
            data-action="preview"
            label="Предпросмотр"
            icon="pi pi-play"
            :loading="previewing"
            :disabled="!canExecute"
            @click="runPreview"
          />
        </header>
        <ReportingChartRenderer
          :result="result"
          :visualization="form.visualization"
          :loading="previewing || loading"
        />
      </section>
    </section>

    <section v-else class="viewer-layout">
      <div class="viewer-toolbar">
        <div
          v-if="report?.query.population.mode === 'EVENT_TIME'"
          class="viewer-filters"
        >
          <Select
            v-model="form.dateRange"
            :options="dateRangeOptions"
            option-label="label"
            option-value="value"
            aria-label="Период отчёта"
          />
          <Button label="Применить" severity="secondary" @click="runPreview" />
        </div>
        <Button
          label="Обновить"
          icon="pi pi-refresh"
          text
          :loading="previewing"
          @click="runPreview"
        />
      </div>
      <ReportingChartRenderer
        :result="result"
        :visualization="form.visualization"
        :loading="previewing || loading"
      />
    </section>
  </main>
</template>

<style scoped>
.saved-report-page {
  min-height: 100%;
  padding: 20px clamp(16px, 2.5vw, 36px) 48px;
  color: var(--text-primary);
}

.report-header,
.builder-layout,
.viewer-layout,
.report-error {
  max-width: 1480px;
  margin-right: auto;
  margin-left: auto;
}

.report-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 20px;
}

.report-heading {
  max-width: 720px;
}

.back-link {
  display: block;
  min-height: 32px;
  margin-bottom: 10px;
  padding: 4px 0;
  border: 0;
  background: transparent;
  color: var(--text-link);
  font: 600 var(--font-size-body-small) var(--font-display);
  cursor: pointer;
}

.report-eyebrow {
  color: var(--status-accent-text);
  font-size: var(--font-size-caption);
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

h1 {
  margin: 4px 0 0;
  font-family: var(--font-display);
  font-size: clamp(1.6rem, 3vw, 2.35rem);
  line-height: 1.1;
  letter-spacing: -0.035em;
  text-wrap: balance;
}

.report-heading > p {
  margin: 8px 0 0;
  color: var(--text-secondary);
}

.report-actions,
.viewer-toolbar,
.viewer-filters {
  display: flex;
  align-items: center;
  gap: 8px;
}

.report-error {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  padding: 10px 12px;
  border-radius: 9px;
  background: var(--status-danger-soft);
  color: var(--status-danger-text);
  font-size: var(--font-size-body-small);
}

.report-error button {
  width: 36px;
  height: 36px;
  margin-left: auto;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.builder-layout {
  display: grid;
  grid-template-columns: minmax(320px, 380px) minmax(0, 1fr);
  align-items: start;
  gap: 20px;
}

.configuration-rail {
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  background: var(--surface-card);
}

.config-section {
  display: grid;
  grid-template-columns: 32px 1fr;
  gap: 8px;
  padding: 16px;
  border-bottom: 1px solid var(--border-subtle);
}

.config-section:last-child {
  border-bottom: 0;
}

.section-number {
  color: var(--text-tertiary);
  font: 700 0.68rem var(--font-display);
  letter-spacing: 0.05em;
}

.config-fields {
  display: grid;
  gap: 14px;
  min-width: 0;
}

.section-heading h2,
.section-heading p {
  margin: 0;
}

.section-heading h2 {
  font: 650 1rem var(--font-display);
}

.section-heading p,
.config-fields small {
  margin-top: 4px;
  color: var(--text-tertiary);
  font-size: var(--font-size-caption);
  line-height: 1.4;
}

.config-fields label {
  display: grid;
  gap: 6px;
}

.config-fields label > span {
  color: var(--text-secondary);
  font-size: var(--font-size-caption);
  font-weight: 650;
}

.config-fields :deep(input),
.config-fields :deep(textarea),
.config-fields :deep(.p-select) {
  width: 100%;
}

.field-pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.data-disclosure {
  display: flex;
  gap: 8px;
  margin: 0;
  padding: 10px;
  border-radius: 8px;
  background: var(--status-info-soft);
  color: var(--status-info-text);
  font-size: var(--font-size-caption);
  line-height: 1.4;
}

.visualization-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.visualization-grid button {
  display: grid;
  min-height: 58px;
  place-items: center;
  gap: 4px;
  padding: 8px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--surface-subtle);
  color: var(--text-secondary);
  font: 600 var(--font-size-caption) var(--font-display);
  cursor: pointer;
  transition:
    border-color 160ms cubic-bezier(0.23, 1, 0.32, 1),
    background-color 160ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 120ms cubic-bezier(0.23, 1, 0.32, 1);
}

.visualization-grid button.active {
  border-color: var(--status-accent);
  background: var(--status-accent-soft);
  color: var(--status-accent-text);
}

.visualization-grid button:active {
  transform: scale(0.97);
}

.visualization-grid button:focus-visible,
.back-link:focus-visible,
.report-error button:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.preview-stage {
  position: sticky;
  top: 16px;
  min-width: 0;
  padding: 16px;
  border-radius: 16px;
  background: var(--surface-subtle);
}

.preview-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

.preview-header span {
  color: var(--text-tertiary);
  font-size: var(--font-size-caption);
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.preview-header h2 {
  margin: 3px 0 0;
  font: 650 1.15rem var(--font-display);
}

.viewer-layout {
  display: grid;
  gap: 12px;
}

.viewer-toolbar {
  justify-content: space-between;
  min-height: 52px;
  padding: 8px 12px;
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  background: var(--surface-card);
}

@media (max-width: 980px) {
  .builder-layout {
    grid-template-columns: 1fr;
  }

  .preview-stage {
    position: static;
    grid-row: 1;
  }
}

@media (max-width: 680px) {
  .saved-report-page {
    padding: 16px 12px 32px;
  }

  .report-header,
  .report-actions,
  .viewer-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .report-actions :deep(button) {
    width: 100%;
    justify-content: center;
  }

  .viewer-filters {
    display: grid;
    width: 100%;
    grid-template-columns: 1fr;
  }

  .viewer-filters :deep(.p-select),
  .viewer-filters :deep(button),
  .viewer-toolbar > :deep(button) {
    width: 100%;
    justify-content: center;
  }

  .field-pair {
    grid-template-columns: 1fr;
  }

  .config-section {
    grid-template-columns: 1fr;
  }

  .section-number {
    display: none;
  }

  .preview-stage {
    padding: 10px;
  }

  .preview-header {
    align-items: stretch;
    flex-direction: column;
  }
}

@media (prefers-reduced-motion: reduce) {
  .visualization-grid button {
    transition:
      border-color 120ms linear,
      background-color 120ms linear;
  }
}
</style>
