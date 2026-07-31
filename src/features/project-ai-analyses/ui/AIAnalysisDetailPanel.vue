<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Button from "primevue/button";
import Message from "primevue/message";
import Skeleton from "primevue/skeleton";
import Tag from "primevue/tag";
import type { ProjectAIAnalysisDetailResponseDto } from "@/shared/api/generated/models";
import {
  formatUsdTicks,
  presentAnalysisCostStatus,
  presentAnalysisStatus,
} from "../model/project-ai-analysis-presentation";
import AIAnalysisResultView from "./AIAnalysisResultView.vue";

const props = defineProps<{
  projectId: string;
  detail: ProjectAIAnalysisDetailResponseDto | null;
  loading: boolean;
  error: string;
  canManage: boolean;
  canReadCost: boolean;
  cancelling: boolean;
}>();
interface AIAnalysisCancelTarget {
  projectId: string;
  analysisId: string;
  version: number;
}
const emit = defineEmits<{
  cancel: [target: AIAnalysisCancelTarget];
  close: [];
}>();
const cancelTarget = ref<AIAnalysisCancelTarget | null>(null);

const latestRun = computed(() => props.detail?.runs[0] ?? null);
const effectiveStatus = computed(() => {
  if (props.detail?.analysis.state === "PAUSED") return "PAUSED";
  if (props.detail?.schedule && !latestRun.value) return "SCHEDULED";
  return latestRun.value?.status ?? props.detail?.analysis.state ?? "ACTIVE";
});
const status = computed(() => presentAnalysisStatus(effectiveStatus.value));
const canCancel = computed(
  () =>
    props.canManage &&
    Boolean(props.detail) &&
    !props.detail!.analysis.compatibility?.readOnly &&
    !["COMPLETED", "CANCELLED"].includes(props.detail!.analysis.state),
);
const analysisAuthor = computed(() => {
  const analysis = props.detail?.analysis;
  if (analysis?.createdByCmsUserId) return analysis.createdByCmsUserId;
  return analysis?.compatibility?.attributionStatus === "REQUESTER_UNKNOWN"
    ? "Автор неизвестен (историческая запись)"
    : "Автор не указан";
});
const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(value?: string | null): string {
  return value ? dateFormatter.format(new Date(value)) : "—";
}

function confirmCancel(): void {
  const target = cancelTarget.value;
  cancelTarget.value = null;
  if (target) emit("cancel", target);
}

function requestCancel(): void {
  const analysis = props.detail?.analysis;
  if (!analysis || !canCancel.value) return;
  cancelTarget.value = {
    projectId: props.projectId,
    analysisId: analysis.analysisId,
    version: analysis.version,
  };
}

watch(
  () => [
    props.projectId,
    props.detail?.analysis.analysisId,
    props.detail?.analysis.version,
  ],
  () => {
    cancelTarget.value = null;
  },
);
</script>

