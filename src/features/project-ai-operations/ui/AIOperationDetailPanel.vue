<script setup lang="ts">
import { computed } from 'vue';
import Button from 'primevue/button';
import Message from 'primevue/message';
import Skeleton from 'primevue/skeleton';
import Tag from 'primevue/tag';
import { cmsUserDetailRoute } from '@/features/cms-user-management/model/cms-user-route';
import type {
  AiOperationDetailResponseDto,
  AiOperationProtectedAccessPageResponseDto,
  AiOperationSubjectPageResponseDto,
} from '@/shared/api/generated/models';
import TechnicalIdentifier from '@/shared/ui/TechnicalIdentifier.vue';
import {
  aiOperationActorLabel,
  aiOperationCategoryLabel,
  aiOperationChargedAccountLabel,
  aiOperationCostLabel,
  aiOperationDateLabel,
  aiOperationDescriptionLabel,
  aiOperationOutcomeLabel,
  aiOperationStatusPresentation,
  aiOperationTitleLabel,
} from '../model/project-ai-operation-presentation';

const props = defineProps<{
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
  canReadCmsUsers?: boolean;
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
  if (kind === 'MODEL_ATTEMPT') return 'pi pi-sparkles';
  if (kind === 'TOOL_CALL') return 'pi pi-wrench';
  if (kind === 'DATA_ACCESS') return 'pi pi-database';
  if (kind === 'RESULT') return 'pi pi-check-circle';
  return 'pi pi-circle-fill';
}

function timelineLabel(kind: string, eventType: string, name?: string | null): string {
  const labels: Record<string, string> = {
    DATA_ACCESS_COMPLETED: 'Данные прочитаны',
    OPERATION_FAILED: 'Операция завершилась ошибкой',
    OPERATION_COMPLETED: 'Операция завершена',
    MODEL_ATTEMPT_STARTED: 'Отправлен запрос модели',
    MODEL_ATTEMPT_COMPLETED: 'Получен ответ модели',
    TOOL_CALL_STARTED: 'Запущен инструмент',
    TOOL_CALL_COMPLETED: 'Инструмент завершил работу',
  };
  if (labels[eventType]) return labels[eventType];
  if (name && !/^[A-Z0-9_]+$/.test(name)) return name;
  const byKind: Record<string, string> = {
    MODEL_ATTEMPT: 'Обращение к модели',
    TOOL_CALL: 'Выполнение действия',
    DATA_ACCESS: 'Работа с данными',
    RESULT: 'Результат операции',
  };
  return byKind[kind] ?? 'Этап операции';
}

function eventStatusLabel(status?: string | null): string {
  const labels: Record<string, string> = {
    STARTED: 'Запущено',
    RUNNING: 'Выполняется',
    SUCCEEDED: 'Завершено',
    FAILED: 'Ошибка',
    CANCELLED: 'Отменено',
  };
  return status ? (labels[status] ?? status) : '';
}

function dataSourceLabel(sourceType: string): string {
  const labels: Record<string, string> = {
    PROJECT_ANALYSIS_QUERY: 'Данные проекта для анализа',
    CONVERSATION: 'Диалог с пользователем',
    USER_MEMORY: 'Память пользователя',
    END_USER_CASE: 'Обращение пользователя',
  };
  return labels[sourceType] ?? 'Источник данных';
}

function resultReferenceLabel(kind: string): string {
  const labels: Record<string, string> = {
    AI_ANALYSIS: 'анализ',
    END_USER_CASE: 'обращение',
    CONVERSATION: 'диалог',
  };
  return labels[kind] ?? 'результат';
}

function countLabel(count: number, one: string, few: string, many: string): string {
  const modulo100 = count % 100;
  const modulo10 = count % 10;
  const form =
    modulo100 >= 11 && modulo100 <= 14
      ? many
      : modulo10 === 1
        ? one
        : modulo10 >= 2 && modulo10 <= 4
          ? few
          : many;
  return `${count} ${form}`;
}

const resultSummary = computed(() => {
  const timeline = props.detail?.timeline ?? [];
  return (
    [...timeline]
      .reverse()
      .find((event) => event.summary?.trim())
      ?.summary?.trim() ?? null
  );
});

const hasStoredPayload = computed(() =>
  (props.detail?.timeline ?? []).some((event) => event.inputHash || event.outputHash),
);

