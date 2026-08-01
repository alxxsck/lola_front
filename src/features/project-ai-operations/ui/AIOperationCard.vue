<script setup lang="ts">
import { computed } from "vue";
import type { RouteLocationRaw } from "vue-router";
import Tag from "primevue/tag";
import { cmsUserDetailRoute } from "@/features/cms-user-management/model/cms-user-route";
import type { AiOperationListItemDto } from "@/shared/api/generated/models";
import TechnicalIdentifier from "@/shared/ui/TechnicalIdentifier.vue";
import {
  aiOperationActorLabel,
  aiOperationCategoryLabel,
  aiOperationChargedAccountLabel,
  aiOperationCostLabel,
  aiOperationDateLabel,
  aiOperationStatusPresentation,
} from "../model/project-ai-operation-presentation";

const props = defineProps<{
  item: AiOperationListItemDto;
  projectId: string;
  canReadCost: boolean;
  canReadCmsUsers?: boolean;
}>();

interface TechnicalFact {
  label: string;
  value: string;
  to?: RouteLocationRaw;
}

function responsibleLabel(): string {
  return (
    props.item.responsibleCmsUserDisplayName?.trim() ||
    props.item.responsibleCmsUserId ||
    "не применяется"
  );
}

const technicalFacts = computed<TechnicalFact[]>(() => [
  { label: "Operation ID", value: props.item.operationId },
  ...(props.item.initiator.id
    ? [
        {
          label: "Инициатор",
          value: props.item.initiator.id,
          ...(props.item.initiator.type === "END_USER"
            ? {
                to: {
                  name: "users",
                  params: { endUserId: props.item.initiator.id },
                  query: { projectId: props.projectId },
                },
              }
            : props.item.initiator.type === "CMS_USER"
              ? {
                  to: cmsUserDetailRoute(
                    props.item.initiator.id,
                    Boolean(props.canReadCmsUsers),
                  ),
                }
              : {}),
        },
      ]
    : []),
  ...(props.item.responsibleCmsUserId
    ? [
        {
          label: "Ответственный",
          value: props.item.responsibleCmsUserId,
          to: cmsUserDetailRoute(
            props.item.responsibleCmsUserId,
            Boolean(props.canReadCmsUsers),
          ),
        },
      ]
    : []),
  ...(props.item.chargedEndUserId
    ? [
        {
          label: "Владелец AI-лимита",
          value: props.item.chargedEndUserId,
          to: {
            name: "users",
            params: { endUserId: props.item.chargedEndUserId },
            query: { projectId: props.projectId },
          },
        },
      ]
    : []),
  ...(props.item.authorizedByCmsUserId
    ? [
        {
          label: "Авторизовал",
          value: props.item.authorizedByCmsUserId,
          to: cmsUserDetailRoute(
            props.item.authorizedByCmsUserId,
            Boolean(props.canReadCmsUsers),
          ),
        },
      ]
    : []),
  ...(props.item.sourceId
    ? [{ label: "Источник", value: props.item.sourceId }]
    : []),
]);
</script>

