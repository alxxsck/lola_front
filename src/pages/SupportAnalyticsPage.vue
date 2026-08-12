<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import Drawer from 'primevue/drawer';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import { useAuthStore } from '@/features/auth/auth.store';
import {
  supportAnalyticsArtifactSource,
  type SupportSavedArtifact,
  type SupportSavedReportDraft,
  type SupportScheduleInput,
} from '@/features/support-analytics/api/support-analytics-artifact-source';
import {
  HighCostConfirmationRequiredError,
  metricLabel,
  metricUnit,
  supportAnalyticsSource,
} from '@/features/support-analytics/api/support-analytics-source';
import { parseSupportAnalyticsGeneration } from '@/features/support-analytics/model/support-analytics-generation';
import { supportAnalyticsDrilldownTarget } from '@/features/support-analytics/model/support-analytics-drilldown';
import {
  compatibleSupportAnalyticsFilters,
  parseSupportAnalyticsFilterValue,
} from '@/features/support-analytics/model/support-analytics-filters';
import {
  CURATED_SUPPORT_VIEWS,
  resolveCuratedWidgets,
  type ResolvedCuratedWidget,
  type SupportAnalyticsView,
} from '@/features/support-analytics/model/support-analytics-curation';
import {
  isOperationalSupportAnalyticsView,
  shouldAutoRefreshSupportAnalytics,
} from '@/features/support-analytics/model/support-analytics-refresh';
import type {
  ReportingCatalogDatasetDto,
  ReportingMetricCellDto,
  ReportingQueryDefinitionDto,
  ReportingQueryResultResponseDto,
  ReportingDrilldownPageResponseDto,
  ReportingResultRowDto,
  ReportExportRequestedResponseDto,
  ReportExportStatusResponseDto,
  ReportScheduleChangedResponseDto,
  ReportScheduleCatalogItemResponseDto,
  ReportScheduleRunItemResponseDto,
  ReportDeliveryInboxItemResponseDto,
} from '@/shared/api/generated/models';
import { cmsRealtimeClient } from '@/shared/realtime/cms-realtime-client';
import PageLoadingSwap from '@/shared/ui/PageLoadingSwap.vue';
import SupportDataWorkbenchSkeleton from '@/features/support-quality/ui/SupportDataWorkbenchSkeleton.vue';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const catalog = ref<ReportingCatalogDatasetDto[]>([]);
const result = ref<ReportingQueryResultResponseDto | null>(null);
const drilldown = ref<ReportingDrilldownPageResponseDto | null>(null);
const drilldownLoading = ref(false);
const loading = ref(true);
const running = ref(false);
const error = ref('');
const showReceipt = ref(false);
const updateAvailable = ref(false);
const showTable = ref(false);
const saveDialog = ref(false);
const saveName = ref('Отчёт по качеству поддержки');
const artifact = ref<SupportSavedArtifact | null>(null);
const artifactDraft = ref<SupportSavedReportDraft | null>(null);
const dashboardDraftId = ref('');
const artifactBusy = ref(false);
const artifactNotice = ref('');
const lastExport = ref<ReportExportRequestedResponseDto | null>(null);
const lastExportStatus = ref<ReportExportStatusResponseDto | null>(null);
const lastSchedule = ref<ReportScheduleChangedResponseDto | null>(null);
const lifecycleDiagnosticsOpen = ref(false);
const scheduleDialog = ref(false);
const deliveryDialog = ref(false);
const scheduleDraft = ref<SupportScheduleInput>({
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  localTime: '09:00',
  format: 'PDF',
});
const schedules = ref<ReportScheduleCatalogItemResponseDto[]>([]);
const scheduleRuns = ref<ReportScheduleRunItemResponseDto[]>([]);
const deliveries = ref<ReportDeliveryInboxItemResponseDto[]>([]);
const nextScheduleCursor = ref<string>();
const nextScheduleRunCursor = ref<string>();
const nextDeliveryCursor = ref<string>();
const selectedScheduleId = ref('');
const deliveryBusy = ref(false);
let controller: AbortController | null = null;
let queryController: AbortController | null = null;
let curatedController: AbortController | null = null;
let unsubscribeRealtime: (() => void) | null = null;
let realtimeRefreshPending = false;
let scopeGeneration = 0;
let lastRealtimeGeneration = '';
let curatedEpoch = 0;
let queryEpoch = 0;
type ActionScope = Readonly<{
  projectId: string;
  actorId: string;
  permissions: string;
  generation: number;
}>;
type CuratedResult = Readonly<{
  state: 'LOADING' | 'READY' | 'ERROR';
  result?: ReportingQueryResultResponseDto;
}>;
const curatedResults = ref<Record<string, CuratedResult>>({});
const curatedRefreshing = ref(false);
const pageMode = computed(
  () => String(route.name ?? '').replace('support-analytics-', '') || 'overview',
);
const curatedMode = computed(() => pageMode.value as SupportAnalyticsView);
const curatedView = computed(() => CURATED_SUPPORT_VIEWS[curatedMode.value]);
const preferredFamily = computed(
  () =>
    ({
      flow: 'SUPPORT_CONVERSATION',
      quality: 'SUPPORT_QUALITY',
      team: 'SUPPORT_ASSIGNMENT',
      automation: 'SUPPORT_AI_USAGE',
    })[pageMode.value] ?? 'SUPPORT_QUALITY',
);
const selectedFamily = ref('');
const selectedMetric = ref('');
const groupBy = ref('');
const rangeDays = ref(7);
const comparison = ref('PREVIOUS_PERIOD');
const autoRefresh = ref(isOperationalSupportAnalyticsView(curatedMode.value));
const FILTER_DIMENSIONS = [
  'TEAM',
  'QUEUE',
  'CHANNEL',
  'LOCALE',
  'CATEGORY',
  'PRIORITY',
  'QUALITY_ITEM',
  'SCORECARD_REVISION',
] as const;
const filterDraft = ref<Record<string, string>>({});
const appliedFilters = ref<Record<string, string[]>>({});
const dataset = computed(
  () => catalog.value.find((item) => item.datasetCode === selectedFamily.value) ?? null,
);
const metric = computed(
  () => dataset.value?.metrics.find((item) => item.code === selectedMetric.value) ?? null,
);
const metricAllowed = computed(() =>
  (metric.value?.requiredPermissionCodes ?? []).every((code) => permissions.value.includes(code)),
);
const metricOptions = computed(() =>
  (dataset.value?.metrics ?? []).map((item) => ({
    label: metricLabel(item),
    value: item.code,
  })),
);
const dimensionOptions = computed(() => [
  { label: 'Без разбивки', value: '' },
  ...(dataset.value?.dimensions ?? [])
    .filter(
      ({ code }) =>
        metric.value?.compatibleDimensions.includes(code) &&
        code !== 'OCCURRED_DAY' &&
        code !== 'OCCURRED_HOUR',
    )
    .map(({ code }) => ({ label: dimensionLabel(code), value: code })),
]);
const filterOptions = computed(() => {
  const available = new Set(
    catalog.value.flatMap((item) => item.dimensions.map(({ code }) => code)),
  );
  return FILTER_DIMENSIONS.filter((code) => available.has(code)).map((code) => ({
    code,
    label: dimensionLabel(code),
    placeholder: code === 'PRIORITY' ? 'Например, HIGH' : 'Значения через запятую',
  }));
});
const rows = computed(() => result.value?.result?.rows ?? []);
const maxValue = computed(() =>
  Math.max(1, ...rows.value.flatMap((row) => row.metrics.map((cell) => Number(cell.value ?? 0)))),
);
const availableCount = computed(
  () => catalog.value.filter((item) => item.readiness.status === 'READY').length,
);
const permissions = computed(() => auth.project?.effectivePermissionCodes ?? []);
const curatedWidgets = computed(() =>
  resolveCuratedWidgets(catalog.value, curatedMode.value, permissions.value),
);
const canRun = computed(
  () => permissions.value.includes('project.reporting.aggregate.read') && metricAllowed.value,
);
const canAuthor = computed(() => permissions.value.includes('project.reporting.author'));
const canCreateDashboard = computed(
  () =>
    permissions.value.includes('project.dashboards.author') &&
    permissions.value.includes('project.dashboards.publish'),
);
const canExport = computed(() => permissions.value.includes('project.reporting.export'));
const canSchedule = computed(() => permissions.value.includes('project.reporting.schedule'));
function captureActionScope(): ActionScope | null {
  const projectId = auth.project?.id;
  const actorId = auth.user?.id;
  if (!projectId || !actorId) return null;
  return {
    projectId,
    actorId,
    permissions: permissions.value.join(','),
    generation: scopeGeneration,
  };
}
function actionScopeCurrent(scope: ActionScope): boolean {
  return (
    auth.project?.id === scope.projectId &&
    auth.user?.id === scope.actorId &&
    permissions.value.join(',') === scope.permissions &&
    scopeGeneration === scope.generation
  );
}
function clearDeliveryState(): void {
  schedules.value = [];
  scheduleRuns.value = [];
  deliveries.value = [];
  nextScheduleCursor.value = undefined;
  nextScheduleRunCursor.value = undefined;
  nextDeliveryCursor.value = undefined;
  selectedScheduleId.value = '';
  deliveryDialog.value = false;
  deliveryBusy.value = false;
}

