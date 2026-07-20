<script setup lang="ts">
import { computed } from "vue";
import Button from "primevue/button";
import Message from "primevue/message";
import Skeleton from "primevue/skeleton";
import { formatDate } from "@/shared/lib/format";
import type { AIProposalDetail } from "../model/ai-proposal";
import { proposalSourcePresentation } from "../model/ai-proposal-presentation";
import AIProposalDecisionBar from "./AIProposalDecisionBar.vue";

const props = defineProps<{
  proposal: AIProposalDetail | null;
  loading: boolean;
  deciding: boolean;
  error?: string | null;
}>();
defineEmits<{ resolve: []; retry: [] }>();

const sourceLabel = computed(() =>
  props.proposal
    ? proposalSourcePresentation(props.proposal.sourceType).detailLabel
    : "Источник Lola",
);
const reasonCode = computed(() => {
  const value = props.proposal?.content.reasonCode;
  return typeof value === "string" ? value : null;
});
const reasonLabel = computed(
  () =>
    ({
      SUPPORT_REQUEST: "Нужна помощь специалиста",
      REFUND_STATUS: "Вопрос по возврату",
      CONTACT_REQUEST: "Просьба связаться",
    })[reasonCode.value ?? ""] ?? "Запрос внимания администратора",
);
const evidence = computed(() =>
  (props.proposal?.evidence ?? []).flatMap((item) => {
    const excerpt = item.excerpt;
    if (typeof excerpt !== "string" || !excerpt.trim()) return [];
    return [
      { type: typeof item.type === "string" ? item.type : "EVIDENCE", excerpt },
    ];
  }),
);
</script>

<template>
  <div class="proposal-detail">
    <div
      v-if="loading"
      class="detail-loading"
      aria-label="Загрузка предложения"
    >
      <Skeleton height="34px" width="75%" />
      <Skeleton height="82px" />
      <Skeleton v-for="index in 3" :key="index" height="58px" />
    </div>
    <Message v-else-if="error && !proposal" severity="error" :closable="false">
      {{ error }}
      <Button label="Повторить" text size="small" @click="$emit('retry')" />
    </Message>
    <template v-else-if="proposal">
      <header class="detail-header">
        <div class="detail-kicker">
          <span><i class="pi pi-sparkles" /> Предложение Lola</span>
          <span>№ {{ proposal.projectSequence }}</span>
        </div>
        <h2 tabindex="-1">{{ proposal.title }}</h2>
        <p>{{ proposal.summary }}</p>
      </header>

      <Message v-if="error" severity="warn" :closable="false">{{
        error
      }}</Message>

      <div class="detail-meta">
        <div>
          <span>Причина</span>
          <strong>{{ reasonLabel }}</strong>
        </div>
        <div>
          <span>Источник</span>
          <strong>{{ sourceLabel }}</strong>
        </div>
        <div>
          <span>Создано</span>
          <strong>{{ formatDate(proposal.createdAt) }}</strong>
        </div>
        <div v-if="proposal.updatedAt !== proposal.createdAt">
          <span>Обновлено</span>
          <strong>{{ formatDate(proposal.updatedAt) }}</strong>
        </div>
      </div>

      <section v-if="proposal.endUser" class="context-card">
        <div class="context-avatar"><i class="pi pi-user" /></div>
        <div>
          <span>Пользователь</span>
          <strong>{{
            proposal.endUser.displayName ?? proposal.endUser.externalId
          }}</strong>
          <small v-if="proposal.endUser.displayName">{{
            proposal.endUser.externalId
          }}</small>
        </div>
        <RouterLink
          class="context-link"
          :to="{
            name: 'users',
            params: { endUserId: proposal.endUser.id },
            query: proposal.conversationId
              ? { conversationId: proposal.conversationId }
              : {},
          }"
        >
          {{ proposal.conversationId ? "Открыть диалог" : "Открыть профиль" }}
          <i class="pi pi-arrow-up-right" />
        </RouterLink>
      </section>

      <section v-if="evidence.length" class="evidence-section">
        <div class="section-heading">
          <span>Основание</span>
          <small>Безопасная выдержка из обращения</small>
        </div>
        <blockquote v-for="(item, index) in evidence" :key="index">
          <i
            :class="
              item.type === 'VOICE_TRANSCRIPT'
                ? 'pi pi-microphone'
                : 'pi pi-comment'
            "
          />
          <p>{{ item.excerpt }}</p>
        </blockquote>
      </section>

      <AIProposalDecisionBar
        :proposal="proposal"
        :deciding="deciding"
        @resolve="$emit('resolve')"
      />

      <dl v-if="proposal.decidedAt" class="decision-history">
        <div>
          <dt>Решение</dt>
          <dd>{{ formatDate(proposal.decidedAt) }}</dd>
        </div>
        <div v-if="proposal.decidedByAdminId">
          <dt>Администратор</dt>
          <dd>
            <code>{{ proposal.decidedByAdminId }}</code>
          </dd>
        </div>
        <div v-if="proposal.decisionReason">
          <dt>Комментарий</dt>
          <dd>{{ proposal.decisionReason }}</dd>
        </div>
        <div v-if="proposal.sourceInvocationId">
          <dt>Связанный запуск Lola</dt>
          <dd>
            <code>{{ proposal.sourceInvocationId }}</code>
          </dd>
        </div>
      </dl>
    </template>
    <div v-else class="detail-placeholder">
      <span class="placeholder-orbit"><i class="pi pi-sparkles" /></span>
      <strong>Выберите предложение</strong>
      <p>
        Здесь появятся контекст, обращение пользователя и доступное решение.
      </p>
    </div>
  </div>
