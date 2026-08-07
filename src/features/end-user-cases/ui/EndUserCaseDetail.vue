<script setup lang="ts">
import { ref, watch } from "vue";
import Button from "primevue/button";
import Message from "primevue/message";
import Select from "primevue/select";
import Skeleton from "primevue/skeleton";
import { formatDate } from "@/shared/lib/format";
import CaseEventVerification from "@/features/event-query/ui/CaseEventVerification.vue";
import type { CaseVerificationRunResponseDto } from "@/shared/api/generated/models";
import type { EndUserCaseDetailBundle } from "../api/end-user-cases-repository";
import type { EndUserCaseStatus } from "../model/end-user-case";
import { isTerminalEndUserCase } from "../model/end-user-case";
import type { EndUserCaseEscalationAction } from "../model/end-user-case-escalation";
import EndUserCaseEscalationPanel from "./EndUserCaseEscalationPanel.vue";
import {
  endUserCaseActionLabel,
  endUserCaseCapabilityLabel,
  endUserCaseChannelLabel,
  endUserCaseEventLabel,
  endUserCaseGroupLabel,
  endUserCasePriorityLabel,
  endUserCaseStatusLabel,
  endUserCaseToneLabel,
} from "../model/end-user-case-presentation";

const props = defineProps<{
  value: EndUserCaseDetailBundle | null;
  loading: boolean;
  messagesLoading?: boolean;
  mutating?: boolean;
  canManage?: boolean;
  canAssign?: boolean;
  canEscalate?: boolean;
  currentCmsUserId?: string;
  canReadEndUser?: boolean;
  canReadConversation?: boolean;
  error?: string | null;
  projectId?: string;
  canVerifyEvents?: boolean;
  canPreviewEvents?: boolean;
  verificationRun?: CaseVerificationRunResponseDto | null;
}>();
defineEmits<{
  retry: [];
  requestTransition: [status: EndUserCaseStatus];
  requestAssignment: [];
  requestClassification: [];
  requestUnlink: [messageId: string];
  requestMerge: [];
  requestSplit: [];
  requestEscalationAction: [action: EndUserCaseEscalationAction];
  loadMoreMessages: [];
  verificationCompleted: [run: CaseVerificationRunResponseDto];
}>();

type RelatedTab = "messages" | "history";

const relatedTabs: readonly RelatedTab[] = ["messages", "history"];
const activeRelatedTab = ref<RelatedTab>("messages");
const resolutionActions: readonly EndUserCaseStatus[] = [
  "RESOLVED",
  "UNRESOLVED",
];

const workflowStatusOptions = (statuses: EndUserCaseStatus[]) =>
  statuses
    .filter(
      (status) =>
        status !== "WAITING_ADMIN" && !resolutionActions.includes(status),
    )
    .map((status) => ({
      label: endUserCaseActionLabel(status),
      value: status,
    }));

watch(
  () => props.value?.case.id,
  (caseId, previousCaseId) => {
    if (caseId !== previousCaseId) activeRelatedTab.value = "messages";
  },
);

function handleRelatedTabKeydown(event: KeyboardEvent, tab: RelatedTab): void {
  const currentIndex = relatedTabs.indexOf(tab);
  let nextIndex: number | null = null;
  if (event.key === "ArrowRight") {
    nextIndex = (currentIndex + 1) % relatedTabs.length;
  } else if (event.key === "ArrowLeft") {
    nextIndex = (currentIndex - 1 + relatedTabs.length) % relatedTabs.length;
  } else if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = relatedTabs.length - 1;
  }
  if (nextIndex === null) return;
  event.preventDefault();
  const nextTab = relatedTabs[nextIndex]!;
  activeRelatedTab.value = nextTab;
  requestAnimationFrame(() =>
    document.getElementById(`case-${nextTab}-tab`)?.focus(),
  );
}

