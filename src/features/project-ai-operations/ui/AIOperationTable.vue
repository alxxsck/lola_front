<script setup lang="ts">
import Tag from 'primevue/tag';
import type { AiOperationListItemDto } from '@/shared/api/generated/models';
import {
  aiOperationActorLabel,
  aiOperationCategoryLabel,
  aiOperationChargedAccountLabel,
  aiOperationCostLabel,
  aiOperationDateLabel,
  aiOperationOutcomeLabel,
  aiOperationSourceLabel,
  aiOperationStatusPresentation,
  aiOperationTitleLabel,
} from '../model/project-ai-operation-presentation';

defineProps<{
  items: AiOperationListItemDto[];
  projectId: string;
  canReadCost: boolean;
}>();
</script>

<template>
  <div class="table-scroll">
    <table aria-label="Журнал AI-операций">
      <thead>
        <tr>
          <th scope="col">Время</th>
          <th scope="col">Операция</th>
          <th scope="col">Инициатор</th>
          <th scope="col">Источник расходов</th>
          <th scope="col">Статус</th>
          <th scope="col" class="number-column">AI-вызовы</th>
          <th v-if="canReadCost" scope="col" class="number-column">Стоимость</th>
          <th scope="col" class="action-column">
            <span class="sr-only">Открыть</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="item in items"
          :key="item.operationId"
          :data-operation-id="item.operationId"
          :class="{ failed: item.status === 'FAILED' }"
        >
          <td class="time-cell">
            <time :datetime="item.startedAt">{{ aiOperationDateLabel(item.startedAt) }}</time>
            <small>№ {{ item.projectSequence }}</small>
          </td>
          <td class="operation-cell">
            <RouterLink
              class="operation-link"
              :to="{
                name: 'ai-operation-detail',
                params: { operationId: item.operationId },
                query: { projectId },
              }"
              :aria-label="`Открыть операцию № ${item.projectSequence}: ${aiOperationTitleLabel(item.title, item.category)}`"
            >
              {{ aiOperationTitleLabel(item.title, item.category) }}
            </RouterLink>
            <small>
              {{ aiOperationCategoryLabel(item.category) }} ·
              {{ aiOperationSourceLabel(item.sourceKind) }}
            </small>
          </td>
          <td>
            <span class="primary-value">{{ aiOperationActorLabel(item.initiator) }}</span>
            <small
              v-if="
                item.responsibleCmsUserDisplayName &&
                item.responsibleCmsUserDisplayName !== item.initiator.displayName
              "
            >
              Ответственный: {{ item.responsibleCmsUserDisplayName }}
            </small>
          </td>
          <td>
            <span class="primary-value">{{
              aiOperationChargedAccountLabel(item.chargedAccount)
            }}</span>
          </td>
          <td class="status-cell">
            <Tag
              :value="aiOperationStatusPresentation(item.status).label"
              :severity="aiOperationStatusPresentation(item.status).severity"
            />
            <small v-if="item.limitationCodes.length" class="limitation">
              {{ aiOperationOutcomeLabel(item.limitationCodes[0], item.status) }}
              <template v-if="item.limitationCodes.length > 1">
                · ещё {{ item.limitationCodes.length - 1 }}
              </template>
            </small>
          </td>
          <td class="number-column">{{ item.usageRecords }}</td>
          <td v-if="canReadCost" class="number-column cost-cell">
            {{ item.cost ? aiOperationCostLabel(item.cost.effectiveCost) : '—' }}
          </td>
          <td class="action-column">
            <RouterLink
              class="row-action"
              :to="{
                name: 'ai-operation-detail',
                params: { operationId: item.operationId },
                query: { projectId },
              }"
              :aria-label="`Открыть детали операции № ${item.projectSequence}`"
            >
              <i class="pi pi-chevron-right" />
            </RouterLink>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.table-scroll {
  min-width: 0;
  overflow-x: auto;
  background: var(--surface-card);
  border: 1px solid var(--line);
  border-radius: 16px;
}
table {
  width: 100%;
  min-width: 1020px;
  border-collapse: collapse;
  table-layout: fixed;
}
thead {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--surface-subtle);
}
th {
  padding: 10px 12px;
  color: var(--muted);
  border-bottom: 1px solid var(--line);
  font-size: 0.7rem;
  font-weight: 750;
  letter-spacing: 0.02em;
  text-align: left;
  white-space: nowrap;
}
th:nth-child(1) {
  width: 130px;
}
th:nth-child(2) {
  width: 270px;
}
th:nth-child(3) {
  width: 150px;
}
th:nth-child(4) {
  width: 150px;
}
th:nth-child(5) {
  width: 140px;
}
th:nth-child(6) {
  width: 80px;
}
th:nth-child(7) {
  width: 100px;
}
th.action-column {
  width: 40px;
}
td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--line);
  color: var(--text-primary);
  font-size: 0.78rem;
  vertical-align: middle;
}
tbody tr:last-child td {
  border-bottom: 0;
}
tbody tr {
  transition: background 0.15s ease;
}
tbody tr:hover {
  background: color-mix(in srgb, var(--brand) 4%, transparent);
}
tbody tr.failed {
  background: color-mix(in srgb, var(--status-danger) 3%, transparent);
}
.time-cell,
.operation-cell,
.status-cell {
  min-width: 0;
}
td small {
  display: block;
  margin-top: 3px;
  overflow: hidden;
  color: var(--muted);
  font-size: 0.68rem;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.operation-link,
.row-action {
  color: var(--text-link);
  font-weight: 750;
  text-decoration: none;
}
.operation-link {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.operation-link:focus-visible,
.row-action:focus-visible {
  outline: 3px solid var(--focus-ring);
  outline-offset: 2px;
}
.primary-value {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.number-column {
  text-align: right;
}
.cost-cell {
  font-weight: 750;
}
.action-column {
  padding-right: 10px;
  padding-left: 4px;
  text-align: center;
}
.row-action {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 9px;
}
.row-action:hover {
  background: color-mix(in srgb, var(--action-primary) 10%, transparent);
}
.limitation {
  color: var(--status-warning);
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
@media (min-width: 760px) {
  .table-scroll {
    max-height: 65vh;
    overflow: auto;
  }
}
</style>
