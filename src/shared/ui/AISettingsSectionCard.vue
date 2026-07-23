<script setup lang="ts">
import Message from "primevue/message";

withDefaults(
  defineProps<{
    title: string;
    description: string;
    loading: boolean;
    error?: string;
    icon?: string;
    loadingLabel?: string;
  }>(),
  {
    error: "",
    icon: "pi pi-sparkles",
    loadingLabel: "Загружаем настройки…",
  },
);
</script>

<template>
  <section class="settings-section card ai-settings">
    <header>
      <span class="icon"><i :class="icon" /></span>
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
.ai-settings :deep(.settings-editor) {
  display: grid;
  gap: 20px;
}
.ai-settings :deep(.settings-fields) {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.ai-settings :deep(.settings-fields.single-column) {
  grid-template-columns: 1fr;
}
.ai-settings :deep(.setting-card) {
  display: grid;
  gap: 10px;
  min-width: 0;
  padding: 17px 18px;
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  background: var(--surface-subtle);
  font-size: 0.76rem;
  font-weight: 700;
}
.ai-settings :deep(.setting-card > span:first-child) {
  line-height: 1.35;
}
.ai-settings :deep(.feature-toggle) {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 19px 20px;
  border-color: color-mix(
    in srgb,
    var(--status-violet) 18%,
    var(--border-subtle)
  );
  background: color-mix(
    in srgb,
    var(--status-violet-soft) 48%,
    var(--surface-card)
  );
}
.ai-settings :deep(.feature-toggle > span) {
  display: grid;
  gap: 4px;
}
.ai-settings :deep(.feature-toggle strong) {
  font-size: 0.82rem;
}
.ai-settings :deep(.feature-toggle small),
.ai-settings :deep(.field-hint),
.ai-settings :deep(.settings-actions small) {
  color: var(--text-small-muted);
  font-size: 0.65rem;
  font-weight: 400;
  line-height: 1.45;
}
.ai-settings :deep(.field-card .p-inputnumber),
.ai-settings :deep(.field-card .p-inputnumber-input) {
  width: 100%;
}
.ai-settings :deep(.field-card .p-inputnumber-input) {
  min-height: 44px;
  font-size: 0.82rem;
  font-weight: 600;
}
.ai-settings :deep(.settings-actions) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding-top: 18px;
  border-top: 1px solid var(--border-subtle);
}
.ai-settings :deep(.settings-actions-copy) {
  display: grid;
  gap: 3px;
}
.ai-settings :deep(.settings-actions-copy strong) {
  font-size: 0.76rem;
}
.ai-settings :deep(.settings-actions .p-button) {
  min-width: 200px;
}
.loading {
  padding: 14px;
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  background: var(--surface-subtle);
}
@media (max-width: 700px) {
  .ai-settings {
    padding: 20px;
  }
  .ai-settings :deep(.settings-fields) {
    grid-template-columns: 1fr;
  }
  .ai-settings :deep(.feature-toggle) {
    grid-column: auto;
  }
  .ai-settings :deep(.settings-actions) {
    align-items: stretch;
    flex-direction: column;
  }
  .ai-settings :deep(.settings-actions .p-button) {
    min-width: 0;
    width: 100%;
  }
}
</style>
