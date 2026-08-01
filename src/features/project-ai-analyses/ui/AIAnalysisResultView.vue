<script setup lang="ts">
import { computed } from "vue";
import { cmsUserDetailRoute } from "@/features/cms-user-management/model/cms-user-route";
import TechnicalIdentifier from "@/shared/ui/TechnicalIdentifier.vue";
import { presentAnalysisResult } from "../model/project-ai-analysis-presentation";

const props = withDefaults(
  defineProps<{
    result: unknown;
    canReadCost?: boolean;
    canReadCmsUsers?: boolean;
    projectId?: string;
  }>(),
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

    <details v-if="view.actors || view.provenance" class="result-technical">
      <summary>
        <span><i class="pi pi-verified" /> Атрибуция и provenance</span>
        <i class="pi pi-chevron-down" />
      </summary>
      <div class="result-technical-grid">
        <TechnicalIdentifier
          v-if="view.actors?.createdByCmsUserId"
          label="Создал администратор"
          :value="view.actors.createdByCmsUserId"
          :to="
            cmsUserDetailRoute(
              view.actors.createdByCmsUserId,
              Boolean(canReadCmsUsers),
            )
          "
        />
        <TechnicalIdentifier
          v-if="canReadCost && view.actors?.costAttributedToCmsUserId"
          label="Расход администратора"
          :value="view.actors.costAttributedToCmsUserId"
          :to="
            cmsUserDetailRoute(
              view.actors.costAttributedToCmsUserId,
              Boolean(canReadCmsUsers),
            )
          "
        />
        <TechnicalIdentifier
          v-if="view.provenance?.catalogRevisionId"
          label="Catalog revision"
          :value="view.provenance.catalogRevisionId"
        />
        <TechnicalIdentifier
          v-if="view.provenance?.queryPolicyRevisionId"
          label="Query policy revision"
          :value="view.provenance.queryPolicyRevisionId"
        />
        <TechnicalIdentifier
          v-if="view.provenance?.aiOperationId"
          label="AI Operation"
          :value="view.provenance.aiOperationId"
          :to="
            projectId
              ? {
                  name: 'ai-operation-detail',
                  params: { operationId: view.provenance.aiOperationId },
                  query: { projectId },
                }
              : undefined
          "
        />
        <TechnicalIdentifier
          v-if="view.provenance?.catalogRevisionDigest"
          label="Catalog digest"
          :value="view.provenance.catalogRevisionDigest"
        />
      </div>
      <div
        v-for="receipt in view.provenance?.queryReceipts ?? []"
        :key="receipt.id"
        class="provenance-receipt"
      >
        <span
          ><strong>Запрос #{{ receipt.ordinal }}</strong>
          {{ receipt.complete ? "полный" : "неполный"
          }}{{ receipt.truncated ? " · усечён" : "" }}</span
        >
        <TechnicalIdentifier label="Query hash" :value="receipt.queryHash" />
      </div>
    </details>

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
  background: color-mix(in srgb, var(--brand) 7%, var(--surface-subtle));
  border: 1px solid color-mix(in srgb, var(--brand) 18%, var(--line));
  border-radius: 14px;
}
.result-label {
  color: var(--text-brand);
  font-size: 0.75rem;
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
.result-technical-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 10px;
}
.evidence-summary span,
.result-technical-grid > * {
  min-width: 0;
  padding: 11px 12px;
  background: var(--surface-subtle);
  border-radius: 10px;
  font-size: 0.78rem;
}
.evidence-summary small,
.result-technical-grid small {
  display: block;
  margin-bottom: 4px;
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.result-section-title {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 9px;
  font-size: 0.8rem;
  font-weight: 800;
}
.definitions article {
  display: grid;
  grid-template-columns: minmax(140px, 0.45fr) minmax(0, 1fr);
  gap: 12px;
  padding: 10px 12px;
  background: var(--surface-subtle);
  border-radius: 10px;
  font-size: 0.78rem;
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
.result-technical {
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface-subtle);
}
.result-technical summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 48px;
  padding: 0 13px;
  color: var(--text-secondary);
  font-size: 0.8rem;
  font-weight: 750;
  cursor: pointer;
  list-style: none;
}
.result-technical summary::-webkit-details-marker {
  display: none;
}
.result-technical summary span {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.result-technical summary > i {
  font-size: 0.72rem;
  transition: transform 0.18s ease;
}
.result-technical[open] summary > i {
  transform: rotate(180deg);
}
.result-technical-grid {
  padding: 13px;
  border-top: 1px solid var(--line);
}
.provenance-receipt {
  display: grid;
  gap: 4px;
  margin-top: 8px;
  padding: 10px 12px;
  background: var(--surface-subtle);
  border-radius: 10px;
  font-size: 0.76rem;
}
.interpretation span {
  padding: 12px;
  background: var(--surface-subtle);
  border-radius: 11px;
  font-size: 0.76rem;
}
.interpretation small {
  display: block;
  margin-bottom: 4px;
  color: var(--muted);
  font-size: 0.75rem;
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
  background: var(--surface-subtle);
  font-size: 0.75rem;
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
  background: var(--status-warning-soft);
  border-radius: 10px;
  font-size: 0.78rem;
}
.limitation strong {
  display: block;
  margin-bottom: 2px;
}
</style>
