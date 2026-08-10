<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Select from "primevue/select";
import Skeleton from "primevue/skeleton";
import Tag from "primevue/tag";
import { useAuthStore } from "@/features/auth/auth.store";
import { reportingRepository } from "@/features/reporting/api/reporting-repository";
import {
  canCreateDashboard,
  canCreateSavedReport,
  canEditDashboard,
  canEditSavedReport,
  canReadReporting,
} from "@/features/reporting/model/reporting-permissions";
import type { ReportingArtifactSummary } from "@/features/reporting/model/reporting-types";
import { reportingSpaceLabel } from "@/features/reporting/model/reporting-options";

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();
const artifacts = ref<ReportingArtifactSummary[]>([]);
const loading = ref(true);
const error = ref("");
const search = ref(
  typeof route.query.search === "string" ? route.query.search : "",
);
const activeTab = ref<"dashboards" | "reports">(
  route.query.tab === "reports" ? "reports" : "dashboards",
);
const collection = ref(
  typeof route.query.collection === "string"
    ? route.query.collection
    : "Все коллекции",
);
let catalogGeneration = 0;
const catalogCollections = ref<string[]>([]);
const dashboardCount = ref(0);
const reportCount = ref(0);

const permissions = computed(
  () => auth.project?.effectivePermissionCodes ?? [],
);
const canCreateReport = computed(() => canCreateSavedReport(permissions.value));
const canCreateDashboardArtifact = computed(() =>
  canCreateDashboard(permissions.value),
);
const collections = computed(() => [
  "Все коллекции",
  ...catalogCollections.value,
]);
const visibleArtifacts = computed(() => artifacts.value);

async function loadArtifacts(): Promise<void> {
  const generation = ++catalogGeneration;
  const projectId = auth.project?.id;
  if (!projectId || !canReadReporting(permissions.value)) {
    artifacts.value = [];
    loading.value = false;
    await router.replace({ name: "overview" });
    return;
  }
  loading.value = true;
  error.value = "";
  try {
    const catalog = await reportingRepository.listArtifacts(projectId, {
      kind: activeTab.value === "dashboards" ? "DASHBOARD" : "SAVED_REPORT",
      search: search.value,
      collection:
        collection.value === "Все коллекции" ? null : collection.value,
    });
    if (generation !== catalogGeneration || auth.project?.id !== projectId)
      return;
    artifacts.value = catalog.items;
    dashboardCount.value = catalog.counts.dashboards;
    reportCount.value = catalog.counts.savedReports;
    catalogCollections.value = catalog.collections;
  } catch (cause) {
    if (generation !== catalogGeneration) return;
    artifacts.value = [];
    error.value =
      cause instanceof Error ? cause.message : "Не удалось загрузить отчёты";
  } finally {
    if (generation === catalogGeneration) loading.value = false;
  }
}

function artifactPath(
  artifact: ReportingArtifactSummary,
  edit = false,
): string {
  const base =
    artifact.kind === "DASHBOARD"
      ? `/dashboards/${artifact.id}`
      : `/reports/${artifact.id}`;
  return edit ? `${base}/edit` : base;
}

function canEditArtifact(artifact: ReportingArtifactSummary): boolean {
  if (!artifact.allowedActions.includes("EDIT")) return false;
  return artifact.kind === "DASHBOARD"
    ? canEditDashboard(permissions.value)
    : canEditSavedReport(permissions.value);
}

async function archiveArtifact(
  artifact: ReportingArtifactSummary,
): Promise<void> {
  const projectId = auth.project?.id;
  if (!projectId || !artifact.allowedActions.includes("ARCHIVE")) return;
  await reportingRepository.archiveArtifact(
    projectId,
    artifact.kind,
    artifact.id,
  );
  await loadArtifacts();
}

function lifecycleLabel(
  lifecycle: ReportingArtifactSummary["lifecycle"],
): string {
  if (lifecycle === "PUBLISHED") return "Опубликован";
  if (lifecycle === "DRAFT") return "Черновик";
  return "В архиве";
}

