<script setup lang="ts">
import Tag from "primevue/tag";
import type { AiOperationListItemDto } from "@/shared/api/generated/models";
import {
  aiOperationActorLabel,
  aiOperationCategoryLabel,
  aiOperationChargedAccountLabel,
  aiOperationCostLabel,
  aiOperationDateLabel,
  aiOperationStatusPresentation,
  compactIdentifier,
} from "../model/project-ai-operation-presentation";

const props = defineProps<{
  item: AiOperationListItemDto;
  projectId: string;
  canReadCost: boolean;
}>();

function responsibleLabel(): string {
  return (
    props.item.responsibleCmsUserDisplayName?.trim() ||
    props.item.responsibleCmsUserId ||
    "не применяется"
  );
}
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
        <dd>
          {{ aiOperationActorLabel(item.initiator) }}
          <code v-if="item.initiator.id">{{ item.initiator.id }}</code>
        </dd>
      </div>
      <div>
        <dt>Расход</dt>
        <dd>{{ aiOperationChargedAccountLabel(item.chargedAccount) }}</dd>
      </div>
      <div>
        <dt>Ответственный</dt>
        <dd>
          {{ responsibleLabel() }}
          <code v-if="item.responsibleCmsUserId">{{
            item.responsibleCmsUserId
          }}</code>
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

    <dl class="technical-facts" aria-label="Техническая атрибуция">
      <div>
        <dt>Владелец расхода</dt>
        <dd>{{ item.chargedEndUserId || "бюджет проекта" }}</dd>
      </div>
      <div>
        <dt>Авторизовал</dt>
        <dd>
          {{
            item.authorizedByCmsUserDisplayName ||
            item.authorizedByCmsUserId ||
            "не применяется"
          }}
          <code v-if="item.authorizedByCmsUserId">{{
            item.authorizedByCmsUserId
          }}</code>
        </dd>
      </div>
    </dl>

    <div class="card-footer">
      <span
        ><i class="pi pi-link" /> {{ item.sourceKind }} ·
        {{ compactIdentifier(item.sourceId) }}</span
      >
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
    transform 0.18s ease;
}
.operation-card:hover {
  border-color: color-mix(in srgb, var(--action-primary) 36%, var(--line));
  transform: translateY(-2px);
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
.technical-facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
  padding: 10px 12px;
  background: var(--surface-subtle);
  border-radius: 11px;
}
.technical-facts div {
  min-width: 0;
}
.technical-facts dd {
  font-size: 0.75rem;
  font-weight: 600;
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
dd code {
  display: block;
  overflow: hidden;
  margin-top: 3px;
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 500;
  text-overflow: ellipsis;
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
  .technical-facts {
    grid-template-columns: 1fr;
  }
  .card-footer strong,
  .cost-hidden {
    width: 100%;
    margin-left: 0;
  }
}
</style>
