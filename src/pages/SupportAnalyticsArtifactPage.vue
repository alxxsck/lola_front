<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import { useAuthStore } from '@/features/auth/auth.store';
import { supportOperatorPresentationSource } from '@/features/support-quality/api/support-operator-presentation-source';
import {
  supportAnalyticsArtifactSource,
  type SupportDashboardArtifact,
  type SupportSavedArtifact,
} from '@/features/support-analytics/api/support-analytics-artifact-source';
import {
  HighCostConfirmationRequiredError,
  metricLabel,
  supportAnalyticsSource,
} from '@/features/support-analytics/api/support-analytics-source';
import type {
  ReportingMetricCellDto,
  ReportingQueryResultResponseDto,
  DashboardDrilldownResponseDto,
  ReportingResultRowDto,
  SavedReportRevisionResponseDto,
  SupportOperatorPresentationSummaryDto,
} from '@/shared/api/generated/models';

const auth = useAuthStore();
const route = useRoute();
const report = ref<SupportSavedArtifact | null>(null);
const dashboard = ref<SupportDashboardArtifact | null>(null);
const result = ref<ReportingQueryResultResponseDto | null>(null);
const drilldown = ref<DashboardDrilldownResponseDto | null>(null);
const loading = ref(true);
const error = ref('');
const notice = ref('');
const acting = ref(false);
const revisions = ref<SavedReportRevisionResponseDto[]>([]);
const historyBefore = ref<number | null>(null);
const historyLoading = ref(false);
const shareTarget = ref('');
const shareKind = ref<'CMS_USER' | 'TEAM' | 'PROJECT'>('CMS_USER');
const shareId = ref('');
const operatorCatalog = ref<SupportOperatorPresentationSummaryDto[]>([]);
const operatorCatalogError = ref('');
const diagnosticsOpen = ref(false);
let controller: AbortController | null = null;
let operatorCatalogController: AbortController | null = null;
let loadGeneration = 0;
let operatorCatalogGeneration = 0;
const isDashboard = computed(() => typeof route.params.dashboardId === 'string');
const title = computed(() => dashboard.value?.name ?? report.value?.name ?? 'Support-артефакт');
const rows = computed(() => result.value?.result?.rows ?? []);
const canRead = computed(() => {
  const permissions = auth.project?.effectivePermissionCodes ?? [];
  return (
    permissions.includes('project.reporting.aggregate.read') &&
    (!isDashboard.value || permissions.includes('project.dashboards.read'))
  );
});
const canAuthor = computed(() =>
  (auth.project?.effectivePermissionCodes ?? []).includes('project.reporting.author'),
);
const canShare = computed(() =>
  (auth.project?.effectivePermissionCodes ?? []).includes('project.dashboards.share'),
);

interface ArtifactActionScope {
  projectId: string;
  actorId: string;
  permissions: string;
  generation: number;
  reportId: string;
  dashboardId: string;
}

function actionScope(): ArtifactActionScope | null {
  if (!auth.project?.id || !report.value) return null;
  return {
    projectId: auth.project.id,
    actorId: auth.user?.id ?? '',
    permissions: auth.project.effectivePermissionCodes?.join(',') ?? '',
    generation: loadGeneration,
    reportId: report.value.savedReportId,
    dashboardId: dashboard.value?.dashboardId ?? '',
  };
}

function actionInScope(scope: ArtifactActionScope): boolean {
  return (
    auth.project?.id === scope.projectId &&
    (auth.user?.id ?? '') === scope.actorId &&
    (auth.project?.effectivePermissionCodes?.join(',') ?? '') === scope.permissions &&
    loadGeneration === scope.generation &&
    report.value?.savedReportId === scope.reportId &&
    (dashboard.value?.dashboardId ?? '') === scope.dashboardId
  );
}
function clearArtifactState(): void {
  report.value = null;
  dashboard.value = null;
  result.value = null;
  drilldown.value = null;
  revisions.value = [];
  historyBefore.value = null;
  historyLoading.value = false;
  shareTarget.value = '';
  shareId.value = '';
  shareKind.value = 'CMS_USER';
  diagnosticsOpen.value = false;
  acting.value = false;
  notice.value = '';
  error.value = '';
}