function lifecycleSeverity(
  lifecycle: ReportingArtifactSummary["lifecycle"],
): "success" | "secondary" | "warn" {
  if (lifecycle === "PUBLISHED") return "success";
  if (lifecycle === "DRAFT") return "secondary";
  return "warn";
}

function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat("ru", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

let previousProjectId = auth.project?.id ?? "";
watch(
  () => auth.project?.id ?? "",
  (nextProjectId) => {
    if (nextProjectId === previousProjectId) return;
    previousProjectId = nextProjectId;
    search.value = "";
    collection.value = "Все коллекции";
    activeTab.value = "dashboards";
  },
);

watch(
  () => [
    auth.project?.id ?? "",
    [...permissions.value].sort().join(","),
    activeTab.value,
    search.value,
    collection.value,
  ],
  () => {
    void router.replace({
      query: {
        ...(activeTab.value === "reports" ? { tab: "reports" } : {}),
        ...(search.value ? { search: search.value } : {}),
        ...(collection.value !== "Все коллекции"
          ? { collection: collection.value }
          : {}),
      },
    });
    void loadArtifacts();
  },
  { immediate: true },
);
</script>

<template>
  <main class="reports-page" aria-labelledby="reports-title">
    <header class="reports-header">
      <div class="reports-heading">
        <span class="reports-eyebrow">Аналитика проекта</span>
        <h1 id="reports-title">Отчёты</h1>
        <p>Сохранённые ответы и дашборды с понятным происхождением данных.</p>
      </div>
      <div
        v-if="canCreateReport || canCreateDashboardArtifact"
        class="header-actions"
      >
        <Button
          v-if="canCreateReport"
          label="Создать отчёт"
          icon="pi pi-plus"
          severity="secondary"
          outlined
          @click="router.push('/reports/new')"
        />
        <Button
          v-if="canCreateDashboardArtifact"
          label="Создать дашборд"
          icon="pi pi-th-large"
          @click="router.push('/dashboards/new')"
        />
      </div>
    </header>

    <section class="library-surface" aria-label="Библиотека отчётов">
      <div class="library-toolbar">
        <div class="artifact-tabs" role="tablist" aria-label="Тип артефакта">
          <button
            type="button"
            role="tab"
            data-tab="dashboards"
            :aria-selected="activeTab === 'dashboards'"
            :class="{ active: activeTab === 'dashboards' }"
            @click="activeTab = 'dashboards'"
          >
            Дашборды <span>{{ dashboardCount }}</span>
          </button>
          <button
            type="button"
            role="tab"
            data-tab="reports"
            :aria-selected="activeTab === 'reports'"
            :class="{ active: activeTab === 'reports' }"
            @click="activeTab = 'reports'"
          >
            Сохранённые отчёты <span>{{ reportCount }}</span>
          </button>
        </div>
        <div class="library-filters">
          <label class="search-control">
            <i class="pi pi-search" aria-hidden="true" />
            <span class="sr-only">Поиск по отчётам</span>
            <InputText
              v-model="search"
              type="search"
              placeholder="Название, владелец…"
            />
          </label>
          <Select
            v-model="collection"
            :options="collections"
            aria-label="Коллекция"
          />
        </div>
      </div>

      <div v-if="loading" class="artifact-list" aria-label="Загрузка отчётов">
        <div v-for="index in 4" :key="index" class="artifact-row skeleton-row">
          <Skeleton width="42%" height="1.1rem" />
          <Skeleton width="18%" height="0.85rem" />
        </div>
      </div>

      <div v-else-if="error" class="library-state" role="alert">
        <i class="pi pi-exclamation-circle" aria-hidden="true" />
        <h2>Библиотека временно недоступна</h2>
        <p>{{ error }}</p>
        <Button label="Повторить" icon="pi pi-refresh" @click="loadArtifacts" />
      </div>

      <div v-else-if="visibleArtifacts.length === 0" class="library-state">
        <i class="pi pi-folder-open" aria-hidden="true" />
        <h2>Ничего не найдено</h2>
        <p v-if="search">Измените поиск или коллекцию.</p>
        <p v-else>Начните с первого сохранённого отчёта.</p>
        <Button
          v-if="canCreateReport && !search"
          label="Создать отчёт"
          @click="router.push('/reports/new')"
        />
      </div>

      <ul v-else class="artifact-list">
        <li
          v-for="(artifact, index) in visibleArtifacts"
          :key="artifact.id"
          class="artifact-row"
          :style="{ '--row-index': index }"
        >
          <button
            type="button"
            class="artifact-main"
            @click="router.push(artifactPath(artifact))"
          >
            <span class="artifact-icon" aria-hidden="true">
              <i
                :class="
                  artifact.kind === 'DASHBOARD'
                    ? 'pi pi-th-large'
                    : 'pi pi-chart-line'
                "
              />
            </span>
            <span class="artifact-copy">
              <span class="artifact-title-line">
                <strong>{{ artifact.title }}</strong>
                <Tag
                  :value="lifecycleLabel(artifact.lifecycle)"
                  :severity="lifecycleSeverity(artifact.lifecycle)"
                />
              </span>
              <span class="artifact-description">{{
                artifact.description
              }}</span>
            </span>
          </button>
          <dl class="artifact-meta">
            <div>
              <dt>Пространство</dt>
              <dd>{{ reportingSpaceLabel(artifact.space) }}</dd>
            </div>
            <div>
              <dt>Коллекция</dt>
              <dd>{{ artifact.collection }}</dd>
            </div>
            <div>
              <dt>Владелец</dt>
              <dd>{{ artifact.ownerName }}</dd>
            </div>
            <div>
              <dt>Обновлён</dt>
              <dd>{{ formatUpdatedAt(artifact.updatedAt) }}</dd>
            </div>
          </dl>
          <div class="artifact-actions">
            <Button
              v-if="canEditArtifact(artifact)"
              text
              rounded
              icon="pi pi-pencil"
              :aria-label="`Редактировать ${artifact.title}`"
              @click="router.push(artifactPath(artifact, true))"
            />
            <Button
              v-if="artifact.allowedActions.includes('ARCHIVE')"
              text
              rounded
              severity="secondary"
              icon="pi pi-box"
              :aria-label="`Архивировать ${artifact.title}`"
              @click="archiveArtifact(artifact)"
            />
            <Button
              text
              rounded
              icon="pi pi-arrow-right"
              :aria-label="`Открыть ${artifact.title}`"
              @click="router.push(artifactPath(artifact))"
            />
          </div>
        </li>
      </ul>
    </section>
  </main>
</template>

<style scoped>
.reports-page {
  min-height: 100%;
  padding: 24px clamp(16px, 3vw, 40px) 48px;
  color: var(--text-primary);
}

.reports-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  max-width: 1380px;
  margin: 0 auto 24px;
}

