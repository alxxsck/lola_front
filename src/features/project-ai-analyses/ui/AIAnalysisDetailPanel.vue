<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Button from "primevue/button";
import Message from "primevue/message";
import Skeleton from "primevue/skeleton";
import Tag from "primevue/tag";
import { cmsUserDetailRoute } from "@/features/cms-user-management/model/cms-user-route";
import type {
  ProjectAIAnalysisDetailResponseDto,
  ProjectAIAnalysisErrorPresentationDto,
} from "@/shared/api/generated/models";
import TechnicalIdentifier from "@/shared/ui/TechnicalIdentifier.vue";
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
  canReadCmsUsers?: boolean;
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

function limitationMessages(
  limitations: ProjectAIAnalysisErrorPresentationDto[],
  codes: string[],
): string[] {
  if (limitations.length) return limitations.map(({ message }) => message);
  return codes.length ? ["Данные получены с ограничениями."] : [];
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
        class="detail-close"
        label="Назад"
        icon="pi pi-arrow-left"
        severity="secondary"
        text
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

      <section class="identity-grid" aria-label="Сводка анализа">
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

      <details class="technical-section">
        <summary>
          <span><i class="pi pi-code" /> Технические данные анализа</span>
          <i class="pi pi-chevron-down" />
        </summary>
        <div class="technical-grid">
          <TechnicalIdentifier
            label="Analysis ID"
            :value="detail.analysis.analysisId"
          />
          <TechnicalIdentifier
            label="Создал администратор"
            :value="analysisAuthor"
            :to="
              detail.analysis.createdByCmsUserId
                ? cmsUserDetailRoute(
                    detail.analysis.createdByCmsUserId,
                    Boolean(canReadCmsUsers),
                  )
                : undefined
            "
          />
          <TechnicalIdentifier
            v-if="detail.analysis.endUserId"
            label="Пользователь данных"
            :value="detail.analysis.endUserId"
            :to="{
              name: 'users',
              params: { endUserId: detail.analysis.endUserId },
              query: { projectId },
            }"
          />
        </div>
      </details>

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
          <span
            v-if="
              detail.schedule.failureMessage || detail.schedule.failureCode
            "
            ><small>Причина остановки</small>{{
              detail.schedule.failureMessage ??
              "Отложенный запуск не удалось выполнить."
            }}</span
          >
        </div>
        <details v-if="detail.schedule.failureCode" class="technical-section">
          <summary>
            <span><i class="pi pi-code" /> Технические данные остановки</span>
            <i class="pi pi-chevron-down" />
          </summary>
          <TechnicalIdentifier
            label="Код остановки"
            :value="detail.schedule.failureCode"
          />
        </details>
      </section>

      <section v-for="run in detail.runs" :key="run.runId" class="run-block">
        <div class="section-title run-title">
          <span><i class="pi pi-play-circle" /> Запуск</span>
          <Tag
            :value="presentAnalysisStatus(run.status).label"
            :severity="presentAnalysisStatus(run.status).severity"
          />
        </div>

        <div class="run-facts">
          <span><small>Инициатор</small>{{ run.initiatedBy }}</span>
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
          <span v-if="canReadCost && run.model"
            ><small>Модель</small>{{ run.provider }} / {{ run.model }}</span
          >
        </div>

        <details class="technical-section run-technical">
          <summary>
            <span><i class="pi pi-code" /> Технические данные запуска</span>
            <i class="pi pi-chevron-down" />
          </summary>
          <div class="technical-grid">
            <TechnicalIdentifier label="Run ID" :value="run.runId" />
            <TechnicalIdentifier
              v-if="run.initiatedByCmsUserId"
              label="Инициатор"
              :value="run.initiatedByCmsUserId"
              :to="
                cmsUserDetailRoute(
                  run.initiatedByCmsUserId,
                  Boolean(canReadCmsUsers),
                )
              "
            />
            <TechnicalIdentifier
              v-if="canReadCost && run.costAttributedToCmsUserId"
              label="Расход администратора"
              :value="run.costAttributedToCmsUserId"
              :to="
                cmsUserDetailRoute(
                  run.costAttributedToCmsUserId,
                  Boolean(canReadCmsUsers),
                )
              "
            />
            <TechnicalIdentifier
              v-if="run.rootAiOperationId"
              label="AI Operation"
              :value="run.rootAiOperationId"
              :to="{
                name: 'ai-operation-detail',
                params: { operationId: run.rootAiOperationId },
                query: { projectId },
              }"
            />
            <TechnicalIdentifier
              v-if="run.catalogRevisionId"
              label="Catalog revision"
              :value="run.catalogRevisionId"
            />
            <TechnicalIdentifier
              v-if="run.catalogRevisionDigest"
              label="Catalog digest"
              :value="run.catalogRevisionDigest"
            />
            <TechnicalIdentifier
              v-if="run.queryPolicyRevisionId"
              label="Query policy revision"
              :value="run.queryPolicyRevisionId"
            />
            <TechnicalIdentifier
              v-if="run.capabilitySetRevision"
              label="Capability set revision"
              :value="run.capabilitySetRevision"
            />
            <TechnicalIdentifier
              v-if="run.limitationCodes.length"
              label="Коды ограничений"
              :value="run.limitationCodes.join(', ')"
            />
            <TechnicalIdentifier
              v-if="run.errorCode"
              label="Код завершения"
              :value="run.errorCode"
            />
          </div>
        </details>

        <AIAnalysisResultView
          v-if="run.result"
          :result="run.result"
          :project-id="projectId"
          :can-read-cost="canReadCost"
          :can-read-cms-users="canReadCmsUsers"
        />

        <Message
          v-for="message in limitationMessages(
            run.limitations,
            run.limitationCodes,
          )"
          :key="message"
          severity="warn"
          :closable="false"
        >
          {{ message }}
        </Message>

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
              ><small>Полнота</small
              >{{ receipt.complete ? "Полный" : "Неполный"
              }}{{ receipt.truncated ? " · усечён" : "" }}</span
            >
            <span
              v-for="message in limitationMessages(
                receipt.limitations,
                receipt.limitationCodes,
              )"
              :key="message"
              ><small>Ограничение</small>{{ message }}</span
            >
            <span v-if="receipt.rejectionMessage || receipt.rejectionCode"
              ><small>Причина отклонения</small
              >{{
                receipt.rejectionMessage ?? "Запрос к данным был отклонён."
              }}</span
            >
            <details class="receipt-technical">
              <summary>Технические данные запроса</summary>
              <TechnicalIdentifier
                label="Query hash"
                :value="receipt.queryHash"
              />
              <TechnicalIdentifier
                v-if="receipt.limitationCodes.length"
                label="Коды ограничений"
                :value="receipt.limitationCodes.join(', ')"
              />
              <TechnicalIdentifier
                v-if="receipt.rejectionCode"
                label="Код отклонения"
                :value="receipt.rejectionCode"
              />
            </details>
          </article>
        </div>

        <Message
          v-if="run.errorMessage || run.errorCode"
          severity="error"
          :closable="false"
        >
          {{ run.errorMessage ?? "Запуск завершился с ошибкой." }}
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
              : "исторический AI-результат"
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
  min-height: 100%;
  padding: 24px;
  background: var(--surface-card);
  outline: none;
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
.detail-close {
  min-height: 44px;
  min-width: 44px;
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
  color: var(--text-brand);
  font-size: 0.75rem;
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
  font-size: 1.45rem;
}
.question {
  margin: 10px 0 0;
  color: var(--muted);
  font-size: 0.9rem;
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
  background: var(--surface-subtle);
  border-radius: 10px;
  font-size: 0.8rem;
}
small {
  display: block;
  margin-bottom: 3px;
  color: var(--muted);
  font-size: 0.75rem;
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
  font-size: 0.82rem;
  font-weight: 800;
}
.run-title {
  justify-content: space-between;
}
.run-title span {
  min-width: 0;
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
  font-size: 0.77rem;
}
.technical-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  padding: 13px;
  border-top: 1px solid var(--line);
}
.run-technical {
  margin-top: -2px;
}
.receipt-technical {
  grid-column: 1 / -1;
  padding-top: 4px;
}
.receipt-technical summary {
  min-height: 44px;
  color: var(--text-secondary);
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
}
.receipt-technical > :not(summary) {
  margin-top: 8px;
}
.legacy-block {
  display: flex;
  gap: 9px;
  padding: 12px;
  color: var(--muted);
  background: var(--surface-subtle);
  border-radius: 10px;
  font-size: 0.79rem;
  line-height: 1.5;
}
@media (max-width: 560px) {
  .detail-panel {
    padding: 17px;
  }
  .identity-grid,
  .schedule-grid,
  .run-facts,
  .receipts article,
  .technical-grid {
    grid-template-columns: 1fr;
  }
  .cancel-confirmation > div,
  .cancel-actions {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
