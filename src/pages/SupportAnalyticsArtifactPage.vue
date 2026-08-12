<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import Drawer from 'primevue/drawer';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import { useAuthStore } from '@/features/auth/auth.store';
import { supportOperatorPresentationSource } from '@/features/support-quality/api/support-operator-presentation-source';
import { supportDashboardShareTeamSource } from '@/features/support-analytics/api/support-dashboard-share-team-source';
import { supportAnalyticsDrilldownTarget } from '@/features/support-analytics/model/support-analytics-drilldown';
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
  DashboardShareTeamOptionDto,
  DashboardDraftResponseDto,
  ReportingDrilldownPageResponseDto,
  ReportingResultRowDto,
  SavedReportRevisionResponseDto,
  SavedReportDraftResponseDto,
  SupportOperatorPresentationSummaryDto,
  DashboardShellResponseDto,
  DashboardShareCatalogItemDto,
} from '@/shared/api/generated/models';
import { ApiError } from '@/shared/api/http/api-error';
import PageLoadingSwap from '@/shared/ui/PageLoadingSwap.vue';
import SupportDataWorkbenchSkeleton from '@/features/support-quality/ui/SupportDataWorkbenchSkeleton.vue';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const report = ref<SupportSavedArtifact | null>(null);
const dashboard = ref<SupportDashboardArtifact | null>(null);
const result = ref<ReportingQueryResultResponseDto | null>(null);
const drilldown = ref<ReportingDrilldownPageResponseDto | null>(null);
const drilldownLoading = ref(false);
const loading = ref(true);
const error = ref('');
const notice = ref('');
const acting = ref(false);
const revisions = ref<SavedReportRevisionResponseDto[]>([]);
const dashboardRevisions = ref<DashboardShellResponseDto[]>([]);
const historyBefore = ref<number | null>(null);
const historyLoading = ref(false);
const shareTarget = ref('');
const shareKind = ref<'CMS_USER' | 'TEAM' | 'PROJECT'>('CMS_USER');
const shareId = ref('');
const activeShares = ref<DashboardShareCatalogItemDto[]>([]);
const nextShareCursor = ref<string>();
const operatorCatalog = ref<SupportOperatorPresentationSummaryDto[]>([]);
const teamCatalog = ref<DashboardShareTeamOptionDto[]>([]);
const operatorCatalogError = ref('');
const diagnosticsOpen = ref(false);
const reportDraft = ref<SavedReportDraftResponseDto | null>(null);
const dashboardDraft = ref<DashboardDraftResponseDto | null>(null);
const draftName = ref('');
const draftDescription = ref('');
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
const canPublishDashboard = computed(() =>
  (auth.project?.effectivePermissionCodes ?? []).includes('project.dashboards.publish'),
);
const canEditCurrentArtifact = computed(() =>
  isDashboard.value
    ? Boolean(dashboardDraft.value?.allowedActions.includes('EDIT'))
    : Boolean(reportDraft.value?.allowedActions.includes('EDIT')),
);
const canPublishCurrentArtifact = computed(() =>
  isDashboard.value
    ? canPublishDashboard.value && Boolean(dashboardDraft.value?.allowedActions.includes('PUBLISH'))
    : Boolean(reportDraft.value?.allowedActions.includes('PUBLISH')),
);
const canShare = computed(() =>
  (auth.project?.effectivePermissionCodes ?? []).includes('project.dashboards.share'),
);
const shareKindOptions = [
  { label: 'Пользователь', value: 'CMS_USER' as const },
  { label: 'Команда', value: 'TEAM' as const },
  { label: 'Весь проект', value: 'PROJECT' as const },
];

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
  dashboardRevisions.value = [];
  historyBefore.value = null;
  historyLoading.value = false;
  shareTarget.value = '';
  shareId.value = '';
  activeShares.value = [];
  nextShareCursor.value = undefined;
  shareKind.value = 'CMS_USER';
  teamCatalog.value = [];
  diagnosticsOpen.value = false;
  reportDraft.value = null;
  dashboardDraft.value = null;
  acting.value = false;
  notice.value = '';
  error.value = '';
}