.reports-heading {
  max-width: 620px;
}

.reports-eyebrow {
  color: var(--status-accent-text);
  font-size: var(--font-size-caption);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h1 {
  margin: 4px 0 8px;
  font-family: var(--font-display);
  font-size: clamp(1.75rem, 3vw, 2.5rem);
  line-height: 1.08;
  letter-spacing: -0.03em;
  text-wrap: balance;
}

.reports-heading p {
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.5;
  text-wrap: pretty;
}

.header-actions,
.library-filters,
.artifact-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.library-surface {
  max-width: 1380px;
  margin: 0 auto;
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  background: var(--surface-card);
}

.library-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-subtle);
}

.artifact-tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  border-radius: 10px;
  background: var(--surface-subtle);
}

.artifact-tabs button {
  min-height: 36px;
  padding: 8px 12px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--text-secondary);
  font: 600 var(--font-size-body) var(--font-display);
  cursor: pointer;
  transition:
    color 160ms cubic-bezier(0.23, 1, 0.32, 1),
    background-color 160ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 120ms cubic-bezier(0.23, 1, 0.32, 1);
}

.artifact-tabs button span {
  margin-left: 6px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}

.artifact-tabs button.active {
  background: var(--surface-card);
  color: var(--text-primary);
  box-shadow: 0 0 0 1px var(--border-subtle);
}

.artifact-tabs button:active,
.artifact-main:active {
  transform: scale(0.98);
}