<template>
  <aside
    class="detail-panel"
    aria-label="Детали AI-анализа"
    data-testid="ai-analysis-detail"
    tabindex="-1"
  >
    <div class="detail-toolbar">
      <Button
        icon="pi pi-times"
        severity="secondary"
        text
        rounded
        aria-label="Закрыть детали"
        @click="emit('close')"
      />
      <Button
        v-if="canCancel"
        label="Отменить"
        icon="pi pi-ban"
        severity="danger"
        outlined
        size="small"
        :loading="cancelling"
        @click="requestCancel"
      />
    </div>

    <Message
      v-if="cancelTarget"
      severity="warn"
      :closable="false"
      class="cancel-confirmation"
    >
      <div>
        <span
          ><strong>Отменить этот анализ?</strong> Активный или отложенный запуск
          будет остановлен.</span
        >
        <span class="cancel-actions">
          <Button
            label="Не отменять"
            severity="secondary"
            text
            size="small"
            @click="cancelTarget = null"
          />
          <Button
            data-testid="confirm-analysis-cancel"
            label="Да, отменить"
            severity="danger"
            size="small"
            @click="confirmCancel"
          />
        </span>
      </div>
    </Message>

    <template v-if="loading">
      <Skeleton height="2rem" width="70%" />
      <Skeleton height="7rem" />
      <Skeleton height="14rem" />
    </template>
    <Message v-else-if="error" severity="error">{{ error }}</Message>
    <template v-else-if="detail">
      <header>
        <div class="detail-eyebrow">
          AI-анализ #{{ detail.analysis.projectSequence ?? "—" }}
        </div>
        <div class="title-row">
          <h2>{{ detail.analysis.title }}</h2>
          <Tag :value="status.label" :severity="status.severity" rounded />
        </div>
        <p v-if="detail.analysis.question" class="question">
          {{ detail.analysis.question }}
        </p>
      </header>

      <section class="identity-grid" aria-label="Атрибуция анализа">
        <span
          ><small>Analysis ID</small
          ><code>{{ detail.analysis.analysisId }}</code></span
        >
        <span
          ><small>Создал администратор</small
          ><code>{{ analysisAuthor }}</code></span
        >
        <span v-if="detail.analysis.endUserId"
          ><small>Пользователь данных</small
          ><code>{{ detail.analysis.endUserId }}</code></span
        >
        <span
          ><small>Затронуто пользователей</small
          >{{ detail.subjectEvidence.total }}</span
        >
        <span
          ><small>Создан</small
          >{{ formatDate(detail.analysis.createdAt) }}</span
        >
        <span v-if="detail.analysis.retentionUntil"
          ><small>Хранение до</small
          >{{ formatDate(detail.analysis.retentionUntil) }}</span
        >
      </section>

      <section v-if="detail.schedule" class="schedule-block">
        <div class="section-title">
          <i class="pi pi-clock" /> Отложенный запуск
        </div>
        <div class="schedule-grid">
          <span><small>Состояние</small>{{ detail.schedule.state }}</span>
          <span
            ><small>Запуск</small
            >{{
              formatDate(detail.schedule.nextRunAt ?? detail.schedule.runAt)
            }}
            <em>{{ detail.schedule.timezone }}</em></span
          >
          <span
            ><small>Локальное время</small
            >{{ detail.schedule.localDateTime }}</span
          >
          <span v-if="detail.schedule.failureCode"
            ><small>Код остановки</small
            ><code>{{ detail.schedule.failureCode }}</code></span
          >
        </div>
      </section>

      <section v-for="run in detail.runs" :key="run.runId" class="run-block">
        <div class="section-title run-title">
          <span
            ><i class="pi pi-play-circle" /> Запуск
            <code>{{ run.runId }}</code></span
          >
          <Tag
            :value="presentAnalysisStatus(run.status).label"
            :severity="presentAnalysisStatus(run.status).severity"
          />
        </div>

        <div class="run-facts">
          <span
            ><small>Инициатор</small>{{ run.initiatedBy
            }}<code v-if="run.initiatedByCmsUserId">{{
              run.initiatedByCmsUserId
            }}</code></span
          >
          <span v-if="canReadCost && run.costAttributedToCmsUserId"
            ><small>Расход администратора</small
            ><code>{{ run.costAttributedToCmsUserId }}</code></span
          >
          <span v-if="canReadCost && run.actualAiCostUsdTicks"
            ><small>Фактическая AI-стоимость</small
            >{{ formatUsdTicks(run.actualAiCostUsdTicks)
            }}<em>{{ presentAnalysisCostStatus(run.costStatus) }}</em></span
          >
          <span v-if="canReadCost && run.reservedAiCostUsdTicks"
            ><small>Зарезервировано</small
            >{{ formatUsdTicks(run.reservedAiCostUsdTicks) }}</span
          >
          <span v-if="canReadCost && run.actualDbWorkUnits"
            ><small>DB work units</small>{{ run.actualDbWorkUnits }}</span
          >
          <span v-if="canReadCost && run.budgetReconciliationPending"
            ><small>Статус стоимости</small>Сверка стоимости ожидается</span
          >
          <span v-if="run.rootAiOperationId"
            ><small>AI Operation</small
            ><code>{{ run.rootAiOperationId }}</code></span
          >
          <span v-if="canReadCost && run.model"
            ><small>Модель</small>{{ run.provider }} / {{ run.model }}</span
          >
          <span v-if="run.catalogRevisionId"
            ><small>Catalog revision</small
            ><code>{{ run.catalogRevisionId }}</code></span
          >
          <span v-if="run.catalogRevisionDigest"
            ><small>Catalog digest</small
            ><code>{{ run.catalogRevisionDigest }}</code></span
          >
          <span v-if="run.queryPolicyRevisionId"
            ><small>Query policy revision</small
            ><code>{{ run.queryPolicyRevisionId }}</code></span
          >
          <span v-if="run.capabilitySetRevision"
            ><small>Capability set revision</small
            ><code>{{ run.capabilitySetRevision }}</code></span
          >
        </div>

        <AIAnalysisResultView
          v-if="run.result"
          :result="run.result"
          :can-read-cost="canReadCost"
        />

        <div v-if="run.receipts.length" class="receipts">
          <div class="section-title">
            <i class="pi pi-database" /> Использованные данные
          </div>
          <article v-for="receipt in run.receipts" :key="receipt.id">
            <span
              ><small>Запрос #{{ receipt.ordinal }}</small
              >{{ receipt.status }}</span
            >
            <span
              ><small>Строк просмотрено</small
              >{{ receipt.examinedRows.toLocaleString("ru-RU") }}</span
            >
            <span
              ><small>Пользователей</small>{{ receipt.matchedEndUserCount
              }}{{ receipt.matchedEndUserCountExact ? "" : "+" }}</span
            >
            <span
              ><small>Период</small>{{ formatDate(receipt.rangeStartedAt) }} —
              {{ formatDate(receipt.rangeEndedAt) }}</span
            >
            <span
              ><small>Query hash</small
              ><code>{{ receipt.queryHash }}</code></span
            >
            <span
              ><small>Полнота</small
              >{{ receipt.complete ? "Полный" : "Неполный"
              }}{{ receipt.truncated ? " · усечён" : "" }}</span
            >
            <span v-if="receipt.limitationCodes.length"
              ><small>Ограничения</small
              ><code>{{ receipt.limitationCodes.join(", ") }}</code></span
            >
            <span v-if="receipt.rejectionCode"
              ><small>Причина отклонения</small
              ><code>{{ receipt.rejectionCode }}</code></span
            >
          </article>
        </div>

        <Message v-if="run.errorCode" severity="error" :closable="false">
          Код завершения: <code>{{ run.errorCode }}</code>
        </Message>
      </section>

      <section v-if="detail.analysis.compatibility" class="legacy-block">
        <i class="pi pi-history" />
        <span>
          <strong>Исторический результат — только чтение</strong>
          Источник:
          {{
            detail.analysis.compatibility.sourceKind === "AI_REVIEW"
              ? "AI Review"
              : "AI-предложение"
          }}.
          {{
            detail.analysis.compatibility.attributionStatus ===
            "REQUESTER_UNKNOWN"
              ? "Автор запроса неизвестен."
              : "Атрибуция автора сохранена."
          }}
          {{
            detail.analysis.compatibility.provenanceStatus === "PARTIAL"
              ? "Provenance сохранён частично."
              : "Provenance неизвестен."
          }}
        </span>
      </section>
    </template>
  </aside>
