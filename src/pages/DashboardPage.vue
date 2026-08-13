<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import Skeleton from 'primevue/skeleton';
import Textarea from 'primevue/textarea';
import { useAuthStore } from '@/features/auth/auth.store';
import { reportingRepository } from '@/features/reporting/api/reporting-repository';
import {
  canCreateDashboard,
  canEditDashboard,
  canPublishDashboard,
  canReadReporting,
} from '@/features/reporting/model/reporting-permissions';
import { ReportingRunCoordinator } from '@/features/reporting/model/reporting-run-coordinator';
import {
  reportingDateRangeOptions,
  reportingPeriodDays,
  reportingSpaceOptions,
} from '@/features/reporting/model/reporting-options';
import type {
  Dashboard,
  ReportingArtifactSpace,
  DashboardWidget,
  DashboardWidgetWidth,
  ReportingDateRange,
  SavedReport,
} from '@/features/reporting/model/reporting-types';
import { ReportingVersionConflictError } from '@/features/reporting/model/reporting-types';
import ReportingDashboardWidget from '@/features/reporting/ui/ReportingDashboardWidget.vue';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const coordinator = new ReportingRunCoordinator(6);
const dashboard = ref<Dashboard | null>(null);
const reports = ref<SavedReport[]>([]);
const loading = ref(true);
const saving = ref(false);
const publishing = ref(false);
const error = ref('');
const versionConflict = ref(false);
const pendingDateRange = ref<ReportingDateRange>('LAST_2_DAYS');
const appliedDateRange = ref<ReportingDateRange>('LAST_2_DAYS');
const refreshKey = ref(0);
const reportSearch = ref('');
const activePageId = ref('overview');
let autosaveReady = false;
let autosaveTimer: ReturnType<typeof setTimeout> | null = null;

const editor = reactive({
  title: 'Новый дашборд',
  description: '',
  space: 'PERSONAL' as ReportingArtifactSpace,
  collection: 'Без коллекции',
  widgets: [] as DashboardWidget[],
});

const isCreate = computed(() => route.name === 'dashboard-create');
const isEditing = computed(() => isCreate.value || route.name === 'dashboard-edit');
const projectId = computed(() => auth.project?.id ?? '');
const permissions = computed(() => auth.project?.effectivePermissionCodes ?? []);
const canPublish = computed(() => canPublishDashboard(permissions.value));
const canEdit = computed(() =>
  isCreate.value ? canCreateDashboard(permissions.value) : canEditDashboard(permissions.value),
);
const activePage = computed(
  () =>
    dashboard.value?.pages.find(({ id }) => id === activePageId.value) ??
    dashboard.value?.pages[0] ??
    null,
);
const activeWidgets = computed(() => activePage.value?.widgets ?? []);
const publishedReports = computed(() =>
  reports.value.filter((report) => report.lifecycle === 'PUBLISHED'),
);
const filteredReports = computed(() => {
  const needle = reportSearch.value.trim().toLocaleLowerCase('ru');
  if (!needle) return publishedReports.value;
  return publishedReports.value.filter((report) =>
    `${report.title} ${report.description} ${report.collection}`
      .toLocaleLowerCase('ru')
      .includes(needle),
  );
});
const dateRangeOptions = reportingDateRangeOptions;
const spaceOptions = reportingSpaceOptions;
const widthOptions: Array<{ value: DashboardWidgetWidth; label: string }> = [
  { value: 'ONE_THIRD', label: '1/3' },
  { value: 'HALF', label: '1/2' },
  { value: 'TWO_THIRDS', label: '2/3' },
  { value: 'FULL', label: 'На всю ширину' },
];

function reportById(reportId: string): SavedReport | undefined {
  return reports.value.find((report) => report.id === reportId);
}

function applyDashboard(next: Dashboard): void {
  dashboard.value = next;
  editor.title = next.title;
  editor.description = next.description;
  editor.space = next.space;
  editor.collection = next.collection;
  activePageId.value = next.pages[0]?.id ?? 'overview';
  editor.widgets = structuredClone(next.pages[0]?.widgets ?? []);
}

