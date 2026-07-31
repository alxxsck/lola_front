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
import { projectAIOperationsRepository } from "@/features/project-ai-operations/api/project-ai-operations-repository";
import AIOperationCard from "@/features/project-ai-operations/ui/AIOperationCard.vue";
import AIOperationDetailPanel from "@/features/project-ai-operations/ui/AIOperationDetailPanel.vue";
import AIOperationFilters, {
  type AIOperationFiltersModel,
} from "@/features/project-ai-operations/ui/AIOperationFilters.vue";
import AIOperationSummary from "@/features/project-ai-operations/ui/AIOperationSummary.vue";
import type {
  AiOperationDetailResponseDto,
  AiOperationListItemDto,
  AiOperationPageInfoDto,
  AiOperationProtectedAccessPageResponseDto,
  AiOperationSubjectPageResponseDto,
  AiOperationSummaryResponseDto,
  AiOperationsSummaryParams,
} from "@/shared/api/generated/models";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const items = ref<AiOperationListItemDto[]>([]);
const pageInfo = ref<AiOperationPageInfoDto>({
  hasMore: false,
  nextCursor: null,
});
const summary = ref<AiOperationSummaryResponseDto | null>(null);
const detail = ref<AiOperationDetailResponseDto | null>(null);
const subjects = ref<AiOperationSubjectPageResponseDto | null>(null);
const accessHistory = ref<AiOperationProtectedAccessPageResponseDto | null>(
  null,
);
const filters = ref<AIOperationFiltersModel>(withBoundedDefaultPeriod({}));
const listLoading = ref(false);
const loadingMore = ref(false);
const summaryLoading = ref(false);
const detailLoading = ref(false);
const timelineLoading = ref(false);
const usageLoading = ref(false);
const subjectsLoading = ref(false);
const accessLoading = ref(false);
const listError = ref("");
const detailError = ref("");
let generation = 0;
let listGeneration = 0;
let summaryGeneration = 0;
let detailGeneration = 0;
let timelineGeneration = 0;
let usageGeneration = 0;
let subjectGeneration = 0;
let accessGeneration = 0;

const projectId = computed(() => auth.project?.id ?? null);
const operationId = computed(() =>
  typeof route.params.operationId === "string"
    ? route.params.operationId
    : null,
);
const permissionCodes = computed(
  () => auth.project?.effectivePermissionCodes ?? [],
);
const canReadOperations = computed(() =>
  hasProjectPermission(permissionCodes.value, "project.ai_operations.read"),
);
const canReadCost = computed(() =>
  hasProjectPermission(permissionCodes.value, "project.ai_analysis_cost.read"),
);
const canReadSubjects = computed(() =>
  hasProjectPermission(
    permissionCodes.value,
    "project.ai_operations.subjects.read",
  ),
);
const canReadAudit = computed(() =>
  hasProjectPermission(
    permissionCodes.value,
    "project.ai_operations.audit.read",
  ),
);
const canReadAnalysisResult = computed(() =>
  hasProjectPermission(permissionCodes.value, "project.ai_analyses.read"),
);
const canReadCaseResult = computed(() =>
  hasProjectPermission(permissionCodes.value, "project.cases.read"),
);
const canReadConversationResult = computed(() =>
  hasProjectPermission(permissionCodes.value, "project.profiles.read") &&
  hasProjectPermission(permissionCodes.value, "project.conversations.read"),
);

async function loadList(append = false): Promise<void> {
  const currentProjectId = projectId.value;
  if (!currentProjectId || !canReadOperations.value) return;
  if (append && (!pageInfo.value.nextCursor || loadingMore.value)) return;
  const requestGeneration = generation;
  const requestListGeneration = ++listGeneration;
  if (append) loadingMore.value = true;
  else listLoading.value = true;
  listError.value = "";
  try {
    const response = await projectAIOperationsRepository.list(
      currentProjectId,
      {
        limit: 30,
        ...filters.value,
        ...(append && pageInfo.value.nextCursor
          ? { cursor: pageInfo.value.nextCursor }
          : {}),
      },
    );
    if (
      requestGeneration !== generation ||
      requestListGeneration !== listGeneration ||
      projectId.value !== currentProjectId
    )
      return;
    items.value = append ? [...items.value, ...response.items] : response.items;
    pageInfo.value = response.pageInfo;
  } catch (cause) {
    if (
      requestGeneration !== generation ||
      requestListGeneration !== listGeneration ||
      projectId.value !== currentProjectId
    )
      return;
    listError.value =
      cause instanceof Error
        ? cause.message
        : "Не удалось загрузить журнал AI-операций";
  } finally {
    if (
      requestGeneration === generation &&
      requestListGeneration === listGeneration
    ) {
      listLoading.value = false;
      loadingMore.value = false;
    }
  }
}