</template>

<style scoped>
.detail-panel {
  display: grid;
  align-content: start;
  gap: 18px;
  min-width: 0;
  padding: 22px;
  background: var(--surface-card);
  border: 1px solid var(--line);
  border-radius: 20px;
  box-shadow: var(--shadow);
}
.detail-toolbar,
.title-row,
.section-title {
  display: flex;
  align-items: center;
}
.detail-toolbar {
  justify-content: space-between;
}
.cancel-confirmation > div,
.cancel-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.cancel-confirmation > div {
  justify-content: space-between;
  width: 100%;
}
.cancel-actions {
  flex: 0 0 auto;
}
.detail-eyebrow {
  color: var(--brand);
  font-size: 0.67rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.title-row {
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  margin-top: 5px;
}
h2 {
  margin: 0;
  font-size: 1.3rem;
}
.question {
  margin: 10px 0 0;
  color: var(--muted);
  font-size: 0.82rem;
  line-height: 1.55;
}
.identity-grid,
.schedule-grid,
.run-facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.identity-grid span,
.schedule-grid span,
.run-facts span {
  min-width: 0;
  padding: 11px;
  background: var(--surface-soft);
  border-radius: 10px;
  font-size: 0.72rem;
}
small {
  display: block;
  margin-bottom: 3px;
  color: var(--muted);
  font-size: 0.59rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
code {
  display: block;
  overflow-wrap: anywhere;
  color: inherit;
  font: inherit;
}
em {
  display: block;
  color: var(--muted);
  font-style: normal;
}
.schedule-block,
.run-block {
  display: grid;
  gap: 13px;
  padding-top: 17px;
  border-top: 1px solid var(--line);
}
.section-title {
  gap: 8px;
  font-size: 0.75rem;
  font-weight: 800;
}
.run-title {
  justify-content: space-between;
}
.run-title span {
  min-width: 0;
}
.run-title code {
  display: inline;
  margin-left: 4px;
  color: var(--muted);
  font-weight: 500;
}
.receipts {
  display: grid;
  gap: 8px;
}
.receipts article {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  padding: 11px;
  border: 1px solid var(--line);
  border-radius: 10px;
  font-size: 0.7rem;
}
.legacy-block {
  display: flex;
  gap: 9px;
  padding: 12px;
  color: var(--muted);
  background: var(--surface-soft);
  border-radius: 10px;
  font-size: 0.72rem;
  line-height: 1.5;
}
@media (max-width: 560px) {
  .detail-panel {
    padding: 17px;
  }
  .identity-grid,
  .schedule-grid,
  .run-facts,
  .receipts article {
    grid-template-columns: 1fr;
  }
  .cancel-confirmation > div,
  .cancel-actions {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