const resolutionLabel = (assessment: string): string =>
  ({
    NOT_ASSESSED: "Решение ещё не оценено",
    LIKELY_RESOLVED: "Вероятно решено — требует подтверждения",
    CONFIRMED_RESOLVED: "Решение подтверждено",
    LIKELY_UNRESOLVED: "Вероятно не решено",
    CONFIRMED_UNRESOLVED: "Подтверждено: не решено",
    INCONCLUSIVE: "Недостаточно данных",
  })[assessment] ?? "Статус решения неизвестен";

const roleLabel = (role: string): string =>
  ({ USER: "Пользователь", ASSISTANT: "Retenive", ADMIN: "Администратор" })[role] ??
  role;

const messageChannel = (message: {
  role: string;
  metadata: unknown;
}): "TEXT" | "VOICE" | "CMS" => {
  if (message.role === "ADMIN") return "CMS";
  const metadata =
    message.metadata &&
    typeof message.metadata === "object" &&
    !Array.isArray(message.metadata)
      ? (message.metadata as Record<string, unknown>)
      : {};
  return metadata.source === "voice" ? "VOICE" : "TEXT";
};

</script>

<template>
  <div class="case-detail">
    <div v-if="loading" class="detail-loading" aria-label="Загрузка обращения">
      <Skeleton width="70%" height="34px" />
      <Skeleton height="90px" />
      <Skeleton v-for="index in 4" :key="index" height="64px" />
    </div>
    <Message v-else-if="error && !value" severity="error" :closable="false">
      {{ error }}
      <Button label="Повторить" text size="small" @click="$emit('retry')" />
    </Message>
    <template v-else-if="value">
      <section class="detail-card identity-card">
        <header class="detail-header">
          <div class="kicker">
            <span>Обращение № {{ value.case.projectSequence }}</span>
            <span class="group-badge">{{
              endUserCaseGroupLabel(value.case.groupCode)
            }}</span>
          </div>
          <h2 tabindex="-1">{{ value.case.title }}</h2>
          <p>{{ value.case.goal }}</p>
          <div class="badges">
            <span class="badge status">{{
              endUserCaseStatusLabel(value.case.status)
            }}</span>
            <span class="badge priority">
              {{ endUserCasePriorityLabel(value.case.priority) }}
            </span>
            <span class="badge">{{
              resolutionLabel(value.case.resolution.assessment)
            }}</span>
          </div>
        </header>

        <div class="card-divider" />

        <div class="meta-grid">
          <div>
            <span>Пользователь</span>
            <RouterLink
              v-if="canReadEndUser"
              :to="{
                name: 'users',
                params: { endUserId: value.case.endUser.id },
              }"
            >
              {{ value.case.endUser.externalId }}
            </RouterLink>
            <strong v-else>{{ value.case.endUser.externalId }}</strong>
          </div>
          <div>
            <span>Исполнитель</span>
            <strong>{{
              value.case.assignee?.displayName ?? "Не назначен"
            }}</strong>
          </div>
          <div>
            <span>Последняя активность</span>
            <strong>{{ formatDate(value.case.lastActivityAt) }}</strong>
          </div>
          <div>
            <span>Настроение пользователя</span>
            <strong
              >{{ endUserCaseToneLabel(value.case.initialTone) }} →
              {{ endUserCaseToneLabel(value.case.currentTone) }}</strong
            >
          </div>
          <div>
            <span>Возвраты к цели</span>
            <strong>{{ value.case.endUserRecontactCount }}</strong>
          </div>
        </div>
      </section>

      <Message v-if="error" severity="warn" :closable="false">{{
        error
      }}</Message>
      <Message
        v-if="value.case.mergedIntoCaseId"
        severity="info"
        :closable="false"
      >
        Это обращение объединено с
        <RouterLink
          :to="{
            name: 'end-user-case-detail',
            params: { caseId: value.case.mergedIntoCaseId },
          }"
        >
          основным обращением </RouterLink
        >.
      </Message>
      <Message
        v-if="value.case.degradedReason"
        severity="warn"
        :closable="false"
      >
        Анализ временно отстаёт. Сохранённые сообщения и действия остаются
        доступны, но сводка может обновиться позже.
      </Message>

      <EndUserCaseEscalationPanel
        :items="value.escalations.items"
        :terminal="isTerminalEndUserCase(value.case.status)"
        :current-cms-user-id="currentCmsUserId"
        :can-escalate="canEscalate"
        :can-assign="canAssign"
        :can-manage="canManage"
        :mutating="mutating"
        @action="$emit('requestEscalationAction', $event)"
      />

      <section
        class="detail-card overview-card"
        aria-labelledby="case-overview-title"
      >
        <h3 id="case-overview-title" class="card-title">Обзор</h3>

        <div class="overview-block">
          <div class="section-heading">
            <h4>Актуальная сводка</h4>
            <small>Версия {{ value.case.version }}</small>
          </div>
          <p>{{ value.case.summary || "Сводка ещё формируется." }}</p>
        </div>

        <template v-if="value.case.workSummary">
          <div class="overview-block">
            <div class="section-heading">
              <h4>Что уже сделано</h4>
              <small>
                Каналы:
                {{
                  value.case.channels.length
                    ? value.case.channels
                        .map(endUserCaseChannelLabel)
                        .join(", ")
                    : "не определены"
                }}
              </small>
            </div>
            <div
              v-if="value.case.workSummary.aiCapabilities.length"
              class="capability-list"
            >
              <div
                v-for="capability in value.case.workSummary.aiCapabilities"
                :key="capability.actionTypeCode"
                class="capability-row"
              >
                <strong :title="capability.actionTypeCode">{{
                  endUserCaseCapabilityLabel(capability.actionTypeCode)
                }}</strong>
                <span>
                  {{ capability.invocationCount }} вызовов ·
                  {{ capability.succeeded }} успешно · {{ capability.failed }} с
                  ошибкой
                </span>
              </div>
            </div>
            <p v-else class="empty-copy">
              Инструменты Retenive ещё не использовались.
            </p>
            <p
              v-if="
                value.case.workSummary.cmsParticipation.messageCount ||
                value.case.workSummary.cmsParticipation.actionCount
              "
            >
              Администратор:
              {{ value.case.workSummary.cmsParticipation.messageCount }}
              сообщений,
              {{ value.case.workSummary.cmsParticipation.actionCount }}
              действий.
            </p>
          </div>

          <div
            v-if="value.case.workSummary.blockers.length"
            class="overview-block work-copy"
          >
            <h4>Блокеры</h4>
            <span>{{ value.case.workSummary.blockers.join(" · ") }}</span>
          </div>
          <div
            v-if="value.case.workSummary.limitations.length"
            class="overview-block work-copy"
          >
            <h4>Ограничения</h4>
            <span>{{ value.case.workSummary.limitations.join(" · ") }}</span>
          </div>
        </template>
      </section>

      <section v-if="projectId" class="verification-wrapper">
        <CaseEventVerification
          :project-id="projectId"
          :case-id="value.case.id"
          :case-created-at="value.case.createdAt"
          :case-status="value.case.status"
          :can-verify="canVerifyEvents === true"
          :can-preview="canPreviewEvents === true"
          :run-id="value.case.latestVerificationRunId"
          :initial-run="verificationRun"
          @completed="$emit('verificationCompleted', $event)"
        />
      </section>

      <section
        v-if="canManage"
        class="detail-card workflow-card"
        aria-labelledby="case-actions-title"
      >
        <h3 id="case-actions-title" class="card-title">Действия</h3>
        <p class="section-description">
          Решение подтверждается только явным действием или проверенным фактом.
        </p>
        <div v-if="!value.case.activeEscalation" class="status-actions">
          <Select
            v-if="workflowStatusOptions(value.case.availableStatuses).length"
            class="status-select"
            :model-value="null"
            :options="workflowStatusOptions(value.case.availableStatuses)"
            option-label="label"
            option-value="value"
            placeholder="Изменить статус"
            aria-label="Изменить статус"
            :disabled="mutating"
            @update:model-value="$emit('requestTransition', $event)"
          />
          <Button
            v-for="status in value.case.availableStatuses.filter((item) =>
              resolutionActions.includes(item),
            )"
            :key="status"
            :data-status="status"
            :label="endUserCaseActionLabel(status)"
            :severity="status === 'RESOLVED' ? 'success' : 'danger'"
            :loading="mutating"
            @click="$emit('requestTransition', status)"
          />
        </div>
        <div class="workflow-tools">
          <Button
            v-if="canAssign && !value.case.activeEscalation"
            label="Назначение"
            icon="pi pi-user-edit"
            severity="secondary"
            text
            @click="$emit('requestAssignment')"
          />
          <Button
            label="Исправить классификацию"
            icon="pi pi-pencil"
            severity="secondary"
            text
            @click="$emit('requestClassification')"
          />
          <Button
            label="Объединить"
            icon="pi pi-clone"
            severity="secondary"
            text
            @click="$emit('requestMerge')"
          />
          <Button
            v-if="value.messages.items.length > 1"
            label="Разделить"
            icon="pi pi-sitemap"
            severity="secondary"
            text
            @click="$emit('requestSplit')"
          />
        </div>
      </section>

      <section class="detail-card related-card">
        <div class="related-tabs" role="tablist" aria-label="Связанные данные">
          <button
            id="case-messages-tab"
            type="button"
            role="tab"
            aria-controls="case-messages-panel"
            :aria-selected="activeRelatedTab === 'messages'"
            :tabindex="activeRelatedTab === 'messages' ? 0 : -1"
            @click="activeRelatedTab = 'messages'"
            @keydown="handleRelatedTabKeydown($event, 'messages')"
          >
            Доказательства
            <strong>{{ value.messages.items.length }}</strong>
          </button>
          <button
            id="case-history-tab"
            type="button"
            role="tab"
            aria-controls="case-history-panel"
            :aria-selected="activeRelatedTab === 'history'"
            :tabindex="activeRelatedTab === 'history' ? 0 : -1"
            @click="activeRelatedTab = 'history'"
            @keydown="handleRelatedTabKeydown($event, 'history')"
          >
            История
            <strong>{{ value.timeline.events.length }}</strong>
          </button>
        </div>

        <div
          v-if="activeRelatedTab === 'messages'"
          id="case-messages-panel"
          class="related-panel"
          role="tabpanel"
          aria-labelledby="case-messages-tab"
        >
          <div v-if="value.messages.items.length" class="panel-context">
            <span>
              Материалов обращения:
              <strong>{{ value.messages.items.length }}</strong>
              · здесь показаны только материалы обращения, не весь диалог
            </span>
          </div>
          <div v-if="!value.messages.items.length" class="empty-copy">
            Связанных доказательств пока нет.
          </div>
          <div v-if="value.messages.items.length" class="case-evidence-list">
            <article
              v-for="link in value.messages.items"
              :key="link.message.id"
              class="case-message-evidence"
            >
              <div class="evidence-meta">
                <strong>{{ roleLabel(link.message.role) }}</strong>
                <span>{{
                  link.relation === "PRIMARY" ? "Основное" : "Контекст"
                }}</span>
                <span>{{
                  endUserCaseChannelLabel(messageChannel(link.message))
                }}</span>
                <time :datetime="link.message.createdAt">
                  {{ formatDate(link.message.createdAt) }}
                </time>
              </div>
              <p class="evidence-excerpt">{{ link.message.text }}</p>
              <div class="evidence-actions">
                <RouterLink
                  v-if="canReadEndUser && canReadConversation"
                  :to="{
                    name: 'users',
                    params: { endUserId: value.case.endUser.id },
                    query: {
                      conversationId: link.message.threadId,
                      endUserCaseId: value.case.id,
                    },
                  }"
                >
                  Открыть в диалоге
                  <i class="pi pi-arrow-up-right" aria-hidden="true" />
                </RouterLink>
                <span v-else>
                  Диалог {{ link.message.threadId.slice(0, 8) }}
                </span>
                <Button
                  v-if="canManage"
                  label="Исключить"
                  severity="secondary"
                  text
                  size="small"
                  @click="$emit('requestUnlink', link.message.id)"
                />
              </div>
            </article>
          </div>
          <Button
            v-if="value.messages.nextCursor"
            label="Показать ещё доказательства"
            icon="pi pi-chevron-down"
            severity="secondary"
            outlined
            :loading="messagesLoading"
            @click="$emit('loadMoreMessages')"
          />
        </div>

        <div
          v-else
          id="case-history-panel"
          class="related-panel"
          role="tabpanel"
          aria-labelledby="case-history-tab"
        >
          <div v-if="!value.timeline.events.length" class="empty-copy">
            История появится после следующего изменения.
          </div>
          <div
            v-for="event in value.timeline.events"
            :key="event.id"
            class="timeline-row"
          >
            <i class="pi pi-circle-fill" />
            <strong>{{ endUserCaseEventLabel(event.type) }}</strong>
            <time :datetime="event.createdAt">{{
              formatDate(event.createdAt)
            }}</time>
          </div>
        </div>
      </section>
    </template>
    <div v-else class="placeholder">
      <i class="pi pi-comments" />
      <strong>Выберите обращение</strong>
      <p>Здесь появятся сводка, доказательства, решения и история.</p>
    </div>
  </div>