async function loadSummary(): Promise<void> {
  const currentProjectId = projectId.value;
  if (!currentProjectId || !canReadOperations.value) return;
  const requestGeneration = generation;
  const requestSummaryGeneration = ++summaryGeneration;
  summaryLoading.value = true;
  listError.value = "";
  try {
    const response = await projectAIOperationsRepository.summary(
      currentProjectId,
      summaryParams(),
    );
    if (
      requestGeneration === generation &&
      requestSummaryGeneration === summaryGeneration &&
      projectId.value === currentProjectId
    )
      summary.value = response;
  } catch (cause) {
    if (
      requestGeneration === generation &&
      requestSummaryGeneration === summaryGeneration &&
      projectId.value === currentProjectId
    )
      listError.value =
        cause instanceof Error
          ? cause.message
          : "Не удалось загрузить сводку AI-операций";
  } finally {
    if (
      requestGeneration === generation &&
      requestSummaryGeneration === summaryGeneration
    )
      summaryLoading.value = false;
  }
}

function summaryParams(): AiOperationsSummaryParams {
  const value = filters.value;
  return {
    ...(value.initiatorType ? { initiatorType: value.initiatorType } : {}),
    ...(value.initiatorCmsUserId
      ? { initiatorCmsUserId: value.initiatorCmsUserId }
      : {}),
    ...(value.initiatorEndUserId
      ? { initiatorEndUserId: value.initiatorEndUserId }
      : {}),
    ...(value.status ? { status: value.status } : {}),
    ...(value.category ? { category: value.category } : {}),
    ...(value.authorizedByCmsUserId
      ? { authorizedByCmsUserId: value.authorizedByCmsUserId }
      : {}),
    ...(value.responsibleCmsUserId
      ? { responsibleCmsUserId: value.responsibleCmsUserId }
      : {}),
    ...(value.chargedEndUserId
      ? { chargedEndUserId: value.chargedEndUserId }
      : {}),
    ...(value.chargedAccount ? { chargedAccount: value.chargedAccount } : {}),
    ...(value.sourceKind ? { sourceKind: value.sourceKind } : {}),
    ...(value.sourceId ? { sourceId: value.sourceId } : {}),
    ...(value.provider ? { provider: value.provider } : {}),
    ...(value.providerResponseId
      ? { providerResponseId: value.providerResponseId }
      : {}),
    ...(value.eventCode ? { eventCode: value.eventCode } : {}),
    occurredFrom: value.occurredFrom!,
    occurredTo: value.occurredTo!,
  };
}

async function loadDetail(options?: {
  appendTimeline?: boolean;
  appendUsage?: boolean;
}): Promise<void> {
  const currentProjectId = projectId.value;
  const currentOperationId = operationId.value;
  if (!currentProjectId || !currentOperationId) {
    detail.value = null;
    return;
  }
  if (!canReadOperations.value) return;
  const requestGeneration = generation;
  const requestKind = options?.appendTimeline
    ? "timeline"
    : options?.appendUsage
      ? "usage"
      : "detail";
  if (requestKind === "timeline" && timelineLoading.value) return;
  if (requestKind === "usage" && usageLoading.value) return;
  const requestDetailGeneration =
    requestKind === "timeline"
      ? ++timelineGeneration
      : requestKind === "usage"
        ? ++usageGeneration
        : ++detailGeneration;
  if (requestKind === "detail") {
    timelineGeneration += 1;
    usageGeneration += 1;
  }
  if (requestKind === "detail") detailLoading.value = true;
  else if (requestKind === "timeline") timelineLoading.value = true;
  else usageLoading.value = true;
  detailError.value = "";
  try {
    const response = await projectAIOperationsRepository.detail(
      currentProjectId,
      currentOperationId,
      {
        limit: 50,
        usageLimit: 50,
        ...(options?.appendTimeline && detail.value?.timelinePageInfo.nextCursor
          ? { cursor: detail.value.timelinePageInfo.nextCursor }
          : {}),
        ...(options?.appendUsage && detail.value?.usage.pageInfo.nextCursor
          ? { usageCursor: detail.value.usage.pageInfo.nextCursor }
          : {}),
      },
    );
    if (
      requestGeneration !== generation ||
      !isCurrentDetailRequest(requestKind, requestDetailGeneration) ||
      projectId.value !== currentProjectId ||
      operationId.value !== currentOperationId
    )
      return;
    if (options?.appendTimeline && detail.value) {
      detail.value = {
        ...response,
        timeline: [...detail.value.timeline, ...response.timeline],
        usage: detail.value.usage,
      };
    } else if (options?.appendUsage && detail.value) {
      detail.value = {
        ...response,
        timeline: detail.value.timeline,
        timelinePageInfo: detail.value.timelinePageInfo,
        usage: {
          ...response.usage,
          attempts: [
            ...detail.value.usage.attempts,
            ...response.usage.attempts,
          ],
        },
      };
    } else {
      detail.value = response;
    }
  } catch (cause) {
    if (
      requestGeneration !== generation ||
      !isCurrentDetailRequest(requestKind, requestDetailGeneration) ||
      projectId.value !== currentProjectId ||
      operationId.value !== currentOperationId
    )
      return;
    detailError.value =
      cause instanceof Error
        ? cause.message
        : "Не удалось загрузить защищённые детали операции";
  } finally {
    if (
      requestGeneration === generation &&
      isCurrentDetailRequest(requestKind, requestDetailGeneration)
    )
      if (requestKind === "detail") detailLoading.value = false;
      else if (requestKind === "timeline") timelineLoading.value = false;
      else usageLoading.value = false;
  }
}