async function loadOperatorCatalog(): Promise<void> {
  operatorCatalogController?.abort();
  operatorCatalogController = new AbortController();
  const signal = operatorCatalogController.signal;
  const generation = ++operatorCatalogGeneration;
  const scopeProjectId = auth.project?.id ?? '';
  const scopeActorId = auth.user?.id ?? '';
  const scopePermissions = auth.project?.effectivePermissionCodes?.join(',') ?? '';
  const scopeRoute = route.fullPath;
  operatorCatalog.value = [];
  operatorCatalogError.value = '';
  if (!scopeProjectId || !isDashboard.value || !canShare.value) return;
  try {
    const response = await supportOperatorPresentationSource.catalog(
      scopeProjectId,
      undefined,
      undefined,
      signal,
    );
    if (
      signal.aborted ||
      generation !== operatorCatalogGeneration ||
      auth.project?.id !== scopeProjectId ||
      (auth.user?.id ?? '') !== scopeActorId ||
      (auth.project?.effectivePermissionCodes?.join(',') ?? '') !== scopePermissions ||
      route.fullPath !== scopeRoute ||
      !canShare.value
    )
      return;
    operatorCatalog.value = response.items;
  } catch (cause) {
    if (!signal.aborted && generation === operatorCatalogGeneration)
      operatorCatalogError.value =
        cause instanceof Error ? cause.message : 'Не удалось загрузить участников проекта';
  }
}

async function load(): Promise<void> {
  controller?.abort();
  controller = new AbortController();
  const signal = controller.signal;
  const generation = ++loadGeneration;
  const projectId = auth.project?.id;
  clearArtifactState();
  if (!projectId || !canRead.value) {
    loading.value = false;
    return;
  }
  loading.value = true;
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
    historyBefore.value = nextHistoryBefore(history.items);
    let nextResult;
    try {
      nextResult = isDashboard.value
        ? await supportAnalyticsArtifactSource.runDashboard(projectId, dashboard.value!, signal)
        : await supportAnalyticsSource.run(projectId, report.value.query, signal);
    } catch (cause) {
      if (!(cause instanceof HighCostConfirmationRequiredError) || isDashboard.value) throw cause;
      if (!window.confirm('Отчёт обрабатывает большой объём данных. Продолжить?')) return;
      nextResult = await supportAnalyticsSource.run(projectId, report.value.query, signal, true);
    }
    if (generation !== loadGeneration || signal.aborted || !canRead.value) return;
    result.value = nextResult;
  } catch (cause) {
    if (!signal.aborted && generation === loadGeneration)
      error.value = cause instanceof Error ? cause.message : 'Артефакт недоступен';
  } finally {
    if (!signal.aborted && generation === loadGeneration) loading.value = false;
  }
}

function nextHistoryBefore(items: SavedReportRevisionResponseDto[]): number | null {
  if (items.length < 50) return null;
  const oldest = Math.min(...items.map(({ revision }) => revision));
  return oldest > 1 ? oldest : null;
}

async function loadMoreHistory(): Promise<void> {
  const scope = actionScope();
  const before = historyBefore.value;
  if (!scope || !before || historyLoading.value || !canRead.value) return;
  historyLoading.value = true;
  try {
    const history = await supportAnalyticsArtifactSource.reportHistory(
      scope.projectId,
      scope.reportId,
      before,
    );
    if (!actionInScope(scope) || !canRead.value) return;
    const known = new Set(revisions.value.map(({ revision }) => revision));
    const additional = history.items.filter(({ revision }) => !known.has(revision));
    revisions.value.push(...additional);
    historyBefore.value = nextHistoryBefore(history.items);
  } catch (cause) {
    if (actionInScope(scope))
      error.value = cause instanceof Error ? cause.message : 'Не удалось загрузить историю';
  } finally {
    if (actionInScope(scope)) historyLoading.value = false;
  }
}
async function openDay(row: ReportingResultRowDto): Promise<void> {
  const scope = actionScope();
  if (!scope?.dashboardId || !dashboard.value || !row.day) return;
  acting.value = true;
  try {
    const next = await supportAnalyticsArtifactSource.drilldownDashboard(
      scope.projectId,
      dashboard.value,
      row.day,
      row.dimensions?.CURRENCY ?? 'EUR',
      controller?.signal,
    );
    if (actionInScope(scope) && canRead.value) drilldown.value = next;
  } catch (cause) {
    if (actionInScope(scope))
      error.value = cause instanceof Error ? cause.message : 'Детализация недоступна';
  } finally {
    if (actionInScope(scope)) acting.value = false;
  }
}
async function duplicateReport(): Promise<void> {
  const scope = actionScope();
  if (!scope || !canAuthor.value) return;
  acting.value = true;
  try {
    await supportAnalyticsArtifactSource.duplicateReport(
      scope.projectId,
      scope.reportId,
      `${report.value!.name} — копия`,
    );
    if (actionInScope(scope) && canAuthor.value) notice.value = 'Копия отчёта создана.';
  } finally {
    if (actionInScope(scope)) acting.value = false;
  }
}
async function archiveReport(): Promise<void> {
  const scope = actionScope();
  if (!scope || !canAuthor.value) return;
  acting.value = true;
  try {
    await supportAnalyticsArtifactSource.archiveReport(scope.projectId, scope.reportId);
    if (actionInScope(scope) && canAuthor.value)
      notice.value = 'Отчёт архивирован; новые runs для него запрещены.';
  } finally {
    if (actionInScope(scope)) acting.value = false;
  }
}
async function shareDashboard(): Promise<void> {
  const scope = actionScope();
  const targetId =
    shareKind.value === 'PROJECT' ? (scope?.projectId ?? '') : shareTarget.value.trim();
  if (!scope?.dashboardId || !targetId || !canShare.value) return;
  acting.value = true;
  try {
    const nextShareId = await supportAnalyticsArtifactSource.shareDashboard(
      scope.projectId,
      scope.dashboardId,
      { kind: shareKind.value, id: targetId },
    );
    if (!actionInScope(scope) || !canShare.value) return;
    shareId.value = nextShareId;
    notice.value = 'Доступ выдан.';
  } finally {
    if (actionInScope(scope)) acting.value = false;
  }
}
async function revokeShare(): Promise<void> {
  const scope = actionScope();
  const currentShareId = shareId.value;
  if (!scope?.dashboardId || !currentShareId || !canShare.value) return;
  acting.value = true;
  try {
    await supportAnalyticsArtifactSource.revokeDashboardShare(
      scope.projectId,
      scope.dashboardId,
      currentShareId,
    );
    if (!actionInScope(scope) || !canShare.value) return;
    notice.value = 'Доступ отозван.';
    shareId.value = '';
  } finally {
    if (actionInScope(scope)) acting.value = false;
  }
}

