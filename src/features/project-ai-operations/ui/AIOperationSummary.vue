<script setup lang="ts">
import Skeleton from 'primevue/skeleton';
import type { AiOperationSummaryResponseDto } from '@/shared/api/generated/models';
import {
  aiOperationCostLabel,
  aiOperationStatusPresentation,
} from '../model/project-ai-operation-presentation';

defineProps<{
  summary: AiOperationSummaryResponseDto | null;
  loading: boolean;
  canReadCost: boolean;
}>();

function statusLabel(key: string): string {
  if (['STARTED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED'].includes(key))
    return aiOperationStatusPresentation(
      key as 'STARTED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED',
    ).label;
  return key;
}
</script>

<template>
  <section class="summary" aria-label="Сводка AI-операций">
    <template v-if="loading && !summary">
      <Skeleton v-for="index in 4" :key="index" height="7.5rem" />
    </template>
    <template v-else-if="summary">
      <article class="metric primary">
        <span>Операций</span>
        <strong>{{ summary.operations }}</strong>
      </article>
      <article class="metric">
        <span>Обращений к моделям</span>
        <strong>{{ summary.usageRecords }}</strong>
      </article>
      <article class="metric">
        <span>Нагрузка на базу данных</span>
        <strong v-if="canReadCost && summary.dbWorkUnits != null">{{ summary.dbWorkUnits }}</strong>
        <strong v-else class="restricted"><i class="pi pi-lock" /> Скрыта</strong>
        <small>условных единиц обработки</small>
      </article>
      <article class="metric">
        <span>Стоимость</span>
        <strong v-if="canReadCost && summary.cost">{{
          aiOperationCostLabel(summary.cost.effectiveCost)
        }}</strong>
        <strong v-else class="restricted"><i class="pi pi-lock" /> Скрыта</strong>
        <small>за выбранный период</small>
      </article>
      <article class="breakdown status-breakdown">
        <span class="breakdown-title">По статусам</span>
        <div class="breakdown-items">
          <span v-for="item in summary.byStatus" :key="item.key">
            {{ statusLabel(item.key) }}
            <strong>{{ item.operations }}</strong>
          </span>
        </div>
      </article>
      <article class="breakdown admins-breakdown">
        <span class="breakdown-title">По ответственным</span>
        <div v-if="canReadCost && summary.byResponsibleCmsUser.length" class="breakdown-items">
          <span v-for="item in summary.byResponsibleCmsUser.slice(0, 4)" :key="item.cmsUserId">
            {{ item.displayName || item.cmsUserId }}
            <strong>{{ item.operations }}</strong>
          </span>
        </div>
        <small v-else-if="canReadCost">Нет операций с назначенным ответственным</small>
        <small v-else>Нет доступа к детализации</small>
        <small v-if="canReadCost && summary.breakdownLimits.responsibleCmsUsersTruncated">
          Показаны первые
          {{ summary.breakdownLimits.maxHighCardinalityItems }} записей
        </small>
      </article>
    </template>
  </section>
</template>

<style scoped>
.summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  padding: 10px;
  background: var(--surface-card);
  border: 1px solid var(--line);
  border-radius: 16px;
}
.metric,
.breakdown {
  padding: 10px 12px;
  background: var(--surface-subtle);
  border-radius: 10px;
}
.metric {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  min-height: 52px;
  gap: 8px;
}
.metric > span,
.breakdown-title {
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 750;
}
.metric > strong {
  font-size: 1.05rem;
  letter-spacing: -0.03em;
}
.metric small,
.breakdown small {
  color: var(--muted);
  font-size: 0.75rem;
  line-height: 1.5;
}
.restricted {
  font-size: 0.88rem !important;
}
.breakdown {
  grid-column: span 2;
}
.breakdown-items {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 7px;
}
.breakdown-items span {
  display: inline-flex;
  gap: 8px;
  padding: 5px 8px;
  background: var(--surface-card);
  border-radius: 9px;
  font-size: 0.75rem;
}
@media (max-width: 980px) {
  .summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 560px) {
  .summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .metric {
    align-items: flex-start;
    flex-direction: column;
    min-height: 70px;
  }
  .breakdown {
    grid-column: 1 / -1;
  }
}
</style>
