<script setup lang="ts">
import Button from "primevue/button";
import Message from "primevue/message";
import Skeleton from "primevue/skeleton";
import { formatDate } from "@/shared/lib/format";
import type { EndUserCaseDetailBundle } from "../api/end-user-cases-repository";
import type { EndUserCaseStatus } from "../model/end-user-case";
import {
  endUserCaseActionLabel,
  endUserCaseCapabilityLabel,
  endUserCaseChannelLabel,
  endUserCaseEventLabel,
  endUserCaseGroupLabel,
  endUserCasePriorityLabel,
  endUserCaseProposalStatusLabel,
  endUserCaseStatusLabel,
  endUserCaseToneLabel,
} from "../model/end-user-case-presentation";

defineProps<{
  value: EndUserCaseDetailBundle | null;
  loading: boolean;
  messagesLoading?: boolean;
  mutating?: boolean;
  canManage?: boolean;
  canAssign?: boolean;
  canReadEndUser?: boolean;
  canReadConversation?: boolean;
  canReadProposals?: boolean;
  error?: string | null;
}>();
defineEmits<{
  retry: [];
  requestTransition: [status: EndUserCaseStatus];
  requestAssignment: [];
  requestClassification: [];
  requestUnlink: [messageId: string];
  requestMerge: [];
  requestSplit: [];
  loadMoreMessages: [];
}>();

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
  ({ USER: "Пользователь", ASSISTANT: "Lola", ADMIN: "Администратор" })[role] ??
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

const beginsMessageGroup = (
  items: EndUserCaseDetailBundle["messages"]["items"],
  index: number,
): boolean =>
  index === 0 ||
  items[index - 1]?.message.threadId !== items[index]?.message.threadId ||
  messageChannel(items[index - 1]!.message) !==
    messageChannel(items[index]!.message);