function isCurrentDetailRequest(
  kind: "detail" | "timeline" | "usage",
  requestGeneration: number,
): boolean {
  return (
    requestGeneration ===
    (kind === "timeline"
      ? timelineGeneration
      : kind === "usage"
        ? usageGeneration
        : detailGeneration)
  );
}

async function loadSubjects(append = false): Promise<void> {
  const currentProjectId = projectId.value;
  const currentOperationId = operationId.value;
  if (!currentProjectId || !currentOperationId || !canReadSubjects.value)
    return;
  if (subjectsLoading.value) return;
  if (append && !subjects.value?.pageInfo.nextCursor) return;
  const requestGeneration = generation;
  const requestSubjectGeneration = ++subjectGeneration;
  subjectsLoading.value = true;
  try {
    const response = await projectAIOperationsRepository.subjects(
      currentProjectId,
      currentOperationId,
      {
        limit: 50,
        ...(append && subjects.value?.pageInfo.nextCursor
          ? { cursor: subjects.value.pageInfo.nextCursor }
          : {}),
      },
    );
    if (
      requestGeneration !== generation ||
      requestSubjectGeneration !== subjectGeneration ||
      projectId.value !== currentProjectId ||
      operationId.value !== currentOperationId
    )
      return;
    subjects.value =
      append && subjects.value
        ? {
            ...response,
            items: [...subjects.value.items, ...response.items],
          }
        : response;
  } catch (cause) {
    if (
      requestGeneration === generation &&
      requestSubjectGeneration === subjectGeneration &&
      projectId.value === currentProjectId &&
      operationId.value === currentOperationId
    )
      detailError.value =
        cause instanceof Error
          ? cause.message
          : "Не удалось загрузить участников данных";
  } finally {
    if (
      requestGeneration === generation &&
      requestSubjectGeneration === subjectGeneration
    )
      subjectsLoading.value = false;
  }
}

async function loadAccessHistory(append = false): Promise<void> {
  const currentProjectId = projectId.value;
  const currentOperationId = operationId.value;
  if (!currentProjectId || !currentOperationId || !canReadAudit.value) return;
  if (accessLoading.value) return;
  if (append && !accessHistory.value?.pageInfo.nextCursor) return;
  const requestGeneration = generation;
  const requestAccessGeneration = ++accessGeneration;
  accessLoading.value = true;
  try {
    const response = await projectAIOperationsRepository.accessHistory(
      currentProjectId,
      currentOperationId,
      {
        limit: 50,
        ...(append && accessHistory.value?.pageInfo.nextCursor
          ? { cursor: accessHistory.value.pageInfo.nextCursor }
          : {}),
      },
    );
    if (
      requestGeneration !== generation ||
      requestAccessGeneration !== accessGeneration ||
      projectId.value !== currentProjectId ||
      operationId.value !== currentOperationId
    )
      return;
    accessHistory.value =
      append && accessHistory.value
        ? {
            ...response,
            items: [...accessHistory.value.items, ...response.items],
          }
        : response;
  } catch (cause) {
    if (
      requestGeneration === generation &&
      requestAccessGeneration === accessGeneration &&
      projectId.value === currentProjectId &&
      operationId.value === currentOperationId
    )
      detailError.value =
        cause instanceof Error
          ? cause.message
          : "Не удалось загрузить историю доступа";
  } finally {
    if (
      requestGeneration === generation &&
      requestAccessGeneration === accessGeneration
    )
      accessLoading.value = false;
  }
}