<template>
  <article
    class="operation-card"
    :data-operation-id="item.operationId"
    :class="{ failed: item.status === 'FAILED' }"
  >
    <div class="card-topline">
      <span class="sequence">AI #{{ item.projectSequence }}</span>
      <Tag
        :value="aiOperationStatusPresentation(item.status).label"
        :severity="aiOperationStatusPresentation(item.status).severity"
      />
    </div>
    <div class="card-heading">
      <div>
        <span class="category">{{
          aiOperationCategoryLabel(item.category)
        }}</span>
        <h2>{{ item.title }}</h2>
      </div>
      <RouterLink
        class="operation-link"
        :to="{
          name: 'ai-operation-detail',
          params: { operationId: item.operationId },
          query: { projectId },
        }"
        :aria-label="`Открыть детали AI-операции ${item.projectSequence}: ${item.title}`"
      >
        <i class="pi pi-arrow-up-right" />
      </RouterLink>
    </div>

    <dl class="facts">
      <div>
        <dt>Инициатор</dt>
        <dd>{{ aiOperationActorLabel(item.initiator) }}</dd>
      </div>
      <div>
        <dt>Расход</dt>
        <dd>{{ aiOperationChargedAccountLabel(item.chargedAccount) }}</dd>
      </div>
      <div>
        <dt>Ответственный</dt>
        <dd>
          {{ responsibleLabel() }}
        </dd>
      </div>
      <div>
        <dt>Начало</dt>
        <dd>{{ aiOperationDateLabel(item.startedAt) }}</dd>
      </div>
      <div>
        <dt>Участники данных</dt>
        <dd>
          {{
            item.subjectSummary.availability === "EXACT"
              ? `${item.subjectSummary.count ?? 0} чел.`
              : "не материализованы"
          }}
        </dd>
      </div>
    </dl>

    <div class="card-footer">
      <span><i class="pi pi-link" /> {{ item.sourceKind }}</span>
      <span><i class="pi pi-server" /> {{ item.usageRecords }} AI-выз.</span>
      <strong v-if="canReadCost && item.cost">{{
        aiOperationCostLabel(item.cost.effectiveCost)
      }}</strong>
      <span v-else-if="!canReadCost" class="cost-hidden"
        ><i class="pi pi-lock" /> Стоимость ограничена</span
      >
      <span v-else class="cost-hidden">Стоимость неизвестна</span>
    </div>

    <div v-if="item.limitationCodes.length" class="limitations">
      <i class="pi pi-exclamation-triangle" />
      {{ item.limitationCodes.join(" · ") }}
    </div>

    <details class="technical-disclosure">
      <summary>
        <span><i class="pi pi-code" /> Технические детали</span>
        <strong>{{ technicalFacts.length }}</strong>
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
    </details>
  </article>
</template>

<style scoped>
.operation-card {
  display: grid;
  min-width: 0;
  gap: 16px;
  padding: 21px;
  background: var(--surface-card);
  border: 1px solid var(--line);
  border-radius: 20px;
  box-shadow: 0 12px 34px
    color-mix(in srgb, var(--surface-emphasis) 5%, transparent);
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}
.operation-card:hover {
  border-color: color-mix(in srgb, var(--action-primary) 36%, var(--line));
  box-shadow: 0 16px 40px
    color-mix(in srgb, var(--surface-emphasis) 8%, transparent);
}
.operation-card.failed {
  border-color: color-mix(in srgb, var(--status-danger) 28%, var(--line));
}
.card-topline,
.card-heading,
.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.sequence,
.category {
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.055em;
  text-transform: uppercase;
}
.category {
  color: var(--text-brand);
}
h2 {
  margin: 3px 0 0;
  font-size: 1.08rem;
  line-height: 1.35;
}
.operation-link {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
  color: var(--text-link);
  background: color-mix(in srgb, var(--action-primary) 10%, transparent);
  border-radius: 11px;
  text-decoration: none;
}
.operation-link:focus-visible {
  outline: 3px solid var(--focus-ring);
  outline-offset: 2px;
}
.facts {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
}
.facts div {
  min-width: 0;
  padding: 12px;
  background: var(--surface-subtle);
  border-radius: 11px;
}
dt {
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 700;
}
dd {
  overflow: hidden;
  margin: 4px 0 0;
  font-size: 0.82rem;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.card-footer {
  justify-content: flex-start;
  flex-wrap: wrap;
  color: var(--muted);
  font-size: 0.75rem;
}
.card-footer > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.card-footer strong {
  margin-left: auto;
  color: var(--text-primary);
  font-size: 0.84rem;
}
.cost-hidden {
  margin-left: auto;
}
.limitations {
  padding: 9px 11px;
  color: var(--status-warning);
  background: color-mix(in srgb, var(--status-warning) 8%, transparent);
  border-radius: 10px;
  font-size: 0.76rem;
}
@media (max-width: 760px) {
  .facts {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 480px) {
  .operation-card {
    padding: 18px;
  }
  .facts {
    grid-template-columns: 1fr;
  }
  .card-footer strong,
  .cost-hidden {
    width: 100%;
    margin-left: 0;
  }
}
</style>
