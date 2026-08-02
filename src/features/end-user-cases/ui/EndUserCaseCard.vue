<script setup lang="ts">
import { formatDate, relativeTime } from "@/shared/lib/format";
import type { EndUserCase } from "../model/end-user-case";
import {
  endUserCaseGroupLabel,
  endUserCasePriorityLabel,
  endUserCaseStatusLabel,
} from "../model/end-user-case-presentation";

defineProps<{ item: EndUserCase; selected?: boolean }>();
defineEmits<{ select: [] }>();
</script>

<template>
  <button
    type="button"
    class="case-card"
    :class="[
      `priority-${item.priority.toLowerCase()}`,
      { selected, degraded: item.degradedReason },
    ]"
    :aria-label="`Обращение № ${item.projectSequence}: ${item.title}`"
    :aria-pressed="selected"
    @click="$emit('select')"
  >
    <span class="card-topline">
      <span class="sequence"
        >№ {{ item.projectSequence }} ·
        {{ endUserCaseGroupLabel(item.groupCode) }}</span
      >
      <span class="priority" :class="item.priority.toLowerCase()">
        {{ endUserCasePriorityLabel(item.priority) }}
      </span>
    </span>
    <strong class="title">{{ item.title }}</strong>
    <span class="summary">{{ item.summary || item.goal }}</span>
    <span class="context">
      <span><i class="pi pi-user" /> {{ item.endUser.externalId }}</span>
      <span><i class="pi pi-comments" /> {{ item.messageCount }}</span>
      <span v-if="item.endUserRecontactCount">
        <i class="pi pi-replay" /> Возвратов: {{ item.endUserRecontactCount }}
      </span>
      <time
        :datetime="item.lastActivityAt"
        :title="formatDate(item.lastActivityAt)"
      >
        {{ relativeTime(item.lastActivityAt) }}
      </time>
    </span>
    <span class="status-row">
      <span class="status"
        ><i class="pi pi-circle-fill" />
        {{ endUserCaseStatusLabel(item.status) }}</span
      >
      <span v-if="item.toneTrend === 'WORSENING'" class="tone">
        <i class="pi pi-arrow-down-right" /> Настроение ухудшается
      </span>
      <span v-if="item.degradedReason" class="freshness">
        <i class="pi pi-exclamation-triangle" /> Данные обновляются с задержкой
      </span>
    </span>
  </button>
</template>

<style scoped>
.case-card {
  width: 100%;
  padding: 17px 18px;
  border: 1px solid var(--border-default);
  border-radius: 17px;
  background: var(--surface-card);
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;
}
.case-card:hover {
  border-color: var(--border-strong);
  box-shadow: var(--shadow-raised);
  transform: translateY(-1px);
}
.case-card.selected {
  border-color: var(--action-primary);
  box-shadow: 0 0 0 3px
    color-mix(in srgb, var(--action-primary) 10%, transparent);
}
.case-card.priority-critical,
.case-card.priority-urgent {
  border-left: 4px solid var(--status-warning);
}
.card-topline,
.context,
.status-row,
.status,
.tone,
.freshness {
  display: flex;
  align-items: center;
}
.card-topline {
  justify-content: space-between;
  gap: 12px;
}
.sequence {
  color: var(--text-tertiary);
  font-size: 0.68rem;
  font-weight: 700;
}
.priority {
  padding: 4px 8px;
  border-radius: 999px;
  background: var(--surface-subtle);
  color: var(--text-secondary);
  font-size: 0.64rem;
  font-weight: 800;
}
.priority.urgent,
.priority.critical {
  background: var(--status-warning-soft);
  color: var(--status-warning-text);
}
.title {
  display: block;
  margin-top: 10px;
  font:
    700 0.96rem/1.35 var(--font-display),
    sans-serif;
}
.summary {
  display: -webkit-box;
  margin: 8px 0 13px;
  overflow: hidden;
  color: var(--text-secondary);
  font-size: 0.79rem;
  line-height: 1.5;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.context,
.status-row {
  flex-wrap: wrap;
  gap: 7px 12px;
  color: var(--text-tertiary);
  font-size: 0.68rem;
}
.status-row {
  margin-top: 11px;
  padding-top: 11px;
  border-top: 1px solid var(--border-subtle);
}
.status,
.tone,
.freshness {
  gap: 5px;
}
.status {
  color: var(--text-secondary);
  font-weight: 700;
}
.status i {
  color: var(--action-primary);
  font-size: 0.42rem;
}
.tone,
.freshness {
  color: var(--status-warning-text);
}
</style>
