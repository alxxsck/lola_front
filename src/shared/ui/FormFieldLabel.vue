<script setup lang="ts">
defineProps<{
  text: string;
  help: string;
}>();
</script>

<template>
  <span class="field-label">
    <span>{{ text }}</span>
    <span
      class="field-label__help"
      data-testid="field-help"
      :data-help="help"
      :aria-label="`${text}. ${help}`"
      tabindex="0"
      role="note"
    >
      <i class="pi pi-info-circle" aria-hidden="true" />
    </span>
  </span>
</template>

<style scoped>
.field-label {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
  color: var(--text-primary);
  font-size: 0.84rem;
  font-weight: 600;
  line-height: 1.25;
}
.field-label__help {
  position: static;
  display: inline-grid;
  place-items: center;
  width: 20px;
  height: 20px;
  margin: -2px;
  border-radius: 50%;
  color: var(--text-secondary);
  cursor: help;
  outline: none;
}
.field-label__help i {
  font-size: 0.78rem;
}
.field-label__help::after {
  content: attr(data-help);
  position: absolute;
  z-index: 40;
  right: 0;
  bottom: calc(100% + 7px);
  width: min(280px, 70vw);
  padding: 9px 10px;
  border: 1px solid var(--border-subtle);
  border-radius: 9px;
  background: var(--surface-card);
  box-shadow: var(--shadow-raised);
  color: var(--text-primary);
  font-size: 0.76rem;
  font-weight: 400;
  line-height: 1.4;
  text-align: left;
  white-space: normal;
  opacity: 0;
  pointer-events: none;
  transform: translateY(4px);
  transition:
    opacity 0.14s ease,
    transform 0.14s ease;
}
.field-label__help:hover,
.field-label__help:focus-visible {
  color: var(--action-primary);
  background: var(--surface-subtle);
}
.field-label__help:hover::after,
.field-label__help:focus-visible::after {
  opacity: 1;
  transform: translateY(0);
}
@media (prefers-reduced-motion: reduce) {
  .field-label__help::after {
    transition: none;
  }
}
</style>
