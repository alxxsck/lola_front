<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import Button from "primevue/button";
import type { ReportingRunCoordinator } from "../model/reporting-run-coordinator";
import type {
  ReportingDateRange,
  ReportingQueryResult,
  SavedReport,
} from "../model/reporting-types";
import { reportingRepository } from "../api/reporting-repository";
import ReportingChartRenderer from "./ReportingChartRenderer.vue";

const props = defineProps<{
  projectId: string;
  report: SavedReport;
  title?: string;
  dateRange: ReportingDateRange;
  coordinator: ReportingRunCoordinator;
  refreshKey: number;
  deferred?: boolean;
}>();

const root = ref<HTMLElement | null>(null);
const result = ref<ReportingQueryResult | null>(null);
const loading = ref(false);
const error = ref("");
const visible = ref(!props.deferred);
let observer: IntersectionObserver | null = null;

const query = computed(() => ({
  ...props.report.query,
  dateRange: props.dateRange,
}));

async function load(): Promise<void> {
  if (!visible.value) return;
  loading.value = true;
  error.value = "";
  try {
    const outcome = await props.coordinator.schedule((signal) =>
      reportingRepository.runQuery(props.projectId, query.value, signal),
    );
    if (outcome.status === "committed") result.value = outcome.value;
  } catch (cause) {
    if (!(cause instanceof DOMException && cause.name === "AbortError")) {
      error.value =
        cause instanceof Error ? cause.message : "Виджет не загрузился";
    }
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.refreshKey,
  () => void load(),
);

onMounted(() => {
  if (!props.deferred || typeof IntersectionObserver === "undefined") {
    visible.value = true;
    void load();
    return;
  }
  observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      visible.value = true;
      observer?.disconnect();
      observer = null;
      void load();
    },
    { rootMargin: "240px" },
  );
  if (root.value) observer.observe(root.value);
});

onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <article ref="root" class="dashboard-widget" data-dashboard-widget>
    <header>
      <div>
        <span>{{ report.collection }}</span>
        <h2>{{ title || report.title }}</h2>
      </div>
      <div class="widget-actions">
        <Button
          text
          rounded
          icon="pi pi-external-link"
          :aria-label="`Открыть отчёт ${report.title}`"
          as="a"
          :href="`/reports/${report.id}`"
        />
        <Button
          text
          rounded
          icon="pi pi-refresh"
          :aria-label="`Обновить ${report.title}`"
          :loading="loading"
          @click="load"
        />
      </div>
    </header>
    <div v-if="error" class="widget-error" role="alert">
      <span>{{ error }}</span>
      <Button label="Повторить" text @click="load" />
    </div>
    <ReportingChartRenderer
      v-else
      :result="result"
      :visualization="report.visualization"
      :loading="loading || !visible"
      compact
    />
  </article>
</template>

<style scoped>
.dashboard-widget {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  border-radius: 15px;
  background: var(--surface-card);
}

.dashboard-widget > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 64px;
  padding: 10px 12px 10px 16px;
}

.dashboard-widget header span {
  color: var(--text-tertiary);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.dashboard-widget h2 {
  margin: 3px 0 0;
  font: 650 1rem var(--font-display);
  letter-spacing: -0.01em;
}

.widget-actions {
  display: flex;
  gap: 2px;
}

.widget-error {
  display: grid;
  min-height: 260px;
  place-items: center;
  align-content: center;
  gap: 8px;
  padding: 24px;
  color: var(--status-danger-text);
  text-align: center;
}

.dashboard-widget :deep(.chart-shell) {
  border-right: 0;
  border-bottom: 0;
  border-left: 0;
  border-radius: 0;
}
</style>