function beginViewerScope(): void {
  if (!projectId.value || !dashboard.value) return;
  coordinator.beginScope(
    `${projectId.value}:${dashboard.value.id}:${activePageId.value}:${appliedDateRange.value}:${refreshKey.value}`,
  );
}

async function loadPage(): Promise<void> {
  if (!projectId.value || !canReadReporting(permissions.value)) {
    coordinator.purge();
    dashboard.value = null;
    reports.value = [];
    editor.widgets = [];
    loading.value = false;
    await router.replace({ name: 'overview' });
    return;
  }
  coordinator.purge();
  autosaveReady = false;
  loading.value = true;
  error.value = '';
  try {
    reports.value = isEditing.value
      ? await reportingRepository.listSavedReports(projectId.value)
      : [];
    const dashboardId =
      typeof route.params.dashboardId === 'string' ? route.params.dashboardId : '';
    if (dashboardId) {
      applyDashboard(await reportingRepository.getDashboard(projectId.value, dashboardId));
      if (
        isEditing.value &&
        (!canEdit.value || !dashboard.value?.allowedActions.includes('EDIT'))
      ) {
        await router.replace(`/dashboards/${dashboardId}`);
        return;
      }
    } else {
      dashboard.value = null;
      editor.title = 'Новый дашборд';
      editor.description = '';
      editor.space = 'PERSONAL';
      editor.collection = 'Без коллекции';
      editor.widgets = [];
      const initialReportId = typeof route.query.reportId === 'string' ? route.query.reportId : '';
      if (initialReportId && reportById(initialReportId)) addReport(initialReportId);
    }
    beginViewerScope();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Не удалось открыть дашборд';
  } finally {
    loading.value = false;
    autosaveReady = true;
  }
}

function applyFilters(): void {
  appliedDateRange.value = pendingDateRange.value;
  refreshKey.value += 1;
  beginViewerScope();
}

function refreshDashboard(): void {
  refreshKey.value += 1;
  beginViewerScope();
}

function addReport(reportId: string): void {
  if (editor.widgets.some((widget) => widget.savedReportId === reportId)) return;
  const report = reportById(reportId);
  if (
    !report ||
    report.lifecycle !== 'PUBLISHED' ||
    report.publishedRevision === null ||
    report.chartRevision === null
  )
    return;
  editor.widgets.push({
    id: `widget-local-${Date.now()}-${editor.widgets.length}`,
    savedReportId: reportId,
    savedReportRevision: report.publishedRevision,
    queryRevisionId: report.query.definitionRevisionId,
    chartRevision: report.chartRevision,
    title: report.title,
    accessibleSummary: `${report.title}. ${report.description}`,
    visualization: report.visualization,
    width: editor.widgets.length === 0 ? 'TWO_THIRDS' : 'ONE_THIRD',
  });
}

function moveWidget(index: number, direction: -1 | 1): void {
  const target = index + direction;
  if (target < 0 || target >= editor.widgets.length) return;
  const next = [...editor.widgets];
  const [widget] = next.splice(index, 1);
  if (!widget) return;
  next.splice(target, 0, widget);
  editor.widgets = next;
}

function removeWidget(widgetId: string): void {
  editor.widgets = editor.widgets.filter((widget) => widget.id !== widgetId);
}

async function persistDraft(asCopy: boolean): Promise<Dashboard | null> {
  if (
    !projectId.value ||
    !canEdit.value ||
    !editor.title.trim() ||
    (dashboard.value && !dashboard.value.allowedActions.includes('EDIT'))
  )
    return null;
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = null;
  saving.value = true;
  error.value = '';
  versionConflict.value = false;
  try {
    const saved = await reportingRepository.saveDashboardDraft(projectId.value, {
      ...(dashboard.value && !asCopy ? { id: dashboard.value.id } : {}),
      ...(dashboard.value && !asCopy ? { expectedVersion: dashboard.value.version } : {}),
      title: editor.title.trim(),
      description: editor.description.trim(),
      space: editor.space,
      collection: editor.collection.trim() || 'Без коллекции',
      pages: [
        {
          id: dashboard.value?.pages[0]?.id ?? 'overview',
          title: dashboard.value?.pages[0]?.title ?? 'Обзор',
          widgets: editor.widgets.map((widget) => ({ ...widget })),
        },
        ...structuredClone(dashboard.value?.pages.slice(1) ?? []),
      ],
    });
    applyDashboard(saved);
    if (route.params.dashboardId !== saved.id) {
      await router.replace(`/dashboards/${saved.id}/edit`);
    }
    return saved;
  } catch (cause) {
    versionConflict.value = cause instanceof ReportingVersionConflictError;
    error.value = cause instanceof Error ? cause.message : 'Черновик не сохранён';
    return null;
  } finally {
    saving.value = false;
  }
}

