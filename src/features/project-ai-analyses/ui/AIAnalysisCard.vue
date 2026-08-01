<script setup lang="ts">
import { computed } from "vue";
import type { RouteLocationRaw } from "vue-router";
import Tag from "primevue/tag";
import { cmsUserDetailRoute } from "@/features/cms-user-management/model/cms-user-route";
import type { ProjectAIAnalysisListItemDto } from "@/shared/api/generated/models";
import TechnicalIdentifier from "@/shared/ui/TechnicalIdentifier.vue";
import {
  formatUsdTicks,
  presentAnalysisCostStatus,
  presentAnalysisStatus,
} from "../model/project-ai-analysis-presentation";

const props = defineProps<{
  item: ProjectAIAnalysisListItemDto;
  canReadCost: boolean;
  canReadCmsUsers?: boolean;
  projectId?: string;
}>();

interface TechnicalFact {
  label: string;
  value: string;
  to?: RouteLocationRaw;
}

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
const technicalFacts = computed<TechnicalFact[]>(() => [
  { label: "Analysis ID", value: props.item.analysisId },
  {
    label: "Создал",
    value: author.value,
    to: props.item.createdByCmsUserId
      ? cmsUserDetailRoute(
          props.item.createdByCmsUserId,
          Boolean(props.canReadCmsUsers),
        )
      : undefined,
  },
  ...(props.item.endUserId
    ? [
        {
          label: "Пользователь данных",
          value: props.item.endUserId,
          to: {
            name: "users",
            params: { endUserId: props.item.endUserId },
            ...(props.projectId
              ? { query: { projectId: props.projectId } }
              : {}),
          },
        },
      ]
    : []),
  ...(props.canReadCost && props.item.latestRun?.costAttributedToCmsUserId
    ? [
        {
          label: "Расход администратора",
          value: props.item.latestRun.costAttributedToCmsUserId,
          to: cmsUserDetailRoute(
            props.item.latestRun.costAttributedToCmsUserId,
            Boolean(props.canReadCmsUsers),
          ),
        },
      ]
    : []),
]);

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
    <header>
      <div class="analysis-title">
        <span class="sequence">#{{ item.projectSequence ?? "—" }}</span>
        <RouterLink :to="detailTo" class="title-link">
          <h2>{{ item.title }}</h2>
        </RouterLink>
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

    <footer>
      <span v-if="compatibility" class="legacy">
        <i class="pi pi-history" /> {{ compatibility.source }} ·
        {{ compatibility.provenance }}
      </span>
      <RouterLink
        v-for="code in item.eventCodes.slice(0, 3)"
        :key="code"
        :to="{ name: 'event-logs', query: { eventCode: code } }"
        class="event-code"
      >
        {{ code }}
      </RouterLink>
      <span v-if="item.eventCodes.length > 3" class="event-code">
        +{{ item.eventCodes.length - 3 }} событий
      </span>
      <span v-if="item.hasLimitations" class="limited">
        <i class="pi pi-exclamation-triangle" /> Есть ограничения
      </span>
      <RouterLink :to="detailTo" class="open-label">
        Открыть <i class="pi pi-arrow-up-right" />
      </RouterLink>
    </footer>

    <details class="technical-disclosure">
      <summary>
        <span><i class="pi pi-code" /> Технические детали</span>
        <strong>{{ technicalFacts.length + item.eventCodes.length }}</strong>
      </summary>
      <div class="technical-facts" aria-label="Техническая атрибуция">
        <TechnicalIdentifier
          v-for="fact in technicalFacts"
          :key="`${fact.label}-${fact.value}`"
          :label="fact.label"
          :value="fact.value"
          :to="fact.to"
        />
      </div>
      <div v-if="item.eventCodes.length" class="technical-events">
        <small>События</small>
        <RouterLink
          v-for="code in item.eventCodes"
          :key="code"
          :to="{ name: 'event-logs', query: { eventCode: code } }"
        >
          {{ code }}
        </RouterLink>
      </div>
    </details>
  </article>
</template>

<style scoped>
.analysis-card {
  padding: 22px;
  background: var(--surface-card);
  border: 1px solid var(--line);
  border-radius: 20px;
  box-shadow: 0 12px 34px
    color-mix(in srgb, var(--surface-emphasis) 5%, transparent);
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}
.analysis-card:hover {
  border-color: color-mix(in srgb, var(--action-primary) 40%, var(--line));
  box-shadow: 0 16px 40px
    color-mix(in srgb, var(--surface-emphasis) 8%, transparent);
}
.title-link:focus-visible,
.open-label:focus-visible,
.event-code:focus-visible,
.technical-events a:focus-visible {
  outline: 3px solid var(--focus-ring);
  outline-offset: 2px;
}
.title-link {
  min-width: 0;
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
.technical-disclosure {
  margin-top: 14px;
  padding-top: 12px;
}
.technical-events {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 10px;
}
.technical-events small {
  width: 100%;
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 700;
}
.technical-events a {
  padding: 5px 8px;
  color: var(--text-link);
  background: var(--surface-subtle);
  border-radius: 8px;
  font-size: 0.75rem;
}
@media (max-width: 560px) {
  .analysis-card {
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
  .open-label {
    width: 100%;
    margin-top: 4px;
    margin-left: 0;
    text-align: right;
  }
}
</style>
