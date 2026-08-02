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
  <section
    class="ai-usage-slice voice-slice"
    aria-labelledby="voice-usage-title"
  >
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
            usage?.estimatedFallbackCost ?? '0',
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

<style src="./ai-usage-slice.css"></style>

<style scoped>
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

</style>