function saveDraft(): Promise<Dashboard | null> {
  return persistDraft(false);
}

async function duplicateDraft(): Promise<void> {
  await persistDraft(true);
}

async function publish(): Promise<void> {
  if (!canPublish.value) return;
  publishing.value = true;
  try {
    const draft = await saveDraft();
    if (!draft || !projectId.value) return;
    const published = await reportingRepository.publishDashboard(
      projectId.value,
      draft.id,
      draft.version,
    );
    applyDashboard(published);
    await router.replace(`/dashboards/${published.id}`);
    beginViewerScope();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Дашборд не опубликован';
  } finally {
    publishing.value = false;
  }
}

watch(activePageId, () => beginViewerScope());
watch(
  editor,
  () => {
    if (!autosaveReady || !isEditing.value || !canEdit.value || publishing.value) return;
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => void saveDraft(), 800);
  },
  { deep: true },
);
watch(
  () => [route.fullPath, projectId.value, [...permissions.value].sort().join(',')],
  () => void loadPage(),
);
onMounted(() => void loadPage());
onBeforeUnmount(() => {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  coordinator.purge();
});
</script>

<template>
  <main class="dashboard-page" :class="{ 'is-editor': isEditing }">
    <header class="dashboard-header">
      <div class="dashboard-heading">
        <button type="button" class="back-link" @click="router.push('/reports')">
          <i class="pi pi-arrow-left" aria-hidden="true" /> Библиотека
        </button>
        <span class="dashboard-eyebrow">Дашборд · Обзор</span>
        <h1>
          {{ isCreate ? 'Новый дашборд' : isEditing ? editor.title : dashboard?.title }}
        </h1>
        <p>
          {{
            isEditing
              ? 'Соберите обзор из опубликованных сохранённых отчётов.'
              : dashboard?.description
          }}
        </p>
      </div>
      <div class="dashboard-actions">
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
            :disabled="editor.widgets.length === 0"
            @click="publish"
          />
        </template>
        <template v-else>
          <Button
            label="Обновить"
            icon="pi pi-refresh"
            severity="secondary"
            text
            @click="refreshDashboard"
          />
          <Button
            v-if="canEdit && dashboard?.allowedActions.includes('EDIT')"
            label="Редактировать"
            icon="pi pi-pencil"
            @click="router.push(`/dashboards/${dashboard.id}/edit`)"
          />
        </template>
      </div>
    </header>

    <div v-if="error" class="dashboard-error" role="alert">
      <i class="pi pi-exclamation-triangle" aria-hidden="true" />
      <span>{{ error }}</span>
      <div v-if="versionConflict" class="conflict-actions">
        <Button label="Перезагрузить" size="small" text @click="loadPage" />
        <Button label="Сохранить как копию" size="small" text @click="duplicateDraft" />
      </div>
    </div>

    <section v-if="isEditing" class="dashboard-editor" aria-label="Редактор дашборда">
      <div class="editor-canvas">
        <div class="dashboard-properties">
          <label><span>Название</span><InputText v-model="editor.title" /></label>
          <label
            ><span>Описание</span><Textarea v-model="editor.description" rows="2" auto-resize
          /></label>
          <label
            ><span>Пространство</span
            ><Select
              v-model="editor.space"
              :options="spaceOptions"
              option-label="label"
              option-value="value"
          /></label>
          <label><span>Коллекция</span><InputText v-model="editor.collection" /></label>
        </div>

        <div class="editor-section-heading">
          <div>
            <span>Композиция</span>
            <h2>Обзор</h2>
          </div>
          <strong>{{ editor.widgets.length }} виджета</strong>
        </div>

        <div v-if="editor.widgets.length === 0" class="editor-empty">
          <span><i class="pi pi-th-large" aria-hidden="true" /></span>
          <h2>Добавьте первый отчёт</h2>
          <p>Дашборд хранит композицию, а запрос остаётся в Saved Report.</p>
        </div>

        <ol v-else class="editor-widget-list">
          <li v-for="(widget, index) in editor.widgets" :key="widget.id">
            <div class="widget-grip" aria-hidden="true">
              <i class="pi pi-bars" />
            </div>
            <div class="editor-widget-copy">
              <span>{{ reportById(widget.savedReportId)?.collection }}</span>
              <strong>{{ widget.titleOverride || widget.title }}</strong>
              <small>{{ reportById(widget.savedReportId)?.description }}</small>
            </div>
            <label class="width-control">
              <span>Ширина</span>
              <Select
                v-model="widget.width"
                :options="widthOptions"
                option-label="label"
                option-value="value"
              />
            </label>
            <div class="editor-widget-actions">
              <Button
                text
                rounded
                icon="pi pi-arrow-up"
                :disabled="index === 0"
                :aria-label="`Поднять ${widget.title}`"
                @click="moveWidget(index, -1)"
              />
              <Button
                text
                rounded
                icon="pi pi-arrow-down"
                :disabled="index === editor.widgets.length - 1"
                :aria-label="`Опустить ${widget.title}`"
                @click="moveWidget(index, 1)"
              />
              <Button
                text
                rounded
                severity="danger"
                icon="pi pi-trash"
                :aria-label="`Удалить ${widget.title}`"
                @click="removeWidget(widget.id)"
              />
            </div>
          </li>
        </ol>
      </div>

      <aside class="report-picker">
        <header>
          <span>Библиотека</span>
          <h2>Добавить отчёт</h2>
          <p>Только опубликованные ревизии.</p>
        </header>
        <label class="picker-search">
          <i class="pi pi-search" aria-hidden="true" />
          <InputText v-model="reportSearch" type="search" placeholder="Найти отчёт" />
        </label>
        <ul>
          <li v-for="reportItem in filteredReports" :key="reportItem.id">
            <div>
              <span>{{ reportItem.collection }}</span>
              <strong>{{ reportItem.title }}</strong>
              <small>{{ reportItem.visualization }}</small>
            </div>
            <Button
              :label="
                editor.widgets.some((widget) => widget.savedReportId === reportItem.id)
                  ? 'Добавлен'
                  : 'Добавить'
              "
              size="small"
              :disabled="editor.widgets.some((widget) => widget.savedReportId === reportItem.id)"
              @click="addReport(reportItem.id)"
            />
          </li>
        </ul>
      </aside>
    </section>

    <template v-else>
      <nav
        v-if="(dashboard?.pages.length ?? 0) > 1"
        class="dashboard-pages"
        aria-label="Страницы дашборда"
      >
        <button
          v-for="page in dashboard?.pages ?? []"
          :key="page.id"
          type="button"
          :aria-current="activePageId === page.id ? 'page' : undefined"
          :class="{ active: activePageId === page.id }"
          @click="activePageId = page.id"
        >
          {{ page.title }}
        </button>
      </nav>
      <section class="dashboard-toolbar" aria-label="Фильтры дашборда">
        <div class="dashboard-filters">
          <Select
            v-model="pendingDateRange"
            :options="dateRangeOptions"
            option-label="label"
            option-value="value"
            aria-label="Период дашборда"
          />
          <Button label="Применить" severity="secondary" @click="applyFilters" />
        </div>
        <span class="compatibility-status">
          <i class="pi pi-check-circle" aria-hidden="true" />
          Применено к {{ activeWidgets.length }} из {{ activeWidgets.length }}
        </span>
      </section>

      <section
        v-if="loading"
        class="dashboard-grid dashboard-loading"
        aria-label="Загрузка дашборда"
      >
        <Skeleton v-for="index in 3" :key="index" height="340px" />
      </section>

      <section v-else class="dashboard-grid" aria-label="Виджеты дашборда">
        <ReportingDashboardWidget
          v-for="(widget, index) in activeWidgets"
          :key="`${widget.id}:${refreshKey}`"
          :class="`width-${widget.width.toLowerCase().replace('_', '-')}`"
          :project-id="projectId"
          :dashboard-id="dashboard!.id"
          :dashboard-revision-id="dashboard!.dashboardRevisionId"
          :page-id="activePage!.id"
          :widget="widget"
          :period-days="reportingPeriodDays(appliedDateRange)"
          :coordinator="coordinator"
          :refresh-key="refreshKey"
          :deferred="index > 3"
          :style="{ '--widget-index': index }"
        />
      </section>
    </template>
  </main>
