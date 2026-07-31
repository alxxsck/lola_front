<script setup lang="ts">
import { computed } from "vue";
import Tag from "primevue/tag";
import type { ProjectAIAnalysisListItemDto } from "@/shared/api/generated/models";
import {
  formatUsdTicks,
  presentAnalysisCostStatus,
  presentAnalysisStatus,
} from "../model/project-ai-analysis-presentation";

const props = defineProps<{
  item: ProjectAIAnalysisListItemDto;
  canReadCost: boolean;
  projectId?: string;
}>();

const effectiveStatus = computed(() => {
  if (["PAUSED", "CANCELLED"].includes(props.item.state))
    return props.item.state;
  if (props.item.schedule && !props.item.latestRun) return "SCHEDULED";
  return props.item.latestRun?.status ?? props.item.state;
});
const status = computed(() => presentAnalysisStatus(effectiveStatus.value));
const author = computed(() => {
  if (props.item.createdByCmsUserId) return props.item.createdByCmsUserId;
  return props.item.compatibility?.attributionStatus === "REQUESTER_UNKNOWN"
    ? "Автор неизвестен (историческая запись)"
    : "Автор не указан";
});
const compatibility = computed(() => {
  const value = props.item.compatibility;
  if (!value) return null;
  return {
    source:
      value.sourceKind === "AI_REVIEW"
        ? "Исторический AI Review"
        : "Историческое AI-предложение",
    provenance:
      value.provenanceStatus === "PARTIAL"
        ? "Provenance частичный"
        : "Provenance неизвестен",
  };
});
const detailTo = computed(() => ({
  name: "ai-analysis-detail",
  params: { analysisId: props.item.analysisId },
  ...(props.projectId ? { query: { projectId: props.projectId } } : {}),
}));

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(value: string): string {
  return dateFormatter.format(new Date(value));
}
</script>

<template>
  <article class="analysis-card" :data-analysis-id="item.analysisId">
    <RouterLink :to="detailTo" class="analysis-link">
      <header>
        <div class="analysis-title">
          <span class="sequence">#{{ item.projectSequence ?? "—" }}</span>
          <h2>{{ item.title }}</h2>
        </div>
        <Tag :value="status.label" :severity="status.severity" rounded />
      </header>

      <p v-if="item.questionPreview" class="question">
        {{ item.questionPreview }}
      </p>

      <div class="analysis-facts">
        <span>
          <small>Область</small>
          {{
            item.scopeKind === "PROJECT"
              ? "Весь проект"
              : item.scopeKind === "END_USER"
                ? "Пользователь"
                : "Когорта"
          }}
        </span>
        <span v-if="item.schedule?.nextRunAt">
          <small>Запуск</small>
          {{ formatDate(item.schedule.nextRunAt) }}
          <em>{{ item.schedule.timezone }}</em>
        </span>
        <span v-else-if="item.latestRun?.completedAt">
          <small>Завершён</small>
          {{ formatDate(item.latestRun.completedAt) }}
        </span>
        <span v-if="canReadCost && item.latestRun?.actualAiCostUsdTicks">
          <small>Фактическая AI-стоимость</small>
          {{ formatUsdTicks(item.latestRun.actualAiCostUsdTicks) }}
          <em v-if="item.latestRun.costStatus">{{
            presentAnalysisCostStatus(item.latestRun.costStatus)
          }}</em>
        </span>
        <span v-if="canReadCost && item.latestRun?.reservedAiCostUsdTicks">
          <small>Зарезервировано</small>
          {{ formatUsdTicks(item.latestRun.reservedAiCostUsdTicks) }}
        </span>
        <span
          v-if="canReadCost && item.latestRun?.budgetReconciliationPending"
          class="cost-pending"
        >
          <small>Статус стоимости</small>
          Сверка стоимости ожидается
        </span>
      </div>

      <div class="technical-facts" aria-label="Техническая атрибуция">
        <span>
          <small>Создал</small>
          <code>{{ author }}</code>
        </span>
        <span v-if="item.endUserId">
          <small>Пользователь данных</small>
          <code>{{ item.endUserId }}</code>
        </span>
        <span v-if="canReadCost && item.latestRun?.costAttributedToCmsUserId">
          <small>Расход администратора</small>
          <code>{{ item.latestRun.costAttributedToCmsUserId }}</code>
        </span>
      </div>

      <footer>
        <span v-if="compatibility" class="legacy">
          <i class="pi pi-history" /> {{ compatibility.source }} ·
          {{ compatibility.provenance }}
        </span>
        <span v-for="code in item.eventCodes" :key="code" class="event-code">
          {{ code }}
        </span>
        <span v-if="item.hasLimitations" class="limited">
          <i class="pi pi-exclamation-triangle" /> Есть ограничения
        </span>
        <span class="open-label"
          >Открыть <i class="pi pi-arrow-up-right"
        /></span>
      </footer>
    </RouterLink>
  </article>
