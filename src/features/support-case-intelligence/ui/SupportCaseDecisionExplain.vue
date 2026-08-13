<script setup lang="ts">
import { ref, watch } from 'vue';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import Message from 'primevue/message';
import Skeleton from 'primevue/skeleton';
import Tag from 'primevue/tag';
import { supportCaseIntelligenceOperationsSource } from '../api/support-case-intelligence-operations-source';
import type { CaseIntelligenceDecision } from '../model/support-case-intelligence-operations-domain';

const props = defineProps<{ projectId: string; caseId: string; canRead: boolean }>();
const visible = ref(false);
const loading = ref(false);
const error = ref('');
const decisions = ref<CaseIntelligenceDecision[]>([]);
let abort: AbortController | null = null;

function pct(value: string | null) {
  return value
    ? new Intl.NumberFormat('ru-RU', { style: 'percent', maximumFractionDigits: 1 }).format(
        Number(value),
      )
    : '—';
}
function date(value: string) {
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}
function shortId(value: string | null) {
  return value ? (value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value) : '—';
}
function decisionLabel(value: string) {
  return (
    (
      {
        NO_CASE: 'Не создавать обращение',
        CREATE: 'Создать обращение',
        ATTACH: 'Привязать к открытому',
        REOPEN: 'Открыть повторно',
        DEFER: 'Передать на проверку',
      } as Record<string, string>
    )[value] ?? 'Решение сервера'
  );
}
function classLabel(value: string | null) {
  return (
    (
      {
        ISSUE: 'Проблема',
        REQUEST: 'Запрос',
        QUESTION: 'Вопрос',
        FEEDBACK: 'Отзыв',
        OTHER: 'Другое',
      } as Record<string, string>
    )[value ?? ''] ?? 'Без класса'
  );
}
function reasonLabel(value: string) {
  return (
    (
      {
        EXACT_RULE_MATCH: 'Сработало точное правило',
        SEMANTIC_MATCH: 'Совпало по смыслу',
        CASE_INTELLIGENCE_DETERMINISTIC_RULE_MATCH: 'Сработало точное правило',
      } as Record<string, string>
    )[value] ?? 'Серверное основание'
  );
}
async function open() {
  visible.value = true;
  abort?.abort();
  abort = new AbortController();
  loading.value = true;
  error.value = '';
  decisions.value = [];
  try {
    const page = await supportCaseIntelligenceOperationsSource.explainCase(
      props.projectId,
      props.caseId,
      undefined,
      abort.signal,
    );
    decisions.value = page.items;
  } catch {
    if (!abort.signal.aborted) error.value = 'Не удалось получить объяснение решения.';
  } finally {
    if (!abort.signal.aborted) loading.value = false;
  }
}
watch(
  () => [props.projectId, props.caseId, props.canRead],
  () => {
    abort?.abort();
    visible.value = false;
    decisions.value = [];
  },
);
</script>

<template>
  <Button
    v-if="canRead"
    label="Почему так решено"
    icon="pi pi-sparkles"
    severity="secondary"
    outlined
    @click="open"
  />
  <Dialog
    v-model:visible="visible"
    modal
    header="Почему Lola приняла решение"
    :style="{ width: 'min(58rem, calc(100vw - 1.5rem))' }"
    class="case-explain-dialog"
  >
    <Message severity="info" :closable="false"
      >Здесь нет текста сообщений, внутренних рассуждений модели и личных данных. Показаны только
      безопасные причины и закреплённые версии.</Message
    >
    <div v-if="loading" class="explain-skeleton">
      <Skeleton height="7rem" /><Skeleton height="7rem" />
    </div>
    <Message v-else-if="error" severity="error" :closable="false">{{ error }}</Message>
    <div v-else-if="decisions.length" class="case-decisions">
      <article v-for="item in decisions" :key="item.id">
        <div class="decision-head">
          <div>
            <strong
              >{{ decisionLabel(item.caseDecision) }} ·
              {{ classLabel(item.conversationClass) }}</strong
            ><span>{{ date(item.decidedAt) }}</span>
          </div>
          <Tag :value="`Уверенность ${pct(item.confidence)}`" severity="info" />
        </div>
        <div class="decision-columns">
          <section>
            <h4>Основания</h4>
            <div class="tags">
              <Tag
                v-for="code in item.reasonCodes"
                :key="code"
                :value="reasonLabel(code)"
                severity="secondary"
              /><Tag v-for="code in item.matchedRuleCodes" :key="code" :value="`Правило ${code}`" />
            </div>
          </section>
          <section>
            <h4>Версии</h4>
            <dl>
              <div>
                <dt>Рабочая</dt>
                <dd>{{ shortId(item.releaseRevisionId) }}</dd>
              </div>
              <div>
                <dt>Категории</dt>
                <dd>{{ shortId(item.detectionPolicyRevisionId) }}</dd>
              </div>
              <div>
                <dt>Безопасность</dt>
                <dd>{{ shortId(item.safetyPolicyRevisionId) }}</dd>
              </div>
            </dl>
          </section>
        </div>
      </article>
    </div>
    <div v-else class="empty">
      <i class="pi pi-info-circle" /><strong>Для этого обращения решений пока нет</strong
      ><span>Журнал появится после первой серверной классификации.</span>
    </div>
  </Dialog>
</template>

<style scoped>
.explain-skeleton {
  display: grid;
  gap: 12px;
  margin-top: 14px;
}
.case-decisions {
  display: grid;
  gap: 12px;
  margin-top: 14px;
}
.case-decisions article {
  padding: 16px;
  border: 1px solid var(--border-default);
  border-radius: 14px;
}
.decision-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.decision-head > div {
  display: grid;
  gap: 3px;
}
.decision-head span,
dt,
.empty span {
  color: var(--text-secondary);
  font-size: 0.82rem;
}
.decision-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--border-default);
}
.decision-columns h4 {
  margin: 0 0 8px;
}
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.decision-columns dl {
  display: grid;
  gap: 6px;
  margin: 0;
}
.decision-columns dl div {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}
.decision-columns dd {
  margin: 0;
  font-weight: 700;
}
.empty {
  display: grid;
  min-height: 220px;
  place-items: center;
  align-content: center;
  gap: 8px;
  text-align: center;
}
.empty i {
  color: var(--action-primary);
  font-size: 1.8rem;
}
@media (max-width: 640px) {
  .decision-head {
    align-items: flex-start;
    flex-direction: column;
  }
  .decision-columns {
    grid-template-columns: 1fr;
  }
}
</style>
