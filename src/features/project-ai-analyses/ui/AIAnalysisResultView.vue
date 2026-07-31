<script setup lang="ts">
import { computed } from "vue";
import { presentAnalysisResult } from "../model/project-ai-analysis-presentation";

const props = withDefaults(
  defineProps<{ result: unknown; canReadCost?: boolean }>(),
  { canReadCost: false },
);
const view = computed(() => presentAnalysisResult(props.result));

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "Некорректная дата"
    : dateFormatter.format(parsed);
}
</script>

<template>
  <section class="result-view">
    <div v-if="view.answer" class="answer">
      <div class="result-label"><i class="pi pi-sparkles" /> Вывод Lola</div>
      <p>{{ view.answer }}</p>
    </div>

    <div v-if="view.scope || view.time" class="interpretation">
      <span v-if="view.scope"
        ><small>Интерпретация области</small>{{ view.scope }}</span
      >
      <span v-if="view.time"
        ><small>Бизнес-период</small>{{ formatDate(view.time.from) }} —
        {{ formatDate(view.time.to) }}
        <em>{{ view.time.timezone }}</em></span
      >
    </div>

    <div v-if="view.table" class="table-shell">
      <table>
        <thead>
          <tr>
            <th v-for="column in view.table.columns" :key="column.key">
              {{ column.label }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, rowIndex) in view.table.rows" :key="rowIndex">
            <td v-for="(cell, cellIndex) in row" :key="cellIndex">
              {{ cell ?? "—" }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div
      v-if="view.completeness || view.receiptOrdinals.length"
      class="evidence-summary"
    >
      <span v-if="view.completeness"
        ><small>Полнота результата</small>{{ view.completeness }}</span
      >
      <span v-if="view.receiptOrdinals.length"
        ><small>Запросы-основания</small>#{{
          view.receiptOrdinals.join(", #")
        }}</span
      >
    </div>

    <div v-if="view.definitions.length" class="definitions">
      <div class="result-section-title">
        <i class="pi pi-book" /> Использованные определения
      </div>
      <article
        v-for="definition in view.definitions"
        :key="`${definition.kind}:${definition.eventCode}:${definition.code}`"
      >
        <span>
          <strong>{{ definition.code }}</strong>
          <small
            >{{ definition.kind
            }}<template v-if="definition.eventCode">
              · {{ definition.eventCode }}</template
            ></small
          >
        </span>
        <p>{{ definition.description }}</p>
      </article>
    </div>

    <div v-if="view.actors" class="actors">
      <div class="result-section-title">
        <i class="pi pi-user" /> Атрибуция результата
      </div>
      <span v-if="view.actors.createdByCmsUserId"
        ><small>Создал администратор</small
        ><code>{{ view.actors.createdByCmsUserId }}</code></span
      >
      <span v-if="canReadCost && view.actors.costAttributedToCmsUserId"
        ><small>Расход администратора</small
        ><code>{{ view.actors.costAttributedToCmsUserId }}</code></span
      >
    </div>

    <div v-if="view.provenance" class="provenance">
      <div class="result-section-title">
        <i class="pi pi-verified" /> Provenance результата
      </div>
      <div class="provenance-grid">
        <span v-if="view.provenance.catalogRevisionId"
          ><small>Catalog revision</small
          ><code>{{ view.provenance.catalogRevisionId }}</code></span
        >
        <span v-if="view.provenance.queryPolicyRevisionId"
          ><small>Query policy revision</small
          ><code>{{ view.provenance.queryPolicyRevisionId }}</code></span
        >
        <span v-if="view.provenance.aiOperationId"
          ><small>AI Operation</small
          ><code>{{ view.provenance.aiOperationId }}</code></span
        >
        <span v-if="view.provenance.catalogRevisionDigest"
          ><small>Catalog digest</small
          ><code>{{ view.provenance.catalogRevisionDigest }}</code></span
        >
      </div>
      <div
        v-for="receipt in view.provenance.queryReceipts"
        :key="receipt.id"
        class="provenance-receipt"
      >
        <span
          ><strong>Запрос #{{ receipt.ordinal }}</strong>
          {{ receipt.complete ? "полный" : "неполный"
          }}{{ receipt.truncated ? " · усечён" : "" }}</span
        >
        <code>{{ receipt.queryHash }}</code>
      </div>
    </div>

    <div v-if="view.limitations.length" class="limitations">
      <div
        v-for="limitation in view.limitations"
        :key="limitation.code"
        class="limitation"
      >
        <i class="pi pi-exclamation-triangle" />
        <span
          ><strong>{{ limitation.code }}</strong
          >{{ limitation.message }}</span
        >
      </div>
    </div>
  </section>