function roleLabel(role: string): string {
  const labels: Record<string, string> = {
    SCOPE_MEMBER: 'в области',
    DATA_CONTRIBUTOR: 'данные участвовали',
    DIRECT_SUBJECT: 'прямой объект',
  };
  return labels[role] ?? role;
}

function accessKindLabel(kind: string): string {
  const labels: Record<string, string> = {
    METADATA: 'Метаданные операции',
    RESULT: 'Результат операции',
    COST: 'Стоимость и нагрузка на базу данных',
    SENSITIVE_DETAIL: 'Детали операции',
    SUBJECT_MANIFEST: 'Список участников',
    ACCESS_HISTORY: 'История доступа',
  };
  return labels[kind] ?? kind;
}

function attemptCostLabel(
  canReadCost: boolean,
  billedCost?: string | null,
  estimatedCost?: string | null,
): string {
  if (!canReadCost) return 'стоимость скрыта';
  const value = billedCost ?? estimatedCost;
  return value == null ? 'стоимость неизвестна' : aiOperationCostLabel(value);
}

function resultRoute(
  projectId: string,
  detail: AiOperationDetailResponseDto,
  canReadAnalysisResult: boolean,
  canReadCaseResult: boolean,
  canReadConversationResult: boolean,
) {
  if (canReadAnalysisResult && detail.resultReference?.kind === 'AI_ANALYSIS') {
    return {
      name: 'ai-analysis-detail',
      params: { analysisId: detail.resultReference.id },
      query: { projectId },
    };
  }
  if (canReadCaseResult && detail.resultReference?.kind === 'END_USER_CASE') {
    return {
      name: 'end-user-case-detail',
      params: { caseId: detail.resultReference.id },
      query: { projectId },
    };
  }
  if (
    canReadConversationResult &&
    detail.resultReference?.kind === 'CONVERSATION' &&
    detail.resultReference.endUserId
  ) {
    return {
      name: 'users',
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
      <span>Операция AI</span>
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
        <span class="category">{{ aiOperationCategoryLabel(detail.category) }}</span>
        <h2>{{ aiOperationTitleLabel(detail.title, detail.category) }}</h2>
      </header>

      <Message v-if="detail.restrictedSections.length" severity="warn" :closable="false">
        Часть данных недоступна:
        {{ detail.restrictedSections.join(', ') }}
      </Message>

      <section class="request-result" aria-label="Запрос и результат операции">
        <article>
          <span class="request-result-label">Что запросили</span>
          <p>
            {{
              detail.purpose
                ? aiOperationDescriptionLabel(detail.purpose)
                : 'Описание запроса не передано в журнал.'
            }}
          </p>
        </article>
        <article :class="{ failed: detail.status === 'FAILED' }">
          <div class="result-heading">
            <span class="request-result-label">Что получили</span>
            <strong>{{ aiOperationOutcomeLabel(detail.outcomeCode, detail.status) }}</strong>
          </div>
          <p>
            {{
              (resultSummary ? aiOperationDescriptionLabel(resultSummary) : null) ||
              (detail.resultReference
                ? 'Результат сохранён и доступен в соответствующем разделе.'
                : 'Краткое содержание результата не передано в журнал.')
            }}
          </p>
          <RouterLink
            v-if="
              detail.resultReference &&
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
            Открыть {{ resultReferenceLabel(detail.resultReference.kind) }}
          </RouterLink>
        </article>
        <small v-if="hasStoredPayload" class="payload-note">
          Полный текст запроса и ответа в журнале не хранится; доступны безопасные сводки и
          контрольные отпечатки.
        </small>
      </section>

      <section class="section">
        <h3>Ответственность и расходы</h3>
        <dl class="attribution-grid">
          <div>
            <dt>Инициатор</dt>
            <dd>{{ aiOperationActorLabel(detail.initiator) }}</dd>
          </div>
          <div>
            <dt>Источник расходов</dt>
            <dd>
              {{ aiOperationChargedAccountLabel(detail.chargedAccount) }}
            </dd>
          </div>
          <div>
            <dt>Ответственный администратор</dt>
            <dd>
              {{
                detail.responsibleCmsUserDisplayName ||
                detail.responsibleCmsUserId ||
                'не применяется'
              }}
            </dd>
          </div>
          <div>
            <dt>Разрешил фоновый запуск</dt>
            <dd>
              {{
                detail.authorizedByCmsUserDisplayName ||
                detail.authorizedByCmsUserId ||
                'не применяется'
              }}
            </dd>
          </div>
        </dl>
        <div class="cost-line">
          <template v-if="canReadCost && detail.cost">
            <span>Итоговая стоимость</span>
            <strong>{{ aiOperationCostLabel(detail.cost.effectiveCost) }}</strong>
            <small>
              {{
                countLabel(
                  detail.usageRecords,
                  'обращение к модели',
                  'обращения к моделям',
                  'обращений к моделям',
                )
              }}
              <template v-if="detail.dbWorkUnits != null">
                · нагрузка на базу данных: {{ detail.dbWorkUnits }} усл. ед.
              </template>
            </small>
          </template>
          <template v-else-if="canReadCost">
            <i class="pi pi-question-circle" />
            Денежная стоимость неизвестна
          </template>
          <template v-else>
            <i class="pi pi-lock" />
            Для просмотра стоимости нужен отдельный доступ
          </template>
        </div>
      </section>

      <details class="technical-section">
        <summary>
          <span><i class="pi pi-code" /> Технические данные операции</span>
          <i class="pi pi-chevron-down" />
        </summary>
        <div class="technical-grid">
          <TechnicalIdentifier label="Operation ID" :value="detail.operationId" />
          <TechnicalIdentifier label="Root correlation" :value="detail.rootCorrelationId" />
          <TechnicalIdentifier label="Тип источника" :value="detail.sourceKind" />
          <TechnicalIdentifier label="Источник" :value="detail.sourceId" />
          <TechnicalIdentifier
            v-if="detail.initiator.id"
            label="Инициатор"
            :value="detail.initiator.id"
            :to="
              detail.initiator.type === 'END_USER'
                ? {
                    name: 'users',
                    params: { endUserId: detail.initiator.id },
                    query: { projectId },
                  }
                : detail.initiator.type === 'CMS_USER'
                  ? cmsUserDetailRoute(detail.initiator.id, Boolean(canReadCmsUsers))
                  : undefined
            "
          />
          <TechnicalIdentifier
            v-if="detail.chargedEndUserId"
            label="Владелец AI-лимита"
            :value="detail.chargedEndUserId"
            :to="{
              name: 'users',
              params: { endUserId: detail.chargedEndUserId },
              query: { projectId },
            }"
          />
          <TechnicalIdentifier
            v-if="detail.responsibleCmsUserId"
            label="Ответственный администратор"
            :value="detail.responsibleCmsUserId"
            :to="cmsUserDetailRoute(detail.responsibleCmsUserId, Boolean(canReadCmsUsers))"
          />
          <TechnicalIdentifier
            v-if="detail.authorizedByCmsUserId"
            label="Разрешил фоновый запуск"
            :value="detail.authorizedByCmsUserId"
            :to="cmsUserDetailRoute(detail.authorizedByCmsUserId, Boolean(canReadCmsUsers))"
          />
          <TechnicalIdentifier
            v-if="detail.resultReference"
            label="ID результата"
            :value="detail.resultReference.id"
            :to="
              resultRoute(
                projectId,
                detail,
                canReadAnalysisResult,
                canReadCaseResult,
                canReadConversationResult,
              ) ?? undefined
            "
          />
        </div>
      </details>

      <section class="section">
        <div class="section-heading">
          <h3>Хронология</h3>
          <span>{{ countLabel(detail.timeline.length, 'событие', 'события', 'событий') }}</span>
        </div>
        <ol class="timeline">
          <li v-for="event in detail.timeline" :key="event.sequence">
            <span class="timeline-icon"><i :class="timelineIcon(event.kind)" /></span>
            <div class="timeline-body">
              <div class="timeline-title">
                <strong>{{ timelineLabel(event.kind, event.eventType, event.name) }}</strong>
                <time>{{ aiOperationDateLabel(event.occurredAt) }}</time>
              </div>
              <p v-if="event.summary">
                {{ aiOperationDescriptionLabel(event.summary) }}
              </p>
              <div class="timeline-meta">
                <span>{{ aiOperationActorLabel(event.actor) }}</span>
                <span v-if="event.status">{{ eventStatusLabel(event.status) }}</span>
                <span v-if="event.errorCode">{{ aiOperationOutcomeLabel(event.errorCode) }}</span>
              </div>
              <dl v-if="event.dataAccess" class="data-access">
                <div>
                  <dt>Источник</dt>
                  <dd>{{ dataSourceLabel(event.dataAccess.sourceType) }}</dd>
                </div>
                <div>
                  <dt>Строки / группы</dt>
                  <dd>
                    {{ event.dataAccess.rowsRead }} /
                    {{ event.dataAccess.groupsReturned }}
                  </dd>
                </div>
                <div v-if="canReadCost">
                  <dt>Нагрузка на БД</dt>
                  <dd>{{ event.dataAccess.workUnits ?? 'неизвестно' }}</dd>
                </div>
                <div>
                  <dt>Полнота</dt>
                  <dd>
                    {{
                      event.dataAccess.complete && !event.dataAccess.truncated
                        ? 'полные данные'
                        : 'есть ограничения'
                    }}
                  </dd>
                </div>
              </dl>
              <div v-if="event.toolCall" class="safe-box">
                {{
                  event.toolCall.normalizedSummary
                    ? aiOperationDescriptionLabel(event.toolCall.normalizedSummary)
                    : 'Действие выполнено'
                }}
              </div>
              <div v-if="event.modelAttempt" class="safe-box">
                Модель: {{ event.modelAttempt.provider }} /
                {{ event.modelAttempt.model }}
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
          <h3>Обращения к моделям</h3>
          <span>{{ countLabel(detail.usageRecords, 'запись', 'записи', 'записей') }}</span>
        </div>
        <div v-if="detail.usage.attempts.length" class="usage-list">
          <article v-for="attempt in detail.usage.attempts" :key="attempt.id">
            <strong>{{ attempt.provider }} / {{ attempt.model || 'model' }}</strong>
            <span>{{ attempt.operation }} · {{ attempt.costStatus }}</span>
            <small>
              {{ attempt.totalTokens }} токенов ·
              {{ attemptCostLabel(canReadCost, attempt.billedCost, attempt.estimatedCost) }}
            </small>
          </article>
        </div>
        <p v-else class="empty-inline">Подробные записи об обращениях не переданы в журнал.</p>
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
          Для просмотра точного списка участников нужен отдельный доступ.
        </Message>
        <template v-else-if="subjects">
          <Message
            v-if="subjects.availability === 'NOT_MATERIALIZED'"
            severity="warn"
            :closable="false"
          >
            Точный список участников для этой операции не был сохранён.
          </Message>
          <div v-else class="subject-list">
            <article v-for="subject in subjects.items" :key="subject.subjectRowId">
              <div>
                <strong>{{
                  subject.redactedAt
                    ? 'Удалённый пользователь'
                    : subject.endUserId || subject.subjectReference
                }}</strong>
                <span>{{ subject.roles.map(roleLabel).join(' · ') }}</span>
              </div>
              <Tag
                :value="subject.charged ? 'Списано с пользователя' : 'Не списано с пользователя'"
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
          Для просмотра истории доступа нужен отдельный доступ.
        </Message>
        <div v-else-if="accessHistory" class="access-list">
          <article v-for="access in accessHistory.items" :key="access.accessEventId">
            <span class="access-outcome" :class="{ denied: access.outcome === 'DENIED' }" />
            <div>
              <strong>{{
                access.actor.displayName ||
                access.actor.cmsUserId ||
                access.actor.externalId ||
                access.actor.type
              }}</strong>
              <code v-if="access.actor.cmsUserId">{{ access.actor.cmsUserId }}</code>
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
.request-result {
  display: grid;
  gap: 10px;
}
.request-result article {
  display: grid;
  gap: 7px;
  padding: 14px;
  background: var(--surface-subtle);
  border-left: 3px solid var(--brand);
  border-radius: 10px;
}
.request-result article.failed {
  border-left-color: var(--status-danger);
}
.request-result-label {
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 750;
  text-transform: uppercase;
}
.request-result p {
  margin: 0;
  font-size: 0.86rem;
  line-height: 1.55;
}
.result-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.result-heading strong {
  font-size: 0.78rem;
}
.payload-note {
  color: var(--muted);
  font-size: 0.72rem;
  line-height: 1.45;
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
.technical-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  padding: 13px;
  border-top: 1px solid var(--line);
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
  content: '';
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
  .data-access,
  .technical-grid {
    grid-template-columns: 1fr;
  }
  .source-section dl div {
    grid-template-columns: 1fr;
  }
}
</style>