</template>

<style scoped>
.analysis-card {
  background: var(--surface-card);
  border: 1px solid var(--line);
  border-radius: 20px;
  box-shadow: 0 12px 34px
    color-mix(in srgb, var(--surface-emphasis) 5%, transparent);
  transition:
    border-color 0.18s ease,
    transform 0.18s ease;
}
.analysis-card:hover {
  border-color: color-mix(in srgb, var(--action-primary) 40%, var(--line));
  transform: translateY(-2px);
}
.analysis-link:focus-visible {
  outline: 3px solid var(--focus-ring);
  outline-offset: 3px;
}
.analysis-link {
  display: block;
  padding: 22px;
  color: inherit;
  text-decoration: none;
}
header,
.analysis-title,
footer {
  display: flex;
  align-items: center;
}
header {
  justify-content: space-between;
  gap: 16px;
}
.analysis-title {
  min-width: 0;
  gap: 10px;
}
.sequence {
  color: var(--text-brand);
  font-size: 0.78rem;
  font-weight: 800;
}
h2 {
  margin: 0;
  overflow: hidden;
  font-size: 1.08rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.question {
  margin: 12px 0 16px;
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.6;
}
.analysis-facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px 20px;
}
.analysis-facts span {
  min-width: 0;
  color: var(--text-primary);
  font-size: 0.84rem;
}
.analysis-facts small {
  display: block;
  margin-bottom: 4px;
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.technical-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  margin-top: 17px;
  padding: 10px 12px;
  color: var(--text-secondary);
  background: var(--surface-subtle);
  border-radius: 10px;
  font-size: 0.75rem;
}
.technical-facts span {
  min-width: 0;
}
.technical-facts small,
.technical-facts code {
  display: inline;
}
.technical-facts small {
  margin-right: 5px;
  font-weight: 700;
}
code {
  display: block;
  overflow: hidden;
  color: inherit;
  font: inherit;
  text-overflow: ellipsis;
  white-space: nowrap;
}
em {
  display: block;
  margin-top: 2px;
  color: var(--muted);
  font-style: normal;
}
footer {
  min-height: 25px;
  gap: 7px;
  margin-top: 17px;
  padding-top: 14px;
  border-top: 1px solid var(--line);
  flex-wrap: wrap;
}
.event-code,
.limited,
.legacy {
  padding: 5px 9px;
  color: var(--muted);
  background: var(--surface-subtle);
  border-radius: 8px;
  font-size: 0.75rem;
  line-height: 1.35;
}
.legacy {
  color: var(--text-brand);
}
.cost-pending {
  color: var(--status-warning-text) !important;
  background: var(--status-warning-soft) !important;
}
.limited {
  color: var(--status-warning-text);
}
.open-label {
  margin-left: auto;
  color: var(--text-link);
  font-size: 0.78rem;
  font-weight: 700;
}
@media (max-width: 560px) {
  .analysis-link {
    padding: 18px;
  }
  header {
    align-items: flex-start;
  }
  .analysis-title {
    align-items: flex-start;
    flex-direction: column;
    gap: 4px;
  }
  h2 {
    white-space: normal;
  }
  .analysis-facts {
    grid-template-columns: 1fr;
  }
  .technical-facts {
    align-items: flex-start;
    flex-direction: column;
  }
  .open-label {
    width: 100%;
    margin-top: 4px;
    margin-left: 0;
    text-align: right;
  }
}
</style>
