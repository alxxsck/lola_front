<script setup lang="ts">
import { ref } from 'vue';
import type { ResourceReceipt } from '../model/reporting-types';

defineProps<{ receipt: ResourceReceipt }>();
const expanded = ref(false);

function exactnessLabel(value: ResourceReceipt['exactness']): string {
  return value === 'EXACT' ? 'Точные данные' : 'Оценка';
}

function completenessLabel(value: ResourceReceipt['completeness']): string {
  return value === 'COMPLETE' ? 'Полные данные' : 'Есть исключения';
}
</script>

<template>
  <div class="evidence">
    <div class="evidence-summary">
      <span><i class="pi pi-calendar" aria-hidden="true" />{{ receipt.periodLabel }}</span>
      <span
        ><i class="pi pi-clock" aria-hidden="true" />данные по
        {{
          new Date(receipt.dataAsOf).toLocaleString('ru', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })
        }}</span
      >
      <span
        ><i class="pi pi-check-circle" aria-hidden="true" />{{
          completenessLabel(receipt.completeness)
        }}</span
      >
      <span
        ><i class="pi pi-verified" aria-hidden="true" />{{
          exactnessLabel(receipt.exactness)
        }}</span
      >
      <button type="button" :aria-expanded="expanded" @click="expanded = !expanded">
        Объяснить
        <i :class="expanded ? 'pi pi-chevron-up' : 'pi pi-chevron-down'" aria-hidden="true" />
      </button>
    </div>
    <Transition name="evidence-reveal">
      <dl v-if="expanded" class="evidence-details">
        <div>
          <dt>Часовой пояс</dt>
          <dd>{{ receipt.timezone }}</dd>
        </div>
        <div>
          <dt>Полнота</dt>
          <dd>{{ completenessLabel(receipt.completeness) }}</dd>
        </div>
        <div>
          <dt>Точность</dt>
          <dd>{{ exactnessLabel(receipt.exactness) }}</dd>
        </div>
        <div>
          <dt>Исключения</dt>
          <dd>
            {{ receipt.exclusions.length ? receipt.exclusions.join(', ') : 'Нет' }}
          </dd>
        </div>
      </dl>
    </Transition>
  </div>
</template>

<style scoped>
.evidence {
  border-top: 1px solid var(--border-subtle);
  background: var(--surface-subtle);
}

.evidence-summary {
  display: flex;
  align-items: center;
  gap: 8px 16px;
  min-height: 44px;
  padding: 8px 12px;
  color: var(--text-secondary);
  font-size: var(--font-size-caption);
  font-variant-numeric: tabular-nums;
}

.evidence-summary span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
}

.evidence-summary i {
  color: var(--status-accent-text);
}

.evidence-summary button {
  min-height: 32px;
  margin-left: auto;
  padding: 6px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-link);
  font: 600 var(--font-size-caption) var(--font-display);
  cursor: pointer;
  transition:
    background-color 150ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 120ms cubic-bezier(0.23, 1, 0.32, 1);
}

.evidence-summary button:hover {
  background: var(--surface-hover);
}

.evidence-summary button:active {
  transform: scale(0.97);
}

.evidence-summary button:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.evidence-details {
  display: grid;
  grid-template-columns: repeat(4, minmax(120px, 1fr));
  gap: 12px;
  margin: 0;
  padding: 0 12px 12px;
}

.evidence-details div {
  padding: 10px;
  border-radius: 8px;
  background: var(--surface-card);
}

.evidence-details dt {
  color: var(--text-tertiary);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.evidence-details dd {
  margin: 4px 0 0;
  color: var(--text-primary);
  font-size: var(--font-size-body-small);
}

.evidence-reveal-enter-active,
.evidence-reveal-leave-active {
  transition:
    opacity 180ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 180ms cubic-bezier(0.23, 1, 0.32, 1);
}

.evidence-reveal-enter-from,
.evidence-reveal-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (max-width: 760px) {
  .evidence-summary {
    flex-wrap: wrap;
  }

  .evidence-summary button {
    margin-left: 0;
  }

  .evidence-details {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 420px) {
  .evidence-details {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .evidence-reveal-enter-active,
  .evidence-reveal-leave-active {
    transition: opacity 120ms linear;
  }

  .evidence-reveal-enter-from,
  .evidence-reveal-leave-to {
    transform: none;
  }
}
</style>