function dimensionLabel(code: string): string {
  return (
    (
      {
        TEAM: 'Команда',
        OPERATOR: 'Оператор',
        QUEUE: 'Очередь',
        CHANNEL: 'Канал',
        LOCALE: 'Язык',
        QUALITY_ITEM: 'Критерий',
        SCORECARD_REVISION: 'Версия карты оценки',
        CATEGORY: 'Категория',
        PRIORITY: 'Приоритет',
        SLA_STATE: 'Состояние SLA',
        AI_OPERATION: 'Операция автоматизации',
        CURRENCY: 'Валюта',
        OCCURRED_DAY: 'День',
        OCCURRED_HOUR: 'Час',
        DELIVERY_STATE: 'Состояние доставки',
        EXTERNAL_PROVIDER: 'Внешняя система',
      } as Record<string, string>
    )[code] ?? code
  );
}
function readinessLabel(status: string): string {
  return status === 'READY' ? 'Готов' : status === 'PARTIAL' ? 'Частично' : 'Нет данных';
}
function operationLabel(operation: string | undefined): string {
  return (
    {
      COUNT: 'Количество',
      SUM: 'Сумма',
      AVERAGE: 'Среднее',
      RATIO: 'Доля',
      RATE: 'Частота',
      DISTINCT: 'Уникальные значения',
      SNAPSHOT: 'Снимок на дату',
    }[operation ?? ''] ??
    operation ??
    '—'
  );
}
function exactnessLabel(exactness: string | undefined): string {
  return exactness === 'EXACT'
    ? 'Точный расчёт'
    : exactness === 'ESTIMATED'
      ? 'Оценка'
      : (exactness ?? '—');
}
function classificationLabel(classification: string | undefined): string {
  return (
    {
      AGGREGATE: 'Сводные данные',
      SENSITIVE: 'Чувствительные данные',
      RESTRICTED: 'Ограниченные данные',
    }[classification ?? ''] ??
    classification ??
    '—'
  );
}
function completenessLabel(completeness: string | undefined): string {
  return completeness === 'COMPLETE'
    ? 'Полные данные'
    : completeness === 'PARTIAL'
      ? 'Частичные данные'
      : (completeness ?? '—');
}
function observationLabel(count: number | undefined): string {
  if (count === undefined) return 'наблюдений';
  const modulo100 = count % 100;
  const modulo10 = count % 10;
  if (modulo100 >= 11 && modulo100 <= 14) return 'наблюдений';
  if (modulo10 === 1) return 'наблюдение';
  if (modulo10 >= 2 && modulo10 <= 4) return 'наблюдения';
  return 'наблюдений';
}
function cellStateLabel(state: string | undefined): string {
  return (
    {
      VALUE: 'Есть значение',
      SUPPRESSED: 'Скрыто',
      NOT_APPLICABLE: 'Неприменимо',
      NULL: 'Нет данных',
    }[state ?? ''] ?? 'Нет данных'
  );
}
function deliveryStatusLabel(status: string): string {
  return (
    {
      ACTIVE: 'Активно',
      PAUSED: 'Приостановлено',
      ARCHIVED: 'Архивировано',
      QUEUED: 'В очереди',
      RUNNING: 'Выполняется',
      READY: 'Готово',
      DELIVERED: 'Доставлено',
      FAILED: 'Ошибка',
      CANCELLED: 'Отменено',
      EXPIRED: 'Срок истёк',
      SUPPRESSED: 'Скрыто',
      SKIPPED_AUTHORITY: 'Нет полномочий',
      SKIPPED_TARGET: 'Получатель недоступен',
    }[status] ?? status
  );
}
function formatCell(cell: ReportingMetricCellDto | undefined, unit: string): string {
  if (!cell) return 'Нет данных';
  if (cell.state === 'SUPPRESSED') return 'Скрыто';
  if (cell.state === 'NOT_APPLICABLE') return 'Неприменимо';
  if (cell.state === 'NULL' || cell.value === undefined) return 'Нет данных';
  const number = Number(cell.value);
  if (unit === 'PERCENTAGE')
    return `${new Intl.NumberFormat('ru', { maximumFractionDigits: 1 }).format(number)}%`;
  if (unit === 'DURATION_MS')
    return number >= 60_000
      ? `${(number / 60_000).toFixed(1)} мин`
      : `${Math.round(number / 1000)} сек`;
  if (unit === 'MONEY')
    return new Intl.NumberFormat('ru', {
      style: 'currency',
      currency: 'EUR',
    }).format(number);
  return new Intl.NumberFormat('ru', { maximumFractionDigits: 1 }).format(number);
}
function rowLabel(row: ReportingResultRowDto, index: number): string {
  return row.day
    ? new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short' }).format(new Date(row.day))
    : Object.values(row.dimensions ?? {})
        .filter(Boolean)
        .join(' · ') || `Группа ${index + 1}`;
}
function localDay(value: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}
function queryFor(
  targetDataset: ReportingCatalogDatasetDto,
  metricCode: string,
  targetGroupBy: string[] = groupBy.value ? [groupBy.value] : ['OCCURRED_DAY'],
): ReportingQueryDefinitionDto {
  const until = new Date();
  const from = new Date(until.getTime() - rangeDays.value * 86_400_000);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const targetMetric = targetDataset.metrics.find(({ code }) => code === metricCode);
  const filters = compatibleSupportAnalyticsFilters(
    targetDataset,
    targetMetric,
    appliedFilters.value,
  );
  return {
    version: 1,
    datasetRevisionId: targetDataset.datasetRevisionId,
    metrics: [metricCode],
    groupBy: targetGroupBy,
    filters,
    range: {
      from: localDay(from, timezone),
      until: localDay(until, timezone),
      grain: groupBy.value ? 'DAY' : 'DAY',
      timezone,
    },
    comparison: comparison.value
      ? {
          kind: comparison.value as 'PREVIOUS_PERIOD' | 'PREVIOUS_WEEK' | 'PREVIOUS_MONTH',
        }
      : undefined,
    limit: 100,
  };
}
function applyAnalytics(): void {
  appliedFilters.value = Object.fromEntries(
    Object.entries(filterDraft.value)
      .map(([dimension, value]) => [dimension, parseSupportAnalyticsFilterValue(value)] as const)
      .filter(([, values]) => values.length > 0),
  );
  updateAvailable.value = false;
  void Promise.all([run(), runCurated()]);
}

function refreshAnalytics(): void {
  updateAvailable.value = false;
  void Promise.all([run(), runCurated()]);
}
function query(): ReportingQueryDefinitionDto {
  return queryFor(dataset.value!, selectedMetric.value);
}

async function runCurated(): Promise<void> {
  curatedController?.abort();
  curatedController = new AbortController();
  const signal = curatedController.signal;
  const epoch = ++curatedEpoch;
  const projectId = auth.project?.id;
  const actorId = auth.user?.id ?? '';
  const permissionSignature = permissions.value.join(',');
  const view = curatedMode.value;
  if (!projectId) return;
  const ready = curatedWidgets.value.filter(
    (
      item,
    ): item is ResolvedCuratedWidget &
      Required<Pick<ResolvedCuratedWidget, 'dataset' | 'metric'>> =>
      item.state === 'READY' && Boolean(item.dataset && item.metric),
  );
  const previous = curatedResults.value;
  curatedRefreshing.value = true;
  curatedResults.value = Object.fromEntries(
    ready.map(({ id }) => [
      id,
      previous[id]?.result ? previous[id] : { state: 'LOADING' as const },
    ]),
  );
  let cursor = 0;
  const worker = async () => {
    while (cursor < ready.length && !signal.aborted) {
      const item = ready[cursor++];
      if (!item) return;
      try {
        const next = await supportAnalyticsSource.run(
          projectId,
          queryFor(item.dataset, item.metric.code, []),
          signal,
        );
        if (
          signal.aborted ||
          epoch !== curatedEpoch ||
          auth.project?.id !== projectId ||
          (auth.user?.id ?? '') !== actorId ||
          permissions.value.join(',') !== permissionSignature ||
          curatedMode.value !== view
        )
          return;
        curatedResults.value = {
          ...curatedResults.value,
          [item.id]: { state: 'READY', result: next },
        };
      } catch {
        if (signal.aborted || epoch !== curatedEpoch) return;
        curatedResults.value = {
          ...curatedResults.value,
          [item.id]: previous[item.id]?.result ? previous[item.id] : { state: 'ERROR' },
        };
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(3, ready.length) }, worker));
  } finally {
    if (epoch === curatedEpoch) curatedRefreshing.value = false;
  }
}

function curatedCell(item: ResolvedCuratedWidget): ReportingMetricCellDto | undefined {
  return curatedResults.value[item.id]?.result?.result?.rows[0]?.metrics[0];
}
function curatedDataTime(item: ResolvedCuratedWidget): string {
  const value = curatedResults.value[item.id]?.result?.receipt?.dataAsOf;
  return value
    ? new Date(value).toLocaleTimeString('ru', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';
}
function curatedTrend(item: ResolvedCuratedWidget): string {
  const document = curatedResults.value[item.id]?.result?.result;
  const current = Number(document?.rows[0]?.metrics[0]?.value);
  const previous = Number(document?.comparison?.rows[0]?.metrics[0]?.value);
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return 'Без сравнения';
  const delta = current - previous;
  const formatted = new Intl.NumberFormat('ru', {
    maximumFractionDigits: 1,
    signDisplay: 'always',
  }).format(
    item.metric && metricUnit(item.metric) === 'PERCENTAGE'
      ? delta
      : (delta / Math.max(Math.abs(previous), 1)) * 100,
  );
  return `${formatted}${item.metric && metricUnit(item.metric) === 'PERCENTAGE' ? ' п. п.' : '%'} к опорному периоду`;
}
function curatedCoverage(item: ResolvedCuratedWidget): string {
  const current = curatedResults.value[item.id]?.result;
  const cell = current?.result?.rows[0]?.metrics[0];
  const receipt = current?.receipt;
  if (!receipt) return 'Квитанция ещё не получена';
  return [
    completenessLabel(receipt.completeness),
    cell?.sampleSize === undefined ? null : `n=${cell.sampleSize}`,
    `${receipt.rows} ${observationLabel(receipt.rows)}`,
  ]
    .filter(Boolean)
    .join(' · ');
}
function drilldownSubjectLabel(kind: string): string {
  return kind === 'CASE' ? 'Обращения' : 'Проверки качества';
}
function drilldownGroupLabel(value: string | null | undefined): string {
  if (!value || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value)) return 'Выбранная группа';
  return value;
}
function openCuratedWidget(item: ResolvedCuratedWidget): void {
  if (item.state !== 'READY' || !item.dataset || !item.metric) return;
  const curatedResult = curatedResults.value[item.id]?.result;
  const row = curatedResult?.result?.rows[0];
  const cell = row?.metrics[0];
  if (curatedResult && row && cell?.state === 'VALUE') {
    void openResultDrilldown(curatedResult, row, cell);
    return;
  }
  selectedFamily.value = item.dataset.datasetCode;
  selectedMetric.value = item.metric.code;
  groupBy.value = '';
  void run();
}

