<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import Button from "primevue/button";
import Message from "primevue/message";
import Skeleton from "primevue/skeleton";
import { useAuthStore } from "@/features/auth/auth.store";
import { hasProjectPermission } from "@/features/auth/permission-access";
import { projectAIAnalysesRepository } from "@/features/project-ai-analyses/api/project-ai-analyses-repository";
import AIAnalysisCard from "@/features/project-ai-analyses/ui/AIAnalysisCard.vue";
import AIAnalysisDetailPanel from "@/features/project-ai-analyses/ui/AIAnalysisDetailPanel.vue";
import AIAnalysisFilters, {
  type AIAnalysisFiltersModel,
} from "@/features/project-ai-analyses/ui/AIAnalysisFilters.vue";
import type {
  ProjectAIAnalysisDetailResponseDto,
  ProjectAIAnalysisListItemDto,
} from "@/shared/api/generated/models";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const items = ref<ProjectAIAnalysisListItemDto[]>([]);
const detail = ref<ProjectAIAnalysisDetailResponseDto | null>(null);
const filters = ref<AIAnalysisFiltersModel>({});
const nextCursor = ref<string | null>(null);
const loading = ref(false);
const loadingMore = ref(false);
const detailLoading = ref(false);
const cancelling = ref(false);
const error = ref("");
const detailError = ref("");
let generation = 0;
let listGeneration = 0;
let detailGeneration = 0;
let listRefreshTimer: number | null = null;
let detailRefreshTimer: number | null = null;
let loadedPageCount = 1;
let mounted = false;
const FAST_REFRESH_INTERVAL_MS = 15_000;
const MAX_SCHEDULE_REFRESH_INTERVAL_MS = 60 * 60 * 1_000;
const MAX_AUTO_REFRESH_PAGES = 5;
interface CancelTarget {
  projectId: string;
  analysisId: string;
  version: number;
}
interface CancellationAttempt extends CancelTarget {
  idempotencyKey: string;
}
interface RefreshableSchedule {
  state: string;
  nextRunAt?: string | null;
  runAt?: string | null;
}
let cancellationAttempt: CancellationAttempt | null = null;

const projectId = computed(() => auth.project?.id ?? null);
const analysisId = computed(() =>
  typeof route.params.analysisId === "string" ? route.params.analysisId : null,
);
const canReadCost = computed(() =>
  hasProjectPermission(
    auth.project?.effectivePermissionCodes ?? [],
    "project.ai_analysis_cost.read",
  ),
);
const canManage = computed(() =>
  hasProjectPermission(
    auth.project?.effectivePermissionCodes ?? [],
    "project.ai_analyses.manage",
  ),
);

function scheduleRefreshDelay(
  schedule: RefreshableSchedule | null | undefined,
): number | null {
  if (!schedule) return null;
  if (schedule.state === "CLAIMED") return FAST_REFRESH_INTERVAL_MS;
  if (schedule.state !== "ACTIVE") return null;
  const nextRunAt = schedule.nextRunAt ?? schedule.runAt;
  if (!nextRunAt) return MAX_SCHEDULE_REFRESH_INTERVAL_MS;
  const timestamp = Date.parse(nextRunAt);
  if (!Number.isFinite(timestamp)) return MAX_SCHEDULE_REFRESH_INTERVAL_MS;
  return Math.min(
    MAX_SCHEDULE_REFRESH_INTERVAL_MS,
    Math.max(FAST_REFRESH_INTERVAL_MS, timestamp - Date.now() + 1_000),
  );
}

function minimumRefreshDelay(delays: Array<number | null>): number | null {
  const activeDelays = delays.filter(
    (delay): delay is number => delay !== null,
  );
  return activeDelays.length > 0 ? Math.min(...activeDelays) : null;
}