</template>

<style scoped>
.proposal-detail {
  min-height: 100%;
  padding: 26px;
}
.detail-loading {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.detail-kicker,
.section-heading,
.context-card,
.detail-meta,
.decision-history > div {
  display: flex;
}
.detail-kicker {
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  color: var(--text-tertiary);
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.detail-kicker i {
  color: var(--status-violet);
}
.detail-header h2 {
  font-size: clamp(1.25rem, 2.1vw, 1.65rem);
  line-height: 1.2;
}
.detail-header p {
  margin: 10px 0 0;
  color: var(--text-secondary);
  font-size: 0.86rem;
}
.detail-meta {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  display: grid;
  gap: 1px;
  margin: 22px 0;
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  border-radius: 15px;
  background: var(--border-subtle);
}
.detail-meta > div {
  padding: 13px 14px;
  background: var(--surface-subtle);
}
.detail-meta span,
.detail-meta strong,
.context-card span,
.context-card strong,
.context-card small {
  display: block;
}
.detail-meta span,
.context-card span {
  margin-bottom: 4px;
  color: var(--text-tertiary);
  font-size: 0.64rem;
  text-transform: uppercase;
  letter-spacing: 0.07em;
}
.detail-meta strong {
  font-size: 0.75rem;
}
.context-card {
  align-items: center;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--border-default);
  border-radius: 15px;
  background: var(--surface-card);
}
.context-avatar {
  width: 40px;
  height: 40px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 13px;
  background: var(--status-violet-soft);
  color: var(--status-violet-text);
}
.context-card > div:nth-child(2) {
  min-width: 0;
  flex: 1;
}
.context-card strong {
  overflow: hidden;
  font-size: 0.8rem;
  text-overflow: ellipsis;
}
.context-card small {
  margin-top: 3px;
  color: var(--text-secondary);
}
.context-link {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--text-link);
  font-size: 0.72rem;
  font-weight: 700;
}
.evidence-section {
  margin: 24px 0;
}
.section-heading {
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.section-heading span {
  font:
    700 0.88rem Manrope,
    sans-serif;
}
.section-heading small {
  color: var(--text-tertiary);
  font-size: 0.65rem;
}
blockquote {
  display: flex;
  gap: 12px;
  margin: 0;
  padding: 16px;
  border: 0;
  border-left: 3px solid var(--status-violet);
  border-radius: 4px 14px 14px 4px;
  background: var(--surface-subtle);
}
blockquote i {
  margin-top: 4px;
  color: var(--status-violet);
}
blockquote p {
  margin: 0;
  color: var(--text-primary);
  font-size: 0.82rem;
  white-space: pre-wrap;
}
.decision-history {
  margin: 18px 0 0;
  padding: 14px;
  border-top: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  font-size: 0.72rem;
}
.decision-history > div {
  gap: 12px;
}
.decision-history dt {
  min-width: 90px;
  font-weight: 700;
}
.decision-history dd {
  margin: 0;
}
.detail-placeholder {
  min-height: 480px;
  display: grid;
  place-content: center;
  justify-items: center;
  padding: 36px;
  text-align: center;
}
.placeholder-orbit {
  width: 64px;
  height: 64px;
  display: grid;
  place-items: center;
  border-radius: 22px;
  background: var(--surface-emphasis);
  color: var(--brand);
  box-shadow: 0 0 0 10px var(--brand-soft);
}
.detail-placeholder strong {
  margin-top: 24px;
  font:
    700 1rem Manrope,
    sans-serif;
}
.detail-placeholder p {
  max-width: 300px;
  margin: 7px 0 0;
  color: var(--text-secondary);
  font-size: 0.78rem;
}
@media (max-width: 560px) {
  .proposal-detail {
    padding: 18px;
  }
  .detail-meta {
    grid-template-columns: 1fr;
  }
  .context-card {
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .context-link {
    width: 100%;
    padding: 9px 0 0 52px;
  }
  .section-heading {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
