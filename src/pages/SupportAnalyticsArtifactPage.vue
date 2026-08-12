<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useRoute } from "vue-router";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Tag from "primevue/tag";
import { useAuthStore } from "@/features/auth/auth.store";
import {
  supportAnalyticsArtifactSource,
  type SupportDashboardArtifact,
  type SupportSavedArtifact,
} from "@/features/support-analytics/api/support-analytics-artifact-source";
import {
  HighCostConfirmationRequiredError,
  metricLabel,
  supportAnalyticsSource,
} from "@/features/support-analytics/api/support-analytics-source";
import type {
  ReportingMetricCellDto,
  ReportingQueryResultResponseDto,
  SavedReportRevisionResponseDto,
} from "@/shared/api/generated/models";

const auth = useAuthStore();
const route = useRoute();
const report = ref<SupportSavedArtifact | null>(null);
const dashboard = ref<SupportDashboardArtifact | null>(null);
const result = ref<ReportingQueryResultResponseDto | null>(null);
const loading = ref(true);
const error = ref("");
const notice = ref("");
const acting = ref(false);
const revisions = ref<SavedReportRevisionResponseDto[]>([]);
const shareTarget = ref("");
const shareId = ref("");
let controller: AbortController | null = null;
let loadGeneration = 0;
const isDashboard = computed(() => typeof route.params.dashboardId === "string");
const title = computed(() => dashboard.value?.name ?? report.value?.name ?? "Support-артефакт");
const rows = computed(() => result.value?.result?.rows ?? []);
const canRead = computed(() => {
  const permissions = auth.project?.effectivePermissionCodes ?? [];
  return (
    permissions.includes("project.reporting.aggregate.read") &&
    (!isDashboard.value || permissions.includes("project.dashboards.read"))
  );
});
const canAuthor = computed(() =>
  (auth.project?.effectivePermissionCodes ?? []).includes("project.reporting.author"),
);
const canShare = computed(() =>
  (auth.project?.effectivePermissionCodes ?? []).includes("project.dashboards.share"),
);

async function load(): Promise<void> {
  controller?.abort();
  controller = new AbortController();
  const signal = controller.signal;
  const generation = ++loadGeneration;
  const projectId = auth.project?.id;
  if (!projectId || !canRead.value) {
    report.value = null;
    dashboard.value = null;
    result.value = null;
    return;
  }
  report.value = null;
  dashboard.value = null;
  result.value = null;
  loading.value = true;
  error.value = "";
  try {
    if (isDashboard.value) {
      const nextDashboard = await supportAnalyticsArtifactSource.readDashboard(
        projectId,
        String(route.params.dashboardId),
        signal,
      );
      if (generation !== loadGeneration || signal.aborted || !canRead.value) return;
      dashboard.value = nextDashboard;
      const nextReport = await supportAnalyticsArtifactSource.readReport(
        projectId,
        nextDashboard.report.savedReportId,
        signal,
      );
      if (generation !== loadGeneration || signal.aborted || !canRead.value) return;
      report.value = nextReport;
    } else {
      const nextReport = await supportAnalyticsArtifactSource.readReport(
        projectId,
        String(route.params.reportId),
        signal,
      );
      if (generation !== loadGeneration || signal.aborted || !canRead.value) return;
      report.value = nextReport;
    }
    const history = await supportAnalyticsArtifactSource.reportHistory(
      projectId,
      report.value.savedReportId,
    );
    if (generation !== loadGeneration || signal.aborted || !canRead.value) return;
    revisions.value = history.items;
    let nextResult;
    try {
      nextResult = isDashboard.value
        ? await supportAnalyticsArtifactSource.runDashboard(
          projectId,
          dashboard.value!,
          signal,
        )
        : await supportAnalyticsSource.run(projectId, report.value.query, signal);
    } catch (cause) {
      if (!(cause instanceof HighCostConfirmationRequiredError) || isDashboard.value) throw cause;
      if (!window.confirm("Отчёт обрабатывает большой объём данных. Продолжить?")) return;
      nextResult = await supportAnalyticsSource.run(projectId, report.value.query, signal, true);
    }
    if (generation !== loadGeneration || signal.aborted || !canRead.value) return;
    result.value = nextResult;
  } catch (cause) {
    if (!signal.aborted && generation === loadGeneration)
      error.value = cause instanceof Error ? cause.message : "Артефакт недоступен";
  } finally {
    if (!signal.aborted && generation === loadGeneration) loading.value = false;
  }
}
async function duplicateReport(): Promise<void> {
  if (!auth.project?.id || !report.value || !canAuthor.value) return;
  acting.value = true;
  try {
    const id = await supportAnalyticsArtifactSource.duplicateReport(
      auth.project.id,
      report.value.savedReportId,
      `${report.value.name} — копия`,
    );
    notice.value = `Копия создана · ${id}`;
  } finally {
    acting.value = false;
  }
}
async function archiveReport(): Promise<void> {
  if (!auth.project?.id || !report.value || !canAuthor.value) return;
  acting.value = true;
  try {
    await supportAnalyticsArtifactSource.archiveReport(
      auth.project.id,
      report.value.savedReportId,
    );
    notice.value = "Отчёт архивирован; новые runs для него запрещены.";
  } finally {
    acting.value = false;
  }
}
async function shareDashboard(): Promise<void> {
  if (!auth.project?.id || !dashboard.value || !shareTarget.value.trim() || !canShare.value) return;
  acting.value = true;
  try {
    shareId.value = await supportAnalyticsArtifactSource.shareDashboard(
      auth.project.id,
      dashboard.value.dashboardId,
      shareTarget.value.trim(),
    );
    notice.value = `Доступ выдан · ${shareId.value}`;
  } finally {
    acting.value = false;
  }
}
async function revokeShare(): Promise<void> {
  if (!auth.project?.id || !dashboard.value || !shareId.value || !canShare.value) return;
  acting.value = true;
  try {
    await supportAnalyticsArtifactSource.revokeDashboardShare(
      auth.project.id,
      dashboard.value.dashboardId,
      shareId.value,
    );
    notice.value = "Доступ отозван.";
    shareId.value = "";
  } finally {
    acting.value = false;
  }
}