function listRefreshDelay(): number | null {
  if (loadedPageCount > MAX_AUTO_REFRESH_PAGES) return null;
  return minimumRefreshDelay(
    items.value.flatMap((item) => [
      ["QUEUED", "RUNNING"].includes(item.latestRun?.status ?? "")
        ? FAST_REFRESH_INTERVAL_MS
        : null,
      scheduleRefreshDelay(item.schedule),
    ]),
  );
}

function detailRefreshDelay(): number | null {
  const value = detail.value;
  if (!value || value.analysis.compatibility?.readOnly) return null;
  return minimumRefreshDelay([
    ["QUEUED", "RUNNING"].includes(value.runs[0]?.status ?? "")
      ? FAST_REFRESH_INTERVAL_MS
      : null,
    scheduleRefreshDelay(value.schedule),
  ]);
}

async function loadList(
  append = false,
  preserveExpandedWindow = false,
  silent = false,
): Promise<void> {
  const currentProjectId = projectId.value;
  if (!currentProjectId) return;
  if (append && (loading.value || loadingMore.value)) return;
  if (append && !nextCursor.value) return;
  const requestGeneration = generation;
  const requestListGeneration = ++listGeneration;
  const requestedPageCount = preserveExpandedWindow ? loadedPageCount : 1;
  const requestFilters = { ...filters.value };
  const appendCursor = append ? nextCursor.value : null;
  if (append) loadingMore.value = true;
  else if (!silent) loading.value = true;
  if (!silent) error.value = "";
  try {
    let page = await projectAIAnalysesRepository.list(currentProjectId, {
      limit: 30,
      ...requestFilters,
      ...(appendCursor ? { cursor: appendCursor } : {}),
    });
    const refreshedItems = [...page.items];
    let refreshedPageCount = 1;
    let refreshedNextCursor = page.nextCursor ?? null;
    while (
      !append &&
      preserveExpandedWindow &&
      refreshedPageCount < requestedPageCount &&
      refreshedNextCursor
    ) {
      if (
        requestGeneration !== generation ||
        requestListGeneration !== listGeneration ||
        projectId.value !== currentProjectId
      )
        return;
      page = await projectAIAnalysesRepository.list(currentProjectId, {
        limit: 30,
        ...requestFilters,
        cursor: refreshedNextCursor,
      });
      refreshedItems.push(...page.items);
      refreshedPageCount += 1;
      refreshedNextCursor = page.nextCursor ?? null;
    }
    if (
      requestGeneration !== generation ||
      requestListGeneration !== listGeneration ||
      projectId.value !== currentProjectId
    )
      return;
    if (append) {
      items.value = [...items.value, ...page.items];
      loadedPageCount += 1;
      nextCursor.value = page.nextCursor ?? null;
    } else {
      items.value = refreshedItems;
      loadedPageCount = refreshedPageCount;
      nextCursor.value = refreshedNextCursor;
    }
  } catch (cause) {
    if (
      requestGeneration !== generation ||
      requestListGeneration !== listGeneration ||
      projectId.value !== currentProjectId
    )
      return;
    if (silent) return;
    error.value =
      cause instanceof Error ? cause.message : "Не удалось загрузить анализы";
  } finally {
    if (
      requestGeneration === generation &&
      requestListGeneration === listGeneration
    ) {
      if (append) loadingMore.value = false;
      else if (!silent) loading.value = false;
    }
  }
}