function reportingDrilldownParams(row: ReportingResultRowDto, cell: ReportingMetricCellDto) {
  const dimension = Object.entries(row.dimensions ?? {}).find(
    (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0,
  );
  return {
    metricCode: cell.code,
    ...(row.day ? { day: row.day } : {}),
    ...(dimension ? { dimensionCode: dimension[0], dimensionValue: dimension[1] } : {}),
    limit: 50 as const,
  };
}
async function openResultDrilldown(
  sourceResult: ReportingQueryResultResponseDto,
  row: ReportingResultRowDto,
  cell: ReportingMetricCellDto,
): Promise<void> {
  const scope = captureActionScope();
  if (!scope || cell.state !== 'VALUE') return;
  drilldownLoading.value = true;
  try {
    const next = await supportAnalyticsSource.drilldown(
      scope.projectId,
      sourceResult.runId,
      reportingDrilldownParams(row, cell),
      queryController?.signal,
    );
    if (actionScopeCurrent(scope)) drilldown.value = next;
  } catch (cause) {
    if (actionScopeCurrent(scope))
      error.value = cause instanceof Error ? cause.message : 'Детализация недоступна';
  } finally {
    if (actionScopeCurrent(scope)) drilldownLoading.value = false;
  }
}
async function loadMoreDrilldown(): Promise<void> {
  const scope = captureActionScope();
  const current = drilldown.value;
  if (!scope || !current?.nextCursor || drilldownLoading.value) return;
  drilldownLoading.value = true;
  try {
    const next = await supportAnalyticsSource.drilldown(
      scope.projectId,
      current.reset.runId,
      {
        metricCode: current.breadcrumb.metricCode,
        ...(current.breadcrumb.dimensionCode && current.breadcrumb.dimensionValue
          ? {
              dimensionCode: current.breadcrumb.dimensionCode,
              dimensionValue: current.breadcrumb.dimensionValue,
            }
          : {}),
        cursor: current.nextCursor,
        limit: 50,
      },
      queryController?.signal,
    );
    if (actionScopeCurrent(scope))
      drilldown.value = { ...next, items: [...current.items, ...next.items] };
  } finally {
    if (actionScopeCurrent(scope)) drilldownLoading.value = false;
  }
}
async function resetDrilldown(): Promise<void> {
  const scope = captureActionScope();
  const current = drilldown.value;
  if (!scope || !current || drilldownLoading.value) return;
  drilldownLoading.value = true;
  try {
    const next = await supportAnalyticsSource.drilldown(
      scope.projectId,
      current.reset.runId,
      { metricCode: current.reset.metricCode, limit: 50 },
      queryController?.signal,
    );
    if (actionScopeCurrent(scope)) drilldown.value = next;
  } finally {
    if (actionScopeCurrent(scope)) drilldownLoading.value = false;
  }
}
function openDrilldownSubject(index: number): void {
  const subject = drilldown.value?.items[index];
  if (!subject) return;
  const target = supportAnalyticsDrilldownTarget(subject);
  if (target) void router.push(target);
}

async function loadCatalog(): Promise<void> {
  controller?.abort();
  controller = new AbortController();
  const signal = controller.signal;
  const scope = ++scopeGeneration;
  const scopeProjectId = auth.project?.id;
  const scopePermissions = permissions.value.join(',');
  if (!scopeProjectId) return;
  loading.value = true;
  error.value = '';
  try {
    const nextCatalog = (await supportAnalyticsSource.catalog(scopeProjectId, signal)).datasets;
    if (
      signal.aborted ||
      scope !== scopeGeneration ||
      auth.project?.id !== scopeProjectId ||
      permissions.value.join(',') !== scopePermissions
    )
      return;
    catalog.value = nextCatalog;
    selectedFamily.value =
      typeof route.query.dataset === 'string' ? route.query.dataset : preferredFamily.value;
    if (!catalog.value.some((item) => item.datasetCode === selectedFamily.value))
      selectedFamily.value = 'SUPPORT_QUALITY';
    selectedMetric.value =
      typeof route.query.metric === 'string'
        ? route.query.metric
        : (catalog.value.find((item) => item.datasetCode === selectedFamily.value)?.metrics[0]
            ?.code ?? '');
    groupBy.value = typeof route.query.groupBy === 'string' ? route.query.groupBy : '';
    rangeDays.value = Number(route.query.days) || 7;
    comparison.value =
      typeof route.query.comparison === 'string' ? route.query.comparison : 'PREVIOUS_PERIOD';
    filterDraft.value = Object.fromEntries(
      FILTER_DIMENSIONS.map((dimension) => {
        const raw = route.query[`filter_${dimension}`];
        return [dimension, typeof raw === 'string' ? raw : ''];
      }),
    );
    appliedFilters.value = Object.fromEntries(
      Object.entries(filterDraft.value)
        .map(([dimension, value]) => [dimension, parseSupportAnalyticsFilterValue(value)] as const)
        .filter(([, values]) => values.length > 0),
    );
    void runCurated();
    if (canRun.value && dataset.value?.readiness.status === 'READY' && selectedMetric.value)
      await run();
  } catch (cause) {
    if (!signal.aborted && scope === scopeGeneration)
      error.value = cause instanceof Error ? cause.message : 'Каталог аналитики недоступен';
  } finally {
    if (!signal.aborted && scope === scopeGeneration) loading.value = false;
  }
}
async function run(): Promise<void> {
  if (
    !auth.project?.id ||
    !dataset.value ||
    !selectedMetric.value ||
    dataset.value.readiness.status !== 'READY' ||
    !canRun.value
  )
    return;
  queryController?.abort();
  queryController = new AbortController();
  const signal = queryController.signal;
  const scope = ++queryEpoch;
  const scopeProjectId = auth.project.id;
  const scopePermissions = permissions.value.join(',');
  running.value = true;
  error.value = '';
  try {
    try {
      const nextResult = await supportAnalyticsSource.run(scopeProjectId, query(), signal);
      if (
        signal.aborted ||
        scope !== queryEpoch ||
        auth.project?.id !== scopeProjectId ||
        permissions.value.join(',') !== scopePermissions ||
        !canRun.value
      )
        return;
      result.value = nextResult;
    } catch (cause) {
      if (!(cause instanceof HighCostConfirmationRequiredError)) throw cause;
      if (!window.confirm('Запрос может обработать большой объём данных. Продолжить?')) return;
      const nextResult = await supportAnalyticsSource.run(scopeProjectId, query(), signal, true);
      if (
        signal.aborted ||
        scope !== queryEpoch ||
        auth.project?.id !== scopeProjectId ||
        permissions.value.join(',') !== scopePermissions ||
        !canRun.value
      )
        return;
      result.value = nextResult;
    }
    if (
      signal.aborted ||
      scope !== queryEpoch ||
      auth.project?.id !== scopeProjectId ||
      permissions.value.join(',') !== scopePermissions ||
      !canRun.value
    )
      return;
    await router.replace({
      query: {
        dataset: selectedFamily.value,
        metric: selectedMetric.value,
        ...(groupBy.value ? { groupBy: groupBy.value } : {}),
        days: String(rangeDays.value),
        ...(comparison.value ? { comparison: comparison.value } : {}),
        ...Object.fromEntries(
          Object.entries(appliedFilters.value).map(([dimension, values]) => [
            `filter_${dimension}`,
            values.join(','),
          ]),
        ),
      },
    });
  } catch (cause) {
    if (!signal.aborted && scope === queryEpoch)
      error.value = cause instanceof Error ? cause.message : 'Запрос не выполнен';
  } finally {
    if (!signal.aborted && scope === queryEpoch) running.value = false;
  }
}
function changeFamily(): void {
  selectedMetric.value = dataset.value?.metrics[0]?.code ?? '';
  groupBy.value = '';
  result.value = null;
  if (dataset.value?.readiness.status === 'READY') void run();
}
function bindRealtime(): void {
  unsubscribeRealtime?.();
  unsubscribeRealtime = null;
  const projectId = auth.project?.id;
  if (!projectId) return;
  unsubscribeRealtime = cmsRealtimeClient.subscribe(
    ['reporting.dataset.generation.changed.v1'],
    (value) => {
      const event = parseSupportAnalyticsGeneration(value);
      if (!event) return;
      if (event.projectId !== projectId) return;
      const affectsSelected = event.datasetCode === selectedFamily.value;
      const affectsCurated = curatedWidgets.value.some(
        (item) => item.state === 'READY' && item.datasetCode === event.datasetCode,
      );
      if (!affectsSelected && !affectsCurated) return;
      if (event.generationId === lastRealtimeGeneration) return;
      lastRealtimeGeneration = event.generationId;
      if (
        shouldAutoRefreshSupportAnalytics({
          view: curatedMode.value,
          enabled: autoRefresh.value,
          visible: document.visibilityState === 'visible',
          online: navigator.onLine,
          busy: running.value || realtimeRefreshPending,
        })
      ) {
        realtimeRefreshPending = true;
        queueMicrotask(() => {
          realtimeRefreshPending = false;
          void Promise.all([
            affectsSelected ? run() : Promise.resolve(),
            affectsCurated ? runCurated() : Promise.resolve(),
          ]);
        });
      } else updateAvailable.value = true;
    },
  );
}
async function saveReport(): Promise<void> {
  const scope = captureActionScope();
  if (!scope || !result.value || !saveName.value.trim() || !canAuthor.value) return;
  artifactBusy.value = true;
  artifactNotice.value = '';
  try {
    const nextDraft = await supportAnalyticsArtifactSource.createReportDraft(
      scope.projectId,
      saveName.value.trim(),
      `Support-отчёт: ${metric.value ? metricLabel(metric.value) : selectedMetric.value}`,
      query(),
    );
    if (!actionScopeCurrent(scope) || !canAuthor.value) return;
    artifactDraft.value = nextDraft;
    artifactNotice.value = 'Черновик отчёта сохранён. Проверьте название и опубликуйте его.';
  } catch (cause) {
    if (actionScopeCurrent(scope))
      error.value = cause instanceof Error ? cause.message : 'Не удалось сохранить отчёт';
  } finally {
    if (actionScopeCurrent(scope)) artifactBusy.value = false;
  }
}
async function publishSavedReport(): Promise<void> {
  const scope = captureActionScope();
  const draft = artifactDraft.value;
  if (!scope || !draft || !canAuthor.value) return;
  artifactBusy.value = true;
  try {
    const nextArtifact = await supportAnalyticsArtifactSource.publishReport(scope.projectId, draft);
    if (!actionScopeCurrent(scope) || !canAuthor.value || artifactDraft.value !== draft) return;
    artifact.value = nextArtifact;
    artifactDraft.value = null;
    saveDialog.value = false;
    artifactNotice.value = 'Отчёт опубликован.';
  } catch (cause) {
    if (actionScopeCurrent(scope))
      error.value = cause instanceof Error ? cause.message : 'Не удалось опубликовать отчёт';
  } finally {
    if (actionScopeCurrent(scope)) artifactBusy.value = false;
  }
}
async function createDashboard(): Promise<void> {
  const scope = captureActionScope();
  const report = artifact.value;
  if (!scope || !report || !canCreateDashboard.value) return;
  artifactBusy.value = true;
  try {
    const created = await supportAnalyticsArtifactSource.createDashboardDraft(
      scope.projectId,
      scope.actorId,
      report,
    );
    if (!actionScopeCurrent(scope) || !canCreateDashboard.value) return;
    dashboardDraftId.value = created.dashboardId;
    artifactNotice.value = 'Черновик личной панели создан. Опубликуйте его, когда всё готово.';
  } catch (cause) {
    if (actionScopeCurrent(scope))
      error.value = cause instanceof Error ? cause.message : 'Не удалось создать панель';
  } finally {
    if (actionScopeCurrent(scope)) artifactBusy.value = false;
  }
}
async function publishDashboard(): Promise<void> {
  const scope = captureActionScope();
  const dashboardId = dashboardDraftId.value;
  if (!scope || !dashboardId || !canCreateDashboard.value) return;
  artifactBusy.value = true;
  try {
    const published = await supportAnalyticsArtifactSource.publishDashboard(
      scope.projectId,
      dashboardId,
    );
    if (!actionScopeCurrent(scope) || dashboardDraftId.value !== dashboardId) return;
    dashboardDraftId.value = '';
    artifactNotice.value = 'Личная панель опубликована.';
    await router.push(`/support/analytics/dashboards/${published.dashboardId}`);
  } catch (cause) {
    if (actionScopeCurrent(scope))
      error.value = cause instanceof Error ? cause.message : 'Не удалось опубликовать панель';
  } finally {
    if (actionScopeCurrent(scope)) artifactBusy.value = false;
  }
}
async function requestExport(format: 'CSV' | 'XLSX' | 'PDF' | 'PNG'): Promise<void> {
  const scope = captureActionScope();
  const report = artifact.value;
  if (!scope || !report || !canExport.value) return;
  artifactBusy.value = true;
  try {
    let receipt;
    try {
      receipt = await supportAnalyticsArtifactSource.exportReport(scope.projectId, report, format);
    } catch (cause) {
      if (!(cause instanceof Error) || !cause.message.includes('высокой стоимости')) throw cause;
      if (!window.confirm('Экспорт может быть большим. Подтвердить создание?')) return;
      receipt = await supportAnalyticsArtifactSource.exportReport(
        scope.projectId,
        report,
        format,
        true,
      );
    }
    if (!actionScopeCurrent(scope) || !canExport.value || artifact.value !== report) return;
    lastExport.value = receipt;
    lastExportStatus.value = null;
    artifactNotice.value = `${format}-экспорт поставлен в очередь.`;
    void pollExport(scope, receipt.exportId);
  } catch (cause) {
    if (actionScopeCurrent(scope))
      error.value = cause instanceof Error ? cause.message : 'Не удалось запустить экспорт';
  } finally {
    if (actionScopeCurrent(scope)) artifactBusy.value = false;
  }
}
async function pollExport(scope: ActionScope, exportId: string): Promise<void> {
  const deadline = Date.now() + 60_000;
  let delay = 500;
  while (
    Date.now() < deadline &&
    actionScopeCurrent(scope) &&
    lastExport.value?.exportId === exportId &&
    canExport.value
  ) {
    let status: ReportExportStatusResponseDto;
    try {
      status = await supportAnalyticsArtifactSource.readExport(scope.projectId, exportId);
    } catch (cause) {
      if (actionScopeCurrent(scope) && lastExport.value?.exportId === exportId)
        artifactNotice.value =
          cause instanceof Error
            ? `Статус экспорта: ${cause.message}`
            : 'Статус экспорта временно недоступен';
      return;
    }
    if (!actionScopeCurrent(scope) || lastExport.value?.exportId !== exportId || !canExport.value)
      return;
    lastExportStatus.value = status;
    if (!['QUEUED', 'RUNNING'].includes(status.status)) return;
    await new Promise((resolve) => window.setTimeout(resolve, delay));
    delay = Math.min(2_000, Math.round(delay * 1.5));
  }
}
async function downloadExport(): Promise<void> {
  const scope = captureActionScope();
  const status = lastExportStatus.value;
  if (!scope || status?.status !== 'READY' || !canExport.value) return;
  const blob = await supportAnalyticsArtifactSource.downloadExport(
    scope.projectId,
    status.exportId,
  );
  if (!actionScopeCurrent(scope) || !canExport.value || lastExportStatus.value !== status) return;
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = `support-report-${status.exportId}.${status.format.toLowerCase()}`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(href), 0);
}
async function revokeExport(): Promise<void> {
  const scope = captureActionScope();
  const exportId = lastExport.value?.exportId;
  if (!scope || !exportId || !canExport.value) return;
  await supportAnalyticsArtifactSource.revokeExport(scope.projectId, exportId);
  if (!actionScopeCurrent(scope) || !canExport.value || lastExport.value?.exportId !== exportId)
    return;
  artifactNotice.value = 'Доступ к экспорту отозван.';
  lastExportStatus.value = null;
  lastExport.value = null;
}
async function scheduleReport(): Promise<void> {
  const scope = captureActionScope();
  const report = artifact.value;
  if (!scope || !report || !canSchedule.value) return;
  artifactBusy.value = true;
  try {
    const receipt = await supportAnalyticsArtifactSource.scheduleReport(
      scope.projectId,
      scope.actorId,
      report,
      scheduleDraft.value,
    );
    if (!actionScopeCurrent(scope) || !canSchedule.value || artifact.value !== report) return;
    lastSchedule.value = receipt;
    scheduleDialog.value = false;
    artifactNotice.value = 'Расписание создано и активно.';
  } catch (cause) {
    if (actionScopeCurrent(scope))
      error.value = cause instanceof Error ? cause.message : 'Не удалось создать расписание';
  } finally {
    if (actionScopeCurrent(scope)) artifactBusy.value = false;
  }
}
async function openDeliveryCenter(): Promise<void> {
  const scope = captureActionScope();
  if (!scope || !canSchedule.value) return;
  deliveryBusy.value = true;
  deliveryDialog.value = true;
  try {
    const [schedulePage, deliveryPage] = await Promise.all([
      supportAnalyticsArtifactSource.listSchedules(scope.projectId),
      supportAnalyticsArtifactSource.listDeliveries(scope.projectId),
    ]);
    if (!actionScopeCurrent(scope) || !canSchedule.value) return;
    schedules.value = schedulePage.schedules;
    deliveries.value = deliveryPage.deliveries;
    nextScheduleCursor.value = schedulePage.nextBeforeScheduleId;
    nextDeliveryCursor.value = deliveryPage.nextBeforeDeliveryId;
    if (!selectedScheduleId.value && schedules.value[0])
      await selectSchedule(schedules.value[0].scheduleId);
  } catch (cause) {
    if (actionScopeCurrent(scope))
      error.value = cause instanceof Error ? cause.message : 'Не удалось загрузить доставки';
  } finally {
    if (actionScopeCurrent(scope)) deliveryBusy.value = false;
  }
}
async function selectSchedule(scheduleId: string): Promise<void> {
  const scope = captureActionScope();
  if (!scope || !canSchedule.value) return;
  selectedScheduleId.value = scheduleId;
  const [page, schedule] = await Promise.all([
    supportAnalyticsArtifactSource.listScheduleRuns(scope.projectId, scheduleId),
    supportAnalyticsArtifactSource.readSchedule(scope.projectId, scheduleId),
  ]);
  if (actionScopeCurrent(scope) && selectedScheduleId.value === scheduleId && canSchedule.value) {
    scheduleRuns.value = page.runs;
    nextScheduleRunCursor.value = page.nextBeforeRunId;
    lastSchedule.value = {
      kind: 'SCHEDULE_CHANGED',
      scheduleId: schedule.scheduleId,
      status: schedule.status,
      version: schedule.version,
    };
  }
}
async function loadMoreSchedules(): Promise<void> {
  const scope = captureActionScope();
  const cursor = nextScheduleCursor.value;
  if (!scope || !cursor || !canSchedule.value) return;
  const page = await supportAnalyticsArtifactSource.listSchedules(scope.projectId, cursor);
  if (!actionScopeCurrent(scope) || !canSchedule.value) return;
  schedules.value = [...schedules.value, ...page.schedules];
  nextScheduleCursor.value = page.nextBeforeScheduleId;
}
async function loadMoreScheduleRuns(): Promise<void> {
  const scope = captureActionScope();
  const cursor = nextScheduleRunCursor.value;
  const scheduleId = selectedScheduleId.value;
  if (!scope || !cursor || !scheduleId || !canSchedule.value) return;
  const page = await supportAnalyticsArtifactSource.listScheduleRuns(
    scope.projectId,
    scheduleId,
    cursor,
  );
  if (!actionScopeCurrent(scope) || selectedScheduleId.value !== scheduleId || !canSchedule.value)
    return;
  scheduleRuns.value = [...scheduleRuns.value, ...page.runs];
  nextScheduleRunCursor.value = page.nextBeforeRunId;
}
async function loadMoreDeliveries(): Promise<void> {
  const scope = captureActionScope();
  const cursor = nextDeliveryCursor.value;
  if (!scope || !cursor || !canSchedule.value) return;
  const page = await supportAnalyticsArtifactSource.listDeliveries(scope.projectId, cursor);
  if (!actionScopeCurrent(scope) || !canSchedule.value) return;
  deliveries.value = [...deliveries.value, ...page.deliveries];
  nextDeliveryCursor.value = page.nextBeforeDeliveryId;
}
async function cancelExport(): Promise<void> {
  const scope = captureActionScope();
  const exportId = lastExport.value?.exportId;
  if (!scope || !exportId || !canExport.value) return;
  await supportAnalyticsArtifactSource.cancelExport(scope.projectId, exportId);
  if (!actionScopeCurrent(scope) || !canExport.value || lastExport.value?.exportId !== exportId)
    return;
  artifactNotice.value = 'Экспорт отменён.';
  lastExport.value = null;
  lastExportStatus.value = null;
}
async function pauseSchedule(): Promise<void> {
  const scope = captureActionScope();
  const scheduleId = lastSchedule.value?.scheduleId;
  if (!scope || !scheduleId || !canSchedule.value) return;
  const receipt = await supportAnalyticsArtifactSource.pauseSchedule(scope.projectId, scheduleId);
  if (
    !actionScopeCurrent(scope) ||
    !canSchedule.value ||
    lastSchedule.value?.scheduleId !== scheduleId
  )
    return;
  lastSchedule.value = receipt;
  schedules.value = schedules.value.map((item) =>
    item.scheduleId === scheduleId
      ? { ...item, status: receipt.status, version: receipt.version }
      : item,
  );
  artifactNotice.value = 'Расписание приостановлено.';
}
async function resumeSchedule(): Promise<void> {
  const scope = captureActionScope();
  const scheduleId = lastSchedule.value?.scheduleId;
  if (!scope || !scheduleId || !canSchedule.value) return;
  const receipt = await supportAnalyticsArtifactSource.resumeSchedule(scope.projectId, scheduleId);
  if (
    !actionScopeCurrent(scope) ||
    !canSchedule.value ||
    lastSchedule.value?.scheduleId !== scheduleId
  )
    return;
  lastSchedule.value = receipt;
  schedules.value = schedules.value.map((item) =>
    item.scheduleId === scheduleId
      ? { ...item, status: receipt.status, version: receipt.version }
      : item,
  );
  artifactNotice.value = 'Расписание возобновлено.';
}
async function archiveSchedule(): Promise<void> {
  const scope = captureActionScope();
  const scheduleId = lastSchedule.value?.scheduleId;
  if (!scope || !scheduleId || !canSchedule.value) return;
  const receipt = await supportAnalyticsArtifactSource.archiveSchedule(scope.projectId, scheduleId);
  if (
    !actionScopeCurrent(scope) ||
    !canSchedule.value ||
    lastSchedule.value?.scheduleId !== scheduleId
  )
    return;
  lastSchedule.value = receipt;
  schedules.value = schedules.value.map((item) =>
    item.scheduleId === scheduleId
      ? { ...item, status: receipt.status, version: receipt.version }
      : item,
  );
  artifactNotice.value = 'Расписание перенесено в архив.';
}
watch(
  [() => auth.project?.id, () => auth.user?.id, pageMode],
  () => {
    scopeGeneration += 1;
    controller?.abort();
    queryController?.abort();
    curatedController?.abort();
    queryEpoch += 1;
    curatedEpoch += 1;
    result.value = null;
    artifact.value = null;
    lastExport.value = null;
    lastExportStatus.value = null;
    lastSchedule.value = null;
    lifecycleDiagnosticsOpen.value = false;
    clearDeliveryState();
    catalog.value = [];
    curatedResults.value = {};
    showReceipt.value = false;
    updateAvailable.value = false;
    lastRealtimeGeneration = '';
    bindRealtime();
    void loadCatalog();
  },
  { immediate: true },
);
watch(
  () => permissions.value.join(','),
  (nextPermissions, previousPermissions) => {
    const previous = new Set((previousPermissions ?? '').split(',').filter(Boolean));
    const next = new Set(nextPermissions.split(',').filter(Boolean));
    const aggregateChanged =
      previous.has('project.reporting.aggregate.read') !==
      next.has('project.reporting.aggregate.read');
    if (!next.has('project.reporting.export')) {
      lastExport.value = null;
      lastExportStatus.value = null;
    }
    if (!next.has('project.reporting.schedule')) {
      lastSchedule.value = null;
      lifecycleDiagnosticsOpen.value = false;
      clearDeliveryState();
    }
    if (!next.has('project.reporting.author')) {
      artifact.value = null;
      saveDialog.value = false;
    }
    scopeGeneration += 1;
    controller?.abort();
    queryController?.abort();
    curatedController?.abort();
    queryEpoch += 1;
    curatedEpoch += 1;
    if (aggregateChanged || !next.has('project.reporting.aggregate.read')) result.value = null;
    catalog.value = [];
    curatedResults.value = {};
    selectedMetric.value = '';
    groupBy.value = '';
    showReceipt.value = false;
    updateAvailable.value = false;
    saveDialog.value = false;
    scheduleDialog.value = false;
    artifactBusy.value = false;
    artifactNotice.value = '';
    void router.replace({ query: {} });
    if (next.has('project.reporting.aggregate.read')) {
      void loadCatalog();
      return;
    }
    loading.value = false;
  },
);
onBeforeUnmount(() => {
  controller?.abort();
  queryController?.abort();
  curatedController?.abort();
  unsubscribeRealtime?.();
});
</script>