async function applyFilters(): Promise<void> {
  pageInfo.value = { hasMore: false, nextCursor: null };
  await Promise.all([loadList(), loadSummary()]);
}

function updateFilters(value: AIOperationFiltersModel): void {
  filters.value = withBoundedDefaultPeriod(value);
}

async function refresh(): Promise<void> {
  await Promise.all([loadList(), loadSummary(), loadDetail()]);
}

async function closeDetail(): Promise<void> {
  const selectedId = operationId.value;
  await router.push({ name: "ai-operations" });
  await nextTick();
  if (selectedId)
    document
      .querySelector<HTMLElement>(
        `[data-operation-id="${selectedId}"] .operation-link`,
      )
      ?.focus();
}

async function focusDetail(): Promise<void> {
  await nextTick();
  document
    .querySelector<HTMLElement>('[data-testid="ai-operation-detail"]')
    ?.focus();
}

function resetProtectedState(): void {
  detail.value = null;
  subjects.value = null;
  accessHistory.value = null;
  detailLoading.value = false;
  timelineLoading.value = false;
  usageLoading.value = false;
  subjectsLoading.value = false;
  accessLoading.value = false;
  detailError.value = "";
  detailGeneration += 1;
  timelineGeneration += 1;
  usageGeneration += 1;
  subjectGeneration += 1;
  accessGeneration += 1;
}

watch(projectId, async () => {
  generation += 1;
  items.value = [];
  summary.value = null;
  pageInfo.value = { hasMore: false, nextCursor: null };
  filters.value = withBoundedDefaultPeriod({});
  resetProtectedState();
  await refresh();
  if (operationId.value) await focusDetail();
});
watch(operationId, async (current, previous) => {
  if (current === previous) return;
  resetProtectedState();
  await loadDetail();
  if (current) await focusDetail();
});
watch(canReadSubjects, async (allowed) => {
  if (!allowed) {
    subjects.value = null;
    subjectGeneration += 1;
    subjectsLoading.value = false;
    const safeFilters = { ...filters.value };
    delete safeFilters.subjectEndUserId;
    delete safeFilters.subjectRole;
    filters.value = safeFilters;
    await Promise.all([loadList(), loadSummary()]);
  }
});
watch(canReadAudit, (allowed) => {
  if (!allowed) {
    accessHistory.value = null;
    accessGeneration += 1;
    accessLoading.value = false;
  }
});
watch(canReadCost, async () => {
  generation += 1;
  items.value = [];
  summary.value = null;
  resetProtectedState();
  await refresh();
});
watch(canReadOperations, async (allowed) => {
  if (allowed) return;
  generation += 1;
  listGeneration += 1;
  summaryGeneration += 1;
  items.value = [];
  summary.value = null;
  pageInfo.value = { hasMore: false, nextCursor: null };
  listError.value = "";
  listLoading.value = false;
  loadingMore.value = false;
  summaryLoading.value = false;
  resetProtectedState();
  await router.push({ name: "overview" });
});

onMounted(async () => {
  if (!canReadOperations.value) {
    await router.push({ name: "overview" });
    return;
  }
  await refresh();
  if (operationId.value) await focusDetail();
});
onBeforeUnmount(() => {
  generation += 1;
  summaryGeneration += 1;
  detailGeneration += 1;
  timelineGeneration += 1;
  usageGeneration += 1;
  subjectGeneration += 1;
  accessGeneration += 1;
});

function withBoundedDefaultPeriod(
  value: AIOperationFiltersModel,
): AIOperationFiltersModel {
  if (value.occurredFrom && value.occurredTo) return value;
  const defaultTo = new Date();
  const defaultFrom = new Date(defaultTo.getTime() - 30 * 24 * 60 * 60 * 1_000);
  if (value.occurredFrom) {
    const from = new Date(value.occurredFrom);
    return {
      ...value,
      occurredTo: new Date(
        Math.min(
          defaultTo.getTime(),
          from.getTime() + 30 * 24 * 60 * 60 * 1_000,
        ),
      ).toISOString(),
    };
  }
  if (value.occurredTo) {
    const to = new Date(value.occurredTo);
    return {
      ...value,
      occurredFrom: new Date(
        to.getTime() - 30 * 24 * 60 * 60 * 1_000,
      ).toISOString(),
    };
  }
  return {
    ...value,
    occurredFrom: defaultFrom.toISOString(),
    occurredTo: defaultTo.toISOString(),
  };
}
</script>