async function loadDetail(silent = false): Promise<void> {
  const requestDetailGeneration = ++detailGeneration;
  const currentProjectId = projectId.value;
  const currentAnalysisId = analysisId.value;
  if (!currentProjectId || !currentAnalysisId) {
    detail.value = null;
    detailError.value = "";
    return;
  }
  const requestGeneration = generation;
  if (!silent) detailLoading.value = true;
  if (!silent) detailError.value = "";
  try {
    const response = await projectAIAnalysesRepository.detail(
      currentProjectId,
      currentAnalysisId,
    );
    if (
      requestGeneration !== generation ||
      requestDetailGeneration !== detailGeneration ||
      projectId.value !== currentProjectId ||
      analysisId.value !== currentAnalysisId
    )
      return;
    detail.value = response;
  } catch (cause) {
    if (
      requestGeneration !== generation ||
      requestDetailGeneration !== detailGeneration ||
      projectId.value !== currentProjectId ||
      analysisId.value !== currentAnalysisId
    )
      return;
    if (silent) return;
    detail.value = null;
    detailError.value =
      cause instanceof Error
        ? cause.message
        : "Не удалось загрузить детали анализа";
  } finally {
    if (
      requestGeneration === generation &&
      requestDetailGeneration === detailGeneration &&
      projectId.value === currentProjectId &&
      analysisId.value === currentAnalysisId &&
      !silent
    )
      detailLoading.value = false;
  }
}

function clearListRefreshTimer(): void {
  if (listRefreshTimer === null) return;
  window.clearTimeout(listRefreshTimer);
  listRefreshTimer = null;
}

function clearDetailRefreshTimer(): void {
  if (detailRefreshTimer === null) return;
  window.clearTimeout(detailRefreshTimer);
  detailRefreshTimer = null;
}

function clearRefreshTimers(): void {
  clearListRefreshTimer();
  clearDetailRefreshTimer();
}

function scheduleListRefresh(): void {
  clearListRefreshTimer();
  const delay = listRefreshDelay();
  if (!mounted || document.visibilityState !== "visible" || delay === null)
    return;
  listRefreshTimer = window.setTimeout(async () => {
    listRefreshTimer = null;
    if (loadingMore.value) {
      scheduleListRefresh();
      return;
    }
    await loadList(false, loadedPageCount > 1, true);
    scheduleListRefresh();
  }, delay);
}

function scheduleDetailRefresh(): void {
  clearDetailRefreshTimer();
  const delay = detailRefreshDelay();
  if (!mounted || document.visibilityState !== "visible" || delay === null)
    return;
  detailRefreshTimer = window.setTimeout(async () => {
    detailRefreshTimer = null;
    await loadDetail(true);
    scheduleDetailRefresh();
  }, delay);
}

function scheduleRefresh(): void {
  scheduleListRefresh();
  scheduleDetailRefresh();
}

async function refreshVisibleAnalyses(): Promise<void> {
  clearRefreshTimers();
  if (!mounted || document.visibilityState !== "visible") return;
  await Promise.all([
    loadingMore.value || listRefreshDelay() === null
      ? Promise.resolve()
      : loadList(false, loadedPageCount > 1, true),
    detailRefreshDelay() === null ? Promise.resolve() : loadDetail(true),
  ]);
  scheduleRefresh();
}

async function refreshAnalyses(): Promise<void> {
  clearRefreshTimers();
  loadedPageCount = 1;
  await Promise.all([loadList(), loadDetail()]);
  scheduleRefresh();
}

function handleVisibilityChange(): void {
  if (document.visibilityState === "visible") void refreshVisibleAnalyses();
  else clearRefreshTimers();
}

async function applyFilters(): Promise<void> {
  clearListRefreshTimer();
  loadedPageCount = 1;
  nextCursor.value = null;
  await loadList();
  scheduleListRefresh();
}

async function loadMore(): Promise<void> {
  clearListRefreshTimer();
  try {
    await loadList(true);
  } finally {
    scheduleListRefresh();
  }
}