</template>

<style scoped>
.case-detail {
  min-height: 100%;
  padding: 18px;
  background: var(--surface-subtle);
}
.case-detail,
.detail-loading {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.detail-card {
  padding: 22px;
  border: 1px solid var(--border-default);
  border-radius: 18px;
  background: var(--surface-card);
}
.verification-wrapper {
  display: contents;
}
.kicker,
.badges,
.section-heading,
.evidence-meta,
.status-actions,
.workflow-tools,
.timeline-row {
  display: flex;
  align-items: center;
}
.kicker {
  justify-content: space-between;
  color: var(--text-tertiary);
  font-size: 0.7rem;
  font-weight: 700;
}
.group-badge {
  padding: 5px 9px;
  border-radius: 999px;
  background: var(--surface-subtle);
  color: var(--text-secondary);
}
.detail-header h2 {
  margin: 9px 0 5px;
  font:
    760 1.45rem/1.18 var(--font-display),
    sans-serif;
}
.detail-header p,
.overview-card p,
.evidence-excerpt {
  margin-bottom: 0;
  color: var(--text-secondary);
  line-height: 1.55;
}
.badges {
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 14px;
}
.badge {
  padding: 5px 9px;
  border-radius: 999px;
  background: var(--surface-subtle);
  font-size: 0.68rem;
  font-weight: 700;
}
.badge.priority {
  background: var(--status-warning-soft);
  color: var(--status-warning-text);
}
.badge.status {
  background: var(--status-accent-soft);
  color: var(--status-accent-text);
}
.card-divider {
  height: 1px;
  margin: 20px 0;
  background: var(--border-subtle);
}
.meta-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.meta-grid > div {
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--border-default);
  border-radius: 14px;
  background: var(--surface-subtle);
}
.meta-grid span,
.meta-grid strong {
  display: block;
}
.meta-grid span,
.section-heading small {
  color: var(--text-tertiary);
  font-size: var(--font-size-caption);
}
.meta-grid strong,
.meta-grid a {
  margin-top: 5px;
  overflow-wrap: anywhere;
  font-size: var(--font-size-body);
}
.meta-grid a {
  display: block;
  color: var(--text-link);
  font-weight: 700;
}
.card-title {
  margin: 0;
  font-size: var(--font-size-heading-small);
}
.overview-card > .card-title {
  margin-bottom: 16px;
}
.overview-block {
  padding: 16px 0;
  border-top: 1px solid var(--border-subtle);
}
.overview-card > .card-title + .overview-block {
  padding-top: 0;
  border-top: 0;
}
.section-heading {
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.section-heading h4,
.work-copy h4 {
  margin: 0;
  font:
    700 var(--font-size-body) var(--font-display),
    sans-serif;
}
.section-description {
  margin: 4px 0 16px;
  color: var(--text-secondary);
  font-size: var(--font-size-body-small);
}
.status-actions,
.workflow-tools {
  flex-wrap: wrap;
  gap: 8px;
}
.status-select {
  width: min(220px, 100%);
}
.workflow-tools {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle);
}
.capability-list,
.work-copy {
  display: grid;
  gap: 6px;
}
.capability-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 0;
  border-top: 1px solid var(--border-subtle);
  font-size: 0.74rem;
}
.capability-row span,
.work-copy span,
.overview-card p {
  color: var(--text-secondary);
  font-size: var(--font-size-body-small);
}
.related-card {
  padding-top: 0;
}
.related-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border-bottom: 1px solid var(--border-subtle);
}
.related-tabs button {
  position: relative;
  min-width: 0;
  padding: 18px 8px 13px;
  border: 0;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  font-weight: 700;
  text-align: left;
}
.related-tabs button::after {
  position: absolute;
  right: 8px;
  bottom: -1px;
  left: 8px;
  height: 2px;
  border-radius: 999px;
  background: transparent;
  content: "";
}
.related-tabs button:hover {
  color: var(--text-secondary);
}
.related-tabs button[aria-selected="true"] {
  color: var(--text-primary);
}
.related-tabs button[aria-selected="true"]::after {
  background: var(--action-primary);
}
.related-tabs strong {
  color: inherit;
}
.related-panel {
  padding-top: 14px;
}
.panel-context {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--surface-subtle);
  color: var(--text-tertiary);
  font-size: var(--font-size-caption);
}
.panel-context a {
  flex: 0 0 auto;
  color: var(--text-link);
  font-weight: 700;
}
.case-evidence-list {
  display: grid;
  gap: 10px;
}
.case-message-evidence {
  padding: 12px;
  border: 1px solid var(--border-default);
  border-radius: 12px;
  background: var(--surface-subtle);
}
.evidence-meta {
  gap: 9px;
  color: var(--text-tertiary);
  font-size: 0.67rem;
}
.evidence-meta time {
  margin-left: auto;
}
.evidence-excerpt {
  display: -webkit-box;
  margin: 8px 0 0;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  font-size: var(--font-size-body-small);
}
.evidence-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--border-subtle);
  color: var(--text-tertiary);
  font-size: var(--font-size-caption);
}
.evidence-actions a {
  color: var(--text-link);
  font-weight: 700;
}
.timeline-row {
  gap: 9px;
  padding: 8px 0;
  font-size: 0.73rem;
}
.timeline-row i {
  color: var(--action-primary);
  font-size: 0.4rem;
}
.timeline-row time {
  margin-left: auto;
  color: var(--text-tertiary);
}
.empty-copy,
.placeholder {
  color: var(--text-tertiary);
  text-align: center;
}
.empty-copy {
  padding: 18px 0;
}
.placeholder {
  display: grid;
  place-items: center;
  min-height: 440px;
  border: 1px solid var(--border-default);
  border-radius: 18px;
  background: var(--surface-card);
}
.placeholder i {
  font-size: 2rem;
}
.placeholder p {
  max-width: 320px;
  margin: 0;
}
@media (max-width: 760px) {
  .meta-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 560px) {
  .case-detail {
    padding: 12px;
  }
  .detail-card {
    padding: 18px;
  }
  .meta-grid {
    grid-template-columns: 1fr;
  }
  .related-tabs {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .related-tabs button {
    padding: 11px 4px;
  }
  .related-tabs button::after {
    right: 0;
    left: 0;
  }
  .section-heading {
    align-items: flex-start;
    flex-direction: column;
    gap: 4px;
  }
  .evidence-meta {
    flex-wrap: wrap;
    row-gap: 4px;
  }
  .evidence-meta time {
    width: 100%;
    margin-left: 0;
  }
}
</style>