<template>
  <main class="page operations-page" :class="{ 'has-detail': operationId }">
    <header class="page-header">
      <div>
        <div class="eyebrow">AI operations ledger</div>
        <h1>Журнал AI-операций</h1>
        <p class="subtitle">
          Кто запустил AI, чей лимит или бюджет использован, какие данные
          читались, что выполнили модели и tools и сколько это стоило.
        </p>
      </div>
      <Button
        label="Обновить"
        icon="pi pi-refresh"
        severity="secondary"
        outlined
        :loading="
          listLoading ||
          summaryLoading ||
          detailLoading ||
          timelineLoading ||
          usageLoading
        "
        @click="refresh"
      />
    </header>

    <AIOperationSummary
      :summary="summary"
      :loading="summaryLoading"
      :can-read-cost="canReadCost"
    />

    <AIOperationFilters
      :model-value="filters"
      :loading="listLoading || summaryLoading || loadingMore"
      :can-read-subjects="canReadSubjects"
      @update:model-value="updateFilters"
      @apply="applyFilters"
    />

    <Message v-if="listError" severity="error">
      <div class="error-row">
        <span>{{ listError }}</span>
        <Button label="Повторить" text @click="refresh" />
      </div>
    </Message>

    <div class="operations-layout" :class="{ selected: operationId }">
      <section class="operation-list" aria-label="Список AI-операций">
        <template v-if="listLoading">
          <Skeleton v-for="index in 4" :key="index" height="14rem" />
        </template>
        <div v-else-if="items.length === 0" class="empty-state">
          <span><i class="pi pi-history" /></span>
          <h2>Операций за выбранный период нет</h2>
          <p>
            Здесь появятся AI-анализы, chat/voice вызовы и будущие
            capability-действия с полной атрибуцией.
          </p>
        </div>
        <AIOperationCard
          v-for="item in items"
          v-else
          :key="item.operationId"
          :item="item"
          :project-id="projectId ?? ''"
          :can-read-cost="canReadCost"
        />
        <Button
          v-if="pageInfo.hasMore"
          label="Показать ещё"
          severity="secondary"
          outlined
          :loading="loadingMore"
          @click="loadList(true)"
        />
      </section>

      <AIOperationDetailPanel
        v-if="operationId"
        :project-id="projectId ?? ''"
        :detail="detail"
        :subjects="subjects"
        :access-history="accessHistory"
        :loading="detailLoading"
        :timeline-loading="timelineLoading"
        :usage-loading="usageLoading"
        :subjects-loading="subjectsLoading"
        :access-loading="accessLoading"
        :error="detailError"
        :can-read-cost="canReadCost"
        :can-read-subjects="canReadSubjects"
        :can-read-audit="canReadAudit"
        :can-read-analysis-result="canReadAnalysisResult"
        :can-read-case-result="canReadCaseResult"
        :can-read-conversation-result="canReadConversationResult"
        @close="closeDetail"
        @load-subjects="loadSubjects()"
        @load-access-history="loadAccessHistory()"
        @load-more-timeline="loadDetail({ appendTimeline: true })"
        @load-more-usage="loadDetail({ appendUsage: true })"
        @load-more-subjects="loadSubjects(true)"
        @load-more-access-history="loadAccessHistory(true)"
      />
    </div>
  </main>
</template>

<style scoped>
.operations-page {
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
  max-width: 760px;
  margin: 0;
  color: var(--muted);
  font-size: 0.82rem;
  line-height: 1.5;
}
.error-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.operations-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 18px;
}
.operations-layout.selected {
  grid-template-columns: minmax(360px, 0.88fr) minmax(460px, 1.12fr);
}
.operation-list {
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
  max-width: 480px;
  margin: 0;
  color: var(--muted);
  font-size: 0.76rem;
  line-height: 1.55;
}
@media (max-width: 1120px) {
  .operations-layout.selected {
    grid-template-columns: 1fr;
  }
  .operations-layout.selected :deep(.detail-panel) {
    order: -1;
  }
}
@media (max-width: 620px) {
  .page-header {
    align-items: flex-start;
    flex-direction: column;
  }
  .operations-page.has-detail :deep(.summary),
  .operations-page.has-detail :deep(.operation-filters),
  .operations-page.has-detail .operation-list {
    display: none;
  }
}
</style>