async function cancelAnalysis(target: CancelTarget): Promise<void> {
  const currentProjectId = projectId.value;
  const currentAnalysisId = analysisId.value;
  if (
    !currentProjectId ||
    !currentAnalysisId ||
    target.projectId !== currentProjectId ||
    target.analysisId !== currentAnalysisId ||
    target.version !== detail.value?.analysis.version ||
    !canManage.value
  )
    return;
  if (
    !cancellationAttempt ||
    cancellationAttempt.projectId !== target.projectId ||
    cancellationAttempt.analysisId !== target.analysisId ||
    cancellationAttempt.version !== target.version
  ) {
    cancellationAttempt = {
      ...target,
      idempotencyKey: crypto.randomUUID(),
    };
  }
  const attempt = cancellationAttempt;
  const requestGeneration = generation;
  cancelling.value = true;
  detailError.value = "";
  try {
    await projectAIAnalysesRepository.cancel(attempt);
    if (
      requestGeneration !== generation ||
      projectId.value !== currentProjectId ||
      analysisId.value !== currentAnalysisId
    )
      return;
    cancellationAttempt = null;
    await Promise.all([loadList(), loadDetail()]);
    scheduleRefresh();
  } catch (cause) {
    if (
      requestGeneration !== generation ||
      projectId.value !== currentProjectId ||
      analysisId.value !== currentAnalysisId
    )
      return;
    detailError.value =
      cause instanceof Error ? cause.message : "Не удалось отменить анализ";
  } finally {
    if (requestGeneration === generation) cancelling.value = false;
  }
}

async function focusDetail(): Promise<void> {
  await nextTick();
  document
    .querySelector<HTMLElement>('[data-testid="ai-analysis-detail"]')
    ?.focus();
}

async function closeDetail(): Promise<void> {
  const selectedId = analysisId.value;
  await router.push({ name: "ai-analyses" });
  await nextTick();
  if (selectedId)
    document
      .querySelector<HTMLElement>(
        `[data-analysis-id="${selectedId}"] .analysis-link`,
      )
      ?.focus();
}

watch(projectId, async () => {
  generation += 1;
  listGeneration += 1;
  loadedPageCount = 1;
  items.value = [];
  detail.value = null;
  nextCursor.value = null;
  filters.value = {};
  cancelling.value = false;
  cancellationAttempt = null;
  await Promise.all([loadList(), loadDetail()]);
  if (analysisId.value) await focusDetail();
  scheduleRefresh();
});
watch(analysisId, async (current, previous) => {
  if (current !== previous) cancellationAttempt = null;
  await loadDetail();
  if (current) await focusDetail();
  scheduleRefresh();
});
watch(canReadCost, async (allowed) => {
  if (allowed || !filters.value.costAttributedToCmsUserId) return;
  const safeFilters = { ...filters.value };
  delete safeFilters.costAttributedToCmsUserId;
  filters.value = safeFilters;
  loadedPageCount = 1;
  nextCursor.value = null;
  await loadList();
  scheduleRefresh();
});

onMounted(async () => {
  mounted = true;
  document.addEventListener("visibilitychange", handleVisibilityChange);
  await refreshAnalyses();
  if (analysisId.value) await focusDetail();
});
onBeforeUnmount(() => {
  mounted = false;
  clearRefreshTimers();
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  generation += 1;
  detailGeneration += 1;
});
</script>