</template>

<style scoped>
.dashboard-page {
  min-height: 100%;
  padding: 20px clamp(16px, 2.6vw, 40px) 56px;
  color: var(--text-primary);
}

.dashboard-header,
.dashboard-pages,
.dashboard-toolbar,
.dashboard-grid,
.dashboard-editor,
.dashboard-error {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 1480px;
  margin-right: auto;
  margin-left: auto;
}

.conflict-actions {
  display: flex;
  gap: 4px;
  margin-left: auto;
}

.dashboard-pages {
  display: flex;
  gap: 4px;
  margin-bottom: 10px;
  overflow-x: auto;
}

.dashboard-pages button {
  min-height: 36px;
  padding: 7px 12px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font: 650 var(--font-size-body-small) var(--font-display);
  cursor: pointer;
}

.dashboard-pages button.active {
  background: var(--surface-active);
  color: var(--text-primary);
}

.dashboard-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 20px;
}

.dashboard-heading {
  max-width: 760px;
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

.dashboard-eyebrow,
.editor-section-heading span,
.report-picker header > span,
.report-picker li span,
.editor-widget-copy > span {
  color: var(--status-accent-text);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

h1 {
  margin: 4px 0 0;
  font-family: var(--font-display);
  font-size: clamp(1.75rem, 3vw, 2.6rem);
  line-height: 1.08;
  letter-spacing: -0.04em;
  text-wrap: balance;
}

.dashboard-heading p {
  margin: 8px 0 0;
  color: var(--text-secondary);
  line-height: 1.45;
}

.dashboard-actions,
.dashboard-toolbar,
.dashboard-filters,
.editor-widget-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dashboard-error {
  margin-bottom: 16px;
  padding: 10px 12px;
  border-radius: 9px;
  background: var(--status-danger-soft);
  color: var(--status-danger-text);
}

.dashboard-toolbar {
  justify-content: space-between;
  margin-bottom: 16px;
  padding: 8px 12px;
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  background: var(--surface-card);
}

.compatibility-status {
  color: var(--text-secondary);
  font-size: var(--font-size-body-small);
  font-variant-numeric: tabular-nums;
}

.compatibility-status i {
  margin-right: 5px;
  color: var(--status-success);
}

.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 16px;
}

.dashboard-grid > * {
  grid-column: span 3;
  animation: widget-enter 220ms cubic-bezier(0.23, 1, 0.32, 1) forwards;
  animation-delay: calc(var(--widget-index, 0) * 45ms);
}

.dashboard-grid > .width-one-third {
  grid-column: span 2;
}
.dashboard-grid > .width-half {
  grid-column: span 3;
}
.dashboard-grid > .width-two-thirds {
  grid-column: span 4;
}
.dashboard-grid > .width-full {
  grid-column: 1 / -1;
}

.dashboard-loading > * {
  grid-column: span 3;
  animation: none;
}

.dashboard-editor {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  align-items: start;
  gap: 20px;
}

.editor-canvas,
.report-picker {
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  border-radius: 15px;
  background: var(--surface-card);
}

.dashboard-properties {
  display: grid;
  grid-template-columns: 1.2fr 1.8fr 1fr;
  gap: 12px;
  padding: 16px;
  border-bottom: 1px solid var(--border-subtle);
}

.dashboard-properties label,
.width-control {
  display: grid;
  gap: 6px;
}

.dashboard-properties label > span,
.width-control > span {
  color: var(--text-secondary);
  font-size: var(--font-size-caption);
  font-weight: 650;
}

.dashboard-properties :deep(input),
.dashboard-properties :deep(textarea),
.width-control :deep(.p-select) {
  width: 100%;
}

.editor-section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 16px 10px;
}