function cellValue(cell: ReportingMetricCellDto): string {
  if (cell.state === 'SUPPRESSED') return 'Скрыто';
  if (cell.state === 'NOT_APPLICABLE') return 'Неприменимо';
  if (cell.state === 'NULL' || cell.value === undefined) return 'Нет данных';
  const value = new Intl.NumberFormat('ru', {
    maximumFractionDigits: 2,
  }).format(Number(cell.value));
  return cell.sampleSize ? `${value} · n=${cell.sampleSize}` : value;
}
function cellStateLabel(state: ReportingMetricCellDto['state']): string {
  return (
    {
      VALUE: 'Значение',
      NULL: 'Нет данных',
      SUPPRESSED: 'Скрыто',
      NOT_APPLICABLE: 'Неприменимо',
    }[state] ?? state
  );
}
function completenessLabel(value: string | undefined): string {
  return value === 'COMPLETE'
    ? 'Полные данные'
    : value === 'PARTIAL'
      ? 'Частичные данные'
      : (value ?? '—');
}

watch(
  [
    () => auth.project?.id,
    () => auth.user?.id,
    () => auth.project?.effectivePermissionCodes?.join(',') ?? '',
    () => route.fullPath,
  ],
  () => {
    void load();
    void loadOperatorCatalog();
  },
  { immediate: true },
);
watch(shareKind, () => {
  shareTarget.value = '';
});
onBeforeUnmount(() => {
  controller?.abort();
  operatorCatalogController?.abort();
});
</script>

