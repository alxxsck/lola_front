<script setup lang="ts">
import { computed } from 'vue'
import type { AiCreditUsage } from '../ai-usage.model'
import { formatTokenCount, pluralizeRu } from '../ai-usage.model'

const props = defineProps<{ rows: AiCreditUsage[] }>()

const sortedRows = computed(() =>
  [...props.rows]
    .filter((row) => row.providerBilledUnits > 0)
    .sort(
      (left, right) =>
        right.providerBilledUnits - left.providerBilledUnits,
    )
    .slice(0, 6),
)
const hiddenCount = computed(() =>
  Math.max(props.rows.length - sortedRows.value.length, 0),
)
const totalCredits = computed(() =>
  props.rows.reduce((sum, row) => sum + row.providerBilledUnits, 0),
)
const maxCredits = computed(() =>
  Math.max(0, ...sortedRows.value.map((row) => row.providerBilledUnits)),
)

function rowWidth(row: AiCreditUsage): string {
  if (!maxCredits.value) return '0%'
  return `${Math.max((row.providerBilledUnits / maxCredits.value) * 100, 1.5)}%`
}

function share(row: AiCreditUsage): string {
  if (!totalCredits.value) return '0%'
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format((row.providerBilledUnits / totalCredits.value) * 100)}%`
}

function operationLabel(operation: string): string {
  if (['speech', 'text_to_speech', 'tts'].includes(operation.toLowerCase()))
    return 'Text to Speech'
  return operation.replaceAll(/[_-]+/g, ' ')
}
</script>

<template>
  <section class="credit-chart" aria-labelledby="elevenlabs-credit-title">
    <header class="chart-header">
      <div>
        <span class="chart-kicker">Credits by model</span>
        <h3 id="elevenlabs-credit-title">Куда расходуются credits</h3>
      </div>
      <span class="total-badge">{{ formatTokenCount(totalCredits) }} credits</span>
    </header>

    <div v-if="sortedRows.length" class="credit-bars">
      <div v-for="row in sortedRows" :key="row.key" class="credit-row">
        <div class="credit-copy">
          <span>
            <strong>{{ row.model }}</strong>
            <small
              >{{ operationLabel(row.operation) }} · {{ row.records }}
              {{
                pluralizeRu(
                  row.records,
                  'генерация',
                  'генерации',
                  'генераций',
                )
              }}</small
            >
          </span>
          <span class="credit-value">
            <strong>{{ formatTokenCount(row.providerBilledUnits) }} credits</strong>
            <small
              >{{ formatTokenCount(row.inputCharacters) }} символов ·
              {{ share(row) }}</small
            >
          </span>
        </div>
        <div
          class="bar-track"
          role="meter"
          :aria-label="`${row.model}: ${formatTokenCount(row.providerBilledUnits)} credits`"
          aria-valuemin="0"
          :aria-valuemax="maxCredits"
          :aria-valuenow="row.providerBilledUnits"
        >
          <span class="bar-fill" :style="{ width: rowWidth(row) }" />
        </div>
      </div>
      <p v-if="hiddenCount" class="chart-note">
        Ещё {{ hiddenCount }} {{ hiddenCount === 1 ? 'модель' : 'моделей' }} не
        показаны, но учтены в итогах.
      </p>
    </div>
    <div v-else class="chart-empty">
      <i class="pi pi-volume-up" />
      <span>За выбранный период credits не списывались</span>
    </div>

    <footer class="credits-note">
      <i class="pi pi-info-circle" />
      <span
        >Credits — единицы потребления ElevenLabs, а не USD. Расход на один
        символ может отличаться в зависимости от модели и условий тарифа.</span
      >
    </footer>
  </section>
</template>

<style scoped>
.credit-chart{min-width:0;padding:22px;border:1px solid var(--border-default);border-radius:17px;background:var(--surface-card)}.chart-header{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:25px}.chart-kicker{display:block;margin-bottom:5px;color:var(--text-small-muted);font-size:.65rem;font-weight:700;letter-spacing:.11em;text-transform:uppercase}.chart-header h3{margin:0;font-size:1rem}.total-badge{padding:7px 9px;border:1px solid color-mix(in srgb,var(--status-violet) 25%,var(--border-default));border-radius:9px;background:var(--status-violet-soft);color:var(--status-violet-text);font-size:.63rem;font-weight:700;white-space:nowrap}.credit-bars{display:flex;flex-direction:column;gap:20px}.credit-copy{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:8px}.credit-copy>span:first-child{min-width:0}.credit-copy strong,.credit-copy small{display:block}.credit-copy>span:first-child strong{overflow:hidden;font-size:.77rem;text-overflow:ellipsis;white-space:nowrap}.credit-copy small{margin-top:3px;color:var(--text-small-muted);font-size:.62rem}.credit-value{flex:0 0 auto;text-align:right}.credit-value strong{color:var(--text-primary);font-size:.72rem}.bar-track{height:9px;overflow:hidden;border-radius:999px;background:var(--surface-active)}.bar-fill{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--chart-series-1),var(--status-violet-text));transition:width .35s ease}.chart-note{margin:0;color:var(--text-small-muted);font-size:.65rem}.credits-note{display:flex;align-items:flex-start;gap:8px;padding:12px 13px;margin-top:22px;border-radius:11px;background:var(--status-violet-soft);color:var(--status-violet-text);font-size:.66rem;line-height:1.45}.credits-note i{margin-top:2px;color:var(--status-violet)}.chart-empty{display:grid;place-items:center;min-height:210px;color:var(--text-small-muted);font-size:.75rem}.chart-empty i{margin-bottom:-58px;font-size:1.65rem;color:var(--text-disabled)}@media(max-width:600px){.credit-chart{padding:18px}.chart-header,.credit-copy{align-items:stretch;flex-direction:column}.total-badge{align-self:flex-start}.credit-value{text-align:left}}
</style>
