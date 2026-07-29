<script setup lang="ts">
import {
  formatDuration,
  formatMoney,
  formatTokenCount,
  pluralizeRu,
  type AiUsageCategoryBreakdown,
} from '../ai-usage.model'

const props = defineProps<{
  usage?: AiUsageCategoryBreakdown
  fallbackCurrency?: string
}>()

function operationCount(value: number) {
  return `${formatTokenCount(value)} ${pluralizeRu(value, 'операция', 'операции', 'операций')}`
}
</script>

<template>
  <section class="usage-slice voice-slice" aria-labelledby="voice-usage-title">
    <header class="slice-header">
      <div>
        <span class="provider-kicker">Realtime</span>
        <h4 id="voice-usage-title">Голосовой чат</h4>
        <p>Расход интерактивного аудио и текстовых событий Realtime.</p>
      </div>
      <span class="slice-icon"><i class="pi pi-microphone" /></span>
    </header>
    <div class="slice-summary">
      <article>
        <small>Длительность</small>
        <strong>{{ formatDuration(usage?.durationSeconds ?? 0) }}</strong>
      </article>
      <article>
        <small>Операции</small>
        <strong>{{ operationCount(usage?.records ?? 0) }}</strong>
      </article>
      <article>
        <small>Расчётная стоимость</small>
        <strong>{{
          formatMoney(
            usage?.estimatedFallbackCost ?? 0,
            usage?.currency ?? props.fallbackCurrency ?? 'USD',
          )
        }}</strong>
      </article>
    </div>
    <p class="calculation-note">
      <i class="pi pi-info-circle" />
      Расчёт по публичному тарифу xAI.
    </p>
  </section>
</template>

<style scoped>
.usage-slice {
  min-width: 0;
  padding: 18px;
  margin-top: 16px;
  border: 1px solid var(--border-default);
  border-radius: 17px;
  background: var(--surface-card);
}

.slice-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.slice-header h4 {
  margin: 0;
  font-size: 0.95rem;
}

.slice-header p {
  margin: 3px 0 0;
  color: var(--text-small-muted);
  font-size: 0.7rem;
  line-height: 1.45;
}

.provider-kicker {
  display: block;
  margin-bottom: 3px;
  color: var(--text-small-muted);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.11em;
  text-transform: uppercase;
}

.slice-icon {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  border-radius: 13px;
  background: var(--status-violet-soft);
  color: var(--status-violet);
}

.slice-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 14px;
}

.slice-summary article {
  min-width: 0;
  padding: 13px;
  border: 1px solid var(--border-default);
  border-radius: 15px;
  background: var(--surface-subtle);
}

.slice-summary small {
  display: block;
  color: var(--text-small-muted);
  font-size: 0.66rem;
  font-weight: 600;
}

.slice-summary strong {
  display: block;
  margin-top: 6px;
  font: 700 1rem var(--font-display);
  overflow-wrap: anywhere;
}

.calculation-note {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 11px 13px;
  margin: 12px 0 0;
  border: 1px solid
    color-mix(in srgb, var(--status-violet) 24%, var(--border-default));
  border-radius: 12px;
  background: var(--status-violet-soft);
  color: var(--status-violet-text);
  font-size: 0.7rem;
  line-height: 1.45;
}

@media (max-width: 650px) {
  .usage-slice {
    padding: 16px;
  }

  .slice-header {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .slice-summary {
    grid-template-columns: 1fr;
  }
}
</style>