</template>

<style scoped>
.result-view {
  display: grid;
  gap: 16px;
}
.answer {
  padding: 18px;
  background: color-mix(in srgb, var(--brand) 7%, var(--surface-soft));
  border: 1px solid color-mix(in srgb, var(--brand) 18%, var(--line));
  border-radius: 14px;
}
.result-label {
  color: var(--brand);
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.answer p {
  margin: 9px 0 0;
  font-size: 0.88rem;
  line-height: 1.65;
}
.interpretation {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 12px;
}
.evidence-summary,
.actors,
.provenance-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 10px;
}
.evidence-summary span,
.actors span,
.provenance-grid span {
  min-width: 0;
  padding: 11px 12px;
  background: var(--surface-soft);
  border-radius: 10px;
  font-size: 0.72rem;
}
.evidence-summary small,
.actors small,
.provenance-grid small {
  display: block;
  margin-bottom: 4px;
  color: var(--muted);
  font-size: 0.59rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.result-section-title {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 9px;
  font-size: 0.72rem;
  font-weight: 800;
}
.definitions article {
  display: grid;
  grid-template-columns: minmax(140px, 0.45fr) minmax(0, 1fr);
  gap: 12px;
  padding: 10px 12px;
  background: var(--surface-soft);
  border-radius: 10px;
  font-size: 0.72rem;
}
.definitions article + article,
.provenance-receipt + .provenance-receipt {
  margin-top: 7px;
}
.definitions strong,
.definitions small {
  display: block;
}
.definitions small {
  margin-top: 2px;
  color: var(--muted);
}
.definitions p {
  margin: 0;
  line-height: 1.5;
}
.actors,
.provenance {
  padding-top: 2px;
}
.actors .result-section-title,
.provenance .result-section-title {
  grid-column: 1 / -1;
}
.provenance-receipt {
  display: grid;
  gap: 4px;
  margin-top: 8px;
  padding: 10px 12px;
  background: var(--surface-soft);
  border-radius: 10px;
  font-size: 0.69rem;
}
code {
  overflow-wrap: anywhere;
  color: inherit;
  font: inherit;
}
.interpretation span {
  padding: 12px;
  background: var(--surface-soft);
  border-radius: 11px;
  font-size: 0.76rem;
}
.interpretation small {
  display: block;
  margin-bottom: 4px;
  color: var(--muted);
  font-size: 0.61rem;
  font-weight: 700;
  text-transform: uppercase;
}
em {
  display: block;
  color: var(--muted);
  font-style: normal;
}
.table-shell {
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: 12px;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.76rem;
}
th,
td {
  padding: 11px 13px;
  border-bottom: 1px solid var(--line);
  text-align: left;
  white-space: nowrap;
}
th {
  color: var(--muted);
  background: var(--surface-soft);
  font-size: 0.64rem;
  text-transform: uppercase;
}
tbody tr:last-child td {
  border-bottom: 0;
}
.limitations {
  display: grid;
  gap: 8px;
}
.limitation {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 11px 13px;
  color: var(--status-warning-text);
  background: var(--status-warning-bg);
  border-radius: 10px;
  font-size: 0.72rem;
}
.limitation strong {
  display: block;
  margin-bottom: 2px;
}
</style>