function isConcealedResponse(cause: unknown): cause is ApiError {
  return cause instanceof ApiError && (cause.status === 403 || cause.status === 404);
}

function refreshAuthority(): void {
  void auth.refreshContext().catch(() => undefined);
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
    const teams = await supportDashboardShareTeamSource.list(
      scopeProjectId,
      undefined,
      undefined,
      signal,
    );
    if (
      signal.aborted ||
      generation !== operatorCatalogGeneration ||
      auth.project?.id !== scopeProjectId ||
      route.fullPath !== scopeRoute ||
      !canShare.value
    )
      return;
    teamCatalog.value = teams.items;
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
  const initialLoad = !report.value && !dashboard.value;
  if (!projectId || !canRead.value) {
    clearArtifactState();
    loading.value = false;
    return;
  }
  if (initialLoad) clearArtifactState();
  else {
    drilldown.value = null;
    error.value = '';
  }
  loading.value = initialLoad;
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
      if (canShare.value) {
        const shares = await supportAnalyticsArtifactSource.listDashboardShares(
          projectId,
          nextDashboard.dashboardId,
        );
        if (generation !== loadGeneration || signal.aborted || !canShare.value) return;
        activeShares.value = shares.items;
        nextShareCursor.value = shares.nextBeforeShareId;
      }
    } else {
      const nextReport = await supportAnalyticsArtifactSource.readReport(
        projectId,
        String(route.params.reportId),
        signal,
      );
      if (generation !== loadGeneration || signal.aborted || !canRead.value) return;
      report.value = nextReport;
    }
    const history = isDashboard.value
      ? await supportAnalyticsArtifactSource.dashboardHistory(
          projectId,
          dashboard.value!.dashboardId,
        )
      : await supportAnalyticsArtifactSource.reportHistory(projectId, report.value.savedReportId);
    if (generation !== loadGeneration || signal.aborted || !canRead.value) return;
    if (isDashboard.value) {
      dashboardRevisions.value = history.items as DashboardShellResponseDto[];
      revisions.value = [];
      historyBefore.value = null;
    } else {
      revisions.value = history.items as SavedReportRevisionResponseDto[];
      historyBefore.value = nextHistoryBefore(revisions.value);
    }
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
    if (canAuthor.value) {
      try {
        const nextReportDraft = await supportAnalyticsArtifactSource.readReportDraft(
          projectId,
          report.value.savedReportId,
          signal,
        );
        const nextDashboardDraft =
          isDashboard.value && dashboard.value
            ? await supportAnalyticsArtifactSource.readDashboardDraft(
                projectId,
                dashboard.value.dashboardId,
                signal,
              )
            : null;
        if (generation !== loadGeneration || signal.aborted || !canAuthor.value) return;
        reportDraft.value = nextReportDraft;
        dashboardDraft.value = nextDashboardDraft;
        draftName.value = (nextDashboardDraft ?? nextReportDraft).document.name;
        draftDescription.value = (nextDashboardDraft ?? nextReportDraft).document.description ?? '';
      } catch {
        // An absent authoring draft does not hide the last published revision.
      }
    }
  } catch (cause) {
    if (!signal.aborted && generation === loadGeneration) {
      if (isConcealedResponse(cause)) {
        clearArtifactState();
        error.value = 'Артефакт недоступен. Полномочия и состояние проекта обновляются.';
        refreshAuthority();
      } else error.value = cause instanceof Error ? cause.message : 'Артефакт недоступен';
    }
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
    if (actionInScope(scope)) {
      if (isConcealedResponse(cause)) {
        revisions.value = [];
        historyBefore.value = null;
        error.value = 'История ревизий недоступна. Полномочия обновляются.';
        refreshAuthority();
      } else error.value = cause instanceof Error ? cause.message : 'Не удалось загрузить историю';
    }
  } finally {
    if (actionInScope(scope)) historyLoading.value = false;
  }
}
function drilldownParams(row: ReportingResultRowDto, cell: ReportingMetricCellDto) {
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
async function openDrilldown(
  row: ReportingResultRowDto,
  cell: ReportingMetricCellDto,
): Promise<void> {
  const scope = actionScope();
  if (!scope || !result.value?.runId || cell.state !== 'VALUE') return;
  drilldownLoading.value = true;
  try {
    const next = await supportAnalyticsSource.drilldown(
      scope.projectId,
      result.value.runId,
      drilldownParams(row, cell),
      controller?.signal,
    );
    if (actionInScope(scope) && canRead.value) drilldown.value = next;
  } catch (cause) {
    if (actionInScope(scope)) {
      if (isConcealedResponse(cause)) {
        drilldown.value = null;
        error.value = 'Детализация недоступна. Полномочия обновляются.';
        refreshAuthority();
      } else error.value = cause instanceof Error ? cause.message : 'Детализация недоступна';
    }
  } finally {
    if (actionInScope(scope)) drilldownLoading.value = false;
  }
}
async function loadMoreDrilldown(): Promise<void> {
  const scope = actionScope();
  const current = drilldown.value;
  if (!scope || !current?.nextCursor || !result.value?.runId || drilldownLoading.value) return;
  drilldownLoading.value = true;
  try {
    const next = await supportAnalyticsSource.drilldown(
      scope.projectId,
      result.value.runId,
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
      controller?.signal,
    );
    if (actionInScope(scope))
      drilldown.value = { ...next, items: [...current.items, ...next.items] };
  } finally {
    if (actionInScope(scope)) drilldownLoading.value = false;
  }
}
function drilldownSubjectLabel(kind: string): string {
  return kind === 'CASE' ? 'Обращения' : 'Проверки качества';
}
function drilldownDimensionLabel(code: string): string {
  return (
    (
      {
        TEAM: 'Команда',
        QUEUE: 'Очередь',
        CHANNEL: 'Канал',
        LOCALE: 'Язык',
        CATEGORY: 'Категория',
        PRIORITY: 'Приоритет',
        QUALITY_ITEM: 'Критерий',
        SCORECARD_REVISION: 'Версия карты оценки',
      } as Record<string, string>
    )[code] ?? 'Группа'
  );
}
function drilldownGroupLabel(value: string | null | undefined): string {
  if (!value || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value)) return 'Выбранная группа';
  return value;
}
async function resetDrilldown(): Promise<void> {
  const scope = actionScope();
  const current = drilldown.value;
  if (!scope || !current || drilldownLoading.value) return;
  drilldownLoading.value = true;
  try {
    const next = await supportAnalyticsSource.drilldown(
      scope.projectId,
      current.reset.runId,
      { metricCode: current.reset.metricCode, limit: 50 },
      controller?.signal,
    );
    if (actionInScope(scope) && canRead.value) drilldown.value = next;
  } finally {
    if (actionInScope(scope)) drilldownLoading.value = false;
  }
}
function openDrilldownSubject(index: number): void {
  const subject = drilldown.value?.items[index];
  if (!subject) return;
  const target = supportAnalyticsDrilldownTarget(subject);
  if (target) void router.push(target);
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
    if (actionInScope(scope) && canAuthor.value) {
      result.value = null;
      drilldown.value = null;
      notice.value = 'Отчёт архивирован; новые runs для него запрещены.';
    }
  } finally {
    if (actionInScope(scope)) acting.value = false;
  }
}
async function archiveDashboard(): Promise<void> {
  const scope = actionScope();
  const current = dashboard.value;
  if (!scope?.dashboardId || !current || !canAuthor.value) return;
  acting.value = true;
  try {
    await supportAnalyticsArtifactSource.archiveDashboard(
      scope.projectId,
      scope.dashboardId,
      dashboardDraft.value?.version ?? current.revision,
    );
    if (actionInScope(scope)) {
      result.value = null;
      drilldown.value = null;
      dashboardDraft.value = null;
      notice.value = 'Панель архивирована; новые запуски остановлены.';
    }
  } finally {
    if (actionInScope(scope)) acting.value = false;
  }
}
async function saveRevisionDraft(): Promise<void> {
  const scope = actionScope();
  if (
    !scope ||
    !reportDraft.value ||
    !draftName.value.trim() ||
    !canAuthor.value ||
    !canEditCurrentArtifact.value
  )
    return;
  acting.value = true;
  try {
    if (isDashboard.value && dashboardDraft.value) {
      await supportAnalyticsArtifactSource.updateDashboardDraft(
        scope.projectId,
        scope.dashboardId,
        {
          ...dashboardDraft.value.document,
          name: draftName.value.trim(),
          description: draftDescription.value.trim(),
        },
      );
    } else {
      await supportAnalyticsArtifactSource.updateReportDraft(scope.projectId, scope.reportId, {
        ...reportDraft.value.document,
        name: draftName.value.trim(),
        description: draftDescription.value.trim(),
      });
    }
    if (!actionInScope(scope)) return;
    notice.value = 'Изменения сохранены в черновике новой ревизии.';
    acting.value = false;
    await load();
  } finally {
    if (actionInScope(scope)) acting.value = false;
  }
}
async function publishRevisionDraft(): Promise<void> {
  const scope = actionScope();
  const current = report.value;
  if (
    !scope ||
    !current ||
    !reportDraft.value ||
    !canAuthor.value ||
    !canPublishCurrentArtifact.value
  )
    return;
  acting.value = true;
  try {
    if (isDashboard.value && dashboardDraft.value) {
      await supportAnalyticsArtifactSource.publishDashboard(scope.projectId, scope.dashboardId);
    } else {
      await supportAnalyticsArtifactSource.publishReport(scope.projectId, {
        savedReportId: scope.reportId,
        draftVersion: reportDraft.value.draftVersion,
        name: reportDraft.value.document.name,
        description: reportDraft.value.document.description ?? '',
        query: current.query,
      });
    }
    if (!actionInScope(scope)) return;
    notice.value = 'Новая ревизия опубликована.';
    acting.value = false;
    await load();
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
    const shares = await supportAnalyticsArtifactSource.listDashboardShares(
      scope.projectId,
      scope.dashboardId,
    );
    if (!actionInScope(scope) || !canShare.value) return;
    activeShares.value = shares.items;
    nextShareCursor.value = shares.nextBeforeShareId;
    notice.value = 'Доступ выдан.';
  } finally {
    if (actionInScope(scope)) acting.value = false;
  }
}
async function revokeShare(selectedShareId = shareId.value): Promise<void> {
  const scope = actionScope();
  const currentShareId = selectedShareId;
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
    activeShares.value = activeShares.value.filter((item) => item.shareId !== currentShareId);
  } finally {
    if (actionInScope(scope)) acting.value = false;
  }
}
async function loadMoreShares(): Promise<void> {
  const scope = actionScope();
  const cursor = nextShareCursor.value;
  if (!scope?.dashboardId || !cursor || acting.value || !canShare.value) return;
  acting.value = true;
  try {
    const page = await supportAnalyticsArtifactSource.listDashboardShares(
      scope.projectId,
      scope.dashboardId,
      cursor,
    );
    if (!actionInScope(scope) || !canShare.value) return;
    const known = new Set(activeShares.value.map((item) => item.shareId));
    activeShares.value.push(...page.items.filter((item) => !known.has(item.shareId)));
    nextShareCursor.value = page.nextBeforeShareId;
  } finally {
    if (actionInScope(scope)) acting.value = false;
  }
}
function shareTargetLabel(item: DashboardShareCatalogItemDto): string {
  if (item.target.kind === 'PROJECT') return 'Весь проект';
  if (item.target.kind === 'TEAM')
    return teamCatalog.value.find((team) => team.id === item.target.id)?.name ?? 'Команда проекта';
  return (
    operatorCatalog.value.find((operator) => operator.cmsUserId === item.target.id)?.displayName ??
    'Участник проекта'
  );
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
function completenessLabel(value: string | undefined): string {
  return value === 'COMPLETE'
    ? 'Полные данные'
    : value === 'PARTIAL'
      ? 'Частичные данные'
      : (value ?? '—');
}
function artifactRevisionKey(
  revision: SavedReportRevisionResponseDto | DashboardShellResponseDto,
): string {
  if ('dashboardRevisionId' in revision) return revision.dashboardRevisionId;
  if ('savedReportRevisionId' in revision) return revision.savedReportRevisionId;
  return `revision-${(revision as { revision: number }).revision}`;
}
function artifactRevisionName(
  revision: SavedReportRevisionResponseDto | DashboardShellResponseDto,
): string {
  return revision.document?.name ?? 'Опубликованный снимок';
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
  <PageLoadingSwap :loading="loading">
    <template #loading><SupportDataWorkbenchSkeleton kind="artifact" /></template>
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
          <div><span>Состояние</span><strong class="compact">Опубликован</strong></div>
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
                    {{
                      row.day ??
                      Object.values(row.dimensions ?? {})
                        .filter(Boolean)
                        .join(' · ') ??
                      `Строка ${index + 1}`
                    }}
                  </td>
                  <td v-for="cell in row.metrics" :key="cell.code">
                    <button
                      type="button"
                      class="drilldown-link"
                      :disabled="drilldownLoading || cell.state !== 'VALUE'"
                      :aria-label="`Показать объекты для ${cell.code}`"
                      @click="openDrilldown(row, cell)"
                    >
                      {{ cellValue(cell) }} <i class="pi pi-angle-right" />
                    </button>
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
        <section class="surface artifact-controls">
          <div>
            <strong>История ревизий</strong>
            <span
              >{{ isDashboard ? dashboardRevisions.length : revisions.length }} опубликованных
              снимков</span
            >
          </div>
          <ol
            v-if="isDashboard ? dashboardRevisions.length : revisions.length"
            class="revision-list"
          >
            <li
              v-for="revision in isDashboard ? dashboardRevisions : revisions"
              :key="artifactRevisionKey(revision)"
            >
              <strong>Версия {{ revision.revision }}</strong>
              <span>{{ artifactRevisionName(revision) }}</span>
            </li>
          </ol>
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
              :options="shareKindOptions"
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
            <Select
              v-else-if="shareKind === 'TEAM'"
              v-model="shareTarget"
              :options="teamCatalog"
              option-label="name"
              option-value="id"
              filter
              filter-placeholder="Найти команду"
              placeholder="Выберите команду"
              aria-label="Команда проекта"
            />
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
              @click="revokeShare()"
            />
            <ul v-if="activeShares.length" class="share-list" aria-label="Активные доступы">
              <li v-for="item in activeShares" :key="item.shareId">
                <span>{{ shareTargetLabel(item) }}</span>
                <Button
                  label="Отозвать"
                  severity="danger"
                  text
                  size="small"
                  :loading="acting"
                  @click="revokeShare(item.shareId)"
                />
              </li>
            </ul>
            <Button
              v-if="nextShareCursor"
              label="Показать ещё доступы"
              severity="secondary"
              text
              :loading="acting"
              @click="loadMoreShares"
            />
            <Button
              v-if="canAuthor"
              label="Архивировать панель"
              icon="pi pi-box"
              severity="secondary"
              text
              :loading="acting"
              @click="archiveDashboard"
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
        <section
          v-if="canAuthor && reportDraft"
          class="surface revision-workbench"
          aria-labelledby="revision-workbench-title"
        >
          <header>
            <div>
              <span class="eyebrow">Черновик новой ревизии</span>
              <h2 id="revision-workbench-title">Подготовка публикации</h2>
              <p>Опубликованный снимок остаётся неизменным, пока вы не завершите второй шаг.</p>
            </div>
            <Tag :value="`Версия черновика ${reportDraft.draftVersion}`" severity="secondary" />
          </header>
          <div class="revision-fields">
            <label>
              Название
              <input v-model="draftName" maxlength="200" />
            </label>
            <label>
              Описание
              <input v-model="draftDescription" maxlength="1000" />
            </label>
          </div>
          <div v-if="dashboardDraft" class="staged-widgets">
            <strong>Подготовленные элементы</strong>
            <span>
              {{
                dashboardDraft.document.pages.reduce(
                  (total, page) =>
                    total + page.tabs.reduce((sum, tab) => sum + tab.widgets.length, 0),
                  0,
                )
              }}
              · {{ dashboardDraft.document.pages.length }} стр.
            </span>
          </div>
          <footer>
            <Button
              label="Сохранить черновик"
              icon="pi pi-save"
              severity="secondary"
              outlined
              :loading="acting"
              :disabled="!draftName.trim() || !canEditCurrentArtifact"
              @click="saveRevisionDraft"
            />
            <Button
              label="Опубликовать новую ревизию"
              icon="pi pi-check"
              :loading="acting"
              :disabled="!canPublishCurrentArtifact"
              @click="publishRevisionDraft"
            />
          </footer>
        </section>
      </template>
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
            {{ drilldownDimensionLabel(drilldown.breadcrumb.dimensionCode) }}:
            {{ drilldownGroupLabel(drilldown.breadcrumb.dimensionValue) }}
          </span>
          <span v-else>{{ drilldownSubjectLabel(drilldown.breadcrumb.subjectKind) }}</span>
        </nav>
        <p class="drilldown-copy">
          Сервер повторно проверил полномочия и вернул только доступные объекты.
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
        v-if="diagnosticsOpen && report"
        v-model:visible="diagnosticsOpen"
        modal
        header="Технические сведения"
        :style="{ width: 'min(36rem, calc(100vw - 2rem))' }"
      >
        <dl class="artifact-diagnostics">
          <div>
            <dt>Ревизия отчёта</dt>
            <dd>{{ report.revision }}</dd>
          </div>
          <div>
            <dt>Идентификатор ревизии</dt>
            <dd>{{ report.savedReportRevisionId }}</dd>
          </div>
          <div>
            <dt>Отпечаток запроса</dt>
            <dd>{{ report.queryDefinitionHash }}</dd>
          </div>
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
  </PageLoadingSwap>
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
.revision-list {
  min-width: min(24rem, 100%);
  max-height: 9rem;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 1px;
  list-style: none;
  border: 1px solid var(--p-content-border-color);
  border-radius: 8px;
  overflow: auto;
}
.revision-list li {
  padding: 7px 9px;
  display: flex;
  justify-content: space-between;
  gap: 10px;
  background: var(--p-content-background);
  font-size: 0.74rem;
}
.share-list {
  min-width: min(21rem, 100%);
  max-height: 11rem;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 1px;
  list-style: none;
  border: 1px solid var(--p-content-border-color);
  border-radius: 8px;
  overflow: auto;
}
.share-list li {
  min-height: 42px;
  padding: 4px 5px 4px 9px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: var(--p-content-background);
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
.revision-workbench {
  padding: 16px;
  display: grid;
  gap: 16px;
}
.revision-workbench > header,
.revision-workbench > footer,
.staged-widgets {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.revision-workbench h2,
.revision-workbench p {
  margin: 0;
}
.revision-workbench p,
.staged-widgets span {
  color: var(--p-text-muted-color);
  font-size: 0.78rem;
}
.revision-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.revision-fields label {
  display: grid;
  gap: 6px;
  font-size: 0.78rem;
  font-weight: 650;
}
.revision-fields input {
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid var(--p-content-border-color);
  border-radius: 8px;
  color: inherit;
  background: var(--p-form-field-background);
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
  .revision-fields {
    grid-template-columns: minmax(0, 1fr);
  }
  .revision-workbench > header,
  .revision-workbench > footer {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
