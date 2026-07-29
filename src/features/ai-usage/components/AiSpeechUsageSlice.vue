<script setup lang="ts">
import { computed } from 'vue'
import {
  formatMoney,
  formatTokenCount,
  pluralizeRu,
  type AiTextToSpeechPricingContext,
  type AiUsageCategoryBreakdown,
} from '../ai-usage.model'

const props = defineProps<{
  usage?: AiUsageCategoryBreakdown
  pricing: AiTextToSpeechPricingContext
  fallbackCurrency?: string
}>()

const currentRate = computed(() => {
  const current = props.pricing.current
  if (!current) return 'Текущая ставка не настроена'
  return `${formatMoney(Number(current.rate), current.currency)} за 1 000 000 входных символов`
})
const currentRateDate = computed(() => {
  const current = props.pricing.current
  if (!current) return ''
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(current.effectiveFrom))
})

function generationCount(value: number) {
  return `${formatTokenCount(value)} ${pluralizeRu(value, 'генерация', 'генерации', 'генераций')}`
}
</script>

<template>
  <section
    class="usage-slice speech-slice"
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

    <aside class="pricing-context" aria-label="Тариф озвучивания текста">
      <i class="pi pi-info-circle" />
      <div>
        <strong>{{ currentRate }}</strong>
        <span v-if="currentRateDate"> Действует с {{ currentRateDate }}. </span>
        <span>
          История рассчитана по ставке, действовавшей в момент каждой операции.
        </span>
        <span> Если ставка xAI изменилась, сообщите администрации. </span>
        <a :href="pricing.sourceUrl" target="_blank" rel="noopener noreferrer">
          Проверить тариф xAI
        </a>
      </div>
    </aside>
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

.slice-summary span {
  display: block;
  margin-top: 3px;
  color: var(--text-small-muted);
  font-size: 0.61rem;
}

.pricing-context {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 11px 13px;
  margin-top: 12px;
  border: 1px solid
    color-mix(in srgb, var(--status-violet) 30%, var(--border-default));
  border-radius: 12px;
  background: var(--status-violet-soft);
  color: var(--status-violet-text);
  font-size: 0.7rem;
  line-height: 1.45;
}

.pricing-context > div {
  display: grid;
  gap: 3px;
}

.pricing-context a {
  width: fit-content;
  margin-top: 3px;
  color: var(--text-link);
  font-weight: 700;
  text-decoration: none;
}

.pricing-context a:hover {
  text-decoration: underline;
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
