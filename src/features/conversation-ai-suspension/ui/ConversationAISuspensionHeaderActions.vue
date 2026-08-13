<script setup lang="ts">
import { computed } from 'vue';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import type { ConversationAISuspensionEntry } from '../model/conversation-ai-suspension.store';
import { isConversationAISuspended } from '../model/suspension-state';

const props = withDefaults(
  defineProps<{
    entry: ConversationAISuspensionEntry;
    canManage: boolean;
    conversationOpen: boolean;
    hideActiveStatus?: boolean;
    showHistory?: boolean;
  }>(),
  {
    hideActiveStatus: false,
    showHistory: true,
  },
);

defineEmits<{
  start: [];
  history: [];
  retry: [];
}>();

const active = computed(
  () =>
    !props.entry.error &&
    !props.entry.locallyExpired &&
    isConversationAISuspended(props.entry.summary, Date.now() + props.entry.serverOffsetMs),
);
const hasHistory = computed(() => props.entry.summary.version !== '0');
const hasActions = computed(
  () =>
    (props.canManage && props.conversationOpen) ||
    (hasHistory.value && props.showHistory) ||
    Boolean(props.entry.error),
);
</script>

<template>
  <Tag v-if="active && !hideActiveStatus" value="AI приостановлен" severity="warn" rounded />
  <div v-else-if="hasActions" class="ai-suspension-header-actions">
    <Button
      v-if="!active && canManage && conversationOpen"
      label="AI активен · приостановить"
      aria-label="Приостановить AI"
      class="ai-suspension-header-actions__start"
      icon="pi pi-circle-fill"
      severity="secondary"
      outlined
      size="small"
      :loading="entry.loading && !entry.error"
      :disabled="Boolean(entry.error)"
      @click="$emit('start')"
    />
    <Button
      v-if="hasHistory && showHistory"
      icon="pi pi-history"
      aria-label="История приостановок AI"
      title="История приостановок AI"
      severity="secondary"
      text
      rounded
      size="small"
      @click="$emit('history')"
    />
    <Button
      v-if="entry.error"
      icon="pi pi-refresh"
      aria-label="Повторить проверку состояния AI"
      title="Повторить проверку состояния AI"
      severity="warn"
      text
      rounded
      size="small"
      @click="$emit('retry')"
    />
  </div>
</template>

<style scoped>
.ai-suspension-header-actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-left: 3px;
  padding-left: 10px;
  border-left: 1px solid var(--line);
}
.ai-suspension-header-actions :deep(.p-button) {
  min-height: 32px;
  border-color: var(--border-default);
  border-radius: 8px;
  color: var(--text-small-muted);
  font-size: 12px;
  white-space: nowrap;
}
.ai-suspension-header-actions :deep(.p-button .pi-circle-fill) {
  color: var(--status-success);
  font-size: 6px;
}
@media (max-width: 560px) {
  .ai-suspension-header-actions {
    margin-left: 0;
    padding-left: 0;
    border-left: 0;
  }
  .ai-suspension-header-actions :deep(.p-button) {
    min-height: 44px;
  }
  .ai-suspension-header-actions :deep(.p-button-icon-only) {
    width: 44px;
  }
  .ai-suspension-header-actions__start :deep(.p-button-label) {
    max-width: none;
    font-size: 0;
  }
  .ai-suspension-header-actions__start :deep(.p-button-label::after) {
    content: 'AI · пауза';
    font-size: 11px;
  }
}
</style>