const hasMessageGap = (
  items: EndUserCaseDetailBundle["messages"]["items"],
  index: number,
): boolean =>
  index > 0 &&
  !beginsMessageGroup(items, index) &&
  new Date(items[index]!.message.createdAt).getTime() -
    new Date(items[index - 1]!.message.createdAt).getTime() >
    5 * 60 * 1_000;
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
      <header class="detail-header">
        <div class="kicker">
          <span>Обращение № {{ value.case.projectSequence }}</span>
          <span>{{ endUserCaseGroupLabel(value.case.groupCode) }}</span>
        </div>
        <h2 tabindex="-1">{{ value.case.title }}</h2>
        <p>{{ value.case.goal }}</p>
        <div class="badges">
          <span class="badge">{{
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

      <section class="meta-grid">
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
      </section>

      <section class="summary-card">
        <div class="section-heading">
          <h3>Актуальная сводка</h3>
          <small>Версия {{ value.case.version }}</small>
        </div>
        <p>{{ value.case.summary || "Сводка ещё формируется." }}</p>
      </section>

      <section v-if="value.case.workSummary" class="work-summary">
        <div class="section-heading">
          <h3>Что уже сделано</h3>
          <small>
            Каналы:
            {{
              value.case.channels.length
                ? value.case.channels.map(endUserCaseChannelLabel).join(", ")
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
          Инструменты Lola ещё не использовались.
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
          {{ value.case.workSummary.cmsParticipation.actionCount }} действий.
        </p>
        <div v-if="value.case.workSummary.blockers.length" class="work-copy">
          <strong>Блокеры</strong>
          <span>{{ value.case.workSummary.blockers.join(" · ") }}</span>
        </div>
        <div v-if="value.case.workSummary.limitations.length" class="work-copy">
          <strong>Ограничения</strong>
          <span>{{ value.case.workSummary.limitations.join(" · ") }}</span>
        </div>
      </section>

      <section v-if="canManage" class="workflow-card">
        <div class="section-heading">
          <h3>Изменить состояние</h3>
          <small
            >Решение подтверждается только явным действием или проверенным
            фактом</small
          >
        </div>
        <div class="workflow-actions">
          <Button
            v-for="status in value.case.availableStatuses"
            :key="status"
            :data-status="status"
            :label="endUserCaseActionLabel(status)"
            :severity="
              status === 'RESOLVED'
                ? 'success'
                : status === 'UNRESOLVED'
                  ? 'danger'
                  : 'secondary'
            "
            :outlined="!['RESOLVED', 'UNRESOLVED'].includes(status)"
            :loading="mutating"
            @click="$emit('requestTransition', status)"
          />
          <Button
            v-if="canAssign"
            label="Назначение"
            icon="pi pi-user-edit"
            severity="secondary"
            outlined
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

      <section class="linked-section">
        <div class="section-heading">
          <h3>Связанные сообщения</h3>
          <small
            >{{ value.messages.items.length }} из обращения, не весь
            диалог</small
          >
        </div>
        <div v-if="!value.messages.items.length" class="empty-copy">
          Связанных сообщений пока нет.
        </div>
        <template
          v-for="(link, index) in value.messages.items"
          :key="link.message.id"
        >
          <div
            v-if="beginsMessageGroup(value.messages.items, index)"
            class="message-group"
          >
            <strong>{{
              endUserCaseChannelLabel(messageChannel(link.message))
            }}</strong>
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
              Открыть диалог
            </RouterLink>
            <span v-else>Диалог {{ link.message.threadId.slice(0, 8) }}</span>
          </div>
          <div
            v-else-if="hasMessageGap(value.messages.items, index)"
            class="message-gap"
          >
            Часть диалога не относится к этому обращению
          </div>
          <article class="message-row">
            <div class="message-meta">
              <strong>{{ roleLabel(link.message.role) }}</strong>
              <span>{{
                link.relation === "PRIMARY" ? "Основное" : "Контекст"
              }}</span>
              <time :datetime="link.message.createdAt">
                {{ formatDate(link.message.createdAt) }}
              </time>
            </div>
            <p>{{ link.message.text }}</p>
            <Button
              v-if="canManage"
              label="Исключить"
              severity="secondary"
              text
              size="small"
              @click="$emit('requestUnlink', link.message.id)"
            />
          </article>
        </template>
        <Button
          v-if="value.messages.nextCursor"
          label="Показать ещё сообщения"
          icon="pi pi-chevron-down"
          severity="secondary"
          outlined
          :loading="messagesLoading"
          @click="$emit('loadMoreMessages')"
        />
      </section>

      <section class="linked-section">
        <div class="section-heading">
          <h3>Предложения Lola</h3>
          <small>{{ value.proposals.items.length }}</small>
        </div>
        <div v-if="!value.proposals.items.length" class="empty-copy">
          Связанных предложений нет.
        </div>
        <template v-if="canReadProposals">
          <RouterLink
            v-for="proposal in value.proposals.items"
            :key="proposal.id"
            class="proposal-row"
            :to="{
              name: 'ai-proposal-detail',
              params: { proposalId: proposal.id },
            }"
          >
            <div>
              <strong>{{ proposal.title }}</strong>
              <span>{{ proposal.summary }}</span>
            </div>
            <span>
              {{ endUserCaseProposalStatusLabel(proposal.workflowStatus) }}
              <i class="pi pi-arrow-up-right" />
            </span>
          </RouterLink>
        </template>
        <template v-else>
          <div
            v-for="proposal in value.proposals.items"
            :key="proposal.id"
            class="proposal-row"
          >
            <div>
              <strong>{{ proposal.title }}</strong>
              <span>{{ proposal.summary }}</span>
            </div>
            <span>{{
              endUserCaseProposalStatusLabel(proposal.workflowStatus)
            }}</span>
          </div>
        </template>
      </section>

      <section class="linked-section">
        <div class="section-heading">
          <h3>История</h3>
          <small>{{ value.timeline.events.length }} событий</small>
        </div>
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
      </section>
    </template>
    <div v-else class="placeholder">
      <i class="pi pi-comments" />
      <strong>Выберите обращение</strong>
      <p>Здесь появятся сводка, связанные сообщения, решения и история.</p>
    </div>
  </div>
</template>

<style scoped>
.case-detail {
  min-height: 100%;
  padding: 26px;
}
.case-detail,
.detail-loading {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.kicker,
.badges,
.section-heading,
.message-meta,
.workflow-actions,
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
.detail-header h2 {
  margin: 9px 0 5px;
  font:
    760 1.45rem/1.18 var(--font-display),
    sans-serif;
}
.detail-header p,
.summary-card p,
.message-row p {
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
.meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.meta-grid > div,
.summary-card,
.work-summary,
.workflow-card,
.linked-section {
  padding: 16px;
  border: 1px solid var(--border-default);
  border-radius: 16px;
  background: var(--surface-card);
}
.meta-grid span,
.meta-grid strong {
  display: block;
}
.meta-grid span,
.section-heading small {
  color: var(--text-tertiary);
  font-size: 0.68rem;
}
.meta-grid strong,
.meta-grid a {
  margin-top: 5px;
  font-size: 0.8rem;
}
.section-heading {
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.section-heading h3 {
  margin: 0;
  font-size: 0.88rem;
}
.workflow-actions {
  flex-wrap: wrap;
  gap: 8px;
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
.work-summary > p {
  color: var(--text-secondary);
  font-size: 0.74rem;
}
.message-row,
.proposal-row {
  padding: 13px 0;
  border-top: 1px solid var(--border-subtle);
}
.message-group,
.message-gap {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-top: 12px;
  padding: 7px 9px;
  border-radius: 8px;
  background: var(--surface-subtle);
  color: var(--text-tertiary);
  font-size: 0.66rem;
}
.message-gap {
  justify-content: center;
  border: 1px dashed var(--border-default);
  background: transparent;
}
.message-row:first-of-type,
.proposal-row:first-of-type {
  border-top: 0;
}
.message-meta {
  gap: 9px;
  color: var(--text-tertiary);
  font-size: 0.67rem;
}
.message-meta time {
  margin-left: auto;
}
.proposal-row {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  color: var(--text-primary);
  text-decoration: none;
}
.proposal-row strong,
.proposal-row span {
  display: block;
}
.proposal-row div > span {
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 0.74rem;
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
.placeholder {
  display: grid;
  place-items: center;
  min-height: 440px;
}
.placeholder i {
  font-size: 2rem;
}
.placeholder p {
  max-width: 320px;
  margin: 0;
}
@media (max-width: 560px) {
  .case-detail {
    padding: 18px;
  }
  .meta-grid {
    grid-template-columns: 1fr;
  }
}
</style>