.editor-section-heading h2 {
  margin: 3px 0 0;
  font: 650 1.15rem var(--font-display);
}

.editor-section-heading strong {
  color: var(--text-tertiary);
  font-size: var(--font-size-caption);
  font-variant-numeric: tabular-nums;
}

.editor-empty {
  display: grid;
  min-height: 360px;
  place-items: center;
  align-content: center;
  gap: 8px;
  padding: 32px;
  color: var(--text-secondary);
  text-align: center;
}

.editor-empty > span {
  display: grid;
  width: 60px;
  height: 60px;
  margin-bottom: 8px;
  place-items: center;
  border-radius: 14px;
  background: var(--status-accent-soft);
  color: var(--status-accent-text);
  font-size: 1.4rem;
}

.editor-empty h2,
.editor-empty p {
  margin: 0;
}

.editor-empty h2 {
  color: var(--text-primary);
  font: 650 1.1rem var(--font-display);
}

.editor-widget-list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 8px 12px 16px;
  list-style: none;
}

.editor-widget-list li {
  display: grid;
  grid-template-columns: 24px minmax(180px, 1fr) 160px auto;
  align-items: center;
  gap: 12px;
  min-height: 82px;
  padding: 10px;
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  background: var(--surface-subtle);
}

.widget-grip {
  color: var(--text-tertiary);
}