<template>
  <PageLoadingSwap :loading="loading">
    <template #loading><SupportDataWorkbenchSkeleton kind="analytics" /></template>
    <main class="analytics-page" aria-labelledby="analytics-title">
      <header class="page-heading">
        <div>
          <span class="eyebrow">Аналитика поддержки</span>
          <h1 id="analytics-title">
            {{
              pageMode === 'quality'
                ? 'Качество поддержки'
                : pageMode === 'flow'
                  ? 'Поток обращений'
                  : pageMode === 'team'
                    ? 'Команда и нагрузка'
                    : pageMode === 'automation'
                      ? 'Автоматизация'
                      : 'Аналитика поддержки'
            }}
          </h1>
          <p>Проверяемые метрики с определениями, покрытием и квитанцией результата.</p>
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
        <RouterLink v-if="artifact" :to="`/support/analytics/reports/${artifact.savedReportId}`"
          >Открыть отчёт</RouterLink
        >
      </div>
      <div v-if="updateAvailable" class="update-hint" role="status">
        <i class="pi pi-refresh" /><span
          >Появились более свежие данные. Текущий результат остаётся закреплённым за своей
          квитанцией.</span
        ><Button label="Обновить" size="small" @click="refreshAnalytics" />
      </div>
      <section class="readiness-strip" aria-label="Готовность источников">
        <div>
          <span>Доступно сейчас</span><strong>{{ availableCount }} / {{ catalog.length }}</strong
          ><small>семейств данных</small>
        </div>
        <div>
          <span>Свежесть качества</span
          ><strong>{{
            dataset?.readiness.projectionLagMs
              ? Math.round(dataset.readiness.projectionLagMs / 1000) + ' сек'
              : '—'
          }}</strong
          ><small>лаг проекции</small>
        </div>
        <div>
          <span>Физический предел</span><strong>117 120</strong><small>строк на запрос</small>
        </div>
        <div>
          <span>Режим</span><strong class="compact">Точный</strong
          ><small>ограниченный расчёт</small>
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
          @click="applyAnalytics"
        />
        <label v-if="isOperationalSupportAnalyticsView(curatedMode)" class="auto-refresh-control">
          <input v-model="autoRefresh" type="checkbox" />
          Обновлять автоматически
        </label>
      </section>
      <details v-if="filterOptions.length" class="dimension-filters">
        <summary>
          <span>
            <strong>Уточнить выборку</strong>
            <small>Команда, очередь, канал и другие серверные разрезы</small>
          </span>
          <Tag
            v-if="Object.keys(appliedFilters).length"
            :value="`${Object.keys(appliedFilters).length} применено`"
            severity="info"
          />
          <i class="pi pi-chevron-down" aria-hidden="true" />
        </summary>
        <div class="dimension-filter-grid">
          <label v-for="item in filterOptions" :key="item.code">
            {{ item.label }}
            <InputText
              v-model="filterDraft[item.code]"
              :placeholder="item.placeholder"
              maxlength="500"
              :aria-label="`Фильтр: ${item.label}`"
            />
          </label>
        </div>
        <p>
          Несколько точных значений можно перечислить через запятую. Фильтр применяется только к тем
          показателям, для которых источник объявил совместимый разрез.
        </p>
      </details>
      <section class="curated-section" aria-labelledby="curated-title">
        <div class="curated-heading">
          <div>
            <span class="eyebrow">{{ curatedView.title }}</span>
            <h2 id="curated-title">{{ curatedView.question }}</h2>
          </div>
          <span class="query-bound"
            >{{ curatedWidgets.length }} показателей · не больше 3 запросов одновременно</span
          >
        </div>
        <div :class="['curated-grid', { 'health-spine': pageMode === 'overview' }]">
          <button
            v-for="item in curatedWidgets"
            :key="item.id"
            type="button"
            class="curated-widget"
            :class="[`tone-${item.tone}`, `state-${item.state.toLowerCase()}`]"
            :disabled="item.state !== 'READY'"
            :aria-label="`${item.title}. ${item.context}. ${item.state === 'READY' ? 'Показать объекты результата' : 'Данные недоступны'}`"
            @click="openCuratedWidget(item)"
          >
            <span class="widget-label">{{ item.title }}</span>
            <span
              v-if="curatedResults[item.id]?.state === 'LOADING'"
              class="widget-skeleton"
              aria-label="Загрузка"
            />
            <strong v-else-if="item.state === 'READY' && item.metric" class="widget-value">
              {{ formatCell(curatedCell(item), metricUnit(item.metric)) }}
            </strong>
            <strong v-else class="widget-value muted">
              {{ item.state === 'FORBIDDEN' ? 'Нет доступа' : 'Нет источника' }}
            </strong>
            <span class="widget-context">{{ item.context }}</span>
            <span v-if="item.state === 'READY' && item.metric" class="widget-definition">
              {{ operationLabel(item.metric.operation) }} ·
              {{ exactnessLabel(item.metric.exactness) }}
            </span>
            <span v-if="item.state === 'READY'" class="widget-coverage">
              {{ curatedCoverage(item) }}
            </span>
            <span v-if="item.state === 'READY'" class="widget-trend">
              {{ curatedTrend(item) }}
            </span>
            <span class="widget-meta">
              <template v-if="curatedResults[item.id]?.result?.receipt">
                Данные по {{ curatedDataTime(item) }}
              </template>
              <template
                v-else-if="item.state === 'READY' && curatedResults[item.id]?.state === 'ERROR'"
              >
                Не удалось обновить
              </template>
              <template v-else>{{ item.dataset?.name ?? item.datasetCode }}</template>
            </span>
          </button>
        </div>
        <p class="curated-refresh-status" role="status" aria-live="polite">
          {{ curatedRefreshing ? 'Обновляем показатели, текущий снимок остаётся на экране.' : '' }}
        </p>
      </section>
      <details v-if="pageMode === 'overview'" class="source-matrix">
        <summary>
          <span
            ><strong>Состояние источников</strong
            ><small>Проверить все {{ catalog.length }} семейств данных</small></span
          >
          <i class="pi pi-chevron-down" aria-hidden="true" />
        </summary>
        <div class="source-matrix-grid">
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
                  item.readiness.status === 'READY' ? 'pi pi-check-circle' : 'pi pi-minus-circle'
                "
              /><strong>{{ item.name }}</strong></span
            ><Tag
              :value="readinessLabel(item.readiness.status)"
              :severity="item.readiness.status === 'READY' ? 'success' : 'secondary'"
            />
          </button>
        </div>
      </details>
      <section v-if="dataset?.readiness.status !== 'READY' && !loading" class="unavailable">
        <i class="pi pi-database" />
        <h2>{{ dataset?.name }}: источник ещё не готов</h2>
        <p>
          Сервер ещё не получил подтверждённый источник для
          {{ dataset?.readiness.missingSourceFamilies.join(', ') }}. Мы не показываем искусственные
          нули.
        </p>
        <Button
          label="Открыть доступную аналитику качества"
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
              <h2>{{ metric ? metricLabel(metric) : 'Результат' }}</h2>
              <p>
                {{ operationLabel(metric?.operation) }} · минимум
                {{ metric?.minimumSample }}
                {{ observationLabel(metric?.minimumSample) }} ·
                {{
                  dataset?.readiness.coverageFrom
                    ? 'покрытие с ' +
                      new Date(dataset.readiness.coverageFrom).toLocaleDateString('ru')
                    : 'покрытие уточняется'
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
              <thead>
                <tr>
                  <th>Период / группа</th>
                  <th>{{ metric ? metricLabel(metric) : selectedMetric }}</th>
                  <th>Состояние</th>
                  <th>Выборка</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, index) in rows" :key="index">
                  <td>{{ rowLabel(row, index) }}</td>
                  <td>
                    <button
                      v-if="row.metrics[0]"
                      type="button"
                      class="analytics-drilldown-link"
                      :disabled="drilldownLoading || row.metrics[0].state !== 'VALUE'"
                      @click="openResultDrilldown(result!, row, row.metrics[0])"
                    >
                      {{ formatCell(row.metrics[0], metric ? metricUnit(metric) : 'DECIMAL') }}
                      <i class="pi pi-angle-right" aria-hidden="true" />
                    </button>
                  </td>
                  <td>{{ cellStateLabel(row.metrics[0]?.state) }}</td>
                  <td>{{ row.metrics[0]?.sampleSize ?? '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div
            v-else-if="rows.length"
            class="chart"
            role="group"
            :aria-label="`${metric ? metricLabel(metric) : 'Метрика'}: ${rows.map((row, index) => `${rowLabel(row, index)} ${row.metrics[0]?.value}`).join(', ')}`"
          >
            <button
              v-for="(row, index) in rows"
              :key="index"
              type="button"
              class="bar-column"
              :disabled="drilldownLoading || row.metrics[0]?.state !== 'VALUE'"
              @click="row.metrics[0] && openResultDrilldown(result!, row, row.metrics[0])"
            >
              <div class="bar-value">
                {{ formatCell(row.metrics[0], metric ? metricUnit(metric) : 'DECIMAL') }}
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
            </button>
          </div>
          <div v-if="running && result" class="comparison-note" role="status">
            <i class="pi pi-spin pi-spinner" /><span
              >Обновляем снимок; текущие данные остаются доступны.</span
            >
          </div>
          <div v-else-if="!rows.length" class="empty">
            <i class="pi pi-chart-bar" />
            <p>Выберите готовый источник и запустите запрос.</p>
          </div>
          <div v-if="result?.result?.comparison" class="comparison-note">
            <i class="pi pi-arrow-right-arrow-left" /><span
              >Сравнение с предыдущим периодом рассчитано по той же ревизии набора данных.</span
            >
          </div>
          <div v-if="result?.result?.comparison" class="comparison-table-link">
            <span>Предыдущий период: {{ result.result.comparison.rows.length }} строк</span>
            <Button
              v-if="selectedFamily === 'SUPPORT_QUALITY'"
              label="Открыть проверки качества"
              text
              icon="pi pi-external-link"
              @click="router.push('/support/quality')"
            />
          </div>
          <div v-if="artifact" class="artifact-actions" aria-label="Действия с отчётом">
            <div>
              <strong>{{ artifact.name }}</strong>
              <small>Опубликованный отчёт</small>
            </div>
            <Button
              v-if="canCreateDashboard && !dashboardDraftId"
              label="Черновик панели"
              icon="pi pi-th-large"
              text
              :loading="artifactBusy"
              @click="createDashboard"
            />
            <Button
              v-else-if="canCreateDashboard"
              label="Опубликовать панель"
              icon="pi pi-check"
              :loading="artifactBusy"
              @click="publishDashboard"
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
              label="XLSX"
              icon="pi pi-file-excel"
              text
              @click="requestExport('XLSX')"
            />
            <Button
              v-if="canExport"
              label="PDF"
              icon="pi pi-file-pdf"
              text
              @click="requestExport('PDF')"
            />
            <Button
              v-if="canExport"
              label="PNG"
              icon="pi pi-image"
              text
              @click="requestExport('PNG')"
            />
            <Button
              v-if="canSchedule"
              label="Расписание"
              icon="pi pi-calendar-clock"
              text
              @click="scheduleDialog = true"
            />
            <Button
              v-if="canSchedule"
              label="Доставки"
              icon="pi pi-inbox"
              text
              @click="openDeliveryCenter"
            />
          </div>
          <div v-if="lastExport || lastSchedule" class="delivery-lifecycle">
            <span v-if="lastExport"
              ><strong
                >Экспорт:
                {{ deliveryStatusLabel(lastExportStatus?.status ?? lastExport.status) }}</strong
              ><small>
                {{
                  lastExportStatus?.rows == null
                    ? 'Ожидает обработки'
                    : `${lastExportStatus.rows} строк · ${lastExportStatus.bytes ?? 0} байт`
                }}
              </small>
              <Button
                v-if="lastExportStatus?.status === 'READY'"
                label="Скачать"
                icon="pi pi-download"
                text
                @click="downloadExport"
              />
              <Button
                v-else-if="
                  !lastExportStatus || ['QUEUED', 'RUNNING'].includes(lastExportStatus.status)
                "
                label="Отменить"
                text
                severity="secondary"
                @click="cancelExport"
              />
              <Button
                v-if="lastExportStatus && !['QUEUED', 'RUNNING'].includes(lastExportStatus.status)"
                label="Отозвать"
                text
                severity="secondary"
                @click="revokeExport"
              />
            </span>
            <span v-if="lastSchedule"
              ><strong>Расписание: {{ deliveryStatusLabel(lastSchedule.status) }}</strong
              ><small>{{ scheduleDraft.localTime }} · {{ scheduleDraft.timezone }}</small>
              <Button
                v-if="lastSchedule.status === 'ACTIVE'"
                label="Пауза"
                text
                severity="secondary"
                @click="pauseSchedule"
              />
              <Button
                v-if="lastSchedule.status === 'PAUSED'"
                label="Возобновить"
                text
                severity="secondary"
                @click="resumeSchedule"
              />
              <Button label="Архивировать" text severity="secondary" @click="archiveSchedule" />
            </span>
            <Button
              label="Технические сведения"
              icon="pi pi-info-circle"
              text
              severity="secondary"
              @click="lifecycleDiagnosticsOpen = true"
            />
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
                <dd>{{ operationLabel(metric?.operation) }}</dd>
              </div>
              <div>
                <dt>Точность</dt>
                <dd>{{ exactnessLabel(metric?.exactness) }}</dd>
              </div>
              <div>
                <dt>Классификация</dt>
                <dd>{{ classificationLabel(metric?.classification) }}</dd>
              </div>
              <div>
                <dt>Совместимые разрезы</dt>
                <dd>
                  {{ metric?.compatibleDimensions.map(dimensionLabel).join(', ') }}
                </dd>
              </div>
            </dl>
          </section>
          <section v-if="showReceipt && result?.receipt" class="surface receipt">
            <div class="section-title">
              <div>
                <h2>Квитанция результата</h2>
                <p>Закреплённый снимок и эпоха приватности.</p>
              </div>
            </div>
            <dl>
              <div>
                <dt>Данные на</dt>
                <dd>
                  {{ new Date(result.receipt.dataAsOf).toLocaleString('ru') }}
                </dd>
              </div>
              <div>
                <dt>Полнота</dt>
                <dd>{{ completenessLabel(result.receipt.completeness) }}</dd>
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
                  {{ new Date(result.receipt.expiresAt).toLocaleTimeString('ru') }}
                </dd>
              </div>
              <div>
                <dt>Ревизия набора данных</dt>
                <dd class="mono">{{ result.receipt.datasetRevisionId }}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </section>
      <Drawer
        :visible="Boolean(drilldown)"
        position="right"
        :style="{ width: 'min(34rem, 100vw)' }"
        @update:visible="!$event && (drilldown = null)"
      >
        <template #header>
          <div class="drilldown-heading">
            <span class="eyebrow">Проверяемая детализация</span>
            <strong>{{
              drilldown
                ? drilldownSubjectLabel(drilldown.breadcrumb.subjectKind)
                : 'Объекты результата'
            }}</strong>
          </div>
        </template>
        <nav v-if="drilldown" class="drilldown-breadcrumb" aria-label="Путь детализации">
          <button type="button" :disabled="drilldownLoading" @click="resetDrilldown">
            Все объекты
          </button>
          <i class="pi pi-chevron-right" aria-hidden="true" />
          <span v-if="drilldown.breadcrumb.dimensionCode">
            {{ dimensionLabel(drilldown.breadcrumb.dimensionCode) }}:
            {{ drilldownGroupLabel(drilldown.breadcrumb.dimensionValue) }}
          </span>
          <span v-else>{{ drilldownSubjectLabel(drilldown.breadcrumb.subjectKind) }}</span>
        </nav>
        <p class="drilldown-copy">
          Доступ перепроверен для этого запуска. Скрытые обращения и проверки сюда не попадают.
        </p>
        <ul v-if="drilldown?.items.length" class="drilldown-subjects">
          <li v-for="(subject, index) in drilldown.items" :key="`${subject.kind}:${subject.id}`">
            <button type="button" @click="openDrilldownSubject(index)">
              <span>{{ subject.kind === 'CASE' ? 'Обращение' : 'Проверка качества' }}</span>
              <strong>{{ subject.state }}</strong>
              <small>{{ new Date(subject.occurredAt).toLocaleString('ru') }}</small>
              <i class="pi pi-arrow-right" aria-hidden="true" />
            </button>
          </li>
        </ul>
        <p v-else class="drilldown-copy">В этой группе нет доступных объектов.</p>
        <Button
          v-if="drilldown?.nextCursor"
          label="Показать ещё"
          severity="secondary"
          outlined
          :loading="drilldownLoading"
          @click="loadMoreDrilldown"
        />
      </Drawer>
      <Dialog
        v-model:visible="saveDialog"
        modal
        header="Сохранить Support-отчёт"
        :style="{ width: 'min(460px, calc(100vw - 24px))' }"
      >
        <div class="save-dialog">
          <p>
            Запрос будет опубликован как неизменяемая ревизия. Панель и доставки закрепятся за этим
            снимком.
          </p>
          <label>
            Название
            <InputText v-model="saveName" autofocus maxlength="120" />
          </label>
        </div>
        <template #footer>
          <Button label="Отмена" text severity="secondary" @click="saveDialog = false" />
          <Button
            v-if="!artifactDraft"
            label="Сохранить черновик"
            icon="pi pi-save"
            :loading="artifactBusy"
            :disabled="!saveName.trim()"
            @click="saveReport"
          />
          <Button
            v-else
            label="Опубликовать отчёт"
            icon="pi pi-check"
            :loading="artifactBusy"
            @click="publishSavedReport"
          />
        </template>
      </Dialog>
      <Dialog
        v-model:visible="scheduleDialog"
        modal
        header="Настроить ежедневную доставку"
        :style="{ width: 'min(520px, calc(100vw - 24px))' }"
      >
        <div class="schedule-form">
          <p>Отчёт будет рассчитан по закреплённой ревизии и появится во входящих доставках.</p>
          <label>Время<input v-model="scheduleDraft.localTime" type="time" /></label>
          <label>Часовой пояс<InputText v-model="scheduleDraft.timezone" maxlength="100" /></label>
          <label
            >Формат<Select v-model="scheduleDraft.format" :options="['PDF', 'XLSX', 'CSV', 'PNG']"
          /></label>
        </div>
        <template #footer>
          <Button label="Отмена" text severity="secondary" @click="scheduleDialog = false" />
          <Button
            label="Создать расписание"
            icon="pi pi-check"
            :loading="artifactBusy"
            @click="scheduleReport"
          />
        </template>
      </Dialog>
      <Dialog
        v-model:visible="deliveryDialog"
        modal
        header="Расписания и доставки"
        :style="{ width: 'min(900px, calc(100vw - 24px))' }"
      >
        <div v-if="deliveryBusy" class="dialog-loading">
          <i class="pi pi-spin pi-spinner" /> Загружаем историю…
        </div>
        <div v-else class="delivery-center">
          <section>
            <h3>Расписания</h3>
            <button
              v-for="item in schedules"
              :key="item.scheduleId"
              type="button"
              :class="{ active: selectedScheduleId === item.scheduleId }"
              @click="selectSchedule(item.scheduleId)"
            >
              <span
                ><strong>{{ item.name }}</strong
                ><small>{{ item.format }} · {{ item.timezone }}</small></span
              >
              <Tag
                :value="deliveryStatusLabel(item.status)"
                :severity="item.status === 'ACTIVE' ? 'success' : 'secondary'"
              />
            </button>
            <p v-if="!schedules.length" class="muted-copy">Расписаний пока нет.</p>
            <Button
              v-if="nextScheduleCursor"
              label="Показать ещё расписания"
              severity="secondary"
              text
              @click="loadMoreSchedules"
            />
          </section>
          <section>
            <h3>Запуски</h3>
            <div v-if="lastSchedule && selectedScheduleId" class="schedule-inline-actions">
              <Button
                v-if="lastSchedule.status === 'ACTIVE'"
                label="Приостановить"
                size="small"
                severity="secondary"
                outlined
                @click="pauseSchedule"
              />
              <Button
                v-if="lastSchedule.status === 'PAUSED'"
                label="Возобновить"
                size="small"
                severity="secondary"
                outlined
                @click="resumeSchedule"
              />
              <Button
                v-if="lastSchedule.status !== 'ARCHIVED'"
                label="В архив"
                size="small"
                severity="danger"
                text
                @click="archiveSchedule"
              />
            </div>
            <article v-for="item in scheduleRuns" :key="item.runId">
              <span
                ><strong>{{ new Date(item.nominalOccurrenceAt).toLocaleString('ru') }}</strong
                ><small>{{ item.rows ?? '—' }} строк · {{ item.format }}</small></span
              >
              <Tag
                :value="deliveryStatusLabel(item.status)"
                :severity="item.status === 'DELIVERED' ? 'success' : 'secondary'"
              />
            </article>
            <p v-if="selectedScheduleId && !scheduleRuns.length" class="muted-copy">
              Запусков ещё нет.
            </p>
            <Button
              v-if="nextScheduleRunCursor"
              label="Показать ещё запуски"
              severity="secondary"
              text
              @click="loadMoreScheduleRuns"
            />
          </section>
          <section class="delivery-inbox">
            <h3>Входящие файлы</h3>
            <article v-for="item in deliveries" :key="item.deliveryId">
              <span
                ><strong
                  >{{ item.format }} · {{ new Date(item.deliveredAt).toLocaleString('ru') }}</strong
                ><small
                  >Доступен до
                  {{
                    item.expiresAt ? new Date(item.expiresAt).toLocaleString('ru') : 'отзыва'
                  }}</small
                ></span
              >
              <Tag
                :value="deliveryStatusLabel(item.status)"
                :severity="item.status === 'READY' ? 'success' : 'secondary'"
              />
            </article>
            <p v-if="!deliveries.length" class="muted-copy">Доставленных файлов пока нет.</p>
            <Button
              v-if="nextDeliveryCursor"
              label="Показать ещё доставки"
              severity="secondary"
              text
              @click="loadMoreDeliveries"
            />
          </section>
        </div>
        <template #footer>
          <Button label="Закрыть" severity="secondary" text @click="deliveryDialog = false" />
        </template>
      </Dialog>
      <Dialog
        v-if="lifecycleDiagnosticsOpen && (lastExport || lastSchedule)"
        v-model:visible="lifecycleDiagnosticsOpen"
        modal
        header="Технические сведения"
        :style="{ width: 'min(520px, calc(100vw - 24px))' }"
      >
        <dl>
          <div v-if="lastExport">
            <dt>Экспорт</dt>
            <dd class="mono">{{ lastExport.exportId }}</dd>
          </div>
          <div v-if="lastSchedule">
            <dt>Расписание</dt>
            <dd class="mono">{{ lastSchedule.scheduleId }}</dd>
          </div>
          <div v-if="artifact">
            <dt>Ревизия отчёта</dt>
            <dd>{{ artifact.revision }}</dd>
          </div>
        </dl>
      </Dialog>
    </main>
  </PageLoadingSwap>
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
  scrollbar-width: none;
  overscroll-behavior-inline: contain;
}
nav::-webkit-scrollbar {
  display: none;
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
nav a[aria-current='page'],
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
  border: 1px solid color-mix(in srgb, var(--p-primary-color) 25%, var(--p-content-border-color));
  border-radius: 8px;
  background: color-mix(in srgb, var(--p-primary-color) 7%, var(--p-content-background));
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
.filter-bar .auto-refresh-control {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  cursor: pointer;
}
.auto-refresh-control input {
  accent-color: var(--p-primary-color);
}
.curated-section {
  display: grid;
  gap: 12px;
}
.curated-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
}
.curated-heading h2 {
  max-width: 760px;
  margin: 4px 0 0;
  font-size: clamp(1.05rem, 2vw, 1.35rem);
  font-weight: 600;
  letter-spacing: -0.02em;
}
.query-bound {
  color: var(--p-text-muted-color);
  font-size: 0.72rem;
  text-align: right;
}
.curated-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.curated-grid.health-spine {
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 0;
  border: 1px solid var(--p-content-border-color);
  border-radius: 14px;
  background: var(--p-content-background);
  overflow: hidden;
}
.curated-refresh-status {
  min-height: 1rem;
  margin: 6px 0 0;
  color: var(--p-text-muted-color);
  font-size: 0.7rem;
}
.curated-widget {
  position: relative;
  min-width: 0;
  min-height: 214px;
  padding: 16px;
  display: grid;
  align-content: start;
  gap: 7px;
  text-align: left;
  color: var(--p-text-color);
  border: 1px solid var(--p-content-border-color);
  border-radius: 12px;
  background: var(--p-content-background);
  cursor: pointer;
  transition:
    border-color 140ms ease,
    background-color 140ms ease,
    transform 140ms ease;
}
.health-spine .curated-widget {
  min-height: 224px;
  border: 0;
  border-right: 1px solid var(--p-content-border-color);
  border-radius: 0;
}
.health-spine .curated-widget:last-child {
  border-right: 0;
}
.health-spine .curated-widget:not(:last-child)::after {
  content: '';
  position: absolute;
  z-index: 1;
  top: 32px;
  right: -5px;
  width: 8px;
  height: 8px;
  border-top: 1px solid var(--p-content-border-color);
  border-right: 1px solid var(--p-content-border-color);
  background: var(--p-content-background);
  transform: rotate(45deg);
}
.curated-widget:not(:disabled):hover,
.curated-widget:not(:disabled):focus-visible {
  border-color: color-mix(in srgb, var(--p-primary-color) 45%, var(--p-content-border-color));
  background: color-mix(in srgb, var(--p-primary-color) 4%, var(--p-content-background));
  transform: translateY(-1px);
}
.curated-widget:disabled {
  cursor: default;
  opacity: 0.72;
}
.widget-label {
  color: var(--p-text-muted-color);
  font-size: 0.74rem;
  font-weight: 600;
}
.widget-value {
  min-height: 34px;
  font-size: clamp(1.45rem, 2.4vw, 2rem);
  font-weight: 650;
  letter-spacing: -0.04em;
  font-variant-numeric: tabular-nums;
}
.widget-value.muted {
  display: flex;
  align-items: center;
  font-size: 0.92rem;
  font-weight: 500;
  letter-spacing: 0;
  color: var(--p-text-muted-color);
}
.widget-context {
  min-height: 32px;
  font-size: 0.76rem;
  line-height: 1.35;
}
.widget-definition,
.widget-coverage,
.widget-trend {
  color: var(--p-text-muted-color);
  font-size: 0.66rem;
  line-height: 1.35;
}
.widget-definition {
  padding-top: 7px;
  border-top: 1px solid var(--p-content-border-color);
}
.widget-trend {
  color: var(--p-text-color);
  font-weight: 600;
}
.widget-meta {
  margin-top: auto;
  color: var(--p-text-muted-color);
  font-size: 0.66rem;
}
.widget-skeleton {
  width: 68%;
  height: 30px;
  margin: 2px 0;
  border-radius: 7px;
  background: linear-gradient(
    90deg,
    var(--p-content-hover-background),
    var(--p-content-background),
    var(--p-content-hover-background)
  );
  background-size: 200% 100%;
  animation: widget-loading 1.4s ease-in-out infinite;
}
.tone-attention::before,
.tone-critical::before,
.tone-positive::before {
  content: '';
  position: absolute;
  left: 16px;
  top: 0;
  width: 26px;
  height: 2px;
  border-radius: 0 0 2px 2px;
  background: var(--p-amber-500);
}
.tone-critical::before {
  background: var(--p-red-500);
}
.tone-positive::before {
  background: var(--p-green-500);
}
@keyframes widget-loading {
  to {
    background-position: -200% 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .curated-widget {
    transition: none;
  }
  .widget-skeleton {
    animation: none;
  }
}
.surface,
.dimension-filters,
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
.schedule-form {
  display: grid;
  gap: 14px;
}
.schedule-form p {
  margin: 0;
  color: var(--p-text-muted-color);
}
.schedule-form label {
  display: grid;
  gap: 6px;
  color: var(--p-text-muted-color);
  font-size: 0.76rem;
}
.schedule-form input[type='time'] {
  box-sizing: border-box;
  min-height: 42px;
  padding: 8px 10px;
  border: 1px solid var(--p-content-border-color);
  border-radius: 7px;
  background: var(--p-form-field-background);
  color: var(--p-text-color);
}
.dialog-loading {
  min-height: 180px;
  display: grid;
  place-content: center;
  gap: 8px;
  color: var(--p-text-muted-color);
}
.delivery-center {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}
.delivery-center section {
  min-width: 0;
  display: grid;
  align-content: start;
  gap: 6px;
}
.delivery-center h3 {
  margin: 0 0 4px;
  font-size: 0.9rem;
  font-weight: 600;
}
.delivery-center button,
.delivery-center article {
  min-width: 0;
  padding: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border: 1px solid var(--p-content-border-color);
  border-radius: 8px;
  background: transparent;
  color: inherit;
  text-align: left;
}
.delivery-center button {
  cursor: pointer;
}
.delivery-center button:hover,
.delivery-center button.active {
  border-color: var(--p-primary-color);
  background: color-mix(in srgb, var(--p-primary-color) 5%, transparent);
}
.delivery-center button > span,
.delivery-center article > span {
  min-width: 0;
  display: grid;
  gap: 2px;
}
.delivery-center small,
.muted-copy {
  color: var(--p-text-muted-color);
}
.delivery-inbox {
  grid-column: 1 / -1;
}
.schedule-inline-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}
.dimension-filters > summary,
.source-matrix > summary {
  min-height: 52px;
  padding: 10px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  cursor: pointer;
  list-style: none;
}
.dimension-filters > summary::-webkit-details-marker,
.source-matrix > summary::-webkit-details-marker {
  display: none;
}
.dimension-filters > summary > span,
.source-matrix > summary > span {
  display: grid;
  gap: 2px;
}
.dimension-filters > summary small,
.source-matrix > summary small {
  color: var(--p-text-muted-color);
  font-weight: 400;
}
.dimension-filters > summary .pi,
.source-matrix > summary .pi {
  color: var(--p-text-muted-color);
  transition: transform 140ms ease;
}
.dimension-filters[open] > summary .pi,
.source-matrix[open] > summary .pi {
  transform: rotate(180deg);
}
.dimension-filter-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  padding: 14px;
  border-top: 1px solid var(--p-content-border-color);
}
.dimension-filter-grid label {
  min-width: 0;
  display: grid;
  gap: 5px;
  color: var(--p-text-muted-color);
  font-size: 0.72rem;
}
.dimension-filter-grid :deep(.p-inputtext) {
  width: 100%;
}
.dimension-filters > p {
  margin: 0;
  padding: 0 14px 14px;
  color: var(--p-text-muted-color);
  font-size: 0.75rem;
}
.source-matrix-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  border-top: 1px solid var(--p-content-border-color);
}
.source-matrix-grid > button {
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
.source-matrix-grid > button:not(:disabled) {
  cursor: pointer;
}
.source-matrix-grid > button:not(:disabled):hover {
  background: var(--p-content-hover-background);
}
.source-matrix-grid > button:disabled {
  opacity: 0.55;
}
.source-matrix-grid > button > span {
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
.analytics-drilldown-link {
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  border: 0;
  color: var(--p-primary-color);
  font: inherit;
  font-weight: 650;
  background: transparent;
  cursor: pointer;
}
.analytics-drilldown-link:disabled {
  color: inherit;
  cursor: default;
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
  padding: 0;
  border: 0;
  color: inherit;
  background: transparent;
  cursor: pointer;
}
.bar-column:disabled {
  cursor: default;
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
.drilldown-heading {
  display: grid;
  gap: 3px;
}
.drilldown-copy {
  margin: 0 0 16px;
  color: var(--p-text-muted-color);
  line-height: 1.5;
}
.drilldown-breadcrumb {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 7px;
  margin: 0 0 12px;
  color: var(--p-text-muted-color);
  font-size: 0.76rem;
}
.drilldown-breadcrumb button {
  padding: 0;
  border: 0;
  color: var(--p-primary-color);
  font: inherit;
  font-weight: 650;
  background: transparent;
  cursor: pointer;
}
.drilldown-breadcrumb button:disabled {
  cursor: wait;
  opacity: 0.65;
}
.drilldown-subjects {
  display: grid;
  gap: 1px;
  margin: 0 0 16px;
  padding: 1px;
  list-style: none;
  border-radius: 14px;
  background: var(--p-content-border-color);
  overflow: hidden;
}
.drilldown-subjects button {
  width: 100%;
  min-height: 64px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 3px 12px;
  padding: 10px 12px;
  border: 0;
  color: inherit;
  text-align: left;
  background: var(--p-content-background);
  cursor: pointer;
}
.drilldown-subjects button:hover,
.drilldown-subjects button:focus-visible {
  background: var(--p-content-hover-background);
}
.drilldown-subjects strong {
  font-size: 0.76rem;
}
.drilldown-subjects small {
  color: var(--p-text-muted-color);
}
.drilldown-subjects i {
  grid-column: 2;
  grid-row: 1 / span 2;
  align-self: center;
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
  border-color: color-mix(in srgb, var(--p-primary-color) 35%, var(--p-content-border-color));
}
@media (max-width: 1500px) {
  .curated-grid,
  .curated-grid.health-spine {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    border: 0;
    background: transparent;
    overflow: visible;
  }
  .health-spine .curated-widget {
    border: 1px solid var(--p-content-border-color);
    border-radius: 12px;
  }
  .health-spine .curated-widget::after {
    display: none;
  }
  .filter-bar {
    grid-template-columns: repeat(3, 1fr);
  }
  .source-matrix-grid {
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
  .delivery-center {
    grid-template-columns: 1fr;
  }
  .delivery-inbox {
    grid-column: auto;
  }
  .curated-grid,
  .curated-grid.health-spine {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
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
  .dimension-filter-grid {
    grid-template-columns: 1fr 1fr;
  }
  .source-matrix-grid {
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
    width: 100%;
    max-width: 100%;
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
  .dimension-filter-grid {
    grid-template-columns: 1fr;
  }
  .curated-heading {
    align-items: flex-start;
    flex-direction: column;
  }
  .query-bound {
    text-align: left;
  }
  .curated-grid,
  .curated-grid.health-spine {
    grid-template-columns: 1fr;
  }
  .curated-widget,
  .health-spine .curated-widget {
    min-height: 132px;
  }
  .filter-bar :deep(.p-button) {
    width: 100%;
  }
  .readiness-strip {
    grid-template-columns: 1fr 1fr;
  }
  .source-matrix-grid {
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
