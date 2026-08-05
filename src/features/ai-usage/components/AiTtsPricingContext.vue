<script setup lang="ts">
import { computed } from 'vue'
import { formatExactCurrencyRate } from '@/features/ai-pricing/ai-pricing.model'
import type { AiTextToSpeechPricingContext } from '../ai-usage.model'

const props = defineProps<{
  pricing: AiTextToSpeechPricingContext
}>()

const currentRate = computed(() => {
  const current = props.pricing.current
  if (!current) return 'Текущая ставка не настроена'
  return `${formatExactCurrencyRate(current.rate, current.currency)} за 1 000 000 входных символов`
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
</script>

<template>
  <aside class="tts-pricing-context" aria-label="Тариф озвучивания текста">
    <i class="pi pi-info-circle" />
    <div>
      <strong>{{ currentRate }}</strong>
      <span v-if="currentRateDate">Действует с {{ currentRateDate }}.</span>
      <span>
        История рассчитана по ставке, действовавшей в момент каждой операции.
      </span>
      <span>Если ставка xAI изменилась, сообщите администрации.</span>
      <a
        :href="pricing.sourceUrl"
        target="_blank"
        rel="noopener noreferrer"
      >
        Проверить тариф xAI
      </a>
    </div>
  </aside>
</template>

<style scoped>
.tts-pricing-context {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 11px 13px;
  border: 1px solid
    color-mix(in srgb, var(--status-accent) 30%, var(--border-default));
  border-radius: 12px;
  background: var(--status-accent-soft);
  color: var(--status-accent-text);
  font-size: 0.7rem;
  line-height: 1.45;
}

.tts-pricing-context > i {
  margin-top: 2px;
  color: var(--status-accent);
}

.tts-pricing-context > div {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.tts-pricing-context strong {
  color: var(--text-primary);
  overflow-wrap: anywhere;
}

.tts-pricing-context a {
  width: fit-content;
  margin-top: 3px;
  color: var(--text-link);
  font-weight: 700;
  text-decoration: none;
}

.tts-pricing-context a:hover {
  text-decoration: underline;
}
</style>