.editor-widget-copy {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.editor-widget-copy strong,
.editor-widget-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.editor-widget-copy strong {
  font: 650 var(--font-size-body) var(--font-display);
}

.editor-widget-copy small {
  color: var(--text-tertiary);
}

.report-picker {
  position: sticky;
  top: 16px;
}

.report-picker header {
  padding: 16px 16px 10px;
}

.report-picker h2,
.report-picker p {
  margin: 0;
}

.report-picker h2 {
  margin-top: 3px;
  font: 650 1.1rem var(--font-display);
}

.report-picker p {
  margin-top: 4px;
  color: var(--text-tertiary);
  font-size: var(--font-size-caption);
}

.picker-search {
  position: relative;
  display: flex;
  align-items: center;
  margin: 6px 12px 10px;
}

.picker-search > i {
  position: absolute;
  left: 12px;
  z-index: 1;
  color: var(--text-tertiary);
}

.picker-search :deep(input) {
  width: 100%;
  padding-left: 36px;
}

.report-picker ul {
  max-height: 580px;
  overflow-y: auto;
  margin: 0;
  padding: 0 12px 12px;
  list-style: none;
}

.report-picker li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 72px;
  padding: 10px 4px;
  border-top: 1px solid var(--border-subtle);
}

.report-picker li > div {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.report-picker li strong {
  overflow: hidden;
  font-size: var(--font-size-body-small);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.report-picker li small {
  color: var(--text-tertiary);
  font-size: var(--font-size-caption);
}

@keyframes widget-enter {
  from {
    transform: translateY(7px);
  }
  to {
    transform: translateY(0);
  }
}

@media (max-width: 1100px) {
  .dashboard-editor {
    grid-template-columns: 1fr;
  }

  .report-picker {
    position: static;
  }
}

@media (max-width: 860px) {
  .dashboard-grid > *,
  .dashboard-grid > .width-one-third,
  .dashboard-grid > .width-half,
  .dashboard-grid > .width-two-thirds {
    grid-column: 1 / -1;
  }

  .dashboard-properties {
    grid-template-columns: 1fr 1fr;
  }

  .dashboard-properties label:nth-child(2) {
    grid-column: 1 / -1;
    grid-row: 2;
  }
}

@media (max-width: 680px) {
  .dashboard-page {
    padding: 16px 12px 36px;
  }

  .dashboard-header,
  .dashboard-actions,
  .dashboard-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .dashboard-actions :deep(button) {
    width: 100%;
    justify-content: center;
  }

  .compatibility-status {
    padding: 4px;
  }

  .dashboard-properties {
    grid-template-columns: 1fr;
  }

  .dashboard-properties label:nth-child(2) {
    grid-column: auto;
    grid-row: auto;
  }

  .editor-widget-list li {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .widget-grip,
  .width-control {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .dashboard-grid > * {
    animation: none;
  }
}
</style>
