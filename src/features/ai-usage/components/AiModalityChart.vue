<script setup lang="ts">
import { computed } from 'vue'
import type { AiUsageTotals } from '../ai-usage.model'
import { formatTokenCount, getModalityUsage } from '../ai-usage.model'

const props = defineProps<{ totals: AiUsageTotals }>()

const radius = 46
const circumference = 2 * Math.PI * radius
const modalities = computed(() => getModalityUsage(props.totals))
const modalityTotal = computed(() => modalities.value.reduce((sum, item) => sum + item.tokens, 0))
const chartSegments = computed(() => {
  let offset = 0
  return modalities.value.map((item) => {
    const length = modalityTotal.value ? (item.tokens / modalityTotal.value) * circumference : 0
    const segment = { ...item, length, offset: -offset }
    offset += length
    return segment
  })
})
const chartLabel = computed(() => modalities.value
  .map((item) => `${item.label}: ${formatTokenCount(item.tokens)} токенов`)
  .join('. '))

function percentage(tokens: number): string {
  if (!modalityTotal.value) return '0%'
  const value = (tokens / modalityTotal.value) * 100
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: value < 1 ? 1 : 0 }).format(value)}%`
}
</script>

<template>
  <section class="chart-card" aria-labelledby="modality-usage-title">
    <header class="chart-header">
      <div>
        <span class="chart-kicker">Форматы</span>
        <h3 id="modality-usage-title">Текст, голос и изображения</h3>
      </div>
      <span class="direction-badge">{{ formatTokenCount(totals.inputTokens) }} in · {{ formatTokenCount(totals.outputTokens) }} out</span>
    </header>

    <div v-if="modalityTotal" class="modality-layout">
      <div class="donut-wrap">
        <svg viewBox="0 0 120 120" role="img" :aria-label="chartLabel">
          <circle class="donut-track" cx="60" cy="60" :r="radius" />
          <circle
            v-for="segment in chartSegments"
            :key="segment.key"
            class="donut-segment"
            cx="60"
            cy="60"
            :r="radius"
            :stroke="segment.color"
            :stroke-dasharray="`${segment.length} ${circumference - segment.length}`"
            :stroke-dashoffset="segment.offset"
          />
        </svg>
        <div class="donut-total"><strong>{{ formatTokenCount(modalityTotal) }}</strong><span>токенов</span></div>
      </div>

      <div class="modality-legend">
        <div v-for="item in modalities" :key="item.key" class="legend-row">
          <span class="legend-dot" :style="{ backgroundColor: item.color }" />
          <span><strong>{{ item.label }}</strong><small>{{ formatTokenCount(item.tokens) }} токенов</small></span>
          <b>{{ percentage(item.tokens) }}</b>
        </div>
      </div>
    </div>
    <div v-else class="chart-empty"><i class="pi pi-chart-pie" /><span>Детализация по форматам пока отсутствует</span></div>

    <footer class="cache-row">
      <span><i class="pi pi-bolt" /> Повторно использовано из кэша</span>
      <strong>{{ formatTokenCount(totals.cachedInputTokens) }} токенов</strong>
    </footer>
  </section>
</template>

<style scoped>
.chart-card{min-width:0;padding:22px;border:1px solid #e7e8e2;border-radius:17px;background:#fff}.chart-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:18px}.chart-kicker{display:block;margin-bottom:5px;color:#8b9086;font-size:.65rem;font-weight:700;letter-spacing:.11em;text-transform:uppercase}.chart-header h3{margin:0;font-size:1rem}.direction-badge{padding:7px 9px;border:1px solid #e7e8e2;border-radius:9px;color:#777c72;font-size:.63rem;font-weight:700;white-space:nowrap}.modality-layout{display:grid;grid-template-columns:minmax(150px,.85fr) minmax(170px,1.15fr);align-items:center;gap:20px;min-height:225px}.donut-wrap{position:relative;max-width:190px;margin:auto}.donut-wrap svg{display:block;width:100%;overflow:visible;transform:rotate(-90deg)}.donut-track,.donut-segment{fill:none;stroke-width:12}.donut-track{stroke:#eff0eb}.donut-segment{stroke-linecap:butt;transition:stroke-dasharray .35s ease}.donut-total{position:absolute;inset:0;display:grid;place-content:center;text-align:center}.donut-total strong{font:700 1.35rem Manrope}.donut-total span{margin-top:2px;color:#8d9288;font-size:.62rem}.modality-legend{display:flex;flex-direction:column}.legend-row{display:grid;grid-template-columns:8px minmax(0,1fr) auto;align-items:center;gap:9px;padding:12px 0;border-bottom:1px solid #eeefe9}.legend-row:last-child{border-bottom:0}.legend-dot{width:8px;height:8px;border-radius:50%}.legend-row strong,.legend-row small{display:block}.legend-row strong{font-size:.74rem}.legend-row small{margin-top:2px;color:#92978d;font-size:.62rem}.legend-row b{font-size:.74rem}.cache-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 13px;border-radius:11px;background:#f7f8f4;color:#72776d;font-size:.66rem}.cache-row i{margin-right:5px;color:#99bd2e}.cache-row strong{color:#373b34}.chart-empty{display:grid;place-items:center;min-height:225px;color:#999e94;font-size:.75rem}.chart-empty i{margin-bottom:-65px;font-size:1.65rem;color:#c4c7bf}
@media(max-width:600px){.chart-header{align-items:stretch;flex-direction:column}.direction-badge{align-self:flex-start}.modality-layout{grid-template-columns:1fr}.donut-wrap{width:165px}.chart-card{padding:18px}}
</style>
