<script setup lang="ts">
import type { SupportInboxMode } from '@/features/support-workspace/api/support-workspace-source';

defineProps<{
  mode: SupportInboxMode;
  count: number;
}>();
</script>

<template>
  <div
    :class="['inbox-skeletons', mode === 'CASES' ? 'is-case' : 'is-conversation']"
    aria-busy="true"
  >
    <div
      v-for="index in count"
      :key="index"
      :class="['inbox-skeleton-row', mode === 'CASES' ? 'is-case' : 'is-conversation']"
    >
      <span class="inbox-skeleton-marker support-loading-shimmer" />
      <span class="inbox-skeleton-body">
        <span class="inbox-skeleton-title support-loading-shimmer" />
        <span class="inbox-skeleton-meta support-loading-shimmer" />
      </span>
      <span class="inbox-skeleton-time support-loading-shimmer" />
    </div>
  </div>
</template>

<style scoped>
.inbox-skeletons {
  min-height: 0;
  flex: 1;
  display: grid;
  grid-auto-rows: 72px;
  align-content: start;
  overflow: auto;
  overscroll-behavior: contain;
}
.inbox-skeletons.is-case {
  grid-auto-rows: 68px;
}
.inbox-skeleton-row {
  height: 72px;
  padding: 12px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  border-bottom: 1px solid var(--line);
}
.inbox-skeleton-row.is-case {
  height: 68px;
  padding: 8px 12px;
}
.inbox-skeleton-marker,
.inbox-skeleton-title,
.inbox-skeleton-meta,
.inbox-skeleton-time {
  border-radius: 4px;
}
.inbox-skeleton-marker {
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  border-radius: 9px;
}
.inbox-skeleton-row.is-conversation .inbox-skeleton-marker {
  border-radius: 50%;
}
.inbox-skeleton-row.is-case .inbox-skeleton-marker {
  width: 20px;
  height: 8px;
  flex-basis: 28px;
  margin-top: 4px;
  background-clip: content-box;
}
.inbox-skeleton-body {
  min-width: 0;
  flex: 1;
  display: grid;
  grid-template-rows: 12px 8px;
  align-content: center;
  gap: 8px;
}
.inbox-skeleton-row.is-case .inbox-skeleton-body {
  gap: 8px;
}
.inbox-skeleton-title {
  width: min(78%, 188px);
  height: 12px;
}
.inbox-skeleton-meta {
  width: min(56%, 132px);
  height: 8px;
}
.inbox-skeleton-time {
  width: 44px;
  height: 8px;
  flex: 0 0 44px;
  margin-top: 4px;
}
</style>
