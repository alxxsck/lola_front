<script setup lang="ts">
import {
  formatMoney,
  formatTokenCount,
  pluralizeRu,
  type AiTextToSpeechPricingContext,
  type AiUsageCategoryBreakdown,
} from '../ai-usage.model'
import AiTtsPricingContext from './AiTtsPricingContext.vue'

const props = defineProps<{
  usage?: AiUsageCategoryBreakdown
  pricing: AiTextToSpeechPricingContext
  fallbackCurrency?: string
}>()

function generationCount(value: number) {
  return `${formatTokenCount(value)} ${pluralizeRu(value, 'генерация', 'генерации', 'генераций')}`
}
</script>

<template>
  <section
    class="ai-usage-slice speech-slice"
    aria-labelledby="speech-usage-title"
  >
    <header class="slice-header">
      <div>
        <span class="provider-kicker">Text to Speech</span>
        <h4 id="speech-usage-title">Озвучивание текста</h4>
        <p>
          Расчёт по входным символам; xAI не возвращает per-request фактическую
          стоимость.
        </p>
      </div>
      <span class="slice-icon"><i class="pi pi-volume-up" /></span>
    </header>
    <div class="slice-summary">
      <article>
        <small>Входной текст</small>
        <strong>{{ formatTokenCount(usage?.inputCharacters ?? 0) }}</strong>
        <span>символов</span>
      </article>
      <article>
        <small>Генерации</small>
        <strong>{{ generationCount(usage?.records ?? 0) }}</strong>
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

    <AiTtsPricingContext class="pricing-context" :pricing="pricing" />
  </section>
</template>

<style src="./ai-usage-slice.css"></style>

<style scoped>
.pricing-context {
  margin-top: 12px;
}
</style>