.artifact-tabs button:focus-visible,
.artifact-main:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.search-control {
  position: relative;
  display: flex;
  align-items: center;
}

.search-control > i {
  position: absolute;
  left: 12px;
  z-index: 1;
  color: var(--text-tertiary);
  pointer-events: none;
}

.search-control :deep(input) {
  width: min(280px, 28vw);
  padding-left: 36px;
}

.artifact-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.artifact-row {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) minmax(360px, 0.72fr) auto;
  align-items: center;
  gap: 20px;
  min-height: 92px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-subtle);
  animation: row-enter 200ms cubic-bezier(0.23, 1, 0.32, 1) forwards;
  animation-delay: calc(var(--row-index, 0) * 35ms);
}

.artifact-row:last-child {
  border-bottom: 0;
}

.artifact-row:hover {
  background: var(--surface-subtle);
}

.artifact-main {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: transform 120ms cubic-bezier(0.23, 1, 0.32, 1);
}

.artifact-icon {
  display: grid;
  flex: 0 0 40px;
  width: 40px;
  height: 40px;
  place-items: center;
  border-radius: 10px;
  background: var(--status-accent-soft);
  color: var(--status-accent-text);
}

.artifact-copy,
.artifact-title-line {
  display: flex;
  min-width: 0;
}

.artifact-copy {
  flex-direction: column;
  gap: 5px;
}

.artifact-title-line {
  align-items: center;
  gap: 8px;
}

.artifact-title-line strong {
  overflow: hidden;
  font-family: var(--font-display);
  font-size: 0.95rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.artifact-description {
  overflow: hidden;
  color: var(--text-secondary);
  font-size: var(--font-size-body-small);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.artifact-title-line :deep(.p-tag-success) {
  background: var(--status-success-soft);
  color: var(--status-success-text);
}

.artifact-title-line :deep(.p-tag-secondary) {
  background: var(--surface-subtle);
  color: var(--text-secondary);
}

.artifact-meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(90px, 1fr));
  gap: 16px;
  margin: 0;
}

.artifact-meta div {
  min-width: 0;
}

.artifact-meta dt {
  margin-bottom: 3px;
  color: var(--text-tertiary);
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.artifact-meta dd {
  overflow: hidden;
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--font-size-body-small);
  font-variant-numeric: tabular-nums;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.library-state {
  display: grid;
  min-height: 360px;
  place-items: center;
  align-content: center;
  gap: 8px;
  padding: 32px;
  text-align: center;
}

.library-state > i {
  margin-bottom: 8px;
  color: var(--status-accent-text);
  font-size: 1.75rem;
}

.library-state h2,
.library-state p {
  margin: 0;
}

.library-state p {
  max-width: 480px;
  color: var(--text-secondary);
}

.skeleton-row {
  animation: none;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

@keyframes row-enter {
  from {
    transform: translateY(5px);
  }
  to {
    transform: translateY(0);
  }
}

@media (max-width: 980px) {
  .library-toolbar,
  .reports-header {
    align-items: stretch;
    flex-direction: column;
  }

  .library-filters > * {
    flex: 1;
  }

  .search-control :deep(input) {
    width: 100%;
  }

  .artifact-row {
    grid-template-columns: 1fr auto;
  }

  .artifact-meta {
    grid-column: 1 / -1;
    grid-row: 2;
  }
}

@media (max-width: 620px) {
  .reports-page {
    padding: 16px 12px 32px;
  }

  .header-actions,
  .library-filters,
  .artifact-tabs {
    align-items: stretch;
    flex-direction: column;
  }

  .header-actions :deep(button),
  .artifact-tabs button {
    width: 100%;
    justify-content: center;
  }

  .artifact-row {
    gap: 12px;
    padding: 16px 12px;
  }

  .artifact-meta {
    grid-template-columns: repeat(2, 1fr);
  }

  .artifact-meta div:last-child {
    display: none;
  }

  .artifact-actions :deep(button:not(:last-child)) {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .artifact-row {
    animation: none;
  }

  .artifact-tabs button,
  .artifact-main {
    transition:
      color 120ms linear,
      background-color 120ms linear;
  }
}
</style>
