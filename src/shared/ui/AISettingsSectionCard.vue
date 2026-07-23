<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import Message from "primevue/message";

const props = withDefaults(
  defineProps<{
    title: string;
    description: string;
    loading: boolean;
    error?: string;
    columns?: string;
    loadingLabel?: string;
  }>(),
  {
    error: "",
    columns: "minmax(240px, 1.4fr) minmax(180px, 1fr) auto",
    loadingLabel: "Загружаем настройки…",
  },
);

const sectionStyle = computed(
  () =>
    ({
      "--ai-settings-columns": props.columns,
    }) as CSSProperties,
);
</script>

<template>
  <section class="settings-section card ai-settings" :style="sectionStyle">
    <header>
      <span class="icon"><i class="pi pi-sparkles" /></span>
      <div>
        <h2>{{ title }}</h2>
        <p>{{ description }}</p>
      </div>
    </header>
    <Message v-if="error" severity="error" :closable="false">{{
      error
    }}</Message>
    <p v-if="loading" class="loading">
      <i class="pi pi-spin pi-spinner" /> {{ loadingLabel }}
    </p>
    <slot v-else />
  </section>
</template>

<style scoped>
.ai-settings {
  padding: 26px;
}
.ai-settings header {
  display: flex;
  gap: 13px;
  align-items: flex-start;
  padding-bottom: 18px;
  margin-bottom: 18px;
  border-bottom: 1px solid var(--border-subtle);
}
.ai-settings h2 {
  font-size: 1.08rem;
}
.ai-settings p {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 0.76rem;
  line-height: 1.5;
}
.icon {
  display: grid;
  place-items: center;
  width: 39px;
  height: 39px;
  flex: 0 0 auto;
  border-radius: 12px;
  background: var(--status-violet-soft);
  color: var(--status-violet-text);
}
.ai-settings :deep(form) {
  display: grid;
  grid-template-columns: var(--ai-settings-columns);
  gap: 14px;
  align-items: end;
}
.ai-settings :deep(label) {
  display: grid;
  gap: 7px;
  padding: 14px;
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  background: var(--surface-subtle);
  font-size: 0.74rem;
  font-weight: 700;
}
.ai-settings :deep(.switch-row) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}
.ai-settings :deep(.switch-row span) {
  display: grid;
  gap: 3px;
}
.ai-settings :deep(.switch-row small) {
  color: var(--text-small-muted);
  font-size: 0.65rem;
  font-weight: 400;
}
.loading {
  padding: 14px;
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  background: var(--surface-subtle);
}
@media (max-width: 900px) {
  .ai-settings :deep(form) {
    grid-template-columns: 1fr;
  }
  .ai-settings :deep(.p-button) {
    width: 100%;
  }
}
</style>