<template>
  <main class="artifact-page" aria-labelledby="artifact-title">
    <header class="artifact-header">
      <div>
        <RouterLink to="/support/analytics/quality">← Аналитика поддержки</RouterLink>
        <span class="eyebrow">{{ isDashboard ? 'Личная панель' : 'Сохранённый отчёт' }}</span>
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
      <i class="pi pi-spin pi-spinner" /> Загружаем закреплённую ревизию…
    </section>

    <template v-else-if="report">
      <section class="artifact-spine" aria-label="Параметры артефакта">
        <div>
          <span>Состояние</span><strong class="compact">Опубликован</strong>
        </div>
        <div>
          <span>Метрики</span><strong>{{ report.query.metrics.length }}</strong>
        </div>
        <div>
          <span>Строк</span><strong>{{ rows.length }}</strong>
        </div>
        <div>
          <span>Полнота</span
          ><strong>{{ completenessLabel(result?.receipt?.completeness) }}</strong>
        </div>
      </section>

      <section :class="['surface', { widget: isDashboard }]">
        <header class="section-title">
          <div>
            <span v-if="isDashboard" class="widget-handle" aria-hidden="true">⠿</span>
            <h2>{{ report.name }}</h2>
            <p>
              {{ report.query.metrics.map((code) => metricLabel({ code } as never)).join(', ') }}
              · неизменяемый отпечаток запроса
            </p>
          </div>
        </header>
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Период / группа</th>
                <th v-for="code in report.query.metrics" :key="code">
                  {{ metricLabel({ code } as never) }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, index) in rows" :key="index">
                <td>
                  <button
                    v-if="isDashboard && row.day"
                    type="button"
                    class="drilldown-link"
                    :disabled="acting"
                    @click="openDay(row)"
                  >
                    {{ row.day }} <i class="pi pi-angle-right" />
                  </button>
                  <template v-else>{{
                    row.day ??
                    Object.values(row.dimensions ?? {})
                      .filter(Boolean)
                      .join(' · ') ??
                    `Строка ${index + 1}`
                  }}</template>
                </td>
                <td v-for="cell in row.metrics" :key="cell.code">
                  {{ cellValue(cell) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <footer>
          <span>Результат закреплён за проверенным снимком данных.</span>
          <Button
            label="Технические сведения"
            icon="pi pi-info-circle"
            text
            severity="secondary"
            @click="diagnosticsOpen = true"
          />
        </footer>
      </section>
      <section v-if="drilldown" class="surface drilldown" aria-labelledby="drilldown-title">
        <header class="section-title">
          <div>
            <span class="eyebrow">Метрика → {{ drilldown.day }}</span>
            <h2 id="drilldown-title">Проверяемая детализация</h2>
            <p>Сервер повторно проверил доступ и закреплённую ревизию панели.</p>
          </div>
          <Button
            label="Сбросить"
            icon="pi pi-times"
            text
            severity="secondary"
            @click="drilldown = null"
          />
        </header>
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Период / группа</th>
                <th>Результат</th>
                <th>Состояние</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="(detailRow, detailIndex) in drilldown.metrics" :key="detailIndex">
                <tr v-for="cell in detailRow.metrics" :key="cell.code">
                  <td>
                    {{
                      detailRow.day ??
                      Object.values(detailRow.dimensions ?? {})
                        .filter(Boolean)
                        .join(' · ')
                    }}
                  </td>
                  <td>{{ cellValue(cell) }}</td>
                  <td>{{ cellStateLabel(cell.state) }}</td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </section>
      <section class="surface artifact-controls">
        <div>
          <strong>История ревизий</strong>
          <span>{{ revisions.length }} опубликованных снимков</span>
        </div>
        <Button
          v-if="historyBefore"
          label="Показать более ранние"
          icon="pi pi-history"
          severity="secondary"
          text
          :loading="historyLoading"
          @click="loadMoreHistory"
        />
        <template v-if="isDashboard && canShare">
          <Select
            v-model="shareKind"
            :options="[
              { label: 'Пользователь', value: 'CMS_USER' },
              { label: 'Команда', value: 'TEAM' },
              { label: 'Весь проект', value: 'PROJECT' },
            ]"
            option-label="label"
            option-value="value"
            aria-label="Аудитория доступа"
          />
          <Select
            v-if="shareKind === 'CMS_USER'"
            v-model="shareTarget"
            :options="operatorCatalog"
            option-label="displayName"
            option-value="cmsUserId"
            :option-disabled="(operator) => !operator.selectable"
            filter
            filter-placeholder="Найти участника"
            placeholder="Выберите участника"
            aria-label="Участник проекта"
          />
          <label v-else-if="shareKind === 'TEAM'" class="typed-team-id">
            <span>Технический идентификатор команды</span>
            <InputText
              v-model="shareTarget"
              aria-label="Технический идентификатор команды"
              placeholder="Введите идентификатор команды"
            />
          </label>
          <small v-if="shareKind === 'CMS_USER' && operatorCatalogError" class="catalog-error">
            {{ operatorCatalogError }}
          </small>
          <Button
            label="Выдать доступ"
            :disabled="shareKind !== 'PROJECT' && !shareTarget.trim()"
            :loading="acting"
            @click="shareDashboard"
          />
          <Button
            v-if="shareId"
            label="Отозвать доступ"
            severity="danger"
            text
            :loading="acting"
            @click="revokeShare"
          />
        </template>
        <template v-else-if="canAuthor">
          <Button
            label="Дублировать"
            icon="pi pi-copy"
            severity="secondary"
            outlined
            :loading="acting"
            @click="duplicateReport"
          />
          <Button
            label="Архивировать"
            icon="pi pi-box"
            severity="secondary"
            text
            :loading="acting"
            @click="archiveReport"
          />
        </template>
      </section>
    </template>
    <Dialog
      v-if="diagnosticsOpen && report"
      v-model:visible="diagnosticsOpen"
      modal
      header="Технические сведения"
      :style="{ width: 'min(36rem, calc(100vw - 2rem))' }"
    >
      <dl class="artifact-diagnostics">
        <div><dt>Ревизия отчёта</dt><dd>{{ report.revision }}</dd></div>
        <div><dt>Идентификатор ревизии</dt><dd>{{ report.savedReportRevisionId }}</dd></div>
        <div><dt>Отпечаток запроса</dt><dd>{{ report.queryDefinitionHash }}</dd></div>
        <div v-if="result?.receipt?.datasetRevisionId">
          <dt>Ревизия набора данных</dt>
          <dd>{{ result.receipt.datasetRevisionId }}</dd>
        </div>
        <div v-if="result?.receipt?.privacyEpoch">
          <dt>Эпоха приватности</dt>
          <dd>{{ result.receipt.privacyEpoch }}</dd>
        </div>
        <div v-if="report.query.metrics.length">
          <dt>Коды метрик</dt>
          <dd>{{ report.query.metrics.join(', ') }}</dd>
        </div>
      </dl>
    </Dialog>
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
.artifact-spine div:last-child {
  border: 0;
}
.artifact-spine span,
footer {
  color: var(--p-text-muted-color);
}
.artifact-spine strong {
  font-size: 1.35rem;
}
.artifact-spine strong.compact {
  font-size: 0.95rem;
}
.artifact-diagnostics {
  display: grid;
  gap: 10px;
  margin: 0;
}
.artifact-diagnostics div {
  display: grid;
  gap: 3px;
}
.artifact-diagnostics dt {
  color: var(--p-text-muted-color);
  font-size: 0.7rem;
  text-transform: uppercase;
}
.artifact-diagnostics dd {
  margin: 0;
  font-family: monospace;
  overflow-wrap: anywhere;
}
.surface {
  border: 1px solid var(--p-content-border-color);
  border-radius: 12px;
  background: var(--p-content-background);
  overflow: hidden;
}
.widget {
  padding: 16px;
  background: var(--p-content-hover-background);
}
.widget .section-title,
.widget .table-scroll,
.widget footer {
  background: var(--p-content-background);
}
.section-title {
  padding: 14px 16px;
  border-bottom: 1px solid var(--p-content-border-color);
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.section-title h2 {
  margin: 0 0 3px;
  font-size: 1rem;
}
.section-title code {
  font-size: 0.72rem;
  color: var(--p-text-muted-color);
}
.widget-handle {
  float: left;
  margin-right: 6px;
  color: var(--p-text-muted-color);
}
.table-scroll {
  overflow: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  min-width: 560px;
}
th,
td {
  padding: 11px 14px;
  border-bottom: 1px solid var(--p-content-border-color);
  text-align: right;
}
th:first-child,
td:first-child {
  text-align: left;
}
th {
  font-size: 0.7rem;
  color: var(--p-text-muted-color);
}
td {
  font-size: 0.82rem;
}
.drilldown-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--p-primary-color);
  font: inherit;
  cursor: pointer;
}
.drilldown-link:hover,
.drilldown-link:focus-visible {
  text-decoration: underline;
}
.drilldown-link:disabled {
  color: var(--p-text-muted-color);
  cursor: wait;
}
.drilldown {
  border-color: color-mix(in srgb, var(--p-primary-color) 28%, var(--p-content-border-color));
}
footer {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  font-size: 0.7rem;
}
.loading {
  min-height: 300px;
  display: grid;
  place-content: center;
  color: var(--p-text-muted-color);
}
.notice {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--p-red-200);
  border-radius: 8px;
  color: var(--p-red-700);
  background: var(--p-red-50);
}
.notice :deep(.p-button) {
  margin-left: auto;
}
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
.typed-team-id {
  display: grid;
  gap: 4px;
}
.typed-team-id span,
.catalog-error {
  color: var(--p-text-muted-color);
  font-size: 0.76rem;
}
.catalog-error {
  color: var(--p-red-700);
}
@media (max-width: 640px) {
  .artifact-page {
    padding: 16px 12px;
  }
  .artifact-spine {
    grid-template-columns: 1fr 1fr;
  }
  .artifact-spine div:nth-child(2) {
    border-right: 0;
  }
  .artifact-spine div:nth-child(-n + 2) {
    border-bottom: 1px solid var(--p-content-border-color);
  }
  .widget {
    padding: 8px;
  }
  footer {
    flex-direction: column;
  }
  .artifact-controls {
    align-items: stretch;
    flex-direction: column;
  }
  .artifact-controls > div {
    margin-right: 0;
  }
}
</style>