<template>
  <main class="page analyses-page" :class="{ 'has-detail': analysisId }">
    <header class="page-header">
      <div>
        <div class="eyebrow">AI workspace</div>
        <h1>AI-анализы</h1>
        <p class="subtitle">
          Все разовые и отложенные запросы проекта: кто запустил, какие данные
          использованы, каков результат и, при наличии доступа, сколько это
          стоило.
        </p>
      </div>
      <div class="header-actions">
        <Button
          data-testid="refresh-ai-analyses"
          label="Обновить"
          icon="pi pi-refresh"
          severity="secondary"
          outlined
          :loading="loading || detailLoading"
          @click="refreshAnalyses"
        />
        <RouterLink
          v-if="
            hasProjectPermission(
              auth.project?.effectivePermissionCodes ?? [],
              'project.cms_agent.use',
            ) &&
            hasProjectPermission(
              auth.project?.effectivePermissionCodes ?? [],
              'project.ai_analyses.run',
            )
          "
          to="/overview"
          class="ask-link"
        >
          <i class="pi pi-sparkles" /> Новый запрос
        </RouterLink>
      </div>
    </header>

    <AIAnalysisFilters
      v-model="filters"
      :can-read-cost="canReadCost"
      :loading="loading || loadingMore"
      @apply="applyFilters"
    />

    <Message v-if="error" severity="error">
      <div class="error-row">
        <span>{{ error }}</span>
        <Button label="Повторить" text @click="loadList()" />
      </div>
    </Message>

    <div class="analyses-layout" :class="{ selected: analysisId }">
      <section class="analysis-list" aria-label="Список AI-анализов">
        <template v-if="loading">
          <Skeleton v-for="index in 4" :key="index" height="13rem" />
        </template>
        <div v-else-if="items.length === 0" class="empty-state">
          <span><i class="pi pi-sparkles" /></span>
          <h2>Анализов пока нет</h2>
          <p>
            Задайте Lola вопрос на странице обзора. Здесь появится прозрачная
            запись с результатом, источниками и атрибуцией.
          </p>
        </div>
        <AIAnalysisCard
          v-for="item in items"
          v-else
          :key="item.analysisId"
          :item="item"
          :project-id="projectId ?? undefined"
          :can-read-cost="canReadCost"
        />
        <Button
          v-if="nextCursor"
          label="Показать ещё"
          severity="secondary"
          outlined
          :loading="loadingMore"
          @click="loadMore"
        />
      </section>

      <AIAnalysisDetailPanel
        v-if="analysisId && projectId"
        :project-id="projectId"
        :detail="detail"
        :loading="detailLoading"
        :error="detailError"
        :can-manage="canManage"
        :can-read-cost="canReadCost"
        :cancelling="cancelling"
        @cancel="cancelAnalysis"
        @close="closeDetail"
      />
    </div>
  </main>
</template>

<style scoped>
.analyses-page {
  display: grid;
  gap: 18px;
}
.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
}
.eyebrow {
  color: var(--brand);
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
h1 {
  margin: 4px 0;
}
.subtitle {
  max-width: 720px;
  margin: 0;
  color: var(--muted);
  font-size: 0.82rem;
  line-height: 1.5;
}
.ask-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  color: var(--surface-emphasis);
  background: var(--brand);
  border-radius: 11px;
  font-size: 0.76rem;
  font-weight: 800;
  text-decoration: none;
  white-space: nowrap;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 9px;
}
.error-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.analyses-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 18px;
}
.analyses-layout.selected {
  grid-template-columns: minmax(310px, 0.86fr) minmax(420px, 1.14fr);
}
.analysis-list {
  display: grid;
  align-content: start;
  gap: 12px;
  min-width: 0;
}
.empty-state {
  display: grid;
  justify-items: center;
  padding: 60px 20px;
  text-align: center;
  background: var(--surface-card);
  border: 1px dashed var(--line);
  border-radius: 18px;
}
.empty-state > span {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  color: var(--brand);
  background: color-mix(in srgb, var(--brand) 10%, transparent);
  border-radius: 14px;
}
.empty-state h2 {
  margin: 14px 0 4px;
  font-size: 1rem;
}
.empty-state p {
  max-width: 460px;
  margin: 0;
  color: var(--muted);
  font-size: 0.76rem;
  line-height: 1.55;
}
@media (max-width: 1050px) {
  .analyses-layout.selected {
    grid-template-columns: 1fr;
  }
  .analyses-layout.selected :deep(.detail-panel) {
    order: -1;
  }
}
@media (max-width: 620px) {
  .page-header {
    align-items: flex-start;
    flex-direction: column;
  }
  .header-actions {
    width: 100%;
  }
  .analyses-page.has-detail :deep(.analysis-filters),
  .analyses-page.has-detail .analysis-list {
    display: none;
  }
}
</style>
