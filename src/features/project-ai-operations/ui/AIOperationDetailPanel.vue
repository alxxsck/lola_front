<script setup lang="ts">
import Button from "primevue/button";
import Message from "primevue/message";
import Skeleton from "primevue/skeleton";
import Tag from "primevue/tag";
import type {
  AiOperationDetailResponseDto,
  AiOperationProtectedAccessPageResponseDto,
  AiOperationSubjectPageResponseDto,
} from "@/shared/api/generated/models";
import {
  aiOperationActorLabel,
  aiOperationCategoryLabel,
  aiOperationChargedAccountLabel,
  aiOperationCostLabel,
  aiOperationDateLabel,
  aiOperationStatusPresentation,
  compactIdentifier,
} from "../model/project-ai-operation-presentation";

defineProps<{
  projectId: string;
  detail: AiOperationDetailResponseDto | null;
  subjects: AiOperationSubjectPageResponseDto | null;
  accessHistory: AiOperationProtectedAccessPageResponseDto | null;
  loading: boolean;
  timelineLoading: boolean;
  usageLoading: boolean;
  subjectsLoading: boolean;
  accessLoading: boolean;
  error: string;
  canReadCost: boolean;
  canReadSubjects: boolean;
  canReadAudit: boolean;
  canReadAnalysisResult: boolean;
  canReadCaseResult: boolean;
  canReadConversationResult: boolean;
}>();
defineEmits<{
  close: [];
  loadSubjects: [];
  loadAccessHistory: [];
  loadMoreTimeline: [];
  loadMoreUsage: [];
  loadMoreSubjects: [];
  loadMoreAccessHistory: [];
}>();

function timelineIcon(kind: string): string {
  if (kind === "MODEL_ATTEMPT") return "pi pi-sparkles";
  if (kind === "TOOL_CALL") return "pi pi-wrench";
  if (kind === "DATA_ACCESS") return "pi pi-database";
  if (kind === "RESULT") return "pi pi-check-circle";
  return "pi pi-circle-fill";
}

function roleLabel(role: string): string {
  const labels: Record<string, string> = {
    SCOPE_MEMBER: "в области",
    DATA_CONTRIBUTOR: "данные участвовали",
    DIRECT_SUBJECT: "прямой объект",
  };
  return labels[role] ?? role;
}

function accessKindLabel(kind: string): string {
  const labels: Record<string, string> = {
    METADATA: "Метаданные операции",
    RESULT: "Результат операции",
    COST: "Стоимость и DB work",
    SENSITIVE_DETAIL: "Детали операции",
    SUBJECT_MANIFEST: "Список участников",
    ACCESS_HISTORY: "История доступа",
  };
  return labels[kind] ?? kind;
}

function attemptCostLabel(
  canReadCost: boolean,
  billedCost?: string | null,
  estimatedCost?: string | null,
): string {
  if (!canReadCost) return "стоимость скрыта";
  const value = billedCost ?? estimatedCost;
  return value == null ? "стоимость неизвестна" : aiOperationCostLabel(value);
}

function resultRoute(
  projectId: string,
  detail: AiOperationDetailResponseDto,
  canReadAnalysisResult: boolean,
  canReadCaseResult: boolean,
  canReadConversationResult: boolean,
) {
  if (canReadAnalysisResult && detail.resultReference?.kind === "AI_ANALYSIS") {
    return {
      name: "ai-analysis-detail",
      params: { analysisId: detail.resultReference.id },
      query: { projectId },
    };
  }
  if (canReadCaseResult && detail.resultReference?.kind === "END_USER_CASE") {
    return {
      name: "end-user-case-detail",
      params: { caseId: detail.resultReference.id },
      query: { projectId },
    };
  }
  if (
    canReadConversationResult &&
    detail.resultReference?.kind === "CONVERSATION" &&
    detail.resultReference.endUserId
  ) {
    return {
      name: "users",
      params: { endUserId: detail.resultReference.endUserId },
      query: { conversationId: detail.resultReference.id, projectId },
    };
  }
  return null;
}
</script>

