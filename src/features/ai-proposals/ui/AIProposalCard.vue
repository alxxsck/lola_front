<script setup lang="ts">
import { computed } from "vue";
import type { AIProposalListItem } from "../model/ai-proposal";
import {
  proposalPriorityLabel,
  proposalSourcePresentation,
  proposalWorkflowLabel,
} from "../model/ai-proposal-presentation";
import { formatDate, relativeTime } from "@/shared/lib/format";

const props = defineProps<{
  proposal: AIProposalListItem;
  selected?: boolean;
}>();
defineEmits<{ select: [] }>();

const source = computed(() =>
  proposalSourcePresentation(props.proposal.sourceType),
);
const priorityLabel = computed(() =>
  proposalPriorityLabel(props.proposal.priority),
);
const statusLabel = computed(() =>
  proposalWorkflowLabel(props.proposal.workflowStatus),
);
</script>

<template>
  <button
    type="button"
    class="proposal-card"
    :class="{
      selected,
      unread: !proposal.isRead,
      'needs-action': proposal.workflowStatus === 'OPEN',
      high: proposal.priority === 'HIGH' || proposal.priority === 'URGENT',
    }"
    :aria-label="`${proposal.isRead ? '' : 'Непрочитанное предложение. '}${proposal.title}`"
    :aria-pressed="selected"
    @click="$emit('select')"
  >
    <span class="card-topline">
      <span class="source-label"
        ><i :class="source.icon" />{{ source.label }}</span
      >
      <span class="priority-label" :class="proposal.priority.toLowerCase()">{{
        priorityLabel
      }}</span>
    </span>
    <span class="card-title-row">
      <span v-if="!proposal.isRead" class="unread-dot" aria-hidden="true" />
      <strong>{{ proposal.title }}</strong>
    </span>
    <span class="card-summary">{{ proposal.summary }}</span>
    <span class="card-context">
      <span v-if="proposal.endUser">
        <i class="pi pi-user" />
        {{ proposal.endUser.displayName ?? proposal.endUser.externalId }}
      </span>
      <time
        :datetime="proposal.createdAt"
        :title="formatDate(proposal.createdAt)"
      >
        {{ relativeTime(proposal.createdAt) }}
      </time>
      <span
        class="workflow-label"
        :class="proposal.workflowStatus.toLowerCase()"
      >
        {{ statusLabel }}
      </span>
    </span>
  </button>
</template>

<style scoped>
.proposal-card {
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
.proposal-card:hover {
  border-color: var(--border-strong);
  box-shadow: var(--shadow-raised);
  transform: translateY(-1px);
}
.proposal-card.selected {
  border-color: color-mix(
    in srgb,
    var(--action-primary) 52%,
    var(--border-default)
  );
  box-shadow: 0 0 0 3px
    color-mix(in srgb, var(--action-primary) 10%, transparent);
}
.proposal-card.unread {
  background: linear-gradient(
    115deg,
    color-mix(in srgb, var(--status-violet-soft) 62%, var(--surface-card)),
    var(--surface-card) 58%
  );
}
.proposal-card.needs-action {
  border-color: color-mix(
    in srgb,
    var(--action-primary) 38%,
    var(--border-default)
  );
  box-shadow: inset 3px 0 0 var(--action-primary);
}
.proposal-card.selected.needs-action {
  border-color: color-mix(
    in srgb,
    var(--action-primary) 62%,
    var(--border-default)
  );
  box-shadow:
    inset 3px 0 0 var(--action-primary),
    0 0 0 3px color-mix(in srgb, var(--action-primary) 12%, transparent);
}
.proposal-card.high {
  border-left: 3px solid var(--status-warning);
}
.card-topline,
.card-context,
.card-title-row,
.source-label,
.card-context > span {
  display: flex;
  align-items: center;
}
.card-topline {
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}
.source-label {
  gap: 6px;
  color: var(--text-secondary);
  font-size: 0.72rem;
  font-weight: 700;
}
.source-label i {
  color: var(--status-violet);
}
.priority-label {
  padding: 4px 8px;
  border-radius: 999px;
  background: var(--surface-subtle);
  color: var(--text-secondary);
  font-size: 0.64rem;
  font-weight: 700;
}
.priority-label.high,
.priority-label.urgent {
  background: var(--status-warning-soft);
  color: var(--status-warning-text);
}
.card-title-row {
  gap: 9px;
}
.card-title-row strong {
  font:
    700 0.94rem/1.35 Manrope,
    sans-serif;
}
.unread-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--action-primary);
  box-shadow: 0 0 0 4px
    color-mix(in srgb, var(--action-primary) 12%, transparent);
}
.card-summary {
  display: -webkit-box;
  margin: 8px 0 14px;
  overflow: hidden;
  color: var(--text-secondary);
  font-size: 0.79rem;
  line-height: 1.5;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.card-context {
  flex-wrap: wrap;
  gap: 8px 12px;
  color: var(--text-tertiary);
  font-size: 0.68rem;
}
.card-context > span {
  gap: 5px;
}
.workflow-label {
  margin-left: auto;
  color: var(--text-secondary);
  font-weight: 700;
}
.workflow-label.resolved {
  color: var(--status-success-text);
}
@media (max-width: 560px) {
  .proposal-card {
    padding: 15px;
  }
  .workflow-label {
    width: 100%;
    margin-left: 0;
  }
}
</style>