function cellValue(cell: ReportingMetricCellDto): string {
  if (cell.state === "SUPPRESSED") return "Скрыто";
  if (cell.state === "NOT_APPLICABLE") return "Неприменимо";
  if (cell.state === "NULL" || cell.value === undefined) return "Нет данных";
  const value = new Intl.NumberFormat("ru", { maximumFractionDigits: 2 }).format(
    Number(cell.value),
  );
  return cell.sampleSize ? `${value} · n=${cell.sampleSize}` : value;
}

watch(
  [
    () => auth.project?.id,
    () => auth.project?.effectivePermissionCodes?.join(",") ?? "",
    () => route.fullPath,
  ],
  () => void load(),
  { immediate: true },
);
onBeforeUnmount(() => controller?.abort());
</script>

<template>
  <main class="artifact-page" aria-labelledby="artifact-title">
    <header class="artifact-header">
      <div>
        <RouterLink to="/support/analytics/quality">← Аналитика поддержки</RouterLink>
        <span class="eyebrow">{{ isDashboard ? "Personal dashboard" : "Saved report" }}</span>
        <h1 id="artifact-title">{{ title }}</h1>
        <p>{{ dashboard?.description ?? report?.description }}</p>
      </div>
      <Tag v-if="report" value="Опубликован" severity="success" />
    </header>

    <div v-if="error" class="notice" role="alert">
      <i class="pi pi-exclamation-circle" />{{ error }}
      <Button label="Повторить" text size="small" @click="load" />
    </div>
    <div v-if="notice" class="success-notice" role="status">{{ notice }}</div>

    <section v-if="loading" class="surface loading" aria-live="polite">
      <i class="pi pi-spin pi-spinner" /> Загружаем закреплённую revision…
    </section>

    <template v-else-if="report">
      <section class="artifact-spine" aria-label="Параметры артефакта">
        <div><span>Revision</span><strong>{{ report.revision }}</strong></div>
        <div><span>Метрики</span><strong>{{ report.query.metrics.length }}</strong></div>
        <div><span>Строк</span><strong>{{ rows.length }}</strong></div>
        <div><span>Полнота</span><strong>{{ result?.receipt?.completeness ?? "—" }}</strong></div>
      </section>

      <section :class="['surface', { widget: isDashboard }]">
        <header class="section-title">
          <div>
            <span v-if="isDashboard" class="widget-handle" aria-hidden="true">⠿</span>
            <h2>{{ report.name }}</h2>
            <p>
              {{ report.query.metrics.map((code) => metricLabel({ code } as never)).join(", ") }}
              · immutable query hash
            </p>
          </div>
          <code>{{ report.queryDefinitionHash.slice(0, 12) }}</code>
        </header>
        <div class="table-scroll">
          <table>
            <thead>
              <tr><th>Период / группа</th><th v-for="code in report.query.metrics" :key="code">{{ code }}</th></tr>
            </thead>
            <tbody>
              <tr v-for="(row, index) in rows" :key="index">
                <td>{{ row.day ?? Object.values(row.dimensions ?? {}).filter(Boolean).join(" · ") ?? `Строка ${index + 1}` }}</td>
                <td v-for="cell in row.metrics" :key="cell.code">{{ cellValue(cell) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <footer>
          <span>Dataset revision: {{ result?.receipt?.datasetRevisionId ?? "—" }}</span>
          <span>Privacy epoch: {{ result?.receipt?.privacyEpoch ?? "—" }}</span>
        </footer>
      </section>
      <section class="surface artifact-controls">
        <div>
          <strong>Revision history</strong>
          <span>{{ revisions.length }} опубликованных снимков</span>
        </div>
        <template v-if="isDashboard && canShare">
          <InputText v-model="shareTarget" aria-label="CMS User ID для доступа" placeholder="CMS User ID" />
          <Button label="Выдать доступ" :disabled="!shareTarget.trim()" :loading="acting" @click="shareDashboard" />
          <Button v-if="shareId" label="Отозвать доступ" severity="danger" text :loading="acting" @click="revokeShare" />
        </template>
        <template v-else-if="canAuthor">
          <Button label="Дублировать" icon="pi pi-copy" severity="secondary" outlined :loading="acting" @click="duplicateReport" />
          <Button label="Архивировать" icon="pi pi-box" severity="secondary" text :loading="acting" @click="archiveReport" />
        </template>
      </section>
    </template>
  </main>
</template>

<style scoped>
.artifact-page {
  box-sizing: border-box;
  width: 100%;
  max-width: 1440px;
  margin: 0 auto;
  padding: 24px;
  display: grid;
  gap: 20px;
}
.artifact-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
}
.artifact-header > div {
  display: grid;
  gap: 4px;
}
.artifact-header a {
  width: fit-content;
  color: var(--p-text-muted-color);
  text-decoration: none;
  font-size: 0.78rem;
}
.eyebrow {
  color: var(--p-primary-color);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
h1 {
  margin: 0;
  font-size: clamp(1.8rem, 3vw, 2.45rem);
  letter-spacing: -0.04em;
}
.artifact-header p,
.section-title p {
  margin: 0;
  color: var(--p-text-muted-color);
}
.artifact-spine {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border: 1px solid var(--p-content-border-color);
  border-radius: 12px;
  background: var(--p-content-background);
  overflow: hidden;
}
.artifact-spine div {
  display: grid;
  gap: 2px;
  padding: 14px 16px;
  border-right: 1px solid var(--p-content-border-color);
}
.artifact-spine div:last-child { border: 0; }
.artifact-spine span,
footer { color: var(--p-text-muted-color); }
.artifact-spine strong { font-size: 1.35rem; }
.surface {
  border: 1px solid var(--p-content-border-color);
  border-radius: 12px;
  background: var(--p-content-background);
  overflow: hidden;
}
.widget { padding: 16px; background: var(--p-content-hover-background); }
.widget .section-title,
.widget .table-scroll,
.widget footer { background: var(--p-content-background); }
.section-title {
  padding: 14px 16px;
  border-bottom: 1px solid var(--p-content-border-color);
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.section-title h2 { margin: 0 0 3px; font-size: 1rem; }
.section-title code { font-size: 0.72rem; color: var(--p-text-muted-color); }
.widget-handle { float: left; margin-right: 6px; color: var(--p-text-muted-color); }
.table-scroll { overflow: auto; }
table { width: 100%; border-collapse: collapse; min-width: 560px; }
th, td { padding: 11px 14px; border-bottom: 1px solid var(--p-content-border-color); text-align: right; }
th:first-child, td:first-child { text-align: left; }
th { font-size: 0.7rem; color: var(--p-text-muted-color); }
td { font-size: 0.82rem; }
footer { display: flex; justify-content: space-between; gap: 12px; padding: 10px 14px; font-size: 0.7rem; }
.loading { min-height: 300px; display: grid; place-content: center; color: var(--p-text-muted-color); }
.notice { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border: 1px solid var(--p-red-200); border-radius: 8px; color: var(--p-red-700); background: var(--p-red-50); }
.notice :deep(.p-button) { margin-left: auto; }
.success-notice {
  padding: 10px 12px;
  border: 1px solid var(--p-green-200);
  border-radius: 8px;
  color: var(--p-green-800);
  background: var(--p-green-50);
}
.artifact-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
}
.artifact-controls > div {
  display: grid;
  gap: 2px;
  margin-right: auto;
}
.artifact-controls span {
  color: var(--p-text-muted-color);
  font-size: 0.76rem;
}
@media (max-width: 640px) {
  .artifact-page { padding: 16px 12px; }
  .artifact-spine { grid-template-columns: 1fr 1fr; }
  .artifact-spine div:nth-child(2) { border-right: 0; }
  .artifact-spine div:nth-child(-n + 2) { border-bottom: 1px solid var(--p-content-border-color); }
  .widget { padding: 8px; }
  footer { flex-direction: column; }
  .artifact-controls {
    align-items: stretch;
    flex-direction: column;
  }
  .artifact-controls > div { margin-right: 0; }
}
</style>