<template>
  <aside
    class="detail-panel"
    data-testid="ai-operation-detail"
    tabindex="-1"
    aria-label="Детали AI-операции"
  >
    <div class="detail-toolbar">
      <span>Прозрачная история выполнения</span>
      <Button
        class="detail-close"
        label="Назад"
        icon="pi pi-arrow-left"
        text
        @click="$emit('close')"
      />
    </div>

    <Message v-if="error" severity="error">{{ error }}</Message>
    <template v-if="loading && !detail">
      <Skeleton height="7rem" />
      <Skeleton v-for="index in 4" :key="index" height="5rem" />
    </template>

    <template v-else-if="detail">
      <header class="detail-header">
        <div class="header-meta">
          <span>AI #{{ detail.projectSequence }}</span>
          <Tag
            :value="aiOperationStatusPresentation(detail.status).label"
            :severity="aiOperationStatusPresentation(detail.status).severity"
          />
        </div>
        <span class="category">{{
          aiOperationCategoryLabel(detail.category)
        }}</span>
        <h2>{{ detail.title }}</h2>
        <p>{{ detail.purpose }}</p>
      </header>

      <Message
        v-if="detail.restrictedSections.length"
        severity="warn"
        :closable="false"
      >
        Часть данных недоступна:
        {{ detail.restrictedSections.join(", ") }}
      </Message>

      <section class="section">
        <h3>Ответственность и расходы</h3>
        <dl class="attribution-grid">
          <div>
            <dt>Инициатор</dt>
            <dd>{{ aiOperationActorLabel(detail.initiator) }}</dd>
            <code v-if="detail.initiator.id">{{ detail.initiator.id }}</code>
          </div>
          <div>
            <dt>Источник расходов</dt>
            <dd>
              {{ aiOperationChargedAccountLabel(detail.chargedAccount) }}
            </dd>
            <code v-if="detail.chargedEndUserId">{{
              detail.chargedEndUserId
            }}</code>
          </div>
          <div>
            <dt>Ответственный администратор</dt>
            <dd>
              {{
                detail.responsibleCmsUserDisplayName ||
                detail.responsibleCmsUserId ||
                "не применяется"
              }}
            </dd>
            <code v-if="detail.responsibleCmsUserId">{{
              detail.responsibleCmsUserId
            }}</code>
          </div>
          <div>
            <dt>Авторизовал background-run</dt>
            <dd>
              {{
                detail.authorizedByCmsUserDisplayName ||
                detail.authorizedByCmsUserId ||
                "не применяется"
              }}
            </dd>
            <code v-if="detail.authorizedByCmsUserId">{{
              detail.authorizedByCmsUserId
            }}</code>
          </div>
        </dl>
        <div class="cost-line">
          <template v-if="canReadCost && detail.cost">
            <span>Итоговая AI-стоимость</span>
            <strong>{{
              aiOperationCostLabel(detail.cost.effectiveCost)
            }}</strong>
            <small>
              состояние: {{ detail.cost.state }} · неизвестных записей:
              {{ detail.cost.unknownUsageRecords }} · резерв:
              {{ detail.cost.reservedCostUsdTicks }} ticks ·
              provider:
              {{ aiOperationCostLabel(detail.cost.providerReportedCost) }} ·
              fallback:
              {{ aiOperationCostLabel(detail.cost.estimatedFallbackCost) }}
            </small>
          </template>
          <template v-else-if="canReadCost">
            <i class="pi pi-question-circle" />
            Денежная стоимость неизвестна
          </template>
          <template v-else>
            <i class="pi pi-lock" />
            Денежная стоимость доступна только с отдельным permission
          </template>
        </div>
      </section>

      <section class="section source-section">
        <h3>Источник и корреляция</h3>
        <dl>
          <div>
            <dt>Operation ID</dt>
            <dd>
              <code>{{ detail.operationId }}</code>
            </dd>
          </div>
          <div>
            <dt>Root correlation</dt>
            <dd>
              <code>{{ detail.rootCorrelationId }}</code>
            </dd>
          </div>
          <div>
            <dt>Domain source</dt>
            <dd>
              {{ detail.sourceKind }} ·
              <code>{{ detail.sourceId }}</code>
            </dd>
          </div>
          <div v-if="detail.resultReference">
            <dt>Domain result</dt>
            <dd>
              <RouterLink
                v-if="
                  resultRoute(
                    projectId,
                    detail,
                    canReadAnalysisResult,
                    canReadCaseResult,
                    canReadConversationResult,
                  )
                "
                :to="
                  resultRoute(
                    projectId,
                    detail,
                    canReadAnalysisResult,
                    canReadCaseResult,
                    canReadConversationResult,
                  )!
                "
                class="result-link"
              >
                Открыть {{ detail.resultReference.kind }}
              </RouterLink>
              <span v-else>{{ detail.resultReference.kind }}</span>
              · <code>{{ detail.resultReference.id }}</code>
            </dd>
          </div>
          <div>
            <dt>Время</dt>
            <dd>
              {{ aiOperationDateLabel(detail.startedAt) }} →
              {{ aiOperationDateLabel(detail.completedAt) }}
            </dd>
          </div>
        </dl>
      </section>

      <section class="section">
        <div class="section-heading">
          <h3>Хронология</h3>
          <span>{{ detail.timeline.length }} событий</span>
        </div>
        <ol class="timeline">
          <li v-for="event in detail.timeline" :key="event.sequence">
            <span class="timeline-icon"
              ><i :class="timelineIcon(event.kind)"
            /></span>
            <div class="timeline-body">
              <div class="timeline-title">
                <strong>{{ event.name || event.eventType }}</strong>
                <time>{{ aiOperationDateLabel(event.occurredAt) }}</time>
              </div>
              <p v-if="event.summary">{{ event.summary }}</p>
              <div class="timeline-meta">
                <span>{{ aiOperationActorLabel(event.actor) }}</span>
                <span v-if="event.status">{{ event.status }}</span>
                <span v-if="event.errorCode">{{ event.errorCode }}</span>
              </div>
              <dl v-if="event.dataAccess" class="data-access">
                <div>
                  <dt>Источник</dt>
                  <dd>{{ event.dataAccess.sourceType }}</dd>
                </div>
                <div>
                  <dt>Строки / группы</dt>
                  <dd>
                    {{ event.dataAccess.rowsRead }} /
                    {{ event.dataAccess.groupsReturned }}
                  </dd>
                </div>
                <div v-if="canReadCost">
                  <dt>DB work</dt>
                  <dd>{{ event.dataAccess.workUnits ?? "неизвестно" }}</dd>
                </div>
                <div>
                  <dt>Полнота</dt>
                  <dd>
                    {{
                      event.dataAccess.complete && !event.dataAccess.truncated
                        ? "полные данные"
                        : "есть ограничения"
                    }}
                  </dd>
                </div>
              </dl>
              <div v-if="event.toolCall" class="safe-box">
                {{ event.toolCall.capabilityName }}@{{
                  event.toolCall.capabilityVersion
                }}
                · {{ event.toolCall.normalizedSummary }}
              </div>
              <div v-if="event.modelAttempt" class="safe-box">
                {{ event.modelAttempt.provider }} /
                {{ event.modelAttempt.model }} ·
                {{ event.modelAttempt.zeroDataRetentionObserved }}
              </div>
            </div>
          </li>
        </ol>
        <Button
          v-if="detail.timelinePageInfo.hasMore"
          label="Ещё события"
          severity="secondary"
          outlined
          :loading="timelineLoading"
          :disabled="timelineLoading"
          @click="$emit('loadMoreTimeline')"
        />
      </section>

      <section class="section">
        <div class="section-heading">
          <h3>Provider usage</h3>
          <span>{{ detail.usageRecords }} записей</span>
        </div>
        <div v-if="detail.usage.attempts.length" class="usage-list">
          <article v-for="attempt in detail.usage.attempts" :key="attempt.id">
            <strong
              >{{ attempt.provider }} / {{ attempt.model || "model" }}</strong
            >
            <span>{{ attempt.operation }} · {{ attempt.costStatus }}</span>
            <small>
              {{ attempt.totalTokens }} tokens ·
              {{
                attemptCostLabel(
                  canReadCost,
                  attempt.billedCost,
                  attempt.estimatedCost,
                )
              }}
            </small>
          </article>
        </div>
        <p v-else class="empty-inline">Provider attempts отсутствуют.</p>
        <Button
          v-if="detail.usage.pageInfo.hasMore"
          label="Ещё AI-вызовы"
          severity="secondary"
          outlined
          :loading="usageLoading"
          :disabled="usageLoading"
          @click="$emit('loadMoreUsage')"
        />
      </section>

      <section class="section protected-section">
        <div class="section-heading">
          <div>
            <h3>Участники данных</h3>
            <p>Участие в анализе не означает списание с AI-лимита.</p>
          </div>
          <Button
            v-if="canReadSubjects && !subjects"
            label="Запросить доступ"
            icon="pi pi-users"
            severity="secondary"
            outlined
            :loading="subjectsLoading"
            @click="$emit('loadSubjects')"
          />
        </div>
        <Message v-if="!canReadSubjects" severity="secondary" :closable="false">
          Требуется permission на точный список участников.
        </Message>
        <template v-else-if="subjects">
          <Message
            v-if="subjects.availability === 'NOT_MATERIALIZED'"
            severity="warn"
            :closable="false"
          >
            Exact manifest для этой операции не материализован.
          </Message>
          <div v-else class="subject-list">
            <article
              v-for="subject in subjects.items"
              :key="subject.subjectRowId"
            >
              <div>
                <strong>{{
                  subject.redactedAt
                    ? "Удалённый пользователь"
                    : subject.endUserId || subject.subjectReference
                }}</strong>
                <span>{{ subject.roles.map(roleLabel).join(" · ") }}</span>
              </div>
              <Tag
                :value="
                  subject.charged
                    ? 'Списано с пользователя'
                    : 'Не списано с пользователя'
                "
                :severity="subject.charged ? 'warn' : 'secondary'"
              />
            </article>
          </div>
          <Button
            v-if="subjects.pageInfo.hasMore"
            label="Ещё участники"
            severity="secondary"
            outlined
            :loading="subjectsLoading"
            @click="$emit('loadMoreSubjects')"
          />
        </template>
      </section>

      <section class="section protected-section">
        <div class="section-heading">
          <div>
            <h3>История защищённых чтений</h3>
            <p>Кто и когда открывал детали, участников и сам аудит.</p>
          </div>
          <Button
            v-if="canReadAudit && !accessHistory"
            label="Открыть аудит"
            icon="pi pi-shield"
            severity="secondary"
            outlined
            :loading="accessLoading"
            @click="$emit('loadAccessHistory')"
          />
        </div>
        <Message v-if="!canReadAudit" severity="secondary" :closable="false">
          История доступа ограничена отдельным audit permission.
        </Message>
        <div v-else-if="accessHistory" class="access-list">
          <article
            v-for="access in accessHistory.items"
            :key="access.accessEventId"
          >
            <span
              class="access-outcome"
              :class="{ denied: access.outcome === 'DENIED' }"
            />
            <div>
              <strong>{{
                access.actor.displayName ||
                access.actor.cmsUserId ||
                access.actor.externalId ||
                access.actor.type
              }}</strong>
              <code v-if="access.actor.cmsUserId">{{
                access.actor.cmsUserId
              }}</code>
              <span>
                {{ accessKindLabel(access.accessKind) }} ·
                {{ access.outcome }}
              </span>
              <small>
                {{ access.requiredPermissionCode }} · request
                <code>{{ access.requestId }}</code>
                <template v-if="access.correlationId">
                  · correlation <code>{{ access.correlationId }}</code>
                </template>
              </small>
            </div>
            <time>{{ aiOperationDateLabel(access.occurredAt) }}</time>
          </article>
          <Button
            v-if="accessHistory.pageInfo.hasMore"
            label="Ещё записи аудита"
            severity="secondary"
            outlined
            :loading="accessLoading"
            @click="$emit('loadMoreAccessHistory')"
          />
        </div>
      </section>

      <footer class="technical-footer">
        <span>Outcome: {{ detail.outcomeCode || "—" }}</span>
        <span
          >Operation:
          <code>{{ compactIdentifier(detail.operationId) }}</code></span
        >
      </footer>
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
  box-shadow: 0 18px 50px
    color-mix(in srgb, var(--surface-emphasis) 9%, transparent);
  outline: none;
}
.detail-toolbar,
.header-meta,
.section-heading,
.timeline-title,
.technical-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.detail-toolbar {
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.detail-close {
  min-height: 44px;
  min-width: 44px;
}
.detail-header {
  padding: 16px;
  background:
    radial-gradient(
      circle at 90% 0,
      color-mix(in srgb, var(--brand) 18%, transparent),
      transparent 48%
    ),
    var(--surface-subtle);
  border-radius: 15px;
}
.header-meta {
  margin-bottom: 12px;
  color: var(--muted);
  font-size: 0.75rem;
}
.category {
  color: var(--text-brand);
  font-size: 0.75rem;
  font-weight: 800;
  text-transform: uppercase;
}
h2 {
  margin: 4px 0;
  font-size: 1.4rem;
}
.detail-header p,
.section-heading p {
  margin: 0;
  color: var(--muted);
  font-size: 0.8rem;
  line-height: 1.5;
}
.section {
  display: grid;
  gap: 12px;
  padding-top: 15px;
  border-top: 1px solid var(--line);
}
h3 {
  margin: 0;
  font-size: 0.9rem;
}
.section-heading > span {
  color: var(--muted);
  font-size: 0.75rem;
}
.attribution-grid,
.data-access {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
  margin: 0;
}
.attribution-grid > div,
.data-access > div {
  min-width: 0;
  padding: 10px;
  background: var(--surface-subtle);
  border-radius: 10px;
}
dt {
  color: var(--muted);
  font-size: 0.75rem;
}
dd {
  margin: 4px 0 0;
  font-size: 0.78rem;
  font-weight: 700;
}
code {
  overflow-wrap: anywhere;
  font-size: 0.75rem;
}
.cost-line {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 4px 12px;
  padding: 12px;
  background: color-mix(in srgb, var(--brand) 7%, var(--surface-subtle));
  border-radius: 11px;
  font-size: 0.78rem;
}
.cost-line small {
  grid-column: 1 / -1;
  color: var(--muted);
  font-size: 0.75rem;
}
.source-section dl {
  display: grid;
  gap: 7px;
  margin: 0;
}
.result-link {
  color: var(--text-link);
  font-weight: 750;
  text-decoration: none;
}
.source-section dl div {
  display: grid;
  grid-template-columns: 130px 1fr;
  gap: 10px;
}
.timeline {
  display: grid;
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}
.timeline li {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 10px;
}
.timeline-icon {
  position: relative;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  color: var(--brand);
  background: color-mix(in srgb, var(--brand) 10%, var(--surface-subtle));
  border-radius: 9px;
  font-size: 0.65rem;
}
.timeline li:not(:last-child) .timeline-icon::after {
  position: absolute;
  top: 31px;
  bottom: -100%;
  width: 1px;
  min-height: 22px;
  content: "";
  background: var(--line);
}
.timeline-body {
  min-width: 0;
  padding: 3px 0 16px;
}
.timeline-title strong {
  font-size: 0.78rem;
}
.timeline-title time,
.access-list time {
  color: var(--muted);
  font-size: 0.75rem;
}
.timeline-body p {
  margin: 5px 0;
  color: var(--muted);
  font-size: 0.78rem;
  line-height: 1.5;
}
.timeline-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  color: var(--muted);
  font-size: 0.75rem;
}
.data-access {
  margin-top: 8px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.safe-box {
  margin-top: 8px;
  padding: 8px 10px;
  color: var(--muted);
  background: var(--surface-subtle);
  border-radius: 9px;
  font-size: 0.75rem;
}
.usage-list,
.subject-list,
.access-list {
  display: grid;
  gap: 8px;
}
.usage-list article,
.subject-list article,
.access-list article {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px;
  background: var(--surface-subtle);
  border-radius: 10px;
}
.usage-list article {
  align-items: flex-start;
  flex-direction: column;
}
.usage-list span,
.subject-list span,
.access-list span,
.usage-list small {
  color: var(--muted);
  font-size: 0.75rem;
}
.subject-list article > div,
.access-list article > div {
  display: grid;
  gap: 3px;
  min-width: 0;
}
.subject-list strong,
.access-list strong {
  font-size: 0.78rem;
}
.access-outcome {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  background: var(--status-success);
  border-radius: 50%;
}
.access-outcome.denied {
  background: var(--status-danger);
}
.access-list time {
  margin-left: auto;
}
.empty-inline,
.technical-footer {
  color: var(--muted);
  font-size: 0.75rem;
}
.technical-footer {
  flex-wrap: wrap;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}
@media (max-width: 620px) {
  .attribution-grid,
  .data-access {
    grid-template-columns: 1fr;
  }
  .source-section dl div {
    grid-template-columns: 1fr;
  }
}
</style>
