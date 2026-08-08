<script setup lang="ts">
import Button from "primevue/button";
import Skeleton from "primevue/skeleton";

withDefaults(
  defineProps<{
    loading: boolean;
    error: string;
    empty: boolean;
    hasContent?: boolean;
    emptyTitle: string;
    emptyCopy: string;
    emptyIcon: string;
  }>(),
  { hasContent: false },
);

defineEmits<{ retry: [] }>();
</script>

<template>
  <div class="inspector-resource" :aria-busy="loading">
    <div v-if="loading && !hasContent" class="inspector-resource__skeletons">
      <div v-for="index in 3" :key="index">
        <Skeleton width="42%" height="10px" />
        <Skeleton width="86%" height="16px" />
        <Skeleton width="62%" height="10px" />
      </div>
    </div>
    <div
      v-else-if="error && !hasContent"
      class="inspector-resource__state"
      role="alert"
    >
      <span class="inspector-resource__icon is-error">
        <i class="pi pi-exclamation-circle" aria-hidden="true" />
      </span>
      <strong>Не удалось загрузить раздел</strong>
      <p>{{ error }}</p>
      <Button
        label="Повторить"
        icon="pi pi-refresh"
        size="small"
        severity="secondary"
        outlined
        @click="$emit('retry')"
      />
    </div>
    <div v-else-if="empty" class="inspector-resource__state">
      <span class="inspector-resource__icon">
        <i :class="emptyIcon" aria-hidden="true" />
      </span>
      <strong>{{ emptyTitle }}</strong>
      <p>{{ emptyCopy }}</p>
    </div>
    <template v-else><slot /></template>

    <div
      v-if="error && hasContent"
      class="inspector-resource__inline-error"
      role="alert"
    >
      <span>{{ error }}</span>
      <button type="button" @click="$emit('retry')">Повторить</button>
    </div>
  </div>
</template>

<style scoped>
.inspector-resource {
  min-height: 180px;
}
.inspector-resource__skeletons {
  display: grid;
  gap: 18px;
  padding-top: 4px;
}
.inspector-resource__skeletons > div {
  display: grid;
  gap: 8px;
}
.inspector-resource__state {
  min-height: 240px;
  padding: 28px 18px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-muted);
  text-align: center;
}
.inspector-resource__state strong {
  color: var(--text-primary);
  font-size: 0.82rem;
}
.inspector-resource__state p {
  max-width: 280px;
  margin: 0;
  font-size: 0.74rem;
  line-height: 1.5;
  text-wrap: pretty;
}
.inspector-resource__icon {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: var(--brand-soft);
  color: var(--brand);
  font-size: 1rem;
}
.inspector-resource__icon.is-error {
  background: var(--status-danger-soft);
  color: var(--status-danger-text);
}
.inspector-resource__inline-error {
  margin-top: 12px;
  padding: 9px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-radius: 10px;
  background: var(--status-danger-soft);
  color: var(--status-danger-text);
  font-size: 0.7rem;
}
.inspector-resource__inline-error button {
  min-height: 32px;
  padding: 0 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 750;
  cursor: pointer;
}
.inspector-resource__inline-error button:focus-visible {
  outline: 3px solid var(--focus-ring);
  outline-offset: 1px;
}
</style>
